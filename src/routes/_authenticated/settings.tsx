import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User as UserIcon, Mail, Phone, KeyRound, Save, LogOut } from "lucide-react";
import { toast } from "sonner";
import { PageShell, StencilPanel } from "@/components/ui/page-shell";
import { BadgeGrid } from "@/components/trust/BadgeGrid";
import { ReferralPanel } from "@/components/engagement/ReferralPanel";


export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  head: () => ({ meta: [{ title: "Settings — cssebets" }] }),
  component: SettingsPage,
});

function isValidPhone(p: string) {
  if (!p.startsWith("+")) return false;
  const digits = p.slice(1).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function isSyntheticPhoneEmail(email: string | undefined | null) {
  return !!email && email.endsWith("@phone.cssebets.local");
}

function SettingsPage() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [signingOut, setSigningOut] = useState(false);

  const profile = useQuery({
    queryKey: ["my-profile-settings", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, phone_number, public_reference, auth_provider")
        .eq("id", uid!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!uid,
  });

  const currentEmail = isSyntheticPhoneEmail(user?.email) ? "" : (user?.email ?? "");
  const currentPhone = profile.data?.phone_number ?? "";

  const [email, setEmail] = useState(currentEmail);
  const [phone, setPhone] = useState(currentPhone);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => { if (currentEmail) setEmail(currentEmail); }, [currentEmail]);
  useEffect(() => { if (currentPhone) setPhone(currentPhone); }, [currentPhone]);

  async function saveEmail() {
    if (!email || !email.includes("@")) { toast.error("Enter a valid email address"); return; }
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      toast.success("Email update requested. Check your inbox to confirm.");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingEmail(false); }
  }

  async function savePhone() {
    const p = phone.trim();
    if (p && !isValidPhone(p)) { toast.error("Phone must be in international format, e.g. +60123456789"); return; }
    if (!uid) return;
    setSavingPhone(true);
    try {
      const { error } = await supabase.from("profiles").update({ phone_number: p || null }).eq("id", uid);
      if (error) throw error;
      toast.success("Phone number updated.");
      qc.invalidateQueries({ queryKey: ["my-profile-settings", uid] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingPhone(false); }
  }
  async function savePassword() {
    if (pw1.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (pw1 !== pw2) { toast.error("Passwords do not match"); return; }
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      toast.success("Password updated.");
      setPw1(""); setPw2("");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingPw(false); }
  }

  async function signOut() {
    setSigningOut(true);
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }



  return (
    <PageShell kicker="Locker Room · Profile" title="Your" titleAccent="kit.">
      <StencilPanel kicker={<><UserIcon className="h-3 w-3" /> Profile</>} accent>
        {profile.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--color-ink-muted)]" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <Field label="Display name" value={profile.data?.display_name ?? "—"} />
            <Field label="Reference ID" value={profile.data?.public_reference ?? "—"} mono />
            <Field label="Sign-in method" value={profile.data?.auth_provider ?? "—"} capitalize />
          </div>
        )}
      </StencilPanel>

      <ReferralPanel />



      <StencilPanel kicker={<><Mail className="h-3 w-3" /> Email</>}>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Email address</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="bg-[#070D0A] border-[var(--color-surface-border)]"
          />
          <p className="text-[11px] text-[var(--color-ink-muted)]">
            Changing email requires confirming the new address from your inbox.
          </p>
        </div>
        <SaveBtn onClick={saveEmail} disabled={savingEmail || email === currentEmail} loading={savingEmail} label="Update email" />
      </StencilPanel>

      <StencilPanel kicker={<><Phone className="h-3 w-3" /> Phone</>}>
        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Phone number</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+60123456789"
            className="bg-[#070D0A] border-[var(--color-surface-border)]"
          />
          <p className="text-[11px] text-[var(--color-ink-muted)]">International format, e.g. +60123456789.</p>
        </div>
        <SaveBtn onClick={savePhone} disabled={savingPhone || phone === currentPhone} loading={savingPhone} label="Update phone" />
      </StencilPanel>

      <StencilPanel kicker={<><LogOut className="h-3 w-3" /> Session</>}>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Sign out of cssebets on this device.
        </p>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[var(--color-ink)] transition-all hover:border-[var(--color-neon)]/40 hover:text-[var(--color-neon)] active:scale-[0.99] disabled:opacity-40"
        >
          {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Sign out
        </button>
      </StencilPanel>
      <BadgeGrid />
    </PageShell>
  );
}

function Field({ label, value, mono, capitalize }: { label: string; value: string; mono?: boolean; capitalize?: boolean }) {
  return (
    <div className="border border-[var(--color-surface-border)] bg-[#070D0A] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">{label}</div>
      <div className={`mt-1 font-semibold ${mono ? "font-mono text-[var(--color-neon)]" : ""} ${capitalize ? "capitalize" : ""}`}>{value}</div>
    </div>
  );
}

function SaveBtn({ onClick, disabled, loading, label }: { onClick: () => void; disabled?: boolean; loading?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-neon)] px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] text-black shadow-[0_0_24px_var(--color-neon-glow)] transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-40 disabled:shadow-none"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {label}
    </button>
  );
}
