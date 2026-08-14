import * as React from "react";

/**
 * Tiny arcade sound engine — presentation only.
 * Lazy per-clip pools (identity pack). Shared UI clicks preload lightly;
 * game variants load on first play so mount stays cheap.
 */

export const SFX_NAMES = [
  "chip",
  "spin-start",
  "reveal-tick",
  "win-small",
  "win-big",
  "win-mega",
  "loss",
  "button",
  "collect",
  "plinko-tick",
  "roulette-spin",
  "roulette-settle",
  "treasure-chime",
  "treasure-blast",
  "card-snap",
  "card-flip",
  "rps-step",
  "rps-bank",
] as const;

export type SfxName = (typeof SFX_NAMES)[number];
export type ArcadeGameKey =
  | "plinko"
  | "roulette"
  | "treasure"
  | "blackjack"
  | "rps"
  | "hilo"
  | "dice"
  | "wheel"
  | "keno"
  | "crash";

const STORAGE_KEY = "arcade_sound_muted";
const POOL_SIZE = 2;

/** Shared house UI clips warmed on first gesture. */
const WARM_SFX: SfxName[] = ["button", "chip", "collect", "win-small", "loss"];

const VOLUMES: Record<SfxName, number> = {
  chip: 0.5,
  "spin-start": 0.45,
  "reveal-tick": 0.4,
  "win-small": 0.5,
  "win-big": 0.6,
  "win-mega": 0.7,
  loss: 0.45,
  button: 0.3,
  collect: 0.55,
  "plinko-tick": 0.42,
  "roulette-spin": 0.42,
  "roulette-settle": 0.52,
  "treasure-chime": 0.48,
  "treasure-blast": 0.52,
  "card-snap": 0.44,
  "card-flip": 0.42,
  "rps-step": 0.42,
  "rps-bank": 0.55,
};

export type SfxMoment =
  | "chip"
  | "reveal-tick"
  | "spin-start"
  | "settle"
  | "trap"
  | "step"
  | "bounce"
  | "collect"
  | "loss"
  | "button";

/** CSSE Originals identity map — each table owns a few signature moments. */
const VARIANTS: Partial<Record<ArcadeGameKey, Partial<Record<SfxMoment, SfxName>>>> = {
  plinko: { "reveal-tick": "plinko-tick", settle: "plinko-tick", bounce: "plinko-tick" },
  roulette: { "spin-start": "roulette-spin", settle: "roulette-settle", bounce: "roulette-settle" },
  treasure: { "reveal-tick": "treasure-chime", trap: "treasure-blast", settle: "treasure-chime" },
  blackjack: { "reveal-tick": "card-snap", settle: "card-flip", chip: "chip" },
  rps: { step: "rps-step", collect: "rps-bank", settle: "rps-step" },
  hilo: { "reveal-tick": "card-snap", step: "card-flip", settle: "card-flip", collect: "rps-bank" },
  dice: { "reveal-tick": "plinko-tick", settle: "plinko-tick", "spin-start": "spin-start" },
  wheel: { "spin-start": "roulette-spin", settle: "roulette-settle", "reveal-tick": "plinko-tick" },
  keno: { "reveal-tick": "treasure-chime", settle: "treasure-chime", "spin-start": "spin-start" },
  crash: { "spin-start": "spin-start", step: "rps-step", collect: "rps-bank", settle: "plinko-tick" },
};

export function sfxFor(game: ArcadeGameKey, moment: SfxMoment): SfxName {
  const variant = VARIANTS[game]?.[moment];
  if (variant) return variant;
  if (moment === "settle") return "reveal-tick";
  if (moment === "trap") return "loss";
  if (moment === "step") return "reveal-tick";
  if (moment === "bounce") return "reveal-tick";
  return moment as SfxName;
}

type PlayOptions = { rate?: number; volume?: number };

class ArcadeSoundEngine {
  private pools = new Map<SfxName, HTMLAudioElement[]>();
  private cursors = new Map<SfxName, number>();
  private listeners = new Set<() => void>();
  private armed = false;
  private armInstalled = false;
  muted = false;

  constructor() {
    if (typeof window === "undefined") return;
    try {
      this.muted = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      this.muted = false;
    }
  }

  private ensurePool(name: SfxName) {
    if (this.pools.has(name) || typeof window === "undefined") return;
    const pool: HTMLAudioElement[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const el = new Audio(`/sfx/${name}.mp3`);
      el.preload = "auto";
      el.volume = VOLUMES[name];
      pool.push(el);
    }
    this.pools.set(name, pool);
    this.cursors.set(name, 0);
  }

  /** Warm shared house clips only — game variants load on demand. */
  warmShared() {
    if (typeof window === "undefined") return;
    for (const name of WARM_SFX) this.ensurePool(name);
    this.installArmListeners();
  }

  /** Prefetch a game's signature clips (call when entering a table). */
  warmGame(game: ArcadeGameKey) {
    if (typeof window === "undefined") return;
    this.warmShared();
    const moments = Object.keys(VARIANTS[game] ?? {}) as SfxMoment[];
    for (const m of moments) this.ensurePool(sfxFor(game, m));
  }

  /** @deprecated use warmShared / warmGame — kept for call-site compat */
  load() {
    this.warmShared();
  }

  private installArmListeners() {
    if (this.armInstalled || typeof window === "undefined") return;
    this.armInstalled = true;
    const arm = () => {
      if (this.armed) return;
      this.armed = true;
      for (const pool of this.pools.values()) {
        const el = pool[0];
        if (!el) continue;
        const vol = el.volume;
        el.volume = 0;
        el.play()
          .then(() => {
            el.pause();
            el.currentTime = 0;
            el.volume = vol;
          })
          .catch(() => {
            el.volume = vol;
          });
      }
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
      window.removeEventListener("touchstart", arm);
    };
    window.addEventListener("pointerdown", arm, { passive: true });
    window.addEventListener("touchstart", arm, { passive: true });
    window.addEventListener("keydown", arm);
  }

  play(name: SfxName, opts: PlayOptions = {}) {
    if (this.muted || typeof window === "undefined") return;
    this.ensurePool(name);
    this.installArmListeners();
    const pool = this.pools.get(name);
    if (!pool) return;
    const i = this.cursors.get(name) ?? 0;
    this.cursors.set(name, (i + 1) % pool.length);
    const el = pool[i];
    try {
      el.pause();
      el.currentTime = 0;
      el.playbackRate = Math.min(3, Math.max(0.5, opts.rate ?? 1));
      el.volume = Math.min(1, Math.max(0, VOLUMES[name] * (opts.volume ?? 1)));
      void el.play().catch(() => {});
    } catch {
      /* audio is a nicety */
    }
  }

  setMuted(next: boolean) {
    this.muted = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* private mode */
    }
    if (next) {
      for (const pool of this.pools.values()) {
        for (const el of pool) {
          el.pause();
          el.currentTime = 0;
        }
      }
    }
    void import("./roulette-ball-audio").then(({ rouletteBallAudio }) => {
      rouletteBallAudio.setMuted(next);
    });
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getMuted = () => this.muted;
}

export const arcadeSound = new ArcadeSoundEngine();

export function winSfxForRatio(ratio: number): SfxName {
  if (ratio > 10) return "win-mega";
  if (ratio >= 3) return "win-big";
  return "win-small";
}

export function useArcadeSound(game?: ArcadeGameKey) {
  const muted = React.useSyncExternalStore(
    arcadeSound.subscribe,
    arcadeSound.getMuted,
    () => false,
  );

  React.useEffect(() => {
    if (game) arcadeSound.warmGame(game);
    else arcadeSound.warmShared();
  }, [game]);

  const play = React.useCallback((name: SfxName, opts?: PlayOptions) => {
    arcadeSound.play(name, opts);
  }, []);

  const playFor = React.useCallback(
    (g: ArcadeGameKey, moment: SfxMoment, opts?: PlayOptions) => {
      arcadeSound.play(sfxFor(g, moment), opts);
    },
    [],
  );

  const setMuted = React.useCallback((next: boolean) => arcadeSound.setMuted(next), []);
  const toggleMuted = React.useCallback(
    () => arcadeSound.setMuted(!arcadeSound.muted),
    [],
  );

  return { play, playFor, muted, setMuted, toggleMuted };
}
