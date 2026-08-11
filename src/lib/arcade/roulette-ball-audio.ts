import { arcadeSound } from "./sound";

/**
 * Procedural roulette ball audio (Web Audio, no samples).
 *
 * A real wheel makes one continuous sound: the ivory ball hissing round the
 * track, its pitch and brightness falling as it loses speed, punctuated by
 * discrete fret impacts as it drops. Sample playback can't follow the ball's
 * actual velocity, so this synthesises the bed live from the animation and
 * fires short noise transients on each real collision.
 *
 * Presentation only — nothing here reads or affects the spin result.
 */
class RouletteBallAudio {
  private ctx: AudioContext | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private band: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private out: GainNode | null = null;
  private running = false;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.5;
      this.out.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private noiseBuffer(ctx: AudioContext) {
    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Start the rolling bed. Safe to call repeatedly. */
  start() {
    if (arcadeSound.getMuted()) return;
    const ctx = this.ensure();
    if (!ctx || this.running) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx);
      src.loop = true;

      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 2400;
      band.Q.value = 3.2;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      src.connect(band).connect(gain).connect(this.out!);
      src.start();

      this.noise = src;
      this.band = band;
      this.gain = gain;
      this.running = true;
    } catch {
      /* audio is a nicety — never break a spin */
    }
  }

  /**
   * Track the ball each frame.
   * @param speed  normalised angular speed, 0..1
   * @param onTrack true while the ball is still riding the outer track
   */
  setVelocity(speed: number, onTrack: boolean) {
    if (!this.running || !this.ctx || !this.gain || !this.band) return;
    const s = Math.max(0, Math.min(1, speed));
    const t = this.ctx.currentTime;
    const targetGain = (onTrack ? 0.16 : 0.07) * (0.25 + s * 0.75);
    const targetFreq = 700 + s * 3200 * (onTrack ? 1 : 0.6);
    try {
      this.gain.gain.setTargetAtTime(targetGain, t, 0.05);
      this.band.frequency.setTargetAtTime(targetFreq, t, 0.06);
      this.band.Q.setTargetAtTime(onTrack ? 3.2 : 1.6, t, 0.1);
    } catch {
      /* ignore */
    }
  }

  /** One fret/deflector impact. `energy` is 0..1 relative to the first hop. */
  hop(energy: number) {
    if (arcadeSound.getMuted()) return;
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const e = Math.max(0.05, Math.min(1, energy));
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(ctx);

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1500 + e * 2600;
      bp.Q.value = 6;

      const g = ctx.createGain();
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22 * e + 0.03, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + e * 0.06);

      src.connect(bp).connect(g).connect(this.out!);
      src.start(t);
      src.stop(t + 0.22);
    } catch {
      /* ignore */
    }
  }

  /** The ball drops into its pocket: short thud, then silence. */
  settle() {
    const ctx = this.ctx;
    if (ctx && !arcadeSound.getMuted()) {
      try {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const t = ctx.currentTime;
        osc.type = "sine";
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.16);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        osc.connect(g).connect(this.out!);
        osc.start(t);
        osc.stop(t + 0.3);
      } catch {
        /* ignore */
      }
    }
    this.stop();
  }

  /** Mirror the shared mute switch: silence the bed immediately when muted. */
  setMuted(muted: boolean) {
    if (muted) this.stop();
  }

  stop() {
    if (this.gain && this.ctx) {
      try {
        this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
      } catch {
        /* ignore */
      }
    }
    const src = this.noise;
    this.noise = null;
    this.band = null;
    this.gain = null;
    this.running = false;
    if (src) {
      window.setTimeout(() => {
        try {
          src.stop();
          src.disconnect();
        } catch {
          /* ignore */
        }
      }, 320);
    }
  }
}

export const rouletteBallAudio = new RouletteBallAudio();
