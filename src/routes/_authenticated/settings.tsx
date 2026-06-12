import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, User as UserIcon, Mail, Phone, KeyRound, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  ssr: false,
  head: () => ({ meta: [{ title: "Settings — cssebets" }] }),
  component: SettingsPage,
});

function isValidPhone(p: string) {
  if (!p.startsWith("+")) return false;
  const digits = p.slice(1).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function isSyntheticPhoneEmail(email: string | undefined | null) {
  return !!email && email.endsWith("@phone.cssebets.local");
}

function SettingsPage() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ["my-profile-settings", uid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, phone_number, public_reference, auth_provider")
        .eq("id", uid!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!uid,
  });

  // Treat synthetic phone-signup email as "no email"
  const currentEmail = isSyntheticPhoneEmail(user?.email) ? "" : (user?.email ?? "");
  const currentPhone = profile.data?.phone_number ?? "";

  const [email, setEmail] = useState(currentEmail);
  const [phone, setPhone] = useState(currentPhone);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // Sync form when profile loads
  if (profile.data && phone === "" && currentPhone) {
    setPhone(currentPhone);
  }
  if (user && email === "" && currentEmail) {
    setEmail(currentEmail);
  }

  async function saveEmail() {
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      toast.success("Email update requested. Check your inbox to confirm.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingEmail(false);
    }
  }

  async function savePhone() {
    const p = phone.trim();
    if (p && !isValidPhone(p)) {
      toast.error("Phone must be in international format, e.g. +60123456789");
      return;
    }
    if (!uid) return;
    setSavingPhone(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ phone_number: p || null })
        .eq("id", uid);
      if (error) throw error;
      toast.success("Phone number updated.");
      qc.invalidateQueries({ queryKey: ["my-profile-settings", uid] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPhone(false);
    }
  }

  async function savePassword() {
    if (pw1.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (pw1 !== pw2) {
      toast.error("Passwords do not match");
      return;
    }
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) throw error;
      toast.success("Password updated.");
      setPw1("");
      setPw2("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <UserIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold">Profile</h2>
        {profile.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Display name</div>
              <div className="font-medium">{profile.data?.display_name ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Reference ID</div>
              <div className="font-mono">{profile.data?.public_reference ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Sign-in method</div>
              <div className="font-medium capitalize">{profile.data?.auth_provider ?? "—"}</div>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4" /> Email</h2>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <p className="text-[11px] text-muted-foreground">
            Changing email requires confirming the new address from your inbox.
          </p>
        </div>
        <Button onClick={saveEmail} disabled={savingEmail || email === currentEmail}>
          {savingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Update email
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Phone className="h-4 w-4" /> Phone number</h2>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+60123456789"
          />
          <p className="text-[11px] text-muted-foreground">International format, e.g. +60123456789.</p>
        </div>
        <Button onClick={savePhone} disabled={savingPhone || phone === currentPhone}>
          {savingPhone ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Update phone
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4" /> Password</h2>
        <div className="space-y-1.5">
          <Label htmlFor="pw1">New password</Label>
          <Input id="pw1" type="password" minLength={8} value={pw1} onChange={(e) => setPw1(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw2">Confirm new password</Label>
          <Input id="pw2" type="password" minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <Button onClick={savePassword} disabled={savingPw || !pw1 || !pw2}>
          {savingPw ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Update password
        </Button>
      </Card>
    </div>
  );
}
