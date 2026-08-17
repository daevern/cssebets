import { useCountUp } from "@/hooks/use-count-up";

/**
 * Balance read-out that rolls its digits from the previous value to the new
 * one instead of snapping. Purely presentational — the underlying number is
 * whatever the query/optimistic cache already holds.
 */
export function AnimatedBalance({
  value,
  durationMs = 600,
  maximumFractionDigits = 2,
  minimumFractionDigits,
  className,
  prefixSign,
}: {
  value: number;
  durationMs?: number;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  className?: string;
  /** Render a leading "+" for positive values. */
  prefixSign?: boolean;
}) {
  const animated = useCountUp(Number.isFinite(value) ? value : 0, durationMs);
  const text = animated.toLocaleString(undefined, {
    maximumFractionDigits,
    minimumFractionDigits,
  });
  return (
    <span className={className} data-testid="animated-balance">
      {prefixSign && value > 0 ? "+" : ""}
      {text}
    </span>
  );
}
