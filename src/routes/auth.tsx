import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — cssebets" }] }),
  component: AuthPage,
});

type Mode = "login" | "register";
type Channel = "email" | "phone";

function normalizePhone(input: string) {
  const trimmed = input.trim().replace(/\s+/g, "");
  return trimmed;
}

function isValidPhone(p: string) {
  if (!p.startsWith("+")) return false;
  const digits = p.slice(1).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [channel, setChannel] = useState<Channel>("email");

  // shared
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");

  // email channel
  const [email, setEmail] = useState("");

  // phone channel
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function resetTransient() {
    setOtp("");
    setOtpSent(false);
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "register") {
        if (password.length < 8) throw new Error("Password must be at least 8 characters");
        if (password !== confirm) throw new Error("Passwords do not match");
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created. Waiting for admin approval.");
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
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
      if (!isValidPhone(p)) {
        throw new Error("Phone must be in international format, e.g. +60123456789");
      }

      if (mode === "register") {
        if (password.length < 8) throw new Error("Password must be at least 8 characters");
        if (password !== confirm) throw new Error("Passwords do not match");

        if (!otpSent) {
          const { error } = await supabase.auth.signUp({
            phone: p,
            password,
            options: {
              data: { display_name: displayName || p },
            },
          });
          if (error) throw error;
          setOtpSent(true);
          toast.success("OTP sent. Check your phone.");
        } else {
          if (!otp.trim()) throw new Error("Enter the OTP sent to your phone");
          const { error } = await supabase.auth.verifyOtp({
            phone: p,
            token: otp.trim(),
            type: "sms",
          });
          if (error) throw error;
          toast.success("Phone verified. Waiting for admin approval.");
          navigate({ to: "/dashboard" });
        }
      } else {
        // Login: phone + password
        const { error } = await supabase.auth.signInWithPassword({ phone: p, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
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

        {/* Mode (login/register) */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); resetTransient(); }}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition ${mode === m ? "bg-card shadow" : "text-muted-foreground"}`}
            >
              {m === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        {/* Channel (email/phone) */}
        <div className="flex gap-2 p-1 bg-muted/60 rounded-lg">
          {(["email", "phone"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setChannel(c); resetTransient(); }}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${channel === c ? "bg-card shadow" : "text-muted-foreground"}`}
            >
              {c === "email" ? "Email" : "Phone"}
            </button>
          ))}
        </div>

        {channel === "email" ? (
          <form onSubmit={handleEmail} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Display name</Label>
                <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alex" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={mode === "register" ? 8 : 6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handlePhone} className="space-y-4">
            {mode === "register" && !otpSent && (
              <div className="space-y-1.5">
                <Label htmlFor="name-phone">Display name</Label>
                <Input id="name-phone" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alex" />
              </div>
            )}
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
                disabled={otpSent}
              />
              <p className="text-[11px] text-muted-foreground">International format, e.g. +60123456789</p>
            </div>

            {!otpSent && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="pw-phone">Password</Label>
                  <Input id="pw-phone" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                {mode === "register" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-phone">Confirm password</Label>
                    <Input id="confirm-phone" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  </div>
                )}
              </>
            )}

            {mode === "register" && otpSent && (
              <div className="space-y-1.5">
                <Label htmlFor="otp">OTP code</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                />
                <p className="text-[11px] text-muted-foreground">Enter the code we just sent via SMS.</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Please wait…"
                : mode === "login"
                ? "Sign in"
                : otpSent
                ? "Verify & create account"
                : "Send OTP"}
            </Button>

            {mode === "register" && otpSent && (
              <Button
                type="button"
                variant="ghost"
                className="w-full text-xs"
                onClick={() => resetTransient()}
              >
                ← Change phone number
              </Button>
            )}

            <p className="text-[11px] text-muted-foreground text-center">
              Phone sign-in requires SMS to be enabled on the backend. If you don't receive an OTP, contact an admin.
            </p>
          </form>
        )}

        <p className="text-xs text-center text-muted-foreground">
          New accounts need admin approval before joining the pool.
        </p>
        <Link to="/" className="block text-center text-xs text-muted-foreground hover:text-foreground">← Back home</Link>
      </Card>
    </div>
  );
}
