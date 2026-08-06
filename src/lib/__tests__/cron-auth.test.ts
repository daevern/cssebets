import { describe, expect, it } from "vitest";
import {
  authorizeCronRequest,
  extractCronSecret,
  timingSafeEqualString,
} from "@/lib/cron-auth.server";

function req(headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/public/hooks/health-check", {
    method: "POST",
    headers,
  });
}

describe("extractCronSecret", () => {
  it("reads Bearer token", () => {
    expect(extractCronSecret(req({ Authorization: "Bearer secret-abc" }))).toBe("secret-abc");
  });

  it("reads x-cron-secret", () => {
    expect(extractCronSecret(req({ "x-cron-secret": "from-header" }))).toBe("from-header");
  });

  it("prefers Authorization Bearer over x-cron-secret", () => {
    expect(
      extractCronSecret(
        req({ Authorization: "Bearer first", "x-cron-secret": "second" }),
      ),
    ).toBe("first");
  });

  it("returns null when missing", () => {
    expect(extractCronSecret(req())).toBeNull();
  });
});

describe("timingSafeEqualString", () => {
  it("matches equal strings", () => {
    expect(timingSafeEqualString("abc", "abc")).toBe(true);
  });

  it("rejects unequal strings and length mismatches", () => {
    expect(timingSafeEqualString("abc", "abd")).toBe(false);
    expect(timingSafeEqualString("abc", "ab")).toBe(false);
  });
});

describe("authorizeCronRequest", () => {
  it("accepts valid Bearer secret in production", () => {
    const result = authorizeCronRequest(req({ Authorization: "Bearer s3cret" }), {
      secret: "s3cret",
      nodeEnv: "production",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts valid x-cron-secret in production", () => {
    const result = authorizeCronRequest(req({ "x-cron-secret": "s3cret" }), {
      secret: "s3cret",
      nodeEnv: "production",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects invalid secret in production", async () => {
    const result = authorizeCronRequest(req({ Authorization: "Bearer wrong" }), {
      secret: "s3cret",
      nodeEnv: "production",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body).toEqual({ ok: false, error: "unauthorized" });
    }
  });

  it("rejects missing secret header in production", async () => {
    const result = authorizeCronRequest(req(), {
      secret: "s3cret",
      nodeEnv: "production",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("fails closed when env secret is missing in production", async () => {
    const result = authorizeCronRequest(req({ Authorization: "Bearer anything" }), {
      secret: "",
      nodeEnv: "production",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("allows through when secret unset in non-production", () => {
    const result = authorizeCronRequest(req(), {
      secret: "",
      nodeEnv: "development",
    });
    expect(result.ok).toBe(true);
  });
});
