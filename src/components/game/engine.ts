import { getBrawler, type Brawler } from "./characters";
import { sfx } from "./audio";
import { hasSynergy } from "./synergy";
import { powerMods } from "./progression";
import { getSkin, type Skin } from "./skins";

export type Vec = { x: number; y: number };

export const ARENA_W = 1000;
export const ARENA_H = 1400;

export type Wall = { x: number; y: number; w: number; h: number };

export const WALLS: Wall[] = [
  { x: 120, y: 240, w: 180, h: 60 },
  { x: 700, y: 240, w: 180, h: 60 },
  { x: 120, y: 1100, w: 180, h: 60 },
  { x: 700, y: 1100, w: 180, h: 60 },
  { x: 440, y: 380, w: 120, h: 120 },
  { x: 440, y: 900, w: 120, h: 120 },
  { x: 60, y: 640, w: 60, h: 200 },
  { x: 880, y: 640, w: 60, h: 200 },
  { x: 300, y: 660, w: 400, h: 60 },
];

export type EnemyKind = "grunt" | "runner" | "shooter" | "brute" | "boss";

export type Entity = {
  id: number;
  pos: Vec;
  hp: number;
  maxHp: number;
  radius: number;
  aim: number;
  cooldown: number;
  kind: "hero" | "enemy";
  enemyKind: EnemyKind;
  hitFlash: number;
  speed: number;
  color: string;
  ringTimer: number;
};

export type Bullet = {
  id: number;
  pos: Vec;
  trail: Vec[];
  vel: Vec;
  owner: "hero" | "enemy";
  life: number;
  damage: number;
  radius: number;
  pierce: number;
  hits: number[];
  color: string;
};

/** Expanding VFX ring (shockwaves, spawn telegraphs, super blasts). */
export type Ring = {
  pos: Vec;
  r: number;
  target: number;
  life: number;
  max: number;
  color: string;
  width: number;
  fill?: boolean;
};

/** Scorch marks left on the floor. */
export type Decal = { pos: Vec; r: number; life: number; max: number; color: string };

export type Particle = {
  pos: Vec;
  vel: Vec;
  life: number;
  max: number;
  hue: string;
  size: number;
};

export type PowerKind = "heal" | "damage" | "speed" | "shield" | "rapid";

export type Pickup = { id: number; pos: Vec; bob: number; kind: PowerKind };

export type FloatText = { pos: Vec; text: string; life: number; color: string };

export type Buffs = { damage: number; speed: number; rapid: number; shield: number };

export type GameState = {
  brawler: Brawler;
  skin: Skin;
  powerLevel: number;
  dmgMult: number;
  bossKills: number;
  hero: Entity;
  enemies: Entity[];
  bullets: Bullet[];
  particles: Particle[];
  rings: Ring[];
  decals: Decal[];
  pickups: Pickup[];
  texts: FloatText[];
  buffs: Buffs;
  score: number;
  wave: number;
  waveTimer: number;
  spawnQueue: EnemyKind[];
  spawnTimer: number;
  super: number;
  over: boolean;
  time: number;
  shake: number;
  bossActive: boolean;
  banner: { text: string; life: number } | null;
};

let idc = 1;
const nid = () => idc++;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export function circleHitsWall(p: Vec, r: number) {
  for (const w of WALLS) {
    const cx = clamp(p.x, w.x, w.x + w.w);
    const cy = clamp(p.y, w.y, w.y + w.h);
    if ((p.x - cx) ** 2 + (p.y - cy) ** 2 < r * r) return true;
  }
  return false;
}

function moveWithCollision(e: Entity, dx: number, dy: number) {
  const nx = clamp(e.pos.x + dx, e.radius, ARENA_W - e.radius);
  if (!circleHitsWall({ x: nx, y: e.pos.y }, e.radius)) e.pos.x = nx;
  const ny = clamp(e.pos.y + dy, e.radius, ARENA_H - e.radius);
  if (!circleHitsWall({ x: e.pos.x, y: ny }, e.radius)) e.pos.y = ny;
}

export function createGame(brawlerId: string, level = 1, skinId?: string): GameState {
  const b = getBrawler(brawlerId);
  const skin = getSkin(skinId, b.id);
  const mods = powerMods(level);
  const hp = Math.round(b.hp * mods.hp);
  return {
    brawler: b,
    skin,
    powerLevel: level,
    dmgMult: mods.damage,
    bossKills: 0,
    hero: {
      id: nid(),
      pos: { x: ARENA_W / 2, y: ARENA_H - 220 },
      hp,
      maxHp: hp,
      radius: b.radius,
      aim: -Math.PI / 2,
      cooldown: 0,
      kind: "hero",
      enemyKind: "grunt",
      hitFlash: 0,
      speed: b.speed,
      color: skin.color,
      ringTimer: 0,
    },
    enemies: [],
    bullets: [],
    particles: [],
    rings: [],
    decals: [],
    pickups: [],
    texts: [],
    buffs: { damage: 0, speed: 0, rapid: 0, shield: 0 },
    score: 0,
    wave: 0,
    waveTimer: 0.8,
    spawnQueue: [],
    spawnTimer: 0,
    super: 0,
    over: false,
    time: 0,
    shake: 0,
    bossActive: false,
    banner: null,
  };
}

const ENEMY_STATS: Record<EnemyKind, { hp: number; speed: number; radius: number; color: string }> =
  {
    grunt: { hp: 50, speed: 95, radius: 24, color: "oklch(0.62 0.21 25)" },
    runner: { hp: 32, speed: 190, radius: 20, color: "oklch(0.72 0.19 60)" },
    shooter: { hp: 44, speed: 80, radius: 23, color: "oklch(0.65 0.2 320)" },
    brute: { hp: 150, speed: 65, radius: 36, color: "oklch(0.5 0.14 285)" },
    boss: { hp: 900, speed: 78, radius: 62, color: "oklch(0.55 0.22 10)" },
  };

function spawnEnemy(g: GameState, kind: EnemyKind) {
  const s = ENEMY_STATS[kind];
  const tough = 1 + g.wave * 0.22;
  let pos: Vec = { x: ARENA_W / 2, y: 120 };
  for (let i = 0; i < 80; i++) {
    const p = { x: 70 + Math.random() * (ARENA_W - 140), y: 70 + Math.random() * (ARENA_H * 0.6) };
    if (!circleHitsWall(p, s.radius + 6) && dist(p, g.hero.pos) > 420) {
      pos = p;
      break;
    }
  }
  g.enemies.push({
    id: nid(),
    pos,
    hp: s.hp * tough,
    maxHp: s.hp * tough,
    radius: s.radius,
    aim: Math.PI / 2,
    cooldown: Math.random(),
    kind: "enemy",
    enemyKind: kind,
    hitFlash: 0,
    speed: s.speed + Math.min(50, g.wave * 5),
    color: s.color,
    ringTimer: 3,
  });
  burst(g, pos, s.color, kind === "boss" ? 60 : 12, kind === "boss" ? 420 : 220);
  addRing(g, pos, kind === "boss" ? 220 : 90, s.color, {
    life: kind === "boss" ? 0.9 : 0.5,
    width: kind === "boss" ? 14 : 6,
  });
}

export function burst(g: GameState, pos: Vec, hue: string, n: number, power = 220) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = power * (0.3 + Math.random() * 0.7);
    g.particles.push({
      pos: { ...pos },
      vel: { x: Math.cos(a) * s, y: Math.sin(a) * s },
      life: 0.45 + Math.random() * 0.35,
      max: 0.8,
      hue,
      size: 3 + Math.random() * 5,
    });
  }
}

export function addRing(
  g: GameState,
  pos: Vec,
  target: number,
  color: string,
  opts: { life?: number; width?: number; fill?: boolean; from?: number } = {},
) {
  g.rings.push({
    pos: { ...pos },
    r: opts.from ?? 8,
    target,
    life: opts.life ?? 0.45,
    max: opts.life ?? 0.45,
    color,
    width: opts.width ?? 6,
    fill: opts.fill ?? false,
  });
}

export function addDecal(g: GameState, pos: Vec, r: number, color: string) {
  g.decals.push({ pos: { ...pos }, r, life: 6, max: 6, color });
  if (g.decals.length > 40) g.decals.shift();
}

function addBullet(
  g: GameState,
  e: Entity,
  a: number,
  opts: {
    dmg: number;
    speed: number;
    radius: number;
    life: number;
    color: string;
    pierce?: number;
  },
) {
  g.bullets.push({
    id: nid(),
    trail: [],
    pos: { x: e.pos.x + Math.cos(a) * (e.radius + 6), y: e.pos.y + Math.sin(a) * (e.radius + 6) },
    vel: { x: Math.cos(a) * opts.speed, y: Math.sin(a) * opts.speed },
    owner: e.kind,
    life: opts.life,
    damage: opts.dmg,
    radius: opts.radius,
    pierce: opts.pierce ?? 0,
    hits: [],
    color: opts.color,
  });
}

export type Input = { move: Vec; aim: Vec; shooting: boolean; superPressed: boolean };

function heroFire(g: GameState) {
  const b = g.brawler;
  const h = g.hero;
  const mult =
    (g.buffs.damage > 0 ? 1.8 : 1) * g.dmgMult * (hasSynergy(g.buffs, "overload") ? 1.25 : 1);
  const gale = hasSynergy(g.buffs, "gale");
  const shot = g.skin.accent;
  for (let i = 0; i < b.shots; i++) {
    const off = (i - (b.shots - 1) / 2) * b.spread;
    addBullet(g, h, h.aim + off, {
      dmg: b.damage * mult,
      speed: b.bulletSpeed * (gale ? 1.3 : 1),
      radius: b.bulletRadius,
      life: b.bulletLife * (gale ? 1.25 : 1),
      color: shot,
    });
  }
  const mz = { x: h.pos.x + Math.cos(h.aim) * 34, y: h.pos.y + Math.sin(h.aim) * 34 };
  burst(g, mz, shot, 5, 150);
  addRing(g, mz, 26, shot, { life: 0.16, width: 4, from: 4 });
  if (b.id === "nova") sfx.snipe();
  else sfx.shoot();
}

function heroSuper(g: GameState) {
  const b = g.brawler;
  const h = g.hero;
  sfx.superShot();
  g.shake = Math.max(g.shake, 16);
  const sc = g.skin.accent;
  burst(g, h.pos, sc, 56, 420);
  addRing(g, h.pos, 320, sc, { life: 0.6, width: 16 });
  addRing(g, h.pos, 200, "#ffffff", { life: 0.35, width: 8 });
  if (b.superKind === "nova") {
    for (let i = 0; i < 18; i++)
      addBullet(g, h, (i / 18) * Math.PI * 2, {
        dmg: 34,
        speed: 620,
        radius: 11,
        life: 1.3,
        color: sc,
      });
  } else if (b.superKind === "beam") {
    for (let i = 0; i < 5; i++)
      addBullet(g, h, h.aim, {
        dmg: 60,
        speed: 1200 + i * 40,
        radius: 14,
        life: 1.6,
        color: sc,
        pierce: 6,
      });
  } else if (b.superKind === "shock") {
    for (let i = 0; i < 26; i++)
      addBullet(g, h, (i / 26) * Math.PI * 2 + 0.1, {
        dmg: 26,
        speed: 420,
        radius: 16,
        life: 0.75,
        color: sc,
      });
    for (const e of g.enemies) {
      const d = dist(e.pos, h.pos);
      if (d < 260 && d > 0) {
        const a = Math.atan2(e.pos.y - h.pos.y, e.pos.x - h.pos.x);
        moveWithCollision(e, Math.cos(a) * 90, Math.sin(a) * 90);
      }
    }
  } else {
    for (let i = 0; i < 24; i++) {
      const a = h.aim + (Math.random() - 0.5) * 1.5;
      addBullet(g, h, a, {
        dmg: 16,
        speed: 700 + Math.random() * 400,
        radius: 7,
        life: 1.2,
        color: sc,
      });
    }
  }
}

const POWER_LABEL: Record<PowerKind, string> = {
  heal: "+40 HP",
  damage: "DUBBEL SKADA",
  speed: "FART",
  shield: "SKÖLD",
  rapid: "SNABBELD",
};

function planWave(g: GameState): EnemyKind[] {
  const w = g.wave;
  if (w % 5 === 0) {
    const q: EnemyKind[] = ["boss"];
    for (let i = 0; i < Math.min(6, 2 + Math.floor(w / 5)); i++) q.push(i % 2 ? "runner" : "grunt");
    return q;
  }
  const q: EnemyKind[] = [];
  const total = 3 + Math.floor(w * 1.3);
  for (let i = 0; i < total; i++) {
    const r = Math.random();
    if (w >= 4 && r < 0.15) q.push("brute");
    else if (w >= 2 && r < 0.45) q.push("shooter");
    else if (r < 0.7) q.push("runner");
    else q.push("grunt");
  }
  return q;
}

export function step(g: GameState, input: Input, dt: number) {
  g.time += dt;
  g.shake = Math.max(0, g.shake - dt * 40);
  if (g.banner) {
    g.banner.life -= dt;
    if (g.banner.life <= 0) g.banner = null;
  }
  if (g.over) {
    stepParticles(g, dt);
    return;
  }

  if (g.enemies.length === 0 && g.spawnQueue.length === 0) {
    g.waveTimer -= dt;
    if (g.waveTimer <= 0) {
      g.wave += 1;
      g.spawnQueue = planWave(g);
      g.waveTimer = 4;
      const boss = g.wave % 5 === 0;
      g.bossActive = boss;
      g.banner = { text: boss ? `BOSS – VÅG ${g.wave}` : `VÅG ${g.wave}`, life: 2 };
      if (boss) sfx.boss();
      else sfx.wave();
    }
  }
  if (g.spawnQueue.length > 0) {
    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
      spawnEnemy(g, g.spawnQueue.shift()!);
      g.spawnTimer = 0.4;
    }
  }

  const h = g.hero;
  const b = g.brawler;

  for (const k of ["damage", "speed", "rapid", "shield"] as const)
    g.buffs[k] = Math.max(0, g.buffs[k] - dt);

  const speed = h.speed * (g.buffs.speed > 0 ? (hasSynergy(g.buffs, "phantom") ? 1.75 : 1.45) : 1);
  moveWithCollision(h, input.move.x * speed * dt, input.move.y * speed * dt);

  if (input.aim.x || input.aim.y) h.aim = Math.atan2(input.aim.y, input.aim.x);
  else if (input.move.x || input.move.y) h.aim = Math.atan2(input.move.y, input.move.x);

  h.cooldown -= dt;
  h.hitFlash = Math.max(0, h.hitFlash - dt * 4);

  if (input.superPressed && g.super >= 100) {
    g.super = 0;
    heroSuper(g);
  } else if (input.shooting && h.cooldown <= 0) {
    heroFire(g);
    h.cooldown = b.cooldown * (g.buffs.rapid > 0 ? 0.45 : 1);
  }

  for (const e of g.enemies) {
    e.hitFlash = Math.max(0, e.hitFlash - dt * 4);
    e.ringTimer = Math.max(0, e.ringTimer - dt);
    const d = dist(e.pos, h.pos);
    const ang = Math.atan2(h.pos.y - e.pos.y, h.pos.x - e.pos.x);
    e.aim = ang;
    let want = 0;
    if (e.enemyKind === "runner" || e.enemyKind === "brute") want = 1;
    else if (e.enemyKind === "boss") want = d > 260 ? 1 : -0.3;
    else want = d > 300 ? 1 : d < 200 ? -0.6 : 0;
    const strafe = Math.sin(g.time * 1.6 + e.id) * (e.enemyKind === "runner" ? 0.2 : 0.5);
    moveWithCollision(
      e,
      (Math.cos(ang) * want + Math.cos(ang + Math.PI / 2) * strafe) * e.speed * dt,
      (Math.sin(ang) * want + Math.sin(ang + Math.PI / 2) * strafe) * e.speed * dt,
    );
    e.cooldown -= dt;

    if (e.enemyKind === "runner" || e.enemyKind === "brute") {
      if (d < e.radius + h.radius + 4 && e.cooldown <= 0) {
        damageHero(g, e.enemyKind === "brute" ? 18 : 10);
        e.cooldown = 0.9;
      }
    } else if (e.enemyKind === "boss") {
      if (e.cooldown <= 0) {
        if (Math.random() < 0.45) {
          const n = 12;
          for (let i = 0; i < n; i++)
            addBullet(g, e, (i / n) * Math.PI * 2 + g.time, {
              dmg: 11,
              speed: 330,
              radius: 10,
              life: 2,
              color: "oklch(0.7 0.22 20)",
            });
          g.shake = Math.max(g.shake, 8);
        } else {
          for (let i = -2; i <= 2; i++)
            addBullet(g, e, e.aim + i * 0.16, {
              dmg: 13,
              speed: 480,
              radius: 11,
              life: 2,
              color: "oklch(0.7 0.22 20)",
            });
        }
        sfx.enemyShoot();
        e.cooldown = 1.5;
      }
    } else if (e.cooldown <= 0 && d < 520) {
      addBullet(g, e, e.aim, {
        dmg: e.enemyKind === "shooter" ? 11 : 8,
        speed: 470,
        radius: 8,
        life: 1.4,
        color: e.color,
      });
      sfx.enemyShoot();
      e.cooldown = e.enemyKind === "shooter" ? 1.1 : 1.5;
    }
  }

  for (let i = 0; i < g.enemies.length; i++) {
    for (let j = i + 1; j < g.enemies.length; j++) {
      const a = g.enemies[i]!;
      const c = g.enemies[j]!;
      const d = dist(a.pos, c.pos);
      const min = a.radius + c.radius;
      if (d > 0 && d < min) {
        const push = ((min - d) / 2) * 0.6;
        const nx = (a.pos.x - c.pos.x) / d;
        const ny = (a.pos.y - c.pos.y) / d;
        moveWithCollision(a, nx * push, ny * push);
        moveWithCollision(c, -nx * push, -ny * push);
      }
    }
  }

  for (const bl of g.bullets) {
    bl.trail.push({ x: bl.pos.x, y: bl.pos.y });
    if (bl.trail.length > 6) bl.trail.shift();
    bl.pos.x += bl.vel.x * dt;
    bl.pos.y += bl.vel.y * dt;
    bl.life -= dt;
    if (
      bl.pos.x < 0 ||
      bl.pos.y < 0 ||
      bl.pos.x > ARENA_W ||
      bl.pos.y > ARENA_H ||
      circleHitsWall(bl.pos, bl.radius)
    ) {
      bl.life = 0;
      burst(g, bl.pos, bl.color, 4, 90);
      continue;
    }
    if (bl.owner === "hero") {
      for (const e of g.enemies) {
        if (e.hp > 0 && !bl.hits.includes(e.id) && dist(bl.pos, e.pos) < e.radius + bl.radius) {
          e.hp -= bl.damage;
          e.hitFlash = 1;
          bl.hits.push(e.id);
          g.super = Math.min(100, g.super + (hasSynergy(g.buffs, "omega") ? 10 : 5));
          if (hasSynergy(g.buffs, "berserk")) h.hp = Math.min(h.maxHp, h.hp + bl.damage * 0.12);
          burst(g, bl.pos, bl.color, 6, 140);
          sfx.hit();
          if (bl.pierce > 0) bl.pierce -= 1;
          else bl.life = 0;
          break;
        }
      }
    } else if (dist(bl.pos, h.pos) < h.radius + bl.radius) {
      damageHero(g, bl.damage);
      bl.life = 0;
      burst(g, bl.pos, bl.color, 6, 140);
    }
  }
  g.bullets = g.bullets.filter((bl) => bl.life > 0);

  const dead = g.enemies.filter((e) => e.hp <= 0);
  for (const e of dead) {
    const boss = e.enemyKind === "boss";
    burst(g, e.pos, e.color, boss ? 110 : 30, boss ? 460 : 300);
    addRing(g, e.pos, boss ? 340 : 110, boss ? "oklch(0.9 0.19 60)" : e.color, {
      life: boss ? 0.8 : 0.4,
      width: boss ? 18 : 7,
    });
    if (boss) addRing(g, e.pos, 180, "#ffffff", { life: 0.5, width: 10 });
    addDecal(g, e.pos, e.radius * (boss ? 2.2 : 1.3), e.color);
    g.score += boss ? 1500 : e.enemyKind === "brute" ? 250 : 100;
    g.super = Math.min(100, g.super + (boss ? 60 : 14));
    g.shake = Math.max(g.shake, boss ? 18 : 4);
    g.texts.push({
      pos: { ...e.pos },
      text: boss ? "+1500" : `+${e.enemyKind === "brute" ? 250 : 100}`,
      life: 1,
      color: "oklch(0.9 0.16 90)",
    });
    sfx.kill();
    const chance = boss ? 1 : e.enemyKind === "brute" ? 0.7 : 0.35;
    if (Math.random() < chance) {
      const kinds: PowerKind[] = ["heal", "heal", "damage", "speed", "shield", "rapid"];
      const kind = kinds[Math.floor(Math.random() * kinds.length)]!;
      g.pickups.push({ id: nid(), pos: { ...e.pos }, bob: Math.random() * 6, kind });
    }
    if (boss) {
      g.bossActive = false;
      g.bossKills += 1;
    }
  }
  g.enemies = g.enemies.filter((e) => e.hp > 0);

  for (const p of g.pickups) p.bob += dt * 4;
  g.pickups = g.pickups.filter((p) => {
    if (dist(p.pos, h.pos) < h.radius + 24) {
      applyPower(g, p.kind);
      burst(g, p.pos, "oklch(0.9 0.15 120)", 22, 220);
      addRing(g, p.pos, 80, "oklch(0.9 0.15 120)", { life: 0.35, width: 5 });
      return false;
    }
    return true;
  });

  for (const t of g.texts) {
    t.pos.y -= dt * 40;
    t.life -= dt;
  }
  g.texts = g.texts.filter((t) => t.life > 0);

  stepParticles(g, dt);

  if (h.hp <= 0) {
    h.hp = 0;
    g.over = true;
    g.shake = 20;
    burst(g, h.pos, g.skin.color, 70, 420);
    addRing(g, h.pos, 260, g.skin.color, { life: 0.7, width: 14 });
    sfx.gameover();
  }
}

function applyPower(g: GameState, kind: PowerKind) {
  const h = g.hero;
  if (kind === "heal") h.hp = Math.min(h.maxHp, h.hp + 40);
  else if (kind === "damage") g.buffs.damage = 9;
  else if (kind === "speed") g.buffs.speed = 9;
  else if (kind === "shield") g.buffs.shield = 10;
  else g.buffs.rapid = 8;
  g.texts.push({
    pos: { ...h.pos },
    text: POWER_LABEL[kind],
    life: 1.4,
    color: "oklch(0.92 0.14 140)",
  });
  if (kind === "heal") sfx.pickup();
  else sfx.power();
}

function damageHero(g: GameState, dmg: number) {
  const h = g.hero;
  const final = g.buffs.shield > 0 ? dmg * (hasSynergy(g.buffs, "phantom") ? 0.25 : 0.4) : dmg;
  h.hp -= final;
  h.hitFlash = 1;
  g.shake = Math.max(g.shake, 6);
  sfx.hurt();
}

function stepFx(g: GameState, dt: number) {
  for (const r of g.rings) {
    r.life -= dt;
    const t = 1 - Math.max(0, r.life) / r.max;
    r.r = 8 + (r.target - 8) * (1 - Math.pow(1 - t, 3));
  }
  g.rings = g.rings.filter((r) => r.life > 0);
  for (const d of g.decals) d.life -= dt;
  g.decals = g.decals.filter((d) => d.life > 0);
}

function stepParticles(g: GameState, dt: number) {
  stepFx(g, dt);
  for (const p of g.particles) {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.vel.x *= 0.92;
    p.vel.y *= 0.92;
    p.life -= dt;
  }
  g.particles = g.particles.filter((p) => p.life > 0);
}
