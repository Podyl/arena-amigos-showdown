import { ARENA_H, ARENA_W, WALLS } from "./engine";

export type Decor = {
  kind: "grass" | "flower" | "rock" | "crack" | "puddle" | "bush" | "vent" | "bone";
  x: number;
  y: number;
  r: number;
  rot: number;
  seed: number;
};

export type Torch = { x: number; y: number };

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function insideWall(x: number, y: number, pad: number) {
  return WALLS.some(
    (w) => x > w.x - pad && x < w.x + w.w + pad && y > w.y - pad && y < w.y + w.h + pad,
  );
}

const KINDS: Decor["kind"][] = [
  "grass",
  "grass",
  "grass",
  "flower",
  "rock",
  "crack",
  "puddle",
  "bush",
  "vent",
  "bone",
];

function build(): Decor[] {
  const rnd = mulberry32(1337);
  const out: Decor[] = [];
  for (let i = 0; i < 260; i++) {
    const x = 30 + rnd() * (ARENA_W - 60);
    const y = 30 + rnd() * (ARENA_H - 60);
    if (insideWall(x, y, 14)) continue;
    const kind = KINDS[Math.floor(rnd() * KINDS.length)]!;
    out.push({
      kind,
      x,
      y,
      r: 8 + rnd() * (kind === "bush" ? 26 : kind === "puddle" ? 30 : 14),
      rot: rnd() * Math.PI * 2,
      seed: rnd() * 1000,
    });
  }
  return out;
}

export const DECOR: Decor[] = build();

/** Wall-mounted torches light the arena edges. */
export const TORCHES: Torch[] = [
  { x: 40, y: 120 },
  { x: ARENA_W - 40, y: 120 },
  { x: 40, y: ARENA_H / 2 },
  { x: ARENA_W - 40, y: ARENA_H / 2 },
  { x: 40, y: ARENA_H - 120 },
  { x: ARENA_W - 40, y: ARENA_H - 120 },
];
