import { useEffect, useMemo, useRef, useState } from "react";
import Phaser from "phaser";
import blazeArt from "@/assets/brawler-blaze.png";
import novaArt from "@/assets/brawler-nova.png";
import bunkerArt from "@/assets/brawler-bunker.png";
import vexArt from "@/assets/brawler-vex.png";
import blazeSheet from "@/assets/brawler-blaze-sheet.png";
import novaSheet from "@/assets/brawler-nova-sheet.png";
import bunkerSheet from "@/assets/brawler-bunker-sheet.png";
import vexSheet from "@/assets/brawler-vex-sheet.png";
import blazeSide from "@/assets/brawler-blaze-side.png";
import novaSide from "@/assets/brawler-nova-side.png";
import bunkerSide from "@/assets/brawler-bunker-side.png";
import vexSide from "@/assets/brawler-vex-side.png";
import { unlockAudio, sfx } from "./audio";

type Pick = "blaze" | "nova" | "bunker" | "vex";
type Team = "blue" | "red";
type Hud = { hp:number; maxHp:number; ammo:number; super:number; blue:number; red:number; time:number; cores:number };
type Bridge = { pick:Pick; move:{x:number;y:number}; aim:{x:number;y:number}; shooting:boolean; superPressed:boolean; setHud:(h:Hud)=>void; finish:(s:string)=>void };
type AssetMeta = Record<Pick,{sheetW:number;sheetH:number;sideW:number;sideH:number}>;
type Fighter = Phaser.Physics.Arcade.Sprite & {
  team:Team; pick:Pick; hp:number; maxHp:number; ammo:number; reload:number; super:number; nextShot:number; respawnAt:number; human:boolean;
  ring:Phaser.GameObjects.Arc; hpBg:Phaser.GameObjects.Rectangle; hpFill:Phaser.GameObjects.Rectangle; label:Phaser.GameObjects.Text; walk:number; lastHit:number; hidden:boolean;
};
type Shot = Phaser.GameObjects.Arc & { body:Phaser.Physics.Arcade.Body; team:Team; damage:number; expires:number; trailAt:number };
type Core = Phaser.GameObjects.Star & { born:number };

const W=1680,H=1120;
const STATS:Record<Pick,{hp:number;speed:number;damage:number;delay:number;range:number;projectile:number;rows:number;front:number[];back:number[]}>={
  blaze:{hp:5600,speed:310,damage:920,delay:360,range:540,projectile:930,rows:2,front:[0],back:[1]},
  nova:{hp:4300,speed:305,damage:1480,delay:570,range:780,projectile:1220,rows:2,front:[0],back:[1]},
  bunker:{hp:7400,speed:250,damage:790,delay:480,range:470,projectile:820,rows:4,front:[0,1],back:[2,3]},
  vex:{hp:4700,speed:340,damage:680,delay:245,range:610,projectile:1040,rows:3,front:[0],back:[1,2]},
};
const SHEETS={blaze:blazeSheet,nova:novaSheet,bunker:bunkerSheet,vex:vexSheet};
const SIDES={blaze:blazeSide,nova:novaSide,bunker:bunkerSide,vex:vexSide};
const ARTS={blaze:blazeArt,nova:novaArt,bunker:bunkerArt,vex:vexArt};
const SPAWNS={blue:[{x:840,y:1010},{x:630,y:970},{x:1050,y:970}],red:[{x:840,y:110},{x:630,y:150},{x:1050,y:150}]};
const WALLS=[[180,225,300,100],[1200,225,300,100],[180,795,300,100],[1200,795,300,100],[520,365,100,270],[1060,485,100,270],[690,230,300,88],[690,802,300,88],[710,515,260,90],[90,500,210,90],[1380,530,210,90]] as const;
const BUSHES=[[160,130],[395,470],[350,700],[1325,440],[1400,770],[840,365],[840,750],[585,770],[1160,330],[510,160],[1190,930]] as const;

function loadImg(src:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src;});}
async function getMeta():Promise<AssetMeta>{const out={} as AssetMeta;for(const p of Object.keys(SHEETS) as Pick[]){const [a,b]=await Promise.all([loadImg(SHEETS[p]),loadImg(SIDES[p])]);out[p]={sheetW:a.naturalWidth,sheetH:a.naturalHeight,sideW:b.naturalWidth,sideH:b.naturalHeight};}return out;}

class ProScene extends Phaser.Scene{
  bridge:Bridge; meta:AssetMeta; fighters:Fighter[]=[]; shots:Shot[]=[]; cores:Core[]=[]; player!:Fighter; walls!:Phaser.Physics.Arcade.StaticGroup;
  keys!:Record<string,Phaser.Input.Keyboard.Key>; cursors!:Phaser.Types.Input.Keyboard.CursorKeys; aimGuide!:Phaser.GameObjects.Graphics; endAt=0; blue=0; red=0; lastCore=0;
  constructor(b:Bridge,m:AssetMeta){super("arena-pro");this.bridge=b;this.meta=m;}
  preload(){for(const p of Object.keys(SHEETS) as Pick[]){const st=STATS[p],m=this.meta[p];this.load.spritesheet(`${p}-sheet`,SHEETS[p],{frameWidth:m.sheetW/4,frameHeight:m.sheetH/st.rows});this.load.spritesheet(`${p}-side`,SIDES[p],{frameWidth:m.sideW/4,frameHeight:m.sideH});}}
  create(){
    this.physics.world.setBounds(0,0,W,H);this.cameras.main.setBounds(0,0,W,H);this.drawArena();
    this.walls=this.physics.add.staticGroup();WALLS.forEach(w=>this.addWall(...w));
    this.spawnTeams();this.cursors=this.input.keyboard!.createCursorKeys();this.keys=this.input.keyboard!.addKeys("W,A,S,D,E,SPACE") as Record<string,Phaser.Input.Keyboard.Key>;
    this.aimGuide=this.add.graphics().setDepth(17);this.cameras.main.startFollow(this.player,true,.14,.14);this.cameras.main.setZoom(this.scale.width<650?1.15:1.28);this.cameras.main.setRoundPixels(false);
    this.lastCore=this.time.now-4500;this.endAt=this.time.now+105000;this.cameras.main.fadeIn(260,255,255,255);
  }
  drawArena(){const g=this.add.graphics();g.fillStyle(0x74d36a);g.fillRect(0,0,W,H);for(let x=0;x<W;x+=80)for(let y=0;y<H;y+=80){if(((x/80+y/80)|0)%2===0){g.fillStyle(0x68c861,.32);g.fillRect(x,y,80,80)}}
    for(let i=0;i<110;i++){const x=Phaser.Math.Between(25,W-25),y=Phaser.Math.Between(25,H-25);g.lineStyle(3,0x3d9e49,.22);g.lineBetween(x,y,x+Phaser.Math.Between(-4,4),y-Phaser.Math.Between(7,13));}
    this.addWater(480,505,190,145);this.addWater(1010,505,190,145);BUSHES.forEach(([x,y])=>this.addBush(x,y));
    this.add.circle(840,560,86,0x7052d8,.18).setStrokeStyle(11,0xc8b7ff,.75).setDepth(2);this.add.circle(840,560,45,0x6d4cda,.65).setStrokeStyle(6,0xeadfff,.85).setDepth(3);
    const gem=this.add.star(840,555,4,13,34,0xf0e8ff,1).setDepth(4);this.tweens.add({targets:gem,angle:360,scale:1.15,duration:2600,yoyo:true,repeat:-1,ease:"Sine.inOut"});
    this.addSpawnPad(840,1005,0x3d7cff);this.addSpawnPad(840,115,0xff4e5c);
  }
  addSpawnPad(x:number,y:number,c:number){this.add.circle(x,y,74,c,.11).setStrokeStyle(7,c,.42).setDepth(1);}
  addWater(x:number,y:number,w:number,h:number){const g=this.add.graphics().setDepth(1);g.fillStyle(0x36b7e9,.88);g.fillRoundedRect(x,y,w,h,30);g.lineStyle(8,0xa8ecff,.55);g.strokeRoundedRect(x+4,y+4,w-8,h-8,25);for(let i=0;i<5;i++){g.lineStyle(3,0xe5fbff,.32);g.beginPath();g.arc(x+30+i*34,y+48+(i%2)*38,20,.2,2.6);g.strokePath();}}
  addBush(x:number,y:number){const c=this.add.container(x,y).setDepth(13);for(let i=0;i<12;i++){const a=i/12*Math.PI*2,rr=i%2?40:30;c.add(this.add.circle(Math.cos(a)*rr,Math.sin(a)*rr*.62,31,i%2?0x2d9847:0x4bbb61).setStrokeStyle(3,0x25773a,.42));}c.add(this.add.circle(0,0,42,0x36a94e));}
  addWall(x:number,y:number,w:number,h:number){this.add.rectangle(x+w/2+11,y+h/2+17,w,h,0x634125,.36).setDepth(6);const body=this.add.rectangle(x+w/2,y+h/2,w,h,0xb9793f).setStrokeStyle(6,0x82502b).setDepth(8);this.add.rectangle(x+w/2,y+h/2-12,w-10,h-20,0xf0b86a).setStrokeStyle(4,0xffdfa5,.55).setDepth(10);this.add.rectangle(x+w/2,y+10,w-14,10,0xffd28c,.55).setDepth(11);this.walls.add(body);(body.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();}
  spawnTeams(){const b:Pick[]=[this.bridge.pick,"nova","bunker"],r:Pick[]=["vex","blaze","nova"];b.forEach((p,i)=>this.spawnFighter("blue",p,SPAWNS.blue[i]!,i===0));r.forEach((p,i)=>this.spawnFighter("red",p,SPAWNS.red[i]!,false));}
  spawnFighter(team:Team,pick:Pick,pos:{x:number;y:number},human:boolean){const st=STATS[pick];const s=this.physics.add.sprite(pos.x,pos.y,`${pick}-sheet`,0) as Fighter;s.team=team;s.pick=pick;s.hp=st.hp;s.maxHp=st.hp;s.ammo=3;s.reload=0;s.super=0;s.nextShot=0;s.respawnAt=0;s.human=human;s.walk=0;s.lastHit=-99999;s.hidden=false;
    s.setDisplaySize(148,164).setDepth(25).setCollideWorldBounds(true).setOrigin(.5,.66);(s.body as Phaser.Physics.Arcade.Body).setSize(64,62,true);this.physics.add.collider(s,this.walls);
    s.ring=this.add.circle(pos.x,pos.y+30,48,team==="blue"?0x3d7cff:0xff4e5c,.15).setStrokeStyle(7,team==="blue"?0x8eb9ff:0xff9298,.9).setDepth(18);
    s.hpBg=this.add.rectangle(pos.x,pos.y-86,82,10,0x263348,.9).setStrokeStyle(2,0xffffff,.9).setDepth(31);s.hpFill=this.add.rectangle(pos.x-39,pos.y-86,78,6,team==="blue"?0x42dc6c:0x56df72,1).setOrigin(0,.5).setDepth(32);
    s.label=this.add.text(pos.x,pos.y-104,human?"DU":pick.toUpperCase(),{fontFamily:"Arial",fontSize:human?"18px":"13px",fontStyle:"bold",color:"#fff",stroke:team==="blue"?"#2454ad":"#a92938",strokeThickness:5}).setOrigin(.5).setDepth(33);
    this.fighters.push(s);if(human)this.player=s;}
  inBush(f:Fighter){for(const [x,y] of BUSHES)if(Phaser.Math.Distance.Between(f.x,f.y,x,y)<72)return true;return false;}
  update(time:number,delta:number){const dt=Math.min(.034,delta/1000);if(time>=this.endAt){this.finish();return;}if(time-this.lastCore>6500&&this.cores.length<6){this.spawnCore();this.lastCore=time;}this.updateHuman(time,dt);for(const f of this.fighters)if(!f.human)this.updateBot(f,time,dt);for(const f of this.fighters)this.updateFighter(f,time,dt);this.updateShots(time);this.updateCores(time);this.drawAim();if(this.bridge.superPressed){this.bridge.superPressed=false;this.useSuper();}
    this.bridge.setHud({hp:Math.max(0,Math.round(this.player.hp)),maxHp:this.player.maxHp,ammo:this.player.ammo,super:Math.round(this.player.super),blue:this.blue,red:this.red,time:Math.max(0,Math.ceil((this.endAt-time)/1000)),cores:this.player.getData("cores")||0});}
  updateHuman(time:number,dt:number){const p=this.player;if(time<p.respawnAt)return;const kx=(this.keys.D?.isDown||this.cursors.right.isDown?1:0)-(this.keys.A?.isDown||this.cursors.left.isDown?1:0),ky=(this.keys.S?.isDown||this.cursors.down.isDown?1:0)-(this.keys.W?.isDown||this.cursors.up.isDown?1:0);let mx=kx||ky?kx:this.bridge.move.x,my=kx||ky?ky:this.bridge.move.y;const m=Math.hypot(mx,my)||1;if(m>1){mx/=m;my/=m;}p.setVelocity(mx*STATS[p.pick].speed,my*STATS[p.pick].speed);if((this.bridge.shooting||this.keys.SPACE?.isDown)&&Math.hypot(this.bridge.aim.x,this.bridge.aim.y)>.18)this.fire(p,Math.atan2(this.bridge.aim.y,this.bridge.aim.x),time);if(this.keys.E?.isDown){this.keys.E.reset();this.useSuper();}}
  updateBot(f:Fighter,time:number,dt:number){if(time<f.respawnAt)return;let target:Fighter|undefined,best=1e9;for(const e of this.fighters){if(e.team===f.team||time<e.respawnAt)continue;const d=Phaser.Math.Distance.Between(f.x,f.y,e.x,e.y);if(d<best){best=d;target=e;}}if(!target)return;const a=Phaser.Math.Angle.Between(f.x,f.y,target.x,target.y),pref=STATS[f.pick].range*.62;let dir=best>pref?1:best<pref*.52?-.78:0;const strafe=Math.sin(time*.002+this.fighters.indexOf(f)*1.6)*.42;f.setVelocity((Math.cos(a)*dir+Math.cos(a+Math.PI/2)*strafe)*STATS[f.pick].speed,(Math.sin(a)*dir+Math.sin(a+Math.PI/2)*strafe)*STATS[f.pick].speed);if(best<STATS[f.pick].range)this.fire(f,a+Phaser.Math.FloatBetween(-.055,.055),time);}
  updateFighter(f:Fighter,time:number,dt:number){const alive=time>=f.respawnAt;f.ring.setPosition(f.x,f.y+31).setVisible(alive);f.hpBg.setPosition(f.x,f.y-86).setVisible(alive);f.hpFill.setPosition(f.x-39,f.y-86).setDisplaySize(78*Math.max(0,f.hp/f.maxHp),6).setVisible(alive);f.label.setPosition(f.x,f.y-105).setVisible(alive);if(!alive){f.setVisible(false).setVelocity(0,0);return;}if(!f.visible)f.setVisible(true);if(f.ammo<3){f.reload+=dt;if(f.reload>=1.1){f.reload=0;f.ammo++;}}if(f.hp<f.maxHp&&time-f.lastHit>3200)f.hp=Math.min(f.maxHp,f.hp+f.maxHp*.07*dt);
    const v=f.body?.velocity??new Phaser.Math.Vector2();const moving=Math.hypot(v.x,v.y)>25;if(moving)f.walk+=dt*10;this.applyAnim(f,v.x,v.y,moving);const bush=this.inBush(f);f.hidden=bush&&!f.human;f.setAlpha(f.hidden?.34:1);f.ring.setAlpha(f.hidden?.15:1);}
  applyAnim(f:Fighter,vx:number,vy:number,moving:boolean){const st=STATS[f.pick],col=moving?Math.floor(f.walk)%4:0;if(Math.abs(vx)>Math.abs(vy)*.7){f.setTexture(`${f.pick}-side`,col);f.setFlipX(vx<0);}else{const rows=vy<0?st.back:st.front;const total=rows.length*4,idx=moving?Math.floor(f.walk)%total:0,row=rows[Math.floor(idx/4)]??rows[0]!,frame=row*4+(idx%4);f.setTexture(`${f.pick}-sheet`,frame);f.setFlipX(false);} }
  drawAim(){this.aimGuide.clear();const p=this.player;if(this.time.now<p.respawnAt)return;const a=this.bridge.aim,m=Math.hypot(a.x,a.y);if(m<.15)return;const ang=Math.atan2(a.y,a.x),len=Math.min(STATS[p.pick].range,420);this.aimGuide.fillStyle(0xffffff,.11);this.aimGuide.beginPath();this.aimGuide.moveTo(p.x,p.y);this.aimGuide.lineTo(p.x+Math.cos(ang-.07)*len,p.y+Math.sin(ang-.07)*len);this.aimGuide.lineTo(p.x+Math.cos(ang+.07)*len,p.y+Math.sin(ang+.07)*len);this.aimGuide.closePath();this.aimGuide.fillPath();this.aimGuide.lineStyle(3,0xffffff,.32);this.aimGuide.lineBetween(p.x,p.y,p.x+Math.cos(ang)*len,p.y+Math.sin(ang)*len);}
  fire(f:Fighter,a:number,time:number){if(time<f.respawnAt||time<f.nextShot||f.ammo<1)return;const st=STATS[f.pick];f.ammo--;f.reload=0;f.nextShot=time+st.delay;const count=f.pick==="blaze"?3:f.pick==="bunker"?4:f.pick==="vex"?2:1;for(let i=0;i<count;i++){const off=(i-(count-1)/2)*(f.pick==="bunker"?.12:f.pick==="blaze"?.09:.04),aa=a+off;const q=this.add.circle(f.x+Math.cos(aa)*52,f.y+Math.sin(aa)*52,f.pick==="nova"?10:8,f.team==="blue"?0x8fd1ff:0xff9098,1).setStrokeStyle(4,0xffffff,.9).setDepth(40) as Shot;this.physics.add.existing(q);q.team=f.team;q.damage=st.damage/count;q.expires=time+1050;q.trailAt=0;(q.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(aa)*st.projectile,Math.sin(aa)*st.projectile);this.shots.push(q);this.muzzle(q.x,q.y,f.team);}if(f.human)sfx.shoot();this.tweens.add({targets:f,scaleX:1.07,scaleY:.94,duration:55,yoyo:true});}
  muzzle(x:number,y:number,team:Team){const c=this.add.circle(x,y,16,team==="blue"?0xe8f7ff:0xffffe1,1).setDepth(41);this.tweens.add({targets:c,scale:2.5,alpha:0,duration:105,onComplete:()=>c.destroy()});}
  updateShots(time:number){for(let i=this.shots.length-1;i>=0;i--){const q=this.shots[i]!;if(!q.active||time>q.expires||q.x<0||q.y<0||q.x>W||q.y>H){q.destroy();this.shots.splice(i,1);continue;}if(time-q.trailAt>36){q.trailAt=time;const t=this.add.circle(q.x,q.y,q.radius*.62,q.fillColor,.5).setDepth(29);this.tweens.add({targets:t,alpha:0,scale:.2,duration:140,onComplete:()=>t.destroy()});}let hit:Fighter|undefined;for(const f of this.fighters){if(f.team===q.team||time<f.respawnAt)continue;if(Phaser.Math.Distance.Between(q.x,q.y,f.x,f.y)<44){hit=f;break;}}if(hit){this.damage(hit,q.damage,time);this.burst(q.x,q.y,q.team);q.destroy();this.shots.splice(i,1);}}}
  damage(f:Fighter,d:number,time:number){f.hp-=d;f.lastHit=time;if(f.team!==this.player.team)this.player.super=Math.min(100,this.player.super+13);f.setTintFill(0xffffff);this.time.delayedCall(65,()=>f.active&&f.clearTint());this.cameras.main.shake(65,.0026);const txt=this.add.text(f.x,f.y-55,`-${Math.round(d)}`,{fontFamily:"Arial",fontSize:"18px",fontStyle:"bold",color:"#fff",stroke:"#49233a",strokeThickness:5}).setOrigin(.5).setDepth(50);this.tweens.add({targets:txt,y:txt.y-40,alpha:0,duration:430,onComplete:()=>txt.destroy()});if(f.hp<=0)this.kill(f,time);}
  kill(f:Fighter,time:number){if(f.team==="red")this.blue++;else this.red++;f.respawnAt=time+3000;f.setVisible(false);f.setVelocity(0,0);this.burst(f.x,f.y,f.team==="blue"?"red":"blue",16);if(f.human)sfx.kill();this.time.delayedCall(3000,()=>{const arr=SPAWNS[f.team],idx=Math.max(0,this.fighters.filter(x=>x.team===f.team).indexOf(f)),sp=arr[Math.min(idx,2)]!;f.hp=f.maxHp;f.ammo=3;f.setPosition(sp.x,sp.y).setVisible(true);});}
  burst(x:number,y:number,team:Team,n=8){for(let i=0;i<n;i++){const p=this.add.circle(x,y,Phaser.Math.Between(4,9),team==="blue"?0x7ab8ff:0xff7b86,1).setDepth(48),a=Math.random()*Math.PI*2,r=Phaser.Math.Between(35,90);this.tweens.add({targets:p,x:x+Math.cos(a)*r,y:y+Math.sin(a)*r,alpha:0,scale:.2,duration:Phaser.Math.Between(180,330),onComplete:()=>p.destroy()});}}
  spawnCore(){const c=this.add.star(840+Phaser.Math.Between(-35,35),560+Phaser.Math.Between(-30,30),4,8,18,0xc99cff,1).setStrokeStyle(4,0xffffff,.9).setDepth(22) as Core;c.born=this.time.now;this.cores.push(c);this.tweens.add({targets:c,angle:360,scale:1.25,duration:1500,repeat:-1,ease:"Linear"});}
  updateCores(time:number){for(let i=this.cores.length-1;i>=0;i--){const c=this.cores[i]!;for(const f of this.fighters){if(time<f.respawnAt)continue;if(Phaser.Math.Distance.Between(c.x,c.y,f.x,f.y)<52){const n=(f.getData("cores")||0)+1;f.setData("cores",n);if(f.team==="blue")this.blue++;else this.red++;if(f.human)sfx.pickup();c.destroy();this.cores.splice(i,1);break;}}}}
  useSuper(){const p=this.player;if(p.super<100||this.time.now<p.respawnAt)return;p.super=0;sfx.superShot();const r=this.add.circle(p.x,p.y,46,0xffdc42,.25).setStrokeStyle(13,0xfff5a7,.95).setDepth(55);this.tweens.add({targets:r,scale:7,alpha:0,duration:500,onComplete:()=>r.destroy()});for(const f of this.fighters)if(f.team!==p.team&&this.time.now>=f.respawnAt&&Phaser.Math.Distance.Between(p.x,p.y,f.x,f.y)<305)this.damage(f,1750,this.time.now);}
  finish(){if(this.scene.isPaused())return;this.scene.pause();this.bridge.finish(this.blue>=this.red?"SEGER!":"FÖRLUST");}
}

export function PhaserBrawlerPro(){
  const mount=useRef<HTMLDivElement>(null),game=useRef<Phaser.Game|null>(null),bridge=useRef<Bridge|null>(null);const movePointer=useRef<number|null>(null),aimPointer=useRef<number|null>(null);
  const [phase,setPhase]=useState<"menu"|"loading"|"game"|"over">("menu"),[pick,setPick]=useState<Pick>("blaze"),[result,setResult]=useState("");const [hud,setHud]=useState<Hud>({hp:5600,maxHp:5600,ammo:3,super:0,blue:0,red:0,time:105,cores:0});
  const arts=useMemo(()=>ARTS,[]);useEffect(()=>()=>{game.current?.destroy(true);game.current=null},[]);
  const start=async()=>{unlockAudio();setPhase("loading");setResult("");try{const meta=await getMeta();requestAnimationFrame(()=>{if(!mount.current)return;game.current?.destroy(true);const b:Bridge={pick,move:{x:0,y:0},aim:{x:0,y:-1},shooting:false,superPressed:false,setHud,finish:r=>{setResult(r);setPhase("over")}};bridge.current=b;game.current=new Phaser.Game({type:Phaser.AUTO,parent:mount.current,width:innerWidth,height:innerHeight,backgroundColor:"#72d7ff",physics:{default:"arcade",arcade:{debug:false}},scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH},render:{antialias:true,pixelArt:false,roundPixels:false},scene:new ProScene(b,meta)});setPhase("game");});}catch(e){console.error(e);setPhase("menu");}};
  const stick=(kind:"move"|"aim")=>{const ptr=kind==="move"?movePointer:aimPointer;const update=(e:React.PointerEvent<HTMLDivElement>)=>{if(ptr.current!==e.pointerId)return;const r=e.currentTarget.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=r.width*.31;let dx=e.clientX-cx,dy=e.clientY-cy,m=Math.hypot(dx,dy)||1,k=Math.min(1,max/m),x=dx*k/max,y=dy*k/max;if(bridge.current){bridge.current[kind]={x,y};if(kind==="aim")bridge.current.shooting=Math.hypot(x,y)>.22;}const knob=e.currentTarget.querySelector(".pb-knob") as HTMLElement|null;if(knob)knob.style.transform=`translate(${dx*k}px,${dy*k}px)`;};const reset=(el:HTMLDivElement)=>{ptr.current=null;if(bridge.current){bridge.current[kind]={x:0,y:kind==="aim"?-1:0};if(kind==="aim")bridge.current.shooting=false;}const knob=el.querySelector(".pb-knob") as HTMLElement|null;if(knob)knob.style.transform="translate(0,0)";};return{onPointerDown:(e:React.PointerEvent<HTMLDivElement>)=>{ptr.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);update(e);},onPointerMove:update,onPointerUp:(e:React.PointerEvent<HTMLDivElement>)=>{if(ptr.current===e.pointerId)reset(e.currentTarget);},onPointerCancel:(e:React.PointerEvent<HTMLDivElement>)=>{if(ptr.current===e.pointerId)reset(e.currentTarget);}};};
  const pct=Math.max(0,Math.min(100,hud.hp/hud.maxHp*100));
  return <div className="pb-root"><div ref={mount} className="pb-game"/>
    {phase==="menu"&&<div className="pb-menu"><div className="pb-rays"/><div className="pb-logo"><span>ARENA</span><b>AMIGOS</b></div><div className="pb-mode"><strong>CORE CLASH</strong><span>3 mot 3 · samla kärnor · slå ut motståndarna</span></div><div className="pb-select">{(["blaze","nova","bunker","vex"] as Pick[]).map(k=><button key={k} onClick={()=>setPick(k)} className={pick===k?"picked":""}><img src={arts[k]}/><b>{k.toUpperCase()}</b></button>)}</div><div className="pb-hero"><div className="pb-hero-glow"/><img src={arts[pick]}/></div><button className="pb-play" onClick={start}>SPELA</button></div>}
    {phase==="loading"&&<div className="pb-over"><div><h1>LADDAR</h1><p>Förbereder fighters…</p></div></div>}
    {(phase==="game"||phase==="over")&&<><div className="pb-hud"><div className="pb-score blue"><b>{hud.blue}</b><span>BLÅ</span></div><div className="pb-timer">{Math.floor(hud.time/60)}:{String(hud.time%60).padStart(2,"0")}</div><div className="pb-score red"><b>{hud.red}</b><span>RÖD</span></div></div><div className="pb-status"><div className="pb-hp"><i style={{width:`${pct}%`}}/></div><b>{Math.round(hud.hp)} HP · ◆ {hud.cores}</b><div className="pb-ammo">{[0,1,2].map(i=><i key={i} className={i<hud.ammo?"on":""}/>)}</div></div><div className="pb-stick pb-left" {...stick("move")}><div className="pb-knob">✥</div></div><div className="pb-stick pb-right" {...stick("aim")}><div className="pb-knob attack">✦</div></div><button className={`pb-super ${hud.super>=100?"ready":""}`} onPointerDown={()=>{if(bridge.current)bridge.current.superPressed=true}}><span>★</span><i style={{height:`${hud.super}%`}}/></button></>}
    {phase==="over"&&<div className="pb-over"><div><h1>{result}</h1><p>BLÅ {hud.blue} – {hud.red} RÖD</p><button onClick={()=>{game.current?.destroy(true);game.current=null;setPhase("menu")}}>TILL MENYN</button></div></div>}
  </div>;
}
