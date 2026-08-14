import blazeUrl from "@/assets/brawler-blaze.png";
import novaUrl from "@/assets/brawler-nova.png";
import bunkerUrl from "@/assets/brawler-bunker.png";
import vexUrl from "@/assets/brawler-vex.png";
import gruntUrl from "@/assets/enemy-grunt.png";
import bossUrl from "@/assets/enemy-boss.png";

/** Pre-rendered character art keyed by brawler id / enemy kind. */
const SRC: Record<string, string> = {
  blaze: blazeUrl,
  nova: novaUrl,
  bunker: bunkerUrl,
  vex: vexUrl,
  grunt: gruntUrl,
  boss: bossUrl,
};

const imgs = new Map<string, HTMLImageElement>();

export function sprite(key: string): HTMLImageElement | null {
  if (typeof window === "undefined") return null;
  const src = SRC[key];
  if (!src) return null;
  let img = imgs.get(key);
  if (!img) {
    img = new Image();
    img.src = src;
    imgs.set(key, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function preloadSprites() {
  for (const k of Object.keys(SRC)) sprite(k);
}

/** Enemy kind -> sprite key. Non-boss enemies all share the grunt art. */
export const enemySpriteKey = (kind: string) => (kind === "boss" ? "boss" : "grunt");

/** Raw image URL for menu portraits. */
export const brawlerArt = (id: string) => SRC[id] ?? SRC["blaze"]!;
