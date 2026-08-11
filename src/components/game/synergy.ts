import type { Buffs } from "./engine";

export type Synergy = {
  id: string;
  name: string;
  desc: string;
  color: string;
  needs: (keyof Buffs)[];
};

export const SYNERGIES: Synergy[] = [
  {
    id: "overload",
    name: "Överladdning",
    desc: "Skada + Snabbeld → +25 % skada",
    color: "oklch(0.75 0.2 45)",
    needs: ["damage", "rapid"],
  },
  {
    id: "phantom",
    name: "Fantom",
    desc: "Fart + Sköld → 75 % dämpning och extra fart",
    color: "oklch(0.78 0.14 230)",
    needs: ["speed", "shield"],
  },
  {
    id: "berserk",
    name: "Bärsärk",
    desc: "Skada + Sköld → livsstöld på träff",
    color: "oklch(0.68 0.2 15)",
    needs: ["damage", "shield"],
  },
  {
    id: "gale",
    name: "Stormvind",
    desc: "Fart + Snabbeld → snabbare, längre skott",
    color: "oklch(0.85 0.16 150)",
    needs: ["speed", "rapid"],
  },
  {
    id: "omega",
    name: "Omega",
    desc: "Alla fyra → supern laddas dubbelt så snabbt",
    color: "oklch(0.85 0.18 95)",
    needs: ["damage", "speed", "rapid", "shield"],
  },
];

export function activeSynergies(buffs: Buffs) {
  return SYNERGIES.filter((s) => s.needs.every((k) => buffs[k] > 0));
}

export function hasSynergy(buffs: Buffs, id: string) {
  return activeSynergies(buffs).some((s) => s.id === id);
}
