import { useEffect, useMemo, useRef, useState } from "react";
import { brawlerArt } from "./sprites";

type Vec = { x: number; y: number };
type Bot = { id: number; x: number; y: number; hp: number; maxHp: number; alive: boolean; cooldown: number; dir: number; team: number; flash: number };
type Shot = { x: number; y: number; vx: number; vy: number; life: number; owner: "player" | number; damage: number; team: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; size: number; kind: "hit" | "dust" | "super" };
type Block = { x: number; y: number; w: number; h: number; kind: "wall" | "bush" | "water" | "crate" };

const W = 1600;
const H = 900;
const PLAYER_R = 34;
const BOT_R = 32;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

const BLOCKS: Block[] = [
  { x: 245, y: 155, w: 210, h: 88, kind: "wall" },
  { x: 1145, y: 155, w: 210, h: 88, kind: "wall" },
  { x: 245, y: 660, w: 210, h: 88, kind: "wall" },
  { x: 1145, y: 660, w: 210, h: 88, kind: "wall" },
  { x: 610, y: 315, w: 380, h: 95, kind: "wall" },
  { x: 610, y: 490, w: 380, h: 95, kind: "wall" },
  { x: 505, y: 110, w: 150, h: 115, kind: "bush" },
  { x: 945, y: 110, w: 150, h: 115, kind: "bush" },
  { x: 505, y: 675, w: 150, h: 115, kind: "bush" },
  { x: 945, y: 675, w: 150, h: 115, kind: "bush" },
  { x: 110, y: 360, w: 170, h: 185, kind: "bush" },
  { x: 1320, y: 360, w: 170, h: 185, kind: "bush" },
  { x: 325, y: 360, w: 145, h: 145, kind: "water" },
  { x: 1130, y: 360, w: 145, h: 145, kind: "water" },
  { x: 740, y: 420, w: 120, h: 60, kind: "crate" },
];

function solidCircle(x: number, y: number, r: number) {
  for (const b of BLOCKS) {
    if (b.kind === "bush") continue;
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    if (Math.hypot(x - nx, y - ny) < r) return true;
  }
  return x < r || y < r || x > W - r || y > H - r;
}

function moveCircle(p: Vec, dx: number, dy: number, r: number) {
  const nx = p.x + dx;
  if (!solidCircle(nx, p.y, r)) p.x = nx;
  const ny = p.y + dy;
  if (!solidCircle(p.x, ny, r)) p.y = ny;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, n = 8) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function useImage(src: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const i = new Image();
    i.src = src;
    i.onload = () => setImg(i);
  }, [src]);
  return img;
}

export function BrawlStarsLike() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerImg = useImage(brawlerArt("blaze"));
  const enemyImg = useImage(brawlerArt("vex"));
  const [playing, setPlaying] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [hud, setHud] = useState({ hp: 5200, ammo: 3, super: 0, score: 0, time: 90 });
  const state = useRef({
    player: { x: 800, y: 735, hp: 5200, maxHp: 5200, ammo: 3, reload: 0, super: 0, aim: -Math.PI / 2, flash: 0 },
    bots: [] as Bot[],
    shots: [] as Shot[],
    particles: [] as Particle[],
    time: 90,
    score: 0,
    last: performance.now(),
    move: { x: 0, y: 0 },
    aim: { x: 0, y: -1 },
    firing: false,
    superPressed: false,
    screenShake: 0,
  });

  const reset = () => {
    state.current = {
      player: { x: 800, y: 735, hp: 5200, maxHp: 5200, ammo: 3, reload: 0, super: 0, aim: -Math.PI / 2, flash: 0 },
      bots: [
        { id: 1, x: 270, y: 275, hp: 3900, maxHp: 3900, alive: true, cooldown: 0.5, dir: 0, team: 1, flash: 0 },
        { id: 2, x: 1330, y: 275, hp: 3900, maxHp: 3900, alive: true, cooldown: 0.8, dir: 0, team: 1, flash: 0 },
        { id: 3, x: 800, y: 140, hp: 4400, maxHp: 4400, alive: true, cooldown: 0.4, dir: 0, team: 1, flash: 0 },
        { id: 4, x: 335, y: 610, hp: 3600, maxHp: 3600, alive: true, cooldown: 0.7, dir: 0, team: 1, flash: 0 },
        { id: 5, x: 1265, y: 610, hp: 3600, maxHp: 3600, alive: true, cooldown: 0.9, dir: 0, team: 1, flash: 0 },
      ],
      shots: [], particles: [], time: 90, score: 0, last: performance.now(), move: { x: 0, y: 0 }, aim: { x: 0, y: -1 }, firing: false, superPressed: false, screenShake: 0,
    };
    setWinner(null);
    setHud({ hp: 5200, ammo: 3, super: 0, score: 0, time: 90 });
    setPlaying(true);
  };

  useEffect(() => {
    const key = (down: boolean) => (e: KeyboardEvent) => {
      const s = state.current;
      if (e.key.toLowerCase() === "w") s.move.y = down ? -1 : s.move.y === -1 ? 0 : s.move.y;
      if (e.key.toLowerCase() === "s") s.move.y = down ? 1 : s.move.y === 1 ? 0 : s.move.y;
      if (e.key.toLowerCase() === "a") s.move.x = down ? -1 : s.move.x === -1 ? 0 : s.move.x;
      if (e.key.toLowerCase() === "d") s.move.x = down ? 1 : s.move.x === 1 ? 0 : s.move.x;
      if (e.code === "Space") s.firing = down;
      if (e.key.toLowerCase() === "e" && down) s.superPressed = true;
    };
    const kd = key(true), ku = key(false);
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = (now: number) => {
      const s = state.current;
      const dt = Math.min(0.033, (now - s.last) / 1000 || 0.016); s.last = now;
      step(s, dt, setWinner, setPlaying);
      draw(canvasRef.current, s, playerImg, enemyImg);
      setHud({ hp: Math.max(0, Math.round(s.player.hp)), ammo: s.player.ammo, super: Math.round(s.player.super), score: s.score, time: Math.max(0, Math.ceil(s.time)) });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, playerImg, enemyImg]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * devicePixelRatio));
      canvas.height = Math.max(1, Math.floor(rect.height * devicePixelRatio));
    };
    resize(); addEventListener("resize", resize); return () => removeEventListener("resize", resize);
  }, []);

  const pointerStick = (kind: "move" | "aim") => {
    let id: number | null = null;
    const start = (e: React.PointerEvent<HTMLDivElement>) => { id = e.pointerId; e.currentTarget.setPointerCapture(id); update(e); };
    const update = (e: React.PointerEvent<HTMLDivElement>) => {
      if (id !== e.pointerId) return;
      const r = e.currentTarget.getBoundingClientRect();
      let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2 - 14);
      let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2 - 14);
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      state.current[kind] = { x, y };
      if (kind === "aim") state.current.firing = m > 0.28;
      const knob = e.currentTarget.querySelector(".stick-knob") as HTMLElement | null;
      if (knob) knob.style.transform = `translate(${x * 35}px, ${y * 35}px)`;
    };
    const end = (e: React.PointerEvent<HTMLDivElement>) => {
      if (id !== e.pointerId) return; id = null; state.current[kind] = kind === "aim" ? { x: 0, y: -1 } : { x: 0, y: 0 }; if (kind === "aim") state.current.firing = false;
      const knob = e.currentTarget.querySelector(".stick-knob") as HTMLElement | null; if (knob) knob.style.transform = "translate(0,0)";
    };
    return { onPointerDown: start, onPointerMove: update, onPointerUp: end, onPointerCancel: end };
  };

  const superPct = clamp(hud.super / 100, 0, 1);

  return <div ref={wrapRef} className="bs-root">
    <canvas ref={canvasRef} className="bs-canvas" />
    {!playing && <div className="bs-menu">
      <div className="bs-sunburst" />
      <div className="bs-menu-card">
        <div className="bs-kicker">ARENA AMIGOS</div>
        <div className="bs-title">SHOWDOWN</div>
        <div className="bs-character-wrap"><img src={brawlerArt("blaze")} className="bs-character" /><div className="bs-glow" /></div>
        <div className="bs-mode"><b>SOLO SMASH</b><span>Besegra alla bots innan tiden går ut</span></div>
        <button className="bs-play" onClick={reset}>SPELA</button>
        {winner && <div className="bs-result">{winner}</div>}
      </div>
    </div>}
    {playing && <>
      <div className="bs-topbar">
        <div className="bs-pill bs-player-pill"><img src={brawlerArt("blaze")} /><div><small>AMIGO</small><b>{hud.hp}</b></div></div>
        <div className="bs-score"><span>💀 {hud.score}</span><b>{hud.time}</b><span>🏆 SOLO</span></div>
      </div>
      <div className="bs-ammo">{[0,1,2].map(i => <span key={i} className={i < hud.ammo ? "full" : ""} />)}</div>
      <div className="bs-stick bs-move" {...pointerStick("move")}><div className="stick-knob"><span>✥</span></div></div>
      <div className="bs-stick bs-aim" {...pointerStick("aim")}><div className="stick-knob attack"><span>✦</span></div></div>
      <button className={`bs-super ${superPct >= 1 ? "ready" : ""}`} onPointerDown={() => state.current.superPressed = true}>
        <div className="bs-super-fill" style={{height: `${superPct*100}%`}} />
        <span>★</span>
      </button>
    </>}
  </div>;
}

function step(s: any, dt: number, setWinner: (v: string) => void, setPlaying: (v: boolean) => void) {
  const p = s.player;
  s.time -= dt; p.flash = Math.max(0, p.flash - dt * 5);
  const mm = Math.hypot(s.move.x, s.move.y) || 1;
  const mx = s.move.x / mm, my = s.move.y / mm;
  moveCircle(p, mx * 300 * dt, my * 300 * dt, PLAYER_R);
  if (Math.hypot(s.aim.x, s.aim.y) > 0.15) p.aim = Math.atan2(s.aim.y, s.aim.x);
  if (p.ammo < 3) { p.reload += dt; if (p.reload >= 1.05) { p.reload = 0; p.ammo++; } }
  if (s.firing && p.ammo > 0 && (s.shots.filter((q: Shot) => q.owner === "player").length < 6)) {
    const a = p.aim; p.ammo--; p.reload = 0;
    s.shots.push({ x: p.x + Math.cos(a)*45, y: p.y + Math.sin(a)*45, vx: Math.cos(a)*720, vy: Math.sin(a)*720, life: 0.82, owner: "player", damage: 920, team: 0 });
    for (let i=0;i<6;i++) s.particles.push({x:p.x+Math.cos(a)*44,y:p.y+Math.sin(a)*44,vx:Math.cos(a)*120+(Math.random()-.5)*90,vy:Math.sin(a)*120+(Math.random()-.5)*90,life:.18,size:5+Math.random()*6,kind:"hit"});
    s.firing = false;
  }
  if (s.superPressed && p.super >= 100) {
    p.super = 0; s.superPressed = false; s.screenShake = 1;
    for (const b of s.bots) if (b.alive && dist(p.x,p.y,b.x,b.y) < 260) { b.hp -= 1700; b.flash = 1; }
    for (let i=0;i<70;i++) { const a=Math.random()*Math.PI*2,r=40+Math.random()*180; s.particles.push({x:p.x+Math.cos(a)*r*.2,y:p.y+Math.sin(a)*r*.2,vx:Math.cos(a)*(220+Math.random()*350),vy:Math.sin(a)*(220+Math.random()*350),life:.65,size:7+Math.random()*14,kind:"super"}); }
  }
  s.superPressed = false;
  for (const b of s.bots) {
    if (!b.alive) continue; b.flash = Math.max(0,b.flash-dt*5); b.cooldown -= dt;
    const dx=p.x-b.x, dy=p.y-b.y, d=Math.hypot(dx,dy)||1; b.dir=Math.atan2(dy,dx);
    const want = d > 360 ? 1 : d < 230 ? -0.7 : 0.25;
    const strafe = Math.sin(performance.now()/700 + b.id*1.7)*0.65;
    const vx=(dx/d*want - dy/d*strafe)*175, vy=(dy/d*want + dx/d*strafe)*175;
    moveCircle(b,vx*dt,vy*dt,BOT_R);
    if (d<620 && b.cooldown<=0) {
      b.cooldown=1.05+Math.random()*.45; const a=b.dir+(Math.random()-.5)*.13;
      s.shots.push({x:b.x+Math.cos(a)*38,y:b.y+Math.sin(a)*38,vx:Math.cos(a)*510,vy:Math.sin(a)*510,life:1.25,owner:b.id,damage:520,team:1});
    }
    if (b.hp<=0) { b.alive=false; s.score++; p.super=Math.min(100,p.super+28); for(let i=0;i<24;i++)s.particles.push({x:b.x,y:b.y,vx:(Math.random()-.5)*360,vy:(Math.random()-.5)*360,life:.55,size:6+Math.random()*10,kind:"hit"}); }
  }
  for (const q of s.shots) {
    q.x+=q.vx*dt; q.y+=q.vy*dt; q.life-=dt;
    if (solidCircle(q.x,q.y,8)) q.life=0;
    if (q.owner==="player") {
      for (const b of s.bots) if (b.alive && q.life>0 && dist(q.x,q.y,b.x,b.y)<BOT_R+10) { b.hp-=q.damage; b.flash=1; q.life=0; p.super=Math.min(100,p.super+12); s.screenShake=.35; for(let i=0;i<12;i++)s.particles.push({x:q.x,y:q.y,vx:(Math.random()-.5)*280,vy:(Math.random()-.5)*280,life:.3,size:5+Math.random()*8,kind:"hit"}); break; }
    } else if (q.life>0 && dist(q.x,q.y,p.x,p.y)<PLAYER_R+9) { p.hp-=q.damage; p.flash=1; q.life=0; s.screenShake=.5; }
  }
  s.shots=s.shots.filter((q:Shot)=>q.life>0);
  for(const pt of s.particles){pt.x+=pt.vx*dt;pt.y+=pt.vy*dt;pt.vx*=.96;pt.vy*=.96;pt.life-=dt;}
  s.particles=s.particles.filter((x:Particle)=>x.life>0);
  s.screenShake=Math.max(0,s.screenShake-dt*3);
  const alive=s.bots.filter((b:Bot)=>b.alive).length;
  if (alive===0) { setWinner("🏆 SEGER! Du slog ut alla bots"); setPlaying(false); }
  else if (p.hp<=0) { setWinner("💥 UTSLAGEN — försök igen"); setPlaying(false); }
  else if (s.time<=0) { setWinner(`⏱️ TID! ${s.score}/5 utslagna`); setPlaying(false); }
}

function draw(canvas: HTMLCanvasElement | null, s: any, playerImg: HTMLImageElement | null, enemyImg: HTMLImageElement | null) {
  if (!canvas) return; const ctx=canvas.getContext("2d"); if(!ctx)return;
  const rw=canvas.width, rh=canvas.height, scale=Math.min(rw/W,rh/H), ox=(rw-W*scale)/2, oy=(rh-H*scale)/2;
  ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,rw,rh);
  ctx.fillStyle="#164b67"; ctx.fillRect(0,0,rw,rh);
  ctx.save(); ctx.translate(ox,oy); ctx.scale(scale,scale);
  if(s.screenShake>0){ctx.translate((Math.random()-.5)*10*s.screenShake,(Math.random()-.5)*10*s.screenShake);}
  // vibrant grass floor
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,"#7bd34b"); g.addColorStop(1,"#52b83d"); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=.18; ctx.fillStyle="#ffffff"; for(let y=20;y<H;y+=70)for(let x=20;x<W;x+=70){ctx.beginPath();ctx.arc(x+(y%140?18:0),y,3,0,Math.PI*2);ctx.fill();} ctx.globalAlpha=1;
  // edge
  ctx.strokeStyle="#2f7c35";ctx.lineWidth=22;ctx.strokeRect(8,8,W-16,H-16);
  // central emblem
  ctx.globalAlpha=.13;ctx.fillStyle="#173f67";star(ctx,W/2,H/2,145,70,8);ctx.fill();ctx.globalAlpha=1;
  for(const b of BLOCKS) drawBlock(ctx,b);
  // shots under characters
  for(const q of s.shots){ctx.save();ctx.shadowBlur=18;ctx.shadowColor=q.team?"#ff3f66":"#58d6ff";ctx.fillStyle=q.team?"#ff526f":"#39c6ff";ctx.beginPath();ctx.arc(q.x,q.y,11,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(q.x-3,q.y-3,4,0,Math.PI*2);ctx.fill();ctx.restore();}
  for(const b of s.bots) if(b.alive) drawBrawler(ctx,b.x,b.y,b.hp,b.maxHp,enemyImg,b.flash,"#ff4b62",b.dir,false);
  drawBrawler(ctx,s.player.x,s.player.y,s.player.hp,s.player.maxHp,playerImg,s.player.flash,"#2bc5ff",s.player.aim,true);
  for(const pt of s.particles){ctx.globalAlpha=clamp(pt.life*3,0,1);ctx.fillStyle=pt.kind==="super"?"#ffd93d":pt.kind==="dust"?"#d4a85d":"#ffffff";ctx.beginPath();ctx.arc(pt.x,pt.y,pt.size*clamp(pt.life*2,0,1),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  ctx.restore();
}

function drawBlock(ctx:CanvasRenderingContext2D,b:Block){
  if(b.kind==="wall"){
    ctx.fillStyle="#6b3e2b";rounded(ctx,b.x+5,b.y+15,b.w,b.h,18);ctx.fill();
    const grad=ctx.createLinearGradient(0,b.y,0,b.y+b.h);grad.addColorStop(0,"#e9b655");grad.addColorStop(1,"#c77d2f");ctx.fillStyle=grad;rounded(ctx,b.x,b.y,b.w,b.h,18);ctx.fill();
    ctx.strokeStyle="#9b5c28";ctx.lineWidth=5;rounded(ctx,b.x,b.y,b.w,b.h,18);ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,.22)";ctx.fillRect(b.x+14,b.y+10,b.w-28,9);
    for(let x=b.x+58;x<b.x+b.w;x+=70){ctx.strokeStyle="rgba(113,59,25,.35)";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x,b.y+8);ctx.lineTo(x,b.y+b.h-7);ctx.stroke();}
  } else if(b.kind==="bush"){
    ctx.fillStyle="#2f8d38";rounded(ctx,b.x,b.y+7,b.w,b.h,28);ctx.fill();
    ctx.fillStyle="#49b94e";rounded(ctx,b.x,b.y,b.w,b.h-9,28);ctx.fill();
    ctx.fillStyle="#63ce5e";for(let yy=b.y+22;yy<b.y+b.h-10;yy+=34)for(let xx=b.x+22;xx<b.x+b.w-10;xx+=36){ctx.beginPath();ctx.arc(xx+(yy%68?8:0),yy,13,0,Math.PI*2);ctx.fill();}
  } else if(b.kind==="water"){
    ctx.fillStyle="#2b9fd4";rounded(ctx,b.x,b.y,b.w,b.h,28);ctx.fill();ctx.strokeStyle="#79ddff";ctx.lineWidth=7;rounded(ctx,b.x+4,b.y+4,b.w-8,b.h-8,24);ctx.stroke();ctx.strokeStyle="rgba(255,255,255,.38)";ctx.lineWidth=5;for(let y=b.y+32;y<b.y+b.h;y+=34){ctx.beginPath();ctx.moveTo(b.x+25,y);ctx.quadraticCurveTo(b.x+b.w/2,y-10,b.x+b.w-25,y);ctx.stroke();}
  } else {
    ctx.fillStyle="#8e5c2a";rounded(ctx,b.x+4,b.y+9,b.w,b.h,14);ctx.fill();ctx.fillStyle="#d99c3c";rounded(ctx,b.x,b.y,b.w,b.h,14);ctx.fill();ctx.strokeStyle="#7d4a1f";ctx.lineWidth=5;rounded(ctx,b.x,b.y,b.w,b.h,14);ctx.stroke();ctx.strokeStyle="#f1c35f";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(b.x+16,b.y+16);ctx.lineTo(b.x+b.w-16,b.y+b.h-16);ctx.moveTo(b.x+b.w-16,b.y+16);ctx.lineTo(b.x+16,b.y+b.h-16);ctx.stroke();
  }
}

function drawBrawler(ctx:CanvasRenderingContext2D,x:number,y:number,hp:number,maxHp:number,img:HTMLImageElement|null,flash:number,team:string,aim:number,isPlayer:boolean){
  ctx.save();
  ctx.fillStyle="rgba(0,0,0,.23)";ctx.beginPath();ctx.ellipse(x,y+32,42,16,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=team;ctx.lineWidth=isPlayer?7:5;ctx.globalAlpha=.9;ctx.beginPath();ctx.arc(x,y+12,42,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  if(img){ctx.save();ctx.translate(x,y+2);const bob=Math.sin(performance.now()/170+x*.02)*2;ctx.translate(0,bob);const h=102,w=102;ctx.drawImage(img,-w/2,-h*.76,w,h);if(flash>0){ctx.globalCompositeOperation="source-atop";ctx.globalAlpha=flash*.7;ctx.fillStyle="#fff";ctx.fillRect(-w/2,-h*.76,w,h);}ctx.restore();}
  else {ctx.fillStyle=team;ctx.beginPath();ctx.arc(x,y,35,0,Math.PI*2);ctx.fill();}
  const bw=86,bh=13,by=y-73;ctx.fillStyle="#2b2340";rounded(ctx,x-bw/2,by,bw,bh,8);ctx.fill();ctx.fillStyle=hp/maxHp>.4?"#56df4d":"#ff4e58";rounded(ctx,x-bw/2+2,by+2,(bw-4)*clamp(hp/maxHp,0,1),bh-4,6);ctx.fill();
  ctx.font="900 18px Arial";ctx.textAlign="center";ctx.lineWidth=5;ctx.strokeStyle="#1f1830";ctx.fillStyle="#fff";ctx.strokeText(String(Math.max(0,Math.round(hp))),x,by-7);ctx.fillText(String(Math.max(0,Math.round(hp))),x,by-7);
  if(isPlayer){ctx.strokeStyle="rgba(255,255,255,.28)";ctx.lineWidth=3;ctx.setLineDash([10,10]);ctx.beginPath();ctx.moveTo(x+Math.cos(aim)*46,y+Math.sin(aim)*46);ctx.lineTo(x+Math.cos(aim)*135,y+Math.sin(aim)*135);ctx.stroke();ctx.setLineDash([]);}
  ctx.restore();
}
