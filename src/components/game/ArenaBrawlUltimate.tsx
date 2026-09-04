import { useEffect, useMemo, useRef, useState } from "react";
import { brawlerArt, preloadSprites, sheetFrame } from "./sprites";
import { unlockAudio, sfx } from "./audio";

type Pick = "blaze" | "nova" | "bunker" | "vex";
type Team = 0 | 1;
type Vec = { x: number; y: number };
type Unit = {
  id: number;
  team: Team;
  pick: Pick;
  human: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  ammo: number;
  reload: number;
  cooldown: number;
  super: number;
  gems: number;
  alive: boolean;
  respawn: number;
  flash: number;
  walk: number;
  aim: number;
  attackKick: number;
  hitKick: number;
};
type Shot = { x: number; y: number; px: number; py: number; vx: number; vy: number; life: number; team: Team; owner: number; damage: number; size: number; super: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; kind: "hit" | "muzzle" | "dust" | "gem" | "ko"; team: Team };
type FloatText = { x: number; y: number; text: string; life: number; team: Team };
type Gem = { id: number; x: number; y: number; bob: number; alive: boolean };
type Block = { x: number; y: number; w: number; h: number; kind: "wall" | "bush" | "water" };

type Hud = { hp: number; maxHp: number; ammo: number; super: number; blue: number; red: number; time: number; countdown: number | null; gems: number };

const WORLD_W = 1760;
const WORLD_H = 1180;
const R = 34;
const PICKS: Pick[] = ["blaze", "nova", "bunker", "vex"];
const STATS: Record<Pick, { hp: number; speed: number; damage: number; delay: number; range: number; pellets: number; spread: number; shotSpeed: number }> = {
  blaze: { hp: 5600, speed: 318, damage: 390, delay: .38, range: 610, pellets: 3, spread: .10, shotSpeed: 910 },
  nova: { hp: 4300, speed: 306, damage: 1380, delay: .72, range: 800, pellets: 1, spread: 0, shotSpeed: 1040 },
  bunker: { hp: 7200, speed: 255, damage: 245, delay: .58, range: 500, pellets: 5, spread: .13, shotSpeed: 820 },
  vex: { hp: 4700, speed: 348, damage: 420, delay: .29, range: 650, pellets: 2, spread: .055, shotSpeed: 980 },
};

const BLOCKS: Block[] = [
  { x: 185, y: 190, w: 280, h: 105, kind: "wall" },
  { x: 1295, y: 190, w: 280, h: 105, kind: "wall" },
  { x: 185, y: 885, w: 280, h: 105, kind: "wall" },
  { x: 1295, y: 885, w: 280, h: 105, kind: "wall" },
  { x: 600, y: 300, w: 170, h: 105, kind: "wall" },
  { x: 990, y: 300, w: 170, h: 105, kind: "wall" },
  { x: 600, y: 775, w: 170, h: 105, kind: "wall" },
  { x: 990, y: 775, w: 170, h: 105, kind: "wall" },
  { x: 795, y: 470, w: 170, h: 86, kind: "wall" },
  { x: 795, y: 625, w: 170, h: 86, kind: "wall" },
  { x: 400, y: 435, w: 170, h: 165, kind: "water" },
  { x: 1190, y: 580, w: 170, h: 165, kind: "water" },
  { x: 515, y: 110, w: 210, h: 150, kind: "bush" },
  { x: 1035, y: 110, w: 210, h: 150, kind: "bush" },
  { x: 515, y: 920, w: 210, h: 150, kind: "bush" },
  { x: 1035, y: 920, w: 210, h: 150, kind: "bush" },
  { x: 95, y: 455, w: 210, h: 270, kind: "bush" },
  { x: 1455, y: 455, w: 210, h: 270, kind: "bush" },
  { x: 690, y: 510, w: 150, h: 160, kind: "bush" },
  { x: 920, y: 510, w: 150, h: 160, kind: "bush" },
];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function solidAt(x: number, y: number, r = R) {
  if (x < r + 20 || y < r + 20 || x > WORLD_W - r - 20 || y > WORLD_H - r - 20) return true;
  for (const b of BLOCKS) {
    if (b.kind === "bush") continue;
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    if (Math.hypot(x - nx, y - ny) < r) return true;
  }
  return false;
}
function moveUnit(u: Unit, dx: number, dy: number) {
  const nx = u.x + dx;
  if (!solidAt(nx, u.y)) u.x = nx; else u.vx *= .15;
  const ny = u.y + dy;
  if (!solidAt(u.x, ny)) u.y = ny; else u.vy *= .15;
}
function insideBush(x: number, y: number) {
  return BLOCKS.some(b => b.kind === "bush" && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
}
function segmentHitsWall(x1: number, y1: number, x2: number, y2: number) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 26);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
    if (BLOCKS.some(b => b.kind === "wall" && x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h)) return true;
  }
  return false;
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, n = 6) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? inner : outer;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function makeUnit(id: number, team: Team, pick: Pick, human: boolean, x: number, y: number): Unit {
  const s = STATS[pick];
  return { id, team, pick, human, x, y, vx: 0, vy: 0, hp: s.hp, maxHp: s.hp, ammo: 3, reload: 0, cooldown: 0, super: 0, gems: 0, alive: true, respawn: 0, flash: 0, walk: 0, aim: team === 0 ? -Math.PI / 2 : Math.PI / 2, attackKick: 0, hitKick: 0 };
}

export function ArenaBrawlUltimate() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const movePointer = useRef<number | null>(null);
  const aimPointer = useRef<number | null>(null);
  const [phase, setPhase] = useState<"menu" | "game" | "over">("menu");
  const [pick, setPick] = useState<Pick>("blaze");
  const [result, setResult] = useState("");
  const [hud, setHud] = useState<Hud>({ hp: STATS.blaze.hp, maxHp: STATS.blaze.hp, ammo: 3, super: 0, blue: 0, red: 0, time: 150, countdown: null, gems: 0 });
  const art = useMemo(() => Object.fromEntries(PICKS.map(p => [p, brawlerArt(p)])) as Record<Pick, string>, []);
  const game = useRef({
    units: [] as Unit[], shots: [] as Shot[], particles: [] as Particle[], texts: [] as FloatText[], gems: [] as Gem[], nextGemId: 1,
    playerId: 1, move: { x: 0, y: 0 }, aim: { x: 0, y: -1 }, firing: false, superPressed: false,
    time: 150, gemTimer: 1.5, blueCountdown: 0, redCountdown: 0, shake: 0, last: performance.now(), running: false,
    cam: { x: WORLD_W / 2, y: WORLD_H / 2 }, hudClock: 0,
  });

  useEffect(() => { preloadSprites(); }, []);
  useEffect(() => {
    const onBlur = () => { game.current.move = { x: 0, y: 0 }; game.current.firing = false; };
    addEventListener("blur", onBlur); return () => removeEventListener("blur", onBlur);
  }, []);

  const reset = () => {
    unlockAudio();
    const g = game.current;
    g.units = [
      makeUnit(1, 0, pick, true, 880, 1020),
      makeUnit(2, 0, "nova", false, 660, 1010),
      makeUnit(3, 0, "bunker", false, 1100, 1010),
      makeUnit(4, 1, "vex", false, 880, 160),
      makeUnit(5, 1, "blaze", false, 660, 170),
      makeUnit(6, 1, "nova", false, 1100, 170),
    ];
    g.shots = []; g.particles = []; g.texts = []; g.gems = []; g.nextGemId = 1;
    g.move = { x: 0, y: 0 }; g.aim = { x: 0, y: -1 }; g.firing = false; g.superPressed = false;
    g.time = 150; g.gemTimer = 1.2; g.blueCountdown = 0; g.redCountdown = 0; g.shake = 0; g.last = performance.now(); g.running = true;
    g.cam = { x: 880, y: 960 }; g.hudClock = 0;
    setHud({ hp: STATS[pick].hp, maxHp: STATS[pick].hp, ammo: 3, super: 0, blue: 0, red: 0, time: 150, countdown: null, gems: 0 });
    setResult(""); setPhase("game");
  };

  useEffect(() => {
    if (phase !== "game") return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false }); if (!ctx) return;
    let raf = 0;
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize(); addEventListener("resize", resize);
    const loop = (now: number) => {
      const g = game.current; const dt = Math.min(.033, Math.max(.001, (now - g.last) / 1000)); g.last = now;
      if (g.running) updateGame(g, dt, now / 1000, (r) => { g.running = false; setResult(r); setPhase("over"); });
      const r = canvas.getBoundingClientRect(); drawGame(ctx, g, r.width, r.height, now / 1000);
      g.hudClock += dt;
      if (g.hudClock > .09) {
        g.hudClock = 0;
        const p = g.units.find(u => u.id === g.playerId)!;
        const blue = g.units.filter(u => u.team === 0).reduce((n,u)=>n+u.gems,0);
        const red = g.units.filter(u => u.team === 1).reduce((n,u)=>n+u.gems,0);
        const cd = g.blueCountdown > 0 ? Math.ceil(10 - g.blueCountdown) : g.redCountdown > 0 ? Math.ceil(10 - g.redCountdown) : null;
        setHud({ hp: Math.max(0, Math.round(p.hp)), maxHp: p.maxHp, ammo: p.ammo, super: Math.round(p.super), blue, red, time: Math.max(0, Math.ceil(g.time)), countdown: cd, gems: p.gems });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); };
  }, [phase]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const g = game.current; const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") g.move.y = -1;
      if (k === "s" || k === "arrowdown") g.move.y = 1;
      if (k === "a" || k === "arrowleft") g.move.x = -1;
      if (k === "d" || k === "arrowright") g.move.x = 1;
      if (e.code === "Space") { g.firing = true; e.preventDefault(); }
      if (k === "e") g.superPressed = true;
    };
    const up = (e: KeyboardEvent) => {
      const g = game.current; const k = e.key.toLowerCase();
      if ((k === "w" || k === "arrowup") && g.move.y < 0) g.move.y = 0;
      if ((k === "s" || k === "arrowdown") && g.move.y > 0) g.move.y = 0;
      if ((k === "a" || k === "arrowleft") && g.move.x < 0) g.move.x = 0;
      if ((k === "d" || k === "arrowright") && g.move.x > 0) g.move.x = 0;
      if (e.code === "Space") g.firing = false;
    };
    addEventListener("keydown", down); addEventListener("keyup", up); return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); };
  }, []);

  const stick = (kind: "move" | "aim") => {
    const ref = kind === "move" ? movePointer : aimPointer;
    const update = (e: React.PointerEvent<HTMLDivElement>) => {
      if (ref.current !== e.pointerId) return;
      const r = e.currentTarget.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let x = (e.clientX - cx) / (r.width * .34), y = (e.clientY - cy) / (r.height * .34); const m = Math.hypot(x,y);
      if (m > 1) { x /= m; y /= m; }
      const g = game.current;
      if (kind === "move") g.move = { x, y }; else { g.aim = { x, y }; g.firing = m > .18; }
      const knob = e.currentTarget.querySelector(".abu-knob") as HTMLElement | null;
      if (knob) knob.style.transform = `translate(${x * 38}px,${y * 38}px)`;
    };
    const start = (e: React.PointerEvent<HTMLDivElement>) => { ref.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); update(e); };
    const end = (e: React.PointerEvent<HTMLDivElement>) => {
      if (ref.current !== e.pointerId) return; ref.current = null;
      if (kind === "move") game.current.move = { x: 0, y: 0 }; else { game.current.firing = false; }
      const knob = e.currentTarget.querySelector(".abu-knob") as HTMLElement | null; if (knob) knob.style.transform = "translate(0,0)";
    };
    return { onPointerDown: start, onPointerMove: update, onPointerUp: end, onPointerCancel: end };
  };

  return <div ref={rootRef} className="abu-root">
    <canvas ref={canvasRef} className="abu-canvas" />
    {phase === "menu" && <div className="abu-menu">
      <div className="abu-rays" />
      <div className="abu-menu-top"><span>ARENA</span><b>AMIGOS</b><em>CORE CLASH</em></div>
      <div className="abu-hero"><div className="abu-hero-glow"/><img src={art[pick]} alt={pick}/></div>
      <div className="abu-mode"><div className="abu-mode-icon">◆</div><div><b>CORE CLASH • 3v3</b><span>Samla 10 kärnor och håll ledningen i 10 sekunder</span></div></div>
      <div className="abu-select">{PICKS.map(p => <button key={p} className={p===pick?"picked":""} onClick={()=>setPick(p)}><img src={art[p]} alt=""/><b>{p.toUpperCase()}</b></button>)}</div>
      <button className="abu-play" onClick={reset}><span>SPELA</span><small>3V3</small></button>
      <p className="abu-tip">Vänster spak rör • höger spak siktar/skjuter • gul knapp = super</p>
    </div>}
    {phase === "game" && <>
      <div className="abu-hud">
        <div className="abu-score blue"><span>BLÅ</span><b>◆ {hud.blue}</b></div>
        <div className="abu-clock"><b>{Math.floor(hud.time/60)}:{String(hud.time%60).padStart(2,"0")}</b>{hud.countdown!==null&&<span>VINST OM {hud.countdown}</span>}</div>
        <div className="abu-score red"><span>RÖD</span><b>◆ {hud.red}</b></div>
      </div>
      <div className="abu-playerhud"><div className="abu-hp"><i style={{width:`${Math.max(0,hud.hp/hud.maxHp*100)}%`}}/></div><div className="abu-playerline"><b>{hud.hp}</b><span>◆ {hud.gems}</span></div><div className="abu-ammo">{[0,1,2].map(i=><i key={i} className={i<hud.ammo?"on":""}/>)}</div></div>
      <div className="abu-controls">
        <div className="abu-stick move" {...stick("move")}><div className="abu-knob">✥</div></div>
        <div className="abu-stick aim" {...stick("aim")}><div className="abu-knob">✦</div></div>
        <button className={`abu-super ${hud.super>=100?"ready":""}`} onPointerDown={()=>game.current.superPressed=true}><i style={{height:`${hud.super}%`}}/><span>★</span></button>
      </div>
    </>}
    {phase === "over" && <div className="abu-over"><div><h1>{result}</h1><p>◆ {hud.blue} — {hud.red} ◆</p><button onClick={reset}>SPELA IGEN</button><button className="ghost" onClick={()=>setPhase("menu")}>MENY</button></div></div>}
  </div>;
}

function updateGame(g: any, dt: number, t: number, finish: (r:string)=>void) {
  g.time -= dt; g.shake = Math.max(0, g.shake - dt * 18);
  if (g.time <= 0) { const b=teamGems(g.units,0), r=teamGems(g.units,1); finish(b>=r?"SEGER!":"FÖRLUST"); return; }
  g.gemTimer -= dt;
  if (g.gemTimer <= 0 && g.gems.filter((x:Gem)=>x.alive).length < 7) { g.gemTimer = 2.8; g.gems.push({id:g.nextGemId++,x:880+(Math.random()-.5)*52,y:590+(Math.random()-.5)*52,bob:Math.random()*6.28,alive:true}); }
  const player = g.units.find((u:Unit)=>u.id===g.playerId) as Unit;
  for (const u of g.units as Unit[]) {
    if (!u.alive) { u.respawn -= dt; if (u.respawn <= 0) respawn(u); continue; }
    u.flash=Math.max(0,u.flash-dt*8);u.attackKick=Math.max(0,u.attackKick-dt*8);u.hitKick=Math.max(0,u.hitKick-dt*7);u.cooldown=Math.max(0,u.cooldown-dt);
    if (u.ammo < 3) { u.reload += dt; if (u.reload >= 1.1) { u.reload = 0; u.ammo++; } }
    let mx=0,my=0,ax=Math.cos(u.aim),ay=Math.sin(u.aim),shoot=false;
    if (u.human) { mx=g.move.x;my=g.move.y; const am=Math.hypot(g.aim.x,g.aim.y); if(am>.12){ax=g.aim.x/am;ay=g.aim.y/am;u.aim=Math.atan2(ay,ax)} shoot=g.firing; }
    else { const ai=botBrain(u,g.units,g.gems); mx=ai.mx;my=ai.my;ax=ai.ax;ay=ai.ay;u.aim=Math.atan2(ay,ax);shoot=ai.shoot; }
    const m=Math.hypot(mx,my); if(m>1){mx/=m;my/=m;} u.vx=mx*STATS[u.pick].speed;u.vy=my*STATS[u.pick].speed;
    if(m>.08){ moveUnit(u,u.vx*dt,u.vy*dt);u.walk += dt*(5.5+m*7); if(Math.random()<dt*4) spawnParticle(g,u.x,u.y+24,"dust",u.team,1); }
    if(shoot) fire(g,u,ax,ay,false);
    for(const gem of g.gems as Gem[]){if(gem.alive&&Math.hypot(u.x-gem.x,u.y-gem.y)<48){gem.alive=false;u.gems++;for(let i=0;i<8;i++)spawnParticle(g,gem.x,gem.y,"gem",u.team,1);}}
  }
  if (g.superPressed) { g.superPressed=false; if(player.alive&&player.super>=100){player.super=0; superFire(g,player);} }
  for(let i=g.shots.length-1;i>=0;i--){const q=g.shots[i] as Shot;q.life-=dt;q.px=q.x;q.py=q.y;q.x+=q.vx*dt;q.y+=q.vy*dt; if(q.life<=0||q.x<0||q.y<0||q.x>WORLD_W||q.y>WORLD_H||BLOCKS.some(b=>b.kind==="wall"&&q.x>b.x&&q.x<b.x+b.w&&q.y>b.y&&q.y<b.y+b.h)){g.shots.splice(i,1);continue;}let hit:Unit|undefined;for(const u of g.units as Unit[]){if(!u.alive||u.team===q.team)continue;if(Math.hypot(u.x-q.x,u.y-q.y)<R+q.size){hit=u;break}}if(hit){damage(g,hit,q.damage,q.team);g.shots.splice(i,1);}}
  for(let i=g.particles.length-1;i>=0;i--){const p=g.particles[i] as Particle;p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt);if(p.life<=0)g.particles.splice(i,1);}
  for(let i=g.texts.length-1;i>=0;i--){const f=g.texts[i] as FloatText;f.life-=dt;f.y-=42*dt;if(f.life<=0)g.texts.splice(i,1);}
  const blue=teamGems(g.units,0),red=teamGems(g.units,1);
  if(blue>=10&&blue>red){g.blueCountdown+=dt;g.redCountdown=0;}else if(red>=10&&red>blue){g.redCountdown+=dt;g.blueCountdown=0;}else{g.blueCountdown=0;g.redCountdown=0;}
  if(g.blueCountdown>=10){finish("SEGER!");return;}if(g.redCountdown>=10){finish("FÖRLUST");return;}
  g.cam.x += (player.x-g.cam.x)*Math.min(1,dt*5.5);g.cam.y += (player.y-g.cam.y)*Math.min(1,dt*5.5);
}
function teamGems(units: Unit[],team:Team){return units.reduce((n,u)=>n+(u.team===team?u.gems:0),0)}
function respawn(u:Unit){const base=u.team===0?{x:880,y:1030}:{x:880,y:150};const lane=(u.id%3-1)*210;u.x=base.x+lane;u.y=base.y;u.hp=u.maxHp;u.ammo=3;u.reload=0;u.alive=true;u.super=Math.max(0,u.super-20);}
function botBrain(u:Unit, units:Unit[], gems:Gem[]){let enemy:Unit|undefined,ed=1e9;for(const v of units){if(!v.alive||v.team===u.team)continue;const d=dist(u,v);if(d<ed){ed=d;enemy=v}}let gem:Gem|undefined,gd=1e9;for(const x of gems){if(!x.alive)continue;const d=dist(u,x);if(d<gd){gd=d;gem=x}}let tx=u.x,ty=u.y;if(gem&&gd<420&&u.gems<4){tx=gem.x;ty=gem.y}else if(enemy){const ideal=STATS[u.pick].range*.56;const a=Math.atan2(enemy.y-u.y,enemy.x-u.x);if(ed>ideal){tx=enemy.x;ty=enemy.y}else if(ed<ideal*.58){tx=u.x-Math.cos(a)*180;ty=u.y-Math.sin(a)*180}else{tx=u.x+Math.cos(a+Math.PI/2)*120;ty=u.y+Math.sin(a+Math.PI/2)*120}}const dx=tx-u.x,dy=ty-u.y,m=Math.hypot(dx,dy)||1;const ax=enemy?(enemy.x-u.x)/(ed||1):dx/m,ay=enemy?(enemy.y-u.y)/(ed||1):dy/m;return{mx:dx/m,my:dy/m,ax,ay,shoot:!!enemy&&ed<STATS[u.pick].range&&!segmentHitsWall(u.x,u.y,enemy.x,enemy.y)}}
function fire(g:any,u:Unit,ax:number,ay:number,superShot:boolean){if(!u.alive||u.cooldown>0||u.ammo<=0)return;const s=STATS[u.pick];u.cooldown=s.delay;u.ammo--;u.reload=0;u.attackKick=1;const base=Math.atan2(ay,ax);for(let i=0;i<s.pellets;i++){const off=(i-(s.pellets-1)/2)*s.spread+(Math.random()-.5)*.018,a=base+off;g.shots.push({x:u.x+Math.cos(a)*44,y:u.y+Math.sin(a)*44,px:u.x,py:u.y,vx:Math.cos(a)*s.shotSpeed,vy:Math.sin(a)*s.shotSpeed,life:s.range/s.shotSpeed,team:u.team,owner:u.id,damage:s.damage,size:u.pick==="nova"?10:7,super:superShot});}for(let i=0;i<5;i++)spawnParticle(g,u.x+ax*45,u.y+ay*45,"muzzle",u.team,1);if(u.human)sfx.shoot();}
function superFire(g:any,u:Unit){g.shake=14;const base=u.aim;for(let i=-3;i<=3;i++){const a=base+i*.12;g.shots.push({x:u.x+Math.cos(a)*45,y:u.y+Math.sin(a)*45,px:u.x,py:u.y,vx:Math.cos(a)*1100,vy:Math.sin(a)*1100,life:.72,team:u.team,owner:u.id,damage:760,size:11,super:true});}for(let i=0;i<28;i++)spawnParticle(g,u.x,u.y,"muzzle",u.team,1);sfx.superShot();}
function damage(g:any,u:Unit,dmg:number,team:Team){u.hp-=dmg;u.flash=1;u.hitKick=1;u.super=Math.min(100,u.super+14);g.shake=Math.max(g.shake,5);g.texts.push({x:u.x+(Math.random()-.5)*16,y:u.y-52,text:`-${Math.round(dmg)}`,life:.72,team});for(let i=0;i<6;i++)spawnParticle(g,u.x,u.y,"hit",team,1);if(u.hp<=0){u.alive=false;u.respawn=3.2;g.shake=12;for(let i=0;i<u.gems;i++)g.gems.push({id:g.nextGemId++,x:u.x+(Math.random()-.5)*95,y:u.y+(Math.random()-.5)*95,bob:Math.random()*6.28,alive:true});u.gems=0;for(let i=0;i<22;i++)spawnParticle(g,u.x,u.y,"ko",team,1);}}
function spawnParticle(g:any,x:number,y:number,kind:Particle["kind"],team:Team,m:number){const a=Math.random()*Math.PI*2,sp=(kind==="dust"?30:kind==="ko"?180:100)*(0.4+Math.random());g.particles.push({x:x+(Math.random()-.5)*10,y:y+(Math.random()-.5)*10,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:(kind==="dust"?.35:.5)*m,max:(kind==="dust"?.35:.5)*m,size:(kind==="ko"?10:kind==="gem"?8:5)+Math.random()*6,kind,team});}

function drawGame(ctx:CanvasRenderingContext2D,g:any,sw:number,sh:number,t:number){
  ctx.save();ctx.setTransform(1,0,0,1,0,0);const bg=ctx.createLinearGradient(0,0,0,sh);bg.addColorStop(0,"#6ed7ff");bg.addColorStop(1,"#3fa5e9");ctx.fillStyle=bg;ctx.fillRect(0,0,sw,sh);
  const zoom=clamp(Math.min(sw/930,sh/700),.72,1.08),sx=(Math.random()-.5)*g.shake,sy=(Math.random()-.5)*g.shake;ctx.translate(sw/2+sx,sh/2+sy);ctx.scale(zoom,zoom);ctx.translate(-g.cam.x,-g.cam.y);
  drawArena(ctx,t);
  const player=g.units.find((u:Unit)=>u.id===g.playerId) as Unit;if(player?.alive){const a=player.aim;ctx.save();ctx.globalAlpha=.18;ctx.fillStyle="#f7fff0";ctx.translate(player.x,player.y);ctx.rotate(a);ctx.beginPath();ctx.moveTo(28,-22);ctx.lineTo(STATS[player.pick].range, -54);ctx.lineTo(STATS[player.pick].range,54);ctx.lineTo(28,22);ctx.closePath();ctx.fill();ctx.restore();}
  for(const gem of g.gems as Gem[])if(gem.alive)drawGem(ctx,gem,t);
  for(const q of g.shots as Shot[]){ctx.save();ctx.lineCap="round";ctx.strokeStyle=q.super?"rgba(255,228,68,.72)":q.team===0?"rgba(108,210,255,.62)":"rgba(255,105,117,.62)";ctx.lineWidth=q.super?14:8;ctx.beginPath();ctx.moveTo(q.px,q.py);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.fillStyle=q.super?"#fff173":q.team===0?"#c8f3ff":"#ffd2d6";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=16;ctx.beginPath();ctx.arc(q.x,q.y,q.size,0,Math.PI*2);ctx.fill();ctx.restore();}
  for(const u of g.units as Unit[])if(u.alive)drawUnit(ctx,u,g.units,t);
  for(const p of g.particles as Particle[])drawParticle(ctx,p);
  for(const f of g.texts as FloatText[]){ctx.save();ctx.globalAlpha=clamp(f.life*1.5,0,1);ctx.font="1000 25px Arial";ctx.textAlign="center";ctx.lineWidth=6;ctx.strokeStyle="#18253d";ctx.strokeText(f.text,f.x,f.y);ctx.fillStyle="#fff";ctx.fillText(f.text,f.x,f.y);ctx.restore();}
  ctx.restore();
}
function drawArena(ctx:CanvasRenderingContext2D,t:number){
  ctx.save();ctx.shadowColor="rgba(18,48,55,.24)";ctx.shadowBlur=35;ctx.shadowOffsetY=18;round(ctx,22,22,WORLD_W-44,WORLD_H-44,70);ctx.fillStyle="#5ebb59";ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.clip();
  for(let x=0;x<WORLD_W;x+=110)for(let y=0;y<WORLD_H;y+=110){ctx.fillStyle=((x/110+y/110)%2===0)?"#66c65d":"#5fbd57";ctx.fillRect(x,y,110,110);ctx.globalAlpha=.08;ctx.fillStyle="#fff";ctx.fillRect(x,y,110,8);ctx.globalAlpha=1;}
  const vign=ctx.createRadialGradient(880,590,120,880,590,950);vign.addColorStop(0,"rgba(255,255,190,.13)");vign.addColorStop(1,"rgba(20,80,35,.14)");ctx.fillStyle=vign;ctx.fillRect(0,0,WORLD_W,WORLD_H);
  ctx.restore();
  for(const b of BLOCKS){if(b.kind==="wall")drawWall(ctx,b);else if(b.kind==="water")drawWater(ctx,b,t);}
  for(const b of BLOCKS)if(b.kind==="bush")drawBush(ctx,b,t);
  ctx.save();ctx.translate(880,590);ctx.shadowColor="#9b67ff";ctx.shadowBlur=34;ctx.fillStyle="#7550cb";ctx.beginPath();ctx.arc(0,0,69,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle="#bca7ff";star(ctx,0,-4,35,16,6);ctx.fill();ctx.fillStyle="#e8e0ff";star(ctx,0,-4,17,8,6);ctx.fill();ctx.restore();
}
function drawWall(ctx:CanvasRenderingContext2D,b:Block){ctx.save();ctx.fillStyle="rgba(76,48,24,.28)";round(ctx,b.x+10,b.y+17,b.w,b.h,20);ctx.fill();ctx.fillStyle="#965b2c";round(ctx,b.x,b.y+10,b.w,b.h,20);ctx.fill();const grad=ctx.createLinearGradient(0,b.y,0,b.y+b.h);grad.addColorStop(0,"#f7c277");grad.addColorStop(.48,"#dfa05a");grad.addColorStop(1,"#bf7739");ctx.fillStyle=grad;round(ctx,b.x,b.y,b.w,b.h-12,18);ctx.fill();ctx.strokeStyle="#815126";ctx.lineWidth=6;ctx.stroke();ctx.globalAlpha=.28;ctx.fillStyle="#fff5cf";round(ctx,b.x+9,b.y+8,b.w-18,15,8);ctx.fill();ctx.restore();}
function drawWater(ctx:CanvasRenderingContext2D,b:Block,t:number){ctx.save();const g=ctx.createLinearGradient(b.x,b.y,b.x,b.y+b.h);g.addColorStop(0,"#5fd8ff");g.addColorStop(1,"#2899e8");ctx.fillStyle=g;round(ctx,b.x,b.y,b.w,b.h,31);ctx.fill();ctx.strokeStyle="rgba(212,250,255,.72)";ctx.lineWidth=7;ctx.stroke();ctx.globalAlpha=.25;ctx.strokeStyle="#fff";ctx.lineWidth=5;for(let i=0;i<3;i++){ctx.beginPath();const yy=b.y+35+i*38+Math.sin(t*2+i)*5;ctx.moveTo(b.x+24,yy);ctx.bezierCurveTo(b.x+b.w*.35,yy-12,b.x+b.w*.65,yy+12,b.x+b.w-24,yy);ctx.stroke();}ctx.restore();}
function drawBush(ctx:CanvasRenderingContext2D,b:Block,t:number){ctx.save();ctx.fillStyle="rgba(23,91,45,.26)";round(ctx,b.x+7,b.y+12,b.w,b.h,42);ctx.fill();const cols=Math.max(3,Math.floor(b.w/62)),rows=Math.max(2,Math.floor(b.h/58));for(let iy=0;iy<rows;iy++)for(let ix=0;ix<cols;ix++){const x=b.x+32+ix*(b.w-64)/Math.max(1,cols-1),y=b.y+29+iy*(b.h-58)/Math.max(1,rows-1),rr=35+Math.sin(t*1.3+ix+iy)*2;ctx.fillStyle=(ix+iy)%2?"#37a84e":"#48b95f";ctx.strokeStyle="#287e3d";ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,rr,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.globalAlpha=.16;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(x-10,y-11,rr*.32,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}ctx.restore();}
function drawGem(ctx:CanvasRenderingContext2D,g:Gem,t:number){const y=g.y+Math.sin(t*3+g.bob)*7;ctx.save();ctx.translate(g.x,y);ctx.shadowColor="#9d64ff";ctx.shadowBlur=18;ctx.fillStyle="#9b6cff";star(ctx,0,0,21,9,6);ctx.fill();ctx.fillStyle="#e6dbff";star(ctx,-3,-4,9,4,6);ctx.fill();ctx.restore();}
function drawUnit(ctx:CanvasRenderingContext2D,u:Unit,all:Unit[],t:number){
  const hidden=insideBush(u.x,u.y)&&u.team===1&&!all.some(v=>v.team===0&&v.alive&&dist(u,v)<220);if(hidden)return;
  const moving=Math.hypot(u.vx,u.vy)>30,profile=Math.abs(u.vx)>Math.abs(u.vy)*1.15,back=!profile&&u.vy<-20,fr=sheetFrame(u.pick,back,u.walk,moving,profile);
  ctx.save();ctx.translate(u.x,u.y);ctx.globalAlpha=insideBush(u.x,u.y)?(.72):1;
  ctx.fillStyle="rgba(12,28,35,.25)";ctx.beginPath();ctx.ellipse(0,27,45,18,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=u.team===0?"#76c6ff":"#ff7b88";ctx.lineWidth=u.human?8:5;ctx.globalAlpha*=.8;ctx.beginPath();ctx.arc(0,16,u.human?48:43,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
  const kick=1-u.attackKick*.06,hit=1-u.hitKick*.07;ctx.scale(kick*hit,1+(u.attackKick+u.hitKick)*.035);
  if(fr){const aspect=fr.sw/fr.sh,dh=u.pick==="bunker"?142:132,dw=dh*aspect;ctx.save();if(profile&&u.vx<0)ctx.scale(-1,1);ctx.shadowColor="rgba(21,31,55,.35)";ctx.shadowBlur=6;ctx.drawImage(fr.img,fr.sx,fr.sy,fr.sw,fr.sh,-dw/2,-dh*.73,dw,dh);ctx.restore();}else{ctx.fillStyle=u.team===0?"#4c97ff":"#f34f60";ctx.beginPath();ctx.arc(0,-10,40,0,Math.PI*2);ctx.fill();}
  if(u.flash>0){ctx.globalAlpha=u.flash*.55;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(0,-10,50,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
  ctx.restore();
  const barW=90,barY=u.y-88;ctx.save();ctx.fillStyle="#233149";round(ctx,u.x-barW/2,barY,barW,12,6);ctx.fill();ctx.fillStyle=u.team===0?"#48e56a":"#ff5361";round(ctx,u.x-barW/2+2,barY+2,(barW-4)*clamp(u.hp/u.maxHp,0,1),8,4);ctx.fill();ctx.textAlign="center";ctx.font="900 13px Arial";ctx.lineWidth=4;ctx.strokeStyle="#152038";ctx.strokeText(u.human?"DU":u.pick.toUpperCase(),u.x,barY-7);ctx.fillStyle="#fff";ctx.fillText(u.human?"DU":u.pick.toUpperCase(),u.x,barY-7);if(u.gems>0){ctx.font="900 16px Arial";ctx.strokeText(`◆ ${u.gems}`,u.x,barY+34);ctx.fillStyle="#d5c2ff";ctx.fillText(`◆ ${u.gems}`,u.x,barY+34);}ctx.restore();
}
function drawParticle(ctx:CanvasRenderingContext2D,p:Particle){const a=clamp(p.life/p.max,0,1);ctx.save();ctx.globalAlpha=a;ctx.fillStyle=p.kind==="dust"?"#d9c69c":p.kind==="gem"?"#cbb4ff":p.kind==="ko"?"#ffe36a":p.team===0?"#bcecff":"#ffc0c7";ctx.beginPath();ctx.arc(p.x,p.y,p.size*a,0,Math.PI*2);ctx.fill();ctx.restore();}
