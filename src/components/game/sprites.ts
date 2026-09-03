import blazeUrl from "@/assets/brawler-blaze.png";
import novaUrl from "@/assets/brawler-nova.png";
import bunkerUrl from "@/assets/brawler-bunker.png";
import vexUrl from "@/assets/brawler-vex.png";
import gruntUrl from "@/assets/enemy-grunt.png";
import bossUrl from "@/assets/enemy-boss.png";
import blazeSheetUrl from "@/assets/brawler-blaze-sheet.png";
import novaSheetUrl from "@/assets/brawler-nova-sheet.png";
import bunkerSheetUrl from "@/assets/brawler-bunker-sheet.png";
import vexSheetUrl from "@/assets/brawler-vex-sheet.png";
import gruntSheetUrl from "@/assets/enemy-grunt-sheet.png";
import bossSheetUrl from "@/assets/enemy-boss-sheet.png";
import blazeSideUrl from "@/assets/brawler-blaze-side.png";
import novaSideUrl from "@/assets/brawler-nova-side.png";
import bunkerSideUrl from "@/assets/brawler-bunker-side.png";
import vexSideUrl from "@/assets/brawler-vex-side.png";
import gruntSideUrl from "@/assets/enemy-grunt-side.png";
import bossSideUrl from "@/assets/enemy-boss-side.png";

/** Pre-rendered character art keyed by brawler id / enemy kind. */
const SRC: Record<string, string> = {
  blaze: blazeUrl,
  nova: novaUrl,
  bunker: bunkerUrl,
  vex: vexUrl,
  grunt: gruntUrl,
  boss: bossUrl,
};

/** Walk-cycle sheets: 4 columns, front-facing rows first, back-facing rows last. */
type SheetDef = {
  src: string;
  cols: number;
  rows: number;
  front: number[];
  back: number[];
  /** side-profile strip (4 frames, facing right) drawn from its own image */
  side?: { src: string; cols: number };
};

const SHEETS: Record<string, SheetDef> = {
  blaze: {
    src: blazeSheetUrl,
    cols: 4,
    rows: 2,
    front: [0],
    back: [1],
    side: { src: blazeSideUrl, cols: 4 },
  },
  nova: {
    src: novaSheetUrl,
    cols: 4,
    rows: 2,
    front: [0],
    back: [1],
    side: { src: novaSideUrl, cols: 4 },
  },
  bunker: {
    src: bunkerSheetUrl,
    cols: 4,
    rows: 4,
    front: [0, 1],
    back: [2, 3],
    side: { src: bunkerSideUrl, cols: 4 },
  },
  vex: {
    src: vexSheetUrl,
    cols: 4,
    rows: 3,
    front: [0],
    back: [1, 2],
    side: { src: vexSideUrl, cols: 4 },
  },
  grunt: {
    src: gruntSheetUrl,
    cols: 4,
    rows: 2,
    front: [0],
    back: [1],
    side: { src: gruntSideUrl, cols: 4 },
  },
  boss: {
    src: bossSheetUrl,
    cols: 4,
    rows: 2,
    front: [0],
    back: [1],
    side: { src: bossSideUrl, cols: 4 },
  },
};


const imgs = new Map<string, HTMLImageElement>();

function load(key: string, src: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  let img = imgs.get(key);
  if (!img) {
    img = new Image();
    img.src = src;
    imgs.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function sprite(key: string): HTMLImageElement | null {
  const src = SRC[key];
  return src ? load(key, src) : null;
}

export type Frame = {
  img: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

/** Pick a front/back frame or a true profile frame for natural 8-direction movement. */
export function sheetFrame(
  key: string,
  back: boolean,
  walk: number,
  moving: boolean,
  profile = false,
): Frame | null {
  const def = SHEETS[key];
  if (!def) return null;
  if (profile && def.side) {
    const img = load(key + ":side", def.side.src);
    if (!img) return null;
    const sw = img.naturalWidth / def.side.cols;
    const sh = img.naturalHeight;
    const col = moving ? ((Math.floor(walk) % def.side.cols) + def.side.cols) % def.side.cols : 0;
    return { img, sx: col * sw, sy: 0, sw, sh };
  }
  const img = load(key + ":sheet", def.src);
  if (!img) return null;
  const sw = img.naturalWidth / def.cols;
  const sh = img.naturalHeight / def.rows;
  const rows = back ? def.back : def.front;
  const total = rows.length * def.cols;
  const idx = moving ? ((Math.floor(walk) % total) + total) % total : 0;
  const row = rows[Math.floor(idx / def.cols)]!;
  const col = idx % def.cols;
  return { img, sx: col * sw, sy: row * sh, sw, sh };
}

export function preloadSprites() {
  for (const k of Object.keys(SRC)) sprite(k);
  for (const [k, d] of Object.entries(SHEETS)) {
    load(k + ":sheet", d.src);
    if (d.side) load(k + ":side", d.side.src);
  }
}

/** Enemy kind -> sprite key. Non-boss enemies all share the grunt art. */
export const enemySpriteKey = (kind: string) => (kind === "boss" ? "boss" : "grunt");

/** Raw image URL for menu portraits. */
export const brawlerArt = (id: string) => SRC[id] ?? SRC["blaze"]!;
