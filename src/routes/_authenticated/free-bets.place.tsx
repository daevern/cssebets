import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listMyFreeBets, placeFreeBet } from "@/lib/freebets.functions";
import { listMatchesForUsers } from "@/lib/matches.functions";
import { ArrowLeft } from "lucide-react";

const SearchSchema = z.object({ fb: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/free-bets/place")({
  validateSearch: (s: Record<string, unknown>) => SearchSchema.parse(s),
  component: PlaceFreeBetPage,
});

function PlaceFreeBetPage() {
  const { fb } = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const myFbFn = useServerFn(listMyFreeBets);
  const matchesFn = useServerFn(listMatchesForUsers);
  const placeFn = useServerFn(placeFreeBet);

  const myFbs = useQuery({ queryKey: ["my-free-bets"], queryFn: () => myFbFn() });
  const matches = useQuery({ queryKey: ["matches-for-users"], queryFn: () => matchesFn() });

  const freeBet = (myFbs.data?.available ?? []).find((f: any) => f.id === fb);
  const [selMatch, setSelMatch] = useState<string | null>(null);
  const [selOutcome, setSelOutcome] = useState<"HOME" | "DRAW" | "AWAY" | null>(null);

  const place = useMutation({
    mutationFn: async () => {
      if (!fb || !selMatch || !selOutcome) throw new Error("Pick a match and outcome first.");
      const m = (matches.data ?? []).find((x: any) => x.id === selMatch);
      const ro = m?.reference_odds;
      const key = selOutcome === "HOME" ? "home" : selOutcome === "DRAW" ? "draw" : "away";
      const odds = ro ? Number(ro[key]) : NaN;
      if (!Number.isFinite(odds) || odds < 1) throw new Error("Odds unavailable for this pick.");
      return placeFn({ data: {
        freeBetId: fb, matchId: selMatch, market: "result", outcome: selOutcome,
        referenceOdds: odds, clientRequestId: crypto.randomUUID(),
      }});
    },
    onSuccess: () => {
      toast.success("Free bet placed.");
      qc.invalidateQueries({ queryKey: ["my-free-bets"] });
      navigate({ to: "/my-predictions" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upcoming = (matches.data ?? []).filter((m: any) =>
    m.status === "scheduled" && new Date(m.kickoff_at).getTime() > Date.now()
  ).slice(0, 30);

  if (!fb || !freeBet) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 pb-24 pt-4 text-[var(--color-ink)]">
        <Link to="/store" className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-muted)]">
          <ArrowLeft className="h-3 w-3" /> Back to store
        </Link>
        <Card className="rounded-none border-[var(--color-surface-border)] bg-[#070D0A] p-6 text-center text-sm text-[var(--color-ink-muted)]">
          This free bet is no longer available.
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pb-32 pt-4 text-[var(--color-ink)]">
      <Link to="/store" className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-muted)]">
        <ArrowLeft className="h-3 w-3" /> Back
      </Link>

      <Card className="rounded-none border-[var(--neon)]/40 bg-[#070D0A] p-4">
        <Badge className="rounded-none bg-[var(--neon)] text-black">FREE BET</Badge>
        <div className="mt-2 font-mono text-3xl font-bold">{Number(freeBet.stake_amount)} pts</div>
        <div className="text-[10px] text-[var(--color-ink-muted)]">Stake locked · You keep only the profit</div>
      </Card>

      <div>
        <div className="mb-2 text-[11px] uppercase tracking-widest text-[var(--color-ink-muted)]">Pick a match</div>
        <div className="space-y-2">
          {upcoming.map((m: any) => {
            const ro = m.reference_odds ?? {};
            const isSel = selMatch === m.id;
            return (
              <Card key={m.id} className={`rounded-none border p-3 ${
                isSel ? "border-[var(--neon)] bg-black" : "border-[var(--color-surface-border)] bg-[#070D0A]"
              }`}>
                <button onClick={() => { setSelMatch(m.id); setSelOutcome(null); }}
                        className="block w-full text-left text-sm font-semibold">
                  {m.home_team} vs {m.away_team}
                </button>
                <div className="text-[10px] text-[var(--color-ink-muted)]">
                  {new Date(m.kickoff_at).toLocaleString()}
                </div>
                {isSel && (
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {(["HOME", "DRAW", "AWAY"] as const).map((k) => {
                      const key = k === "HOME" ? "home" : k === "DRAW" ? "draw" : "away";
                      const odds = Number(ro?.[key] ?? 0);
                      const active = selOutcome === k;
                      return (
                        <button key={k} disabled={!odds}
                          onClick={() => setSelOutcome(k)}
                          className={`rounded-none border px-2 py-2 font-mono text-xs disabled:opacity-30 ${
                            active ? "border-[var(--neon)] text-[var(--neon)] bg-black" : "border-[var(--color-surface-border)] bg-black"
                          }`}>
                          <div className="text-[9px] uppercase text-[var(--color-ink-muted)]">
                            {k === "HOME" ? "Home" : k === "DRAW" ? "Draw" : "Away"}
                          </div>
                          <div>{odds ? odds.toFixed(2) : "—"}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
          {!upcoming.length && (
            <div className="p-6 text-center text-sm text-[var(--color-ink-muted)]">No upcoming matches.</div>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-surface-border)] bg-[var(--surface)]/95 p-3 backdrop-blur-xl"
           style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
        <div className="mx-auto max-w-md">
          <Button disabled={!selMatch || !selOutcome || place.isPending}
                  onClick={() => place.mutate()}
                  className="w-full rounded-none bg-[var(--neon)] text-black hover:bg-[var(--neon)]/90 disabled:opacity-40">
            Place Free Bet
          </Button>
        </div>
      </div>
    </div>
  );
}
