import { ARENA_H, ARENA_W, WALLS, type GameState, type PowerKind } from "./engine";

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
    }
  t.globalAlpha = 0.08;
  for (let n = 0; n < 260; n++) {
    t.fillStyle = n % 2 ? "#ffffff" : "#000000";
    const x = Math.random() * tile * 2;
    const y = Math.random() * tile * 2;
    t.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  t.globalAlpha = 1;
  floorPattern = ctx.createPattern(c, "repeat");
  return floorPattern;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const POWER_ICON: Record<PowerKind, { bg: string; glyph: string }> = {
  heal: { bg: "oklch(0.65 0.2 20)", glyph: "+" },
  damage: { bg: "oklch(0.68 0.2 45)", glyph: "⚔" },
  speed: { bg: "oklch(0.75 0.17 200)", glyph: "»" },
  shield: { bg: "oklch(0.7 0.14 260)", glyph: "◈" },
  rapid: { bg: "oklch(0.82 0.17 100)", glyph: "⚡" },
};

export function draw(ctx: CanvasRenderingContext2D, g: GameState, w: number, h: number) {
  const scale = Math.max(w / 620, h / 1000);
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

  // floor
  const pat = getFloor(ctx);
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  }
  // soft light in centre
  const grad = ctx.createRadialGradient(ARENA_W / 2, ARENA_H / 2, 80, ARENA_W / 2, ARENA_H / 2, ARENA_H * 0.8);
  grad.addColorStop(0, "rgba(255,255,255,0.09)");
  grad.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  ctx.lineWidth = 14;
  ctx.strokeStyle = cssVar("--wall");
  ctx.strokeRect(0, 0, ARENA_W, ARENA_H);

  // pickups
  for (const p of g.pickups) {
    const bob = Math.sin(p.bob) * 6;
    const ic = POWER_ICON[p.kind];
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(p.pos.x, p.pos.y + 22, 18, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = ic.bg;
    ctx.shadowBlur = 22;
    ctx.fillStyle = ic.bg;
    roundRect(ctx, p.pos.x - 17, p.pos.y - 17 + bob, 34, 34, 10);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ic.glyph, p.pos.x, p.pos.y + 1 + bob);
  }

  // walls
  for (const wl of WALLS) {
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    roundRect(ctx, wl.x + 6, wl.y + 12, wl.w, wl.h, 14);
    ctx.fill();
    const wg = ctx.createLinearGradient(wl.x, wl.y, wl.x, wl.y + wl.h);
    wg.addColorStop(0, "oklch(0.5 0.06 60)");
    wg.addColorStop(1, cssVar("--wall"));
    ctx.fillStyle = wg;
    roundRect(ctx, wl.x, wl.y, wl.w, wl.h, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
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
    hat: string,
    boss = false,
    ring = 0,
    bob = 0,
  ) => {
    if (ring > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.25 * ring})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r + 14 + (3 - ring) * 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ground shadow (stays on floor)
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.9, r * 0.95, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    const by = y + bob;
    const face = Math.cos(aim) >= 0 ? 1 : -1;
    const ink = "rgba(20,12,26,0.9)";
    const outline = (w: number) => {
      ctx.strokeStyle = ink;
      ctx.lineWidth = w;
      ctx.lineJoin = "round";
      ctx.stroke();
    };
    const body = flash > 0.05 ? "#ffffff" : base;

    // feet
    ctx.fillStyle = "rgba(20,12,26,0.85)";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(x + s * r * 0.42, by + r * 0.82, r * 0.3, r * 0.19, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // torso
    ctx.beginPath();
    ctx.roundRect(x - r * 0.62, by + r * 0.05, r * 1.24, r * 0.85, r * 0.35);
    ctx.fillStyle = body;
    ctx.fill();
    outline(r * 0.16);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(x - r, by + r * 0.5, r * 2, r);
    ctx.restore();

    // arm + weapon
    ctx.save();
    ctx.translate(x, by + r * 0.3);
    ctx.rotate(aim);
    ctx.beginPath();
    ctx.roundRect(r * 0.25, -r * 0.28, r * 1.25, r * 0.56, r * 0.2);
    ctx.fillStyle = "#2b2233";
    ctx.fill();
    outline(r * 0.13);
    ctx.beginPath();
    ctx.roundRect(r * 0.4, -r * 0.22, r * 0.85, r * 0.14, r * 0.07);
    ctx.fillStyle = "rgba(255,255,255,0.26)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.35, 0, r * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    outline(r * 0.12);
    ctx.restore();

    // head
    const hr = r * 0.78;
    const hy = by - r * 0.42;
    const grad = ctx.createRadialGradient(x - hr * 0.4, hy - hr * 0.5, hr * 0.15, x, hy, hr * 1.2);
    grad.addColorStop(0, "rgba(255,255,255,0.55)");
    grad.addColorStop(0.5, body);
    grad.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.beginPath();
    ctx.ellipse(x, hy, hr * 1.05, hr, 0, 0, Math.PI * 2);
    ctx.fillStyle = flash > 0.05 ? "#ffffff" : grad;
    ctx.fill();
    outline(r * 0.17);

    // rim light
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, hy, hr * 1.05, hr, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.ellipse(x - hr * 0.12, hy - hr * 0.14, hr * 0.95, hr * 0.9, 0, Math.PI * 0.95, Math.PI * 1.75);
    ctx.stroke();
    ctx.restore();

    // eyes
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
    // brows give attitude
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

    // hp bar
    const bw = r * 2.4;
    const barY = by - r * 1.35 - 26;
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

  for (const e of g.enemies)
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
      Math.sin(g.time * 7 + e.id) * (e.enemyKind === "boss" ? 2 : 3),
    );

  if (!g.over) {
    const h0 = g.hero;
    if (g.buffs.shield > 0) {
      ctx.strokeStyle = "oklch(0.8 0.14 260)";
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.5 + Math.sin(g.time * 10) * 0.2;
      ctx.beginPath();
      ctx.arc(h0.pos.x, h0.pos.y, h0.radius + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawUnit(
      h0.pos.x,
      h0.pos.y,
      h0.radius,
      h0.aim,
      g.buffs.damage > 0 ? "oklch(0.75 0.21 40)" : g.brawler.color,
      h0.hitFlash,
      h0.hp,
      h0.maxHp,
      g.brawler.hat,
      false,
      0,
      Math.sin(g.time * 8) * 3,
    );
  }

  // bullets with glow + trail
  for (const b of g.bullets) {
    ctx.save();
    ctx.shadowColor = color(b.color);
    ctx.shadowBlur = 18;
    ctx.fillStyle = color(b.color);
    const ang = Math.atan2(b.vel.y, b.vel.x);
    ctx.translate(b.pos.x, b.pos.y);
    ctx.rotate(ang);
    roundRect(ctx, -b.radius * 1.6, -b.radius, b.radius * 3.2, b.radius * 2, b.radius);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.arc(b.radius * 0.5, 0, b.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = color(p.hue);
    ctx.fillRect(p.pos.x - p.size / 2, p.pos.y - p.size / 2, p.size, p.size);
  }
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
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}
