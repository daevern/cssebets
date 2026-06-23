import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkAuthRateLimit } from "@/lib/rate-limit.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CsseAppIcon, CsseWordmark } from "@/components/brand/CsseMark";
import { ArrowRight, Radio, ShieldCheck, Trophy, Users } from "lucide-react";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — CSSEBets" },
      {
        name: "description",
        content:
          "Join the CSSEBets matchday console. Pick a side, climb the leaderboard, get paid for winning calls.",
      },
    ],
  }),
  component: RegisterPage,
});

type Channel = "email" | "phone";

function normalizePhone(input: string) {
  return input.trim().replace(/\s+/g, "");
}
function isValidPhone(p: string) {
  if (!p.startsWith("+")) return false;
  const digits = p.slice(1).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export function phoneToSyntheticEmail(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@phone.cssebets.local`;
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const map: Record<typeof pos, string> = {
    tl: "top-0 left-0 border-t border-l",
    tr: "top-0 right-0 border-t border-r",
    bl: "bottom-0 left-0 border-b border-l",
    br: "bottom-0 right-0 border-b border-r",
  };
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-3 w-3 border-[var(--color-neon)] ${map[pos]}`}
    />
  );
}

function RegisterPage() {
  const [channel, setChannel] = useState<Channel>("email");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      if (password !== confirm) throw new Error("Passwords do not match");
      await checkAuthRateLimit({ data: { email } });
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { display_name: displayName || email.split("@")[0] },
        },
      });
      if (error) throw error;
      toast.success("Account created. Waiting for admin approval.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handlePhone(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const p = normalizePhone(phone);
      if (!isValidPhone(p))
        throw new Error("Phone must be in international format, e.g. +60123456789");
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      if (password !== confirm) throw new Error("Passwords do not match");
      const syntheticEmail = phoneToSyntheticEmail(p);
      await checkAuthRateLimit({ data: { phone: p } });
      const { error } = await supabase.auth.signUp({
        email: syntheticEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            display_name: displayName || p,
            phone_number: p,
          },
        },
      });
      if (error) throw error;
      toast.success("Account created. Waiting for admin approval.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const submit = channel === "email" ? handleEmail : handlePhone;
  const inputClass =
    "rounded-none border-[var(--color-surface-border)] bg-[#070D0A] text-[var(--color-ink)] focus-visible:border-[var(--color-neon)] focus-visible:ring-0";

  return (
    <div className="relative min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(34,224,107,0.12), transparent 60%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6 md:py-10">
        <Link to="/" className="mb-6 flex items-center justify-center gap-3">
          <CsseAppIcon size={40} />
          <CsseWordmark size={20} />
        </Link>

        <div className="mb-4 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
          <Radio className="h-3 w-3" />
          Matchday Console · New Roster
        </div>

        <article className="relative overflow-hidden border border-[var(--color-neon)]/25 bg-[var(--color-surface-2)]">
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />

          <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-5 py-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-neon)]" />
              Session · 02
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
              CSSEBets
            </span>
          </div>

          <div className="space-y-5 px-5 py-6">
            <div>
              <h1 className="font-display text-[28px] font-bold leading-[1.05] tracking-tight md:text-[32px]">
                Claim your <span className="text-[var(--color-neon)]">seat.</span>
                <br />
                <span className="text-[var(--color-ink-muted)]">Make the call.</span>
              </h1>
              <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
                Admin approval before your first pick.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-0 border border-[var(--color-surface-border)] bg-[#070D0A] p-0.5">
              {(["email", "phone"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`py-2 text-[10px] font-bold uppercase tracking-[0.28em] transition-colors ${
                    channel === c
                      ? "bg-[var(--color-neon)] text-[#04140A]"
                      : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                  }`}
                >
                  {c === "email" ? "Email" : "Phone"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">
              <Field label="Display name" htmlFor="name">
                <Input
                  id="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Shown on the leaderboard"
                  className={inputClass}
                />
              </Field>

              {channel === "email" ? (
                <Field label="Email" htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              ) : (
                <Field
                  label="Phone"
                  htmlFor="phone"
                  hint="International format. Sign in with this number + password."
                >
                  <Input
                    id="phone"
                    type="tel"
                    required
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+60123456789"
                    className={inputClass}
                  />
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Password" htmlFor="password">
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Confirm" htmlFor="confirm">
                  <Input
                    id="confirm"
                    type="password"
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative flex w-full items-center justify-center gap-2 border border-[var(--color-neon)] bg-[var(--color-neon)] px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.28em] text-[#04140A] transition-all hover:shadow-[0_0_24px_rgba(34,224,107,0.45)] disabled:opacity-60"
              >
                {loading ? "Creating account…" : "Create account"}
                {!loading && (
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                )}
              </button>
            </form>

            {/* Brand pillars — stencil style */}
            <div className="grid grid-cols-3 gap-0 border border-[var(--color-surface-border)] bg-[#070D0A]">
              {[
                { icon: ShieldCheck, label: "Vetted roster" },
                { icon: Trophy, label: "Real payouts" },
                { icon: Users, label: "Live console" },
              ].map(({ icon: Icon, label }, i) => (
                <div
                  key={label}
                  className={`flex flex-col items-center gap-1.5 py-3 ${
                    i < 2 ? "border-r border-[var(--color-surface-border)]" : ""
                  }`}
                >
                  <Icon className="h-4 w-4 text-[var(--color-neon)]" />
                  <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--color-surface-border)]" />
              <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
                Already a member
              </span>
              <span className="h-px flex-1 bg-[var(--color-surface-border)]" />
            </div>

            <Link
              to="/auth"
              className="flex w-full items-center justify-center gap-2 border border-[var(--color-surface-border)] bg-transparent px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.28em] text-[var(--color-ink)] transition-colors hover:border-[var(--color-neon)] hover:text-[var(--color-neon)]"
            >
              Sign in instead
            </Link>
          </div>

          <div className="flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)] px-5 py-2.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
              FIFA World Cup
            </span>
            <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
              Secure · Live
            </span>
          </div>
        </article>

        <p className="mt-6 text-center text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
          Competitive Strategy Starts Everywhere
        </p>
        <div className="mt-3 text-center text-[11px] text-[var(--color-ink-muted)]">
          <Link to="/" className="hover:text-[var(--color-neon)]">
            ← Back home
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]"
      >
        {label}
      </Label>
      {children}
      {hint && (
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}
