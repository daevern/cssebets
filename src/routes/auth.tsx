import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkAuthRateLimit } from "@/lib/rate-limit.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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

function BrandBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,oklch(0.78_0.19_145/0.14),transparent_60%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
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
    <div className="relative min-h-screen bg-background">
      <BrandBackdrop />
      <div className="relative mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4 py-10">
        <Link to="/" className="mb-8 flex items-center justify-center gap-3">
          <CsseAppIcon size={40} />
          <CsseWordmark size={20} />
        </Link>

        <Card className="space-y-5 border-border/70 bg-card/85 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold">Welcome back</h1>
            <p className="text-xs text-muted-foreground">Sign in to continue.</p>
          </div>

          <div className="flex gap-2 rounded-lg bg-muted/60 p-1">
            {(["email", "phone"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                  channel === c ? "bg-card shadow" : "text-muted-foreground"
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : "Sign in"}
              {!loading && <ChevronRight className="ml-1 h-4 w-4" />}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">New to CSSE?</span>
            </div>
          </div>

          <Link to="/register" className="block">
            <Button type="button" variant="outline" className="w-full">
              Create an account
            </Button>
          </Link>
        </Card>

        <div className="mt-6 text-center text-[11px] text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            ← Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
