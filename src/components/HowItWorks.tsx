import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Step = {
  n: number;
  title: string;
  hint: string;
  bullets: string[];
  tone: string;
};

const steps: Step[] = [
  {
    n: 1,
    title: "Register",
    hint: "Takes under a minute.",
    tone: "from-sky-500/20 to-indigo-500/10 border-sky-400/40",
    bullets: [
      "Sign up with email or phone.",
      "New accounts need admin approval.",
      "Approval usually takes 30 min – 6 hrs.",
    ],
  },
  {
    n: 2,
    title: "Request points",
    hint: "Fund your wallet.",
    tone: "from-violet-500/20 to-fuchsia-500/10 border-violet-400/40",
    bullets: [
      "Bank transfer to the cssebets account.",
      "Submit your receipt in-app.",
      "Points credited after admin approval (30 min – 6 hrs).",
    ],
  },
  {
    n: 3,
    title: "Upload proof",
    hint: "Faster admin review.",
    tone: "from-amber-500/20 to-orange-500/10 border-amber-400/40",
    bullets: [
      "Attach receipt image or PDF.",
      "Used for both top-ups and cashouts.",
      "Both sides confirm to close the transaction.",
    ],
  },
  {
    n: 4,
    title: "Place bets",
    hint: "Track from your dashboard.",
    tone: "from-rose-500/20 to-pink-500/10 border-rose-400/40",
    bullets: [
      "Open the BETS section for FIFA World Cup 2026.",
      "Bet on individual matches or the overall winner.",
      "Follow live results from your dashboard.",
    ],
  },
];

const cashoutDetail =
  "Head to the Payout section and request a cashout. After admin approval, point-to-cash and bank transfer typically take 24 hours – 7 days.";

const TOTAL = 5; // 4 steps + cashout

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
            Tap the deck to shuffle through every step — from sign-up to cashout.
          </p>
        </div>

        {/* Deck */}
        <div className="relative mx-auto mt-10 h-[440px] w-full max-w-sm select-none sm:h-[460px]">
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
                  : `Step ${index + 1} of ${TOTAL} — tap for next`
              }
            >
              {isCashout ? <CashoutCard /> : <StepCard step={steps[index]} />}
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
                aria-label={`Go to card ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                }`}
              />
            ))}
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
          {isCashout ? "Tap to shuffle again" : "Tap card to shuffle"}
        </p>
      </div>
    </section>
  );
}

function StepCard({ step }: { step: Step }) {
  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-3xl border bg-gradient-to-br ${step.tone} bg-card p-6 shadow-2xl shadow-primary/10 backdrop-blur-sm`}
    >
      {/* Corner index — like a playing card */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col items-start leading-none">
          <span className="text-4xl font-black text-foreground/90">{step.n}</span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Step / {TOTAL - 1}
          </span>
        </div>
        <div className="rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          cssebets
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-2xl font-bold sm:text-3xl">{step.title}</h3>
        <p className="mt-2 text-xs italic text-primary/90">{step.hint}</p>
      </div>

      <ul className="mt-5 space-y-3 text-sm leading-relaxed text-foreground/90">
        {step.bullets.map((b, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center justify-between pt-4 text-[11px] uppercase tracking-wider text-muted-foreground/80">
        <span>Tap for next</span>
        <span className="inline-flex items-center gap-1 font-bold text-primary">
          Shuffle <span className="text-base leading-none">→</span>
        </span>
      </div>

      {/* Mirrored corner index */}
      <div className="absolute bottom-5 left-5 rotate-180 leading-none">
        <span className="text-4xl font-black text-foreground/30">{step.n}</span>
      </div>
    </div>
  );
}

function CashoutCard() {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl border-2 border-emerald-500/60 bg-gradient-to-br from-emerald-500/25 via-emerald-400/15 to-emerald-700/25 p-6 shadow-2xl shadow-emerald-500/30">
      <div className="flex items-start justify-between">
        <div className="flex flex-col items-start leading-none">
          <span className="text-4xl font-black text-emerald-200">$</span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/80">
            Final card
          </span>
        </div>
        <div className="rounded-full border border-emerald-300/40 bg-emerald-950/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
          Payout
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-3xl font-black text-emerald-50 drop-shadow sm:text-4xl">
          Cashout!
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-emerald-50/90">{cashoutDetail}</p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <motion.div
            key={i}
            initial={{ y: 12, opacity: 0, rotate: -8 + i * 4 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 * i, type: "spring", stiffness: 160 }}
            className="rounded-md border-2 border-emerald-900/60 bg-gradient-to-br from-emerald-100 via-emerald-50 to-emerald-200 px-2 py-3 text-center font-serif text-xl font-black text-emerald-900 shadow-md"
          >
            $100
          </motion.div>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between pt-4 text-[11px] uppercase tracking-wider text-emerald-100/80">
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
