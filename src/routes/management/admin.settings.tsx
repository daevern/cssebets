import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getReauthStatus, issueReauth, setTwoFactorPlaceholder } from "@/lib/admin-dashboard.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/management/admin/settings")({
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
  const [totpCode, setTotpCode] = useState("");
  const [factorsLoading, setFactorsLoading] = useState(true);
  const [hasTotp, setHasTotp] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [enrollPending, setEnrollPending] = useState(false);

  const requireTotp = !!status.data?.twoFactorPlaceholder;

  async function refreshFactors() {
    setFactorsLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const verified = (data?.totp ?? []).some((f) => f.status === "verified");
      setHasTotp(verified || (data?.totp ?? []).length > 0);
    } catch {
      setHasTotp(false);
    } finally {
      setFactorsLoading(false);
    }
  }

  useEffect(() => {
    void refreshFactors();
  }, []);

  const issue = useMutation({
    mutationFn: () =>
      issueFn({
        data: {
          password,
          totpCode: requireTotp ? totpCode : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Re-authenticated for 5 minutes");
      setPassword("");
      setTotpCode("");
      qc.invalidateQueries({ queryKey: ["admin-reauth"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tfa = useMutation({
    mutationFn: (enabled: boolean) => tfaFn({ data: { enabled } }),
    onSuccess: () => {
      toast.success("Authenticator requirement saved");
      qc.invalidateQueries({ queryKey: ["admin-reauth"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function startEnroll() {
    setEnrolling(true);
    setEnrollPending(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "CSSE Admin",
      });
      if (error) throw error;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start enrollment");
      setEnrolling(false);
    } finally {
      setEnrollPending(false);
    }
  }

  async function confirmEnroll() {
    if (!factorId || enrollCode.trim().length < 6) return;
    setEnrollPending(true);
    try {
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeErr || !challenge) throw challengeErr ?? new Error("Challenge failed");
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: enrollCode.trim(),
      });
      if (verifyErr) throw verifyErr;
      toast.success("Authenticator enrolled");
      setEnrolling(false);
      setQrCode(null);
      setFactorId(null);
      setEnrollCode("");
      await refreshFactors();
    } catch (e: any) {
      toast.error(e?.message ?? "Invalid code");
    } finally {
      setEnrollPending(false);
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Admin settings</h1>
        <p className="text-sm text-muted-foreground">
          Re-authenticate to unlock sensitive actions for 5 minutes. Optional authenticator (TOTP) for extra lock.
        </p>
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
        <div className="flex flex-col gap-2">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            onKeyDown={(e) => {
              if (e.key === "Enter" && password && (!requireTotp || totpCode.length >= 6)) issue.mutate();
            }}
          />
          {requireTotp ? (
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="Authenticator code"
              onKeyDown={(e) => {
                if (e.key === "Enter" && password && totpCode.length >= 6) issue.mutate();
              }}
            />
          ) : null}
          <Button
            onClick={() => issue.mutate()}
            disabled={!password || issue.isPending || (requireTotp && totpCode.length < 6)}
          >
            {issue.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Authenticator (TOTP)</div>
            <div className="text-xs text-muted-foreground">
              {factorsLoading
                ? "Checking enrollment…"
                : hasTotp
                  ? "Authenticator enrolled. Toggle to require it on sensitive unlock."
                  : "Enroll an authenticator app before requiring MFA on unlock."}
            </div>
          </div>
          <Switch
            checked={!!status.data?.twoFactorPlaceholder}
            disabled={!hasTotp || tfa.isPending}
            onCheckedChange={(v) => {
              if (v && !hasTotp) {
                toast.error("Enroll an authenticator first");
                return;
              }
              tfa.mutate(v);
            }}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          Require authenticator for sensitive unlock
        </div>

        {!hasTotp && !enrolling ? (
          <Button type="button" variant="outline" onClick={startEnroll} disabled={enrollPending}>
            {enrollPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enroll authenticator"}
          </Button>
        ) : null}

        {enrolling && qrCode ? (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              Scan this QR with your authenticator app, then enter the 6-digit code.
            </p>
            <img src={qrCode} alt="TOTP QR code" className="mx-auto h-40 w-40 rounded bg-white p-2" />
            <div className="flex gap-2">
              <Input
                value={enrollCode}
                onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="6-digit code"
                inputMode="numeric"
              />
              <Button
                type="button"
                onClick={confirmEnroll}
                disabled={enrollCode.length < 6 || enrollPending}
              >
                {enrollPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEnrolling(false);
                setQrCode(null);
                setFactorId(null);
                setEnrollCode("");
              }}
            >
              Cancel
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
