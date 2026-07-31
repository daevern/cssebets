#!/usr/bin/env python3
"""True concurrent-settlement test (two independent database sessions).

Uses the ACTUAL production settlement function (settle_match_atomic) against a
synthetic simulation match. No money is ever committed: both settlement
sessions roll back, and the synthetic fixture is removed afterwards.

Run: python3 supabase/tests/settlement_concurrency.py
"""
import subprocess, sys, time, uuid

TAG = "SETTLETEST_CONC"
MATCH = str(uuid.uuid4())
FAILS = []


def psql(sql):
    r = subprocess.run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("psql failed: " + r.stderr)
    return r.stdout.strip()


class Session:
    def __init__(self, name):
        self.name = name
        self.p = subprocess.Popen(["psql", "-X", "-q", "-A", "-t"],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, text=True, bufsize=1)

    def send(self, sql):
        self.p.stdin.write(sql.rstrip() + "\n")
        self.p.stdin.flush()

    def finish(self):
        out, _ = self.p.communicate("\\q\n", timeout=60)
        return out


def check(cond, msg):
    print(("PASS  " if cond else "FAIL  ") + msg)
    if not cond:
        FAILS.append(msg)


user = psql("SELECT user_id FROM public.predictions ORDER BY created_at DESC LIMIT 1") \
    or psql("SELECT id FROM public.profiles LIMIT 1")

# ---------------------------------------------------------------- fixture ---
psql(f"""
INSERT INTO public.matches(id, home_team, away_team, kickoff_at, status, is_simulation)
VALUES ('{MATCH}', '{TAG}', '{TAG}_AWAY', now() - interval '3 hours', 'live', true);
INSERT INTO public.predictions(id, user_id, match_id, market, outcome, virtual_stake,
                               reference_odds, potential_return, status)
VALUES (gen_random_uuid(), '{user}', '{MATCH}', 'result', 'HOME', 10, 2.0, 20, 'pending'),
       (gen_random_uuid(), '{user}', '{MATCH}', 'result', 'AWAY', 10, 3.0, 30, 'pending');
""")
pred_win, pred_loss = psql(
    f"SELECT string_agg(id::text, ' ' ORDER BY outcome DESC) FROM public.predictions WHERE match_id='{MATCH}'"
).split()
bal0 = psql(f"SELECT balance FROM public.wallets WHERE user_id='{user}'")
bank0 = psql("SELECT balance FROM public.platform_bankroll WHERE id=2")
print(f"fixture match={MATCH} user={user} wallet={bal0} sim_bankroll={bank0}")

# ------------------------------------------------- concurrent settlement ---
A, B = Session("A"), Session("B")
A.send("BEGIN;")
A.send(f"SELECT 'A_settled=' || public.settle_match_atomic('{MATCH}', 2, 0);")
time.sleep(3)  # A now holds the match/prediction row locks

B.send("BEGIN;")
B.send(f"SELECT 'B_settled=' || public.settle_match_atomic('{MATCH}', 2, 0);")
time.sleep(6)  # B must be BLOCKED here, not settling in parallel

blocked = psql("""
SELECT count(*) FROM pg_stat_activity
WHERE cardinality(pg_blocking_pids(pid)) > 0
  AND query ILIKE '%settle_match_atomic%'""")
print("blocked sessions while A held the locks:", blocked)
A.send("ROLLBACK;")
time.sleep(3)

# B verifies inside its own transaction, then rolls back too.
B.send(f"""SELECT 'RESULT|'
  || (SELECT count(*) FROM public.predictions WHERE match_id='{MATCH}' AND status='won')
  || '|' || (SELECT count(*) FROM public.predictions WHERE match_id='{MATCH}' AND status='lost')
  || '|' || (SELECT count(*) FROM public.wallet_transactions WHERE reference_id='{pred_win}')
  || '|' || (SELECT count(*) FROM public.settlement_journal WHERE reference_id='{pred_win}')
  || '|' || (SELECT count(*) FROM public.settlement_journal WHERE reference_id='{pred_loss}')
  || '|' || (SELECT balance FROM public.wallets WHERE user_id='{user}')
  || '|' || (SELECT count(*) FROM public.platform_transactions WHERE match_id='{MATCH}' AND transaction_type='payout_paid');""")
# Second settlement attempt in the same session: must be a no-op (0 settled).
B.send(f"SELECT 'RETRY|' || public.settle_match_atomic('{MATCH}', 2, 0)"
       f" || '|' || (SELECT count(*) FROM public.wallet_transactions WHERE reference_id='{pred_win}')"
       f" || '|' || (SELECT count(*) FROM public.settlement_journal WHERE reference_id='{pred_win}');")
B.send("ROLLBACK;")

out_a = A.finish()
out_b = B.finish()
print("--- session A ---\n" + out_a.strip())
print("--- session B ---\n" + out_b.strip())

check(blocked != "0",
      "session B was serialised behind session A (no parallel settlement)")
check("A_settled=2" in out_a, "session A performed a settlement before rollback")

res = next((l for l in out_b.splitlines() if l.startswith("RESULT|")), "")
retry = next((l for l in out_b.splitlines() if l.startswith("RETRY|")), "")
if not res:
    check(False, "session B produced verification output")
else:
    _, won, lost, wtx, sj_win, sj_loss, bal, payouts = res.split("|")
    check(won == "1", f"exactly one winning settlement (got {won})")
    check(lost == "1", f"exactly one losing settlement (got {lost})")
    check(wtx == "1", f"exactly one payout wallet transaction (got {wtx})")
    check(sj_win == "1", f"exactly one settlement-journal record for the win (got {sj_win})")
    check(sj_loss == "1", f"losing bet also produced exactly one journal record (got {sj_loss})")
    check(payouts == "1", f"exactly one bankroll payout entry (got {payouts})")
    check(abs(float(bal) - (float(bal0) + 20)) < 0.005,
          f"wallet credited exactly once: {bal0} -> {bal}")
if retry:
    _, n, wtx2, sj2 = retry.split("|")
    check(n == "0", f"repeat settlement in the same session settled 0 rows (got {n})")
    check(wtx2 == "1" and sj2 == "1", "repeat settlement created no extra ledger or journal rows")

# ---------------------------------------------------------------- teardown --
psql(f"SELECT public.settlement_test_cleanup('{TAG}')")
bal1 = psql(f"SELECT balance FROM public.wallets WHERE user_id='{user}'")
bank1 = psql("SELECT balance FROM public.platform_bankroll WHERE id=2")
check(bal1 == bal0, f"wallet restored/untouched after test ({bal0} -> {bal1})")
check(bank1 == bank0, f"simulation bankroll untouched after test ({bank0} -> {bank1})")
check(psql(f"SELECT count(*) FROM public.matches WHERE id='{MATCH}'") == "0", "fixture removed")

print("\n" + ("ALL CONCURRENCY CHECKS PASSED" if not FAILS else "FAILURES: " + "; ".join(FAILS)))
sys.exit(1 if FAILS else 0)
