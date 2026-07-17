import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { getUfcTradeTape } from "@/lib/ufc.functions";

export function UfcTradeTape({ fightId }: { fightId: string }) {
  const tapeFn = useServerFn(getUfcTradeTape);
  const q = useQuery({
    queryKey: ["ufc-tape", fightId],
    queryFn: () => tapeFn({ data: { fightId } }),
    refetchInterval: 15_000,
  });

  const trades = q.data?.trades ?? [];
  if (!trades.length) return null;

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-primary">
        <Activity className="h-3 w-3" /> Live trade tape
      </div>
      <div className="max-h-40 space-y-1 overflow-auto text-xs">
        {trades.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-border/60 py-1 last:border-none">
            <div className="flex-1 truncate">
              <span className="text-muted-foreground">{t.market}:</span>{" "}
              <span className="font-medium">{t.selection}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{t.stakeBucket}</span>
              <span className="font-mono">{t.odds.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
