// Small, dependency-free retry helper with exponential backoff + jitter.
// Isolated to the football feature so the World Cup path stays untouched.

export type RetryOptions = {
  retries?: number;         // total attempts = retries + 1
  baseMs?: number;          // initial delay before first retry
  maxMs?: number;           // cap for backoff
  factor?: number;          // exponential factor
  jitter?: number;          // 0..1 additive random fraction of the delay
  isRetryable?: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
};

const DEFAULTS: Required<Omit<RetryOptions, "isRetryable" | "onRetry">> = {
  retries: 3,
  baseMs: 250,
  maxMs: 4_000,
  factor: 2,
  jitter: 0.3,
};

export function nextDelay(attempt: number, opts: RetryOptions = {}): number {
  const o = { ...DEFAULTS, ...opts };
  const raw = Math.min(o.baseMs * Math.pow(o.factor, attempt), o.maxMs);
  const jitter = raw * o.jitter * Math.random();
  return Math.round(raw + jitter);
}

const DEFAULT_RETRYABLE = (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  // Network noise, rate limits, transient 5xx are retryable; 4xx auth is not.
  if (/HTTP 4(0[0348]|29)/.test(msg)) return /HTTP 408|HTTP 429/.test(msg);
  if (/HTTP 5\d\d/.test(msg)) return true;
  if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network|timeout/i.test(msg)) return true;
  return false;
};

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const o = { ...DEFAULTS, ...opts };
  const isRetryable = opts.isRetryable ?? DEFAULT_RETRYABLE;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= o.retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt === o.retries || !isRetryable(err, attempt)) throw err;
      const delay = nextDelay(attempt, o);
      opts.onRetry?.(err, attempt, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
