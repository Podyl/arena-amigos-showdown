import type { EnemyKind } from "@/components/game/engine";

export const HERO_COLORS: Record<string, { color: string; accent: string }> = {
  blaze: { color: "#ff7a3d", accent: "#ffd166" },
  nova: { color: "#4aa8ff", accent: "#9be7ff" },
  bunker: { color: "#8f7bff", accent: "#d6ccff" },
  vex: { color: "#3ddc97", accent: "#c8ffe6" },
};

export const ENEMY_COLORS: Record<EnemyKind, string> = {
  grunt: "#e2544b",
  runner: "#f5a623",
  shooter: "#c56bff",
  brute: "#7a6cd6",
  boss: "#ff3b30",
};

/** World units per arena pixel. */
export const S = 1 / 40;
