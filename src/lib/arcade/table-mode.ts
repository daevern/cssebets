import type { ArcadeGameKey } from "@/lib/arcade/sound";

const TABLE_GAMES = new Set<string>([]);


/** True on a live cabinet route (`/arcade/plinko` …), not the lobby. */
export function isArcadeTablePath(pathname: string): boolean {
  const seg = pathname.split("/arcade/")[1]?.split("/")[0] ?? "";
  return TABLE_GAMES.has(seg);
}

export function arcadeTableGame(pathname: string): ArcadeGameKey | null {
  const seg = pathname.split("/arcade/")[1]?.split("/")[0] ?? "";
  return TABLE_GAMES.has(seg) ? (seg as ArcadeGameKey) : null;
}
