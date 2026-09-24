import * as THREE from 'three';
import { MOVE, WEAPONS, WEAPON_ORDER } from './config.js';
import { ARENA, collideCircle, groundHeight, pickSpawn } from './arena.js';

const BOT_DEFS = [
  { name:'VEX-9',   color:'#fb7185', skill:0.85, aggro:0.9,  pref:'rail' },
  { name:'HEX-01',  color:'#a78bfa', skill:0.7,  aggro:0.5,  pref:'plasma' },
  { name:'JOLT',    color:'#fbbf24', skill:0.6,  aggro:0.95, pref:'dual' },
  { name:'MIRA',    color:'#4ade80', skill:0.75, aggro:0.6,  pref:'storm' },
  { name:'ORBIT',   color:'#38bdf8', skill:0.5,  aggro:0.4,  pref:'pulse' },
  { name:'PYRE',    color:'#f97316', skill:0.65, aggro:0.8,  pref:'rocket' },
  { name:'NULL',    color:'#e879f9', skill:0.9,  aggro:0.7,  pref:'rail' },
];

function losClear(a, b){
  // segment vs AABB (ignore thin floors below both points)
  const dir = new THREE.Vector3().subVectors(b,a);
  const len = dir.length(); dir.normalize();
  for(const c of ARENA.colliders){
    // skip ground slab
    if(c.max.y<=0.2) continue;
    let tmin=0, tmax=len, ok=true;
    for(const ax of ['x','y','z']){
      const o=a[ax], d=dir[ax];
      const mn=c.min[ax], mx=c.max[ax];
      if(Math.abs(d)<1e-8){ if(o<mn||o>mx){ok=false;break;} }
      else {
        let t1=(mn-o)/d, t2=(mx-o)/d;
        if(t1>t2){const t=t1;t1=t2;t2=t;}
        tmin=Math.max(tmin,t1); tmax=Math.min(tmax,t2);
        if(tmin>tmax){ok=false;break;}
      }
    }
    if(ok && tmin>0.5 && tmin<len-0.6) return false;
  }
  return true;
}

export class Bot {
  constructor(def, idx){
    this.id = 'bot_'+idx+'_'+def.name;
    this.name = def.name; this.color = def.color;
    this.skill = def.skill; this.aggro = def.aggro; this.pref = def.pref;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw=0; this.pitch=0;
    this.health=100; this.alive=true;
    this.owned=new Set(['pulse']); this.current='pulse';
    this.mag={}; for(const k in WEAPONS) this.mag[k]=WEAPONS[k].mag;
    this.cooldown=Math.random(); this.reloadT=0; this.reloading=false;
    this.respawnT=0; this.kills=0; this.deaths=0; this.streak=0; this.best=0;
    this.navTarget=new THREE.Vector3((Math.random()-0.5)*40,0,(Math.random()-0.5)*40);
    this.repathT=0; this.strafeDir=Math.random()<0.5?-1:1; this.strafeT=1+Math.random()*2;
    this.jumpCd=0; this.fuel=MOVE.fuelMax; this.jetting=false; this.firing=false;
    this.aimErr=new THREE.Vector2(); this.aimT=0;
    this.enemy=null; this.reactionT=0; this.burstN=0; this.burstT=0;
    this.speedMul=0.85+this.skill*0.25;
    const s=pickSpawn([]); this.pos.copy(s.pos); this.yaw=s.yaw;
    this.onGround=true; this.jumps=0;
    this.mesh=null;
    this.wanderT=Math.random()*3;
  }
  giveWeapon(id){ if(!this.owned.has(id)){this.owned.add(id); this.mag[id]=WEAPONS[id].mag; return true;} this.mag[id]=WEAPONS[id].mag; return false; }
  resetLoadout(){
    this.owned = new Set(['pulse']);
    this.current = 'pulse';
    this.mag.pulse = WEAPONS.pulse.mag;
    this.reloading = false;
    this.reloadT = 0;
    this.cooldown = 0;
  }
  eye(){ return new THREE.Vector3(this.pos.x, this.pos.y+1.62, this.pos.z); }

  update(dt, ctx){
    // timers
    if(this.cooldown>0) this.cooldown-=dt;
    if(this.reloading){ this.reloadT-=dt; if(this.reloadT<=0){this.reloading=false; this.mag[this.current]=WEAPONS[this.current].mag;} }

    if(!this.alive){
      this.respawnT-=dt; this.firing=false; this.jetting=false;
      this.enemy=null;
      if(this.respawnT<=0){
        const avoid=[ctx.local.pos, ...ctx.bots.filter(b=>b!==this&&b.alive).map(b=>b.pos)];
        const s=pickSpawn(avoid);
        this.pos.copy(s.pos); this.vel.set(0,0,0);
        this.health=100; this.alive=true; this.yaw=s.yaw; this.fuel=MOVE.fuelMax;
        if(ctx.onRespawn) ctx.onRespawn(this);
      }
      return null;
    }

    // --- perception ---
    let best=null, bestD=55;
    const candidates=[];
    if(ctx.local.alive && !ctx.local.isSpectate) candidates.push({p:ctx.local.pos, ref:ctx.local, isLocal:true});
    for(const b of ctx.bots){ if(b!==this&&b.alive) candidates.push({p:b.pos, ref:b, isLocal:false}); }
    for(const c of candidates){
      const d=this.pos.distanceTo(c.p);
      if(d<bestD){
        const eyeA=this.eye(), eyeB=new THREE.Vector3(c.p.x,c.p.y+1.4,c.p.z);
        if(d<12 || losClear(eyeA,eyeB)){ best=c; bestD=d; }
      }
    }
    if(best?.ref!==this.enemy?.ref){
      this.reactionT=best ? 0.3+(1-this.skill)*0.8 : 0;
      this.burstN=0;
      this.burstT=0;
    }
    this.enemy=best;
    this.reactionT=Math.max(0,this.reactionT-dt);

    // --- weapon desire ---
    if(!this.enemy || bestD>18){
      // seek preferred pickup if not owned
      if(!this.owned.has(this.pref)){
        const spot = ctx.pickups.find(p=>p.weapon===this.pref && p.available);
        if(spot){ this.navTarget.copy(spot.pos); }
      } else if(this.wanderT<=0 || this.pos.distanceTo(this.navTarget)<2.5){
        this.wanderT=2+Math.random()*4;
        // prefer nav points near weapons / heights if aggressive
        const pool = ARENA.navPoints;
        const aggressionBias = Math.random()<this.aggro? ctx.pickups.filter(p=>p.available).map(p=>p.pos) : [];
        const arr = aggressionBias.length? aggressionBias : pool;
        this.navTarget.copy(arr[Math.floor(Math.random()*arr.length)]);
        if(Math.random()<0.3) this.strafeDir*=-1;
      }
    }

    let moveTarget=this.navTarget.clone();
    let wantFire=false, aimPoint=null;

    if(this.enemy){
      const ep=this.enemy.p;
      aimPoint=new THREE.Vector3(ep.x, ep.y+1.2, ep.z);
      const ideal = this.current==='scatter'?6 : this.current==='storm'?12 : this.current==='dual'?13 : this.current==='plasma'?14 : this.current==='rocket'?23 : this.current==='rail'?26 : 16;
      // switch to best owned for range
      if(this.cooldown<=0 && Math.random()<dt*0.8){
        let bestW=this.current, bestScore=-1;
        for(const id of this.owned){
          const ww=WEAPONS[id];
          const rangeScore = id==='scatter'? Math.max(0,1-bestD/20) : id==='rail'? Math.min(1,bestD/25) : id==='rocket'?Math.min(0.85,bestD/16):id==='dual'?Math.max(0.2,1-bestD/42):0.6;
          const s2=rangeScore+ (id===this.pref?0.2:0) + Math.random()*0.1;
          if(s2>bestScore){bestScore=s2;bestW=id;}
        }
        if(bestW!==this.current && !this.reloading){ this.current=bestW; this.cooldown=Math.max(this.cooldown,0.3); }
      }
      const w=WEAPONS[this.current];
      // combat strafe orbit
      this.strafeT-=dt;
      if(this.strafeT<=0){ this.strafeT=0.8+Math.random()*1.8; if(Math.random()<0.6) this.strafeDir*=-1; }
      const toE=new THREE.Vector3().subVectors(this.pos, ep); toE.y=0;
      const dist=toE.length()||1; toE.normalize();
      const side=new THREE.Vector3(-toE.z,0,toE.x).multiplyScalar(this.strafeDir);
      const radial = dist>ideal+3? toE.clone().multiplyScalar(-1) : dist<ideal-3? toE.clone() : new THREE.Vector3();
      moveTarget=this.pos.clone().add(side.multiplyScalar(2.5)).add(radial.multiplyScalar(2));
      // vertical play: sometimes head for high ground or jetpack
      if(Math.random()<dt*0.15 && this.pos.y<6){ moveTarget.set(-14,0,-14); }
      // aim with error
      this.aimT-=dt;
      if(this.aimT<=0){ this.aimT=0.4+Math.random()*0.5; const e=0.025+(1-this.skill)*0.1; this.aimErr.set((Math.random()-0.5)*2*e,(Math.random()-0.5)*2*e); }
      const eyeA=this.eye();
      const dir=new THREE.Vector3().subVectors(aimPoint,eyeA).normalize();
      dir.x+=this.aimErr.x; dir.y+=this.aimErr.y; dir.normalize();
      const yawT=Math.atan2(-dir.x,-dir.z), pitchT=Math.asin(THREE.MathUtils.clamp(dir.y,-1,1));
      const turn=2.5+this.skill*2.5;
      this.yaw += THREE.MathUtils.clamp(((yawT-this.yaw+Math.PI*3)%(Math.PI*2))-Math.PI,-turn*dt,turn*dt);
      this.pitch += THREE.MathUtils.clamp(pitchT-this.pitch,-turn*dt,turn*dt);
      // fire decision — bursts, reaction delay by skill
      this.burstT-=dt;
      const visible = losClear(eyeA, aimPoint);
      const inRange = bestD < w.range*1.1;
      const aimGood = Math.abs(yawT-this.yaw)<0.12 && Math.abs(pitchT-this.pitch)<0.1;
      if(this.reactionT<=0 && visible && inRange && aimGood && this.mag[this.current]>0 && !this.reloading){
        if(this.burstN<=0 && this.burstT<=0){
          this.burstN = w.auto? 4+Math.floor(Math.random()*8) : 1;
          this.burstT = 0.5+Math.random()*1.2*(1.3-this.skill);
        }
        if(this.burstN>0 && this.cooldown<=0){ wantFire=true; }
      }
      // dodge jumps
      this.jumpCd-=dt;
      if(this.jumpCd<=0 && bestD<20 && Math.random()<dt*(0.6+this.skill)){
        this.vel.y = MOVE.jump; this.jumps=1; this.jumpCd=1+Math.random()*2;
      }
    } else {
      // navigate — face movement
      this.wanderT-=dt;
      const d=new THREE.Vector3().subVectors(moveTarget,this.pos); d.y=0;
      if(d.length()>0.5){
        const yawT=Math.atan2(-d.x,-d.z);
        this.yaw += THREE.MathUtils.clamp(((yawT-this.yaw+Math.PI*3)%(Math.PI*2))-Math.PI,-3*dt,3*dt);
      }
      this.pitch*= (1-Math.min(1,dt*4));
      this.jumpCd-=dt;
    }

    // --- movement physics (simplified) ---
    const toT=new THREE.Vector3().subVectors(moveTarget,this.pos); toT.y=0;
    const distT=toT.length();
    let sp=(this.enemy?6.5:5.2)*this.speedMul;
    if(distT>0.4){ toT.normalize(); } else toT.set(0,0,0);
    const accel=this.onGround?40:16;
    this.vel.x += toT.x*sp*accel*dt*0.12;
    this.vel.z += toT.z*sp*accel*dt*0.12;
    const h=Math.hypot(this.vel.x,this.vel.z);
    if(h>sp){ this.vel.x*=sp/h; this.vel.z*=sp/h; }
    if(distT<0.6){ this.vel.x*= (1-Math.min(1,dt*4)); this.vel.z*=(1-Math.min(1,dt*4)); }

    // vertical: jump/jet if target higher or stuck
    const g=groundHeight(this.pos, ARENA.colliders);
    if(this.pos.y<=g+0.05 && this.vel.y<=0.1){ this.pos.y=g; this.vel.y=0; this.onGround=true; this.jumps=0; }
    else { this.onGround=false; }
    this.jetting=false;
    const dy = moveTarget.y - this.pos.y;
    if(this.fuel>0 && ((!this.onGround && this.pos.y<moveTarget.y-1) || (this.enemy && this.pos.y<this.enemy.p.y-2 && Math.random()<dt*2))){
      const boostTime=Math.min(dt, this.fuel/MOVE.fuelDrain);
      this.vel.y += MOVE.jetThrust*boostTime;
      if(this.vel.y>MOVE.jetMaxSpeed) this.vel.y=MOVE.jetMaxSpeed;
      this.fuel=Math.max(0, this.fuel-MOVE.fuelDrain*boostTime);
      this.jetting=true;
    }
    // auto-jump if blocked (low speed but wants to move)
    if(this.onGround && distT>2 && h<1.2 && this.jumpCd<=0){ this.vel.y=MOVE.jump; this.onGround=false; this.jumpCd=1; }
    if(!this.onGround && Math.abs(dy)>2 && this.jumpCd<=0 && this.jumps<1 && this.vel.y<=0.5){ this.vel.y=MOVE.doubleJump; this.jumps=1; this.jumpCd=1.2; }
    if(this.onGround && !this.jetting) this.fuel=Math.min(MOVE.fuelMax, this.fuel+MOVE.fuelMax*dt/MOVE.fuelRechargeTime);

    const gravityScale=this.jetting?MOVE.jetGravityScale:(this.vel.y<0?MOVE.fallGravityScale:1);
    this.vel.y -= MOVE.gravity*gravityScale*dt;
    this.pos.x+=this.vel.x*dt; this.pos.z+=this.vel.z*dt; this.pos.y+=this.vel.y*dt;
    collideCircle(this.pos, 0.42, ARENA.colliders);
    const g2=groundHeight(this.pos, ARENA.colliders);
    if(this.pos.y<g2){this.pos.y=g2; this.vel.y=0; this.onGround=true; this.jumps=0;}
    if(this.pos.y<0){this.pos.y=0; this.vel.y=0; this.onGround=true;}
    this.pos.x=THREE.MathUtils.clamp(this.pos.x,-ARENA.bounds,ARENA.bounds);
    this.pos.z=THREE.MathUtils.clamp(this.pos.z,-ARENA.bounds,ARENA.bounds);

    // jump pads
    for(const pad of ARENA.jumpPads){
      if(Math.hypot(this.pos.x-pad.pos.x,this.pos.z-pad.pos.z)<pad.radius && Math.abs(this.pos.y-pad.pos.y)<1.5){
        this.vel.y=pad.power; this.onGround=false;
      }
    }

    // pickup check
    for(const p of ctx.pickups){
      if(p.available && this.pos.distanceTo(p.pos)<1.6){
        if(p.weapon!==this.current || !this.owned.has(p.weapon)){
          this.giveWeapon(p.weapon);
          if(ctx.onPickup) ctx.onPickup(this, p);
          if(p.weapon===this.pref || Math.random()<0.5){ this.current=p.weapon; }
        }
      }
    }

    // firing output
    this.firing=false;
    if(wantFire){
      if(this.mag[this.current]<=0){
        if(!this.reloading){ this.reloading=true; this.reloadT=WEAPONS[this.current].reload; }
        return null;
      }
      if(this.cooldown>0) return null;
      this.cooldown=1.25*60/WEAPONS[this.current].rpm;
      this.mag[this.current]--;
      this.burstN--;
      if(this.mag[this.current]<=0 && !this.reloading){ this.reloading=true; this.reloadT=WEAPONS[this.current].reload; }
      this.firing=true;
      const eyeA=this.eye();
      const dir=new THREE.Vector3(-Math.sin(this.yaw)*Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw)*Math.cos(this.pitch));
      return { fired:true, origin:eyeA, dir, weapon:this.current, owner:this };
    }
    return null;
  }
}

export function makeBots(){
  return BOT_DEFS.map((d,i)=>new Bot(d,i));
}
