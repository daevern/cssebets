import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { CsseLogo, BrandText } from "@/components/brand/CsseMark";
import { Check, Share2, Download, X, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { teamFlagUrl } from "@/lib/country-flags";

export type WinTicketData = {
  id: string;
  matchLabel: string;      // "England vs Congo DR"
  homeTeam?: string;
  awayTeam?: string;
  marketLabel: string;     // "Match Winner"
  selectionLabel: string;  // "Congo DR advances"
  odds: number;            // 5.91
  stake: number;           // 50
  gross: number;           // 295.5
  profit: number;          // 245.5
  settledAt: string;       // ISO
};

export function WinTicketModal({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: WinTicketData | null;
}) {
  const ticketRef = useRef<HTMLDivElement>(null);

  async function handleShare() {
    const text = `Called it on ${BrandStr(data)}. +${Math.round((data?.profit ?? 0)).toLocaleString()} pts on ${data?.selectionLabel} at ${data?.odds.toFixed(2)}x.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "CSSEBets — Winning Ticket", text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Ticket details copied");
      }
    } catch {}
  }

  async function handleSaveImage() {
    if (!ticketRef.current) return;
    try {
      // Dynamically import to keep bundle lean; graceful fallback if missing.
      const mod: any = await import(/* @vite-ignore */ ("html-to-image" as any)).catch(() => null);
      if (!mod) {
        toast.info("Screenshot the ticket to share it");
        return;
      }
      const dataUrl = await mod.toPng(ticketRef.current, { pixelRatio: 3, backgroundColor: "#05100B" });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `cssebets-win-${data?.id?.slice(0, 8) ?? "ticket"}.png`;
      a.click();
    } catch {
      toast.info("Screenshot the ticket to share it");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="backdrop-blur-md" />
        <AnimatePresence>
          {open && data && (
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-24px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2"
              >
                {/* Close */}
                <DialogPrimitive.Close
                  className="absolute -top-10 right-0 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur transition-colors hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>

                {/* Ticket */}
                <div
                  ref={ticketRef}
                  className="relative overflow-hidden rounded-[22px] p-[1px]"
                  style={{
                    background:
                      "linear-gradient(160deg, rgba(34,224,107,0.55), rgba(34,224,107,0.05) 45%, rgba(255,255,255,0.06) 100%)",
                  }}
                >
                  <div
                    className="relative rounded-[21px] px-5 pb-5 pt-5"
                    style={{
                      background:
                        "radial-gradient(120% 80% at 50% 0%, rgba(34,224,107,0.10) 0%, transparent 55%), linear-gradient(180deg, #0A1712 0%, #05100B 100%)",
                    }}
                  >
                    {/* Header */}
                    <header className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CsseLogo size={15} />
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full border border-[var(--neon)]/30 bg-[var(--neon)]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--neon)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon)] shadow-[0_0_8px_var(--neon)]" />
                        Won
                      </div>
                    </header>

                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--ink-muted)]">
                      Winning Ticket
                    </div>

                    {/* Hero amount */}
                    <div className="relative mt-5">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 -inset-y-4 mx-auto max-w-[80%] rounded-full opacity-70 blur-2xl"
                        style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(34,224,107,0.35) 0%, transparent 70%)" }}
                      />
                      <div className="relative text-center">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--ink-muted)]">
                          Profit
                        </div>
                        <div
                          className="font-display text-[52px] font-bold leading-none tracking-tight text-[var(--neon)]"
                          style={{ textShadow: "0 0 24px rgba(34,224,107,0.35)" }}
                        >
                          +{Math.round(data.profit).toLocaleString()}
                        </div>
                        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--ink-muted)]">
                          Points
                        </div>
                      </div>
                    </div>

                    {/* Congrats copy */}
                    <div className="mt-5 text-center">
                      <div className="font-display text-[20px] font-bold leading-tight text-[var(--ink)]">
                        You called it right.
                      </div>
                      <div className="mt-1 text-[12px] text-[var(--ink-muted)]">
                        Your prediction settled in profit.
                      </div>
                    </div>

                    {/* Perforation */}
                    <div className="relative my-5">
                      <div
                        aria-hidden
                        className="absolute -left-3 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full"
                        style={{ background: "#05100B" }}
                      />
                      <div
                        aria-hidden
                        className="absolute -right-3 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full"
                        style={{ background: "#05100B" }}
                      />
                      <div className="mx-2 border-t border-dashed border-white/10" />
                    </div>

                    {/* Match strip */}
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.02] px-3 py-3">
                      <TeamCell name={data.homeTeam ?? data.matchLabel.split(" vs ")[0]} align="left" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--ink-muted)]">vs</span>
                      <TeamCell name={data.awayTeam ?? data.matchLabel.split(" vs ")[1] ?? ""} align="right" />
                    </div>

                    {/* Rows */}
                    <dl className="mt-3 grid grid-cols-1 gap-y-2.5 text-[13px]">
                      <Row label="Market" value={data.marketLabel} />
                      <Row label="Pick" value={data.selectionLabel} strong />
                      <Row label="Multiplier" value={`${data.odds.toFixed(2)}x`} />
                      <Row label="Stake" value={`${Math.round(data.stake).toLocaleString()} pts`} />
                      <Row
                        label="Return"
                        value={`${Math.round(data.gross).toLocaleString()} pts`}
                        strong
                        accent
                      />
                    </dl>

                    <div className="mt-4 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--ink-muted)]">
                      <span>Ticket · {data.id.slice(0, 8).toUpperCase()}</span>
                      <span>{new Date(data.settledAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 grid grid-cols-4 gap-2">
                  <ActionButton onClick={handleShare} icon={<Share2 className="h-4 w-4" />} label="Share" />
                  <ActionButton onClick={handleSaveImage} icon={<Download className="h-4 w-4" />} label="Save" />
                  <Link
                    to="/my-predictions"
                    onClick={() => onOpenChange(false)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 text-[11px] font-semibold text-[var(--ink)] transition-colors hover:bg-white/[0.06]"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    View
                  </Link>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--neon)] px-2 py-2.5 text-[11px] font-bold text-[#05100B] transition-transform hover:scale-[1.02]"
                  >
                    <Check className="h-4 w-4" />
                    Done
                  </button>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          )}
        </AnimatePresence>
      </DialogPortal>
    </Dialog>
  );
}

function BrandStr(data: WinTicketData | null): string {
  if (!data) return "CSSEBets";
  return data.matchLabel;
}

function Row({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] pb-2 last:border-b-0 last:pb-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--ink-muted)]">
        {label}
      </dt>
      <dd
        className={`text-right tabular-nums ${strong ? "font-bold" : "font-medium"} ${accent ? "text-[var(--neon)]" : "text-[var(--ink)]"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function TeamCell({ name, align }: { name: string; align: "left" | "right" }) {
  const flag = teamFlagUrl(name, 80);
  return (
    <div className={`flex flex-1 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      {flag ? (
        <img
          src={flag}
          alt=""
          className="h-6 w-9 rounded-[3px] object-cover ring-1 ring-white/10"
          loading="lazy"
        />
      ) : (
        <div className="h-6 w-9 rounded-[3px] bg-white/5 ring-1 ring-white/10" />
      )}
      <span className="truncate text-[13px] font-semibold text-[var(--ink)]">{name}</span>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2.5 text-[11px] font-semibold text-[var(--ink)] transition-colors hover:bg-white/[0.06]"
    >
      {icon}
      {label}
    </button>
  );
}
