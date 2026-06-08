import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPendingUsers, approveUser, makeAdmin, syncFootballData, settleMatch } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Shield, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Admin — WC26 Pool" }] }),
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const list = useServerFn(listPendingUsers);
  const approve = useServerFn(approveUser);
  const promote = useServerFn(makeAdmin);
  const sync = useServerFn(syncFootballData);
  const settle = useServerFn(settleMatch);

  const pending = useQuery({
    queryKey: ["pending-users"],
    queryFn: () => list({}),
  });

  const matches = useQuery({
    queryKey: ["admin-matches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("matches").select("*").order("kickoff_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data as any[];
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => approve({ data: { targetUserId: id } }),
    onSuccess: () => { toast.success("Approved"); qc.invalidateQueries({ queryKey: ["pending-users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const promoteMut = useMutation({
    mutationFn: (id: string) => promote({ data: { targetUserId: id } }),
    onSuccess: () => { toast.success("Promoted to admin"); qc.invalidateQueries({ queryKey: ["pending-users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMut = useMutation({
    mutationFn: () => sync({}),
    onSuccess: (r: any) => { toast.success(`Synced ${r.upserted}/${r.total} matches`); qc.invalidateQueries({ queryKey: ["admin-matches"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Admin</h1>
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Pending approvals</h2>
        {pending.isLoading ? (
          <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" />
        ) : !pending.data?.users?.length ? (
          <p className="text-sm text-muted-foreground">No pending users.</p>
        ) : (
          <div className="space-y-2">
            {pending.data.users.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between border rounded-md p-3">
                <div>
                  <div className="font-medium">{u.display_name || u.id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">Joined {new Date(u.created_at).toLocaleDateString()}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => approveMut.mutate(u.id)} disabled={approveMut.isPending}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => promoteMut.mutate(u.id)} disabled={promoteMut.isPending}>Make admin</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Fixtures</h2>
          <Button size="sm" variant="outline" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncMut.isPending ? "animate-spin" : ""}`} /> Sync football-data
          </Button>
        </div>
        {matches.isLoading ? <Loader2 className="animate-spin h-5 w-5 text-muted-foreground" /> : (
          <div className="space-y-2">
            {(matches.data ?? []).map((m) => (
              <SettleRow key={m.id} match={m} onSettle={async (h, a) => {
                try {
                  await settle({ data: { matchId: m.id, homeScore: h, awayScore: a } });
                  toast.success("Settled");
                  qc.invalidateQueries({ queryKey: ["admin-matches"] });
                } catch (e) { toast.error((e as Error).message); }
              }} />
            ))}
            {!matches.data?.length && <p className="text-sm text-muted-foreground">No matches yet. Sync to load them.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

function SettleRow({ match, onSettle }: { match: any; onSettle: (h: number, a: number) => void }) {
  const [h, setH] = useState(String(match.home_score ?? ""));
  const [a, setA] = useState(String(match.away_score ?? ""));
  return (
    <div className="flex items-center justify-between border rounded-md p-3 gap-2">
      <div className="text-sm flex-1 truncate">{match.home_team} vs {match.away_team}</div>
      <Input className="w-14" value={h} onChange={(e) => setH(e.target.value)} placeholder="H" />
      <Input className="w-14" value={a} onChange={(e) => setA(e.target.value)} placeholder="A" />
      <Button size="sm" onClick={() => onSettle(Number(h), Number(a))} disabled={h === "" || a === ""}>
        {match.status === "finished" ? "Re-settle" : "Settle"}
      </Button>
    </div>
  );
}
