import { ARENA_H, ARENA_W, WALLS, type GameState, type PowerKind } from "./engine";
import { DECOR, TORCHES } from "./decor";
import type { Skin } from "./skins";
import { enemySpriteKey, sprite } from "./sprites";

const cache = new Map<string, string>();
export function cssVar(name: string) {
  if (typeof window === "undefined") return "#888";
  const hit = cache.get(name);
  if (hit) return hit;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
  cache.set(name, v);
  return v;
}
function color(token: string) {
  const m = /^var\((--[\w-]+)\)$/.exec(token);
  return m ? cssVar(m[1]!) : token;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/* ---------------- character animation ---------------- */

/** Per-unit animation state derived from motion (presentation only). */
type Anim = {
  px: number;
  py: number;
  vx: number;
  vy: number;
  sp: number;
  phase: number;
  lean: number;
  aim: number;
  land: number;
  /** shot recoil 1 -> 0 */
  fire: number;
  /** hit flinch 1 -> 0 */
  hit: number;
  /** direction the unit was facing when hit */
  hitAng: number;
  pcd: number;
  pflash: number;
};

const anims = new Map<number, Anim>();
let animLastTime = 0;
let animDt = 1 / 60;

const lerpAngle = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
};

function tickAnim(
  id: number,
  x: number,
  y: number,
  aim: number,
  speedRef: number,
  cd = 0,
  flash = 0,
): Anim {
  const dt = animDt;
  let a = anims.get(id);
  if (!a) {
    a = {
      px: x,
      py: y,
      vx: 0,
      vy: 0,
      sp: 0,
      phase: Math.random() * 6.28,
      lean: 0,
      aim,
      land: 0,
      fire: 0,
      hit: 0,
      hitAng: aim,
      pcd: cd,
      pflash: flash,
    };
    anims.set(id, a);
  }
  // a cooldown that jumped up means a shot just left the barrel
  if (cd > a.pcd + 0.02) a.fire = 1;
  a.pcd = cd;
  if (flash > a.pflash + 0.05) {
    a.hit = 1;
    a.hitAng = aim;
  }
  a.pflash = flash;
  a.fire = Math.max(0, a.fire - dt * 5.5);
  a.hit = Math.max(0, a.hit - dt * 4.5);
  const ivx = dt > 0 ? (x - a.px) / dt : 0;
  const ivy = dt > 0 ? (y - a.py) / dt : 0;
  // smooth velocity so steps don't jitter on collisions
  const k = Math.min(1, dt * 12);
  a.vx += (ivx - a.vx) * k;
  a.vy += (ivy - a.vy) * k;
  a.px = x;
  a.py = y;
  const sp = Math.hypot(a.vx, a.vy);
  a.sp = Math.min(1, sp / Math.max(60, speedRef));
  // walk cycle speed follows actual pace; idle keeps a slow breathing cycle
  a.phase += dt * (2.2 + a.sp * 12);
  if (a.phase > Math.PI * 200) a.phase -= Math.PI * 200;
  const targetLean = Math.max(-0.22, Math.min(0.22, (a.vx / Math.max(120, speedRef)) * 0.22));
  a.lean += (targetLean - a.lean) * Math.min(1, dt * 8);
  a.aim = lerpAngle(a.aim, aim, Math.min(1, dt * 14));
  a.land = Math.max(0, a.land - dt * 3);
  return a;
}

function pruneAnims(alive: Set<number>) {
  if (anims.size < 64) return;
  for (const id of anims.keys()) if (!alive.has(id)) anims.delete(id);
}

/* ---------------- body archetypes ---------------- */

export type BuildKind = "bulky" | "lanky" | "tank" | "nimble";

/** Silhouette metrics per archetype so brawlers don't share one body. */
const BUILDS: Record<
  BuildKind,
  { tw: number; th: number; tr: number; hr: number; stance: number; foot: number; arm: number }
> = {
  bulky: { tw: 1.34, th: 0.86, tr: 0.36, hr: 0.76, stance: 0.44, foot: 0.31, arm: 1 },
  lanky: { tw: 0.96, th: 1.02, tr: 0.42, hr: 0.64, stance: 0.34, foot: 0.25, arm: 1.18 },
  tank: { tw: 1.62, th: 0.78, tr: 0.3, hr: 0.86, stance: 0.54, foot: 0.36, arm: 0.86 },
  nimble: { tw: 0.88, th: 0.74, tr: 0.38, hr: 0.72, stance: 0.3, foot: 0.24, arm: 1.06 },
};

/* ---------------- floor ---------------- */

let floorPattern: CanvasPattern | null = null;
function getFloor(ctx: CanvasRenderingContext2D) {
  if (floorPattern) return floorPattern;
  const tile = 100;
  const c = document.createElement("canvas");
  c.width = tile * 2;
  c.height = tile * 2;
  const t = c.getContext("2d")!;
  const a = cssVar("--arena");
  const b = cssVar("--arena-alt");
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      t.fillStyle = (i + j) % 2 === 0 ? a : b;
      t.fillRect(i * tile, j * tile, tile, tile);
      // mown-grass streaks
      t.globalAlpha = 0.06;
      t.strokeStyle = (i + j) % 2 === 0 ? "#ffffff" : "#000000";
      t.lineWidth = 3;
      for (let s = 0; s < 7; s++) {
        t.beginPath();
        t.moveTo(i * tile, j * tile + s * 14 + 6);
        t.lineTo(i * tile + tile, j * tile + s * 14 + 6);
        t.stroke();
      }
      t.globalAlpha = 1;
    }
  t.globalAlpha = 0.09;
  for (let n = 0; n < 320; n++) {
    t.fillStyle = n % 2 ? "#ffffff" : "#000000";
    t.fillRect(
      Math.random() * tile * 2,
      Math.random() * tile * 2,
      2 + Math.random() * 3,
      2 + Math.random() * 3,
    );
  }
  t.globalAlpha = 1;
  floorPattern = ctx.createPattern(c, "repeat");
  return floorPattern;
}

function drawDecor(ctx: CanvasRenderingContext2D, time: number) {
  for (const d of DECOR) {
    const sway = Math.sin(time * 1.6 + d.seed) * 0.12;
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.kind === "grass") {
      ctx.strokeStyle = "oklch(0.55 0.13 150 / 70%)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 5, 0);
        ctx.quadraticCurveTo(i * 6 + sway * 14, -d.r * 0.6, i * 8 + sway * 22, -d.r);
        ctx.stroke();
      }
      ctx.lineCap = "butt";
    } else if (d.kind === "flower") {
      ctx.strokeStyle = "oklch(0.5 0.12 150 / 70%)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(sway * 10, -d.r);
      ctx.stroke();
      ctx.fillStyle = d.seed % 2 > 1 ? "oklch(0.85 0.16 30)" : "oklch(0.88 0.15 90)";
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(sway * 10 + Math.cos(a) * 3.4, -d.r + Math.sin(a) * 3.4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (d.kind === "rock") {
      ctx.rotate(d.rot);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(2, 4, d.r * 0.7, d.r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "oklch(0.5 0.02 250)";
      ctx.beginPath();
      ctx.moveTo(-d.r * 0.6, d.r * 0.3);
      ctx.lineTo(-d.r * 0.3, -d.r * 0.5);
      ctx.lineTo(d.r * 0.35, -d.r * 0.4);
      ctx.lineTo(d.r * 0.6, d.r * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(-d.r * 0.3, -d.r * 0.45, d.r * 0.5, d.r * 0.18);
    } else if (d.kind === "crack") {
      ctx.rotate(d.rot);
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-d.r, 0);
      ctx.lineTo(-d.r * 0.2, -4);
      ctx.lineTo(d.r * 0.3, 3);
      ctx.lineTo(d.r, -2);
      ctx.stroke();
    } else if (d.kind === "puddle") {
      ctx.rotate(d.rot);
      ctx.fillStyle = "oklch(0.4 0.05 200 / 35%)";
      ctx.beginPath();
      ctx.ellipse(0, 0, d.r, d.r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (d.kind === "bush") {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(3, d.r * 0.5, d.r * 0.9, d.r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + d.rot;
        ctx.beginPath();
        ctx.arc(
          Math.cos(a) * d.r * 0.4 + sway * 6,
          Math.sin(a) * d.r * 0.28 - d.r * 0.1,
          d.r * 0.55,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = i % 2 ? "oklch(0.44 0.11 152)" : "oklch(0.5 0.13 148)";
        ctx.fill();
      }
    } else if (d.kind === "vent") {
      ctx.rotate(d.rot);
      ctx.fillStyle = "oklch(0.34 0.03 250)";
      roundRect(ctx, -d.r * 0.7, -d.r * 0.5, d.r * 1.4, d.r, 4);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-d.r * 0.55, -d.r * 0.28 + i * d.r * 0.28);
        ctx.lineTo(d.r * 0.55, -d.r * 0.28 + i * d.r * 0.28);
        ctx.stroke();
      }
    } else {
      // bone
      ctx.rotate(d.rot);
      ctx.fillStyle = "oklch(0.9 0.02 90 / 45%)";
      roundRect(ctx, -d.r * 0.6, -2, d.r * 1.2, 4, 2);
      ctx.fill();
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * d.r * 0.6, -2.5, 3.2, 0, Math.PI * 2);
        ctx.arc(s * d.r * 0.6, 2.5, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawArenaMarks(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(ARENA_W / 2, ARENA_H / 2, 190, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ARENA_W / 2, ARENA_H / 2, 70, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([26, 22]);
  ctx.beginPath();
  ctx.moveTo(60, ARENA_H / 2);
  ctx.lineTo(ARENA_W - 60, ARENA_H / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawTorches(ctx: CanvasRenderingContext2D, time: number) {
  for (const t of TORCHES) {
    const f = 0.75 + Math.sin(time * 9 + t.y) * 0.12 + Math.random() * 0.06;
    const g = ctx.createRadialGradient(t.x, t.y, 4, t.x, t.y, 190 * f);
    g.addColorStop(0, "oklch(0.9 0.16 70 / 34%)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 190 * f, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "oklch(0.3 0.03 60)";
    roundRect(ctx, t.x - 7, t.y - 6, 14, 34, 5);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = "oklch(0.85 0.19 60)";
    ctx.shadowBlur = 26;
    ctx.fillStyle = "oklch(0.88 0.19 65)";
    ctx.beginPath();
    ctx.ellipse(t.x, t.y - 14, 8 * f, 15 * f, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "oklch(0.96 0.12 95)";
    ctx.beginPath();
    ctx.ellipse(t.x, t.y - 12, 4 * f, 8 * f, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawWalls(ctx: CanvasRenderingContext2D) {
  for (const wl of WALLS) {
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    roundRect(ctx, wl.x + 8, wl.y + 16, wl.w, wl.h, 14);
    ctx.fill();

    // side (extruded body)
    ctx.fillStyle = "oklch(0.28 0.04 60)";
    roundRect(ctx, wl.x, wl.y + 10, wl.w, wl.h, 14);
    ctx.fill();

    const wg = ctx.createLinearGradient(wl.x, wl.y, wl.x, wl.y + wl.h);
    wg.addColorStop(0, "oklch(0.56 0.06 62)");
    wg.addColorStop(1, cssVar("--wall"));
    ctx.fillStyle = wg;
    roundRect(ctx, wl.x, wl.y, wl.w, wl.h, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 4;
    ctx.stroke();

    // brick seams
    ctx.save();
    roundRect(ctx, wl.x, wl.y, wl.w, wl.h, 14);
    ctx.clip();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 3;
    for (let y = wl.y + 24; y < wl.y + wl.h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(wl.x, y);
      ctx.lineTo(wl.x + wl.w, y);
      ctx.stroke();
    }
    for (let x = wl.x + 30, row = 0; x < wl.x + wl.w; x += 30, row++) {
      ctx.beginPath();
      ctx.moveTo(x, wl.y + (row % 2 ? 0 : 12));
      ctx.lineTo(x, wl.y + wl.h);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(wl.x, wl.y, wl.w, 8);
    ctx.restore();

    // moss on top edge
    ctx.fillStyle = "oklch(0.5 0.12 150 / 45%)";
    for (let x = wl.x + 8; x < wl.x + wl.w - 6; x += 16) {
      ctx.beginPath();
      ctx.ellipse(x, wl.y + 2, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* ---------------- pickups ---------------- */

const POWER_ICON: Record<PowerKind, { bg: string; glyph: string }> = {
  heal: { bg: "oklch(0.65 0.2 20)", glyph: "+" },
  damage: { bg: "oklch(0.68 0.2 45)", glyph: "⚔" },
  speed: { bg: "oklch(0.75 0.17 200)", glyph: "»" },
  shield: { bg: "oklch(0.7 0.14 260)", glyph: "◈" },
  rapid: { bg: "oklch(0.82 0.17 100)", glyph: "⚡" },
};

/* ---------------- main ---------------- */

export function draw(ctx: CanvasRenderingContext2D, g: GameState, w: number, h: number) {
  animDt = Math.max(0.0005, Math.min(0.05, g.time - animLastTime));
  animLastTime = g.time;
  const scale = Math.max(w / 500, h / 820);
  const halfW = w / 2 / scale;
  const halfH = h / 2 / scale;
  const camX = Math.min(Math.max(g.hero.pos.x, halfW), Math.max(halfW, ARENA_W - halfW));
  const camY = Math.min(Math.max(g.hero.pos.y, halfH), Math.max(halfH, ARENA_H - halfH));
  const sx = g.shake ? (Math.random() - 0.5) * g.shake : 0;
  const sy = g.shake ? (Math.random() - 0.5) * g.shake : 0;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = cssVar("--background");
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2 + sx, h / 2 + sy);
  ctx.scale(scale, scale);
  ctx.translate(-camX, -camY);

  const pat = getFloor(ctx);
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  }

  const grad = ctx.createRadialGradient(
    ARENA_W / 2,
    ARENA_H / 2,
    80,
    ARENA_W / 2,
    ARENA_H / 2,
    ARENA_H * 0.8,
  );
  grad.addColorStop(0, "rgba(255,255,255,0.1)");
  grad.addColorStop(1, "rgba(0,0,0,0.4)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  drawArenaMarks(ctx);

  // scorch decals
  for (const d of g.decals) {
    ctx.globalAlpha = Math.min(0.42, (d.life / d.max) * 0.42);
    ctx.fillStyle = color(d.color);
    ctx.beginPath();
    ctx.ellipse(d.pos.x, d.pos.y, d.r, d.r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawDecor(ctx, g.time);
  drawTorches(ctx, g.time);

  ctx.lineWidth = 16;
  ctx.strokeStyle = cssVar("--wall");
  ctx.strokeRect(0, 0, ARENA_W, ARENA_H);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(8, 8, ARENA_W - 16, ARENA_H - 16);

  // pickups
  for (const p of g.pickups) {
    const bob = Math.sin(p.bob) * 6;
    const ic = POWER_ICON[p.kind];
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(p.pos.x, p.pos.y + 22, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const halo = ctx.createRadialGradient(p.pos.x, p.pos.y + bob, 6, p.pos.x, p.pos.y + bob, 60);
    halo.addColorStop(0, "rgba(255,255,255,0.22)");
    halo.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y + bob, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(p.pos.x, p.pos.y + bob);
    ctx.rotate(Math.sin(p.bob * 0.5) * 0.15);
    ctx.shadowColor = ic.bg;
    ctx.shadowBlur = 24;
    ctx.fillStyle = ic.bg;
    roundRect(ctx, -17, -17, 34, 34, 10);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(p.pos.x, p.pos.y + bob);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    roundRect(ctx, -17, -17, 34, 34, 10);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ic.glyph, 0, 1);
    ctx.restore();
  }

  drawWalls(ctx);

  const drawUnit = (
    x: number,
    y: number,
    r: number,
    aim: number,
    base: string,
    flash: number,
    hp: number,
    maxHp: number,
    hat: string,
    boss = false,
    ring = 0,
    an?: Anim,
    skin?: Skin,
    build: BuildKind = "bulky",
    art?: HTMLImageElement | null,
  ) => {
    const B = BUILDS[build];
    const fire = an?.fire ?? 0;
    // anticipation on the way up, snap-back recoil on the way down
    const kick = Math.sin(Math.min(1, fire) * Math.PI) * (fire > 0.75 ? -0.35 : 1);
    const flinch = an?.hit ?? 0;
    const flinchAng = an?.hitAng ?? 0;
    const sp = an?.sp ?? 0;
    const phase = an?.phase ?? 0;
    const lean = an?.lean ?? 0;
    if (an) aim = an.aim;
    // walk bounce + idle breathing
    const bounce = -Math.abs(Math.sin(phase)) * r * 0.16 * sp;
    const breathe = Math.sin(phase * 0.9) * r * 0.03 * (1 - sp);
    const bob = bounce + breathe;
    // squash & stretch around the feet
    const sqy =
      1 +
      Math.sin(phase * 2) * 0.06 * sp +
      Math.sin(phase * 0.9) * 0.012 * (1 - sp) -
      kick * 0.09 +
      flinch * 0.1;
    const sqx = 1 / sqy;
    // ground-plane movement direction for foot placement
    const mvLen = Math.hypot(an?.vx ?? 0, an?.vy ?? 0) || 1;
    const dirX = (an?.vx ?? 0) / mvLen;
    const dirY = (an?.vy ?? 0) / mvLen;
    if (ring > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.25 * ring})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 14 + (3 - ring) * 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (skin?.aura) {
      const a = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.4);
      a.addColorStop(0, "rgba(255,255,255,0.001)");
      a.addColorStop(0.55, color(skin.aura));
      a.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalAlpha = 0.28 + Math.sin(performance.now() / 260) * 0.08;
      ctx.fillStyle = a;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.save();
    ctx.globalAlpha = 1 - Math.abs(bounce) / (r * 0.4);
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + r * 0.9,
      r * 0.95 * (1 - Math.abs(bounce) / (r * 1.6)),
      r * 0.38 * (1 - Math.abs(bounce) / (r * 1.6)),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();

    const pushX = -Math.cos(aim) * r * 0.16 * kick - Math.cos(flinchAng) * r * 0.2 * flinch;
    const pushY = -Math.sin(aim) * r * 0.12 * kick - Math.sin(flinchAng) * r * 0.14 * flinch;
    const shake = flinch * flinch * r * 0.1;
    const jx = (Math.random() - 0.5) * shake;
    const jy = (Math.random() - 0.5) * shake;
    const bx = x;
    const by = y + bob;
    const face = Math.cos(aim) >= 0 ? 1 : -1;
    const ink = "rgba(20,12,26,0.9)";
    const outline = (w2: number) => {
      ctx.strokeStyle = ink;
      ctx.lineWidth = w2;
      ctx.lineJoin = "round";
      ctx.stroke();
    };
    const body = flash > 0.05 ? "#ffffff" : base;

    // pre-rendered art path: animate the sprite instead of drawing a vector body
    if (art) {
      const h2 = r * 3.5;
      const w2 = h2 * (art.naturalWidth / art.naturalHeight);
      const feetY = y + r * 0.98;
      ctx.save();
      ctx.translate(x + pushX + jx, feetY + pushY + jy);
      ctx.rotate(lean * 0.9 + flinch * 0.14 * (Math.cos(flinchAng) >= 0 ? -1 : 1));
      ctx.scale(face * sqx, sqy);
      ctx.translate(0, bob);
      if (skin?.aura) {
        ctx.shadowColor = color(skin.aura);
        ctx.shadowBlur = r * 0.9;
      }
      ctx.drawImage(art, -w2 / 2, -h2, w2, h2);
      ctx.shadowBlur = 0;
      if (flash > 0.05) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = Math.min(0.85, flash * 1.4);
        ctx.drawImage(art, -w2 / 2, -h2, w2, h2);
        ctx.drawImage(art, -w2 / 2, -h2, w2, h2);
      }
      ctx.restore();
    }

    // feet stay on the ground, body above leans & squashes
    for (const s of art ? [] : [-1, 1]) {
      const ph = phase + (s > 0 ? 0 : Math.PI);
      const step = Math.cos(ph) * sp;
      const lift = Math.max(0, Math.sin(ph)) * sp;
      const fx = x + s * r * B.stance * (1 - sp * 0.35) + dirX * step * r * 0.5;
      const fy = y + r * 0.86 + dirY * step * r * 0.22 - lift * r * 0.3;
      ctx.save();
      ctx.fillStyle = "rgba(20,12,26,0.85)";
      ctx.beginPath();
      ctx.ellipse(fx, fy, r * B.foot, r * B.foot * 0.63 * (1 + lift * 0.3), lean * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // everything above the feet pivots and squashes with the walk cycle
    if (!art) {
    ctx.save();
    ctx.translate(x + pushX + jx, y + r * 0.85 + pushY + jy);
    ctx.rotate(lean + flinch * 0.16 * (Math.cos(flinchAng) >= 0 ? -1 : 1));
    ctx.scale(sqx, sqy);
    ctx.translate(-x, -(y + r * 0.85));

    // cape behind body
    if (skin?.cape) {
      ctx.save();
      ctx.fillStyle = color(skin.cape);
      ctx.beginPath();
      const swing = Math.sin(phase * 1.1) * r * (0.12 + sp * 0.3) - dirX * sp * r * 0.5;
      ctx.moveTo(x - r * 0.55, by - r * 0.15);
      ctx.quadraticCurveTo(x + swing, by + r * (1.35 - sp * 0.35), x + r * 0.55, by - r * 0.15);
      ctx.closePath();
      ctx.fill();
      outline(r * 0.12);
      ctx.restore();
    }

    // torso
    ctx.beginPath();
    ctx.roundRect(
      bx - r * B.tw * 0.5,
      by + r * 0.05,
      r * B.tw,
      r * B.th,
      r * B.tr,
    );
    ctx.fillStyle = body;
    ctx.fill();
    outline(r * 0.16);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(bx - r, by + r * B.th * 0.6, r * 2, r);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(bx - r * B.tw * 0.44, by + r * 0.1, r * 0.26, r * B.th);
    ctx.restore();

    // arm + weapon
    ctx.save();
    ctx.translate(bx, by + r * 0.3);
    ctx.rotate(aim + Math.sin(phase) * 0.1 * sp - kick * 0.28);
    ctx.translate(-r * 0.42 * kick, 0);
    ctx.scale(B.arm, 1);

    // trailing off-hand swings opposite the walk cycle
    ctx.save();
    ctx.rotate(Math.PI * 0.75 - Math.sin(phase) * 0.5 * sp);
    ctx.beginPath();
    ctx.arc(r * 0.72, 0, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    outline(r * 0.12);
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(r * 0.25, -r * 0.28, r * 1.25, r * 0.56, r * 0.2);
    ctx.fillStyle = "#2b2233";
    ctx.fill();
    outline(r * 0.13);
    ctx.beginPath();
    ctx.roundRect(r * 0.4, -r * 0.22, r * 0.85, r * 0.14, r * 0.07);
    ctx.fillStyle = "rgba(255,255,255,0.26)";
    ctx.fill();
    if (skin) {
      ctx.beginPath();
      ctx.arc(r * 1.45, 0, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = color(skin.accent);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(r * 0.35, 0, r * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    outline(r * 0.12);
    ctx.restore();

    // head
    const hr = r * B.hr;
    const hy = by - r * 0.42 + Math.sin(phase * 2 + 0.6) * r * 0.03 * sp;
    const hg = ctx.createRadialGradient(x - hr * 0.4, hy - hr * 0.5, hr * 0.15, x, hy, hr * 1.2);
    hg.addColorStop(0, "rgba(255,255,255,0.32)");
    hg.addColorStop(0.32, body);
    hg.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.beginPath();
    ctx.ellipse(x, hy, hr * 1.05, hr, 0, 0, Math.PI * 2);
    ctx.fillStyle = flash > 0.05 ? "#ffffff" : hg;
    ctx.fill();
    outline(r * 0.17);

    // rim light from the upper left keeps silhouettes readable
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.ellipse(x, hy, hr * 1.02, hr * 0.97, 0, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, hy, hr * 1.05, hr, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.ellipse(
      x - hr * 0.12,
      hy - hr * 0.14,
      hr * 0.95,
      hr * 0.9,
      0,
      Math.PI * 0.95,
      Math.PI * 1.75,
    );
    ctx.stroke();
    ctx.restore();

    if (skin?.visor) {
      ctx.save();
      ctx.fillStyle = color(skin.accent);
      ctx.globalAlpha = 0.9;
      roundRect(ctx, x - hr * 0.95, hy - hr * 0.2, hr * 1.9, hr * 0.5, hr * 0.22);
      ctx.fill();
      ctx.globalAlpha = 1;
      outline(r * 0.1);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      roundRect(ctx, x - hr * 0.8, hy - hr * 0.13, hr * 0.7, hr * 0.12, hr * 0.06);
      ctx.fill();
      ctx.restore();
    } else {
      const ex = hr * 0.38;
      const ey = hy + hr * 0.05;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(x + s * ex + face * hr * 0.06, ey, hr * 0.28, hr * 0.34, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#fdfcff";
        ctx.fill();
        ctx.strokeStyle = "rgba(20,12,26,0.55)";
        ctx.lineWidth = r * 0.07;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(
          x + s * ex + face * hr * 0.06 + Math.cos(aim) * hr * 0.12,
          ey + Math.sin(aim) * hr * 0.12,
          hr * 0.15,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = boss ? "#e83b3b" : "#1a1420";
        ctx.fill();
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = r * 0.11;
      ctx.lineCap = "round";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + s * ex - s * hr * 0.26, ey - hr * (boss ? 0.4 : 0.48));
        ctx.lineTo(x + s * ex + s * hr * 0.24, ey - hr * (boss ? 0.62 : 0.38));
        ctx.stroke();
      }
      ctx.lineCap = "butt";
    }

    // headgear
    ctx.fillStyle = boss ? "oklch(0.85 0.16 90)" : "rgba(22,14,28,0.88)";
    if (boss) {
      ctx.beginPath();
      ctx.moveTo(x - hr * 0.95, hy - hr * 0.75);
      ctx.lineTo(x - hr * 0.6, hy - hr * 1.7);
      ctx.lineTo(x - hr * 0.2, hy - hr * 1.0);
      ctx.lineTo(x + hr * 0.2, hy - hr * 1.85);
      ctx.lineTo(x + hr * 0.6, hy - hr * 1.0);
      ctx.lineTo(x + hr * 0.95, hy - hr * 1.65);
      ctx.lineTo(x + hr * 1.05, hy - hr * 0.7);
      ctx.closePath();
      ctx.fill();
      outline(r * 0.12);
    } else if (skin?.crown) {
      ctx.fillStyle = "oklch(0.88 0.17 92)";
      ctx.beginPath();
      ctx.moveTo(x - hr * 0.9, hy - hr * 0.7);
      ctx.lineTo(x - hr * 0.9, hy - hr * 1.5);
      ctx.lineTo(x - hr * 0.45, hy - hr * 1.05);
      ctx.lineTo(x, hy - hr * 1.7);
      ctx.lineTo(x + hr * 0.45, hy - hr * 1.05);
      ctx.lineTo(x + hr * 0.9, hy - hr * 1.5);
      ctx.lineTo(x + hr * 0.9, hy - hr * 0.7);
      ctx.closePath();
      ctx.fill();
      outline(r * 0.12);
      ctx.fillStyle = "oklch(0.7 0.2 20)";
      ctx.beginPath();
      ctx.arc(x, hy - hr * 0.95, hr * 0.14, 0, Math.PI * 2);
      ctx.fill();
    } else if (hat === "cap") {
      ctx.beginPath();
      ctx.ellipse(x, hy - hr * 0.5, hr * 1.02, hr * 0.62, 0, Math.PI, 0);
      ctx.fill();
      outline(r * 0.12);
      ctx.beginPath();
      ctx.roundRect(x + face * hr * 0.3, hy - hr * 0.62, hr * 1.1 * face, hr * 0.26, hr * 0.12);
      ctx.fillStyle = "rgba(22,14,28,0.88)";
      ctx.fill();
      outline(r * 0.1);
    } else if (hat === "helmet") {
      ctx.beginPath();
      ctx.ellipse(x, hy - hr * 0.22, hr * 1.14, hr * 0.95, 0, Math.PI, 0);
      ctx.fill();
      outline(r * 0.13);
      ctx.beginPath();
      ctx.roundRect(x - hr * 1.16, hy - hr * 0.3, hr * 2.32, hr * 0.26, hr * 0.12);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fill();
    } else if (hat === "horns") {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + s * hr * 0.8, hy - hr * 0.45);
        ctx.quadraticCurveTo(x + s * hr * 1.5, hy - hr * 1.2, x + s * hr * 0.85, hy - hr * 1.55);
        ctx.quadraticCurveTo(x + s * hr * 0.7, hy - hr * 0.95, x + s * hr * 0.35, hy - hr * 0.8);
        ctx.closePath();
        ctx.fill();
        outline(r * 0.1);
      }
    } else if (hat === "antenna") {
      ctx.strokeStyle = ink;
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.moveTo(x, hy - hr * 0.9);
      ctx.quadraticCurveTo(x + hr * 0.3, hy - hr * 1.5, x + hr * 0.5, hy - hr * 1.75);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + hr * 0.55, hy - hr * 1.85, hr * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = "oklch(0.88 0.16 95)";
      ctx.fill();
      outline(r * 0.1);
    }

    ctx.restore(); // end body transform
    }

    // hp bar
    const bw = r * 2.4;
    const barY = y + bob * 0.4 - r * 1.35 - 26;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    roundRect(ctx, x - bw / 2 - 2, barY - 2, bw + 4, 15, 8);
    ctx.fill();
    ctx.fillStyle = boss ? "oklch(0.68 0.22 20)" : cssVar("--primary");
    roundRect(ctx, x - bw / 2, barY, Math.max(0, (hp / maxHp) * bw), 11, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    roundRect(ctx, x - bw / 2, barY + 1, Math.max(0, (hp / maxHp) * bw), 4, 3);
    ctx.fill();
  };

  const alive = new Set<number>([g.hero.id]);
  for (const e of g.enemies) {
    alive.add(e.id);
    drawUnit(
      e.pos.x,
      e.pos.y,
      e.radius,
      e.aim,
      e.color,
      e.hitFlash,
      e.hp,
      e.maxHp,
      e.enemyKind === "brute" ? "helmet" : e.enemyKind === "runner" ? "horns" : "cap",
      e.enemyKind === "boss",
      e.ringTimer,
      tickAnim(e.id, e.pos.x, e.pos.y, e.aim, e.speed, e.cooldown, e.hitFlash),
      undefined,
      e.enemyKind === "brute"
        ? "tank"
        : e.enemyKind === "runner"
          ? "nimble"
          : e.enemyKind === "boss"
            ? "tank"
            : "lanky",
      sprite(enemySpriteKey(e.enemyKind)),
    );
  }
  pruneAnims(alive);

  if (!g.over) {
    const h0 = g.hero;
    if (g.buffs.shield > 0) {
      ctx.save();
      ctx.strokeStyle = "oklch(0.8 0.14 260)";
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.5 + Math.sin(g.time * 10) * 0.2;
      ctx.beginPath();
      ctx.arc(h0.pos.x, h0.pos.y, h0.radius + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = "oklch(0.8 0.14 260)";
      ctx.fill();
      ctx.restore();
    }
    drawUnit(
      h0.pos.x,
      h0.pos.y,
      h0.radius,
      h0.aim,
      g.buffs.damage > 0 ? "oklch(0.75 0.21 40)" : g.skin.color,
      h0.hitFlash,
      h0.hp,
      h0.maxHp,
      g.brawler.hat,
      false,
      0,
      tickAnim(h0.id, h0.pos.x, h0.pos.y, h0.aim, h0.speed, h0.cooldown, h0.hitFlash),
      g.skin,
      g.brawler.build,
      sprite(g.brawler.id),
    );
    drawSkinFx(ctx, g, h0.pos.x, h0.pos.y, h0.radius);
  }

  // rings (shockwaves)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const rg of g.rings) {
    const t = Math.max(0, rg.life / rg.max);
    ctx.globalAlpha = t * 0.85;
    ctx.strokeStyle = color(rg.color);
    ctx.lineWidth = rg.width * t;
    ctx.beginPath();
    ctx.arc(rg.pos.x, rg.pos.y, rg.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // bullets with trail + glow
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of g.bullets) {
    const c = color(b.color);
    for (let i = 0; i < b.trail.length; i++) {
      const t = (i + 1) / (b.trail.length + 1);
      ctx.globalAlpha = t * 0.35;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(b.trail[i]!.x, b.trail[i]!.y, b.radius * t * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.shadowColor = c;
    ctx.shadowBlur = 22;
    ctx.fillStyle = c;
    const ang = Math.atan2(b.vel.y, b.vel.x);
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(ang);
    roundRect(ctx, -b.radius * 1.8, -b.radius, b.radius * 3.4, b.radius * 2, b.radius);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(b.radius * 0.55, 0, b.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // particles (additive sparks)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of g.particles) {
    const t = Math.max(0, p.life / p.max);
    ctx.globalAlpha = t;
    ctx.fillStyle = color(p.hue);
    const s = p.size * (0.5 + t);
    ctx.beginPath();
    ctx.arc(p.pos.x, p.pos.y, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of g.texts) {
    ctx.globalAlpha = Math.min(1, t.life);
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.strokeText(t.text, t.pos.x, t.pos.y);
    ctx.fillStyle = color(t.color);
    ctx.fillText(t.text, t.pos.x, t.pos.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // vignette
  const vg = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // low-hp danger pulse
  const hpFrac = g.hero.hp / g.hero.maxHp;
  if (!g.over && hpFrac < 0.3) {
    ctx.save();
    ctx.globalAlpha = (0.3 - hpFrac) * (1.1 + Math.sin(g.time * 8) * 0.4);
    const dg = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.3,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.7,
    );
    dg.addColorStop(0, "rgba(0,0,0,0)");
    dg.addColorStop(1, "oklch(0.55 0.22 25)");
    ctx.fillStyle = dg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

/** Cosmetic particle signature for legendary/epic skins. */
function drawSkinFx(
  ctx: CanvasRenderingContext2D,
  g: GameState,
  x: number,
  y: number,
  r: number,
) {
  const fx = g.skin.fx;
  if (fx === "none") return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const n = fx === "gold" ? 10 : 7;
  for (let i = 0; i < n; i++) {
    const t = g.time * (fx === "frost" ? 1.1 : 2.2) + (i / n) * Math.PI * 2;
    const rad = r * (1.1 + Math.sin(t * 1.7 + i) * 0.35);
    const px = x + Math.cos(t) * rad;
    const py = y + Math.sin(t) * rad * 0.65 - (fx === "flame" ? ((g.time * 60 + i * 9) % 40) : 0);
    const size = fx === "flame" ? 5 : 3.4;
    ctx.globalAlpha = 0.45 + Math.sin(t * 3) * 0.25;
    ctx.fillStyle = color(
      fx === "flame"
        ? "oklch(0.85 0.19 55)"
        : fx === "frost"
          ? "oklch(0.93 0.09 210)"
          : fx === "void"
            ? "oklch(0.6 0.2 310)"
            : fx === "gold"
              ? "oklch(0.9 0.17 92)"
              : g.skin.accent,
    );
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
