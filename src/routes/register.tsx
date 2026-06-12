import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Register — cssebets" }] }),
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
// Used so phone sign-up flows through email/password auth (no SMS/OTP).
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
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      if (password !== confirm) throw new Error("Passwords do not match");
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
      if (!isValidPhone(p)) throw new Error("Phone must be in international format, e.g. +60123456789");
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      if (password !== confirm) throw new Error("Passwords do not match");
      const syntheticEmail = phoneToSyntheticEmail(p);
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-accent/20">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="h-14 w-14 rounded-2xl bg-primary/20 grid place-items-center">
            <Trophy className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-sm text-muted-foreground text-center">
            Join cssebets — admin approval required.
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

        {channel === "email" ? (
          <form onSubmit={handleEmail} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alex" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : "Create account"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handlePhone} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name-phone">Display name</Label>
              <Input id="name-phone" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alex" />
            </div>
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
            <div className="space-y-1.5">
              <Label htmlFor="pw-phone">Password</Label>
              <Input id="pw-phone" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-phone">Confirm password</Label>
              <Input id="confirm-phone" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : "Create account"}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              No SMS verification — use this phone number with your password to sign in.
            </p>
          </form>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">Already a member?</span></div>
        </div>

        <Link to="/auth" className="block">
          <Button type="button" variant="outline" className="w-full">
            Sign in instead
          </Button>
        </Link>

        <Link to="/" className="block text-center text-xs text-muted-foreground hover:text-foreground">← Back home</Link>
      </Card>
    </div>
  );
}
