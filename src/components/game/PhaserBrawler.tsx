import { useEffect, useMemo, useRef, useState } from "react";
import Phaser from "phaser";
import blazeUrl from "@/assets/brawler-blaze.png";
import novaUrl from "@/assets/brawler-nova.png";
import bunkerUrl from "@/assets/brawler-bunker.png";
import vexUrl from "@/assets/brawler-vex.png";
import { unlockAudio, sfx } from "./audio";

type Pick = "blaze" | "nova" | "bunker" | "vex";
type Team = "blue" | "red";
type Bridge = {
  pick: Pick;
  move: { x: number; y: number };
  aim: { x: number; y: number };
  shooting: boolean;
  superPressed: boolean;
  setHud: (h: Hud) => void;
  finish: (text: string) => void;
};
type Hud = { hp: number; maxHp: number; ammo: number; super: number; blue: number; red: number; time: number; cores: number };
type Fighter = Phaser.Physics.Arcade.Sprite & {
  team: Team;
  keyId: Pick;
  hp: number;
  maxHp: number;
  ammo: number;
  reload: number;
  super: number;
  shootCd: number;
  deadUntil: number;
  cores: number;
  isHuman?: boolean;
};
type Shot = Phaser.GameObjects.Arc & { body: Phaser.Physics.Arcade.Body; team: Team; damage: number; born: number };
type Core = Phaser.GameObjects.Arc & { born: number };

const WORLD_W = 1800;
const WORLD_H = 1200;
const COLORS = { blue: 0x3d7cff, red: 0xff4e5c, grass: 0x67c85c, grass2: 0x5dbe54, wall: 0xc88745, top: 0xf1b96c };
const STATS: Record<Pick, { hp: number; speed: number; damage: number; range: number; projectile: number; fireDelay: number; scale: number }> = {
  blaze: { hp: 5600, speed: 295, damage: 880, range: 520, projectile: 850, fireDelay: 360, scale: 0.26 },
  nova: { hp: 4300, speed: 300, damage: 1450, range: 760, projectile: 1200, fireDelay: 560, scale: 0.25 },
  bunker: { hp: 7200, speed: 245, damage: 760, range: 450, projectile: 760, fireDelay: 470, scale: 0.25 },
  vex: { hp: 4700, speed: 330, damage: 650, range: 590, projectile: 980, fireDelay: 230, scale: 0.25 },
};
const SPAWNS = {
  blue: [{ x: 900, y: 1050 }, { x: 700, y: 1020 }, { x: 1100, y: 1020 }],
  red: [{ x: 900, y: 150 }, { x: 700, y: 180 }, { x: 1100, y: 180 }],
};
const WALLS = [
  [250, 235, 260, 90], [1290, 235, 260, 90], [250, 875, 260, 90], [1290, 875, 260, 90],
  [565, 395, 90, 260], [1145, 545, 90, 260], [750, 260, 300, 80], [750, 860, 300, 80],
  [150, 505, 190, 85], [1460, 610, 190, 85], [760, 535, 280, 130],
] as const;
const BUSHES = [[185,150],[420,470],[360,720],[1380,470],[1440,780],[900,390],[900,760],[610,780],[1190,340]] as const;

class ArenaScene extends Phaser.Scene {
  bridge: Bridge;
  player!: Fighter;
  fighters: Fighter[] = [];
  shots: Shot[] = [];
  cores: Core[] = [];
  walls!: Phaser.Physics.Arcade.StaticGroup;
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  lastCore = 0;
  endAt = 0;
  startedAt = 0;
  blueScore = 0;
  redScore = 0;
  shake = 0;
  constructor(bridge: Bridge) { super("arena"); this.bridge = bridge; }
  preload() {
    this.load.image("blaze", blazeUrl);
    this.load.image("nova", novaUrl);
    this.load.image("bunker", bunkerUrl);
    this.load.image("vex", vexUrl);
  }
  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.drawArena();
    this.walls = this.physics.add.staticGroup();
    for (const [x,y,w,h] of WALLS) this.addWall(x,y,w,h);
    this.spawnTeams();
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,E,SPACE") as Record<string, Phaser.Input.Keyboard.Key>;
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    const viewW = this.scale.width;
    this.cameras.main.setZoom(viewW < 700 ? 1.02 : 1.18);
    this.startedAt = this.time.now;
    this.lastCore = this.time.now - 5500;
    this.endAt = this.time.now + 120000;
    this.cameras.main.fadeIn(260, 255, 255, 255);
  }
  drawArena() {
    const g = this.add.graphics();
    g.fillStyle(COLORS.grass); g.fillRect(0,0,WORLD_W,WORLD_H);
    for (let x=0;x<WORLD_W;x+=100) for (let y=0;y<WORLD_H;y+=100) {
      if (((x/100)+(y/100))%2===0) { g.fillStyle(COLORS.grass2,0.35); g.fillRect(x,y,100,100); }
      g.lineStyle(2,0xffffff,0.025); g.strokeRect(x,y,100,100);
    }
    for (let i=0;i<75;i++) {
      const x = Phaser.Math.Between(30,WORLD_W-30), y=Phaser.Math.Between(30,WORLD_H-30);
      g.lineStyle(3,0x3c9b43,0.28); g.lineBetween(x,y,x+Phaser.Math.Between(-4,4),y-Phaser.Math.Between(7,13));
    }
    this.addWater(540,520,210,150); this.addWater(1050,530,210,150);
    BUSHES.forEach(([x,y])=>this.addBush(x,y));
    const ring=this.add.circle(900,600,88,0x8257e8,0.16).setStrokeStyle(10,0xbda6ff,0.65); ring.setDepth(1);
    this.add.circle(900,600,44,0x754de0,0.75).setStrokeStyle(6,0xf0eaff,0.8).setDepth(2);
    const diamond=this.add.star(900,596,4,14,34,0xeadfff,1).setDepth(3);
    this.tweens.add({targets:diamond,angle:360,duration:5000,repeat:-1,ease:"Linear"});
    const vignette = this.add.rectangle(900,600,WORLD_W,WORLD_H,0x1f3252,0).setDepth(50).setScrollFactor(0);
    vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);
  }
  addWater(x:number,y:number,w:number,h:number) {
    const g=this.add.graphics();
    g.fillStyle(0x35afe4,0.78); g.fillRoundedRect(x,y,w,h,28);
    g.lineStyle(8,0x8ce6ff,0.5); g.strokeRoundedRect(x+4,y+4,w-8,h-8,24);
    for(let i=0;i<4;i++){g.lineStyle(3,0xd2f5ff,0.3); g.beginPath(); g.arc(x+45+i*38,y+55+(i%2)*28,18,0.1,2.4); g.strokePath();}
    g.setDepth(1);
  }
  addBush(x:number,y:number) {
    const c=this.add.container(x,y).setDepth(9);
    for(let i=0;i<10;i++){
      const a=(i/10)*Math.PI*2, rr=Phaser.Math.Between(22,44), r=Phaser.Math.Between(28,38);
      const leaf=this.add.circle(Math.cos(a)*rr,Math.sin(a)*rr*.65,r,i%2?0x2b9843:0x45b45d,1).setStrokeStyle(3,0x247a37,0.32);
      c.add(leaf);
    }
    c.add(this.add.circle(0,0,42,0x35a84d,1));
  }
  addWall(x:number,y:number,w:number,h:number) {
    const shadow=this.add.rectangle(x+w/2+10,y+h/2+16,w,h,0x6f4a2a,0.45).setDepth(6);
    const body=this.add.rectangle(x+w/2,y+h/2,w,h,COLORS.wall,1).setStrokeStyle(5,0x8f5c30,1).setDepth(8);
    const top=this.add.rectangle(x+w/2,y+h/2-10,w-8,h-16,COLORS.top,1).setStrokeStyle(3,0xffd89b,0.48).setDepth(9);
    shadow.setAngle(0); top.setAngle(0);
    this.walls.add(body); body.refreshBody();
  }
  spawnTeams() {
    const bluePicks: Pick[]=[this.bridge.pick,"nova","bunker"];
    const redPicks: Pick[]=["vex","blaze","nova"];
    bluePicks.forEach((k,i)=>this.makeFighter("blue",k,SPAWNS.blue[i]!,i===0));
    redPicks.forEach((k,i)=>this.makeFighter("red",k,SPAWNS.red[i]!,false));
  }
  makeFighter(team:Team,keyId:Pick,pos:{x:number;y:number},human:boolean) {
    const st=STATS[keyId];
    const s=this.physics.add.sprite(pos.x,pos.y,keyId) as Fighter;
    s.team=team;s.keyId=keyId;s.hp=st.hp;s.maxHp=st.hp;s.ammo=3;s.reload=0;s.super=0;s.shootCd=0;s.deadUntil=0;s.cores=0;s.isHuman=human;
    s.setScale(st.scale).setDepth(20).setCollideWorldBounds(true);
    const body=s.body as Phaser.Physics.Arcade.Body; body.setCircle(Math.max(34,s.displayWidth*.23),Math.max(0,s.width*.5-34),Math.max(0,s.height*.64-34));
    this.physics.add.collider(s,this.walls);
    this.fighters.push(s); if(human)this.player=s;
    const ring=this.add.circle(0,0,52,team==="blue"?COLORS.blue:COLORS.red,0.13).setStrokeStyle(6,team==="blue"?0x77a9ff:0xff7a84,0.75).setDepth(11);
    (s as any).ring=ring;
    return s;
  }
  update(time:number,delta:number) {
    const dt=Math.min(.034,delta/1000);
    if(time>=this.endAt){this.finishMatch();return;}
    if(time-this.lastCore>6500 && this.cores.length<7){this.spawnCore();this.lastCore=time;}
    this.updatePlayer(time,dt);
    for(const f of this.fighters) if(!f.isHuman) this.updateBot(f,time,dt);
    this.updateFighters(time,dt);
    this.updateShots(time,dt);
    this.updateCores(time);
    if(this.bridge.superPressed){this.bridge.superPressed=false;this.useSuper();}
    if(this.shake>0){this.shake-=dt;this.cameras.main.shake(55,0.0035);}
    const left=Math.max(0,Math.ceil((this.endAt-time)/1000));
    this.bridge.setHud({hp:Math.max(0,Math.round(this.player.hp)),maxHp:this.player.maxHp,ammo:this.player.ammo,super:Math.round(this.player.super),blue:this.blueScore,red:this.redScore,time:left,cores:this.player.cores});
  }
  updatePlayer(time:number,dt:number) {
    const p=this.player;if(time<p.deadUntil)return;
    const kx=(this.keys.D?.isDown||this.cursors.right.isDown?1:0)-(this.keys.A?.isDown||this.cursors.left.isDown?1:0);
    const ky=(this.keys.S?.isDown||this.cursors.down.isDown?1:0)-(this.keys.W?.isDown||this.cursors.up.isDown?1:0);
    let mx=Math.abs(kx)+Math.abs(ky)>0?kx:this.bridge.move.x, my=Math.abs(kx)+Math.abs(ky)>0?ky:this.bridge.move.y;
    const m=Math.hypot(mx,my)||1; if(m>1){mx/=m;my/=m;}
    const sp=STATS[p.keyId].speed; p.setVelocity(mx*sp,my*sp);
    if(Math.abs(mx)+Math.abs(my)>.08){p.setFlipX(mx<-.12);p.angle=Phaser.Math.Clamp(mx*4,-4,4);}
    const keyboardShoot=this.keys.SPACE?.isDown;
    const aim=this.bridge.aim, am=Math.hypot(aim.x,aim.y);
    if((this.bridge.shooting||keyboardShoot)&&am>.15) this.tryShoot(p,Math.atan2(aim.y,aim.x),time);
    if(this.keys.E?.isDown){this.keys.E.reset();this.useSuper();}
  }
  updateBot(f:Fighter,time:number,dt:number) {
    if(time<f.deadUntil)return;
    const enemies=this.fighters.filter(o=>o.team!==f.team&&time>=o.deadUntil);
    if(!enemies.length)return;
    let target=enemies[0]!;let best=Infinity;
    for(const e of enemies){const d=Phaser.Math.Distance.Between(f.x,f.y,e.x,e.y);if(d<best){best=d;target=e;}}
    let tx=target.x,ty=target.y;
    if(f.cores>0 && f.team==="blue" && this.blueScore>=7){tx=900;ty=980;}
    if(f.cores>0 && f.team==="red" && this.redScore>=7){tx=900;ty=220;}
    const ang=Phaser.Math.Angle.Between(f.x,f.y,tx,ty);
    const preferred=STATS[f.keyId].range*.62;
    let dir=best>preferred?1:best<preferred*.55?-0.8:0;
    const strafe=Math.sin(time*.0017+this.fighters.indexOf(f)*1.7)*0.7;
    const vx=(Math.cos(ang)*dir+Math.cos(ang+Math.PI/2)*strafe*.45)*STATS[f.keyId].speed;
    const vy=(Math.sin(ang)*dir+Math.sin(ang+Math.PI/2)*strafe*.45)*STATS[f.keyId].speed;
    f.setVelocity(vx,vy);f.setFlipX(vx<0);f.angle=Phaser.Math.Clamp(vx/80,-4,4);
    if(best<STATS[f.keyId].range&&time>f.shootCd){this.tryShoot(f,ang+Phaser.Math.FloatBetween(-.055,.055),time);}
  }
  updateFighters(time:number,dt:number) {
    for(const f of this.fighters){
      const ring=(f as any).ring as Phaser.GameObjects.Arc; ring.setPosition(f.x,f.y+17).setVisible(time>=f.deadUntil);
      if(time<f.deadUntil){f.setVisible(false).setVelocity(0,0);continue;} else if(!f.visible){f.setVisible(true);}
      if(f.ammo<3){f.reload+=dt;if(f.reload>=1.05){f.reload=0;f.ammo++;}}
      if(f.hp<f.maxHp && time-f.getData("hitAt")>3000) f.hp=Math.min(f.maxHp,f.hp+f.maxHp*.08*dt);
      f.setTint(f.team==="red"?0xffd7da:0xffffff);
      f.setAlpha(1);
    }
  }
  tryShoot(f:Fighter,ang:number,time:number){
    if(time<f.deadUntil||f.ammo<=0||time<f.shootCd)return;
    const st=STATS[f.keyId];f.ammo--;f.reload=0;f.shootCd=time+st.fireDelay;
    const shots=f.keyId==="blaze"?3:f.keyId==="bunker"?4:f.keyId==="vex"?2:1;
    for(let i=0;i<shots;i++){
      const off=(i-(shots-1)/2)*(f.keyId==="bunker"?.12:f.keyId==="blaze"?.09:.045);
      const a=ang+off;const q=this.add.circle(f.x+Math.cos(a)*52,f.y+Math.sin(a)*52,f.keyId==="nova"?9:7,f.team==="blue"?0x8fc8ff:0xff8c91,1).setStrokeStyle(3,0xffffff,.8).setDepth(30) as Shot;
      this.physics.add.existing(q);q.team=f.team;q.damage=st.damage/shots;q.born=time;const b=q.body as Phaser.Physics.Arcade.Body;b.setCircle(q.radius);b.setVelocity(Math.cos(a)*st.projectile,Math.sin(a)*st.projectile);this.shots.push(q);
      this.addMuzzle(f.x+Math.cos(a)*48,f.y+Math.sin(a)*48,f.team);
    }
    if(f.isHuman)sfx.shoot();
    this.tweens.add({targets:f,scaleX:st.scale*1.08,scaleY:st.scale*.92,duration:55,yoyo:true});
  }
  addMuzzle(x:number,y:number,team:Team){
    const flash=this.add.circle(x,y,16,team==="blue"?0xdff2ff:0xffe2d8,0.95).setDepth(31);this.tweens.add({targets:flash,scale:2,alpha:0,duration:100,onComplete:()=>flash.destroy()});
  }
  updateShots(time:number,dt:number){
    for(let i=this.shots.length-1;i>=0;i--){const q=this.shots[i]!;if(!q.active)continue;
      if(time-q.born>950){q.destroy();this.shots.splice(i,1);continue;}
      if(q.x<0||q.y<0||q.x>WORLD_W||q.y>WORLD_H){q.destroy();this.shots.splice(i,1);continue;}
      let hit=false;
      for(const f of this.fighters){if(f.team===q.team||time<f.deadUntil)continue;const d=Phaser.Math.Distance.Between(q.x,q.y,f.x,f.y);if(d<44){this.damage(f,q.damage,time);hit=true;break;}}
      if(hit){this.hitBurst(q.x,q.y,q.team);q.destroy();this.shots.splice(i,1);}
    }
  }
  damage(f:Fighter,dmg:number,time:number){
    f.hp-=dmg;f.setData("hitAt",time);f.super=Math.min(100,f.super+14);this.shake=.08;
    f.setTintFill(0xffffff);this.time.delayedCall(70,()=>{if(f.active)f.clearTint();});
    if(f.hp<=0){const enemy=f.team==="blue"?"red":"blue"; if(enemy==="blue")this.blueScore++;else this.redScore++;this.kill(f,time);}
  }
  kill(f:Fighter,time:number){
    sfx.kill();f.deadUntil=time+3000;f.setVisible(false).setVelocity(0,0);const lost=f.cores;f.cores=0;
    for(let i=0;i<lost;i++)this.dropCore(f.x+Phaser.Math.Between(-35,35),f.y+Phaser.Math.Between(-35,35));
    this.hitBurst(f.x,f.y,f.team==="blue"?"red":"blue",18);
    const idx=this.fighters.filter(x=>x.team===f.team).indexOf(f);const sp=SPAWNS[f.team][Math.max(0,idx)]??SPAWNS[f.team][0]!;
    this.time.delayedCall(3000,()=>{f.hp=f.maxHp;f.ammo=3;f.super=Math.max(0,f.super-35);f.setPosition(sp.x,sp.y).setVisible(true);});
  }
  hitBurst(x:number,y:number,team:Team,n=7){for(let i=0;i<n;i++){const p=this.add.circle(x,y,Phaser.Math.Between(4,9),team==="blue"?0x82b6ff:0xff7d86,1).setDepth(35);const a=Math.random()*Math.PI*2,r=Phaser.Math.Between(30,90);this.tweens.add({targets:p,x:x+Math.cos(a)*r,y:y+Math.sin(a)*r,alpha:0,scale:.2,duration:Phaser.Math.Between(180,320),onComplete:()=>p.destroy()});}}
  spawnCore(){this.dropCore(900+Phaser.Math.Between(-34,34),600+Phaser.Math.Between(-30,30));}
  dropCore(x:number,y:number){const c=this.add.circle(x,y,14,0xa875ff,1).setStrokeStyle(5,0xf0d9ff,1).setDepth(16) as Core;c.born=this.time.now;this.cores.push(c);this.tweens.add({targets:c,scale:1.22,duration:520,yoyo:true,repeat:-1,ease:"Sine.inOut"});}
  updateCores(time:number){for(let i=this.cores.length-1;i>=0;i--){const c=this.cores[i]!;for(const f of this.fighters){if(time<f.deadUntil)continue;if(Phaser.Math.Distance.Between(c.x,c.y,f.x,f.y)<55){f.cores++;if(f.team==="blue")this.blueScore++;else this.redScore++;if(f.isHuman)sfx.pickup();c.destroy();this.cores.splice(i,1);break;}}}}
  useSuper(){const p=this.player;if(p.super<100||this.time.now<p.deadUntil)return;p.super=0;sfx.superShot();this.shake=.25;const ring=this.add.circle(p.x,p.y,40,0xffd944,.22).setStrokeStyle(12,0xfff3a4,.95).setDepth(28);this.tweens.add({targets:ring,scale:7,alpha:0,duration:520,ease:"Cubic.Out",onComplete:()=>ring.destroy()});for(const f of this.fighters){if(f.team===p.team||this.time.now<f.deadUntil)continue;const d=Phaser.Math.Distance.Between(p.x,p.y,f.x,f.y);if(d<300)this.damage(f,1700,this.time.now);}}
  finishMatch(){if(this.scene.isPaused())return;this.scene.pause();const win=this.blueScore>=this.redScore;this.bridge.finish(win?"SEGER!":"FÖRLUST");}
}

export function PhaserBrawler(){
  const mount=useRef<HTMLDivElement>(null);const game=useRef<Phaser.Game|null>(null);const bridge=useRef<Bridge|null>(null);
  const [phase,setPhase]=useState<"menu"|"game"|"over">("menu");const [pick,setPick]=useState<Pick>("blaze");const [result,setResult]=useState("");
  const [hud,setHud]=useState<Hud>({hp:5600,maxHp:5600,ammo:3,super:0,blue:0,red:0,time:120,cores:0});
  const [joy,setJoy]=useState({move:{x:0,y:0},aim:{x:0,y:0}});
  const arts=useMemo(()=>({blaze:blazeUrl,nova:novaUrl,bunker:bunkerUrl,vex:vexUrl}),[]);
  useEffect(()=>()=>{game.current?.destroy(true);game.current=null;},[]);
  const start=()=>{unlockAudio();setPhase("game");setResult("");setTimeout(()=>{if(!mount.current)return;game.current?.destroy(true);const b:Bridge={pick,move:{x:0,y:0},aim:{x:0,y:-1},shooting:false,superPressed:false,setHud,finish:(t)=>{setResult(t);setPhase("over");}};bridge.current=b;game.current=new Phaser.Game({type:Phaser.AUTO,parent:mount.current,backgroundColor:"#6bc9ff",width:window.innerWidth,height:window.innerHeight,physics:{default:"arcade",arcade:{debug:false}},scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH},render:{antialias:true,pixelArt:false,roundPixels:false},scene:new ArenaScene(b)});},0);};
  const stick=(kind:"move"|"aim")=>{let pid:number|null=null;return{onPointerDown:(e:React.PointerEvent<HTMLDivElement>)=>{pid=e.pointerId;e.currentTarget.setPointerCapture(pid);update(e);},onPointerMove:(e:React.PointerEvent<HTMLDivElement>)=>{if(e.pointerId===pid)update(e);},onPointerUp:(e:React.PointerEvent<HTMLDivElement>)=>{if(e.pointerId!==pid)return;pid=null;if(bridge.current){bridge.current[kind]={x:0,y:kind==="aim"?-1:0};if(kind==="aim")bridge.current.shooting=false;}const k=e.currentTarget.querySelector(".pb-knob") as HTMLElement|null;if(k)k.style.transform="translate(0,0)";},onPointerCancel:(e:React.PointerEvent<HTMLDivElement>)=>{if(e.pointerId===pid){pid=null;if(bridge.current){bridge.current[kind]={x:0,y:kind==="aim"?-1:0};bridge.current.shooting=false;}}}};function update(e:React.PointerEvent<HTMLDivElement>){const r=e.currentTarget.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=r.width*.31;let dx=e.clientX-cx,dy=e.clientY-cy,m=Math.hypot(dx,dy)||1,k=Math.min(1,max/m);let x=dx*k/max,y=dy*k/max;if(bridge.current){bridge.current[kind]={x,y};if(kind==="aim")bridge.current.shooting=Math.hypot(x,y)>.24;}setJoy(v=>({...v,[kind]:{x,y}}));const knob=e.currentTarget.querySelector(".pb-knob") as HTMLElement|null;if(knob)knob.style.transform=`translate(${dx*k}px,${dy*k}px)`;}};
  const pct=Math.max(0,Math.min(100,(hud.hp/hud.maxHp)*100));
  return <div className="pb-root">
    <div ref={mount} className="pb-game" />
    {phase==="menu"&&<div className="pb-menu"><div className="pb-rays"/><div className="pb-logo"><span>ARENA</span><b>AMIGOS</b></div><div className="pb-mode"><strong>CORE CLASH</strong><span>3 mot 3 · samla energikärnor · slå ut motståndarna</span></div><div className="pb-select">{(["blaze","nova","bunker","vex"] as Pick[]).map(k=><button key={k} onClick={()=>setPick(k)} className={pick===k?"picked":""}><img src={arts[k]}/><b>{k.toUpperCase()}</b></button>)}</div><div className="pb-hero"><div className="pb-hero-glow"/><img src={arts[pick]}/></div><button className="pb-play" onClick={start}>SPELA</button></div>}
    {phase!=="menu"&&<><div className="pb-hud"><div className="pb-score blue"><b>{hud.blue}</b><span>BLÅ</span></div><div className="pb-timer">{Math.floor(hud.time/60)}:{String(hud.time%60).padStart(2,"0")}</div><div className="pb-score red"><b>{hud.red}</b><span>RÖD</span></div></div><div className="pb-status"><div className="pb-hp"><i style={{width:`${pct}%`}}/></div><b>{Math.round(hud.hp)}</b><div className="pb-ammo">{[0,1,2].map(i=><i key={i} className={i<hud.ammo?"on":""}/>)}</div></div><div className="pb-stick pb-left" {...stick("move")}><div className="pb-knob">✥</div></div><div className="pb-stick pb-right" {...stick("aim")}><div className="pb-knob attack">✦</div></div><button className={`pb-super ${hud.super>=100?"ready":""}`} onPointerDown={()=>{if(bridge.current)bridge.current.superPressed=true}}><span>★</span><i style={{height:`${hud.super}%`}}/></button></>}
    {phase==="over"&&<div className="pb-over"><div><h1>{result}</h1><p>BLÅ {hud.blue} – {hud.red} RÖD</p><button onClick={()=>{game.current?.destroy(true);game.current=null;setPhase("menu")}}>TILL MENYN</button></div></div>}
  </div>;
}
