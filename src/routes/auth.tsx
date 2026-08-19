import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { checkAuthRateLimit } from "@/lib/rate-limit.functions";
import { validateRealEmail, normalizeEmail } from "@/lib/email-validation";
import { toast } from "sonner";
import {
  AuthShell,
  AuthField,
  AuthSegmented,
  AuthSubmit,
  authInputClass,
} from "@/components/auth/AuthShell";
import { CsseWordmark } from "@/components/brand/CsseMark";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — CSSEBets" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      {

        name: "description",
        content:
          "Sign in to CSSEBets to trade prediction markets on football, F1 and UFC, and play the provably fair arcade.",
      },
      { property: "og:title", content: "Sign in — CSSEBets" },
      {
        property: "og:description",
        content: "Trade the outcome. Play the odds. Sign in to your CSSEBets account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/auth" }],
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

function LoginPage() {
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function signInWithGoogle() {
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in unavailable");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (channel === "email") {
        const emailError = validateRealEmail(email);
        if (emailError) throw new Error(emailError);
        const authEmail = normalizeEmail(email);
        await checkAuthRateLimit({ data: { email: authEmail } });
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password,
        });
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
    <AuthShell
      title="Sign in"
      footer={
        <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-sm text-[var(--color-ink-muted)]">
          <span className="inline-flex items-center gap-1.5">
            New to
            <CsseWordmark size={15} />
            <span className="-ml-1">?</span>
          </span>
          <Link to="/register" className="font-medium text-[var(--color-neon)] hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="flex h-full flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          <AuthSegmented
            value={channel}
            onChange={setChannel}
            options={[
              { value: "email", label: "Email" },
              { value: "phone", label: "Phone" },
            ]}
          />

          {channel === "email" ? (
            <AuthField label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={authInputClass}
              />
            </AuthField>
          ) : (
            <AuthField label="Phone" htmlFor="phone" hint="International format, e.g. +60123456789">
              <input
                id="phone"
                type="tel"
                required
                inputMode="tel"
                placeholder="+60123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={authInputClass}
              />
            </AuthField>
          )}

          <AuthField label="Password" htmlFor="password">
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={authInputClass}
            />
          </AuthField>
        </div>

        <div className="shrink-0 space-y-3 pt-4">
          <AuthSubmit loading={loading}>{loading ? "Signing in…" : "Sign in"}</AuthSubmit>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--color-surface-border)]" />
            <span className="text-xs text-[var(--color-ink-muted)]">or</span>
            <span className="h-px flex-1 bg-[var(--color-surface-border)]" />
          </div>

          <button
            type="button"
            onClick={signInWithGoogle}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] text-[15px] font-medium text-[var(--color-ink)] transition-colors hover:border-[var(--color-neon)]"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
              />
              <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
              <path
                fill="#EA4335"
                d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="text-center">
            <Link to="/" className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
              ← Back to home
            </Link>
          </div>
        </div>
      </form>
    </AuthShell>
  );
}
