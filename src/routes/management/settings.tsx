import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyStaffRole } from "@/lib/management.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/management/settings")({
  head: () => ({ meta: [{ title: "Settings — CSSEBETS Management" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const roleFn = useServerFn(getMyStaffRole);
  const roleQ = useQuery({ queryKey: ["mgmt-role"], queryFn: () => roleFn({}) });
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error("New password must be at least 8 characters");
    if (pw !== pw2) return toast.error("Passwords do not match");
    if (pw === current) return toast.error("New password must differ from current");
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const email = u.user?.email;
      if (!email) throw new Error("Not signed in");
      // Verify current password by attempting a sign-in
      const { error: verr } = await supabase.auth.signInWithPassword({ email, password: current });
      if (verr) throw new Error("Current password is incorrect");
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success("Password updated");
      setCurrent(""); setPw(""); setPw2("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-400">Manage your staff account.</p>
      </header>

      <div className="rounded-xl border border-violet-950/50 bg-zinc-950 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-violet-300" />
          <div>
            <div className="font-semibold">Account</div>
            <div className="text-xs text-slate-400 capitalize">{roleQ.data?.role?.replace("_", " ") ?? "—"}</div>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-violet-950/50 bg-zinc-950 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-violet-300" />
          <h2 className="font-semibold">Change password</h2>
        </div>
        <p className="text-xs text-slate-400">
          For security, change the default password (123456789) as soon as possible.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="cur" className="text-slate-300">Current password</Label>
          <Input id="cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
            className="bg-zinc-900 border-violet-950/60 text-slate-100" autoComplete="current-password" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="np" className="text-slate-300">New password</Label>
          <Input id="np" type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            className="bg-zinc-900 border-violet-950/60 text-slate-100" autoComplete="new-password" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="np2" className="text-slate-300">Confirm new password</Label>
          <Input id="np2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
            className="bg-zinc-900 border-violet-950/60 text-slate-100" autoComplete="new-password" required />
        </div>
        <Button type="submit" disabled={busy} className="bg-violet-950 hover:bg-violet-800 text-white">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <KeyRound className="h-4 w-4 mr-1" />}
          Update password
        </Button>
      </form>
    </div>
  );
}
