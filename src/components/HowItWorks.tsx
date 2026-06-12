import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";

const steps = [
  {
    n: 1,
    title: "Register",
    desc: "Create an account or sign in.",
    detail:
      "All new users must await admin approval. Admin approval could take 30 minutes to 6 hours.",
  },
  {
    n: 2,
    title: "Request points",
    desc: "Convert cash to virtual points.",
    detail:
      "Users will need to make payment via bank transfer to the respective cssebets account and submit receipt. Points will be issued upon admin approval. Admin point approval could take 30 minutes to 6 hours.",
  },
  {
    n: 3,
    title: "Upload proof",
    desc: "Confirm your request for admin review.",
    detail:
      "For all point requests and point cashouts, user and admin will need to send each other the respective image/PDF of receipt to confirm the transaction.",
  },
  {
    n: 4,
    title: "Place bets",
    desc: "Pick a match and track your result.",
    detail:
      "Once points are deposited in your account, head over to the BETS section and place bets on Matches or your overall Winner for the FIFA WORLD CUP 2026.",
  },
];

const cashoutDetail =
  "Once you are ready to take profits, head over to the Payout section and simply cashout. Send a request to convert points back to cash. Upon admin approval, point-to-cash conversion and the cash-to-bank process will take between 24 hours and 7 days.";

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
  const cashoutOpacity = useTransform(scrollYProgress, [0.82, 0.95], [0, 1]);
  const cashoutY = useTransform(scrollYProgress, [0.82, 1], [20, 0]);
  const cashoutScale = useTransform(scrollYProgress, [0.82, 1], [0.9, 1]);

  const cashoutRef = useRef<HTMLDivElement>(null);
  const [raining, setRaining] = useState(false);
  useEffect(() => {
    const el = cashoutRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setRaining(true);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="how" className="relative border-b border-border bg-card/30">
      {raining && <MoneyRain />}
      <div className="mx-auto max-w-5xl px-4 py-16">
        <div className="text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">How It Works</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            cssebets is a betting platform where users can view FIFA WORLD CUP matches,
            check reference odds, request virtual points, place match bets, and track
            their results through a transparent wallet.
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
                  <FlipPanel n={s.n} title={s.title} desc={s.desc} detail={s.detail} />
                </motion.div>
              );
            })}
          </div>

          {/* Cashout dollar-bill graphic */}
          <motion.div
            ref={cashoutRef}
            style={{ opacity: cashoutOpacity, y: cashoutY, scale: cashoutScale }}
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
  detail,
}: {
  n: number;
  title: string;
  desc: string;
  detail: string;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      className="group block w-full text-left [perspective:1000px]"
      aria-pressed={flipped}
      aria-label={`${title} — tap to ${flipped ? "hide" : "show"} details`}
    >
      <div
        className="relative h-40 w-full transition-transform duration-500 [transform-style:preserve-3d] sm:h-44"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* Front */}
        <div className="absolute inset-0 rounded-xl border bg-card p-4 text-card-foreground shadow [backface-visibility:hidden] sm:p-5">
          <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground shadow-lg shadow-primary/30">
            {n}
          </div>
          <div className="text-sm font-semibold sm:text-base">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{desc}</div>
          <div className="absolute bottom-2 right-3 text-[10px] uppercase tracking-wider text-muted-foreground/70 group-hover:text-primary">
            Tap to flip
          </div>
        </div>
        {/* Back */}
        <div
          className="absolute inset-0 overflow-auto rounded-xl border border-primary/40 bg-primary/5 p-4 text-card-foreground shadow [backface-visibility:hidden] sm:p-5"
          style={{ transform: "rotateY(180deg)" }}
        >
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">
            Step {n} · {title}
          </div>
          <p className="text-xs leading-relaxed text-foreground/90 sm:text-sm">{detail}</p>
          <div className="absolute bottom-2 right-3 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Tap to flip back
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

function MoneyRain() {
  const bills = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 4,
        duration: 4 + Math.random() * 5,
        rotate: -45 + Math.random() * 90,
        spin: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360),
        scale: 0.6 + Math.random() * 0.8,
      })),
    [],
  );
  // Auto-stop after 12s to avoid forever animation
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setOn(false), 12000);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {bills.map((b) => (
        <motion.div
          key={b.id}
          initial={{ y: "-15%", opacity: 0, rotate: b.rotate }}
          animate={{ y: "115%", opacity: [0, 1, 1, 0.9], rotate: b.rotate + b.spin }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            ease: "easeIn",
            repeat: Infinity,
            repeatDelay: Math.random() * 2,
          }}
          className="absolute top-0"
          style={{ left: `${b.left}%`, transform: `scale(${b.scale})` }}
        >
          <MiniBill />
        </motion.div>
      ))}
    </div>
  );
}

function MiniBill() {
  return (
    <div
      className="relative h-10 w-20 rounded-sm border-2 border-emerald-900/70 bg-gradient-to-br from-emerald-200 via-emerald-100 to-emerald-300 shadow-lg"
      style={{ boxShadow: "0 6px 14px -6px rgba(6,78,59,0.6), inset 0 0 0 1px rgba(255,255,255,0.4)" }}
    >
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
