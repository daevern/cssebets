import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { logManagementLoginAttempt, getMyStaffRole } from "@/lib/management.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/management/login")({
  head: () => ({ meta: [{ title: "Staff portal — CSSE Management" }] }),
  component: ManagementLogin,
});

function ManagementLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const logFn = useServerFn(logManagementLoginAttempt);
  const roleFn = useServerFn(getMyStaffRole);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        await logFn({ data: { email, success: false, reason: error?.message ?? "no user" } });
        throw new Error(error?.message ?? "Sign-in failed");
      }
      const { role } = await roleFn({});
      if (!role) {
        await logFn({ data: { email, success: false, reason: "not_staff", userId: data.user.id } });
        await supabase.auth.signOut();
        toast.error("This portal is for authorised staff only.");
        navigate({ to: "/management/access-denied" });
        return;
      }
      await logFn({ data: { email, success: true, userId: data.user.id } });
      if (role === "super_admin") navigate({ to: "/management/super-admin" });
      else if (role === "admin") navigate({ to: "/management/admin" });
      else navigate({ to: "/management/support" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="h-14 w-14 rounded-2xl bg-amber-500/20 grid place-items-center">
            <Shield className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold">CSSE Management</h1>
          <p className="text-sm text-slate-400 text-center">Authorised staff only</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="m-email" className="text-slate-300">Email</Label>
            <Input id="m-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-slate-800 border-slate-700 text-slate-100" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-pw" className="text-slate-300">Password</Label>
            <Input id="m-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="bg-slate-800 border-slate-700 text-slate-100" />
          </div>
          <Button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="text-[11px] text-slate-500 text-center">
          Unauthorised access attempts are logged.
        </p>
        <Link to="/" className="block text-center text-xs text-slate-500 hover:text-slate-300">← Back to site</Link>
      </div>
    </div>
  );
}
