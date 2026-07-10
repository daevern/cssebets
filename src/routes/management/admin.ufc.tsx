import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listUfcFights,
  adminSyncUfc,
  adminSetUfcCard,
  adminSettleUfcFight,
  adminVoidUfcFight,
  adminUpdateUfcEvent,
  listUfcBetsForAdmin,
} from "@/lib/ufc.functions";

export const Route = createFileRoute("/management/admin/ufc")({
  component: AdminUfcPage,
});

function AdminUfcPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUfcFights);
  const syncFn = useServerFn(adminSyncUfc);
  const eventFn = useServerFn(adminUpdateUfcEvent);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-ufc-fights"],
    queryFn: () => listFn(),
    refetchInterval: 10_000,
  });

  const syncMutation = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r: any) => {
      toast.success(r?.skipped ? `Skipped: ${r.skipped}` : `Synced ${r.fights} fights, ${r.markets} markets`);
      qc.invalidateQueries({ queryKey: ["admin-ufc-fights"] });
    },
    onError: (e: any) => toast.error(e?.message || "Sync failed"),
  });

  const [eventStart, setEventStart] = useState("");

  if (isLoading) return <div className="p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const event: any = data?.event;
  const fights: any[] = (data?.fights as any) ?? [];

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">UFC Admin</h1>
        <p className="text-sm text-muted-foreground">Manage {event?.name ?? "the active event"} card + settle bets.</p>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">{event?.name}</div>
            <div className="text-xs text-muted-foreground">
              Starts: {event?.starts_at ? new Date(event.starts_at).toLocaleString() : "—"}
            </div>
          </div>
          <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <RefreshCw className="mr-2 h-4 w-4" /> Sync odds now
          </Button>
        </div>
        {event && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium">Update event start (ISO)</label>
              <Input
                placeholder={event.starts_at}
                value={eventStart}
                onChange={(e) => setEventStart(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                if (!eventStart) return;
                try {
                  await eventFn({ data: { eventKey: event.event_key, startsAt: eventStart } });
                  toast.success("Event updated");
                  qc.invalidateQueries({ queryKey: ["admin-ufc-fights"] });
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            >
              Save
            </Button>
          </div>
        )}
      </Card>

      {fights.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No fights synced yet. Click "Sync odds now" (requires event to be within 12 hours or force-sync).
        </Card>
      )}

      {fights.map((f) => (
        <FightAdminCard key={f.id} fight={f} onChanged={() => qc.invalidateQueries({ queryKey: ["admin-ufc-fights"] })} />
      ))}
    </div>
  );
}

function FightAdminCard({ fight, onChanged }: { fight: any; onChanged: () => void }) {
  const setCard = useServerFn(adminSetUfcCard);
  const settle = useServerFn(adminSettleUfcFight);
  const voidFn = useServerFn(adminVoidUfcFight);
  const listBets = useServerFn(listUfcBetsForAdmin);

  const [fighterA, setFighterA] = useState(fight.fighter_a);
  const [fighterB, setFighterB] = useState(fight.fighter_b);
  const [position, setPosition] = useState<"main" | "co_main" | "other">(fight.card_position);
  const [rounds, setRounds] = useState<3 | 5>(fight.scheduled_rounds);

  const [winner, setWinner] = useState<"a" | "b" | "draw">("a");
  const [method, setMethod] = useState<"ko_tko" | "submission" | "decision">("decision");
  const [round, setRound] = useState<number>(fight.scheduled_rounds);

  const betsQ = useQuery({
    queryKey: ["admin-ufc-bets", fight.id],
    queryFn: () => listBets({ data: { fightId: fight.id } }),
  });

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase text-primary">{fight.card_position.replace("_", "-")}</div>
          <div className="text-lg font-bold">{fight.fighter_a} vs {fight.fighter_b}</div>
          <div className="text-xs text-muted-foreground">Status: {fight.status} · {fight.scheduled_rounds} rounds</div>
        </div>
        {fight.status !== "finished" && fight.status !== "void" && (
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              const reason = prompt("Void reason?");
              if (reason == null) return;
              try {
                const r: any = await voidFn({ data: { fightId: fight.id, reason } });
                toast.success(`Voided (${r.voided} bets refunded)`);
                onChanged();
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            Void
          </Button>
        )}
      </div>

      {fight.status !== "finished" && fight.status !== "void" && (
        <div className="space-y-3 rounded border border-border p-3">
          <div className="text-xs font-semibold uppercase tracking-wide">Card mapping</div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={fighterA} onChange={(e) => setFighterA(e.target.value)} placeholder="Fighter A" />
            <Input value={fighterB} onChange={(e) => setFighterB(e.target.value)} placeholder="Fighter B" />
            <select
              className="rounded border border-border bg-background px-2 py-2 text-sm"
              value={position}
              onChange={(e) => setPosition(e.target.value as any)}
            >
              <option value="main">Main</option>
              <option value="co_main">Co-Main</option>
              <option value="other">Other</option>
            </select>
            <select
              className="rounded border border-border bg-background px-2 py-2 text-sm"
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value) as 3 | 5)}
            >
              <option value={3}>3 rounds</option>
              <option value={5}>5 rounds</option>
            </select>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await setCard({
                  data: { fightId: fight.id, fighterA, fighterB, cardPosition: position, scheduledRounds: rounds },
                });
                toast.success("Card updated");
                onChanged();
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            Save card
          </Button>
        </div>
      )}

      {fight.status !== "finished" && fight.status !== "void" && (
        <div className="space-y-3 rounded border border-border p-3">
          <div className="text-xs font-semibold uppercase tracking-wide">Settle fight</div>
          <div className="grid grid-cols-3 gap-2">
            <select
              className="rounded border border-border bg-background px-2 py-2 text-sm"
              value={winner}
              onChange={(e) => setWinner(e.target.value as any)}
            >
              <option value="a">{fight.fighter_a}</option>
              <option value="b">{fight.fighter_b}</option>
              <option value="draw">Draw</option>
            </select>
            <select
              className="rounded border border-border bg-background px-2 py-2 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
            >
              <option value="ko_tko">KO/TKO</option>
              <option value="submission">Submission</option>
              <option value="decision">Decision</option>
            </select>
            <select
              className="rounded border border-border bg-background px-2 py-2 text-sm"
              value={round}
              onChange={(e) => setRound(Number(e.target.value))}
            >
              {Array.from({ length: fight.scheduled_rounds }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>Round {r}</option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            onClick={async () => {
              if (!confirm(`Settle ${fight.fighter_a} vs ${fight.fighter_b}: ${winner.toUpperCase()} by ${method} round ${round}?`)) return;
              try {
                const r: any = await settle({ data: { fightId: fight.id, winner, method, round } });
                toast.success(`Settled ${r.settled} bets`);
                onChanged();
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            Settle
          </Button>
        </div>
      )}

      {fight.status === "finished" && (
        <div className="rounded border border-border p-3 text-sm">
          <div className="font-semibold text-primary">Settled</div>
          <div>Winner: {fight.winner === "a" ? fight.fighter_a : fight.winner === "b" ? fight.fighter_b : "Draw"}</div>
          <div>Method: {fight.result_method} · Round {fight.result_round}</div>
        </div>
      )}

      <div className="rounded border border-border p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide">
          Open bets ({(betsQ.data?.bets ?? []).filter((b: any) => b.status === "open").length})
        </div>
        <div className="max-h-48 overflow-auto text-xs">
          {(betsQ.data?.bets ?? []).length === 0 ? (
            <div className="text-muted-foreground">No bets.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">Market</th>
                  <th>Selection</th>
                  <th className="text-right">Stake</th>
                  <th className="text-right">Odds</th>
                  <th className="text-right">Payout</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(betsQ.data?.bets ?? []).map((b: any) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="py-1">{b.market_type}</td>
                    <td>{b.selection_label}</td>
                    <td className="text-right font-mono">${Number(b.stake).toFixed(2)}</td>
                    <td className="text-right font-mono">{Number(b.odds_locked).toFixed(2)}</td>
                    <td className="text-right font-mono">${Number(b.potential_payout).toFixed(2)}</td>
                    <td>{b.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Card>
  );
}
