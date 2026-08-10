export type SuperKind = "nova" | "beam" | "shock" | "swarm";

export type Brawler = {
  id: string;
  name: string;
  tagline: string;
  color: string;
  accent: string;
  hp: number;
  speed: number;
  radius: number;
  shots: number;
  spread: number;
  damage: number;
  bulletSpeed: number;
  bulletRadius: number;
  bulletLife: number;
  cooldown: number;
  superKind: SuperKind;
  superName: string;
  hat: "cap" | "horns" | "helmet" | "antenna";
};

export const BRAWLERS: Brawler[] = [
  {
    id: "blaze",
    name: "Blaze",
    tagline: "Hagelgevär på nära håll",
    color: "oklch(0.7 0.19 35)",
    accent: "oklch(0.85 0.17 70)",
    hp: 110,
    speed: 260,
    radius: 26,
    shots: 3,
    spread: 0.16,
    damage: 20,
    bulletSpeed: 700,
    bulletRadius: 8,
    bulletLife: 0.85,
    cooldown: 0.36,
    superKind: "nova",
    superName: "Eldstorm",
    hat: "cap",
  },
  {
    id: "nova",
    name: "Nova",
    tagline: "Prickskytt med lång räckvidd",
    color: "oklch(0.72 0.18 240)",
    accent: "oklch(0.88 0.15 200)",
    hp: 85,
    speed: 275,
    radius: 24,
    shots: 1,
    spread: 0,
    damage: 52,
    bulletSpeed: 1050,
    bulletRadius: 7,
    bulletLife: 1.4,
    cooldown: 0.62,
    superKind: "beam",
    superName: "Jonstråle",
    hat: "antenna",
  },
  {
    id: "bunker",
    name: "Bunker",
    tagline: "Tålig med bred spridning",
    color: "oklch(0.62 0.13 150)",
    accent: "oklch(0.82 0.15 140)",
    hp: 175,
    speed: 215,
    radius: 30,
    shots: 5,
    spread: 0.13,
    damage: 13,
    bulletSpeed: 620,
    bulletRadius: 7,
    bulletLife: 0.62,
    cooldown: 0.5,
    superKind: "shock",
    superName: "Chockvåg",
    hat: "helmet",
  },
  {
    id: "vex",
    name: "Vex",
    tagline: "Snabb och skjutglad",
    color: "oklch(0.68 0.2 315)",
    accent: "oklch(0.86 0.16 330)",
    hp: 90,
    speed: 305,
    radius: 23,
    shots: 2,
    spread: 0.08,
    damage: 12,
    bulletSpeed: 820,
    bulletRadius: 6,
    bulletLife: 1,
    cooldown: 0.19,
    superKind: "swarm",
    superName: "Svärmsalva",
    hat: "horns",
  },
];

export const getBrawler = (id: string) => BRAWLERS.find((b) => b.id === id) ?? BRAWLERS[0]!;
