#!/usr/bin/env python3
"""Phase 6 final controls — concurrent persistent reservations + atomic handoff.

Control 1: two genuinely simultaneous open-position placements (Treasure Grid
then Blackjack) where each fits individually but both do not fit together.
The second must block on the environment advisory lock, recalculate available
reserve including the first *committed* active reservation, and fail with
EXPOSURE_LIMIT before any wallet debit.

Control 2: at terminal settlement the ACTIVE reservation release, the payable
creation, the journal posting and the product status update all happen in one
transaction — there is no committed moment where liability is counted twice or
not at all.

Runs entirely in the SIMULATION environment. Everything it creates is undone.

Run: python3 supabase/tests/liability_concurrency.py
"""
import subprocess, sys, time, uuid

ENV = "SIMULATION"
FAILS = []


def psql(sql):
    r = subprocess.run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("psql failed: " + r.stderr)
    return r.stdout.strip()


class Session:
    def __init__(self):
        self.p = subprocess.Popen(["psql", "-X", "-q", "-A", "-t"],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, text=True, bufsize=1)

    def send(self, sql):
        self.p.stdin.write(sql.rstrip() + "\n")
        self.p.stdin.flush()

    def finish(self):
        out, _ = self.p.communicate("\\q\n", timeout=120)
        return out


def check(cond, msg):
    print(("PASS  " if cond else "FAIL  ") + msg)
    if not cond:
        FAILS.append(msg)


user = psql(f"""
SELECT a.user_id FROM public.accounting_accounts a
  JOIN public.accounting_account_balances b ON b.account_id = a.id
 WHERE a.account_code='USER_WALLET' AND a.environment='{ENV}' AND a.status='ACTIVE'
 ORDER BY b.balance DESC LIMIT 1""")
if not user:
    raise SystemExit("no simulation user")

bal0 = psql(f"SELECT balance FROM public.wallets WHERE user_id='{user}'")
avail0 = float(psql(f"SELECT public.accounting_available_reserve('{ENV}')"))
print(f"sim user={user} wallet={bal0} available_reserve={avail0}")

# ---- pass 1: measure the worst-case net liability of each placement --------
probe = Session()
probe.send("BEGIN;")
probe.send(f"""CREATE TEMP TABLE p6probe AS SELECT (public.arcade_treasure_start_round(
  '{user}','easy',10,'p6-probe','{uuid.uuid4()}')).id AS tid;""")
probe.send("""SELECT 'PROBE_T|' || r.max_net_liability FROM p6probe p
 JOIN public.accounting_liability_reservations r
   ON r.reference_type='arcade_treasure_round' AND r.reference_id=p.tid;""")
probe.send(f"""CREATE TEMP TABLE p6probe2 AS SELECT public.arcade_bj_start_hand(
  '{user}',5,'p6-probe','{uuid.uuid4()}') AS hid;""")
probe.send("""SELECT 'PROBE_B|' || r.max_net_liability FROM p6probe2 p
 JOIN public.accounting_liability_reservations r
   ON r.reference_type='arcade_bj_hand' AND r.reference_id=p.hid;""")
probe.send("ROLLBACK;")
pout = probe.finish()
print("--- probe ---\n" + pout.strip())
try:
    net_t = float(next(l for l in pout.splitlines() if l.startswith("PROBE_T|")).split("|")[1])
    net_b = float(next(l for l in pout.splitlines() if l.startswith("PROBE_B|")).split("|")[1])
except StopIteration:
    raise SystemExit("probe failed — could not measure net liabilities")
print(f"net liability: treasure={net_t} blackjack={net_b}")

# ---- squeeze available reserve so one fits but not both -------------------
SQUEEZE = str(uuid.uuid4())
headroom = net_t + net_b - 0.01           # room for the first, not for both
psql(f"""
INSERT INTO public.accounting_liability_reservations(
  environment, product, game, reference_type, reference_id, user_id,
  max_gross_payout, stake_collected, max_net_liability, reserved_amount,
  initial_reserved_amount, counts_toward_available, status, metadata)
VALUES ('{ENV}','plinko','plinko','p6_concurrency_squeeze','{SQUEEZE}', NULL,
  {avail0 - headroom}, 0, {avail0 - headroom}, {avail0 - headroom},
  {avail0 - headroom}, true, 'ACTIVE', '{{"test":"phase6_concurrency"}}'::jsonb);""")
avail1 = float(psql(f"SELECT public.accounting_available_reserve('{ENV}')"))
print(f"squeezed available reserve -> {avail1} (treasure {net_t} fits, +blackjack {net_b} does not)")

round_id = None
try:
    # ---- control 1: concurrent persistent reservations --------------------
    A, B = Session(), Session()
    A.send("BEGIN;")
    A.send(f"SELECT 'A_ROUND|' || (public.arcade_treasure_start_round("
           f"'{user}','easy',10,'p6-conc-a','{uuid.uuid4()}')).id;")
    time.sleep(3)   # A now holds the environment advisory lock

    B.send("BEGIN;")
    B.send(f"SELECT 'B_HAND|' || public.arcade_bj_start_hand('{user}',5,'p6-conc-b','{uuid.uuid4()}');")
    time.sleep(5)   # B must be BLOCKED here, not evaluating reserve in parallel

    blocked = psql("""
SELECT count(*) FROM pg_stat_activity
 WHERE cardinality(pg_blocking_pids(pid)) > 0
   AND query ILIKE '%arcade_bj_start_hand%'""")
    print("blocked sessions while A held the reserve lock:", blocked)

    A.send("COMMIT;")            # A's reservation is now committed and persistent
    time.sleep(4)
    B.send("SELECT 'B_STATE|' || current_setting('transaction_isolation');")
    B.send("ROLLBACK;")

    out_a = A.finish()
    out_b = B.finish()
    print("--- session A ---\n" + out_a.strip())
    print("--- session B ---\n" + out_b.strip())

    check(blocked != "0", "session B waited on the environment advisory lock (no parallel reserve read)")
    line = next((l for l in out_a.splitlines() if l.startswith("A_ROUND|")), "")
    check(bool(line), "session A opened a treasure round and committed its reservation")
    if line:
        round_id = line.split("|")[1].strip()

    check("EXPOSURE_LIMIT" in out_b,
          "session B recalculated availability after A committed and was rejected with EXPOSURE_LIMIT")
    check("B_HAND|" not in out_b, "session B created no blackjack hand")

    # no wallet debit for the rejected placement: only A's 10-point stake moved
    bal1 = psql(f"SELECT balance FROM public.wallets WHERE user_id='{user}'")
    check(abs(float(bal1) - (float(bal0) - 10)) < 0.005,
          f"only the accepted placement debited the wallet ({bal0} -> {bal1}, expected -10)")

    # A's reservation survives commit and still consumes reserve
    if round_id:
        st, amt = psql(f"""SELECT status || '|' || reserved_amount
            FROM public.accounting_liability_reservations
            WHERE reference_type='arcade_treasure_round' AND reference_id='{round_id}'""").split("|")
        check(st == "ACTIVE" and float(amt) == net_t,
              f"committed reservation is still ACTIVE holding {amt} (expected {net_t})")
        avail2 = float(psql(f"SELECT public.accounting_available_reserve('{ENV}')"))
        check(abs(avail2 - (avail1 + 10 - net_t)) < 0.02,
              f"available reserve dropped by the persistent reservation ({avail1} -> {avail2})")

    # ---- control 2: atomic reservation -> payable handoff -----------------
    C = Session()
    C.send("BEGIN;")
    C.send(f"SELECT 'MID|' || (SELECT status FROM public.accounting_liability_reservations "
           f"WHERE reference_type='arcade_treasure_round' AND reference_id='{round_id}');")
    C.send(f"UPDATE public.arcade_treasure_rounds SET status='WON', payout=stake*2 WHERE id='{round_id}';")
    C.send(f"""SELECT 'HANDOFF|'
      || (SELECT status FROM public.accounting_liability_reservations
           WHERE reference_type='arcade_treasure_round' AND reference_id='{round_id}')
      || '|' || (SELECT reserved_amount FROM public.accounting_liability_reservations
           WHERE reference_type='arcade_treasure_round' AND reference_id='{round_id}')
      || '|' || (SELECT count(*) FROM public.accounting_journals
           WHERE reference_id='{round_id}');""")
    C.send("COMMIT;")
    out_c = C.finish()
    print("--- session C ---\n" + out_c.strip())

    hand = next((l for l in out_c.splitlines() if l.startswith("HANDOFF|")), "")
    if not hand:
        check(False, "settlement transaction produced handoff output")
    else:
        _, st, amt, journals = hand.split("|")
        check(st == "RELEASED" and float(amt) == 0,
              f"reservation released inside the settlement transaction (status {st}, held {amt})")
        check(int(journals) > 0,
              f"settlement journal posted in the same transaction ({journals} journal(s))")

    # after commit: liability is neither double-counted nor stranded
    strand = psql(f"""SELECT count(*) FROM public.accounting_liability_reservations
        WHERE reference_type='arcade_treasure_round' AND reference_id='{round_id}' AND status='ACTIVE'""")
    check(strand == "0", "no ACTIVE reservation survives the committed settlement")
    hist = psql(f"""SELECT initial_reserved_amount || '|' || coalesce(released_at::text,'')
        FROM public.accounting_liability_reservations
        WHERE reference_type='arcade_treasure_round' AND reference_id='{round_id}'""")
    ini, rel = hist.split("|")
    check(float(ini) == net_t and rel != "",
          f"released row preserves the original hold ({ini}) and release timestamp")

finally:
    # ------------------------------------------------------------ teardown --
    psql(f"DELETE FROM public.accounting_liability_reservations WHERE reference_type='p6_concurrency_squeeze'")
    if round_id:
        psql(f"UPDATE public.arcade_treasure_rounds SET status='VOID' WHERE id='{round_id}' AND status<>'VOID'")

bal_end = psql(f"SELECT balance FROM public.wallets WHERE user_id='{user}'")
avail_end = float(psql(f"SELECT public.accounting_available_reserve('{ENV}')"))
print(f"wallet {bal0} -> {bal_end}, available reserve {avail0} -> {avail_end}")
check(psql("SELECT count(*) FROM public.accounting_liability_reservations "
           "WHERE reference_type='p6_concurrency_squeeze'") == "0", "squeeze fixture removed")

print("\n" + ("ALL PHASE 6 FINAL CONTROL CHECKS PASSED" if not FAILS else "FAILURES: " + "; ".join(FAILS)))
sys.exit(1 if FAILS else 0)
