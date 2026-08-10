import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkAuthRateLimit } from "@/lib/rate-limit.functions";
import { notifyAdminsOfRegistration } from "@/lib/notifications.functions";
import {
  captureReferralFromUrl,
  getStoredReferralCode,
  clearStoredReferralCode,
} from "@/lib/referral-code";
import { toast } from "sonner";
import {
  AuthShell,
  AuthField,
  AuthSegmented,
  AuthSubmit,
  authInputClass,
} from "@/components/auth/AuthShell";

const REFERRAL_CODE_RE = /^[A-Z0-9]{4,12}$/;

function normalizeReferralCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  if (!code) return null;
  return REFERRAL_CODE_RE.test(code) ? code : null;
}

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — CSSEBets" },
      {
        name: "description",
        content:
          "Create a CSSEBets account to trade prediction markets on football, F1 and UFC and play the provably fair arcade.",
      },
      { property: "og:title", content: "Create account — CSSEBets" },
      {
        property: "og:description",
        content: "Trade the outcome. Play the odds. Join CSSEBets in under a minute.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

function RegisterPage() {
  const [channel, setChannel] = useState<Channel>("email");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [referralInput, setReferralInput] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    captureReferralFromUrl();
    const stored = getStoredReferralCode();
    if (stored) setReferralInput(stored);
  }, []);

  function resolveReferralCode(): string | null {
    const typed = normalizeReferralCode(referralInput);
    if (typed) return typed;
    const stored = getStoredReferralCode();
    return stored ? normalizeReferralCode(stored) : null;
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      if (password !== confirm) throw new Error("Passwords do not match");
      if (referralInput.trim() && !normalizeReferralCode(referralInput)) {
        throw new Error("Referral code must be 4–12 letters/numbers");
      }
      await checkAuthRateLimit({ data: { email } });
      const refCode = resolveReferralCode();
      const { data: signUp, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            display_name: displayName || email.split("@")[0],
            ...(refCode ? { referral_code: refCode } : {}),
          },
        },
      });
      if (error) throw error;
      clearStoredReferralCode();
      if (signUp?.user?.id) {
        try { await notifyAdminsOfRegistration({ data: { newUserId: signUp.user.id } }); } catch {}
      }
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
      if (referralInput.trim() && !normalizeReferralCode(referralInput)) {
        throw new Error("Referral code must be 4–12 letters/numbers");
      }
      const syntheticEmail = phoneToSyntheticEmail(p);
      await checkAuthRateLimit({ data: { phone: p } });
      const refCode = resolveReferralCode();
      const { data: signUp, error } = await supabase.auth.signUp({
        email: syntheticEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            display_name: displayName || p,
            phone_number: p,
            ...(refCode ? { referral_code: refCode } : {}),
          },
        },
      });
      if (error) throw error;
      clearStoredReferralCode();
      if (signUp?.user?.id) {
        try { await notifyAdminsOfRegistration({ data: { newUserId: signUp.user.id } }); } catch {}
      }
      toast.success("Account created. Waiting for admin approval.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const submit = channel === "email" ? handleEmail : handlePhone;

  return (
    <AuthShell
      title="Create your account"
      subtitle="Takes under a minute. Accounts are reviewed before your first trade."
      footer={
        <p className="text-sm text-[var(--color-ink-muted)]">
          Already have an account?{" "}
          <Link to="/auth" className="font-medium text-[var(--color-neon)] hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <AuthSegmented
          value={channel}
          onChange={setChannel}
          options={[
            { value: "email", label: "Email" },
            { value: "phone", label: "Phone" },
          ]}
        />

        <AuthField label="Display name" htmlFor="name">
          <input
            id="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Shown on the leaderboard"
            className={authInputClass}
          />
        </AuthField>

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
          <AuthField
            label="Phone"
            htmlFor="phone"
            hint="You'll sign in with this number and password."
          >
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

        <div className="grid grid-cols-2 gap-3">
          <AuthField label="Password" htmlFor="password">
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={authInputClass}
            />
          </AuthField>
          <AuthField label="Confirm" htmlFor="confirm">
            <input
              id="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={authInputClass}
            />
          </AuthField>
        </div>

        <AuthField
          label="Referral code"
          htmlFor="referral"
          hint="Optional — you and your friend both get rewarded."
        >
          <input
            id="referral"
            value={referralInput}
            onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
            placeholder="e.g. 9W928VQ"
            maxLength={12}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className={authInputClass}
          />
        </AuthField>

        <AuthSubmit loading={loading}>
          {loading ? "Creating account…" : "Create account"}
        </AuthSubmit>
      </form>

      <div className="mt-6 text-center">
        <Link to="/" className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
          ← Back to home
        </Link>
      </div>
    </AuthShell>
  );
}
