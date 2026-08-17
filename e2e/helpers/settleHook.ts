const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";

/** Trigger football settlement for finished events (same path as the cron hook). */
export async function postFootballSettle(): Promise<{ ok: boolean; body: unknown }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.CRON_HOOK_SECRET;
  if (secret) headers["x-cron-secret"] = secret;

  const res = await fetch(`${BASE}/api/public/hooks/football-settle`, {
    method: "POST",
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`football-settle ${res.status}: ${JSON.stringify(body)}`);
  }
  return { ok: true, body };
}
