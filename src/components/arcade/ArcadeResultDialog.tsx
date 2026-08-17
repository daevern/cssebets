import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
import { useCountUp } from "@/hooks/use-count-up";
import { useArcadeSound, winSfxForRatio, type ArcadeGameKey } from "@/lib/arcade/sound";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { cn } from "@/lib/utils";

export type ArcadeResultTone = "win" | "loss" | "push";
export type ArcadeWinTier = "small" | "big" | "mega";

function reducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function tierFromRatio(ratio: number | undefined): ArcadeWinTier {
  if (!ratio || !Number.isFinite(ratio)) return "small";
  if (ratio > 10) return "mega";
  if (ratio >= 3) return "big";
  return "small";
}

const DEFAULT_PARTICLES = [
  "var(--color-neon)",
  "#ffd76a",
  "#ff9aa4",
  "#8ff0bd",
  "#7cc4ff",
];

/** Lightweight CSS confetti burst — no dependency, unmounts after ~1.2s. */
function ConfettiBurst({ count, palette }: { count: number; palette?: string[] }) {
  const colours = palette?.length ? palette : DEFAULT_PARTICLES;
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 90 + Math.random() * 130;
        return {
          id: i,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist - 40,
          delay: Math.random() * 140,
          size: 5 + Math.random() * 6,
          rot: Math.round(Math.random() * 540 - 270),
          colour: colours[i % colours.length],
        };
      }),
    [count, colours],
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      <style>{`@keyframes arcadeConfetti {
        0% { opacity: 1; transform: translate(0,0) rotate(0deg) scale(1); }
        100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(.6); }
      }`}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute left-1/2 top-1/2 block rounded-[1px]"
          style={
            {
              width: p.size,
              height: p.size * 1.6,
              background: p.colour,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
              animation: `arcadeConfetti 1100ms cubic-bezier(.2,.7,.3,1) ${p.delay}ms forwards`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * Shared celebratory / result pop-up for arcade games.
 * Shows the headline outcome, the net amount and optional detail + actions.
 */
export function ArcadeResultDialog({
  open,
  onOpenChange,
  tone,
  headline,
  net,
  detail,
  footer,
  /** Stake for the round — used to derive the win tier (net ÷ stake). */
  stake,
  /** Explicit ratio override when a game already knows its multiplier. */
  ratio,
  /** Optional per-game skin (accent, backdrop, particle palette). */
  game,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tone: ArcadeResultTone;
  headline: string;
  net: number;
  detail?: ReactNode;
  footer?: ReactNode;
  stake?: number;
  ratio?: number;
  game?: ArcadeGameKey;
}) {
  const { play } = useArcadeSound();
  const [showParticles, setShowParticles] = useState(false);
  const firedFor = useRef<string | null>(null);
  const theme = game ? ARCADE_THEMES[game] : null;

  const effectiveRatio =
    ratio ?? (stake && stake > 0 ? Math.abs(net) / stake : Math.abs(net) >= 100 ? 3 : 1);
  const tier = tierFromRatio(effectiveRatio);

  const animatedNet = useCountUp(open ? net : 0, tone === "loss" ? 400 : 700, 0);

  useEffect(() => {
    if (!open) {
      setShowParticles(false);
      firedFor.current = null;
      return;
    }
    const key = `${tone}:${net}:${headline}`;
    if (firedFor.current === key) return;
    firedFor.current = key;

    if (tone === "win") {
      play(winSfxForRatio(effectiveRatio));
      if (tier !== "small") {
        if (!reducedMotion()) setShowParticles(true);
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(tier === "mega" ? [18, 40, 18, 40, 60] : [15, 45, 25]);
        }
      }
    } else if (tone === "loss") {
      play("loss");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tone, net, headline]);

  useEffect(() => {
    if (!showParticles) return;
    const t = window.setTimeout(() => setShowParticles(false), 1200);
    return () => window.clearTimeout(t);
  }, [showParticles]);

  const winColourClass = theme ? undefined : "text-[var(--color-neon)]";
  const colour =
    tone === "win"
      ? winColourClass
      : tone === "loss"
        ? "text-red-400"
        : "text-[var(--color-ink)]";

  const isWin = tone === "win";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <StencilDialogContent
        kicker={
          theme
            ? `${theme.label} · ${tone === "push" ? "Push" : "Round settled"}`
            : tone === "push"
              ? "Push"
              : "Round settled"
        }
        title={headline}
        footer={
          <>
            {footer}
            <button
              type="button"
              onClick={() => {
                play("button");
                onOpenChange(false);
              }}
              className="h-9 rounded-full px-5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-black"
              style={{ background: theme?.accent ?? "var(--color-neon)" }}
            >
              Continue
            </button>
          </>
        }
      >
        <div className="relative pb-2 text-center" data-testid="arcade-result-dialog">
          {theme && (
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-6 -top-6 bottom-0 -z-20"
              style={{ background: theme.backdrop }}
            />
          )}
          {showParticles && (
            <ConfettiBurst count={tier === "mega" ? 30 : 16} palette={theme?.particles} />
          )}

          <div
            data-testid="arcade-result-net"
            className={cn(
              "relative font-display font-black leading-none tabular-nums",
              colour,
              isWin && tier === "mega"
                ? "text-[54px]"
                : isWin && tier === "big"
                  ? "text-[46px]"
                  : "text-[40px]",
            )}
            style={isWin && theme ? { color: theme.accent } : undefined}
          >
            {net > 0 ? "+" : ""}
            {animatedNet.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
            {isWin && tier === "mega" ? "mega win · points" : isWin && tier === "big" ? "big win · points" : "points"}
          </div>
          {detail && (
            <div className="mt-3 text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
              {detail}
            </div>
          )}
        </div>
      </StencilDialogContent>
    </Dialog>
  );
}
