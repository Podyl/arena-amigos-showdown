import { useEffect, useMemo, useRef, useState } from "react";
import Phaser from "phaser";
import blazeUrl from "@/assets/brawler-blaze.png";
import novaUrl from "@/assets/brawler-nova.png";
import bunkerUrl from "@/assets/brawler-bunker.png";
import vexUrl from "@/assets/brawler-vex.png";
import { unlockAudio, sfx } from "./audio";

type Pick = "blaze" | "nova" | "bunker" | "vex";
type Team = "blue" | "red";
type Hud = { hp:number; maxHp:number; ammo:number; super:number; blue:number; red:number; time:number };
type Bridge = { pick:Pick; move:{x:number;y:number}; aim:{x:number;y:number}; shooting:boolean; superPressed:boolean; setHud:(h:Hud)=>void; finish:(s:string)=>void };
type Fighter = Phaser.Physics.Arcade.Sprite & { team:Team; pick:Pick; hp:number; maxHp:number; ammo:number; reload:number; super:number; nextShot:number; respawnAt:number; human:boolean; ring:Phaser.GameObjects.Arc };
type Shot = Phaser.GameObjects.Arc & { body:Phaser.Physics.Arcade.Body; team:Team; damage:number; expires:number };

const W=1600,H=1100;
const STATS:Record<Pick,{hp:number;speed:number;damage:number;delay:number;range:number}>={
  blaze:{hp:5600,speed:300,damage:900,delay:360,range:520},
  nova:{hp:4300,speed:300,damage:1450,delay:560,range:760},
  bunker:{hp:7200,speed:250,damage:760,delay:470,range:460},
  vex:{hp:4700,speed:335,damage:650,delay:240,range:600},
};
const SPAWNS={blue:[{x:800,y:960},{x:600,y:930},{x:1000,y:930}],red:[{x:800,y:140},{x:600,y:170},{x:1000,y:170}]};
const WALLS=[[220,240,260,86],[1120,240,260,86],[220,774,260,86],[1120,774,260,86],[530,390,90,230],[980,480,90,230],[680,250,240,80],[680,770,240,80],[700,505,200,90]] as const;
const ASSETS:{key:Pick;url:string}[]=[{key:"blaze",url:blazeUrl},{key:"nova",url:novaUrl},{key:"bunker",url:bunkerUrl},{key:"vex",url:vexUrl}];

class Scene extends Phaser.Scene{
  bridge:Bridge; fighters:Fighter[]=[]; shots:Shot[]=[]; player!:Fighter; walls!:Phaser.Physics.Arcade.StaticGroup; keys!:Record<string,Phaser.Input.Keyboard.Key>; cursors!:Phaser.Types.Input.Keyboard.CursorKeys; endAt=0; blue=0; red=0;
  constructor(b:Bridge){super("arena-fixed");this.bridge=b;}
  preload(){
    ASSETS.forEach(a=>this.load.image(a.key,a.url));
    this.load.on("loaderror",(file:any)=>console.error("Arena asset load failed",file?.key,file?.src));
  }
  create(){
    this.physics.world.setBounds(0,0,W,H); this.cameras.main.setBounds(0,0,W,H);
    const g=this.add.graphics(); g.fillStyle(0x67c85c);g.fillRect(0,0,W,H);
    for(let x=0;x<W;x+=100)for(let y=0;y<H;y+=100){if(((x+y)/100)%2===0){g.fillStyle(0x5fbd55,.45);g.fillRect(x,y,100,100)}}
    this.drawBush(190,170);this.drawBush(410,520);this.drawBush(270,700);this.drawBush(1320,180);this.drawBush(1210,560);this.drawBush(1320,800);this.drawBush(800,390);this.drawBush(800,710);
    this.drawWater(470,495,190,130);this.drawWater(940,495,190,130);
    this.walls=this.physics.add.staticGroup(); WALLS.forEach(w=>this.wall(...w));
    this.add.circle(800,550,72,0x8157e6,.24).setStrokeStyle(9,0xc8b5ff,.75).setDepth(2);
    this.add.star(800,550,6,12,30,0xd7caff,1).setDepth(3);
    this.spawnTeams();
    this.cursors=this.input.keyboard!.createCursorKeys();this.keys=this.input.keyboard!.addKeys("W,A,S,D,E,SPACE") as Record<string,Phaser.Input.Keyboard.Key>;
    this.cameras.main.startFollow(this.player,true,.12,.12);this.cameras.main.setZoom(this.scale.width<700?1.04:1.16);
    this.endAt=this.time.now+120000;
  }
  drawWater(x:number,y:number,w:number,h:number){const g=this.add.graphics().setDepth(1);g.fillStyle(0x35afe4,.8);g.fillRoundedRect(x,y,w,h,28);g.lineStyle(7,0x9be9ff,.55);g.strokeRoundedRect(x+4,y+4,w-8,h-8,24);}
  drawBush(x:number,y:number){const c=this.add.container(x,y).setDepth(10);for(let i=0;i<9;i++){const a=i/9*Math.PI*2;c.add(this.add.circle(Math.cos(a)*35,Math.sin(a)*24,31,i%2?0x2e9846:0x47b65f).setStrokeStyle(3,0x24773a,.45))}c.add(this.add.circle(0,0,38,0x39a952));}
  wall(x:number,y:number,w:number,h:number){this.add.rectangle(x+w/2+10,y+h/2+14,w,h,0x76502e,.42).setDepth(6);const r=this.add.rectangle(x+w/2,y+h/2,w,h,0xc88745).setStrokeStyle(5,0x8f5d31).setDepth(8);this.add.rectangle(x+w/2,y+h/2-9,w-10,h-18,0xf1b96c).setStrokeStyle(3,0xffd89b,.5).setDepth(9);this.walls.add(r);(r.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();}
  spawnTeams(){const bp:Pick[]=[this.bridge.pick,"nova","bunker"],rp:Pick[]=["vex","blaze","nova"];bp.forEach((p,i)=>this.makeFighter("blue",p,SPAWNS.blue[i]!,i===0));rp.forEach((p,i)=>this.makeFighter("red",p,SPAWNS.red[i]!,false));}
  makeFighter(team:Team,pick:Pick,pos:{x:number;y:number},human:boolean){
    const s=this.physics.add.sprite(pos.x,pos.y,pick) as Fighter; const st=STATS[pick];
    s.team=team;s.pick=pick;s.hp=st.hp;s.maxHp=st.hp;s.ammo=3;s.reload=0;s.super=0;s.nextShot=0;s.respawnAt=0;s.human=human;
    s.setDisplaySize(145,145).setDepth(25).setCollideWorldBounds(true).setOrigin(.5,.64);
    const body=s.body as Phaser.Physics.Arcade.Body;body.setSize(64,64,true);
    this.physics.add.collider(s,this.walls);
    s.ring=this.add.circle(pos.x,pos.y+28,46,team==="blue"?0x3d7cff:0xff4e5c,.16).setStrokeStyle(6,team==="blue"?0x8bb7ff:0xff9198,.9).setDepth(18);
    this.add.text(pos.x,pos.y-68,pick.toUpperCase(),{fontFamily:"Arial",fontSize:"15px",fontStyle:"bold",color:"#ffffff",stroke:"#17233f",strokeThickness:4}).setOrigin(.5).setDepth(30).setData("owner",s);
    this.fighters.push(s);if(human)this.player=s;return s;
  }
  update(time:number,delta:number){const dt=Math.min(.034,delta/1000);if(time>=this.endAt){this.finish();return;}this.playerUpdate(time);this.fighters.forEach(f=>{if(!f.human)this.botUpdate(f,time);this.fighterUpdate(f,time,dt)});this.shotUpdate(time);if(this.bridge.superPressed){this.bridge.superPressed=false;this.useSuper();}this.bridge.setHud({hp:Math.max(0,Math.round(this.player.hp)),maxHp:this.player.maxHp,ammo:this.player.ammo,super:Math.round(this.player.super),blue:this.blue,red:this.red,time:Math.max(0,Math.ceil((this.endAt-time)/1000))});}
  playerUpdate(time:number){const p=this.player;if(time<p.respawnAt)return;const kx=(this.keys.D?.isDown||this.cursors.right.isDown?1:0)-(this.keys.A?.isDown||this.cursors.left.isDown?1:0),ky=(this.keys.S?.isDown||this.cursors.down.isDown?1:0)-(this.keys.W?.isDown||this.cursors.up.isDown?1:0);let mx=kx||ky?kx:this.bridge.move.x,my=kx||ky?ky:this.bridge.move.y;const m=Math.hypot(mx,my)||1;if(m>1){mx/=m;my/=m;}p.setVelocity(mx*STATS[p.pick].speed,my*STATS[p.pick].speed);if(Math.abs(mx)>.08)p.setFlipX(mx<0);const a=this.bridge.aim,am=Math.hypot(a.x,a.y);if((this.bridge.shooting||this.keys.SPACE?.isDown)&&am>.15)this.fire(p,Math.atan2(a.y,a.x),time);if(this.keys.E?.isDown){this.keys.E.reset();this.useSuper();}}
  botUpdate(f:Fighter,time:number){if(time<f.respawnAt)return;let target:Fighter|undefined;let best=1e9;for(const e of this.fighters){if(e.team===f.team||time<e.respawnAt)continue;const d=Phaser.Math.Distance.Between(f.x,f.y,e.x,e.y);if(d<best){best=d;target=e}}if(!target)return;const a=Phaser.Math.Angle.Between(f.x,f.y,target.x,target.y),pref=STATS[f.pick].range*.58,dir=best>pref?1:best<pref*.55?-.7:0;f.setVelocity(Math.cos(a)*STATS[f.pick].speed*dir,Math.sin(a)*STATS[f.pick].speed*dir);f.setFlipX(Math.cos(a)<0);if(best<STATS[f.pick].range)this.fire(f,a+Phaser.Math.FloatBetween(-.05,.05),time);}
  fighterUpdate(f:Fighter,time:number,dt:number){f.ring.setPosition(f.x,f.y+28).setVisible(time>=f.respawnAt);const label=this.children.list.find((o:any)=>o.getData&&o.getData("owner")===f) as Phaser.GameObjects.Text|undefined;if(label)label.setPosition(f.x,f.y-68).setVisible(time>=f.respawnAt);if(time<f.respawnAt){f.setVisible(false).setVelocity(0,0);return;}if(!f.visible)f.setVisible(true);if(f.ammo<3){f.reload+=dt;if(f.reload>=1.05){f.reload=0;f.ammo++;}}}
  fire(f:Fighter,a:number,time:number){if(time<f.respawnAt||time<f.nextShot||f.ammo<1)return;f.ammo--;f.reload=0;f.nextShot=time+STATS[f.pick].delay;const count=f.pick==="blaze"?3:f.pick==="bunker"?4:f.pick==="vex"?2:1;for(let i=0;i<count;i++){const off=(i-(count-1)/2)*(f.pick==="bunker"?.12:f.pick==="blaze"?.09:.04),aa=a+off;const q=this.add.circle(f.x+Math.cos(aa)*48,f.y+Math.sin(aa)*48,f.pick==="nova"?9:7,f.team==="blue"?0x8fcbff:0xff969c,1).setStrokeStyle(3,0xffffff,.9).setDepth(40) as Shot;this.physics.add.existing(q);q.team=f.team;q.damage=STATS[f.pick].damage/count;q.expires=time+950;(q.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(aa)*900,Math.sin(aa)*900);this.shots.push(q);}if(f.human)sfx.shoot();}
  shotUpdate(time:number){for(let i=this.shots.length-1;i>=0;i--){const q=this.shots[i]!;if(!q.active||time>q.expires||q.x<0||q.y<0||q.x>W||q.y>H){q.destroy();this.shots.splice(i,1);continue;}let hit:Fighter|undefined;for(const f of this.fighters){if(f.team===q.team||time<f.respawnAt)continue;if(Phaser.Math.Distance.Between(q.x,q.y,f.x,f.y)<43){hit=f;break}}if(hit){this.damage(hit,q.damage,time);q.destroy();this.shots.splice(i,1);}}}
  damage(f:Fighter,d:number,time:number){f.hp-=d;f.super=Math.min(100,f.super+18);f.setTintFill(0xffffff);this.time.delayedCall(65,()=>f.active&&f.clearTint());if(f.hp<=0)this.kill(f,time);}
  kill(f:Fighter,time:number){if(f.team==="red")this.blue++;else this.red++;f.respawnAt=time+3000;f.setVisible(false);f.ring.setVisible(false);f.setVelocity(0,0);if(f.human)sfx.kill();this.time.delayedCall(3000,()=>{const arr=SPAWNS[f.team],idx=Math.max(0,this.fighters.filter(x=>x.team===f.team).indexOf(f)),sp=arr[Math.min(idx,2)]!;f.hp=f.maxHp;f.ammo=3;f.setPosition(sp.x,sp.y).setVisible(true);});}
  useSuper(){const p=this.player;if(p.super<100||this.time.now<p.respawnAt)return;p.super=0;sfx.superShot();const r=this.add.circle(p.x,p.y,45,0xffd33c,.24).setStrokeStyle(12,0xfff0a2,.95).setDepth(50);this.tweens.add({targets:r,scale:6,alpha:0,duration:480,onComplete:()=>r.destroy()});this.fighters.forEach(f=>{if(f.team!==p.team&&this.time.now>=f.respawnAt&&Phaser.Math.Distance.Between(p.x,p.y,f.x,f.y)<280)this.damage(f,1700,this.time.now)});}
  finish(){if(this.scene.isPaused())return;this.scene.pause();this.bridge.finish(this.blue>=this.red?"SEGER!":"FÖRLUST");}
}

export function PhaserBrawlerFixed(){
  const mount=useRef<HTMLDivElement>(null),game=useRef<Phaser.Game|null>(null),bridge=useRef<Bridge|null>(null);
  const movePointer=useRef<number|null>(null),aimPointer=useRef<number|null>(null);
  const [phase,setPhase]=useState<"menu"|"game"|"over">("menu"),[pick,setPick]=useState<Pick>("blaze"),[result,setResult]=useState("");
  const [hud,setHud]=useState<Hud>({hp:5600,maxHp:5600,ammo:3,super:0,blue:0,red:0,time:120});
  const arts=useMemo(()=>({blaze:blazeUrl,nova:novaUrl,bunker:bunkerUrl,vex:vexUrl}),[]);
  useEffect(()=>()=>{game.current?.destroy(true);game.current=null},[]);
  const start=()=>{unlockAudio();setPhase("game");setResult("");requestAnimationFrame(()=>{if(!mount.current)return;game.current?.destroy(true);const b:Bridge={pick,move:{x:0,y:0},aim:{x:0,y:-1},shooting:false,superPressed:false,setHud,finish:(r)=>{setResult(r);setPhase("over")}};bridge.current=b;game.current=new Phaser.Game({type:Phaser.CANVAS,parent:mount.current,width:innerWidth,height:innerHeight,backgroundColor:"#6bc9ff",loader:{imageLoadType:"HTMLImageElement"},physics:{default:"arcade",arcade:{debug:false}},scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH},render:{antialias:true,pixelArt:false},scene:new Scene(b)});});};
  const stick=(kind:"move"|"aim")=>{const ptr=kind==="move"?movePointer:aimPointer;const update=(e:React.PointerEvent<HTMLDivElement>)=>{if(ptr.current!==e.pointerId)return;const r=e.currentTarget.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=r.width*.31;let dx=e.clientX-cx,dy=e.clientY-cy,m=Math.hypot(dx,dy)||1,k=Math.min(1,max/m),x=dx*k/max,y=dy*k/max;if(bridge.current){bridge.current[kind]={x,y};if(kind==="aim")bridge.current.shooting=Math.hypot(x,y)>.22}const knob=e.currentTarget.querySelector(".pb-knob") as HTMLElement|null;if(knob)knob.style.transform=`translate(${dx*k}px,${dy*k}px)`;};const end=(e:React.PointerEvent<HTMLDivElement>)=>{if(ptr.current!==e.pointerId)return;ptr.current=null;if(bridge.current){bridge.current[kind]=kind==="aim"?{x:0,y:-1}:{x:0,y:0};if(kind==="aim")bridge.current.shooting=false}const knob=e.currentTarget.querySelector(".pb-knob") as HTMLElement|null;if(knob)knob.style.transform="translate(0,0)";};return{onPointerDown:(e:React.PointerEvent<HTMLDivElement>)=>{e.preventDefault();ptr.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);update(e)},onPointerMove:(e:React.PointerEvent<HTMLDivElement>)=>{e.preventDefault();update(e)},onPointerUp:end,onPointerCancel:end,onLostPointerCapture:end};};
  const pct=Math.max(0,Math.min(100,hud.hp/hud.maxHp*100));
  return <div className="pb-root"><div ref={mount} className="pb-game"/>
    {phase==="menu"&&<div className="pb-menu"><div className="pb-rays"/><div className="pb-logo"><span>ARENA</span><b>AMIGOS</b></div><div className="pb-mode"><strong>CORE CLASH</strong><span>3 mot 3 · snabb arena-action</span></div><div className="pb-select">{(["blaze","nova","bunker","vex"] as Pick[]).map(k=><button key={k} onClick={()=>setPick(k)} className={pick===k?"picked":""}><img src={arts[k]}/><b>{k.toUpperCase()}</b></button>)}</div><div className="pb-hero"><div className="pb-hero-glow"/><img src={arts[pick]}/></div><button className="pb-play" onClick={start}>SPELA</button></div>}
    {phase!=="menu"&&<><div className="pb-hud"><div className="pb-score blue"><b>{hud.blue}</b><span>BLÅ</span></div><div className="pb-timer">{Math.floor(hud.time/60)}:{String(hud.time%60).padStart(2,"0")}</div><div className="pb-score red"><b>{hud.red}</b><span>RÖD</span></div></div><div className="pb-status"><div className="pb-hp"><i style={{width:`${pct}%`}}/></div><b>{Math.round(hud.hp)}</b><div className="pb-ammo">{[0,1,2].map(i=><i key={i} className={i<hud.ammo?"on":""}/>)}</div></div><div className="pb-stick pb-left" {...stick("move")}><div className="pb-knob">✥</div></div><div className="pb-stick pb-right" {...stick("aim")}><div className="pb-knob attack">✦</div></div><button className={`pb-super ${hud.super>=100?"ready":""}`} onPointerDown={e=>{e.preventDefault();if(bridge.current)bridge.current.superPressed=true}}><span>★</span><i style={{height:`${hud.super}%`}}/></button></>}
    {phase==="over"&&<div className="pb-over"><div><h1>{result}</h1><p>BLÅ {hud.blue} – {hud.red} RÖD</p><button onClick={()=>{game.current?.destroy(true);game.current=null;setPhase("menu")}}>TILL MENYN</button></div></div>}
  </div>;
}
