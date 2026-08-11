/**
 * Stake Originals–style roulette ball audio.
 *
 * Presentation only — does not touch RNG, settlement, or pacing of the spin
 * animation. We cannot ship Stake's copyrighted samples; instead this
 * synthesises the same *mechanical model* their Originals table uses:
 *
 *   1. Track phase  — dense ivory-on-brass fret ticks whose interval tracks
 *                     ball angular speed (fast = almost a continuous rattle).
 *   2. Drop phase   — discrete wooden bounce clacks scaled by hop energy.
 *   3. Settle       — single deeper pocket thud.
 *   4. Bed          — quiet wheel-bearing rumble under the whole spin.
 *
 * All voices are Web Audio (noise bursts + bandpass), so pitch/volume can
 * follow the live ball without a long pre-baked MP3 drifting out of sync.
 */

type Phase = "idle" | "track" | "drop" | "settle";

export type RouletteAudioFrame = {
  /** 0..1 through the full spin. */
  t: number;
  phase: "track" | "drop";
  /** Absolute ball angular speed in deg/s (approx). */
  speedDegPerSec: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export class RouletteBallAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rumble: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private phase: Phase = "idle";
  private lastFretAt = 0;
  private muted = false;
  private noiseBuf: AudioBuffer | null = null;

  setMuted(next: boolean) {
    this.muted = next;
    if (next) this.stop();
    else if (this.master) this.master.gain.value = 1;
  }

  private ensure() {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      // Shared white-noise buffer reused for every click / whoosh burst.
      const len = Math.floor(this.ctx.sampleRate * 0.08);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Call on Spin — starts the bearing rumble and resets fret clock. */
  start() {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuf) return;
    this.stopVoices();
    this.phase = "track";
    this.lastFretAt = ctx.currentTime;

    // Soft low rumble (wheel bearing) — filtered noise, loops for the spin.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 140;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.045;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    this.rumble = { src, gain };
  }

  /**
   * Drive from the wheel RAF. Schedules fret ticks so the rattle densifies
   * and thins with ball speed — the signature Stake Originals rhythm.
   */
  update(frame: RouletteAudioFrame) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuf) return;
    if (this.phase === "idle" || this.phase === "settle") return;

    if (frame.phase === "drop" && this.phase === "track") {
      this.phase = "drop";
      // Drop: kill dense track frets; hops take over.
      if (this.rumble) {
        const now = ctx.currentTime;
        this.rumble.gain.gain.cancelScheduledValues(now);
        this.rumble.gain.gain.setValueAtTime(this.rumble.gain.gain.value, now);
        this.rumble.gain.gain.linearRampToValueAtTime(0.02, now + 0.25);
      }
      return;
    }

    if (frame.phase !== "track") return;

    // Stake-style density: ~28ms between frets at full speed → ~150ms near drop.
    const speed = clamp(frame.speedDegPerSec, 0, 2200);
    const speedNorm = clamp(speed / 1800, 0, 1);
    const interval = 0.028 + Math.pow(1 - speedNorm, 1.65) * 0.13;

    const now = ctx.currentTime;
    if (now - this.lastFretAt < interval) return;
    this.lastFretAt = now;

    // Faster → brighter / louder; slowing → darker / softer (ball losing energy).
    const freq = 2400 - (1 - speedNorm) * 1100;
    const vol = 0.12 + speedNorm * 0.22;
    const decay = 0.028 + (1 - speedNorm) * 0.02;
    this.fretClick(now, { freq, vol, decay, metallic: true });
  }

  /** One real frets bounce during the drop phase. */
  hop(energy: number) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    this.phase = "drop";
    const e = clamp(energy, 0.05, 1);
    // Heavier early hops: lower, louder, longer. Late hops: light ticks.
    this.fretClick(ctx.currentTime, {
      freq: 900 + (1 - e) * 1400,
      vol: 0.28 + e * 0.45,
      decay: 0.045 + e * 0.05,
      metallic: false,
    });
  }

  /** Final pocket sit. */
  settle() {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuf) return;
    this.phase = "settle";
    const t = ctx.currentTime;

    // Deeper wooden/ivory pocket thud.
    this.fretClick(t, { freq: 420, vol: 0.55, decay: 0.12, metallic: false });
    // Soft body resonance under it.
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.24);

    if (this.rumble) {
      this.rumble.gain.gain.cancelScheduledValues(t);
      this.rumble.gain.gain.setValueAtTime(this.rumble.gain.gain.value, t);
      this.rumble.gain.gain.linearRampToValueAtTime(0.0001, t + 0.35);
    }
    window.setTimeout(() => this.stop(), 400);
  }

  stop() {
    this.stopVoices();
    this.phase = "idle";
  }

  private stopVoices() {
    if (this.rumble) {
      try {
        this.rumble.src.stop();
      } catch {
        /* already stopped */
      }
      this.rumble = null;
    }
  }

  private fretClick(
    when: number,
    opts: { freq: number; vol: number; decay: number; metallic: boolean },
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = opts.freq;
    bp.Q.value = opts.metallic ? 6.5 : 2.2;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = opts.metallic ? 900 : 180;

    const g = ctx.createGain();
    const peak = clamp(opts.vol, 0, 0.85);
    g.gain.setValueAtTime(peak, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + opts.decay);

    src.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(when);
    src.stop(when + opts.decay + 0.01);
  }
}

export const rouletteBallAudio = new RouletteBallAudio();
