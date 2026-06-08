import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/my-predictions")({
  head: () => ({ meta: [{ title: "My Predictions — WC26 Pool" }] }),
  component: MyPredictionsPage,
});

function MyPredictionsPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["my-predictions", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("*, matches(home_team, away_team, kickoff_at)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  if (isLoading) return <div className="grid place-items-center py-20"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My Predictions</h1>
      {!data?.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No predictions yet.</Card>
      ) : (
        <div className="space-y-2">
          {data.map((p) => (
            <Card key={p.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">
                  {p.matches ? `${p.matches.home_team} vs ${p.matches.away_team}` : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.market} · {p.outcome} · stake {p.virtual_stake} @ {p.reference_odds}
                </div>
              </div>
              <div className="text-right space-y-1">
                <Badge variant={p.status === "won" ? "default" : p.status === "lost" ? "destructive" : "secondary"}>
                  {p.status}
                </Badge>
                <div className="text-xs text-muted-foreground">{p.points} pts</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
