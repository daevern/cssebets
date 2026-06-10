import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listMatchesForOdds, listMatchOddsHistory } from "@/lib/admin-dashboard.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/odds-history")({
  component: AdminOddsHistoryPage,
});

function AdminOddsHistoryPage() {
  const matchesFn = useServerFn(listMatchesForOdds);
  const historyFn = useServerFn(listMatchOddsHistory);
  const [selected, setSelected] = useState<string>("");

  const matchesQ = useQuery({
    queryKey: ["admin-odds-matches"],
    queryFn: () => matchesFn({}),
  });

  const historyQ = useQuery({
    queryKey: ["admin-odds-history", selected],
    queryFn: () => historyFn({ data: { matchId: selected } }),
    enabled: !!selected,
    refetchInterval: 60_000,
  });

  const matches = matchesQ.data?.matches ?? [];
  const snapshots = historyQ.data?.snapshots ?? [];
  const current = matches.find((m: any) => m.id === selected);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Odds history</h1>
        <p className="text-sm text-muted-foreground">
          Every odds snapshot recorded from The Odds API. Used for audit and dispute resolution.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <label className="text-xs text-muted-foreground">Match</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 w-full md:max-w-md rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Select a match…</option>
          {matches.map((m: any) => (
            <option key={m.id} value={m.id}>
              {m.home_team} vs {m.away_team} — {new Date(m.kickoff_at).toLocaleString()}
            </option>
          ))}
        </select>

        {current && (
          <div className="flex flex-wrap items-center gap-2 text-xs pt-2">
            <Badge variant="outline" className="uppercase">{current.status}</Badge>
            {current.reference_odds && (
              <span className="text-muted-foreground">
                Latest: H {Number(current.reference_odds.home).toFixed(2)} · D{" "}
                {Number(current.reference_odds.draw).toFixed(2)} · A{" "}
                {Number(current.reference_odds.away).toFixed(2)}
              </span>
            )}
            {current.odds_updated_at && (
              <span className="text-muted-foreground">
                Updated {new Date(current.odds_updated_at).toLocaleString()}
              </span>
            )}
          </div>
        )}
      </Card>

      {selected && (
        <Card className="p-4">
          {historyQ.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sampled at</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Home</TableHead>
                    <TableHead className="text-right">Draw</TableHead>
                    <TableHead className="text-right">Away</TableHead>
                    <TableHead className="text-right">Bookmakers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(s.sampled_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">{s.source}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {Number(s.home_odds).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {Number(s.draw_odds).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {Number(s.away_odds).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {s.raw_bookmaker_count ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!snapshots.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No snapshots yet for this match.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
