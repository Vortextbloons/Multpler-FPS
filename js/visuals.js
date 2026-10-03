import * as THREE from 'three';
import { createWeapon, createPlayer } from './models-v2.js';
import { WEAPONS } from './config.js';
import { reloadPose } from './reload-animation.js';
import { gfx } from './quality.js';

// ---------- procedural weapon builders ----------
export function makeWeaponWorld(id){ return createWeapon(id); }

const sleeveMaterial=new THREE.MeshStandardMaterial({color:0x253941,metalness:0.25,roughness:0.78});
const cuffMaterial=new THREE.MeshStandardMaterial({color:0x607d83,metalness:0.46,roughness:0.5});
const gloveMaterial=new THREE.MeshStandardMaterial({color:0x4b6469,metalness:0.12,roughness:0.82});
const handPlateMaterial=new THREE.MeshStandardMaterial({color:0x90a9ac,metalness:0.48,roughness:0.4});
const armAxis=new THREE.Vector3(0,1,0);

function addArmSegment(group,from,to,radius,material){
  const direction=to.clone().sub(from);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius*0.82,radius,direction.length(),8),material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(armAxis,direction.normalize());
  group.add(mesh);
}

function addGripHand(weapon,side,palm,elbow){
  const wrist=new THREE.Vector3(palm.x+side*0.045,palm.y-0.085,palm.z+0.09);
  addArmSegment(weapon,elbow,wrist,0.115,sleeveMaterial);
  addArmSegment(weapon,wrist.clone().lerp(elbow,0.22),wrist,0.12,cuffMaterial);
  const hand=new THREE.Group();
  hand.position.copy(palm);
  weapon.add(hand);
  const palmMesh=new THREE.Mesh(new THREE.BoxGeometry(0.145,0.115,0.19),gloveMaterial);
  hand.add(palmMesh);
  const plate=new THREE.Mesh(new THREE.BoxGeometry(0.105,0.025,0.14),handPlateMaterial);
  plate.position.set(side*0.01,0.064,-0.005);
  hand.add(plate);
  for(let i=0;i<4;i++){
    const finger=new THREE.Mesh(new THREE.BoxGeometry(0.045,0.09,0.033),gloveMaterial);
    finger.position.set(-side*0.087,-0.055,-0.062+i*0.041);
    finger.rotation.z=side*0.24;
    hand.add(finger);
  }
  const thumb=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.078,0.055),gloveMaterial);
  thumb.position.set(side*0.07,0.005,0.078);
  thumb.rotation.z=-side*0.35;
  hand.add(thumb);
}

function addViewHands(weapon,id){
  if(id==='dual'){
    for(const side of [-1,1]) addGripHand(weapon,side,new THREE.Vector3(side*0.40,-0.17,0.14),new THREE.Vector3(side*0.64,-0.72,0.74));
    return;
  }
  const rocket=id==='rocket';
  addGripHand(weapon,-1,new THREE.Vector3(-0.12,rocket?-0.30:-0.23,rocket?0.38:0.34),new THREE.Vector3(0.47,-0.75,0.78));
  addGripHand(weapon,-1,new THREE.Vector3(rocket?-0.24:-0.15,rocket?-0.13:-0.16,rocket?-0.49:-0.43),new THREE.Vector3(-0.55,-0.69,0.58));
}

export function makeWeaponView(id){
  const w = makeWeaponWorld(id);
  addViewHands(w,id);
  w.scale.setScalar(0.68);
  const holder = new THREE.Group();
  holder.add(w);
  // position gun to bottom-right FPS
  w.position.set(id==='dual'?0:0.29,-0.29,-0.92);
  w.rotation.set(0,-0.04,0);
  holder.userData.basePos = w.position.clone();
  holder.userData.baseRot = w.rotation.clone();
  const sight=w.userData.sight;
  holder.userData.adsPos = new THREE.Vector3(-sight.x*w.scale.x,-sight.y*w.scale.y,-w.userData.adsEye-sight.z*w.scale.z);
  holder.userData.muzzle = w.userData.muzzle;
  holder.userData.muzzles = w.userData.muzzles;
  holder.userData.weapon = w;
  holder.userData.weaponId = id;
  holder.userData.reloadParts=(w.userData.reloadParts||[]).map(part=>({part,position:part.position.clone()}));
  return holder;
}

export function animateWeaponReload(holder, progress){
  const id=holder.userData.weaponId;
  const pose=reloadPose(id,progress);
  const gun=holder.userData.weapon;
  gun.position.x += pose.dip*(id==='rocket'?-0.08:0.10);
  gun.position.y -= pose.dip*0.10;
  gun.position.z -= pose.dip*0.12;
  gun.rotation.x -= pose.dip*0.17;
  gun.rotation.z += pose.roll;
  gun.position.y += pose.seat*0.035;
  holder.userData.reloadParts.forEach(({part,position},i)=>{
    const pull=pose.cells[i]||0;
    part.position.copy(position);
    part.rotation.set(0,0,0);
    if(id==='rocket'){
      part.position.x+=pull*0.32;
      part.position.y-=pull*0.08;
      part.rotation.z=-pull*0.32;
    } else {
      part.position.y-=pull*(id==='dual'?0.10:0.16);
      part.position.z+=pull*0.06;
      part.position.x+=pull*(id==='dual'?(i===0?-0.18:0.18):0.22);
      part.rotation.z+=pull*(id==='dual'?(i===0?-0.28:0.28):0.18);
    }
  });
  return pose;
}

// ---------- player character ----------
export function makeNameSprite(name, color='#fff'){
  const c = document.createElement('canvas'); c.width=256; c.height=64;
  const x = c.getContext('2d');
  x.font='bold 38px Barlow Condensed, sans-serif'; x.textAlign='center'; x.textBaseline='middle';
  x.shadowColor=color; x.shadowBlur=12; x.fillStyle='#fff';
  x.fillText(name.slice(0,14),128,32);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.SpriteMaterial({map:t, transparent:true, depthWrite:false, depthTest:false});
  const s = new THREE.Sprite(m); s.scale.set(1.6,0.4,1); s.position.y=2.25; s.renderOrder=999;
  return s;
}

export function makePlayerMesh(colorHex='#48cfd4', name='BOT'){
  return createPlayer(colorHex, name, makeNameSprite, makeWeaponWorld);
}

export function setPlayerName(mesh, name, colorHex='#22d3ee'){
  const u = mesh.userData;
  if(u.tagName===name) return;
  if(u.tag){
    mesh.remove(u.tag);
    u.tag.material.map?.dispose();
    u.tag.material.dispose();
  }
  u.tag = makeNameSprite(name, colorHex);
  mesh.add(u.tag);
  u.tagName = name;
}

export function setPlayerWeapon(mesh, weaponId){
  const u = mesh.userData;
  if(u.gun){ mesh.remove(u.gun); }
  const gun = makeWeaponWorld(weaponId); gun.scale.setScalar(0.75);
  gun.position.set(weaponId==='dual'?0:0.27,1.13,0.48); gun.rotation.y=Math.PI;
  mesh.add(gun); u.gun = gun; u.gunId=weaponId;
}

export function posePlayer(mesh, opts, dt){
  const u = mesh.userData;
  if(opts.dead){
    u.deadT += dt;
    mesh.rotation.x = -Math.min(1, u.deadT*3)*Math.PI/2*0.9;
    mesh.rotation.z = 0;
    mesh.position.y = opts.posY - Math.min(0.6, u.deadT*0.8);
    u.flash.intensity = 0;
    u.flash.visible = false;
    u.flameL.visible = u.flameR.visible = false;
    u.jetGlow.intensity = 0;
    u.jetGlow.visible = false;
    return;
  } else {
    mesh.rotation.x = 0; u.deadT = 0;
  }
  const speed = opts.speed||0;
  const blend=1-Math.exp(-dt*11);
  u.hitReact=Math.max(0,(u.hitReact||0)-dt*5);
  u.animT+=dt;
  u.walkPhase += dt*(2.5+speed*1.45);
  u.stride=THREE.MathUtils.lerp(u.stride,Math.min(1,speed/7.2),blend);
  u.airBlend=THREE.MathUtils.lerp(u.airBlend,opts.airborne?1:0,blend);
  const stride=Math.sin(u.walkPhase)*0.68*u.stride*(1-u.airBlend);
  const lift=Math.max(0,Math.cos(u.walkPhase))*0.10*u.stride*(1-u.airBlend);
  u.legL.rotation.x=THREE.MathUtils.lerp(u.legL.rotation.x,stride+u.airBlend*0.32,blend);
  u.legR.rotation.x=THREE.MathUtils.lerp(u.legR.rotation.x,-stride-u.airBlend*0.23,blend);
  u.legL.rotation.z=THREE.MathUtils.lerp(u.legL.rotation.z,-u.airBlend*0.10,blend);
  u.legR.rotation.z=THREE.MathUtils.lerp(u.legR.rotation.z,u.airBlend*0.10,blend);
  u.torso.rotation.x=THREE.MathUtils.lerp(u.torso.rotation.x,(opts.jet?-0.10:Math.min(0.07,speed*0.007))-u.hitReact*0.17,blend);
  u.torso.rotation.z=THREE.MathUtils.lerp(u.torso.rotation.z,-(opts.strafe||0)*0.06,blend);
  u.head.rotation.x=THREE.MathUtils.lerp(u.head.rotation.x,THREE.MathUtils.clamp(-(opts.pitch||0)*0.35,-0.25,0.25)+u.hitReact*0.12,blend);
  const firing=!!opts.firing;
  const pulse=firing?Math.max(0,Math.sin(u.animT*55))*0.055:0;
  u.armL.rotation.x=THREE.MathUtils.lerp(u.armL.rotation.x,(u.gunId==='dual'?-0.48:-0.36)-stride*0.25,blend);
  u.armR.rotation.x=THREE.MathUtils.lerp(u.armR.rotation.x,-0.50-pulse+stride*0.12,blend);
  u.gun.rotation.x=THREE.MathUtils.lerp(u.gun.rotation.x,firing?-pulse*0.8:0,blend);
  mesh.rotation.z=THREE.MathUtils.lerp(mesh.rotation.z,THREE.MathUtils.clamp(-(opts.strafe||0)*0.12,-0.3,0.3),blend);
  u.head.position.y=1.72+lift*0.25;
  // jetpack — sine flicker avoids a Math.random call on every posed character
  const jet = !!opts.jet;
  const lights = gfx().actorLights;
  u.flameL.visible = jet; u.flameR.visible = jet;
  if(jet){
    const s = 1 + Math.sin(u.animT * 47) * 0.3;
    u.flameL.scale.set(1,s,1); u.flameR.scale.set(1,s,1);
    u.jetGlow.intensity = lights ? 8 : 0;
    u.jetGlow.visible = lights;
  } else {
    u.jetGlow.intensity = 0;
    u.jetGlow.visible = false;
  }
  if(firing && lights){ u.flash.intensity = Math.max(0,Math.sin(u.animT*55))*12; }
  else u.flash.intensity = lights ? Math.max(0, u.flash.intensity - dt*80) : 0;
  u.flash.visible = u.flash.intensity > 0.05;
}

// ---------- FX pool ----------
// Geometries and materials are reused. High counts match the old per-shot meshes.
const ROCKET_FIT = 0.16 / 0.22;

function additiveMat(color, opacity=1){
  return new THREE.MeshBasicMaterial({color, transparent:true, opacity, blending:THREE.AdditiveBlending, depthWrite:false});
}

export class FX {
  constructor(scene){
    this.scene = scene;
    this.tracers = [];
    this.parts = [];
    this.pulses = [];
    this.projectiles = []; // plasma and rocket shots {mesh, vel, life, owner, weapon}
    this._tracerPool = [];
    this._partPool = [];
    this._burstPool = [];
    this._boomPool = [];
    this._lightPool = [];
    this._projPool = [];
    this._liveExplosionLights = 0;
    this._tracerGeo = new THREE.CylinderGeometry(1,1,1,6,1,true);
    this._tracerGeo.translate(0, 0.5, 0);
    this._partGeo = new THREE.BoxGeometry(0.06,0.06,0.06);
    this._burstGeo = new THREE.SphereGeometry(0.13,10,8);
    this._boomGeo = new THREE.SphereGeometry(0.5,12,12);
    this._projGeo = new THREE.SphereGeometry(0.22,12,12);
    this._nose = new THREE.Vector3(0,0,-1);
    this._aim = new THREE.Vector3();
  }
  _takeTracer(color, opacity){
    let m = this._tracerPool.pop();
    if(!m){
      m = new THREE.Mesh(this._tracerGeo, additiveMat(color, opacity));
      m.frustumCulled = false;
    } else {
      m.material.color.set(color);
      m.material.opacity = opacity;
      m.visible = true;
    }
    return m;
  }
  _giveTracer(entry){
    if(!entry) return;
    this.scene.remove(entry.m);
    entry.m.visible = false;
    this._tracerPool.push(entry.m);
  }
  _spawnTracer(a, b, color, width, len, life, opacity){
    const q = gfx();
    if(this.tracers.length >= q.fxMaxTracers) this._giveTracer(this.tracers.shift());
    const m = this._takeTracer(color, opacity);
    m.scale.set(width, len, width);
    m.position.copy(a);
    m.lookAt(b);
    m.rotateX(Math.PI/2);
    this.scene.add(m);
    this.tracers.push({m, life, max:life});
  }
  _takePart(color){
    let m = this._partPool.pop();
    if(!m){
      m = new THREE.Mesh(this._partGeo, additiveMat(color));
    } else {
      m.material.color.set(color);
      m.material.opacity = 1;
      m.rotation.set(0,0,0);
      m.visible = true;
    }
    return m;
  }
  _takePulseMesh(kind, color, opacity){
    const pool = kind === 'boom' ? this._boomPool : this._burstPool;
    if(!pool) return null;
    let m = pool.pop();
    if(!m){
      const geo = kind === 'boom' ? this._boomGeo : this._burstGeo;
      m = new THREE.Mesh(geo, additiveMat(color, opacity));
      m.userData.pool = pool;
    } else {
      m.material.color.set(color);
      m.material.opacity = opacity;
      m.scale.set(1,1,1);
      m.visible = true;
    }
    this.scene.add(m);
    return m;
  }
  _takeLight(color, intensity, distance){
    let light = this._lightPool.pop();
    if(!light) light = new THREE.PointLight(color, intensity, distance);
    else { light.color.set(color); light.intensity = intensity; light.distance = distance; }
    light.visible = true;
    this.scene.add(light);
    return light;
  }
  _giveLight(light){
    light.intensity = 0;
    light.visible = false;
    this.scene.remove(light);
    this._lightPool.push(light);
  }
  tracer(a, b, color=0x22d3ee, width=0.03, life=0.09){
    const len = a.distanceTo(b);
    if(len<0.1) return;
    this._spawnTracer(a, b, color, width, len, life, 0.95);
    // Rail core stays a second wider beam on High. Low keeps the single tracer.
    if(gfx().id !== 'low' && (color===0xffffff || color===0xbfdbfe)){
      this._spawnTracer(a, b, 0xffffff, width*2.5, len, life*1.6, 0.6);
    }
  }
  impact(p, color=0x22d3ee, n=10, speed=7){
    const q = gfx();
    const count = Math.max(1, Math.round(n * q.fxImpactScale));
    for(let i=0;i<count;i++){
      if(this.parts.length >= q.fxMaxParts) break;
      const s = this._takePart(Math.random()<0.4 ? 0xffffff : color);
      s.position.copy(p);
      const v = new THREE.Vector3((Math.random()-0.5), Math.random()*0.9, (Math.random()-0.5)).normalize().multiplyScalar(speed*(0.4+Math.random()*0.8));
      this.scene.add(s);
      this.parts.push({m:s, v, life:0.4+Math.random()*0.3, max:0.6, grav:12});
    }
    if(!q.fxImpactLight) return;
    const flash = this._takeLight(color, 20, 7);
    flash.position.copy(p);
    this.pulses.push({m:flash, life:0.12, max:0.12});
  }
  hitBurst(p, head=false){
    const color=head?0xf0ab66:0xff706f;
    this.impact(p,color,head?12:7,head?8:6);
    const pulse=this._takePulseMesh('burst', color, 0.56);
    pulse.position.copy(p);
    this.pulses.push({m:pulse,life:0.2,max:0.2,grow:5});
  }
  explosion(p, color=0x4ade80){
    const q = gfx();
    this.impact(p, color, 42, 17);
    this.impact(p, 0xffffff, 16, 9);
    if(q.fxExplosionLight && this._liveExplosionLights < q.fxMaxExplosionLights){
      const flash = this._takeLight(color, 110, 24);
      flash.position.copy(p);
      this._liveExplosionLights++;
      this.pulses.push({m:flash, life:0.38, max:0.38, explosion:true});
    }
    const sphere = this._takePulseMesh('boom', color, 0.7);
    sphere.position.copy(p);
    this.pulses.push({m:sphere, life:0.38, max:0.38, grow:26});
  }
  spawnProjectile(weapon, pos, vel, owner){
    const rocket=weapon==='rocket';
    const color=WEAPONS[weapon].color;
    const q=gfx();
    const m=this._takeProjectile();
    m.material.color.set(color);
    if(rocket){
      m.scale.set(ROCKET_FIT, ROCKET_FIT, ROCKET_FIT*2.5);
      this._aim.copy(vel).normalize();
      m.quaternion.setFromUnitVectors(this._nose, this._aim);
    } else {
      m.scale.set(1,1,1);
      m.quaternion.identity();
    }
    const glow=m.userData.light;
    if(q.fxProjectileLight){
      glow.color.set(color);
      glow.intensity=rocket?23:14;
      glow.distance=rocket?12:9;
      glow.visible=true;
    } else {
      glow.intensity=0;
      glow.visible=false;
    }
    m.position.copy(pos);
    this.scene.add(m);
    this.projectiles.push({mesh:m, vel:vel.clone(), life:WEAPONS[weapon].fuse, bounces:0, owner, weapon});
  }
  _takeProjectile(){
    let m=this._projPool.pop();
    if(!m){
      m=new THREE.Mesh(this._projGeo, new THREE.MeshBasicMaterial());
      const light=new THREE.PointLight(0xffffff,0,1);
      light.visible=false;
      m.add(light);
      m.userData.light=light;
    }
    m.userData.inPool=false;
    m.visible=true;
    return m;
  }
  releaseProjectile(mesh){
    if(!mesh || mesh.userData.inPool) return;
    mesh.userData.inPool=true;
    const light=mesh.userData.light;
    if(light){ light.visible=false; light.intensity=0; }
    mesh.visible=false;
    this.scene.remove(mesh);
    this._projPool.push(mesh);
  }
  spawnPlasma(pos, vel, owner){ this.spawnProjectile('plasma',pos,vel,owner); }
  update(dt){
    for(let i=this.tracers.length-1;i>=0;i--){
      const t=this.tracers[i]; t.life-=dt;
      t.m.material.opacity = Math.max(0, t.life/t.max);
      if(t.life<=0){ this._giveTracer(t); this.tracers.splice(i,1); }
    }
    for(let i=this.parts.length-1;i>=0;i--){
      const p=this.parts[i]; p.life-=dt;
      p.v.y -= p.grav*dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.material.opacity = Math.max(0,p.life/p.max);
      p.m.rotation.x+=dt*8; p.m.rotation.y+=dt*6;
      if(p.life<=0){
        this.scene.remove(p.m);
        p.m.visible=false;
        this._partPool.push(p.m);
        this.parts.splice(i,1);
      }
    }
    for(let i=this.pulses.length-1;i>=0;i--){
      const p=this.pulses[i]; p.life-=dt;
      if(p.m.isLight) p.m.intensity *= Math.max(0,p.life/p.max);
      else { p.m.material.opacity = Math.max(0,p.life/p.max); if(p.grow) p.m.scale.addScalar(dt*p.grow); }
      if(p.life<=0){
        if(p.m.isLight){
          if(p.explosion) this._liveExplosionLights=Math.max(0, this._liveExplosionLights-1);
          this._giveLight(p.m);
        } else if(p.m.userData.pool){
          this.scene.remove(p.m);
          p.m.visible=false;
          p.m.scale.set(1,1,1);
          p.m.userData.pool.push(p.m);
        }
        this.pulses.splice(i,1);
      }
    }
  }
}

