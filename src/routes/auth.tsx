import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkAuthRateLimit } from "@/lib/rate-limit.functions";
import { toast } from "sonner";
import {
  AuthShell,
  AuthField,
  AuthSegmented,
  AuthSubmit,
  authInputClass,
} from "@/components/auth/AuthShell";

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
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Your balance, positions and open markets are waiting."
      footer={
        <p className="text-sm text-[var(--color-ink-muted)]">
          New to CSSEBets?{" "}
          <Link to="/register" className="font-medium text-[var(--color-neon)] hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
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

        <AuthSubmit loading={loading}>{loading ? "Signing in…" : "Sign in"}</AuthSubmit>
      </form>

      <div className="mt-6 text-center">
        <Link to="/" className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
          ← Back to home
        </Link>
      </div>
    </AuthShell>
  );
}
