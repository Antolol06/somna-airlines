/**
 * Procedural sound design (Web Audio). No audio files: every texture —
 * distant engines, cabin hum, dream pads, rain, ocean, dawn birds — is
 * synthesised in the browser. Silent until the visitor opts in.
 */
type LayerId = 'engine' | 'cabin' | 'pad' | 'space' | 'morning' | 'rain' | 'ocean' | 'white' | 'hum';

export type Mix = Partial<Record<LayerId, number>>;

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  reverb!: ConvolverNode;
  layers = new Map<LayerId, GainNode>();
  enabled = false;
  private mix: Mix = {};
  private birdsTimer: number | null = null;

  private noiseBuffer(kind: 'white' | 'pink' | 'brown', seconds = 4) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.2;
        }
      }
    }
    return buf;
  }

  private noise(kind: 'white' | 'pink' | 'brown') {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer(kind);
    src.loop = true;
    src.start(this.ctx!.currentTime + Math.random() * 0.1);
    return src;
  }

  private layer(id: LayerId) {
    const g = this.ctx!.createGain();
    g.gain.value = 0;
    g.connect(this.master);
    this.layers.set(id, g);
    return g;
  }

  private lfo(freq: number, depth: number, target: AudioParam, type: OscillatorType = 'sine') {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    o.type = type;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
  }

  private build() {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    // reverb
    this.reverb = ctx.createConvolver();
    const irLen = ctx.sampleRate * 4;
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
    }
    this.reverb.buffer = ir;
    const revGain = ctx.createGain();
    revGain.gain.value = 0.55;
    this.reverb.connect(revGain).connect(this.master);

    // engine — distant turbofan: brown noise + low tonal hum, slow swell
    {
      const g = this.layer('engine');
      const n = this.noise('brown');
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      lp.Q.value = 0.3;
      const swell = ctx.createGain();
      swell.gain.value = 0.8;
      this.lfo(0.07, 0.18, swell.gain);
      this.lfo(0.05, 120, lp.frequency);
      n.connect(lp).connect(swell).connect(g);
      for (const f of [58, 87, 116]) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        o.type = 'sine';
        const og = ctx.createGain();
        og.gain.value = f === 58 ? 0.05 : 0.018;
        o.connect(og).connect(g);
        o.start();
      }
      const hi = this.noise('pink');
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      bp.Q.value = 0.7;
      const hg = ctx.createGain();
      hg.gain.value = 0.05;
      hi.connect(bp).connect(hg).connect(g);
    }
    // cabin — soft pressurised hum
    {
      const g = this.layer('cabin');
      const n = this.noise('pink');
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      n.connect(lp).connect(g);
      const o = ctx.createOscillator();
      o.frequency.value = 112;
      const og = ctx.createGain();
      og.gain.value = 0.012;
      o.connect(og).connect(g);
      o.start();
    }
    // pad — warm, slow chord through the reverb
    {
      const g = this.layer('pad');
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.Q.value = 0.6;
      this.lfo(0.04, 380, lp.frequency);
      lp.connect(g);
      lp.connect(this.reverb);
      const notes = [110, 164.81, 207.65, 246.94, 329.63];
      notes.forEach((f, i) => {
        for (const det of [-6, 5]) {
          const o = ctx.createOscillator();
          o.type = i % 2 ? 'sine' : 'triangle';
          o.frequency.value = f;
          o.detune.value = det;
          const og = ctx.createGain();
          og.gain.value = 0.028;
          this.lfo(0.03 + i * 0.011, 0.014, og.gain);
          o.connect(og).connect(lp);
          o.start();
        }
      });
    }
    // space — high, airy shimmer
    {
      const g = this.layer('space');
      const notes = [440, 554.37, 659.25, 830.61];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = 0.0;
        this.lfo(0.05 + i * 0.023, 0.018, og.gain);
        o.connect(og);
        og.connect(this.reverb);
        og.connect(g);
        o.start();
      });
      const n = this.noise('pink');
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3200;
      bp.Q.value = 2;
      const ng = ctx.createGain();
      ng.gain.value = 0.02;
      n.connect(bp).connect(ng).connect(g);
    }
    // morning — light wind; birds scheduled separately
    {
      const g = this.layer('morning');
      const n = this.noise('pink');
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 0.4;
      const wg = ctx.createGain();
      wg.gain.value = 0.35;
      this.lfo(0.09, 0.2, wg.gain);
      n.connect(bp).connect(wg).connect(g);
    }
    // rain
    {
      const g = this.layer('rain');
      const n = this.noise('white');
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 600;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6500;
      const rg = ctx.createGain();
      rg.gain.value = 0.5;
      this.lfo(0.3, 0.08, rg.gain, 'triangle');
      n.connect(hp).connect(lp).connect(rg).connect(g);
      const n2 = this.noise('brown');
      const lp2 = ctx.createBiquadFilter();
      lp2.type = 'lowpass';
      lp2.frequency.value = 300;
      n2.connect(lp2).connect(g);
    }
    // ocean
    {
      const g = this.layer('ocean');
      const n = this.noise('pink');
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      this.lfo(0.085, 420, lp.frequency);
      const og = ctx.createGain();
      og.gain.value = 0.7;
      this.lfo(0.085, 0.5, og.gain);
      n.connect(lp).connect(og).connect(g);
    }
    // white noise
    {
      const g = this.layer('white');
      const n = this.noise('white');
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3800;
      const wg = ctx.createGain();
      wg.gain.value = 0.35;
      n.connect(lp).connect(wg).connect(g);
    }
    // hum — deep cabin drone
    {
      const g = this.layer('hum');
      const n = this.noise('brown');
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180;
      n.connect(lp).connect(g);
    }
  }

  private ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.build();
    this.birdsTimer = window.setInterval(() => this.bird(), 900);
    return true;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) {
      if (!this.ensure()) return;
      this.ctx!.resume();
      this.master.gain.cancelScheduledValues(this.ctx!.currentTime);
      this.master.gain.setTargetAtTime(0.9, this.ctx!.currentTime, 0.6);
      this.apply(2.5);
    } else if (this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    }
  }

  setMix(mix: Mix, seconds = 2.2) {
    this.mix = mix;
    if (this.enabled) this.apply(seconds);
  }

  private apply(seconds: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.layers.forEach((g, id) => {
      const v = this.mix[id] ?? 0;
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(v, t, seconds / 3);
    });
  }

  private bird() {
    if (!this.ctx || !this.enabled) return;
    const level = this.mix.morning ?? 0;
    if (level < 0.05 || Math.random() > 0.55) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.4;
    const chirps = 1 + Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 2200;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = Math.random() * 1.6 - 0.8;
    for (let i = 0; i < chirps; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const s = t + i * (0.09 + Math.random() * 0.05);
      o.frequency.setValueAtTime(base, s);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), s + 0.05);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, s + 0.09);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.03 * level, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.1);
      o.connect(g);
      if (pan) g.connect(pan);
      else g.connect(this.master);
      o.start(s);
      o.stop(s + 0.12);
    }
    if (pan) {
      pan.connect(this.master);
      pan.connect(this.reverb);
    }
  }

  /** Small UI tick. */
  blip(freq = 880) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.08);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
    o.start(t);
    o.stop(t + 0.25);
  }

  /** Soft bell for the wake-up moment. */
  chime() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [523.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const s = t + i * 0.18;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.05 / (1 + i * 0.4), s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 3.2);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.reverb);
      o.start(s);
      o.stop(s + 3.4);
    });
  }
}

export const audio = new AudioEngine();

export const CHAPTER_MIX: Record<string, Mix> = {
  hero: { engine: 0.55, space: 0.08 },
  cabin: { cabin: 0.4, pad: 0.12 },
  showcase: { pad: 0.28 },
  globe: { space: 0.38, pad: 0.1 },
  selection: { cabin: 0.18, pad: 0.16 },
  booking: { pad: 0.2 },
  finale: { engine: 0.32, pad: 0.26, morning: 0.08 },
};
