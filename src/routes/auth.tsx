import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkAuthRateLimit } from "@/lib/rate-limit.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — cssebets" }] }),
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
        if (!isValidPhone(p)) throw new Error("Phone must be in international format, e.g. +60123456789");
        await checkAuthRateLimit({ data: { phone: p } });
        const syntheticEmail = `${p.replace(/\D/g, "")}@phone.cssebets.local`;
        const { error } = await supabase.auth.signInWithPassword({ email: syntheticEmail, password });
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-accent/20">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="h-14 w-14 rounded-2xl bg-primary/20 grid place-items-center">
            <Trophy className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">cssebets</h1>
          <p className="text-sm text-muted-foreground text-center">
            Competitive Strategy Starts Everywhere!
          </p>
        </div>

        <div className="flex gap-2 p-1 bg-muted/60 rounded-lg">
          {(["email", "phone"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${channel === c ? "bg-card shadow" : "text-muted-foreground"}`}
            >
              {c === "email" ? "Email" : "Phone"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {channel === "email" ? (
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
              <p className="text-[11px] text-muted-foreground">International format, e.g. +60123456789</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait…" : "Sign in"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">New here?</span></div>
        </div>

        <Link to="/register" className="block">
          <Button type="button" variant="outline" className="w-full">
            Create an account
          </Button>
        </Link>

        <Link to="/" className="block text-center text-xs text-muted-foreground hover:text-foreground">← Back home</Link>
      </Card>
    </div>
  );
}
