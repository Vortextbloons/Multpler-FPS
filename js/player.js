import * as THREE from 'three';
import { MOVE, WEAPONS } from './config.js';
import { collideCircle, groundHeight, ARENA } from './arena.js';

export class LocalPlayer {
  constructor(){
    this.pos = new THREE.Vector3(0,1,20);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.jumps = 0;
    this.fuel = MOVE.fuelMax;
    this.jetting = false;
    this.health = 100;
    this.alive = true;
    this.owned = new Set(['pulse']);
    this.current = 'pulse';
    this.mag = {}; this.reserve = {};
    for(const k in WEAPONS) { this.mag[k]=WEAPONS[k].mag; this.reserve[k]=Infinity; }
    this.cooldown = 0; this.reloadT = 0; this.reloading = false;
    this.ads = 0; this.adsTarget = 0;
    this.recoil = 0; this.recoilPitch = 0;
    this.slideT = 0; this.sliding = false;
    this.crouch = false;
    this.firing = false;
    this.respawnT = 0;
    this.strafe = 0;
    this.speed2d = 0;
  }
  giveWeapon(id){
    if(this.owned.has(id)){
      this.mag[id] = WEAPONS[id].mag; // refill
      return false;
    }
    this.owned.add(id);
    this.mag[id] = WEAPONS[id].mag;
    return true;
  }
  resetLoadout(){
    this.owned = new Set(['pulse']);
    this.current = 'pulse';
    this.mag.pulse = WEAPONS.pulse.mag;
    this.reloading = false;
    this.reloadT = 0;
    this.cooldown = 0;
  }
  switchTo(id){
    if(!this.owned.has(id) || this.reloading) return false;
    if(this.current===id) return false;
    this.current=id; this.cooldown=Math.max(this.cooldown,0.18);
    this.reloading=false; this.reloadT=0;
    return true;
  }
  startReload(){
    const w = WEAPONS[this.current];
    if(this.reloading || this.mag[this.current]>=w.mag) return false;
    this.reloading=true; this.reloadT=w.reload;
    return true;
  }
  eyePos(){
    const c = this.crouch?0.35:0;
    return new THREE.Vector3(this.pos.x, this.pos.y + MOVE.eye - c, this.pos.z);
  }
  forward(){
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw)*cp, Math.sin(this.pitch), -Math.cos(this.yaw)*cp);
  }
  update(dt, input){
    const w = WEAPONS[this.current];
    // timers
    if(this.cooldown>0) this.cooldown-=dt;
    if(this.reloading){
      this.reloadT-=dt;
      if(this.reloadT<=0){ this.reloading=false; this.mag[this.current]=w.mag; }
    }
    // ADS lerp
    const aimTime=w.adsTime*(this.adsTarget?1:0.8);
    this.ads += ((this.adsTarget?1:0)-this.ads)*(1-Math.exp(-dt*2.8/aimTime));
    this.ads = THREE.MathUtils.clamp(this.ads,0,1);
    // recoil decay
    this.recoil = Math.max(0, this.recoil - dt*0.12);
    this.recoilPitch = Math.max(0, this.recoilPitch - dt*0.5);

    if(!this.alive){
      this.respawnT-=dt;
      this.vel.set(0,0,0);
      return;
    }

    // wish dir
    const f = (input.f?1:0)-(input.b?1:0);
    const s = (input.r?1:0)-(input.l?1:0);
    this.strafe = s;
    const sin=Math.sin(this.yaw), cos=Math.cos(this.yaw);
    let wx = (-sin*f + cos*s), wz = (-cos*f - sin*s);
    const wl = Math.hypot(wx,wz)||1; wx/=wl; wz/=wl;
    const sprinting = input.sprint && f>0 && !this.adsTarget && !this.sliding;
    const speed = this.sliding? MOVE.sprint+MOVE.slideBoost : (sprinting?MOVE.sprint:MOVE.walk) * (this.adsTarget?0.55:1) * (this.crouch?0.5:1);
    this.speed2d = Math.hypot(this.vel.x,this.vel.z);

    // slide
    if(input.slidePressed && sprinting && this.onGround){
      this.sliding=true; this.slideT=0.55;
      const boost = new THREE.Vector3(wx,0,wz).multiplyScalar(MOVE.slideBoost);
      this.vel.x+=boost.x; this.vel.z+=boost.z;
    }
    if(this.sliding){ this.slideT-=dt; if(this.slideT<=0||!this.onGround) this.sliding=false; }

    // ground check
    const g = groundHeight(this.pos, ARENA.colliders);
    const wasGround = this.onGround;
    if(this.pos.y <= g+0.02 && this.vel.y<=0.1){
      this.pos.y=g; this.vel.y=0; this.onGround=true; this.jumps=0;
    } else {
      this.onGround=false;
    }
    if(wasGround && !this.onGround && this.vel.y<=0.1){
      // walked off edge — allow 1 jump (coyote-ish double still available)
      this.jumps=Math.max(this.jumps,0);
    }

    // jumping / jetpack
    this.jetting=false;
    if(input.jumpPressed){
      if(this.onGround){
        this.vel.y=MOVE.jump; this.onGround=false; this.jumps=1;
        input.jumpPressed=false; this.lastJumpSfx=true;
      } else if(this.jumps<2){
        this.vel.y=MOVE.doubleJump; this.jumps=2;
        input.jumpPressed=false; this.lastDoubleSfx=true;
      }
    }
    if(input.jumpHeld && !this.onGround && this.jumps>=1 && this.fuel>0){
      // jetpack
      const boostTime=Math.min(dt, this.fuel/MOVE.fuelDrain);
      this.vel.y += MOVE.jetThrust*boostTime;
      if(this.vel.y>MOVE.jetMaxSpeed) this.vel.y=MOVE.jetMaxSpeed;
      this.fuel=Math.max(0, this.fuel-MOVE.fuelDrain*boostTime);
      this.jetting=true;
      input.jumpPressed=false;
    }

    // jump pads
    for(const pad of ARENA.jumpPads){
      const d=Math.hypot(this.pos.x-pad.pos.x, this.pos.z-pad.pos.z);
      if(d<pad.radius && Math.abs(this.pos.y-pad.pos.y)<1.5){
        this.vel.y=pad.power; this.jumps=1; this.onGround=false;
        this.lastPad=true;
      }
    }
    if(this.onGround) this.fuel=Math.min(MOVE.fuelMax, this.fuel+MOVE.fuelMax*dt/MOVE.fuelRechargeTime);

    // accel
    const accel = this.onGround?MOVE.accelGround:MOVE.accelAir;
    if(f!==0||s!==0){
      this.vel.x += wx*accel*dt;
      this.vel.z += wz*accel*dt;
      // clamp horizontal to speed (allow slide momentum decay)
      const h=Math.hypot(this.vel.x,this.vel.z);
      const maxS = speed + (this.sliding?4:0);
      if(h>maxS && this.onGround){
        const k = THREE.MathUtils.lerp(h, maxS, Math.min(1,dt* (this.sliding?1.2:10)));
        this.vel.x*=k/h; this.vel.z*=k/h;
      } else if(h>maxS+3 && !this.onGround){
        this.vel.x*= (1-dt*0.2); this.vel.z*=(1-dt*0.2);
      }
    } else if(this.onGround){
      const damp = Math.max(0,1-dt*10);
      this.vel.x*=damp; this.vel.z*=damp;
    } else {
      const airDamp=Math.max(0,1-dt*MOVE.airDrag);
      this.vel.x*=airDamp; this.vel.z*=airDamp;
    }

    // gravity
    const gravityScale=this.jetting?MOVE.jetGravityScale:(this.vel.y<0?MOVE.fallGravityScale:1);
    this.vel.y -= MOVE.gravity*gravityScale*dt;
    if(this.vel.y<-30) this.vel.y=-30;

    // integrate
    this.pos.x += this.vel.x*dt;
    this.pos.z += this.vel.z*dt;
    this.pos.y += this.vel.y*dt;

    // collide XZ
    collideCircle(this.pos, MOVE.radius, ARENA.colliders);

    // ceiling / landing on top of boxes: if falling and penetrated, snap
    const g2 = groundHeight(this.pos, ARENA.colliders);
    if(this.pos.y < g2){ this.pos.y=g2; if(this.vel.y<0) this.vel.y=0; this.onGround=true; this.jumps=0; }
    if(this.pos.y<0){ this.pos.y=0; this.vel.y=0; this.onGround=true; this.jumps=0; }

    // bounds
    const B=ARENA.bounds;
    this.pos.x=THREE.MathUtils.clamp(this.pos.x,-B,B);
    this.pos.z=THREE.MathUtils.clamp(this.pos.z,-B,B);
    if(this.pos.y>26) this.pos.y=26;

    // crouch flag
    this.crouch = !!input.crouch;
    this.firing = !!input.firing;
  }
  canFire(){
    if(!this.alive||this.reloading||this.cooldown>0) return false;
    if(this.mag[this.current]<=0){ return false; }
    return true;
  }
  consumeShot(){
    const w=WEAPONS[this.current];
    this.mag[this.current]--;
    this.cooldown = 60/w.rpm;
    // recoil
    this.recoil = Math.min(0.09, this.recoil + w.kick*(1-this.ads*0.4));
    this.recoilPitch += w.kick*0.5;
    if(this.mag[this.current]<=0){ /* auto reload handled by game */ }
  }
}
