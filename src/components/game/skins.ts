import { BRAWLERS } from "./characters";

export type SkinFx = "none" | "sparkle" | "flame" | "frost" | "void" | "gold";

export type Skin = {
  id: string;
  brawlerId: string;
  name: string;
  rarity: "standard" | "sällsynt" | "episk" | "legendär";
  /** Trophies required on that brawler. */
  unlock: number;
  color: string;
  accent: string;
  /** Cosmetic extras drawn by the renderer. */
  cape?: string;
  visor?: boolean;
  crown?: boolean;
  aura?: string;
  fx: SkinFx;
};

const RARITY_COLOR: Record<Skin["rarity"], string> = {
  standard: "oklch(0.72 0.03 260)",
  sällsynt: "oklch(0.78 0.14 160)",
  episk: "oklch(0.7 0.19 310)",
  legendär: "oklch(0.85 0.18 90)",
};

export const rarityColor = (r: Skin["rarity"]) => RARITY_COLOR[r];

export const SKINS: Skin[] = [
  // Blaze
  {
    id: "blaze-default",
    brawlerId: "blaze",
    name: "Blaze",
    rarity: "standard",
    unlock: 0,
    color: "oklch(0.7 0.19 35)",
    accent: "oklch(0.85 0.17 70)",
    fx: "none",
  },
  {
    id: "blaze-magma",
    brawlerId: "blaze",
    name: "Magmariddaren",
    rarity: "sällsynt",
    unlock: 120,
    color: "oklch(0.55 0.18 28)",
    accent: "oklch(0.9 0.19 60)",
    cape: "oklch(0.45 0.16 25)",
    fx: "flame",
  },
  {
    id: "blaze-phoenix",
    brawlerId: "blaze",
    name: "Fenixlord",
    rarity: "legendär",
    unlock: 500,
    color: "oklch(0.78 0.2 45)",
    accent: "oklch(0.95 0.16 95)",
    cape: "oklch(0.7 0.2 40)",
    crown: true,
    aura: "oklch(0.85 0.2 55)",
    fx: "gold",
  },
  // Nova
  {
    id: "nova-default",
    brawlerId: "nova",
    name: "Nova",
    rarity: "standard",
    unlock: 0,
    color: "oklch(0.72 0.18 240)",
    accent: "oklch(0.88 0.15 200)",
    fx: "none",
  },
  {
    id: "nova-frost",
    brawlerId: "nova",
    name: "Polarjägare",
    rarity: "sällsynt",
    unlock: 120,
    color: "oklch(0.85 0.09 220)",
    accent: "oklch(0.93 0.11 200)",
    visor: true,
    aura: "oklch(0.9 0.1 210)",
    fx: "frost",
  },
  {
    id: "nova-void",
    brawlerId: "nova",
    name: "Tomrumsagent",
    rarity: "episk",
    unlock: 350,
    color: "oklch(0.42 0.15 300)",
    accent: "oklch(0.78 0.2 320)",
    cape: "oklch(0.32 0.12 300)",
    visor: true,
    aura: "oklch(0.6 0.2 310)",
    fx: "void",
  },
  // Bunker
  {
    id: "bunker-default",
    brawlerId: "bunker",
    name: "Bunker",
    rarity: "standard",
    unlock: 0,
    color: "oklch(0.62 0.13 150)",
    accent: "oklch(0.82 0.15 140)",
    fx: "none",
  },
  {
    id: "bunker-titan",
    brawlerId: "bunker",
    name: "Stålmuren",
    rarity: "episk",
    unlock: 300,
    color: "oklch(0.58 0.04 250)",
    accent: "oklch(0.86 0.13 200)",
    visor: true,
    aura: "oklch(0.75 0.12 210)",
    fx: "sparkle",
  },
  {
    id: "bunker-royal",
    brawlerId: "bunker",
    name: "Gardeskungen",
    rarity: "legendär",
    unlock: 600,
    color: "oklch(0.5 0.13 25)",
    accent: "oklch(0.9 0.17 92)",
    cape: "oklch(0.42 0.16 25)",
    crown: true,
    aura: "oklch(0.88 0.17 92)",
    fx: "gold",
  },
  // Vex
  {
    id: "vex-default",
    brawlerId: "vex",
    name: "Vex",
    rarity: "standard",
    unlock: 0,
    color: "oklch(0.68 0.2 315)",
    accent: "oklch(0.86 0.16 330)",
    fx: "none",
  },
  {
    id: "vex-neon",
    brawlerId: "vex",
    name: "Neondemon",
    rarity: "sällsynt",
    unlock: 150,
    color: "oklch(0.62 0.24 330)",
    accent: "oklch(0.9 0.2 180)",
    aura: "oklch(0.8 0.22 330)",
    fx: "sparkle",
  },
  {
    id: "vex-shadow",
    brawlerId: "vex",
    name: "Skuggviskaren",
    rarity: "episk",
    unlock: 400,
    color: "oklch(0.32 0.08 300)",
    accent: "oklch(0.72 0.2 300)",
    cape: "oklch(0.26 0.07 300)",
    aura: "oklch(0.45 0.15 300)",
    fx: "void",
  },
];

export const skinsFor = (brawlerId: string) => SKINS.filter((s) => s.brawlerId === brawlerId);

export function getSkin(id: string | undefined, brawlerId: string): Skin {
  return SKINS.find((s) => s.id === id && s.brawlerId === brawlerId) ?? skinsFor(brawlerId)[0]!;
}

const KEY = "brawl-skins-v1";

export function loadSkinChoices(): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveSkinChoice(brawlerId: string, skinId: string) {
  const all = loadSkinChoices();
  all[brawlerId] = skinId;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export const unlockedSkins = (brawlerId: string, trophies: number) =>
  skinsFor(brawlerId).filter((s) => trophies >= s.unlock);

export const totalSkins = SKINS.length;
export const brawlerNames = BRAWLERS.map((b) => b.name);
