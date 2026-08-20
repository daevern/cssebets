import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { adminClient } from "./helpers/supabaseAdmin";

/**
 * Launch-bonus campaign tests.
 *
 * Everything here goes through the same server-authoritative RPCs the app uses
 * (`bonus_reserve_new_user_slot`, `bonus_claim_for_user`, `payout_create_atomic`,
 * `wallet_apply_change`) — never through client-side arithmetic.
 */

const sb = adminClient();
const created: string[] = [];
const tempCampaigns: string[] = [];

async function makeUser(opts: { member?: boolean; admin?: boolean; simulation?: boolean } = {}) {
  const email = `bonus-e2e-${randomUUID()}@example.com`;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: `Pw!${randomUUID()}`,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  const id = data.user!.id;
  created.push(id);

  await sb.from("profiles").upsert({ id, auth_provider: "email", is_simulation: !!opts.simulation }, { onConflict: "id" });
  await sb.from("wallets").upsert({ user_id: id, balance: 0 }, { onConflict: "user_id" });
  if (opts.member !== false) await sb.from("user_roles").upsert({ user_id: id, role: "member" }, { onConflict: "user_id,role" });
  if (opts.admin) await sb.from("user_roles").upsert({ user_id: id, role: "admin" }, { onConflict: "user_id,role" });
  return id;
}

/** A short-lived campaign that shadows the live one (latest starts_at wins). */
async function makeCampaign(cap: number, startsAt: Date) {
  const id = randomUUID();
  const { error } = await sb.from("bonus_campaigns").insert({
    id,
    code: `e2e_${id.slice(0, 8)}`,
    starts_at: startsAt.toISOString(),
    bonus_amount: 100,
    new_user_cap: cap,
    enabled: true,
  });
  if (error) throw new Error(`campaign: ${error.message}`);
  tempCampaigns.push(id);
  return id;
}

async function wallet(userId: string) {
  const { data } = await sb.from("wallets").select("balance, locked_bonus_balance").eq("user_id", userId).maybeSingle();
  return {
    balance: Number((data as any)?.balance ?? 0),
    locked: Number((data as any)?.locked_bonus_balance ?? 0),
  };
}

async function claim(userId: string) {
  const { data, error } = await sb.rpc("bonus_claim_for_user" as any, { p_user: userId });
  if (error) throw new Error(`claim: ${error.message}`);
  return data as any;
}

async function walletChange(userId: string, type: "credit" | "debit", amount: number) {
  const { error } = await sb.rpc("wallet_apply_change" as any, {
    p_user_id: userId,
    p_type: type,
    p_amount: amount,
    p_reference_type: "bet_placement",
    p_reference_id: randomUUID(),
    p_note: "e2e bonus funding",
  });
  if (error) throw new Error(`wallet_apply_change: ${error.message}`);
}

test.afterAll(async () => {
  for (const id of created) {
    await sb.from("bonus_campaign_enrolments").delete().eq("user_id", id);
    await sb.from("bonus_slot_audit").delete().eq("user_id", id);
    await sb.from("bonus_wager_funding").delete().eq("user_id", id);
    await sb.from("payout_requests").delete().eq("user_id", id);
    await sb.auth.admin.deleteUser(id).catch(() => {});
  }
  for (const c of tempCampaigns) {
    await sb.from("bonus_campaign_enrolments").delete().eq("campaign_id", c);
    await sb.from("bonus_slot_audit").delete().eq("campaign_id", c);
    await sb.from("bonus_campaigns").delete().eq("id", c);
  }
});

test.describe.configure({ mode: "serial" });

test("production campaign is capped at exactly 100 new-user slots", async () => {
  const { data } = await sb.from("bonus_campaigns").select("code, new_user_cap, bonus_amount").eq("code", "launch_bonus_20260820").maybeSingle();
  expect(data?.new_user_cap).toBe(100);
  expect(Number(data?.bonus_amount)).toBe(100);
});

test("existing user gets the bonus once on first qualifying login, never twice", async () => {
  const user = await makeUser();
  // Campaign starting after the account exists ⇒ Group A.
  await makeCampaign(5, new Date(Date.now() - 1000));

  const first = await claim(user);
  expect(first.awarded).toBe(true);
  expect(first.group).toBe("EXISTING_USER");
  expect(Number(first.amount)).toBe(100);

  const second = await claim(user);
  expect(second.awarded).toBe(false);
  expect(second.already).toBe(true);

  // Concurrent logins / refreshes cannot duplicate the award.
  const concurrent = await Promise.all([claim(user), claim(user), claim(user)]);
  expect(concurrent.every((r) => r.awarded === false)).toBe(true);

  const w = await wallet(user);
  expect(w.balance).toBe(100);
  expect(w.locked).toBe(100);

  const { count } = await sb
    .from("bonus_campaign_enrolments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user)
    .eq("status", "AWARDED");
  expect(count).toBe(1);
});

test("new users take slots in order, cap is hard, and simultaneous registrations cannot exceed it", async () => {
  const campaign = await makeCampaign(3, new Date(Date.now() - 60_000));
  const users: string[] = [];
  for (let i = 0; i < 6; i++) users.push(await makeUser());

  // All six register at the same instant.
  await Promise.all(
    users.map((u) => sb.rpc("bonus_reserve_new_user_slot" as any, { p_user: u })),
  );

  const { data: rows } = await sb
    .from("bonus_campaign_enrolments")
    .select("user_id, slot_number, status, eligibility_group, account_created_at")
    .eq("campaign_id", campaign);

  const slots = (rows ?? []).map((r: any) => r.slot_number).sort((a, b) => a - b);
  expect(slots).toEqual([1, 2, 3]);
  expect(new Set(slots).size).toBe(3);
  expect((rows ?? []).every((r: any) => r.eligibility_group === "NEW_USER")).toBe(true);

  // The 4th..6th accounts get no slot and no bonus.
  const missed = users.filter((u) => !(rows ?? []).some((r: any) => r.user_id === u));
  expect(missed.length).toBe(3);
  for (const u of missed) {
    const res = await claim(u);
    expect(res.awarded).toBe(false);
    expect((await wallet(u)).balance).toBe(0);
  }

  // A slotted user is awarded exactly once.
  const slotted = (rows ?? [])[0] as any;
  const awarded = await claim(slotted.user_id);
  expect(awarded.awarded).toBe(true);
  expect(awarded.group).toBe("NEW_USER");
  const w = await wallet(slotted.user_id);
  expect(w.balance).toBe(100);
  expect(w.locked).toBe(100);
  expect(await claim(slotted.user_id).then((r) => r.awarded)).toBe(false);
});

test("forfeited slots are reassigned to the next valid new account", async () => {
  const campaign = await makeCampaign(1, new Date(Date.now() - 60_000));
  const a = await makeUser();
  const b = await makeUser();

  await sb.rpc("bonus_reserve_new_user_slot" as any, { p_user: a });
  await sb.rpc("bonus_reserve_new_user_slot" as any, { p_user: b });

  let { data } = await sb.from("bonus_campaign_enrolments").select("user_id, slot_number").eq("campaign_id", campaign);
  expect(data?.length).toBe(1);
  expect((data as any)[0].user_id).toBe(a);

  const { data: forfeited } = await sb.rpc("bonus_forfeit_slot" as any, { p_user: a, p_reason: "e2e_invalid" });
  expect(forfeited).toBe(true);

  await sb.rpc("bonus_reserve_new_user_slot" as any, { p_user: b });
  ({ data } = await sb
    .from("bonus_campaign_enrolments")
    .select("user_id, slot_number, status")
    .eq("campaign_id", campaign)
    .neq("status", "FORFEITED"));
  expect(data?.length).toBe(1);
  expect((data as any)[0].user_id).toBe(b);
  expect((data as any)[0].slot_number).toBe(1);

  // Audit trail preserved.
  const { count } = await sb
    .from("bonus_slot_audit")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign)
    .eq("event", "slot_forfeited");
  expect(count).toBe(1);
});

test("admin, simulation and unapproved accounts are excluded", async () => {
  await makeCampaign(5, new Date(Date.now() - 60_000));
  const admin = await makeUser({ admin: true });
  const sim = await makeUser({ simulation: true });
  const unapproved = await makeUser({ member: false });

  for (const u of [admin, sim, unapproved]) {
    const res = await claim(u);
    expect(res.awarded).toBe(false);
    expect((await wallet(u)).balance).toBe(0);
  }
});

test("locked bonus: losing wager consumes it, winning wager returns principal locked and profit withdrawable", async () => {
  await makeCampaign(5, new Date(Date.now() - 1000));

  // Losing bonus wager consumes the locked stake.
  const loser = await makeUser();
  expect((await claim(loser)).awarded).toBe(true);
  await walletChange(loser, "debit", 100);
  let w = await wallet(loser);
  expect(w.balance).toBe(0);
  expect(w.locked).toBe(0);

  // Winning bonus wager: 100 stake → 200 payout ⇒ 100 locked + 100 withdrawable.
  const winner = await makeUser();
  expect((await claim(winner)).awarded).toBe(true);
  await walletChange(winner, "debit", 100);
  await walletChange(winner, "credit", 200);
  w = await wallet(winner);
  expect(w.balance).toBe(200);
  expect(w.locked).toBe(100);

  // Mixed-funded wager keeps its funding composition: 50 bonus + 50 cash of a
  // 100 stake returns 50 locked + 50 cash, profit fully withdrawable.
  const mixed = await makeUser();
  expect((await claim(mixed)).awarded).toBe(true);
  await walletChange(mixed, "credit", 100); // withdrawable top-up (no open funding row)
  await walletChange(mixed, "debit", 150); // 100 bonus + 50 cash
  w = await wallet(mixed);
  expect(w.locked).toBe(0);
  await walletChange(mixed, "credit", 300); // 150 principal + 150 profit
  w = await wallet(mixed);
  expect(w.balance).toBe(350);
  expect(w.locked).toBe(100); // exactly the bonus-funded principal came back locked
});

test("withdrawals: bonus points are never withdrawable and both gates are enforced", async () => {
  await makeCampaign(5, new Date(Date.now() - 1000));
  const user = await makeUser();
  expect((await claim(user)).awarded).toBe(true);

  const request = (amount: number) =>
    sb.rpc("payout_create_atomic" as any, {
      p_user_id: user,
      p_bank_name: "E2E Bank",
      p_bank_account_number: "123456789",
      p_amount: amount,
    });

  // 100 locked + 0 withdrawable
  expect((await request(100)).error?.message).toContain("INSUFFICIENT_WITHDRAWABLE");

  // 100 locked + 99 withdrawable → still blocked
  await walletChange(user, "credit", 99);
  expect((await request(100)).error?.message).toContain("INSUFFICIENT_WITHDRAWABLE");

  // 100 locked + 100 withdrawable → eligible, below the 100 minimum still fails
  await walletChange(user, "credit", 1);
  expect((await request(50)).error?.message).toContain("MIN_WITHDRAWAL_100");

  const ok = await request(100);
  expect(ok.error).toBeNull();

  const w = await wallet(user);
  expect(w.locked).toBe(100); // locked bonus untouched by the request
  const { data: pr } = await sb.from("payout_requests").select("amount, status").eq("user_id", user).maybeSingle();
  expect(Number(pr?.amount)).toBe(100);
});

test("total-balance gate: 0 locked + 150 withdrawable is not eligible, 200 is", async () => {
  const user = await makeUser();
  await walletChange(user, "credit", 150);
  const req = (amount: number) =>
    sb.rpc("payout_create_atomic" as any, {
      p_user_id: user,
      p_bank_name: "E2E Bank",
      p_bank_account_number: "123456789",
      p_amount: amount,
    });
  expect((await req(100)).error?.message).toContain("INSUFFICIENT_TOTAL");
  await walletChange(user, "credit", 50);
  expect((await req(100)).error).toBeNull();
});
