/**
 * Shared Sentry options for client + Cloudflare Workers server.
 * DSN unset → SDK no-ops (local/CI safe).
 */

export function sentryDsn(): string | undefined {
  const fromVite =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_SENTRY_DSN as string | undefined)
      : undefined;
  const fromProcess =
    typeof process !== "undefined"
      ? process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN
      : undefined;
  const dsn = (fromProcess || fromVite || "").trim();
  return dsn || undefined;
}

export function sentryEnvironment(): string {
  if (typeof process !== "undefined") {
    return (
      process.env.SENTRY_ENVIRONMENT ||
      process.env.MODE ||
      process.env.NODE_ENV ||
      "development"
    );
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE) {
    return String(import.meta.env.MODE);
  }
  return "development";
}

/** Default 20% of traces; override with SENTRY_TRACES_SAMPLE_RATE (0–1). */
export function sentryTracesSampleRate(): number {
  const raw =
    (typeof process !== "undefined" && process.env.SENTRY_TRACES_SAMPLE_RATE) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SENTRY_TRACES_SAMPLE_RATE) ||
    "0.2";
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0.2;
  return Math.min(1, n);
}

export function sentryEnabled(): boolean {
  return Boolean(sentryDsn());
}
