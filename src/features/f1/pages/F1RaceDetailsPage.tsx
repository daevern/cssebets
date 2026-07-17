import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Flag, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { getF1Race, placeF1RaceBet } from "../f1.functions";

type Selected = { marketId: string; label: string; odds: number; marketType: string } | null;

export function F1RaceDetailsPage({ raceId }: { raceId: string }) {
  const getRace = useServerFn(getF1Race);
  const place = useServerFn(placeF1RaceBet);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["f1-race", raceId],
    queryFn: () => getRace({ data: { raceId } }),
    refetchInterval: 30_000,
  });

  const [tab, setTab] = useState<"race_winner" | "podium" | "points_finish" | "head_to_head">("race_winner");
  const [selected, setSelected] = useState<Selected>(null);
  const [stake, setStake] = useState("100");

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { race_winner: [], podium: [], points_finish: [], head_to_head: [] };
    for (const m of q.data?.markets ?? []) (g[m.market_type] ??= []).push(m);
    return g;
  }, [q.data]);

  const placeMut = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No selection");
      return place({
        data: { marketId: selected.marketId, stake: Number(stake), maxOdds: selected.odds * 1.05 },
      });
    },
    onSuccess: () => {
      toast.success("Bet placed");
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["f1-race", raceId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!q.data?.race) return <div className="p-6 text-center text-sm">Race not found.</div>;

  const race: any = q.data.race;

  return (
    <div className="mx-auto max-w-3xl p-4 pb-40">
      <Link to="/f1" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to season
      </Link>
      <Card className="mb-4 space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
          <Flag className="h-3 w-3" /> Round {race.round}
        </div>
        <h1 className="text-xl font-bold">{race.name}</h1>
        <div className="text-sm text-muted-foreground">{race.circuit} · {race.country}</div>
        <div className="font-mono text-sm">{new Date(race.starts_at).toLocaleString()}</div>
      </Card>

      <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
        {(Object.keys(grouped) as Array<keyof typeof grouped>).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? "default" : "outline"}
            onClick={() => setTab(k)}
            className="whitespace-nowrap"
          >
            {k.replace(/_/g, " ")} ({grouped[k].length})
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {grouped[tab].length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No markets in this category.</Card>
        )}
        {grouped[tab].map((m: any) => (
          <Card
            key={m.id}
            className={`flex cursor-pointer items-center justify-between p-3 transition ${
              selected?.marketId === m.id ? "border-primary" : ""
            }`}
            onClick={() =>
              setSelected({
                marketId: m.id,
                label: m.label,
                odds: Number(m.odds),
                marketType: m.market_type,
              })
            }
          >
            <div className="text-sm font-medium">{m.label}</div>
            <div className="font-mono text-lg font-semibold">{Number(m.odds).toFixed(2)}</div>
          </Card>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background p-4"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          <div className="mx-auto max-w-3xl">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">{selected.marketType.replace(/_/g, " ")}</div>
                <div className="text-sm font-semibold">{selected.label}</div>
              </div>
              <div className="font-mono text-lg">{selected.odds.toFixed(2)}</div>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="Stake"
              />
              <Button onClick={() => placeMut.mutate()} disabled={placeMut.isPending}>
                {placeMut.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Place · {(Number(stake) * selected.odds).toFixed(0)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
