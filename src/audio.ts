import { params } from "./tuning";

// Sound: every effect and the music are synthesized with Web Audio, so there are no asset files.
// The audio context can only start after a user gesture, so nothing plays until the first key
// press. Effects take an optional `pan` (-1..1) and `gain` (0..1) for positional sounds.

let ac: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let musicFilter: BiquadFilterNode;
let reverb: ConvolverNode;
let noiseBuf: AudioBuffer;
let muted = false;

/** Start audio on the first user gesture (browsers block it before that). */
export function unlockAudio() {
  if (ac) {
    if (ac.state === "suspended") void ac.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ac.destination);
  sfxBus = ac.createGain();
  sfxBus.connect(master);
  musicFilter = ac.createBiquadFilter();
  musicFilter.type = "lowpass";
  musicFilter.frequency.value = 18000;
  musicBus = ac.createGain();
  musicBus.connect(musicFilter).connect(master);

  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // A small hall: decaying noise as the impulse response.
  reverb = ac.createConvolver();
  const len = ac.sampleRate * 2.4;
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  reverb.buffer = ir;
  const wet = ac.createGain();
  wet.gain.value = 0.35;
  reverb.connect(wet).connect(master);

  applyVolumes();
  music.start();
}

export function toggleMute() {
  muted = !muted;
  applyVolumes();
  return muted;
}

export function isMuted() {
  return muted;
}

/** Follow the volume sliders (call every frame; cheap). */
export function applyVolumes() {
  if (!ac) return;
  const a = params.audio.volume;
  const t = ac.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : a.master, t, 0.05);
  sfxBus.gain.setTargetAtTime(a.sfx, t, 0.05);
  musicBus.gain.setTargetAtTime(a.music, t, 0.05);
}

// ---------------------------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------------------------

interface Voice {
  /** Start delay (s). */
  at?: number;
  dur: number;
  vol: number;
  attack?: number;
  pan?: number;
  /** Send to the reverb (0..1). */
  wet?: number;
  bus?: AudioNode;
}

/** Envelope + pan + routing for a source; returns the node the source should connect to. */
function voice(v: Voice, t0: number): AudioNode {
  const g = ac!.createGain();
  const a = v.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(v.vol, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(a + 0.01, v.dur));
  let out: AudioNode = g;
  if (v.pan) {
    const p = ac!.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, v.pan));
    g.connect(p);
    out = p;
  }
  out.connect(v.bus ?? sfxBus);
  if (v.wet) {
    const w = ac!.createGain();
    w.gain.value = v.wet;
    out.connect(w).connect(reverb);
  }
  return g;
}

interface ToneOpts extends Voice {
  f: number;
  /** Glide to this frequency over the duration. */
  f2?: number;
  type?: OscillatorType;
  /** Low-pass cutoff. */
  lp?: number;
}

function tone(o: ToneOpts) {
  if (!ac) return;
  const t0 = ac.currentTime + (o.at ?? 0);
  const osc = ac.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + o.dur);
  let src: AudioNode = osc;
  if (o.lp) {
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = o.lp;
    osc.connect(f);
    src = f;
  }
  src.connect(voice(o, t0));
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

interface NoiseOpts extends Voice {
  f: number;
  f2?: number;
  q?: number;
  filter?: BiquadFilterType;
}

function noise(o: NoiseOpts) {
  if (!ac) return;
  const t0 = ac.currentTime + (o.at ?? 0);
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = o.filter ?? "bandpass";
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f, t0);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + o.dur);
  src.connect(f).connect(voice(o, t0));
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + o.dur + 0.05);
}

/** A held noise sound whose loudness and pitch are set every frame (slide scrape, wind). */
class NoiseLoop {
  private g: GainNode | null = null;
  private f: BiquadFilterNode | null = null;
  constructor(private filter: BiquadFilterType, private q: number) {}
  set(vol: number, freq: number) {
    if (!ac) return;
    if (!this.g) {
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      this.f = ac.createBiquadFilter();
      this.f.type = this.filter;
      this.f.Q.value = this.q;
      this.g = ac.createGain();
      this.g.gain.value = 0;
      src.connect(this.f).connect(this.g).connect(sfxBus);
      src.start();
    }
    const t = ac.currentTime;
    this.g.gain.setTargetAtTime(vol, t, 0.06);
    this.f!.frequency.setTargetAtTime(freq, t, 0.06);
  }
}

const slideLoop = new NoiseLoop("bandpass", 1.6);
const windLoop = new NoiseLoop("lowpass", 0.7);

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// ---------------------------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------------------------

export interface At {
  pan?: number;
  gain?: number;
}

export const sfx = {
  jump() {
    tone({ f: 220, f2: 520, type: "triangle", dur: 0.16, vol: 0.22 });
    noise({ f: 900, f2: 2400, q: 0.8, dur: 0.18, vol: 0.12 });
  },
  doubleJump() {
    tone({ f: 440, f2: 880, type: "triangle", dur: 0.14, vol: 0.18 });
    tone({ f: 660, f2: 1320, type: "sine", dur: 0.22, vol: 0.12, at: 0.05, wet: 0.4 });
    noise({ f: 1500, f2: 4000, q: 0.7, dur: 0.22, vol: 0.12 });
  },
  /** Grabbing a rim; `speed` (per s) of the arrival makes it heavier. */
  grab(speed: number) {
    const k = Math.min(1, speed / 600);
    tone({ f: 140, f2: 70, type: "sine", dur: 0.12, vol: 0.25 + 0.2 * k });
    noise({ f: 700, f2: 300, q: 0.9, dur: 0.1 + 0.1 * k, vol: 0.18 + 0.15 * k, filter: "lowpass" });
  },
  /** The safety bounce below the rim. */
  netBounce() {
    tone({ f: 180, f2: 620, type: "sine", dur: 0.3, vol: 0.25, wet: 0.3 });
    tone({ f: 270, f2: 930, type: "triangle", dur: 0.25, vol: 0.08 });
  },
  /** Falling into the haze. */
  lost() {
    tone({ f: 600, f2: 80, type: "sine", dur: 1.2, vol: 0.2, wet: 0.5 });
    noise({ f: 1200, f2: 200, q: 0.6, dur: 1.3, vol: 0.12, attack: 0.2, filter: "lowpass" });
  },
  respawn() {
    for (const [i, n] of [72, 76, 79].entries()) tone({ f: midi(n), type: "sine", dur: 0.4, vol: 0.12, at: i * 0.06, wet: 0.6 });
  },
  /** Starting to wind up an attack. */
  aim(weapon: "sword" | "spear") {
    if (weapon === "sword") noise({ f: 3000, f2: 6000, q: 4, dur: 0.12, vol: 0.06 });
    else tone({ f: 300, f2: 420, type: "triangle", dur: 0.1, vol: 0.08 });
  },
  /** The attack reached full power. */
  charged() {
    tone({ f: midi(88), type: "sine", dur: 0.35, vol: 0.12, wet: 0.5 });
    tone({ f: midi(95), type: "sine", dur: 0.35, vol: 0.06, at: 0.03, wet: 0.5 });
  },
  swing(power: number) {
    noise({ f: 1800 + 1800 * power, f2: 500, q: 1.4, dur: 0.16 + 0.08 * power, vol: 0.25 + 0.15 * power, attack: 0.02 });
    if (power >= 1) tone({ f: 900, f2: 300, type: "sawtooth", dur: 0.18, vol: 0.05, lp: 2500 });
  },
  throwSpear(power: number) {
    noise({ f: 2500, f2: 900, q: 2, dur: 0.22 + 0.1 * power, vol: 0.2 + 0.1 * power, attack: 0.015 });
    tone({ f: 500 + 300 * power, f2: 200, type: "triangle", dur: 0.12, vol: 0.08 });
  },
  /** The player's hit lands on an enemy. */
  hitEnemy(kind: string, killed: boolean, at: At = {}) {
    const g = at.gain ?? 1;
    const pan = at.pan;
    if (kind === "queen") {
      tone({ f: 240, f2: 120, type: "sawtooth", dur: 0.25, vol: 0.18 * g, lp: 1800, pan });
      noise({ f: 1200, q: 1, dur: 0.15, vol: 0.2 * g, pan });
      return;
    }
    noise({ f: 2200, f2: 800, q: 1.2, dur: 0.07, vol: 0.3 * g, pan });
    tone({ f: kind === "ranged" ? 520 : 380, f2: 200, type: "square", dur: 0.08, vol: 0.08 * g, lp: 2000, pan });
    if (killed) {
      tone({ f: kind === "ranged" ? 900 : 700, f2: 120, type: "triangle", dur: 0.28, vol: 0.18 * g, pan, at: 0.03 });
      noise({ f: 4000, f2: 1500, q: 1, dur: 0.25, vol: 0.1 * g, pan, at: 0.03 });
    }
  },
  queenDeath() {
    tone({ f: 330, f2: 60, type: "sawtooth", dur: 1.6, vol: 0.2, lp: 1500, wet: 0.6 });
    noise({ f: 800, f2: 100, q: 0.6, dur: 1.4, vol: 0.25, filter: "lowpass", wet: 0.5 });
    for (let i = 0; i < 6; i++) tone({ f: midi(84 + [0, 3, 7, 10, 12, 15][i]!), type: "sine", dur: 0.6, vol: 0.06, at: 0.3 + i * 0.07, wet: 0.8 });
  },
  playerHurt() {
    tone({ f: 300, f2: 110, type: "square", dur: 0.18, vol: 0.14, lp: 1400 });
    noise({ f: 600, q: 0.8, dur: 0.14, vol: 0.25, filter: "lowpass" });
  },
  /** The sword knocks an orb out of the air. */
  block(at: At = {}) {
    tone({ f: 1800, type: "triangle", dur: 0.25, vol: 0.1 * (at.gain ?? 1), pan: at.pan, wet: 0.4 });
    tone({ f: 2700, type: "sine", dur: 0.2, vol: 0.06 * (at.gain ?? 1), pan: at.pan });
  },
  /** A projectile thuds into an island. */
  thud(at: At = {}) {
    noise({ f: 400, q: 1, dur: 0.08, vol: 0.12 * (at.gain ?? 1), pan: at.pan, filter: "lowpass" });
  },
  /** A ranged boid fires an orb. */
  orbShot(at: At = {}) {
    tone({ f: 700, f2: 1400, type: "sine", dur: 0.15, vol: 0.1 * (at.gain ?? 1), pan: at.pan });
    tone({ f: 350, f2: 700, type: "triangle", dur: 0.12, vol: 0.05 * (at.gain ?? 1), pan: at.pan });
  },
  /** A melee boid lunges. */
  lunge(at: At = {}) {
    noise({ f: 1200, f2: 3500, q: 3, dur: 0.14, vol: 0.12 * (at.gain ?? 1), pan: at.pan });
    tone({ f: 260, f2: 520, type: "sawtooth", dur: 0.1, vol: 0.04 * (at.gain ?? 1), pan: at.pan, lp: 1500 });
  },
  /** The queen gets angry: a growl rising over the `dur` (s) until her blast. */
  queenAnger(dur: number, at: At = {}) {
    const g = at.gain ?? 1;
    tone({ f: 90, f2: 260, type: "sawtooth", dur, vol: 0.14 * g, pan: at.pan, lp: 1200, attack: dur * 0.6 });
    noise({ f: 300, f2: 1800, q: 1.5, dur, vol: 0.12 * g, pan: at.pan, attack: dur * 0.8 });
  },
  /** The queen's blast: a shrill shriek over a deep, ringing whump. */
  queenBlast(at: At = {}) {
    const g = at.gain ?? 1;
    const pan = at.pan;
    tone({ f: 90, f2: 35, type: "sine", dur: 0.7, vol: 0.5 * g, pan });
    tone({ f: 1400, f2: 500, type: "sawtooth", dur: 0.35, vol: 0.09 * g, pan, lp: 3500, wet: 0.5 });
    tone({ f: 1870, f2: 660, type: "square", dur: 0.3, vol: 0.05 * g, pan, lp: 3000, at: 0.02 });
    noise({ f: 2500, f2: 300, q: 0.7, dur: 0.6, vol: 0.35 * g, pan, filter: "lowpass", wet: 0.6 });
    for (const [i, n] of [79, 75, 72].entries()) tone({ f: midi(n), type: "sine", dur: 0.7, vol: 0.06 * g, pan, at: 0.06 + i * 0.05, wet: 0.8 });
  },
  explosion(at: At = {}) {
    const g = at.gain ?? 1;
    tone({ f: 120, f2: 30, type: "sine", dur: 0.6, vol: 0.5 * g, pan: at.pan });
    noise({ f: 3000, f2: 120, q: 0.5, dur: 0.9, vol: 0.45 * g, pan: at.pan, filter: "lowpass", wet: 0.5 });
    noise({ f: 5000, f2: 2000, q: 0.7, dur: 0.15, vol: 0.2 * g, pan: at.pan });
  },
  slowMoIn() {
    tone({ f: 500, f2: 120, type: "sine", dur: 0.35, vol: 0.12, wet: 0.6 });
    noise({ f: 3000, f2: 300, q: 0.8, dur: 0.3, vol: 0.08 });
  },
  slowMoOut() {
    tone({ f: 140, f2: 420, type: "sine", dur: 0.18, vol: 0.08 });
  },
  victory() {
    const notes = [0, 4, 7, 12, 16, 19, 24];
    notes.forEach((n, i) => tone({ f: midi(67 + n), type: "triangle", dur: 0.5, vol: 0.12, at: 0.4 + i * 0.09, wet: 0.6 }));
    for (const n of [0, 4, 7, 12]) tone({ f: midi(55 + n), type: "sawtooth", dur: 2.2, vol: 0.05, at: 1.05, attack: 0.05, lp: 2000, wet: 0.6 });
  },
  defeat() {
    [7, 3, 0, -5].forEach((n, i) => tone({ f: midi(60 + n), type: "triangle", dur: 0.7, vol: 0.13, at: i * 0.32, wet: 0.6 }));
    tone({ f: midi(36), type: "sawtooth", dur: 2.4, vol: 0.08, at: 1.0, attack: 0.1, lp: 600, wet: 0.5 });
  },
  /** Held sounds, set every frame: slide scrape (0..1) and wind with flight speed (0..1). */
  loops(slide: number, wind: number) {
    slideLoop.set(0.22 * slide, 600 + 1400 * slide);
    windLoop.set(0.1 * wind * wind, 300 + 1200 * wind);
  },
};

// ---------------------------------------------------------------------------------------------
// Music
// ---------------------------------------------------------------------------------------------

/**
 * Generative music in a minor key: a pad and soft arpeggio always play; bass, drums and a lead
 * fade in with the fight's intensity. Each planet picks its own key. Slow motion muffles it.
 */
class Music {
  private timer = 0;
  private nextBeat = 0;
  private beat = 0;
  private root = 57; // A3
  private intensity = 0;
  private rand = Math.random;
  private layers!: { pad: GainNode; arp: GainNode; bass: GainNode; drums: GainNode; lead: GainNode };

  // i – VI – III – VII, each two bars
  private readonly chords = [
    [0, 3, 7],
    [8, 12, 15],
    [3, 7, 10],
    [10, 14, 17],
  ];
  private readonly scale = [0, 3, 5, 7, 10, 12, 15, 17];

  start() {
    if (!ac || this.timer) return;
    const layer = (v: number) => {
      const g = ac!.createGain();
      g.gain.value = v;
      g.connect(musicBus);
      const w = ac!.createGain();
      w.gain.value = 0.5;
      g.connect(w).connect(reverb);
      return g;
    };
    this.layers = { pad: layer(1), arp: layer(1), bass: layer(0), drums: layer(0), lead: layer(0) };
    this.nextBeat = ac.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  /** New key for a new planet. */
  setSeed(seed: number) {
    this.root = 52 + (seed % 9);
    this.beat = 0;
  }

  /** 0..1: how hot the fight is; `slow` 0..1 muffles; `duck` 0..1 scales everything down. */
  update(intensity: number, slow: number, duck: number) {
    if (!ac || !this.layers) return;
    // Ease toward the new intensity (~2 s), so tempo and layers don't jump with every boid.
    this.intensity += (intensity - this.intensity) * 0.01;
    intensity = this.intensity;
    const t = ac.currentTime;
    const k = (v: number) => Math.max(0, Math.min(1, v)) * duck;
    this.layers.pad.gain.setTargetAtTime(k(1 - 0.3 * intensity), t, 0.5);
    this.layers.arp.gain.setTargetAtTime(k(0.7 + 0.3 * intensity), t, 0.5);
    this.layers.bass.gain.setTargetAtTime(k(0.25 + intensity), t, 0.6);
    this.layers.drums.gain.setTargetAtTime(k((intensity - 0.15) * 1.6), t, 0.6);
    this.layers.lead.gain.setTargetAtTime(k((intensity - 0.5) * 2), t, 0.8);
    musicFilter.frequency.setTargetAtTime(18000 - 17000 * slow, t, 0.08);
  }

  private get spb() {
    return 60 / (84 + 30 * this.intensity) / 2; // eighth notes
  }

  private schedule() {
    if (!ac) return;
    while (this.nextBeat < ac.currentTime + 0.12) {
      this.play(this.beat, this.nextBeat);
      this.nextBeat += this.spb;
      this.beat++;
    }
  }

  private note(n: number, t: number, dur: number, vol: number, type: OscillatorType, bus: GainNode, lp = 3000, attack = 0.01) {
    const osc = ac!.createOscillator();
    osc.type = type;
    osc.frequency.value = midi(n);
    const f = ac!.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    const g = ac!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f).connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private drum(t: number, kind: "kick" | "snare" | "hat") {
    const bus = this.layers.drums;
    if (kind === "kick") {
      const osc = ac!.createOscillator();
      const g = ac!.createGain();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0.45, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(g).connect(bus);
      osc.start(t);
      osc.stop(t + 0.3);
      return;
    }
    const src = ac!.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac!.createBiquadFilter();
    f.type = kind === "hat" ? "highpass" : "bandpass";
    f.frequency.value = kind === "hat" ? 7000 : 1800;
    const g = ac!.createGain();
    const dur = kind === "hat" ? 0.05 : 0.18;
    g.gain.setValueAtTime(kind === "hat" ? 0.08 : 0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  private play(beat: number, t: number) {
    const L = this.layers;
    const eighth = this.spb;
    const step = beat % 16; // two bars of eighths per chord
    const chord = this.chords[Math.floor(beat / 16) % this.chords.length]!;
    const r = this.root;

    if (step === 0) {
      for (const n of chord) this.note(r + n, t, eighth * 16, 0.045, "sawtooth", L.pad, 900, 0.8);
      this.note(r + chord[0]! + 12, t, eighth * 16, 0.03, "triangle", L.pad, 2000, 1.2);
    }
    // Arpeggio up and down the chord across two octaves.
    const arp = [0, 1, 2, 3, 4, 3, 2, 1];
    const i = arp[step % 8]!;
    const n = chord[i % 3]! + 12 * (1 + Math.floor(i / 3));
    this.note(r + n, t, eighth * 1.8, 0.05, "triangle", L.arp, 2600);

    if (step % 4 === 0 || (this.intensity > 0.5 && step % 2 === 0)) {
      this.note(r + chord[0]! - 12, t, eighth * 1.6, 0.14, "sawtooth", L.bass, 500);
    }
    if (step % 4 === 0) this.drum(t, "kick");
    if (step % 8 === 4) this.drum(t, "snare");
    this.drum(t, "hat");
    if (this.intensity > 0.75 && step % 8 === 6) this.drum(t, "kick");

    // Lead: sparse notes from the minor pentatonic.
    if (step % 2 === 0 && this.rand() < 0.45) {
      const m = this.scale[Math.floor(this.rand() * this.scale.length)]!;
      this.note(r + 24 + m, t, eighth * (this.rand() < 0.3 ? 4 : 2), 0.05, "square", L.lead, 1800);
    }
  }
}

export const music = new Music();
