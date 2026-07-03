import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Share2, Copy, Check, Users, Coins, Target } from "lucide-react";
import { getMyReferralOverview } from "@/lib/referrals.functions";
import { buildReferralLink } from "@/lib/referral-link";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/referrals")({
  component: ReferralsPage,
});

function ReferralsPage() {
  const { user } = useAuth();
  const uid = user?.id ?? "anon";
  const fn = useServerFn(getMyReferralOverview);
  const q = useQuery({ queryKey: ["my-referrals", uid], queryFn: () => fn(), enabled: !!user });
  const [copied, setCopied] = useState(false);

  const code = q.data?.referralCode ?? "";
  const link = buildReferralLink(code);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true); toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Could not copy link"); }
  }

  function share() {
    const text = `Join me on CSSEBets — predict the World Cup 2026 together. Use my referral code: ${code}. ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pb-24 pt-4 text-[var(--color-ink)]">
      <div>
        <h1 className="text-2xl font-bold">Referrals</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">Earn CSSE when your invites play.</p>
      </div>

      <Card className="rounded-none border-[var(--color-surface-border)] bg-[#070D0A] p-5">
        <div className="text-[11px] uppercase tracking-widest text-[var(--color-ink-muted)]">Your referral code</div>
        <div className="mt-2 font-mono text-4xl font-bold tracking-[0.35em] text-[var(--neon)]">
          {code || "—"}
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={copyLink} variant="outline" className="flex-1 gap-2 rounded-none border-[var(--color-surface-border)]">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copy Link
          </Button>
          <Button onClick={share} className="flex-1 gap-2 rounded-none bg-[var(--neon)] text-black hover:bg-[var(--neon)]/90">
            <Share2 className="h-4 w-4" /> WhatsApp
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Stat label="Total Referrals" value={q.data?.totalReferrals ?? 0} icon={Users} />
        <Stat label="Active" value={q.data?.activeReferrals ?? 0} icon={Target} />
        <Stat label="Tokens Earned" value={q.data?.tokensEarned ?? 0} icon={Coins} suffix=" CSSE" />
        <Stat label="Pending Milestones" value={q.data?.pendingMilestones ?? 0} icon={Target} />
      </div>

      <Card className="rounded-none border-[var(--color-surface-border)] bg-[#070D0A] p-4 text-xs text-[var(--color-ink-muted)]">
        <div className="font-semibold text-[var(--color-ink)] mb-1">How rewards work</div>
        Stage 1 = 50 pts played → +50 CSSE · Stage 2 = 500 pts → +50 CSSE · Stage 3 = 1000 pts → +100 CSSE.
        Free bets and simulations don't count.
      </Card>

      <Card className="rounded-none border-[var(--color-surface-border)] bg-[#070D0A]">
        <div className="border-b border-[var(--color-surface-border)] p-3 text-sm font-semibold">Your invites</div>
        <div className="divide-y divide-[var(--color-surface-border)]">
          {(q.data?.items ?? []).map((r) => (
            <div key={r.id} className="p-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{r.displayName}</div>
                <div className="text-[var(--neon)] font-mono text-xs">+{r.tokensAwarded} CSSE</div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--color-ink-muted)]">
                <span>{r.wagered.toLocaleString()} pts played</span>
                <div className="flex gap-1">
                  <StageBadge active={r.stage1}>S1</StageBadge>
                  <StageBadge active={r.stage2}>S2</StageBadge>
                  <StageBadge active={r.stage3}>S3</StageBadge>
                </div>
              </div>
              <div className="mt-1 text-[10px] text-[var(--color-ink-muted)]">
                Joined {new Date(r.createdAt).toLocaleDateString()}
                {r.flagged && <span className="ml-2 text-red-400">· Flagged</span>}
              </div>
            </div>
          ))}
          {!q.data?.items?.length && (
            <div className="p-6 text-center text-sm text-[var(--color-ink-muted)]">
              Share your code to earn CSSE.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, icon: Icon, suffix }: { label: string; value: number; icon: any; suffix?: string }) {
  return (
    <Card className="rounded-none border-[var(--color-surface-border)] bg-[#070D0A] p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-[var(--color-ink-muted)]">{label}</div>
        <Icon className="h-3.5 w-3.5 text-[var(--color-ink-muted)]" />
      </div>
      <div className="mt-1 font-mono text-2xl font-bold text-[var(--color-ink)]">
        {value.toLocaleString()}{suffix ?? ""}
      </div>
    </Card>
  );
}

function StageBadge({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={`rounded-none px-1.5 py-0 text-[9px] ${
      active ? "border-[var(--neon)] text-[var(--neon)]" : "border-[var(--color-surface-border)] text-[var(--color-ink-muted)]"
    }`}>{children}</Badge>
  );
}
