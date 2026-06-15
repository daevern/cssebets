import { useEffect, useRef, useState } from "react";

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

type Props = {
  count?: number;
  spawnMs?: number;
  className?: string;
  /** When true, position is fixed to viewport. Otherwise it fills its relative parent. */
  fixed?: boolean;
};

/**
 * Decorative falling money bills with mouse-repulsion physics.
 * Extracted from HowItWorks so it can be reused on the landing hero.
 */
export function MoneyRainBg({ count = 40, spawnMs = 6000, className = "", fixed = false }: Props) {
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
    billsRef.current = Array.from({ length: count }).map((_, i) => ({
      id: i,
      x: Math.random() * Math.max(0, W - BILL_W),
      y: -80 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 60,
      vy: 0,
      rot: -30 + Math.random() * 60,
      vr: (Math.random() - 0.5) * 240,
      scale: 0.45 + Math.random() * 0.6,
      crumpled: Math.random() < 0.35,
      spawned: false,
      spawnAt: (i / count) * spawnMs + Math.random() * 400,
    }));
    setTimeout(() => setReady(true), 0);
  }

  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const start = performance.now();
    let last = start;
    const gravity = 1800;
    const airDrag = 0.985;
    const restitution = 0.25;
    const PUSH_RADIUS = 110;
    const PUSH_FORCE = 1400;

    const onMove = (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      pointerRef.current = {
        x: e.clientX - (rect?.left ?? 0),
        y: e.clientY - (rect?.top ?? 0),
        active: true,
      };
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
      const rect = containerRef.current?.getBoundingClientRect();
      const H = rect?.height ?? window.innerHeight;
      const W = rect?.width ?? window.innerWidth;
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

        if (b.x < 0) { b.x = 0; b.vx = -b.vx * 0.4; }
        else if (b.x > W - BILL_W) { b.x = W - BILL_W; b.vx = -b.vx * 0.4; }

        const billFloor = floor - (b.id % 6) * 4;
        if (b.y > billFloor) {
          b.y = billFloor;
          if (Math.abs(b.vy) > 30) b.vy = -b.vy * restitution;
          else b.vy = 0;
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
      className={`${fixed ? "fixed" : "absolute"} inset-0 overflow-hidden ${className}`}
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
        boxShadow:
          "0 6px 14px -6px rgba(6,78,59,0.6), inset 0 0 0 1px rgba(255,255,255,0.4)",
        ...crumpleStyle,
      }}
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
