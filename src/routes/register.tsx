import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { checkAuthRateLimit } from "@/lib/rate-limit.functions";
import { validateRealEmail, normalizeEmail } from "@/lib/email-validation";
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
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover",
      },
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
    links: [{ rel: "canonical", href: "https://cssebets.com/register" }],
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

const STEPS = ["Name", "Contact", "Password", "Referral"] as const;

function StepProgress({ step }: { step: number }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={label} className="flex-1">
              <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className="h-full rounded-full bg-[var(--color-neon)] transition-all duration-300"
                  style={{ width: done ? "100%" : active ? "50%" : "0%" }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
        Step {step + 1} of {STEPS.length}
      </p>
    </div>
  );
}

function RegisterPage() {
  const [step, setStep] = useState(0);
  const [channel, setChannel] = useState<Channel>("email");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [referralInput, setReferralInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isGuestUpgrade, setIsGuestUpgrade] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    captureReferralFromUrl();
    const stored = getStoredReferralCode();
    if (stored) setReferralInput(stored);
    void supabase.auth.getSession().then(({ data }) => {
      setIsGuestUpgrade(Boolean(data.session?.user?.is_anonymous));
    });
  }, []);

  function resolveReferralCode(): string | null {
    const typed = normalizeReferralCode(referralInput);
    if (typed) return typed;
    const stored = getStoredReferralCode();
    return stored ? normalizeReferralCode(stored) : null;
  }

  async function signUpWithGoogle() {
    try {
      const refCode = resolveReferralCode();
      const redirect = new URL(window.location.origin);
      if (refCode) redirect.searchParams.set("ref", refCode);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: redirect.toString(),
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in unavailable");
    }
  }

  function next(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (step === 0) {
        if (!displayName.trim()) throw new Error("Please enter a display name");
        if (displayName.trim().length > 40)
          throw new Error("Display name must be 40 characters or fewer");
      }
      if (step === 1) {
        if (channel === "email") {
          const emailError = validateRealEmail(email);
          if (emailError) throw new Error(emailError);
        } else if (!isValidPhone(normalizePhone(phone))) {
          throw new Error("Phone must be in international format, e.g. +60123456789");
        }
      }
      if (step === 2) {
        if (password.length < 8) throw new Error("Password must be at least 8 characters");
        if (password !== confirm) throw new Error("Passwords do not match");
      }
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (referralInput.trim() && !normalizeReferralCode(referralInput)) {
        throw new Error("Referral code must be 4–12 letters/numbers");
      }
      const refCode = resolveReferralCode();
      const isEmail = channel === "email";
      const p = normalizePhone(phone);
      if (isEmail) {
        const emailError = validateRealEmail(email);
        if (emailError) throw new Error(emailError);
      }
      const authEmail = isEmail ? normalizeEmail(email) : phoneToSyntheticEmail(p);

      await checkAuthRateLimit({ data: isEmail ? { email: authEmail } : { phone: p } });

      const {
        data: { session: existing },
      } = await supabase.auth.getSession();
      const upgradingGuest = Boolean(existing?.user?.is_anonymous);

      const meta = {
        display_name: displayName.trim(),
        ...(isEmail ? {} : { phone_number: p }),
        ...(refCode ? { referral_code: refCode } : {}),
      };

      if (upgradingGuest) {
        const { error: upErr } = await supabase.auth.updateUser({
          email: authEmail,
          password,
          data: meta,
        });
        if (upErr) throw upErr;

        const { finalizeGuestUpgrade } = await import("@/lib/guest-upgrade.functions");
        await finalizeGuestUpgrade({ data: { displayName: displayName.trim() } });

        clearStoredReferralCode();
        toast.success("Demo account upgraded. Waiting for admin approval.");
        navigate({ to: "/dashboard" });
        return;
      }

      const { data: signUp, error } = await supabase.auth.signUp({
        email: authEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: meta,
        },
      });
      if (error) throw error;
      clearStoredReferralCode();
      if (signUp?.user?.id) {
        try {
          await notifyAdminsOfRegistration({ data: { newUserId: signUp.user.id } });
        } catch {}
      }
      if (isEmail && !signUp?.session) {
        toast.success(
          "Check your inbox — confirm your email address to activate your account.",
        );
        navigate({ to: "/auth" });
        return;
      }
      toast.success("Account created. Waiting for admin approval.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const copy = [
    {
      title: "How would you like to be addressed by the community?",
      subtitle: "This is the name shown on leaderboards and trade tapes.",
    },
    {
      title: channel === "email" ? "What's your email address?" : "What's your phone number?",
      subtitle:
        channel === "email"
          ? "Use a real address — we'll send a confirmation link you need to click."
          : "We use this to sign you in and confirm your account.",
    },
    {
      title: "Please enter a password.",
      subtitle: "At least 8 characters. Make it something only you would guess.",
    },
    {
      title: "Do you have a referral code?",
      subtitle: "",
    },
  ][step];

  return (
    <AuthShell
      topSlot={<StepProgress step={step} />}
      eyebrow={isGuestUpgrade ? "Upgrade demo account" : "Create account"}
      title={copy.title}
      subtitle={
        isGuestUpgrade && step === 0
          ? "Keep this session — we'll convert your practice account and wait for staff approval before real points."
          : copy.subtitle
      }
      footer={
        <p className="text-sm text-[var(--color-ink-muted)]">
          Already have an account?{" "}
          <Link to="/auth" className="font-medium text-[var(--color-neon)] hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={step === STEPS.length - 1 ? finish : next} className="flex h-full flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {step === 0 && <BonusOfferBanner />}
          {step === 0 && (
            <AuthField label="Name" htmlFor="name">
              <input
                id="name"
                autoFocus
                required
                maxLength={40}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. NightTrader"
                className={authInputClass}
              />
            </AuthField>
          )}

          {step === 1 && (
            <>
              <button
                type="button"
                onClick={signUpWithGoogle}
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

              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-[var(--color-surface-border)]" />
                <span className="text-xs text-[var(--color-ink-muted)]">or</span>
                <span className="h-px flex-1 bg-[var(--color-surface-border)]" />
              </div>

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
                    autoFocus
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
            </>
          )}

          {step === 2 && (
            <div className="grid gap-4">
              <AuthField label="Password" htmlFor="password">
                <input
                  id="password"
                  type="password"
                  required
                  autoFocus
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={authInputClass}
                />
              </AuthField>
              <AuthField label="Confirm password" htmlFor="confirm">
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
          )}

          {step === 3 && (
            <AuthField label="Referral code" htmlFor="referral" hint="Leave blank if you don't have one.">
              <input
                id="referral"
                autoFocus
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
          )}
        </div>

        <div className="shrink-0 space-y-3 pt-4">
          <AuthSubmit loading={loading}>
            {step === STEPS.length - 1
              ? loading
                ? "Creating account…"
                : "Create account"
              : "Continue"}
          </AuthSubmit>

          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="h-10 w-full rounded-lg text-[13px] font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
            >
              ← Back
            </button>
          )}
        </div>
      </form>
    </AuthShell>
  );
}
