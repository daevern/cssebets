import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Activity,
  BarChart3,
  Wallet as WalletIcon,
  FileCheck2,
  History,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  accent: string; // gradient end color
  tag: string;
};

const FEATURES: Feature[] = [
  {
    icon: Activity,
    label: "Live Match Tracker",
    desc: "Follow every World Cup fixture in real time with second-by-second updates.",
    accent: "#22d3ee",
    tag: "01 · Live",
  },
  {
    icon: BarChart3,
    label: "Reference Odds",
    desc: "Transparent, market-grade odds on every fixture before you commit a point.",
    accent: "#a78bfa",
    tag: "02 · Odds",
  },
  {
    icon: WalletIcon,
    label: "Virtual Wallet",
    desc: "A clean ledger of every credit, debit, and payout — no hidden movements.",
    accent: "#34d399",
    tag: "03 · Wallet",
  },
  {
    icon: FileCheck2,
    label: "Point Requests",
    desc: "Convert cash to points with a fast, admin-reviewed approval flow.",
    accent: "#f59e0b",
    tag: "04 · Requests",
  },
  {
    icon: History,
    label: "Bet History",
    desc: "Every stake, every result. Filter, search, and replay your past plays.",
    accent: "#f472b6",
    tag: "05 · History",
  },
  {
    icon: ShieldCheck,
    label: "Secure & Audited",
    desc: "Every action logged, every payout reviewed. Built to be trusted.",
    accent: "#60a5fa",
    tag: "06 · Trust",
  },
];

function Icon3D({
  Icon,
  accent,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="relative h-20 w-20 [perspective:600px]">
      {/* glow */}
      <div
        className="absolute -inset-3 rounded-3xl opacity-60 blur-2xl"
        style={{ background: `radial-gradient(closest-side, ${accent}, transparent 70%)` }}
      />
      <motion.div
        whileHover={{ rotateX: -12, rotateY: 14 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
        className="relative h-full w-full rounded-2xl border border-white/10 [transform-style:preserve-3d]"
        style={{
          background: `linear-gradient(135deg, ${accent}33, transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.25))`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 18px 40px -18px ${accent}88, 0 2px 0 rgba(0,0,0,0.4)`,
        }}
      >
        {/* highlight */}
        <div
          className="absolute inset-0 rounded-2xl opacity-70"
          style={{
            background:
              "linear-gradient(160deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 35%)",
          }}
        />
        {/* icon plate */}
        <div className="absolute inset-0 grid place-items-center [transform:translateZ(20px)]">
          <Icon className="h-9 w-9" />
        </div>
        {/* bottom edge */}
        <div
          className="absolute -bottom-1 left-2 right-2 h-2 rounded-b-2xl opacity-60 blur-sm"
          style={{ background: accent }}
        />
      </motion.div>
    </div>
  );
}

export function FeaturesShowcase() {
  const trackRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const headerY = useTransform(scrollYProgress, [0, 1], [40, -40]);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.85), behavior: "smooth" });
  };

  return (
    <section
      id="features"
      ref={sectionRef}
      className="relative overflow-hidden border-b border-border bg-background"
    >
      {/* ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(40% 50% at 80% 10%, color-mix(in oklab, var(--primary) 25%, transparent), transparent), radial-gradient(35% 45% at 10% 90%, #a78bfa33, transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, #ffffff22, transparent)" }}
      />

      <div className="relative mx-auto max-w-6xl px-4 pt-16 sm:pt-20">
        <motion.div
          style={{ y: headerY }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              The toolkit
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">features</h2>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              Six interlocking surfaces engineered for sharp, transparent play.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollBy(-1)}
              aria-label="Previous feature"
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 text-foreground transition hover:bg-card hover:scale-105"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => scrollBy(1)}
              aria-label="Next feature"
              className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card/60 text-foreground transition hover:bg-card hover:scale-105"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* carousel */}
      <div className="relative mt-10 pb-20">
        {/* edge fades */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent"
        />

        <div
          ref={trackRef}
          className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 sm:px-8"
          style={{ scrollbarWidth: "none" }}
        >
          {FEATURES.map((f, i) => (
            <motion.article
              key={f.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="group relative snap-start shrink-0 basis-[78%] sm:basis-[44%] lg:basis-[30%]"
            >
              <div
                className="relative h-full overflow-hidden rounded-3xl border border-border bg-card p-6 transition-all duration-500 hover:-translate-y-1"
                style={{
                  boxShadow: `0 30px 60px -40px ${f.accent}66`,
                }}
              >
                {/* sheen on hover */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                  style={{
                    background: `radial-gradient(60% 50% at 100% 0%, ${f.accent}33, transparent 60%)`,
                  }}
                />
                <div className="flex items-start justify-between">
                  <Icon3D Icon={f.icon} accent={f.accent} />
                  <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    {f.tag}
                  </span>
                </div>
                <h3 className="mt-8 text-xl font-semibold tracking-tight">{f.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>

                {/* footer line */}
                <div className="mt-8 flex items-center justify-between border-t border-border/60 pt-4 text-xs text-muted-foreground">
                  <span>included</span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: f.accent, boxShadow: `0 0 12px ${f.accent}` }}
                  />
                </div>
              </div>
            </motion.article>
          ))}
          <div className="shrink-0 basis-4" aria-hidden />
        </div>
      </div>

      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}`}</style>
    </section>
  );
}

export default FeaturesShowcase;
