export const SETTLED_RPS_FIELDS =
  "id, status, player_choice, server_choice, outcome, stake, multiplier, gross_return, user_net, " +
  "client_seed, server_seed_hash, nonce, hmac_input, random_hex, verification_id, config_version, " +
  "prepared_at, settled_at, expires_at, processing_ms, created_at";

export function mapRpsError(message: string): string {
  const m = message || "";
  if (m.includes("INSUFFICIENT_BALANCE")) return "Not enough points in your wallet.";
  if (m.includes("BELOW_MIN_STAKE")) return "Stake is below the minimum.";
  if (m.includes("ABOVE_MAX_STAKE")) return "Stake is above the maximum.";
  if (m.includes("MAINTENANCE_MODE")) return "Rock–Paper–Scissors is under maintenance.";
  if (m.includes("NO_ACTIVE_CONFIG")) return "Rock–Paper–Scissors is not configured yet.";
  if (m.includes("DAILY_LIMIT")) return "Daily round limit reached.";
  if (m.includes("EXPOSURE_LIMIT")) return "That stake exceeds the maximum return limit.";
  if (m.includes("ROUND_NOT_FOUND")) return "Round not found.";
  if (m.includes("ROUND_ALREADY_USED")) return "That round was already played.";
  if (m.includes("ROUND_EXPIRED")) return "That round expired — starting a fresh one.";
  if (m.includes("IDEMPOTENCY_CONFLICT")) return "That round was already played with a different move.";
  if (m.includes("INVALID_CHOICE")) return "Invalid move.";
  if (m.includes("INVALID_CLIENT_SEED")) return "Invalid client seed.";
  if (m.includes("UNAUTHORIZED")) return "Please sign in again.";
  return m || "Something went wrong.";
}

export function publicRpsRound(r: any) {
  if (!r) return null;
  return {
    id: r.id as string,
    status: String(r.status),
    playerChoice: r.player_choice as "ROCK" | "PAPER" | "SCISSORS" | null,
    serverChoice: r.server_choice as "ROCK" | "PAPER" | "SCISSORS" | null,
    outcome: r.outcome as "WIN" | "LOSS" | "DRAW" | null,
    stake: Number(r.stake ?? 0),
    multiplier: Number(r.multiplier ?? 0),
    grossReturn: Number(r.gross_return ?? 0),
    userNet: Number(r.user_net ?? 0),
    clientSeed: r.client_seed ?? null,
    serverSeedHash: r.server_seed_hash as string,
    nonce: Number(r.nonce ?? 0),
    hmacInput: r.hmac_input ?? null,
    randomHex: r.random_hex ?? null,
    verificationId: r.verification_id as string,
    settledAt: r.settled_at ?? null,
    processingMs: r.processing_ms == null ? null : Number(r.processing_ms),
  };
}

export async function enforceRpsRateLimit(userId: string) {
  const { enforceRateLimit } = await import("@/lib/rate-limit.functions");
  try {
    await enforceRateLimit(`rps:${userId}`, "arcade_rps");
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "RATE_LIMITED" || msg === "RATE_LIMIT_UNAVAILABLE") {
      throw new Error("Too many rounds — please slow down.");
    }
    throw e;
  }
}