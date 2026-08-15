/** Server-only helpers shared by Hi-Lo, Dice and Fortune Wheel. */

import type { MiniProduct } from "@/lib/arcade/mini-math";

const LABEL: Record<MiniProduct, string> = {
  hilo: "Hi-Lo",
  dice: "Dice",
  wheel: "Fortune Wheel",
  keno: "Keno",
  crash: "Crash",
  towers: "Dragon Towers",
  poker: "Video Poker",
};

export function mapMiniError(product: MiniProduct, message: string): string {
  const m = message || "";
  const name = LABEL[product];
  if (m.includes("INSUFFICIENT_BALANCE")) return "Not enough points in your wallet.";
  if (m.includes("BELOW_MIN_STAKE")) return "Stake is below the minimum.";
  if (m.includes("ABOVE_MAX_STAKE")) return "Stake is above the maximum.";
  if (m.includes("MAINTENANCE_MODE")) return `${name} is under maintenance.`;
  if (m.includes("NO_ACTIVE_CONFIG")) return `${name} is not configured yet.`;
  if (m.includes("DAILY_LIMIT")) return "Daily round limit reached.";
  if (m.includes("EXPOSURE_LIMIT") || m.includes("CAPACITY"))
    return "That stake exceeds the current table limit.";
  if (m.includes("ROUND_NOT_FOUND")) return "Round not found.";
  if (m.includes("ROUND_ALREADY_SETTLED")) return "That round is already finished.";
  if (m.includes("ROUND_EXPIRED")) return "That run expired — start a new one.";
  if (m.includes("NOTHING_TO_COLLECT")) return "Make at least one call before collecting.";
  if (m.includes("IMPOSSIBLE_GUESS")) return "That call cannot win — pick the other side.";
  if (m.includes("INVALID_TARGET")) return "Pick a target between 2 and 98.";
  if (m.includes("INVALID_PICKS")) return "Pick between 1 and 10 numbers.";
  if (m.includes("INVALID_DIFFICULTY")) return "That tower difficulty is not available.";
  if (m.includes("INVALID_TILE")) return "Pick a tile on the current row.";
  if (m.includes("TOWER_COMPLETE")) return "The tower is already topped out.";
  if (m.includes("INVALID_AUTO_CASHOUT")) return "That auto cash-out is outside the table limits.";
  if (m.includes("ROUND_IN_PROGRESS")) return "You already have a run in flight.";
  if (m.includes("INVALID_DIRECTION") || m.includes("INVALID_GUESS") || m.includes("INVALID_RISK"))
    return "Invalid selection.";
  if (m.includes("INVALID_CLIENT_SEED")) return "Invalid client seed.";
  if (m.includes("UNAUTHORIZED")) return "Please sign in again.";
  return m || "Something went wrong.";
}

/** Round shape safe to hand to the browser (never exposes an unrevealed seed). */
export function publicMiniRound(r: any) {
  if (!r) return null;
  const settled = String(r.status) === "SETTLED";
  return {
    id: r.id as string,
    product: String(r.product) as MiniProduct,
    status: String(r.status),
    outcome: (r.outcome ?? null) as "WIN" | "LOSS" | "PUSH" | "VOID" | null,
    stake: Number(r.stake ?? 0),
    multiplier: Number(r.multiplier ?? 0),
    grossReturn: Number(r.gross_return ?? 0),
    userNet: Number(r.user_net ?? 0),
    stepCount: Number(r.step_count ?? 0),
    state: (r.state ?? {}) as Record<string, any>,
    clientSeed: (r.client_seed ?? null) as string | null,
    serverSeedHash: String(r.server_seed_hash ?? ""),
    serverSeed: settled ? ((r.server_seed ?? null) as string | null) : null,
    nonce: Number(r.nonce ?? 0),
    randomHex: (r.random_hex ?? null) as string | null,
    verificationId: String(r.verification_id ?? ""),
    configVersion: Number(r.config_version ?? 1),
    createdAt: r.created_at as string,
    settledAt: (r.settled_at ?? null) as string | null,
  };
}

export type PublicMiniRound = NonNullable<ReturnType<typeof publicMiniRound>>;

export async function enforceMiniRateLimit(product: MiniProduct, userId: string) {
  const { enforceRateLimit } = await import("@/lib/rate-limit.functions");
  try {
    await enforceRateLimit(`${product}:${userId}`, "arcade_spin");
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "RATE_LIMITED") throw new Error("Too many rounds — please slow down.");
    if (msg === "RATE_LIMIT_UNAVAILABLE") return;
    throw e;
  }
}
