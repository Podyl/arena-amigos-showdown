import { ARENA_H, ARENA_W, WALLS, type GameState } from "./engine";

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

export function draw(ctx: CanvasRenderingContext2D, g: GameState, w: number, h: number) {
  const scale = Math.max(w / ARENA_W, h / ARENA_H) * 0.62;
  const camX = g.hero.pos.x;
  const camY = g.hero.pos.y;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = cssVar("--background");
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-camX, -camY);

  // arena floor tiles
  const tile = 100;
  for (let x = 0; x < ARENA_W; x += tile) {
    for (let y = 0; y < ARENA_H; y += tile) {
      ctx.fillStyle = ((x / tile + y / tile) % 2 === 0) ? cssVar("--arena") : cssVar("--arena-alt");
      ctx.fillRect(x, y, tile, tile);
    }
  }
  ctx.lineWidth = 10;
  ctx.strokeStyle = cssVar("--wall");
  ctx.strokeRect(0, 0, ARENA_W, ARENA_H);

  for (const p of g.pickups) {
    const bob = Math.sin(p.bob) * 6;
    ctx.fillStyle = cssVar("--arena");
    ctx.beginPath();
    ctx.ellipse(p.pos.x, p.pos.y + 20, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e64b5a";
    roundRect(ctx, p.pos.x - 16, p.pos.y - 16 + bob, 32, 32, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(p.pos.x - 3, p.pos.y - 11 + bob, 6, 22);
    ctx.fillRect(p.pos.x - 11, p.pos.y - 3 + bob, 22, 6);
  }

  for (const wl of WALLS) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    roundRect(ctx, wl.x + 6, wl.y + 10, wl.w, wl.h, 12);
    ctx.fill();
    ctx.fillStyle = cssVar("--wall");
    roundRect(ctx, wl.x, wl.y, wl.w, wl.h, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  const drawUnit = (
    x: number,
    y: number,
    r: number,
    aim: number,
    base: string,
    flash: number,
    hp: number,
    maxHp: number,
  ) => {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.8, r, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // gun
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(aim);
    ctx.fillStyle = "#2b2333";
    roundRect(ctx, r * 0.4, -7, r * 1.1, 14, 6);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = flash > 0.05 ? "#ffffff" : base;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 5;
    ctx.stroke();
    // eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.15, r * 0.22, 0, Math.PI * 2);
    ctx.arc(x + r * 0.3, y - r * 0.15, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1420";
    ctx.beginPath();
    ctx.arc(x - r * 0.3 + Math.cos(aim) * 3, y - r * 0.15 + Math.sin(aim) * 3, r * 0.1, 0, Math.PI * 2);
    ctx.arc(x + r * 0.3 + Math.cos(aim) * 3, y - r * 0.15 + Math.sin(aim) * 3, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // hp bar
    const bw = r * 2.4;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, x - bw / 2, y - r - 22, bw, 10, 5);
    ctx.fill();
    ctx.fillStyle = cssVar("--primary");
    roundRect(ctx, x - bw / 2, y - r - 22, Math.max(0, (hp / maxHp) * bw), 10, 5);
    ctx.fill();
  };

  for (const e of g.enemies)
    drawUnit(e.pos.x, e.pos.y, e.radius, e.aim, cssVar("--enemy"), e.hitFlash, e.hp, e.maxHp);
  if (!g.over)
    drawUnit(
      g.hero.pos.x,
      g.hero.pos.y,
      g.hero.radius,
      g.hero.aim,
      cssVar("--hero"),
      g.hero.hitFlash,
      g.hero.hp,
      g.hero.maxHp,
    );

  for (const b of g.bullets) {
    ctx.fillStyle = b.owner === "hero" ? cssVar("--bullet") : cssVar("--enemy");
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = color(p.hue);
    ctx.fillRect(p.pos.x - p.size / 2, p.pos.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
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