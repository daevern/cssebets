import { describe, it, expect, vi } from "vitest";
import { withRetry, nextDelay } from "../services/retry";

describe("retry helper", () => {
  it("returns on first success without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const out = await withRetry(fn, { retries: 3, baseMs: 1 });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient HTTP 5xx then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 502"))
      .mockRejectedValueOnce(new Error("HTTP 503"))
      .mockResolvedValueOnce("ok");
    const out = await withRetry(fn, { retries: 3, baseMs: 1, maxMs: 2 });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries on HTTP 429 (rate limit)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 429"))
      .mockResolvedValueOnce("ok");
    const out = await withRetry(fn, { retries: 2, baseMs: 1 });
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry non-retryable 4xx", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("HTTP 401"));
    await expect(withRetry(fn, { retries: 5, baseMs: 1 })).rejects.toThrow("HTTP 401");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after N retries and throws last error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("HTTP 500"));
    await expect(withRetry(fn, { retries: 2, baseMs: 1 })).rejects.toThrow("HTTP 500");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respects custom isRetryable predicate", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("please-retry"))
      .mockResolvedValueOnce("ok");
    const out = await withRetry(fn, {
      retries: 2,
      baseMs: 1,
      isRetryable: (e) => e instanceof Error && e.message === "please-retry",
    });
    expect(out).toBe("ok");
  });

  it("fires onRetry with attempt + delay", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 500"))
      .mockResolvedValueOnce("ok");
    await withRetry(fn, { retries: 2, baseMs: 1, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][1]).toBe(0); // attempt index
  });

  it("nextDelay grows exponentially and respects cap", () => {
    const opts = { baseMs: 100, factor: 2, maxMs: 500, jitter: 0 };
    expect(nextDelay(0, opts)).toBe(100);
    expect(nextDelay(1, opts)).toBe(200);
    expect(nextDelay(2, opts)).toBe(400);
    expect(nextDelay(3, opts)).toBe(500); // capped
  });
});
