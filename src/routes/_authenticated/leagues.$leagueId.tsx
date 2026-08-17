import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Link2, Send } from "lucide-react";
import {
  getLeagueActivity,
  getLeagueStandings,
  listLeagueMessages,
  postLeagueMessage,
} from "@/lib/leagues.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/leagues/$leagueId")({
  head: () => ({ meta: [{ title: "League — CSSEBets" }] }),
  component: LeagueDetailPage,
});

type SportFilter = "all" | "wc" | "football" | "f1" | "ufc";

const SPORT_CHIPS: { key: SportFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "wc", label: "WC" },
  { key: "football", label: "Football" },
  { key: "f1", label: "F1" },
  { key: "ufc", label: "UFC" },
];

function LeagueDetailPage() {
  const { leagueId } = Route.useParams();
  const qc = useQueryClient();
  const [sport, setSport] = useState<SportFilter>("all");
  const [draft, setDraft] = useState("");

  const standingsFn = useServerFn(getLeagueStandings);
  const activityFn = useServerFn(getLeagueActivity);
  const listMsgFn = useServerFn(listLeagueMessages);
  const postMsgFn = useServerFn(postLeagueMessage);

  const q = useQuery({
    queryKey: ["league", leagueId, sport],
    queryFn: () => standingsFn({ data: { leagueId, sport } }),
  });
  const activityQ = useQuery({
    queryKey: ["league-activity", leagueId],
    queryFn: () => activityFn({ data: { leagueId } }),
  });
  const messagesQ = useQuery({
    queryKey: ["league-messages", leagueId],
    queryFn: () => listMsgFn({ data: { leagueId } }),
    refetchInterval: 15_000,
  });

  const postMut = useMutation({
    mutationFn: () => postMsgFn({ data: { leagueId, body: draft } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["league-messages", leagueId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not send message"),
  });

  const league = q.data?.league;
  const standings = q.data?.standings ?? [];
  const activity = activityQ.data?.activity ?? [];
  const messages = messagesQ.data?.messages ?? [];

  const inviteLink =
    typeof window !== "undefined" && league?.invite_code
      ? `${window.location.origin}/leagues?join=${league.invite_code}`
      : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-3 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            to="/leagues"
            search={{ join: undefined }}
            className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]"
          >
            ← Leagues
          </Link>
          <h1 className="mt-2 font-display text-2xl font-black tracking-tight">
            {league?.name ?? "League"}
          </h1>
        </div>
        {league?.invite_code ? (
          <div className="flex flex-col items-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="font-mono text-xs"
              onClick={async () => {
                await navigator.clipboard.writeText(league.invite_code);
                toast.success("Invite code copied");
              }}
            >
              <Copy className="mr-1.5 h-3 w-3" />
              {league.invite_code}
            </Button>
            {inviteLink ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-[11px]"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteLink);
                  toast.success("Invite link copied");
                }}
              >
                <Link2 className="mr-1.5 h-3 w-3" />
                Copy invite link
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="text-sm text-[var(--color-ink-muted)]">
        Multi-sport standings: World Cup predictions plus net P/L from settled football, F1, and UFC tickets.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {SPORT_CHIPS.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setSport(chip.key)}
            className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
              sport === chip.key
                ? "border-[var(--color-neon)]/50 bg-[var(--color-neon)]/15 text-[var(--color-neon)]"
                : "border-[var(--color-line)] text-[var(--color-ink-muted)] hover:border-[var(--color-neon)]/30"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

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
                  {Math.round(row.points * 100) / 100}
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

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          Recent activity
        </h2>
        <ul className="space-y-2">
          {activity.map((row, i) => (
            <li
              key={`${row.settledAt}-${row.displayName}-${i}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/40 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{row.displayName}</div>
                <div className="text-[11px] text-[var(--color-ink-muted)]">
                  {row.sport} ·{" "}
                  <span className={row.result === "won" ? "text-[var(--color-neon)]" : "text-rose-400"}>
                    {row.result}
                  </span>
                </div>
              </div>
              <div
                className={`shrink-0 font-display font-bold tabular-nums ${
                  row.pointsDelta >= 0 ? "text-[var(--color-neon)]" : "text-rose-400"
                }`}
              >
                {row.pointsDelta >= 0 ? "+" : ""}
                {Math.round(row.pointsDelta * 100) / 100}
              </div>
            </li>
          ))}
          {!activityQ.isLoading && !activity.length && (
            <p className="text-sm text-[var(--color-ink-muted)]">No settled tickets yet.</p>
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          League chat
        </h2>
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/40">
          <ul className="max-h-64 space-y-2 overflow-y-auto px-3 py-3">
            {messages.map((m) => (
              <li key={m.id} className="text-sm">
                <span className="font-medium text-[var(--color-ink)]">
                  {m.isYou ? "You" : m.displayName}
                </span>
                <span className="mx-1.5 text-[var(--color-ink-muted)]">·</span>
                <span className="text-[var(--color-ink-muted)]">{m.body}</span>
              </li>
            ))}
            {!messagesQ.isLoading && !messages.length && (
              <p className="text-sm text-[var(--color-ink-muted)]">No messages yet — say hello.</p>
            )}
          </ul>
          <form
            className="flex gap-2 border-t border-[var(--color-line)] p-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim().length < 1 || postMut.isPending) return;
              postMut.mutate();
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message the league"
              maxLength={500}
              className="flex-1"
            />
            <Button type="submit" disabled={draft.trim().length < 1 || postMut.isPending} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
