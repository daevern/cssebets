import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CsseMark, BrandText } from "@/components/brand/CsseMark";
import {
  Mail,
  Lock,
  ArrowRight,
  Upload,
  FileCheck2,
  Wallet as WalletIcon,
  CheckCircle2,
  Plus,
  Copy,
  Radio,
} from "lucide-react";

const TOTAL = 5; // 4 walkthrough screens + cashout

const STEP_LABELS = ["Register", "Request points", "Upload proof", "Your wallet", "Cashout"];

/* Tick-mark corners — matches dashboard / auth / register. */
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const map: Record<typeof pos, string> = {
    tl: "top-0 left-0 border-t border-l",
    tr: "top-0 right-0 border-t border-r",
    bl: "bottom-0 left-0 border-b border-l",
    br: "bottom-0 right-0 border-b border-r",
  };
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-3 w-3 border-[var(--color-neon)] ${map[pos]}`}
    />
  );
}

export function HowItWorks() {
  const [index, setIndex] = useState(0);
  const next = () => setIndex((i) => (i + 1) % TOTAL);
  const reset = () => setIndex(0);
  const isCashout = index === 4;

  return (
    <section
      id="how"
      className="relative overflow-hidden border-y border-[var(--color-surface-border)] bg-[var(--color-surface)] text-[var(--color-ink)]"
    >
      {/* scoreboard scanline — same vocabulary as dashboard */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
        }}
      />
      {isCashout && <MoneyRain key={index} />}

      <div className="relative mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <div className="text-center">
          <div className="mb-3 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            <Radio className="h-3 w-3" />
            Matchday Console · Walkthrough
          </div>
          <h2 className="font-display text-[32px] font-bold uppercase leading-[1] tracking-tight sm:text-[44px]">
            How it <span className="text-[var(--color-neon)]">works.</span>
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
            Click to shuffle cards
          </p>
        </div>

        {/* Deck */}
        <div className="relative mx-auto mt-10 h-[500px] w-full max-w-sm select-none sm:h-[520px]">
          {/* Background placeholder cards (stack illusion) — sharp stencil */}
          {[2, 1].map((offset) => (
            <div
              key={offset}
              aria-hidden
              className="absolute inset-0 border border-[var(--color-surface-border)] bg-[var(--color-surface-2)]/80"
              style={{
                transform: `translateY(${offset * 10}px) scale(${1 - offset * 0.04})`,
                opacity: 0.5 - offset * 0.15,
                zIndex: 1,
              }}
            />
          ))}

          <AnimatePresence mode="popLayout" initial={false}>
            <motion.button
              key={index}
              type="button"
              onClick={isCashout ? reset : next}
              initial={{ x: 320, y: -40, rotate: 18, opacity: 0 }}
              animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
              exit={{ x: -340, y: 30, rotate: -22, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="absolute inset-0 z-10 block text-left"
              aria-label={
                isCashout
                  ? "Cashout — tap to restart the deck"
                  : `Step ${index + 1} of ${TOTAL} — ${STEP_LABELS[index]} — tap for next`
              }
            >
              <PhoneFrame step={index + 1} label={STEP_LABELS[index]} cashout={isCashout}>
                {index === 0 && <RegisterScreen />}
                {index === 1 && <PointsRequestScreen />}
                {index === 2 && <UploadProofScreen />}
                {index === 3 && <WalletScreen />}
                {index === 4 && <CashoutScreen />}
              </PhoneFrame>
            </motion.button>
          </AnimatePresence>
        </div>

        {/* Controls — stencil ticks */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to card ${i + 1}: ${STEP_LABELS[i]}`}
                className={`h-1.5 transition-all ${
                  i === index
                    ? "w-7 bg-[var(--color-neon)]"
                    : "w-2 bg-[var(--color-surface-border)] hover:bg-[var(--color-ink-muted)]"
                }`}
              />
            ))}
          </div>
        </div>
        <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
          {isCashout
            ? "Tap to shuffle again"
            : `${STEP_LABELS[index]} · tap card to continue`}
        </p>

        {/* Timing & approval — stencil grid */}
        <div className="mx-auto mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
          {[
            {
              title: "Registration approval",
              time: "30 min – 6 hrs",
              body: "New accounts are reviewed by an admin before they can place bets.",
            },
            {
              title: "Points request approval",
              time: "15 min – 2 hrs",
              body: "Once your bank transfer proof is uploaded, points land after admin verification.",
            },
            {
              title: "Cashout → bank",
              time: "24 hrs – 7 days",
              body: "Points convert at 1 pt = RM1.00 and are sent to your registered bank account.",
            },
          ].map((row) => (
            <div
              key={row.title}
              className="relative border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-4 text-left"
            >
              <Corner pos="tl" />
              <Corner pos="br" />
              <div className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
                {row.title}
              </div>
              <div className="mt-1.5 font-display text-base font-bold tabular-nums text-[var(--color-ink)]">
                {row.time}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-[var(--color-ink-muted)]">
                {row.body}
              </p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-xl text-center text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
          Every step is human-reviewed — that's why approvals aren't instant.
        </p>
      </div>
    </section>
  );
}

/* ---------------- Phone frame chrome — CSSE stencil ---------------- */

function PhoneFrame({
  step,
  label,
  cashout,
  children,
}: {
  step: number;
  label: string;
  cashout?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden border bg-[var(--color-surface-2)] p-3 shadow-2xl ${
        cashout
          ? "border-[var(--color-neon)] shadow-[0_0_40px_rgba(34,224,107,0.35)]"
          : "border-[var(--color-neon)]/25"
      }`}
    >
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />

      {/* Stencil status bar — mirrors auth scoreboard band */}
      <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-2 pb-2 pt-1">
        <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
          <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--color-neon)]" />
          Session · 0{step}
        </span>
        <span className="text-[9px] font-bold tracking-[0.04em] text-[var(--color-ink-muted)]">
          <BrandText />
        </span>
      </div>

      {/* App header */}
      <div className="mt-3 flex items-center justify-between border border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2">
        <div className="flex items-center gap-2">
          <CsseMark className="h-5 w-5 text-[var(--color-neon)]" />
          <span className="font-display text-[12px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink)]">
            cssebets
          </span>
        </div>
        <span className="border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
          Step {step} / {TOTAL}
        </span>
      </div>

      {/* Inner screen */}
      <div className="relative mt-3 flex-1 overflow-hidden border border-[var(--color-surface-border)] bg-[#070D0A] p-4 text-[var(--color-ink)]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
          }}
        />
        <div className="relative mb-3 text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
          {label}
        </div>
        <div className="relative flex h-[calc(100%-1.5rem)] flex-col">{children}</div>
      </div>

      {/* Footer hint — dashed stencil strip */}
      <div className="mt-2 flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)] px-2 pb-1 pt-2 text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
        <span>Preview</span>
        <span className="inline-flex items-center gap-1 text-[var(--color-neon)]">
          {cashout ? "Restart ↺" : "Next →"}
        </span>
      </div>
    </div>
  );
}

/* ---------------- Per-step mini screens ---------------- */

function FakeInput({
  icon: Icon,
  value,
  placeholder,
  mask,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value?: string;
  placeholder?: string;
  mask?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
      <Icon className="h-3.5 w-3.5 text-[var(--color-ink-muted)]" />
      <span
        className={`text-xs ${value ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"} tracking-tight`}
      >
        {mask && value ? "•".repeat(value.length) : value || placeholder}
      </span>
    </div>
  );
}

function NeonAction({
  children,
  icon: Icon,
  className = "",
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center gap-1.5 border border-[var(--color-neon)] bg-[var(--color-neon)] py-2.5 font-display text-[11px] font-bold uppercase tracking-[0.28em] text-[#04140A] shadow-[0_0_18px_rgba(34,224,107,0.35)] ${className}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[8px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
      {children}
    </div>
  );
}

function RegisterScreen() {
  return (
    <div className="flex h-full flex-col">
      <h3 className="font-display text-base font-bold uppercase tracking-tight text-[var(--color-ink)]">
        Welcome <span className="text-[var(--color-neon)]">back.</span>
      </h3>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        Sign in · take your side
      </p>
      <div className="mt-4 space-y-2.5">
        <FakeInput icon={Mail} value="you@cssebets.com" />
        <FakeInput icon={Lock} value="supersecret" mask />
      </div>
      <NeonAction className="mt-4">
        Sign in <ArrowRight className="h-3.5 w-3.5" />
      </NeonAction>
      <div className="mt-3 text-center text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
        New here? <span className="text-[var(--color-neon)]">Create account</span>
      </div>
      <div className="mt-auto border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-2.5 text-[10px] leading-snug text-[var(--color-ink-muted)]">
        ⏱ New accounts get admin approval in 30 min – 6 hrs.
      </div>
    </div>
  );
}

function PointsRequestScreen() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5">
        <Plus className="h-3.5 w-3.5 text-[var(--color-neon)]" />
        <h3 className="font-display text-sm font-bold uppercase tracking-tight text-[var(--color-ink)]">
          Request points
        </h3>
      </div>
      <p className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-[var(--color-ink-muted)] leading-snug">
        Bank transfer · admin verified
      </p>

      <div className="mt-2.5 space-y-2">
        <div>
          <FieldLabel>Amount</FieldLabel>
          <div className="mt-1 border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 font-display text-sm font-bold tabular-nums text-[var(--color-ink)]">
            5,000
          </div>
        </div>

        <div className="space-y-1.5 border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-2">
          <div>
            <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink)]">
              APEX TRUST BANK
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              CSSE PAYMENTS SDN BHD
            </div>
            <div className="mt-0.5 flex items-center justify-between border border-[var(--color-surface-border)] bg-[#070D0A] px-1.5 py-1 font-display text-[10px] tabular-nums text-[var(--color-ink)]">
              <span>312123400232368</span>
              <Copy className="h-2.5 w-2.5 text-[var(--color-ink-muted)]" />
            </div>
          </div>
          <div className="border-t border-dashed border-[var(--color-surface-border)] pt-1.5">
            <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink)]">
              NEXUS ALLIANCE BANK
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              CSSE PLATFORM SDN BHD
            </div>
            <div className="mt-0.5 flex items-center justify-between border border-[var(--color-surface-border)] bg-[#070D0A] px-1.5 py-1 font-display text-[10px] tabular-nums text-[var(--color-ink)]">
              <span>8010575969</span>
              <Copy className="h-2.5 w-2.5 text-[var(--color-ink-muted)]" />
            </div>
          </div>
          <div className="border-t border-dashed border-[var(--color-surface-border)] pt-1.5">
            <FieldLabel>Reference ID</FieldLabel>
            <div className="mt-0.5 flex items-center justify-between border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/10 px-1.5 py-1 font-display text-[10px] font-bold tabular-nums text-[var(--color-neon)]">
              <span>CSSE-8421</span>
              <Copy className="h-2.5 w-2.5" />
            </div>
          </div>
        </div>
      </div>

      <NeonAction className="mt-auto" icon={Upload}>
        Request points
      </NeonAction>
    </div>
  );
}

function WalletScreen() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5">
        <WalletIcon className="h-4 w-4 text-[var(--color-neon)]" />
        <h3 className="font-display text-sm font-bold uppercase tracking-tight text-[var(--color-ink)]">
          My wallet
        </h3>
      </div>

      <div className="relative mt-2 border border-[var(--color-neon)]/25 bg-[var(--color-surface-2)] p-3">
        <Corner pos="tl" />
        <Corner pos="br" />
        <FieldLabel>Current balance</FieldLabel>
        <div className="mt-1 flex items-baseline gap-1.5">
          <motion.span
            key="bal"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-3xl font-bold tabular-nums text-[var(--color-ink)]"
          >
            42,860
          </motion.span>
          <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
            pts
          </span>
        </div>
      </div>

      <div className="mt-2.5 border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-2.5">
        <FieldLabel>Transaction history</FieldLabel>
        <div className="mt-1.5 space-y-1">
          {[
            { type: "credit", ref: "bet payout", note: "BRA vs ARG", amt: 8400, bal: 42860 },
            { type: "credit", ref: "points request", note: "Top-up approved", amt: 5000, bal: 34460 },
            { type: "debit", ref: "bet stake", note: "ESP vs CPV", amt: 1200, bal: 29460 },
          ].map((t, i) => {
            const sign = t.type === "debit" ? "-" : "+";
            const color =
              t.type === "debit" ? "text-rose-300" : "text-[var(--color-neon)]";
            return (
              <div
                key={i}
                className="flex items-center justify-between border border-[var(--color-surface-border)] bg-[#070D0A] px-2 py-1.5 text-[10px]"
              >
                <div className="min-w-0">
                  <div className="truncate font-display font-bold uppercase tracking-[0.16em] text-[var(--color-ink)]">
                    {t.type} · {t.ref}
                  </div>
                  <div className="truncate text-[8px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
                    {t.note}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-display font-bold tabular-nums ${color}`}>
                    {sign}
                    {t.amt.toLocaleString()}
                  </div>
                  <div className="text-[8px] tabular-nums text-[var(--color-ink-muted)]">
                    bal {t.bal.toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-auto pt-2 text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
        Place a bet on matches →
      </div>
    </div>
  );
}

function UploadProofScreen() {
  return (
    <div className="flex h-full flex-col">
      <h3 className="font-display text-base font-bold uppercase tracking-tight text-[var(--color-ink)]">
        Upload <span className="text-[var(--color-neon)]">proof.</span>
      </h3>
      <p className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        Attach receipt · faster approval
      </p>

      <motion.div
        initial={{ scale: 0.96 }}
        animate={{ scale: 1 }}
        transition={{ repeat: Infinity, repeatType: "reverse", duration: 1.6 }}
        className="mt-4 grid place-items-center border-2 border-dashed border-[var(--color-neon)]/50 bg-[var(--color-neon)]/5 py-6"
      >
        <Upload className="h-6 w-6 text-[var(--color-neon)]" />
        <div className="mt-2 font-display text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink)]">
          Tap to upload
        </div>
        <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          JPG · PNG · WEBP · PDF — max 10 MB
        </div>
      </motion.div>

      <div className="mt-3 flex items-center gap-2 border border-[var(--color-neon)]/40 bg-[var(--color-surface-2)] p-2">
        <FileCheck2 className="h-4 w-4 text-[var(--color-neon)]" />
        <div className="flex-1">
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink)]">
            receipt-8421.jpg
          </div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            218 KB · uploaded
          </div>
        </div>
        <CheckCircle2 className="h-4 w-4 text-[var(--color-neon)]" />
      </div>

      <div className="mt-auto border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-2.5 text-[10px] leading-snug text-[var(--color-ink-muted)]">
        Include your Reference ID so admin can match the transfer.
      </div>
    </div>
  );
}

function CashoutScreen() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold uppercase tracking-tight text-[var(--color-ink)]">
          Cashout
        </h3>
        <span className="border border-[var(--color-neon)] bg-[var(--color-neon)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.28em] text-[#04140A]">
          Approved
        </span>
      </div>

      <div className="relative mt-2 border border-[var(--color-neon)] bg-[var(--color-surface-2)] p-4 shadow-[0_0_24px_rgba(34,224,107,0.25)]">
        <Corner pos="tl" />
        <Corner pos="tr" />
        <Corner pos="bl" />
        <Corner pos="br" />
        <div className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
          Payout amount
        </div>
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 14 }}
          className="mt-1 font-display text-4xl font-bold tabular-nums text-[var(--color-ink)] drop-shadow"
        >
          RM42,860
        </motion.div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
          42,860 pts · 1 pt = RM1.00
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between border border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2 text-[10px]">
          <span className="font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
            To bank
          </span>
          <span className="font-display font-bold tabular-nums text-[var(--color-ink)]">
            •••• 4421
          </span>
        </div>
        <div className="flex items-center justify-between border border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2 text-[10px]">
          <span className="font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
            Arrives in
          </span>
          <span className="font-display font-bold uppercase tracking-[0.22em] text-[var(--color-neon)]">
            24 hrs – 7 days
          </span>
        </div>
      </div>

      <NeonAction className="mt-auto">
        Confirm cashout <ArrowRight className="h-3.5 w-3.5" />
      </NeonAction>
    </div>
  );
}



/* ---------- Money rain (kept from previous version) ---------- */

type Bill = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  scale: number;
  crumpled: boolean;
  spawned: boolean;
  spawnAt: number;
};

const BILL_W = 80;
const BILL_H = 40;
const TOTAL_BILLS = 50;
const SPAWN_MS = 5000;
const PUSH_RADIUS = 110;
const PUSH_FORCE = 1400;

function MoneyRain() {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Array<HTMLDivElement | null>>([]);
  const billsRef = useRef<Bill[]>([]);
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -9999,
    y: -9999,
    active: false,
  });
  const [ready, setReady] = useState(false);

  if (billsRef.current.length === 0) {
    const W = typeof window !== "undefined" ? window.innerWidth : 800;
    billsRef.current = Array.from({ length: TOTAL_BILLS }).map((_, i) => ({
      id: i,
      x: Math.random() * Math.max(0, W - BILL_W),
      y: -80 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 60,
      vy: 0,
      rot: -30 + Math.random() * 60,
      vr: (Math.random() - 0.5) * 240,
      scale: 0.55 + Math.random() * 0.7,
      crumpled: Math.random() < 0.35,
      spawned: false,
      spawnAt: (i / TOTAL_BILLS) * SPAWN_MS + Math.random() * 400,
    }));
    setTimeout(() => setReady(true), 0);
  }

  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const start = performance.now();
    let last = start;
    const gravity = 2200;
    const airDrag = 0.985;
    const restitution = 0.25;

    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY, active: true };
    };
    const onLeave = () => {
      pointerRef.current.active = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    window.addEventListener("pointerup", onLeave, { passive: true });
    window.addEventListener("pointercancel", onLeave, { passive: true });

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = now - start;
      const H = window.innerHeight;
      const W = window.innerWidth;
      const floor = H - BILL_H * 0.6;
      const p = pointerRef.current;

      for (let i = 0; i < billsRef.current.length; i++) {
        const b = billsRef.current[i];
        if (!b.spawned) {
          if (elapsed >= b.spawnAt) b.spawned = true;
          else continue;
        }
        if (p.active) {
          const cx = b.x + BILL_W / 2;
          const cy = b.y + BILL_H / 2;
          const dx = cx - p.x;
          const dy = cy - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < PUSH_RADIUS * PUSH_RADIUS && d2 > 1) {
            const d = Math.sqrt(d2);
            const f = (1 - d / PUSH_RADIUS) * PUSH_FORCE;
            b.vx += (dx / d) * f * dt;
            b.vy += (dy / d) * f * dt;
            b.vr += (Math.random() - 0.5) * 400 * dt;
          }
        }
        b.vy += gravity * dt;
        b.vx *= airDrag;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
        b.vr *= 0.97;
        if (b.x < 0) {
          b.x = 0;
          b.vx = -b.vx * 0.4;
        } else if (b.x > W - BILL_W) {
          b.x = W - BILL_W;
          b.vx = -b.vx * 0.4;
        }
        const billFloor = floor - (b.id % 6) * 4;
        if (b.y > billFloor) {
          b.y = billFloor;
          if (Math.abs(b.vy) > 30) {
            b.vy = -b.vy * restitution;
          } else {
            b.vy = 0;
          }
          b.vx *= 0.82;
          b.vr *= 0.7;
        }
        const node = nodeRefs.current[i];
        if (node) {
          node.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) rotate(${b.rot}deg) scale(${b.scale})`;
          node.style.opacity = "1";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      window.removeEventListener("pointerup", onLeave);
      window.removeEventListener("pointercancel", onLeave);
    };
  }, [ready]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ pointerEvents: "none" }}
      aria-hidden="true"
    >
      {billsRef.current.map((b, i) => (
        <div
          key={b.id}
          ref={(el) => {
            nodeRefs.current[i] = el;
          }}
          className="absolute left-0 top-0 will-change-transform"
          style={{ opacity: 0, transform: `translate3d(${b.x}px, ${b.y}px, 0)` }}
        >
          <MiniBill crumpled={b.crumpled} />
        </div>
      ))}
    </div>
  );
}

function MiniBill({ crumpled = false }: { crumpled?: boolean }) {
  const crumpleStyle: React.CSSProperties = crumpled
    ? {
        clipPath:
          "polygon(4% 12%, 22% 0%, 55% 8%, 82% 0%, 100% 18%, 96% 55%, 100% 88%, 78% 100%, 45% 92%, 18% 100%, 0% 78%, 6% 40%)",
        transform: "skewX(-6deg) skewY(2deg)",
        filter: "contrast(1.1) brightness(0.95)",
      }
    : {};
  return (
    <div
      className="relative h-10 w-20 rounded-sm border-2 border-emerald-900/70 bg-gradient-to-br from-emerald-200 via-emerald-100 to-emerald-300 shadow-lg"
      style={{
        boxShadow: "0 6px 14px -6px rgba(6,78,59,0.6), inset 0 0 0 1px rgba(255,255,255,0.4)",
        ...crumpleStyle,
      }}
    >
      {crumpled && (
        <>
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-bl from-emerald-900/20 via-transparent to-emerald-900/15" />
        </>
      )}
      <div className="absolute inset-1 rounded-[2px] border border-emerald-800/50" />
      <span className="absolute left-1 top-0.5 text-[8px] font-black text-emerald-900">RM</span>
      <span className="absolute right-1 top-0.5 text-[8px] font-black text-emerald-900">RM</span>
      <span className="absolute bottom-0.5 left-1 text-[8px] font-black text-emerald-900">RM</span>
      <span className="absolute bottom-0.5 right-1 text-[8px] font-black text-emerald-900">RM</span>
      <div className="absolute inset-0 grid place-items-center font-serif text-xs font-black text-emerald-900">
        100
      </div>
    </div>
  );
}
