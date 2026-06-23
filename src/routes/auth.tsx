import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkAuthRateLimit } from "@/lib/rate-limit.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CsseAppIcon, CsseWordmark, BrandText } from "@/components/brand/CsseMark";
import { ArrowRight, Radio } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — CSSEBets" },
      {
        name: "description",
        content:
          "Sign in to CSSEBets to make your picks, track your standing, and call the next matchday.",
      },
    ],
  }),
  component: LoginPage,
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

/* Tick-mark corners — identical to dashboard fixture card. */
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

function LoginPage() {
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (channel === "email") {
        await checkAuthRateLimit({ data: { email } });
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const p = normalizePhone(phone);
        if (!isValidPhone(p))
          throw new Error("Phone must be in international format, e.g. +60123456789");
        await checkAuthRateLimit({ data: { phone: p } });
        const syntheticEmail = `${p.replace(/\D/g, "")}@phone.cssebets.local`;
        const { error } = await supabase.auth.signInWithPassword({
          email: syntheticEmail,
          password,
        });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      {/* Scoreboard scanline grain — same as dashboard */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
        }}
      />
      {/* Neon glow wash */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(34,224,107,0.12), transparent 60%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6 md:py-10">
        {/* Brand lockup */}
        <Link to="/" className="mb-6 flex items-center justify-center gap-3">
          <CsseAppIcon size={40} />
          <CsseWordmark size={20} />
        </Link>

        {/* Matchday tag — dashboard tone */}
        <div className="mb-4 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
          <Radio className="h-3 w-3" />
          Matchday Console · Sign in
        </div>

        {/* Scoreboard auth card — sharp corners, tick marks, dashed divider */}
        <article className="relative overflow-hidden border border-[var(--color-neon)]/25 bg-[var(--color-surface-2)]">
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />

          {/* Stencil header band */}
          <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-5 py-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-neon)]" />
              Session · 01
            </span>
            <span className="text-[10px] font-bold tracking-[0.04em] text-[var(--color-ink-muted)]">
              <BrandText />
            </span>
          </div>

          <div className="space-y-5 px-5 py-6">
            {/* Editorial greeting — mirrors dashboard "Hello, X." */}
            <div>
              <h1 className="font-display text-[28px] font-bold leading-[1.05] tracking-tight md:text-[32px]">
                Welcome <span className="text-[var(--color-neon)]">back.</span>
                <br />
                <span className="text-[var(--color-ink-muted)]">Take your side.</span>
              </h1>
            </div>

            {/* Channel switcher — sharp, stencil */}
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

            <form onSubmit={onSubmit} className="space-y-4">
              {channel === "email" ? (
                <FieldBlock label="Email" htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-none border-[var(--color-surface-border)] bg-[#070D0A] text-[var(--color-ink)] focus-visible:border-[var(--color-neon)] focus-visible:ring-0"
                  />
                </FieldBlock>
              ) : (
                <FieldBlock label="Phone" htmlFor="phone" hint="International, e.g. +60123456789">
                  <Input
                    id="phone"
                    type="tel"
                    required
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+60123456789"
                    className="rounded-none border-[var(--color-surface-border)] bg-[#070D0A] text-[var(--color-ink)] focus-visible:border-[var(--color-neon)] focus-visible:ring-0"
                  />
                </FieldBlock>
              )}

              <FieldBlock label="Password" htmlFor="password">
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-none border-[var(--color-surface-border)] bg-[#070D0A] text-[var(--color-ink)] focus-visible:border-[var(--color-neon)] focus-visible:ring-0"
                />
              </FieldBlock>

              <button
                type="submit"
                disabled={loading}
                className="group relative flex w-full items-center justify-center gap-2 border border-[var(--color-neon)] bg-[var(--color-neon)] px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.28em] text-[#04140A] transition-all hover:shadow-[0_0_24px_rgba(34,224,107,0.45)] disabled:opacity-60"
              >
                {loading ? "Signing in…" : "Sign in"}
                {!loading && (
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                )}
              </button>
            </form>

            {/* Divider — uppercase stencil */}
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--color-surface-border)]" />
              <span className="flex items-center gap-1.5 text-[9px] font-bold tracking-[0.04em] text-[var(--color-ink-muted)]">
                <span className="uppercase tracking-[0.32em]">New to</span> <BrandText />
              </span>
              <span className="h-px flex-1 bg-[var(--color-surface-border)]" />
            </div>

            <Link
              to="/register"
              className="flex w-full items-center justify-center gap-2 border border-[var(--color-surface-border)] bg-transparent px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.28em] text-[var(--color-ink)] transition-colors hover:border-[var(--color-neon)] hover:text-[var(--color-neon)]"
            >
              Create account
            </Link>
          </div>

          {/* Bottom strip — competition tag (mirrors dashboard footers) */}
          <div className="flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)] px-5 py-2.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
              FIFA World Cup
            </span>
            <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
              Secure · Live
            </span>
          </div>
        </article>

        {/* Footer */}
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

function FieldBlock({
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
