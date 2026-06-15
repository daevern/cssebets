import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  getOnboardingStatus,
  logOnboardingEvent,
  markOnboardingComplete,
  markOnboardingSkipped,
  markTourComplete,
} from "@/lib/onboarding.functions";
import { TOURS, FULL_TOUR_ORDER, type TourDef, type TourStep } from "./tours.config";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

type TourContextValue = {
  startTour: (tourKey: string, opts?: { chain?: boolean }) => void;
  startFullTour: () => void;
  isTourActive: boolean;
  hasCompleted: (tourKey: string) => boolean;
  status: ReturnType<typeof useOnboardingStatusQuery>["data"] | undefined;
  refetchStatus: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

function useOnboardingStatusQuery() {
  const { user } = useAuth();
  const fn = useServerFn(getOnboardingStatus);
  return useQuery({
    queryKey: ["onboarding-status", user?.id],
    queryFn: () => fn({}),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const status = useOnboardingStatusQuery();
  const router = useRouter();
  const location = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();

  const markCompleteFn = useServerFn(markTourComplete);
  const logFn = useServerFn(logOnboardingEvent);
  const completeFullFn = useServerFn(markOnboardingComplete);
  const skipFullFn = useServerFn(markOnboardingSkipped);

  const [activeTour, setActiveTour] = useState<TourDef | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [chain, setChain] = useState<string[]>([]);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const safeLog = useCallback(
    (tourKey: string, event: "started" | "completed" | "skipped" | "step_viewed", stepIndex?: number) => {
      logFn({ data: { tourKey, event, stepIndex } }).catch(() => {});
    },
    [logFn],
  );

  const hasCompleted = useCallback(
    (k: string) => Boolean(status.data?.tourProgress?.[k]),
    [status.data],
  );

  // Start a single tour
  const startTour = useCallback(
    (tourKey: string, opts?: { chain?: boolean }) => {
      const def = TOURS[tourKey];
      if (!def) return;
      // Navigate to the tour's route if not already there
      if (location.pathname !== def.route) {
        router.navigate({ to: def.route as any });
      }
      setActiveTour(def);
      setStepIndex(0);
      if (!opts?.chain) setChain([]);
      safeLog(def.key, "started", 0);
    },
    [location.pathname, router, safeLog],
  );

  const startFullTour = useCallback(() => {
    const order = [...FULL_TOUR_ORDER];
    const first = order.shift();
    if (!first) return;
    setChain(order);
    startTour(first, { chain: true });
  }, [startTour]);

  const finishCurrent = useCallback(
    async (skipped = false) => {
      const cur = activeTour;
      setActiveTour(null);
      setStepIndex(0);
      setTargetRect(null);
      if (!cur) return;
      safeLog(cur.key, skipped ? "skipped" : "completed", stepIndex);
      try {
        await markCompleteFn({ data: { tourKey: cur.key } });
        qc.invalidateQueries({ queryKey: ["onboarding-status", user?.id] });
      } catch {}
      // Continue chain
      if (!skipped && chain.length > 0) {
        const [next, ...rest] = chain;
        setChain(rest);
        setTimeout(() => startTour(next, { chain: true }), 350);
      } else if (chain.length > 0 && skipped) {
        setChain([]);
        try {
          await skipFullFn({});
          qc.invalidateQueries({ queryKey: ["onboarding-status", user?.id] });
        } catch {}
      } else if (chain.length === 0 && cur && FULL_TOUR_ORDER.includes(cur.key as any)) {
        // last in chain finished
        try {
          await completeFullFn({});
          qc.invalidateQueries({ queryKey: ["onboarding-status", user?.id] });
        } catch {}
      }
    },
    [activeTour, chain, completeFullFn, markCompleteFn, qc, safeLog, skipFullFn, startTour, stepIndex, user?.id],
  );

  const next = useCallback(() => {
    if (!activeTour) return;
    if (stepIndex + 1 >= activeTour.steps.length) {
      finishCurrent(false);
    } else {
      setStepIndex((i) => i + 1);
      safeLog(activeTour.key, "step_viewed", stepIndex + 1);
    }
  }, [activeTour, finishCurrent, safeLog, stepIndex]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  // Target tracking
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!activeTour) {
      setTargetRect(null);
      return;
    }
    const step = activeTour.steps[stepIndex];
    if (!step) return;

    const update = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
      } else {
        setTargetRect(null);
      }
    };

    // initial scroll
    const tryScroll = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    tryScroll();
    update();

    const loop = () => {
      update();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => update();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [activeTour, stepIndex]);

  // Keyboard
  useEffect(() => {
    if (!activeTour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finishCurrent(true);
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTour, finishCurrent, next, prev]);

  const value = useMemo<TourContextValue>(
    () => ({
      startTour,
      startFullTour,
      isTourActive: !!activeTour,
      hasCompleted,
      status: status.data,
      refetchStatus: () => status.refetch(),
    }),
    [activeTour, hasCompleted, startFullTour, startTour, status],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {activeTour && (
        <TourOverlay
          step={activeTour.steps[stepIndex]}
          stepIndex={stepIndex}
          total={activeTour.steps.length}
          tourLabel={activeTour.label}
          rect={targetRect}
          onNext={next}
          onPrev={prev}
          onSkip={() => finishCurrent(true)}
        />
      )}
    </TourContext.Provider>
  );
}

function TourOverlay({
  step,
  stepIndex,
  total,
  tourLabel,
  rect,
  onNext,
  onPrev,
  onSkip,
}: {
  step: TourStep;
  stepIndex: number;
  total: number;
  tourLabel: string;
  rect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  if (typeof window === "undefined") return null;

  const pad = 8;
  const hasTarget = !!rect && rect.width > 0 && rect.height > 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Compute tooltip position
  let tooltipStyle: React.CSSProperties;
  if (hasTarget && rect) {
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const placeBelow = spaceBelow > 220 || spaceBelow > spaceAbove;
    const tooltipTop = placeBelow ? Math.min(rect.bottom + 12, vh - 240) : Math.max(rect.top - 12 - 220, 12);
    const tooltipLeft = Math.max(12, Math.min(rect.left, vw - 340));
    tooltipStyle = { top: tooltipTop, left: tooltipLeft, width: Math.min(340, vw - 24) };
  } else {
    tooltipStyle = { top: vh / 2 - 110, left: vw / 2 - Math.min(170, vw / 2 - 12), width: Math.min(340, vw - 24) };
  }

  const cutout = hasTarget && rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      {/* Backdrop with SVG mask */}
      <svg className="absolute inset-0 w-full h-full pointer-events-auto" onClick={() => {}}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {cutout && (
              <rect
                x={cutout.left}
                y={cutout.top}
                width={cutout.width}
                height={cutout.height}
                rx="12"
                ry="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#tour-mask)" />
      </svg>

      {/* Highlight ring */}
      {cutout && (
        <div
          className="absolute rounded-xl ring-2 ring-primary shadow-[0_0_0_4px_rgba(59,130,246,0.25)] pointer-events-none animate-pulse"
          style={{
            top: cutout.top,
            left: cutout.left,
            width: cutout.width,
            height: cutout.height,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="absolute pointer-events-auto rounded-xl border bg-card text-card-foreground shadow-2xl p-4 space-y-3"
        style={tooltipStyle}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-primary font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            {tourLabel}
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
            onClick={onSkip}
            aria-label="Skip tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div>
          <h3 className="font-bold text-base">{step.title}</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{step.body}</p>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground tabular-nums">
            Step {stepIndex + 1} of {total}
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={onSkip}>
              Skip
            </Button>
            <Button variant="outline" size="sm" onClick={onPrev} disabled={stepIndex === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={onNext}>
              {stepIndex + 1 >= total ? "Done" : "Next"}
              {stepIndex + 1 < total && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>
        {/* progress bar */}
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((stepIndex + 1) / total) * 100}%` }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
