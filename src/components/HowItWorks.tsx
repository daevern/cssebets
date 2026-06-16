import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CsseMark } from "@/components/brand/CsseMark";
import { Mail, Lock, ArrowRight, Upload, FileCheck2, Banknote, TrendingUp, Wallet, CheckCircle2 } from "lucide-react";

const TOTAL = 5; // 4 walkthrough screens + cashout

const STEP_LABELS = ["Register", "Request points", "Upload proof", "Your wallet", "Cashout"];

export function HowItWorks() {
  const [index, setIndex] = useState(0);
  const next = () => setIndex((i) => (i + 1) % TOTAL);
  const reset = () => setIndex(0);
  const isCashout = index === 4;

  return (
    <section id="how" className="relative border-b border-border bg-card/30 overflow-hidden">
      {isCashout && <MoneyRain key={index} />}
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <div className="text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">How It Works</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Tap the deck to flip through every screen — sign-up to cashout, exactly like it looks in the app.
          </p>
        </div>

        {/* Deck */}
        <div className="relative mx-auto mt-10 h-[480px] w-full max-w-sm select-none sm:h-[500px]">
          {/* Background placeholder cards (stack illusion) */}
          {[2, 1].map((offset) => (
            <div
              key={offset}
              aria-hidden
              className="absolute inset-0 rounded-3xl border border-border/60 bg-card/70 shadow-md"
              style={{
                transform: `translateY(${offset * 10}px) scale(${1 - offset * 0.04})`,
                opacity: 0.45 - offset * 0.15,
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

        {/* Controls */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to card ${i + 1}: ${STEP_LABELS[i]}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                }`}
              />
            ))}
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
          {isCashout ? "Tap to shuffle again" : `${STEP_LABELS[index]} • tap card to continue`}
        </p>
      </div>
    </section>
  );
}

/* ---------------- Phone frame chrome (on-brand) ---------------- */

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
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-[2rem] border bg-[#0B1220] p-3 shadow-2xl ${
        cashout
          ? "border-primary/70 shadow-primary/40"
          : "border-border/70 shadow-primary/10"
      }`}
    >
      {/* Phone status bar */}
      <div className="flex items-center justify-between px-3 pt-1 text-[10px] font-medium text-white/60">
        <span className="tabular-nums">9:41</span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-1 rounded-full bg-white/60" />
          <span className="h-1 w-1.5 rounded-full bg-white/60" />
          <span className="h-1 w-2 rounded-full bg-white/60" />
          <span className="ml-1 rounded-sm border border-white/40 px-1 text-[8px]">100%</span>
        </span>
      </div>

      {/* App header */}
      <div className="mt-2 flex items-center justify-between rounded-2xl bg-white/[0.04] px-3 py-2 ring-1 ring-white/5">
        <div className="flex items-center gap-2">
          <CsseMark className="h-5 w-5 text-white" />
          <span className="text-[13px] font-semibold tracking-tight text-white">
            cssebets
          </span>
        </div>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
          Step {step} / {TOTAL}
        </span>
      </div>

      {/* Inner screen */}
      <div className="relative mt-3 flex-1 overflow-hidden rounded-2xl bg-gradient-to-b from-[#0F1830] to-[#0A1020] p-4 text-white ring-1 ring-white/5">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
          {label}
        </div>
        {children}
      </div>

      {/* Footer hint */}
      <div className="mt-2 flex items-center justify-between px-2 pb-1 text-[10px] uppercase tracking-wider text-white/40">
        <span>Preview</span>
        <span className="inline-flex items-center gap-1 font-bold text-primary">
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
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <Icon className="h-3.5 w-3.5 text-white/50" />
      <span className={`text-xs ${value ? "text-white" : "text-white/40"} tracking-tight`}>
        {mask && value ? "•".repeat(value.length) : value || placeholder}
      </span>
    </div>
  );
}

function RegisterScreen() {
  return (
    <div className="flex h-full flex-col">
      <h3 className="text-lg font-bold text-white">Welcome back</h3>
      <p className="mt-0.5 text-[11px] text-white/60">Sign in to keep predicting.</p>
      <div className="mt-4 space-y-2.5">
        <FakeInput icon={Mail} value="you@cssebets.com" />
        <FakeInput icon={Lock} value="supersecret" mask />
      </div>
      <button
        type="button"
        className="mt-4 flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/30"
      >
        Sign in <ArrowRight className="h-3.5 w-3.5" />
      </button>
      <div className="mt-3 text-center text-[10px] text-white/50">
        New here? <span className="font-semibold text-primary">Create an account</span>
      </div>
      <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[10px] leading-snug text-white/60">
        ⏱ New accounts get admin approval in 30 min – 6 hrs.
      </div>
    </div>
  );
}

function PointsRequestScreen() {
  return (
    <div className="flex h-full flex-col">
      <h3 className="text-lg font-bold text-white">Request points</h3>
      <p className="mt-0.5 text-[11px] text-white/60">Top up your wallet by bank transfer.</p>

      <div className="mt-3 rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 p-3 ring-1 ring-primary/40">
        <div className="text-[9px] font-bold uppercase tracking-wider text-primary/90">Amount</div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-[10px] text-white/60">pts</span>
          <span className="text-2xl font-black tabular-nums text-white">5,000</span>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-[10px]">
          <span className="text-white/60">Bank</span>
          <span className="font-semibold text-white">CSSEBets Ltd.</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-[10px]">
          <span className="text-white/60">Reference</span>
          <span className="font-mono font-semibold text-primary">CSSE-8421</span>
        </div>
      </div>

      <button
        type="button"
        className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/30"
      >
        <Banknote className="h-3.5 w-3.5" /> Submit request
      </button>
    </div>
  );
}

function UploadProofScreen() {
  return (
    <div className="flex h-full flex-col">
      <h3 className="text-lg font-bold text-white">Upload proof</h3>
      <p className="mt-0.5 text-[11px] text-white/60">Attach your receipt for faster approval.</p>

      <motion.div
        initial={{ scale: 0.96 }}
        animate={{ scale: 1 }}
        transition={{ repeat: Infinity, repeatType: "reverse", duration: 1.6 }}
        className="mt-4 grid place-items-center rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 py-6"
      >
        <Upload className="h-6 w-6 text-primary" />
        <div className="mt-2 text-[11px] font-semibold text-white">Tap to upload</div>
        <div className="text-[9px] text-white/50">JPG, PNG or PDF · max 5 MB</div>
      </motion.div>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/[0.04] p-2 ring-1 ring-primary/30">
        <FileCheck2 className="h-4 w-4 text-primary" />
        <div className="flex-1">
          <div className="text-[11px] font-semibold text-white">receipt-8421.jpg</div>
          <div className="text-[9px] text-white/50">218 KB · uploaded</div>
        </div>
        <CheckCircle2 className="h-4 w-4 text-primary" />
      </div>

      <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[10px] leading-snug text-white/60">
        Both you and admin confirm to close the transaction.
      </div>
    </div>
  );
}

function WalletScreen() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Your wallet</h3>
        <Wallet className="h-4 w-4 text-primary" />
      </div>

      <div className="mt-2 rounded-2xl bg-gradient-to-br from-primary/30 via-primary/15 to-transparent p-4 ring-1 ring-primary/40">
        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary/90">Balance</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <motion.span
            key="bal"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-black tabular-nums text-white drop-shadow"
          >
            42,860
          </motion.span>
          <span className="text-xs font-semibold text-primary">pts</span>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-primary">
          <TrendingUp className="h-3 w-3" /> +12,500 this week
        </div>
      </div>

      <div className="mt-3 text-[9px] font-bold uppercase tracking-wider text-white/50">
        Recent activity
      </div>
      <div className="mt-1.5 space-y-1.5">
        {[
          { label: "Bet won · BRA vs ARG", amt: "+8,400", up: true },
          { label: "Top-up approved", amt: "+5,000", up: true },
          { label: "Bet placed · ESP vs CPV", amt: "−1,200", up: false },
        ].map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-1.5 text-[10px]"
          >
            <span className="text-white/80">{r.label}</span>
            <span className={`font-bold tabular-nums ${r.up ? "text-primary" : "text-rose-300"}`}>
              {r.amt}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CashoutScreen() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-black text-white">Cashout 🎉</h3>
        <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
          Approved
        </span>
      </div>

      <div className="mt-2 rounded-2xl bg-gradient-to-br from-primary/40 via-primary/20 to-transparent p-4 ring-1 ring-primary/60">
        <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary">
          Payout amount
        </div>
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 14 }}
          className="mt-1 text-4xl font-black tabular-nums text-white drop-shadow"
        >
          $4,286
        </motion.div>
        <div className="mt-1 text-[10px] text-white/70">42,860 pts · 1 pt = $0.10</div>
      </div>

      <div className="mt-3 space-y-1.5 text-[10px]">
        <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2">
          <span className="text-white/60">To bank</span>
          <span className="font-semibold text-white">•••• 4421</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2">
          <span className="text-white/60">Arrives in</span>
          <span className="font-semibold text-primary">24 hrs – 7 days</span>
        </div>
      </div>

      <button
        type="button"
        className="mt-auto flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/40"
      >
        Confirm cashout <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

        <span>You did it 🎉</span>
        <span className="inline-flex items-center gap-1 font-bold text-emerald-50">
          Restart <span className="text-base leading-none">↺</span>
        </span>
      </div>
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
      <span className="absolute left-1 top-0.5 text-[8px] font-black text-emerald-900">$</span>
      <span className="absolute right-1 top-0.5 text-[8px] font-black text-emerald-900">$</span>
      <span className="absolute bottom-0.5 left-1 text-[8px] font-black text-emerald-900">$</span>
      <span className="absolute bottom-0.5 right-1 text-[8px] font-black text-emerald-900">$</span>
      <div className="absolute inset-0 grid place-items-center font-serif text-sm font-black text-emerald-900">
        100
      </div>
    </div>
  );
}
