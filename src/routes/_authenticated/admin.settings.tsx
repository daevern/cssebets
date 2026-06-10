import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getReauthStatus, issueReauth, setTwoFactorPlaceholder } from "@/lib/admin-dashboard.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getReauthStatus);
  const issueFn = useServerFn(issueReauth);
  const tfaFn = useServerFn(setTwoFactorPlaceholder);
  const status = useQuery({
    queryKey: ["admin-reauth"],
    queryFn: () => statusFn({}),
    refetchInterval: 30_000,
  });

  const [password, setPassword] = useState("");

  const issue = useMutation({
    mutationFn: () => issueFn({ data: { password } }),
    onSuccess: () => {
      toast.success("Re-authenticated for 5 minutes");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["admin-reauth"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tfa = useMutation({
    mutationFn: (enabled: boolean) => tfaFn({ data: { enabled } }),
    onSuccess: () => { toast.success("2FA preference saved"); qc.invalidateQueries({ queryKey: ["admin-reauth"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Admin settings</h1>
        <p className="text-sm text-muted-foreground">Re-authenticate to unlock sensitive actions for 5 minutes.</p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          {status.data?.active ? (
            <ShieldCheck className="h-5 w-5 text-success" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-warning" />
          )}
          <div className="text-sm">
            <div className="font-semibold">Re-authentication</div>
            <div className="text-xs text-muted-foreground">
              {status.isLoading
                ? "…"
                : status.data?.active
                  ? `Active until ${new Date(status.data.expiresAt!).toLocaleTimeString()}`
                  : "Not active. Confirm your password below."}
            </div>
          </div>
          {status.data?.active && <Badge variant="secondary" className="ml-auto">Unlocked</Badge>}
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            onKeyDown={(e) => { if (e.key === "Enter" && password) issue.mutate(); }}
          />
          <Button onClick={() => issue.mutate()} disabled={!password || issue.isPending}>
            {issue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Two-factor authentication</div>
            <div className="text-xs text-muted-foreground">Placeholder toggle. Enforcement coming soon.</div>
          </div>
          <Switch
            checked={!!status.data?.twoFactorPlaceholder}
            onCheckedChange={(v) => tfa.mutate(v)}
          />
        </div>
      </Card>
    </div>
  );
}
