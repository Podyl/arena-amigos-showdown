import { BRAWLERS } from "./characters";

export type BrawlerProgress = { xp: number; trophies: number };
export type Profile = {
  season: number;
  seasonEnds: number;
  brawlers: Record<string, BrawlerProgress>;
  bestScore: number;
  history: { season: number; trophies: number; rank: string }[];
};

const KEY = "brawl-profile-v1";
const SEASON_MS = 14 * 24 * 60 * 60 * 1000;

export const MAX_POWER = 11;
const XP_PER_LEVEL = 400;

export function powerLevel(xp: number) {
  return Math.min(MAX_POWER, 1 + Math.floor(xp / XP_PER_LEVEL));
}
export function xpInLevel(xp: number) {
  const lvl = powerLevel(xp);
  if (lvl >= MAX_POWER) return { cur: XP_PER_LEVEL, need: XP_PER_LEVEL };
  return { cur: xp % XP_PER_LEVEL, need: XP_PER_LEVEL };
}
/** Power level scales HP and damage, like Brawl Stars power levels. */
export function powerMods(lvl: number) {
  const s = 1 + (lvl - 1) * 0.05;
  return { hp: s, damage: s };
}

export const RANKS = [
  { name: "Trä", min: 0, color: "oklch(0.55 0.06 60)" },
  { name: "Brons", min: 150, color: "oklch(0.62 0.11 55)" },
  { name: "Silver", min: 400, color: "oklch(0.78 0.02 260)" },
  { name: "Guld", min: 800, color: "oklch(0.83 0.16 90)" },
  { name: "Platina", min: 1400, color: "oklch(0.82 0.11 190)" },
  { name: "Diamant", min: 2200, color: "oklch(0.78 0.14 230)" },
  { name: "Mytisk", min: 3200, color: "oklch(0.68 0.2 320)" },
  { name: "Legendär", min: 4500, color: "oklch(0.7 0.2 30)" },
  { name: "Mästare", min: 6000, color: "oklch(0.88 0.18 95)" },
];

export function rankFor(trophies: number) {
  let r = RANKS[0]!;
  for (const x of RANKS) if (trophies >= x.min) r = x;
  const next = RANKS.find((x) => x.min > trophies);
  const span = next ? next.min - r.min : 1;
  return { ...r, next, progress: next ? (trophies - r.min) / span : 1 };
}

function blank(): Profile {
  const brawlers: Record<string, BrawlerProgress> = {};
  for (const b of BRAWLERS) brawlers[b.id] = { xp: 0, trophies: 0 };
  return { season: 1, seasonEnds: Date.now() + SEASON_MS, brawlers, bestScore: 0, history: [] };
}

export function totalTrophies(p: Profile) {
  return Object.values(p.brawlers).reduce((s, b) => s + b.trophies, 0);
}

/** End-of-season reset: trophies above the safe floor are converted to starting points. */
function rollSeason(p: Profile): Profile {
  const total = totalTrophies(p);
  p.history.unshift({ season: p.season, trophies: total, rank: rankFor(total).name });
  p.history = p.history.slice(0, 5);
  for (const id of Object.keys(p.brawlers)) {
    const t = p.brawlers[id]!.trophies;
    p.brawlers[id]!.trophies = t > 250 ? 250 + Math.floor((t - 250) * 0.25) : t;
  }
  p.season += 1;
  p.seasonEnds = Date.now() + SEASON_MS;
  return p;
}

export function loadProfile(): Profile {
  if (typeof localStorage === "undefined") return blank();
  let p = blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Profile;
      p = {
        ...p,
        ...parsed,
        brawlers: { ...p.brawlers, ...parsed.brawlers },
        history: parsed.history ?? [],
      };
    } else {
      const legacy = Number(localStorage.getItem("brawl-best") ?? 0);
      if (legacy) p.bestScore = legacy;
    }
  } catch {
    p = blank();
  }
  if (Date.now() > p.seasonEnds) p = rollSeason(p);
  return p;
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export type MatchResult = {
  brawlerId: string;
  score: number;
  wave: number;
  bossKills: number;
  xp: number;
  trophies: number;
  levelUp: boolean;
  newLevel: number;
};

/** Trophy gain shrinks as you climb, so ranking stays meaningful. */
export function finishMatch(
  p: Profile,
  brawlerId: string,
  score: number,
  wave: number,
  bossKills: number,
) {
  const cur = p.brawlers[brawlerId] ?? { xp: 0, trophies: 0 };
  const before = powerLevel(cur.xp);
  const xp = Math.round(score / 12 + wave * 18 + bossKills * 90);
  const raw = wave * 4 + bossKills * 18 + Math.floor(score / 900);
  const drag = Math.floor(cur.trophies / 260);
  const trophies = Math.max(-8, Math.min(60, raw - drag));
  cur.xp += xp;
  cur.trophies = Math.max(0, cur.trophies + trophies);
  p.brawlers[brawlerId] = cur;
  p.bestScore = Math.max(p.bestScore, score);
  saveProfile(p);
  const newLevel = powerLevel(cur.xp);
  return {
    brawlerId,
    score,
    wave,
    bossKills,
    xp,
    trophies,
    levelUp: newLevel > before,
    newLevel,
  } as MatchResult;
}

export function seasonDaysLeft(p: Profile) {
  return Math.max(0, Math.ceil((p.seasonEnds - Date.now()) / 86_400_000));
}
