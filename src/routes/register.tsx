import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkAuthRateLimit } from "@/lib/rate-limit.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CsseAppIcon, CsseWordmark } from "@/components/brand/CsseMark";
import { ChevronRight, ShieldCheck, Trophy, Users } from "lucide-react";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — CSSEBets" },
      {
        name: "description",
        content:
          "Join the CSSEBets matchday console. Make your picks, climb the leaderboard, get paid out for winning calls.",
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

// Convert "+60123456789" → "60123456789@phone.cssebets.local"
export function phoneToSyntheticEmail(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@phone.cssebets.local`;
}

/**
 * Same tactical pitch backdrop used on /auth — keeps the entry & onboarding
 * surfaces visually unified with the CSSE matchday language.
 */
function PitchBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,oklch(0.78_0.19_145/0.18),transparent_55%)]" />
      <svg
        viewBox="0 0 800 1000"
        className="absolute inset-x-0 top-0 h-full w-full opacity-[0.10]"
        preserveAspectRatio="xMidYMin slice"
      >
        <defs>
          <linearGradient id="lane-reg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.78 0.19 145)" stopOpacity="0.0" />
            <stop offset="100%" stopColor="oklch(0.78 0.19 145)" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="currentColor" strokeWidth="1.2" className="text-foreground">
          <rect x="60" y="40" width="680" height="920" />
          <line x1="60" y1="500" x2="740" y2="500" />
          <circle cx="400" cy="500" r="90" />
          <circle cx="400" cy="500" r="2.5" fill="currentColor" />
          <rect x="200" y="40" width="400" height="150" />
          <rect x="300" y="40" width="200" height="60" />
          <rect x="200" y="810" width="400" height="150" />
          <rect x="300" y="900" width="200" height="60" />
          <path d="M60 60 A20 20 0 0 1 80 40" />
          <path d="M740 60 A20 20 0 0 0 720 40" />
          <path d="M60 940 A20 20 0 0 0 80 960" />
          <path d="M740 940 A20 20 0 0 1 720 960" />
        </g>
        <polyline
          points="120,920 260,720 380,640 520,460 640,260 720,120"
          fill="none"
          stroke="url(#lane-reg)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="2 8"
        />
        {[
          [120, 920],
          [380, 640],
          [640, 260],
        ].map(([x, y]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r="6"
            fill="oklch(0.78 0.19 145)"
            opacity="0.9"
          />
        ))}
      </svg>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
    </div>
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

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <PitchBackdrop />

      <div className="relative mx-auto flex min-h-screen w-full max-w-sm flex-col px-4 py-8">
        {/* Brand lockup */}
        <Link to="/" className="mb-6 flex items-center justify-center gap-3">
          <CsseAppIcon size={40} />
          <CsseWordmark size={20} />
        </Link>

        {/* Tagline strip */}
        <div className="mb-5 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[oklch(0.78_0.19_145)]" />
          <span>Matchday Console</span>
          <span className="text-border">/</span>
          <span className="text-[oklch(0.78_0.19_145)]">New Roster</span>
        </div>

        {/* Scoreboard-style register card */}
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/85 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-border/60 bg-[oklch(0.18_0.02_240/0.6)] px-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Session
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-[oklch(0.78_0.19_145)]">
                Register
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">CSSEBets · 02</span>
          </div>

          <div className="space-y-5 px-5 py-6">
            <div className="flex flex-col gap-1">
              <h1 className="text-[22px] font-bold leading-tight tracking-tight">
                Claim your seat.
              </h1>
              <p className="text-xs text-muted-foreground">
                Admin approval needed before your first pick.
              </p>
            </div>

            {/* Channel switcher */}
            <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/40 p-1">
              {(["email", "phone"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                    channel === c
                      ? "bg-card text-foreground shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c === "email" ? "Email" : "Phone"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Display name</Label>
                <Input
                  id="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Shown on the leaderboard"
                />
              </div>

              {channel === "email" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    required
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+60123456789"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    International format. No SMS — sign in with this number + your password.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm</Label>
                  <Input
                    id="confirm"
                    type="password"
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </div>

              <Button type="submit" className="group w-full" disabled={loading}>
                {loading ? "creating account…" : "create account"}
                {!loading && (
                  <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                )}
              </Button>
            </form>

            {/* Brand trust strip — three CSSE pillars */}
            <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-4">
              {[
                { icon: ShieldCheck, label: "Vetted roster" },
                { icon: Trophy, label: "Real payouts" },
                { icon: Users, label: "Live console" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1 text-center"
                >
                  <Icon className="h-4 w-4 text-[oklch(0.78_0.19_145)]" />
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 uppercase tracking-[0.18em] text-muted-foreground text-[10px]">
                  Already a member
                </span>
              </div>
            </div>

            <Link to="/auth" className="block">
              <Button type="button" variant="outline" className="w-full">
                sign in instead
              </Button>
            </Link>
          </div>

          {/* Bottom strip */}
          <div className="border-t border-border/60 bg-[oklch(0.18_0.02_240/0.4)] px-5 py-2">
            <div className="flex items-center justify-center gap-2 overflow-hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-bold">
              <span className="text-[oklch(0.78_0.19_145)]">FIFA WORLD CUP</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Competitive Strategy Starts Everywhere
        </p>
        <div className="mt-3 text-center text-[11px] text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            ← Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
