import * as THREE from 'three';
import { createWeapon, createPlayer } from './models-v2.js';
import { WEAPONS } from './config.js';

// ---------- procedural weapon builders ----------
export function makeWeaponWorld(id){ return createWeapon(id); }

export function makeWeaponView(id){
  const w = makeWeaponWorld(id);
  w.scale.setScalar(1.0);
  const holder = new THREE.Group();
  holder.add(w);
  // position gun to bottom-right FPS
  w.position.set(id==='dual'?0:0.28,-0.26,-0.55);
  w.rotation.set(0,-0.04,0);
  holder.userData.basePos = w.position.clone();
  holder.userData.baseRot = w.rotation.clone();
  const sight=w.userData.sight;
  holder.userData.adsPos = new THREE.Vector3(-sight.x,-sight.y,-w.userData.adsEye-sight.z);
  holder.userData.muzzle = w.userData.muzzle;
  holder.userData.muzzles = w.userData.muzzles;
  holder.userData.weapon = w;
  holder.userData.weaponId = id;
  return holder;
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
    mesh.position.y = opts.posY - Math.min(0.6, u.deadT*0.8);
    u.flash.intensity = 0;
    return;
  } else {
    mesh.rotation.x = 0; u.deadT = 0;
  }
  const speed = opts.speed||0;
  u.walkPhase += dt * (2 + speed*1.6);
  const sw = Math.sin(u.walkPhase)*Math.min(0.7, speed*0.09);
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  u.armL.rotation.x = u.gunId==='dual'?-0.5-sw*0.15:-sw*0.7;
  u.armR.rotation.x = -0.5 - (opts.firing?Math.sin(performance.now()*0.06)*0.06:0);
  // lean
  mesh.rotation.z = THREE.MathUtils.clamp(-(opts.strafe||0)*0.12, -0.3, 0.3);
  // jetpack
  const jet = !!opts.jet;
  u.flameL.visible = jet; u.flameR.visible = jet;
  if(jet){
    const s = 0.7+Math.random()*0.6;
    u.flameL.scale.set(1,s,1); u.flameR.scale.set(1,s,1);
    u.jetGlow.intensity = 8;
  } else u.jetGlow.intensity = 0;
  // firing flash
  if(opts.firing){ u.flash.intensity = 12; }
  else u.flash.intensity = Math.max(0, u.flash.intensity - dt*80);
  // airborne pose
  if(opts.airborne){ u.legL.rotation.x=0.35; u.legR.rotation.x=-0.3; }
}

// ---------- FX pool ----------
export class FX {
  constructor(scene){
    this.scene = scene;
    this.tracers = [];
    this.parts = [];
    this.pulses = [];
    this.projectiles = []; // plasma and rocket shots {mesh, vel, life, owner, weapon}
    const geo = new THREE.BufferGeometry();
    this.tracerMat = new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending, depthWrite:false});
  }
  tracer(a, b, color=0x22d3ee, width=0.03, life=0.09){
    const len = a.distanceTo(b);
    if(len<0.1) return;
    const geoC = new THREE.CylinderGeometry(width,width,len,6,1,true);
    geoC.translate(0,len/2,0);
    const m = new THREE.Mesh(geoC, new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.95, blending:THREE.AdditiveBlending, depthWrite:false}));
    m.position.copy(a);
    m.lookAt(b); m.rotateX(Math.PI/2);
    this.scene.add(m);
    this.tracers.push({m, life, max:life});
    if(color===0xffffff || color===0xbfdbfe){
      // rail extra glow
      const m2 = new THREE.Mesh(geoC.clone(), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.6, blending:THREE.AdditiveBlending, depthWrite:false}));
      m2.scale.set(2.5,1,2.5); m2.position.copy(a); m2.lookAt(b); m2.rotateX(Math.PI/2);
      this.scene.add(m2); this.tracers.push({m:m2, life:life*1.6, max:life*1.6});
    }
  }
  impact(p, color=0x22d3ee, n=10, speed=7){
    for(let i=0;i<n;i++){
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.06,0.06),
        new THREE.MeshBasicMaterial({color: Math.random()<0.4?0xffffff:color, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false}));
      s.position.copy(p);
      const v = new THREE.Vector3((Math.random()-0.5),Math.random()*0.9,(Math.random()-0.5)).normalize().multiplyScalar(speed*(0.4+Math.random()*0.8));
      this.scene.add(s);
      this.parts.push({m:s, v, life:0.4+Math.random()*0.3, max:0.6, grav:12});
    }
    const flash = new THREE.PointLight(color, 20, 7);
    flash.position.copy(p); this.scene.add(flash);
    this.pulses.push({m:flash, life:0.12, max:0.12});
  }
  explosion(p, color=0x4ade80){
    this.impact(p, color, 42, 17);
    this.impact(p, 0xffffff, 16, 9);
    const flash = new THREE.PointLight(color, 110, 24);
    flash.position.copy(p); this.scene.add(flash);
    this.pulses.push({m:flash, life:0.38, max:0.38});
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5,12,12),
      new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.7, blending:THREE.AdditiveBlending, depthWrite:false}));
    sphere.position.copy(p); this.scene.add(sphere);
    this.pulses.push({m:sphere, life:0.38, max:0.38, grow:26});
  }
  spawnProjectile(weapon, pos, vel, owner){
    const rocket=weapon==='rocket';
    const color=WEAPONS[weapon].color;
    const m = new THREE.Mesh(new THREE.SphereGeometry(rocket?0.16:0.22,12,12),
      new THREE.MeshBasicMaterial({color}));
    if(rocket){
      m.scale.z=2.5;
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),vel.clone().normalize());
    }
    const glow = new THREE.PointLight(color, rocket?23:14, rocket?12:9);
    m.add(glow); m.position.copy(pos);
    this.scene.add(m);
    this.projectiles.push({mesh:m, vel:vel.clone(), life:WEAPONS[weapon].fuse, bounces:0, owner, weapon});
  }
  spawnPlasma(pos, vel, owner){ this.spawnProjectile('plasma',pos,vel,owner); }
  update(dt){
    for(let i=this.tracers.length-1;i>=0;i--){
      const t=this.tracers[i]; t.life-=dt;
      t.m.material.opacity = Math.max(0, t.life/t.max);
      if(t.life<=0){ this.scene.remove(t.m); t.m.geometry.dispose(); t.m.material.dispose(); this.tracers.splice(i,1); }
    }
    for(let i=this.parts.length-1;i>=0;i--){
      const p=this.parts[i]; p.life-=dt;
      p.v.y -= p.grav*dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.material.opacity = Math.max(0,p.life/p.max);
      p.m.rotation.x+=dt*8; p.m.rotation.y+=dt*6;
      if(p.life<=0){ this.scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); this.parts.splice(i,1); }
    }
    for(let i=this.pulses.length-1;i>=0;i--){
      const p=this.pulses[i]; p.life-=dt;
      if(p.m.isLight) p.m.intensity *= Math.max(0,p.life/p.max);
      else { p.m.material.opacity = Math.max(0,p.life/p.max); if(p.grow) p.m.scale.addScalar(dt*p.grow); }
      if(p.life<=0){
        this.scene.remove(p.m);
        if(p.m.isMesh){ p.m.geometry.dispose(); p.m.material.dispose(); }
        this.pulses.splice(i,1);
      }
    }
  }
}

