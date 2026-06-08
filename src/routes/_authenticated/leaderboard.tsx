import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — WC26 Pool" }] }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data: preds, error } = await supabase
        .from("predictions")
        .select("user_id, points, status");
      if (error) throw error;
      const { data: profiles } = await supabase.from("profiles").select("id, display_name");
      const map = new Map<string, { name: string; points: number; wins: number; total: number }>();
      for (const p of preds ?? []) {
        const name = profiles?.find((x) => x.id === p.user_id)?.display_name ?? "?";
        const row = map.get(p.user_id) ?? { name, points: 0, wins: 0, total: 0 };
        row.points += p.points ?? 0;
        if (p.status === "won") row.wins++;
        row.total++;
        map.set(p.user_id, row);
      }
      return Array.from(map.values()).sort((a, b) => b.points - a.points);
    },
  });

  if (isLoading) return <div className="grid place-items-center py-20"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Trophy className="h-6 w-6 text-primary" /> Leaderboard</h1>
      {!data?.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No scores yet.</Card>
      ) : (
        <Card className="divide-y">
          {data.map((r, i) => (
            <div key={r.name + i} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 text-center font-bold text-muted-foreground">#{i + 1}</div>
                <div className="font-medium">{r.name}</div>
              </div>
              <div className="text-right">
                <div className="font-bold">{r.points} pts</div>
                <div className="text-xs text-muted-foreground">{r.wins}/{r.total} won</div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
