/**
 * Rock–Paper–Scissors — pure helpers.
 *
 * These mirror `arcade_rps_draw` / `arcade_rps_settle` in Postgres exactly and
 * exist so the browser (verification dialog) and the test-suite can
 * independently reproduce what the server did. Nothing here is authoritative:
 * the server never reads a value derived on the client.
 */

export const RPS_MOVES = ["ROCK", "PAPER", "SCISSORS"] as const;
export type RpsMove = (typeof RPS_MOVES)[number];
export type RpsOutcome = "WIN" | "LOSS" | "DRAW";

/**
 * Unbiased byte -> move mapping. 255 is rejected so the accepted range
 * (0..254) divides evenly by 3; we walk the digest until a byte is accepted.
 */
export function moveFromDigest(digest: Uint8Array): RpsMove {
  for (let i = 0; i < digest.length; i++) {
    const b = digest[i];
    if (b < 255) return RPS_MOVES[b % 3];
  }
  return RPS_MOVES[0];
}

/** The exact string the server HMACs: `clientSeed:nonce:roundId`. */
export function rpsHmacInput(clientSeed: string, nonce: number, roundId: string): string {
  return `${clientSeed}:${nonce}:${roundId}`;
}

export function rpsOutcome(player: RpsMove, server: RpsMove): RpsOutcome {
  if (player === server) return "DRAW";
  if (
    (player === "ROCK" && server === "SCISSORS") ||
    (player === "PAPER" && server === "ROCK") ||
    (player === "SCISSORS" && server === "PAPER")
  ) {
    return "WIN";
  }
  return "LOSS";
}

export function rpsMultiplier(
  outcome: RpsOutcome,
  winMultiplier: number,
  drawMultiplier: number,
): number {
  if (outcome === "WIN") return winMultiplier;
  if (outcome === "DRAW") return drawMultiplier;
  return 0;
}

/** Gross return, rounded to 2dp the same way Postgres `round(x, 2)` does. */
export function rpsGrossReturn(stake: number, multiplier: number): number {
  return Math.round(stake * multiplier * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Browser crypto helpers (WebCrypto) — used by the verification tool. */
/* ------------------------------------------------------------------ */

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacSha256(keyText: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyText),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
