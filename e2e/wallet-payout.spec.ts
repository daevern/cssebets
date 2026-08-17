import { test, expect } from "@playwright/test";
import { loginAsGuest } from "./helpers/guest";
import {
  adminClient,
  approveUserAsAdmin,
  findAuthUserIdByEmail,
  getWalletBalance,
  userHasRole,
} from "./helpers/supabaseAdmin";

function uniqueEmail() {
  return `pw-wallet-payout-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/**
 * Approved member: credit wallet → create payout (hold debit) → admin reject (release).
 */
test.describe("approved-member wallet + payout", () => {
  test("credit → payout hold → admin reject restores balance", async ({ page }) => {
    test.setTimeout(150_000);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      test.skip(true, "SUPABASE_SERVICE_ROLE_KEY required");
    }

    const email = uniqueEmail();
    const password = "StrongPass123!";
    const holdAmount = 100;

    await loginAsGuest(page);
    await page.goto("/register");
    await page.getByLabel("Name").fill("WalletPayoutPW");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/Pending review/i)).toBeVisible({ timeout: 45_000 });

    const userId = await findAuthUserIdByEmail(email);
    await approveUserAsAdmin(userId);
    await expect.poll(async () => userHasRole(userId, "member"), { timeout: 20_000 }).toBe(true);

    await page.getByRole("button", { name: /Check status/i }).click();
    await expect(page.getByText(/Pending review/i)).toHaveCount(0, { timeout: 30_000 });

    const sb = adminClient();
    const { error: creditErr } = await sb.rpc("wallet_apply_change", {
      p_user_id: userId,
      p_type: "credit",
      p_amount: 500,
      p_reference_type: "admin_adjustment",
      p_reference_id: userId,
      p_note: "e2e wallet credit",
      p_is_simulation: false,
    });
    if (creditErr) throw new Error(`credit: ${creditErr.message}`);

    const before = await getWalletBalance(userId);
    expect(before).toBeGreaterThanOrEqual(500);

    const { data: payoutId, error: payoutErr } = await sb.rpc("payout_create_atomic", {
      p_user_id: userId,
      p_bank_name: "E2E Bank",
      p_bank_account_number: "1234567890",
      p_amount: holdAmount,
    });
    if (payoutErr) throw new Error(`payout_create_atomic: ${payoutErr.message}`);
    expect(payoutId).toBeTruthy();

    await expect
      .poll(async () => getWalletBalance(userId), { timeout: 15_000 })
      .toBeCloseTo(before - holdAmount, 1);

    const { data: row } = await sb
      .from("payout_requests")
      .select("status, held_at, amount")
      .eq("id", payoutId)
      .maybeSingle();
    expect(row?.status).toBe("pending");
    expect(row?.held_at).toBeTruthy();

    // Create a throwaway admin to reject (cannot reject own payout — user isn't admin).
    const adminEmail = `pw-payout-admin-${Date.now()}@example.com`;
    const { data: adminAuth, error: adminCreateErr } = await sb.auth.admin.createUser({
      email: adminEmail,
      password: "StrongPass123!",
      email_confirm: true,
    });
    if (adminCreateErr) throw new Error(adminCreateErr.message);
    const adminId = adminAuth.user!.id;
    await sb.from("user_roles").upsert({ user_id: adminId, role: "admin" }, { onConflict: "user_id,role" });

    const { error: rejectErr } = await sb.rpc("payout_admin_reject_atomic", {
      p_payout_id: payoutId,
      p_admin_id: adminId,
      p_reason: "E2E reject — release hold",
    });
    if (rejectErr) throw new Error(`reject: ${rejectErr.message}`);

    await expect
      .poll(async () => getWalletBalance(userId), { timeout: 15_000 })
      .toBeCloseTo(before, 1);

    const { data: after } = await sb
      .from("payout_requests")
      .select("status")
      .eq("id", payoutId)
      .maybeSingle();
    expect(after?.status).toBe("rejected_by_admin");
  });
});
