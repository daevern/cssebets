import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getLeagueStandings } from "@/lib/leagues.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/leagues/$leagueId")({
  head: () => ({ meta: [{ title: "League — CSSEBets" }] }),
  component: LeagueDetailPage,
});

function LeagueDetailPage() {
  const { leagueId } = Route.useParams();
  const standingsFn = useServerFn(getLeagueStandings);
  const q = useQuery({
    queryKey: ["league", leagueId],
    queryFn: () => standingsFn({ data: { leagueId } }),
  });

  const league = q.data?.league;
  const standings = q.data?.standings ?? [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-3 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            to="/leagues"
            className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]"
          >
            ← Leagues
          </Link>
          <h1 className="mt-2 font-display text-2xl font-black tracking-tight">
            {league?.name ?? "League"}
          </h1>
        </div>
        {league?.invite_code ? (
          <Button
            type="button"
            variant="outline"
            className="font-mono text-xs"
            onClick={async () => {
              await navigator.clipboard.writeText(league.invite_code);
              toast.success("Invite code copied");
            }}
          >
            {league.invite_code}
          </Button>
        ) : null}
      </div>

      <p className="text-sm text-[var(--color-ink-muted)]">
        Standings from settled World Cup prediction points (practice tickets excluded).
      </p>

      <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--color-surface)]/60 text-[10px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
            <tr>
              <th className="px-3 py-2 font-bold">#</th>
              <th className="px-3 py-2 font-bold">Member</th>
              <th className="px-3 py-2 text-right font-bold">Pts</th>
              <th className="px-3 py-2 text-right font-bold">W</th>
              <th className="px-3 py-2 text-right font-bold">Bets</th>
            </tr>
          </thead>
          <tbody>
            {standings.map(
              (
                row: {
                  userId: string;
                  displayName: string;
                  points: number;
                  wins: number;
                  bets: number;
                  isYou: boolean;
                },
                i: number,
              ) => (
              <tr
                key={row.userId}
                className={
                  row.isYou
                    ? "border-t border-[var(--color-line)] bg-[var(--color-neon)]/5"
                    : "border-t border-[var(--color-line)]"
                }
              >
                <td className="px-3 py-2 tabular-nums text-[var(--color-ink-muted)]">{i + 1}</td>
                <td className="px-3 py-2 font-medium">
                  {row.displayName}
                  {row.isYou ? (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-neon)]">
                      you
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right font-display font-bold tabular-nums">
                  {row.points}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.wins}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.bets}</td>
              </tr>
            ))}
            {!q.isLoading && !standings.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[var(--color-ink-muted)]">
                  No members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
