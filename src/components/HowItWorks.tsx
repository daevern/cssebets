import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform, useSpring, useInView } from "framer-motion";

type Step = {
  n: number;
  title: string;
  desc: string;
  hint: string;
  bullets: string[];
};

const steps: Step[] = [
  {
    n: 1,
    title: "Register",
    desc: "Create an account or sign in.",
    hint: "Takes under a minute.",
    bullets: [
      "Sign up with email or phone.",
      "New accounts need admin approval.",
      "Approval usually takes 30 min – 6 hrs.",
    ],
  },
  {
    n: 2,
    title: "Request points",
    desc: "Convert cash to virtual points to fund your wallet.",
    hint: "Request points to fund your wallet.",
    bullets: [
      "Bank transfer to the cssebets account.",
      "Submit your receipt in-app.",
      "Points credited after admin approval (30 min – 6 hrs).",
    ],
  },
  {
    n: 3,
    title: "Upload proof",
    desc: "Confirm your request for faster admin review.",
    hint: "Upload proof for faster approval.",
    bullets: [
      "Attach receipt image or PDF.",
      "Used for both top-ups and cashouts.",
      "Both sides confirm to close the transaction.",
    ],
  },
  {
    n: 4,
    title: "Place bets",
    desc: "Pick a match and track your result live.",
    hint: "Track all bets from your dashboard.",
    bullets: [
      "Open the BETS section for FIFA World Cup 2026.",
      "Bet on individual matches or the overall winner.",
      "Follow live results from your dashboard.",
    ],
  },
];

const cashoutDetail =
  "Once you're ready to take profits, head to the Payout section and request a cashout. After admin approval, point-to-cash and bank transfer typically take 24 hours – 7 days.";

// Hand-drawn arrow path through 4 panels arranged in a zigzag.
// viewBox is 100x160 stretched to fill via preserveAspectRatio="none".
// Stroke uses vector-effect="non-scaling-stroke" so the line keeps its width.
const ARROW_PATH =
  "M 22 14 C 55 14, 60 30, 78 34 C 102 40, -4 60, 22 70 C 55 78, 60 100, 78 106 C 95 112, 60 130, 50 140";

export function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 0.8", "end 0.4"],
  });

  // Step-and-hold mapping: arrow advances then pauses at each panel.
  const rawDraw = useTransform(
    scrollYProgress,
    [0, 0.15, 0.28, 0.42, 0.55, 0.7, 0.82, 1],
    [0, 0.34, 0.34, 0.66, 0.66, 0.92, 0.92, 1],
  );
  const pathLength = useSpring(rawDraw, { stiffness: 120, damping: 24, mass: 0.6 });

  const cashoutRef = useRef<HTMLDivElement>(null);
  const rainInView = useInView(cashoutRef, { amount: 0.3 });
  const [rainKey, setRainKey] = useState(0);
  useEffect(() => {
    if (rainInView) setRainKey((k) => k + 1);
  }, [rainInView]);

  return (
    <section id="how" className="relative border-b border-border bg-card/30">
      {rainInView && <MoneyRain key={rainKey} />}
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            4 simple steps
          </div>
          <h2 className="text-2xl font-bold sm:text-3xl">How It Works</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Get from sign-up to your first bet on the FIFA World Cup in minutes —
            then cash out winnings straight back to your bank.
          </p>
        </div>

        <div ref={sectionRef} className="relative mt-12">
          {/* Hand-drawn arrow overlay */}
          <svg
            className="pointer-events-none absolute inset-0 z-0 h-full w-full"
            viewBox="0 0 100 160"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <filter id="kid-rough" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="7" />
                <feDisplacementMap in="SourceGraphic" scale="2.2" />
              </filter>
              <marker
                id="kid-arrowhead"
                viewBox="0 0 12 12"
                refX="6"
                refY="6"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path
                  d="M 1 1 L 11 6 L 1 11 L 4 6 Z"
                  fill="var(--primary)"
                />
              </marker>
            </defs>

            {/* Faint guide path (full route) */}
            <path
              d={ARROW_PATH}
              fill="none"
              stroke="var(--primary)"
              strokeOpacity="0.12"
              strokeWidth="3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              filter="url(#kid-rough)"
            />
            {/* Animated drawn arrow */}
            <motion.path
              d={ARROW_PATH}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              filter="url(#kid-rough)"
              markerEnd="url(#kid-arrowhead)"
              style={{ pathLength, pathOffset: 0 }}
              initial={{ pathLength: 0 }}
            />
          </svg>

          {/* Panels in a zigzag grid */}
          <div className="relative z-10 grid grid-cols-2 gap-x-6 gap-y-8 sm:gap-x-16 sm:gap-y-12">
            {steps.map((s, i) => {
              const col = i % 2 === 0 ? "col-start-1" : "col-start-2";
              return (
                <motion.div
                  key={s.n}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className={`${col} row-start-${i + 1}`}
                  style={{ gridRowStart: i + 1 }}
                >
                  <FlipPanel n={s.n} title={s.title} desc={s.desc} hint={s.hint} bullets={s.bullets} />
                </motion.div>
              );
            })}
          </div>

          {/* Cashout dollar-bill graphic */}
          <motion.div
            ref={cashoutRef}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ margin: "-60px" }}
            transition={{ duration: 0.5 }}
            className="relative z-10 mt-12 flex justify-center"
          >
            <CashoutFlip />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FlipPanel({
  n,
  title,
  desc,
  hint,
  bullets,
}: {
  n: number;
  title: string;
  desc: string;
  hint: string;
  bullets: string[];
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      className="group block w-full text-left [perspective:1200px]"
      aria-pressed={flipped}
      aria-label={`Step ${n}: ${title} — tap to ${flipped ? "hide" : "show"} details`}
    >
      <div
        className="relative h-56 w-full transition-transform duration-[600ms] ease-[cubic-bezier(0.22,1,0.36,1)] [transform-style:preserve-3d] sm:h-60"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* Front */}
        <div className="absolute inset-0 flex flex-col rounded-2xl border bg-card p-5 text-card-foreground shadow-sm transition-shadow [backface-visibility:hidden] group-hover:border-primary/50 group-hover:shadow-lg group-hover:shadow-primary/10 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground shadow-lg shadow-primary/30">
              {n}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Step {n} of 4
            </div>
          </div>
          <div className="text-base font-semibold sm:text-lg">{title}</div>
          <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</div>
          <div className="mt-auto pt-4">
            <div className="text-[11px] italic text-primary/80">{hint}</div>
            <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 group-hover:text-primary">
              Tap to see details →
            </div>
          </div>
        </div>
        {/* Back */}
        <div
          className="absolute inset-0 flex flex-col overflow-auto rounded-2xl border border-primary/40 bg-primary/5 p-5 text-card-foreground shadow-lg [backface-visibility:hidden] sm:p-6"
          style={{ transform: "rotateY(180deg)" }}
        >
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            Step {n} · {title}
          </div>
          <ul className="space-y-2 text-sm leading-relaxed text-foreground/90">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-3 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            ← Tap to flip back
          </div>
        </div>
      </div>
    </button>
  );
}

function CashoutFlip() {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      className="block [perspective:1200px]"
      aria-pressed={flipped}
      aria-label={`Cashout — tap to ${flipped ? "hide" : "show"} details`}
    >
      <div
        className="relative h-56 w-[20rem] transition-transform duration-500 [transform-style:preserve-3d] sm:h-52 sm:w-[28rem]"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center [backface-visibility:hidden]">
          <CashoutBills />
          <div className="mt-3 text-center text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Tap to flip
          </div>
        </div>
        <div
          className="absolute inset-0 overflow-auto rounded-xl border border-emerald-700/50 bg-emerald-50/95 p-4 text-emerald-950 shadow-lg [backface-visibility:hidden] sm:p-5"
          style={{ transform: "rotateY(180deg)" }}
        >
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
            Cashout
          </div>
          <p className="text-xs leading-relaxed sm:text-sm">{cashoutDetail}</p>
        </div>
      </div>
    </button>
  );
}

function CashoutBills() {
  // Each letter rendered as a tiny "dollar bill" tile, fanned out.
  const letters = "CASHOUT".split("");
  const rotations = [-9, -5, -2, 0, 2, 5, 9];
  return (
    <div className="flex items-end justify-center gap-1 sm:gap-2">
      {letters.map((ch, i) => (
        <DollarBill key={i} letter={ch} rotate={rotations[i]} index={i} />
      ))}
    </div>
  );
}

function DollarBill({ letter, rotate, index }: { letter: string; rotate: number; index: number }) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0, rotate: 0 }}
      whileInView={{ y: 0, opacity: 1, rotate }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: 0.05 * index, type: "spring", stiffness: 140 }}
      className="relative h-16 w-12 shrink-0 select-none rounded-sm border-2 border-emerald-900/60 bg-gradient-to-br from-emerald-200 via-emerald-100 to-emerald-300 shadow-md sm:h-20 sm:w-16"
      style={{
        boxShadow: "0 6px 18px -8px rgba(6,78,59,0.6), inset 0 0 0 1px rgba(255,255,255,0.4)",
      }}
    >
      {/* Ornate inner border */}
      <div className="absolute inset-1 rounded-[2px] border border-emerald-800/50" />
      {/* Corner $ marks */}
      <span className="absolute left-1 top-0.5 text-[8px] font-black text-emerald-900">$</span>
      <span className="absolute right-1 top-0.5 text-[8px] font-black text-emerald-900">$</span>
      <span className="absolute bottom-0.5 left-1 text-[8px] font-black text-emerald-900">$</span>
      <span className="absolute bottom-0.5 right-1 text-[8px] font-black text-emerald-900">$</span>
      {/* Center letter */}
      <div
        className="absolute inset-0 grid place-items-center font-serif text-2xl font-black text-emerald-900 sm:text-3xl"
        style={{ textShadow: "0 1px 0 rgba(255,255,255,0.5)" }}
      >
        {letter}
      </div>
    </motion.div>
  );
}

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
const TOTAL_BILLS = 60;
const SPAWN_MS = 8000;
const PUSH_RADIUS = 110;
const PUSH_FORCE = 1400; // px/s impulse

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

  // Init bills once
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
    const gravity = 2200; // px/s^2
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

        // Pointer repulsion
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

        // Physics
        b.vy += gravity * dt;
        b.vx *= airDrag;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
        b.vr *= 0.97;

        // Walls
        if (b.x < 0) {
          b.x = 0;
          b.vx = -b.vx * 0.4;
        } else if (b.x > W - BILL_W) {
          b.x = W - BILL_W;
          b.vx = -b.vx * 0.4;
        }

        // Floor with slight randomness to form a pile
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
  // Crumpled bills get a skew + clip-path to look folded/wrinkled
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
      {/* Wrinkle highlights for crumpled bills */}
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
