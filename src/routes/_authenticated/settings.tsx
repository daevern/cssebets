import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Loader2, ChevronRight, Check, X, LogOut } from "lucide-react";
import { toast } from "sonner";
import { BadgeGrid } from "@/components/trust/BadgeGrid";
import { ReferralPanel } from "@/components/engagement/ReferralPanel";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { AvatarUpload } from "@/components/profile/AvatarUpload";

export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Profile & settings — CSSEBets" },
      {
        name: "description",
        content: "Manage your CSSEBets profile photo, display name, contact details and notifications.",
      },
      { property: "og:title", content: "Profile & settings — CSSEBets" },
      {
        property: "og:description",
        content: "Manage your CSSEBets profile photo, display name, contact details and notifications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
        .select("display_name, phone_number, public_reference, auth_provider, avatar_url")
        .eq("id", uid!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!uid,
  });

  const currentEmail = isSyntheticPhoneEmail(user?.email) ? "" : (user?.email ?? "");
  const currentPhone = profile.data?.phone_number ?? "";
  const currentName = profile.data?.display_name ?? "";

  const [name, setName] = useState(currentName);
  const [email, setEmail] = useState(currentEmail);
  const [phone, setPhone] = useState(currentPhone);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { setName(currentName); }, [currentName]);
  useEffect(() => { if (currentEmail) setEmail(currentEmail); }, [currentEmail]);
  useEffect(() => { setPhone(currentPhone); }, [currentPhone]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["my-profile-settings", uid] });
    qc.invalidateQueries({ queryKey: ["my-comment-status"] });
  }

  async function saveName() {
    const v = name.trim();
    if (v.length < 2) return toast.error("Display name must be at least 2 characters.");
    if (v.length > 32) return toast.error("Keep your display name under 32 characters.");
    setSaving("name");
    try {
      const { error } = await supabase.from("profiles").update({ display_name: v }).eq("id", uid!);
      if (error) throw error;
      toast.success("Display name updated.");
      setOpen(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(null); }
  }

  async function saveEmail() {
    if (!email || !email.includes("@")) return toast.error("Enter a valid email address.");
    setSaving("email");
    try {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      toast.success("Check your inbox to confirm the new address.");
      setOpen(null);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(null); }
  }

  async function savePhone() {
    const p = phone.trim();
    if (p && !isValidPhone(p)) return toast.error("Use international format, e.g. +60123456789.");
    setSaving("phone");
    try {
      const { error } = await supabase.from("profiles").update({ phone_number: p || null }).eq("id", uid!);
      if (error) throw error;
      toast.success("Phone number updated.");
      setOpen(null);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(null); }
  }

  async function savePassword() {
    if (pw1.length < 8) return toast.error("Password must be at least 8 characters.");
    if (pw1 !== pw2) return toast.error("Passwords do not match.");
    setSaving("password");
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      toast.success("Password updated.");
      setPw1(""); setPw2(""); setOpen(null);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(null); }
  }

  async function signOut() {
    setSigningOut(true);
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
      <h1 className="text-[26px] font-semibold tracking-tight text-[var(--color-ink)]">Profile</h1>
      <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
        How you appear across markets, comments and leaderboards.
      </p>

      <section className="mt-6 rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] p-5">
        {profile.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--color-ink-muted)]" />
        ) : (
          <AvatarUpload
            userId={uid!}
            displayName={currentName || "Member"}
            avatarPath={profile.data?.avatar_url ?? null}
            onChanged={refresh}
          />
        )}
      </section>

      <SectionLabel>Account</SectionLabel>
      <div className="overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)]">
        <Row
          label="Display name"
          value={currentName || "Not set"}
          expanded={open === "name"}
          onToggle={() => setOpen(open === "name" ? null : "name")}
        >
          <Field label="Display name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} className="bg-[#070D0A] border-[var(--color-surface-border)] text-base" />
          </Field>
          <RowActions onCancel={() => setOpen(null)} onSave={saveName} loading={saving === "name"} disabled={name.trim() === currentName} />
        </Row>

        <Row
          label="Email"
          value={currentEmail || "Not set"}
          expanded={open === "email"}
          onToggle={() => setOpen(open === "email" ? null : "email")}
        >
          <Field label="Email address" hint="You'll need to confirm the new address from your inbox.">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="bg-[#070D0A] border-[var(--color-surface-border)] text-base" />
          </Field>
          <RowActions onCancel={() => setOpen(null)} onSave={saveEmail} loading={saving === "email"} disabled={email === currentEmail} />
        </Row>

        <Row
          label="Phone"
          value={currentPhone || "Not set"}
          expanded={open === "phone"}
          onToggle={() => setOpen(open === "phone" ? null : "phone")}
        >
          <Field label="Phone number" hint="International format, e.g. +60123456789.">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60123456789" className="bg-[#070D0A] border-[var(--color-surface-border)] text-base" />
          </Field>
          <RowActions onCancel={() => setOpen(null)} onSave={savePhone} loading={saving === "phone"} disabled={phone === currentPhone} />
        </Row>

        <Row
          label="Password"
          value="••••••••"
          expanded={open === "password"}
          onToggle={() => setOpen(open === "password" ? null : "password")}
        >
          <Field label="New password">
            <Input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} className="bg-[#070D0A] border-[var(--color-surface-border)] text-base" />
          </Field>
          <Field label="Confirm password">
            <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="bg-[#070D0A] border-[var(--color-surface-border)] text-base" />
          </Field>
          <RowActions onCancel={() => setOpen(null)} onSave={savePassword} loading={saving === "password"} disabled={!pw1 || !pw2} />
        </Row>

        <StaticRow label="Reference ID" value={profile.data?.public_reference ?? "—"} mono />
        <StaticRow label="Sign-in method" value={profile.data?.auth_provider ?? "—"} capitalize />
      </div>

      <SectionLabel>Invite</SectionLabel>
      <ReferralPanel />

      <SectionLabel>Notifications</SectionLabel>
      <NotificationSettings />

      <SectionLabel>Trust</SectionLabel>
      <BadgeGrid />

      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-5 py-4 text-[13px] font-semibold text-[var(--color-ink)] transition-colors hover:text-red-400 disabled:opacity-40"
      >
        {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        Sign out
      </button>
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-8 px-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
      {children}
    </h2>
  );
}

function Row({
  label,
  value,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--color-surface-border)] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="text-[14px] font-medium text-[var(--color-ink)]">{label}</span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] text-[var(--color-ink-muted)]">{value}</span>
          <ChevronRight className={`h-4 w-4 shrink-0 text-[var(--color-ink-muted)] transition-transform ${expanded ? "rotate-90" : ""}`} />
        </span>
      </button>
      {expanded && <div className="space-y-4 border-t border-[var(--color-surface-border)] px-5 py-4">{children}</div>}
    </div>
  );
}

function StaticRow({ label, value, mono, capitalize }: { label: string; value: string; mono?: boolean; capitalize?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-surface-border)] px-5 py-4 last:border-b-0">
      <span className="text-[14px] font-medium text-[var(--color-ink)]">{label}</span>
      <span className={`truncate text-[13px] text-[var(--color-ink-muted)] ${mono ? "font-mono text-[var(--color-neon)]" : ""} ${capitalize ? "capitalize" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">{label}</div>
      {children}
      {hint && <p className="text-[11px] text-[var(--color-ink-muted)]">{hint}</p>}
    </div>
  );
}

function RowActions({
  onCancel,
  onSave,
  loading,
  disabled,
}: {
  onCancel: () => void;
  onSave: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[12px] font-semibold text-[var(--color-ink-muted)]"
      >
        <X className="h-3.5 w-3.5" /> Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={loading || disabled}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-neon)] px-5 py-2.5 text-[12px] font-bold text-black disabled:opacity-40"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        Save
      </button>
    </div>
  );
}
