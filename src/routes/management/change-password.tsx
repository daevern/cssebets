import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { clearMyForcePasswordChange } from "@/lib/management.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/management/change-password")({
  head: () => ({ meta: [{ title: "Change password — CSSE Management" }] }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const router = useRouter();
  const clearFn = useServerFn(clearMyForcePasswordChange);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Min 8 characters");
    if (pw !== pw2) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      await clearFn({});
      toast.success("Password updated");
      router.navigate({ to: "/management/support", replace: true });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 p-6 rounded-xl border border-slate-800 bg-slate-900">
        <div className="text-center space-y-1">
          <Lock className="h-8 w-8 text-amber-400 mx-auto" />
          <h1 className="text-lg font-bold">Set a new password</h1>
          <p className="text-xs text-slate-400">Your password must be changed before you can continue.</p>
        </div>
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password"
          className="bg-slate-800 border-slate-700" autoFocus />
        <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm password"
          className="bg-slate-800 border-slate-700" />
        <Button type="submit" disabled={busy} className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
        </Button>
      </form>
    </div>
  );
}
