let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio() {
  ac();
}

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.35;
}

export function isMuted() {
  return muted;
}

type ToneOpts = {
  freq: number;
  to?: number;
  dur?: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
};

function tone({ freq, to, dur = 0.12, type = "square", gain = 0.3, delay = 0 }: ToneOpts) {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur = 0.2, gain = 0.3, filter = 900, delay = 0) {
  const c = ac();
  if (!c || !master || muted) return;
  const t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "lowpass";
  bp.frequency.setValueAtTime(filter * 2, t);
  bp.frequency.exponentialRampToValueAtTime(filter * 0.4, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  shoot: () => tone({ freq: 620, to: 220, dur: 0.07, type: "square", gain: 0.12 }),
  snipe: () => tone({ freq: 1100, to: 300, dur: 0.13, type: "sawtooth", gain: 0.14 }),
  enemyShoot: () => tone({ freq: 240, to: 120, dur: 0.08, type: "sawtooth", gain: 0.07 }),
  hit: () => tone({ freq: 320, to: 180, dur: 0.05, type: "triangle", gain: 0.1 }),
  hurt: () => tone({ freq: 180, to: 70, dur: 0.18, type: "sawtooth", gain: 0.18 }),
  kill: () => {
    noise(0.28, 0.22, 700);
    tone({ freq: 200, to: 60, dur: 0.22, type: "triangle", gain: 0.15 });
  },
  pickup: () => {
    tone({ freq: 660, dur: 0.08, type: "sine", gain: 0.18 });
    tone({ freq: 990, dur: 0.1, type: "sine", gain: 0.16, delay: 0.07 });
  },
  power: () => {
    tone({ freq: 520, dur: 0.07, type: "square", gain: 0.16 });
    tone({ freq: 780, dur: 0.07, type: "square", gain: 0.16, delay: 0.06 });
    tone({ freq: 1180, dur: 0.12, type: "square", gain: 0.16, delay: 0.12 });
  },
  superShot: () => {
    noise(0.4, 0.3, 1400);
    tone({ freq: 140, to: 900, dur: 0.35, type: "sawtooth", gain: 0.2 });
  },
  wave: () => {
    tone({ freq: 440, dur: 0.12, type: "triangle", gain: 0.18 });
    tone({ freq: 660, dur: 0.16, type: "triangle", gain: 0.18, delay: 0.12 });
  },
  boss: () => {
    tone({ freq: 90, to: 55, dur: 0.9, type: "sawtooth", gain: 0.25 });
    noise(0.9, 0.2, 400);
    tone({ freq: 180, to: 110, dur: 0.9, type: "square", gain: 0.12, delay: 0.1 });
  },
  gameover: () => {
    tone({ freq: 400, to: 200, dur: 0.25, type: "triangle", gain: 0.2 });
    tone({ freq: 300, to: 140, dur: 0.3, type: "triangle", gain: 0.2, delay: 0.22 });
    tone({ freq: 200, to: 70, dur: 0.5, type: "sawtooth", gain: 0.2, delay: 0.48 });
  },
};
