const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";

function cronHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.CRON_HOOK_SECRET;
  if (secret) headers["x-cron-secret"] = secret;
  return headers;
}

async function postSettle(path: string, label: string): Promise<{ ok: boolean; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: cronHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${label} ${res.status}: ${JSON.stringify(body)}`);
  }
  return { ok: true, body };
}

/** Trigger football settlement for finished events (same path as the cron hook). */
export async function postFootballSettle() {
  return postSettle("/api/public/hooks/football-settle", "football-settle");
}

export async function postF1Settle() {
  return postSettle("/api/public/hooks/f1-settle", "f1-settle");
}

export async function postUfcSettle() {
  return postSettle("/api/public/hooks/ufc-settle", "ufc-settle");
}

export async function postHealthCheck() {
  return postSettle("/api/public/hooks/health-check", "health-check");
}
