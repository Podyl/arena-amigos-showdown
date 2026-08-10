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

export type Entity = {
  id: number;
  pos: Vec;
  hp: number;
  maxHp: number;
  radius: number;
  aim: number;
  cooldown: number;
  kind: "hero" | "enemy";
  hitFlash: number;
  speed: number;
};

export type Bullet = {
  id: number;
  pos: Vec;
  vel: Vec;
  owner: "hero" | "enemy";
  life: number;
  damage: number;
  radius: number;
};

export type Particle = { pos: Vec; vel: Vec; life: number; max: number; hue: string; size: number };

export type Pickup = { id: number; pos: Vec; bob: number };

export type GameState = {
  hero: Entity;
  enemies: Entity[];
  bullets: Bullet[];
  particles: Particle[];
  pickups: Pickup[];
  score: number;
  wave: number;
  waveTimer: number;
  spawnQueue: number;
  spawnTimer: number;
  super: number;
  over: boolean;
  time: number;
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

export function createGame(): GameState {
  return {
    hero: {
      id: nid(),
      pos: { x: ARENA_W / 2, y: ARENA_H - 220 },
      hp: 100,
      maxHp: 100,
      radius: 26,
      aim: -Math.PI / 2,
      cooldown: 0,
      kind: "hero",
      hitFlash: 0,
      speed: 260,
    },
    enemies: [],
    bullets: [],
    particles: [],
    pickups: [],
    score: 0,
    wave: 0,
    waveTimer: 0.8,
    spawnQueue: 0,
    spawnTimer: 0,
    super: 0,
    over: false,
    time: 0,
  };
}

function spawnEnemy(g: GameState) {
  const tough = 1 + g.wave * 0.25;
  let pos: Vec = { x: 0, y: 0 };
  for (let i = 0; i < 60; i++) {
    pos = { x: 60 + Math.random() * (ARENA_W - 120), y: 60 + Math.random() * (ARENA_H * 0.6) };
    if (!circleHitsWall(pos, 30) && dist(pos, g.hero.pos) > 420) break;
  }
  g.enemies.push({
    id: nid(),
    pos,
    hp: 50 * tough,
    maxHp: 50 * tough,
    radius: 24,
    aim: 0,
    cooldown: Math.random(),
    kind: "enemy",
    hitFlash: 0,
    speed: 90 + Math.min(60, g.wave * 8),
  });
  burst(g, pos, "var(--enemy)", 12);
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

function fire(g: GameState, e: Entity, spreadCount: number, dmg: number, speed: number) {
  for (let i = 0; i < spreadCount; i++) {
    const off = (i - (spreadCount - 1) / 2) * 0.14;
    const a = e.aim + off;
    g.bullets.push({
      id: nid(),
      pos: { x: e.pos.x + Math.cos(a) * (e.radius + 6), y: e.pos.y + Math.sin(a) * (e.radius + 6) },
      vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
      owner: e.kind,
      life: 1.1,
      damage: dmg,
      radius: 7,
    });
  }
}

export type Input = {
  move: Vec;
  aim: Vec;
  shooting: boolean;
  superPressed: boolean;
};

export function step(g: GameState, input: Input, dt: number) {
  g.time += dt;
  if (g.over) {
    stepParticles(g, dt);
    return;
  }

  // waves
  if (g.enemies.length === 0 && g.spawnQueue === 0) {
    g.waveTimer -= dt;
    if (g.waveTimer <= 0) {
      g.wave += 1;
      g.spawnQueue = 2 + Math.floor(g.wave * 1.4);
      g.waveTimer = 4;
    }
  }
  if (g.spawnQueue > 0) {
    g.spawnTimer -= dt;
    if (g.spawnTimer <= 0) {
      spawnEnemy(g);
      g.spawnQueue -= 1;
      g.spawnTimer = 0.45;
    }
  }

  const h = g.hero;
  moveWithCollision(h, input.move.x * h.speed * dt, input.move.y * h.speed * dt);

  if (input.aim.x || input.aim.y) h.aim = Math.atan2(input.aim.y, input.aim.x);
  else if (input.move.x || input.move.y) h.aim = Math.atan2(input.move.y, input.move.x);

  h.cooldown -= dt;
  h.hitFlash = Math.max(0, h.hitFlash - dt * 4);

  if (input.superPressed && g.super >= 100) {
    g.super = 0;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.bullets.push({
        id: nid(),
        pos: { x: h.pos.x + Math.cos(a) * 30, y: h.pos.y + Math.sin(a) * 30 },
        vel: { x: Math.cos(a) * 620, y: Math.sin(a) * 620 },
        owner: "hero",
        life: 1.3,
        damage: 40,
        radius: 10,
      });
    }
    burst(g, h.pos, "var(--primary)", 40, 380);
  } else if (input.shooting && h.cooldown <= 0) {
    fire(g, h, 3, 22, 700);
    h.cooldown = 0.34;
  }

  for (const e of g.enemies) {
    e.hitFlash = Math.max(0, e.hitFlash - dt * 4);
    const d = dist(e.pos, h.pos);
    const ang = Math.atan2(h.pos.y - e.pos.y, h.pos.x - e.pos.x);
    e.aim = ang;
    const want = d > 300 ? 1 : d < 200 ? -0.6 : 0;
    const strafe = Math.sin(g.time * 1.6 + e.id) * 0.5;
    moveWithCollision(
      e,
      (Math.cos(ang) * want + Math.cos(ang + Math.PI / 2) * strafe) * e.speed * dt,
      (Math.sin(ang) * want + Math.sin(ang + Math.PI / 2) * strafe) * e.speed * dt,
    );
    e.cooldown -= dt;
    if (e.cooldown <= 0 && d < 520) {
      fire(g, e, 1, 9, 460);
      e.cooldown = 1.3;
    }
  }

  // separation
  for (let i = 0; i < g.enemies.length; i++) {
    for (let j = i + 1; j < g.enemies.length; j++) {
      const a = g.enemies[i]!;
      const b = g.enemies[j]!;
      const d = dist(a.pos, b.pos);
      const min = a.radius + b.radius;
      if (d > 0 && d < min) {
        const push = ((min - d) / 2) * 0.6;
        const nx = (a.pos.x - b.pos.x) / d;
        const ny = (a.pos.y - b.pos.y) / d;
        moveWithCollision(a, nx * push, ny * push);
        moveWithCollision(b, -nx * push, -ny * push);
      }
    }
  }

  for (const b of g.bullets) {
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    b.life -= dt;
    if (
      b.pos.x < 0 ||
      b.pos.y < 0 ||
      b.pos.x > ARENA_W ||
      b.pos.y > ARENA_H ||
      circleHitsWall(b.pos, b.radius)
    ) {
      b.life = 0;
      burst(g, b.pos, "var(--bullet)", 4, 90);
      continue;
    }
    if (b.owner === "hero") {
      for (const e of g.enemies) {
        if (e.hp > 0 && dist(b.pos, e.pos) < e.radius + b.radius) {
          e.hp -= b.damage;
          e.hitFlash = 1;
          b.life = 0;
          g.super = Math.min(100, g.super + 6);
          burst(g, b.pos, "var(--bullet)", 6, 140);
          break;
        }
      }
    } else if (dist(b.pos, h.pos) < h.radius + b.radius) {
      h.hp -= b.damage;
      h.hitFlash = 1;
      b.life = 0;
      burst(g, b.pos, "var(--enemy)", 6, 140);
    }
  }
  g.bullets = g.bullets.filter((b) => b.life > 0);

  const dead = g.enemies.filter((e) => e.hp <= 0);
  for (const e of dead) {
    burst(g, e.pos, "var(--enemy)", 26, 300);
    g.score += 100;
    g.super = Math.min(100, g.super + 15);
    if (Math.random() < 0.4) g.pickups.push({ id: nid(), pos: { ...e.pos }, bob: 0 });
  }
  g.enemies = g.enemies.filter((e) => e.hp > 0);

  for (const p of g.pickups) p.bob += dt * 4;
  g.pickups = g.pickups.filter((p) => {
    if (dist(p.pos, h.pos) < h.radius + 22) {
      h.hp = Math.min(h.maxHp, h.hp + 25);
      burst(g, p.pos, "var(--arena)", 14, 180);
      return false;
    }
    return true;
  });

  stepParticles(g, dt);

  if (h.hp <= 0) {
    h.hp = 0;
    g.over = true;
    burst(g, h.pos, "var(--hero)", 50, 400);
  }
}

function stepParticles(g: GameState, dt: number) {
  for (const p of g.particles) {
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.vel.x *= 0.92;
    p.vel.y *= 0.92;
    p.life -= dt;
  }
  g.particles = g.particles.filter((p) => p.life > 0);
}