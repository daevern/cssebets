import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkAuthRateLimit } from "@/lib/rate-limit.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CsseAppIcon, CsseWordmark } from "@/components/brand/CsseMark";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — CSSEBets" },
      {
        name: "description",
        content: "Sign in to CSSEBets to make your picks and track your leaderboard standing.",
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

/**
 * Tactical pitch backdrop — proprietary CSSE visual.
 * Half-pitch with center circle, passing lanes, and an "ascent" polyline
 * that mirrors the brand mark. Pure SVG, scales crisp on mobile.
 */
function PitchBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Radial brand glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,oklch(0.78_0.19_145/0.18),transparent_55%)]" />
      {/* Pitch SVG */}
      <svg
        viewBox="0 0 800 1000"
        className="absolute inset-x-0 top-0 h-full w-full opacity-[0.10]"
        preserveAspectRatio="xMidYMin slice"
      >
        <defs>
          <linearGradient id="lane" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.78 0.19 145)" stopOpacity="0.0" />
            <stop offset="100%" stopColor="oklch(0.78 0.19 145)" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="currentColor" strokeWidth="1.2" className="text-foreground">
          {/* Touchlines */}
          <rect x="60" y="40" width="680" height="920" />
          {/* Halfway line */}
          <line x1="60" y1="500" x2="740" y2="500" />
          <circle cx="400" cy="500" r="90" />
          <circle cx="400" cy="500" r="2.5" fill="currentColor" />
          {/* Top penalty area */}
          <rect x="200" y="40" width="400" height="150" />
          <rect x="300" y="40" width="200" height="60" />
          <circle cx="400" cy="160" r="2.5" fill="currentColor" />
          {/* Bottom penalty area */}
          <rect x="200" y="810" width="400" height="150" />
          <rect x="300" y="900" width="200" height="60" />
          <circle cx="400" cy="840" r="2.5" fill="currentColor" />
          {/* Corner arcs */}
          <path d="M60 60 A20 20 0 0 1 80 40" />
          <path d="M740 60 A20 20 0 0 0 720 40" />
          <path d="M60 940 A20 20 0 0 0 80 960" />
          <path d="M740 940 A20 20 0 0 1 720 960" />
        </g>
        {/* Passing lane / strategy vector */}
        <polyline
          points="120,920 260,720 380,640 520,460 640,260 720,120"
          fill="none"
          stroke="url(#lane)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="2 8"
        />
        {/* Strategy nodes */}
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
      {/* Bottom fade to background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
    </div>
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
    <div className="relative min-h-screen bg-background text-foreground">
      <PitchBackdrop />

      <div className="relative mx-auto flex min-h-screen w-full max-w-sm flex-col px-4 py-8">
        {/* Brand lockup */}
        <Link to="/" className="mb-6 flex items-center justify-center gap-3">
          <CsseAppIcon size={40} />
          <CsseWordmark size={20} />
        </Link>

        {/* Tagline strip — proprietary CSSE language, not landing-page copy */}
        <div className="mb-5 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[oklch(0.78_0.19_145)]" />
          <span>Matchday Console</span>
          <span className="text-border">/</span>
          <span className="text-[oklch(0.78_0.19_145)]">Live</span>
        </div>

        {/* Scoreboard-style auth card */}
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/85 shadow-2xl backdrop-blur-md">
          {/* Top accent bar mimicking a stadium scoreboard */}
          <div className="flex items-center justify-between border-b border-border/60 bg-[oklch(0.18_0.02_240/0.6)] px-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Session
              </span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-[oklch(0.78_0.19_145)]">
                Sign in
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              CSSEBets · 01
            </span>
          </div>

          <div className="space-y-5 px-5 py-6">
            <div className="flex flex-col gap-1">
              <h1 className="text-[22px] font-bold leading-tight tracking-tight">
                Welcome back.
              </h1>
            </div>

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

            <form onSubmit={onSubmit} className="space-y-4">
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
                    International format, e.g. +60123456789
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="group w-full" disabled={loading}>
                {loading ? "signing in…" : "sign in"}
                {!loading && (
                  <ChevronRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                )}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 uppercase tracking-[0.18em] text-muted-foreground text-[10px]">
                  New to CSSE
                </span>
              </div>
            </div>

            <Link to="/register" className="block">
              <Button type="button" variant="outline" className="w-full">
                create account
              </Button>
            </Link>
          </div>

          {/* Bottom strip — FIFA WORLD CUP */}
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
