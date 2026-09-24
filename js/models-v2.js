import * as THREE from 'three';

// The foundry's equipment uses broad ceramic shells, exposed mechanisms and one
// readable energy path per weapon. All geometry is procedural and ships with the game.
const shell = new THREE.MeshStandardMaterial({color:0x4b6470, metalness:0.58, roughness:0.37});
const shellLight = new THREE.MeshStandardMaterial({color:0x90a9ac, metalness:0.52, roughness:0.34});
const inset = new THREE.MeshStandardMaterial({color:0x142630, metalness:0.64, roughness:0.44});
const grip = new THREE.MeshStandardMaterial({color:0x18272b, metalness:0.12, roughness:0.88});
const brass = new THREE.MeshStandardMaterial({color:0xb48b55, metalness:0.78, roughness:0.32});

function emitter(color){ return new THREE.MeshStandardMaterial({color, emissive:color, emissiveIntensity:2.1, metalness:0.2, roughness:0.23}); }
function add(group, geo, material, x=0,y=0,z=0, rx=0,ry=0,rz=0){
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x,y,z); mesh.rotation.set(rx,ry,rz);
  mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh);
  return mesh;
}
function box(g,m,w,h,d,x=0,y=0,z=0,rx=0,ry=0,rz=0){ return add(g,new THREE.BoxGeometry(w,h,d),m,x,y,z,rx,ry,rz); }
function tube(g,m,r1,r2,len,x,y,z,rx=Math.PI/2,ry=0,rz=0,sides=12){
  return add(g,new THREE.CylinderGeometry(r1,r2,len,sides),m,x,y,z,rx,ry,rz);
}
function ring(g,m,r,thick,x,y,z){ return add(g,new THREE.TorusGeometry(r,thick,7,24),m,x,y,z); }
function edge(g,m,z,w=0.27){
  box(g,m,w,0.024,0.09,0,0.132,z);
  box(g,m,0.022,0.095,0.09,-w/2,0.077,z);
  box(g,m,0.022,0.095,0.09,w/2,0.077,z);
}
function reflex(g,color,y,z,width,height){
  const glow=new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.9,depthWrite:false});
  const glass=new THREE.MeshBasicMaterial({color:0x83d6d0,transparent:true,opacity:0.11,depthWrite:false,side:THREE.DoubleSide});
  box(g,inset,width+0.075,0.055,0.22,0,y-height/2-0.035,z+0.04);
  for(const x of [-1,1]) box(g,shellLight,0.025,height,0.035,x*width/2,y,z);
  box(g,shellLight,width+0.02,0.025,0.035,0,y+height/2,z);
  add(g,new THREE.PlaneGeometry(width-0.03,height-0.025),glass,0,y,z+0.002).castShadow=false;
  ring(g,glow,0.008,0.0018,0,y,z+0.005).castShadow=false;
  box(g,glow,0.002,0.011,0.002,0,y+0.018,z+0.008).castShadow=false;
  return new THREE.Vector3(0,y,z);
}

function createDualPistols(){
  const g=new THREE.Group();
  const glow=emitter(0xffd166);
  const muzzles=[];
  for(const side of [-1,1]){
    const p=new THREE.Group();
    p.position.set(side*0.29,-0.035,0);
    p.rotation.y=side*0.075;
    g.add(p);
    // A stepped slide, vented barrel and exposed power cell make each pistol readable.
    box(p,inset,0.19,0.14,0.54,0,0,-0.13);
    box(p,shellLight,0.22,0.105,0.43,0,0.09,-0.12);
    box(p,shell,0.245,0.065,0.27,0,0.16,-0.05);
    box(p,brass,0.25,0.045,0.12,0,0.11,-0.32);
    for(const x of [-1,1]){
      box(p,shell,0.035,0.115,0.36,x*0.125,0.02,-0.13);
      box(p,glow,0.012,0.027,0.23,x*0.146,0.045,-0.16);
    }
    tube(p,inset,0.068,0.068,0.25,0,0.015,-0.49);
    tube(p,brass,0.082,0.082,0.045,0,0.015,-0.64);
    ring(p,glow,0.055,0.011,0,0.015,-0.669);
    box(p,grip,0.13,0.3,0.15,0,-0.19,0.10,-0.18);
    box(p,brass,0.15,0.04,0.17,0,-0.35,0.12);
    box(p,inset,0.095,0.2,0.12,0,-0.29,-0.09,0.12);
    box(p,glow,0.11,0.035,0.075,0,0.19,-0.34);
    box(p,shellLight,0.11,0.055,0.05,0,0.19,0.07);
    const muzzle=new THREE.Object3D(); muzzle.position.set(0,0.015,-0.69); p.add(muzzle);
    muzzles.push(muzzle);
  }
  g.userData.muzzle=muzzles[0];
  g.userData.muzzles=muzzles;
  g.userData.sight=new THREE.Vector3(0,0.19,0.07);
  g.userData.adsEye=0.55;
  return g;
}

function createRocketLauncher(){
  const g=new THREE.Group();
  const glow=emitter(0xff6b45);
  // A wide open launch tube with braced armor and an illuminated chamber.
  tube(g,inset,0.205,0.205,1.27,0,0,-0.35);
  tube(g,shell,0.235,0.235,0.42,0,0,0.10);
  tube(g,brass,0.25,0.25,0.085,0,0,-0.96);
  tube(g,inset,0.18,0.18,0.045,0,0,-1.017);
  ring(g,glow,0.175,0.018,0,0,-1.045);
  for(const z of [-0.62,-0.30,0.28]){
    ring(g,brass,0.238,0.018,0,0,z);
  }
  for(const side of [-1,1]){
    box(g,shellLight,0.075,0.20,0.94,side*0.23,0.02,-0.34);
    box(g,glow,0.025,0.065,0.52,side*0.273,0.045,-0.39);
    box(g,brass,0.07,0.13,0.19,side*0.23,0.05,-0.72);
    box(g,shell,0.16,0.085,0.30,side*0.19,-0.11,0.31);
  }
  box(g,shellLight,0.24,0.10,0.70,0,0.24,-0.25);
  box(g,grip,0.15,0.32,0.18,0,-0.34,0.30,-0.16);
  box(g,brass,0.19,0.055,0.21,0,-0.51,0.34);
  box(g,inset,0.17,0.24,0.22,0,-0.29,-0.25,0.16);
  box(g,glow,0.11,0.09,0.20,0,0.28,-0.48);
  box(g,shell,0.27,0.14,0.22,0,0.02,0.39);
  const sight=reflex(g,0xff6b45,0.39,0.12,0.19,0.15);
  const muzzle=new THREE.Object3D(); muzzle.position.set(0,0,-1.06); g.add(muzzle);
  g.userData.muzzle=muzzle;
  g.userData.sight=sight;
  g.userData.adsEye=0.67;
  return g;
}

export function createWeapon(id){
  if(id==='dual') return createDualPistols();
  if(id==='rocket') return createRocketLauncher();
  const g=new THREE.Group();
  const colors={pulse:0x48cfd4,storm:0xcb9cf3,scatter:0xf3a963,rail:0xc8e8ed,plasma:0xa9db78};
  const energy=emitter(colors[id]||colors.pulse);
  const length={pulse:0.93,storm:0.75,scatter:0.86,rail:1.27,plasma:0.91}[id]||0.9;
  let sight=new THREE.Vector3(0,0.28,0.19), adsEye=0.62;
  // Shared receiver, stock, handgrip and forward spine establish one family.
  box(g,inset,0.24,0.22,0.56,0,0,0.10);
  box(g,shell,0.31,0.17,0.40,0,0.065,0.12);
  box(g,shellLight,0.18,0.07,0.24,0,0.17,0.10);
  box(g,grip,0.12,0.35,0.16,0,-0.25,0.22,-0.22);
  box(g,brass,0.15,0.055,0.23,0,-0.41,0.27);
  box(g,shell,0.23,0.11,0.34,0,-0.01,0.52);
  box(g,grip,0.24,0.12,0.16,0,-0.03,0.76);
  box(g,energy,0.14,0.025,0.31,0,0.16,-0.10);
  for(const x of [-1,1]) box(g,brass,0.025,0.14,0.26,x*0.16,0.025,0.13);

  if(id==='pulse'){
    box(g,shell,0.29,0.19,0.53,0,0,-0.38);
    box(g,inset,0.23,0.13,0.38,0,0.01,-0.70);
    tube(g,inset,0.078,0.092,0.35,0,0.006,-0.91);
    ring(g,energy,0.083,0.016,0,0.006,-1.10);
    for(const x of [-1,1]){
      box(g,energy,0.035,0.035,0.39,x*0.149,0.055,-0.39);
      box(g,shellLight,0.04,0.065,0.16,x*0.13,0.14,-0.17);
    }
    box(g,inset,0.16,0.27,0.18,0,-0.22,-0.04,0.16);
    edge(g,brass,-0.40);
    sight=reflex(g,colors.pulse,0.29,0.23,0.18,0.15);
    adsEye=0.64;
  } else if(id==='storm'){
    box(g,shell,0.30,0.21,0.30,0,0,-0.34);
    box(g,energy,0.20,0.08,0.27,0,0.10,-0.34);
    for(const x of [-0.095,0,0.095]){
      tube(g,inset,0.044,0.048,0.38,x,-0.015,-0.68);
      ring(g,brass,0.047,0.012,x,-0.015,-0.87);
    }
    box(g,inset,0.17,0.32,0.18,0,-0.28,-0.12,0.19);
    for(const x of [-1,1]) box(g,shellLight,0.045,0.12,0.23,x*0.17,0.04,-0.28);
    sight=reflex(g,colors.storm,0.27,0.20,0.16,0.12);
    adsEye=0.58;
  } else if(id==='scatter'){
    box(g,shell,0.37,0.26,0.39,0,0.01,-0.26);
    box(g,brass,0.32,0.05,0.29,0,0.17,-0.28);
    tube(g,inset,0.145,0.16,0.42,0,0.012,-0.65);
    tube(g,brass,0.162,0.162,0.07,0,0.012,-0.89);
    tube(g,inset,0.13,0.13,0.074,0,0.012,-0.93);
    ring(g,energy,0.115,0.014,0,0.012,-0.94);
    box(g,grip,0.30,0.10,0.23,0,-0.15,-0.44);
    for(const x of [-1,1]) box(g,energy,0.023,0.075,0.26,x*0.18,0.005,-0.27);
    box(g,inset,0.20,0.27,0.16,0,-0.25,-0.11,0.17);
    // Open ghost-ring rear sight and a single front bead keep the wide muzzle visible.
    box(g,inset,0.15,0.055,0.13,0,0.205,0.21);
    ring(g,brass,0.047,0.009,0,0.28,0.27);
    ring(g,energy,0.035,0.003,0,0.28,0.28).castShadow=false;
    box(g,brass,0.052,0.055,0.09,0,0.245,-0.75);
    add(g,new THREE.SphereGeometry(0.013,9,7),energy,0,0.28,-0.75).castShadow=false;
    sight.set(0,0.28,0.27); adsEye=0.67;
  } else if(id==='rail'){
    box(g,shell,0.23,0.21,0.65,0,0.01,-0.35);
    box(g,inset,0.17,0.13,0.83,0,0.02,-0.87);
    for(const x of [-1,1]){
      box(g,shellLight,0.072,0.12,1.04,x*0.16,0.04,-0.77);
      box(g,energy,0.023,0.028,0.90,x*0.21,0.035,-0.73);
    }
    for(const z of [-0.32,-0.60,-0.88]){
      tube(g,brass,0.14,0.14,0.055,0,0.015,z);
      ring(g,energy,0.145,0.014,0,0.015,z-0.035);
    }
    box(g,grip,0.14,0.30,0.22,0,-0.27,-0.03,0.25);
    box(g,shellLight,0.10,0.10,0.34,0,0.22,0.04);
    tube(g,inset,0.034,0.034,0.25,0,0.22,-0.15);
    // Long optic with an open lens so it reads both in the world and in the ADS transition.
    box(g,inset,0.14,0.085,0.22,0,0.215,0.05);
    tube(g,inset,0.105,0.105,0.51,0,0.34,0.02);
    for(const z of [-0.19,0.22]) tube(g,brass,0.112,0.112,0.045,0,0.34,z);
    ring(g,energy,0.087,0.009,0,0.34,0.254).castShadow=false;
    sight.set(0,0.34,0.255); adsEye=0.60;
  } else if(id==='plasma'){
    box(g,shell,0.34,0.25,0.37,0,0,-0.31);
    const chamber=add(g,new THREE.IcosahedronGeometry(0.17,1),energy,0,0.018,-0.34);
    chamber.castShadow=false;
    for(const x of [-1,1]){
      box(g,shellLight,0.09,0.23,0.42,x*0.20,0.015,-0.38);
      tube(g,brass,0.052,0.055,0.49,x*0.12,-0.07,-0.69);
    }
    ring(g,brass,0.19,0.035,0,0.01,-0.67);
    ring(g,energy,0.14,0.022,0,0.01,-0.73);
    box(g,inset,0.20,0.23,0.22,0,-0.23,-0.06,0.13);
    box(g,inset,0.10,0.12,0.16,0,0.20,0.18);
    ring(g,brass,0.078,0.014,0,0.29,0.20);
    ring(g,energy,0.055,0.005,0,0.29,0.211).castShadow=false;
    ring(g,energy,0.009,0.0025,0,0.29,0.216).castShadow=false;
    sight.set(0,0.29,0.216); adsEye=0.64;
  }
  const muzzle=new THREE.Object3D();
  muzzle.position.set(0,0.015,-length);
  g.add(muzzle); g.userData.muzzle=muzzle;
  g.userData.sight=sight;
  g.userData.adsEye=adsEye;
  g.traverse(part=>{ if(part.isMesh) part.castShadow=false; });
  return g;
}

export function createPlayer(colorHex, name, makeNameSprite, makeWeaponWorld){
  const g=new THREE.Group();
  const tint=new THREE.Color(colorHex);
  const accent=emitter(tint);
  const suit=new THREE.MeshStandardMaterial({color:0x253941,metalness:0.32,roughness:0.67});
  const armor=new THREE.MeshStandardMaterial({color:0x769296,metalness:0.58,roughness:0.36});
  const edgeMat=new THREE.MeshStandardMaterial({color:0x324c56,metalness:0.65,roughness:0.35});
  // Layered torso and chest plate, tapered waist, collar.
  const torso=new THREE.Group(); torso.position.y=1.18; g.add(torso);
  box(torso,suit,0.47,0.66,0.30);
  box(torso,armor,0.53,0.33,0.34,0,0.11,0.015);
  box(torso,edgeMat,0.38,0.20,0.08,0,-0.15,0.18);
  box(torso,accent,0.25,0.035,0.045,0,0.17,0.205);
  box(torso,brass,0.10,0.23,0.035,0,-0.02,0.225);
  for(const x of [-1,1]){
    box(torso,armor,0.11,0.30,0.07,x*0.26,-0.02,0.16,0,0,x*0.14);
    box(torso,accent,0.045,0.12,0.03,x*0.23,0.07,0.205);
  }
  const head=new THREE.Group(); head.position.y=1.72; g.add(head);
  box(head,suit,0.34,0.31,0.32);
  box(head,armor,0.37,0.10,0.35,0,0.12,0);
  box(head,edgeMat,0.38,0.13,0.11,0,0.025,0.135);
  const visor=box(head,accent,0.29,0.075,0.035,0,0.052,0.207);
  box(head,brass,0.07,0.07,0.045,0,-0.075,0.199);
  for(const x of [-1,1]){
    box(head,armor,0.065,0.15,0.18,x*0.19,0.015,0);
    box(head,accent,0.026,0.075,0.03,x*0.226,0.015,0.04);
  }
  function limb(x, shoulder){
    const arm=new THREE.Group(); arm.position.set(x,shoulder,0); g.add(arm);
    box(arm,suit,0.15,0.48,0.16,0,-0.22,0);
    box(arm,armor,0.23,0.22,0.24,0,-0.03,0.015);
    box(arm,edgeMat,0.19,0.19,0.20,0,-0.30,0);
    box(arm,accent,0.038,0.16,0.018,Math.sign(x)*0.105,-0.29,0.11);
    box(arm,grip,0.17,0.10,0.18,0,-0.49,0.015);
    return arm;
  }
  const armL=limb(-0.39,1.42), armR=limb(0.39,1.42);
  function leg(x){
    const group=new THREE.Group(); group.position.set(x,0.83,0); g.add(group);
    box(group,suit,0.20,0.57,0.22,0,-0.24,0);
    box(group,armor,0.22,0.23,0.25,0,-0.07,0);
    box(group,edgeMat,0.24,0.25,0.24,0,-0.40,0);
    box(group,accent,0.07,0.045,0.02,0,-0.39,0.131);
    box(group,grip,0.24,0.13,0.36,0,-0.73,0.07);
    return group;
  }
  const legL=leg(-0.15), legR=leg(0.15);
  box(g,inset,0.37,0.56,0.23,0,1.16,-0.29);
  box(g,armor,0.40,0.13,0.25,0,1.40,-0.28);
  const flameL=add(g,new THREE.ConeGeometry(0.09,0.5,9),accent,-0.13,0.67,-0.32,Math.PI);
  const flameR=flameL.clone(); flameR.position.x=0.13; g.add(flameR);
  flameL.visible=flameR.visible=false;
  tube(g,brass,0.09,0.105,0.15,-0.13,0.91,-0.33,0);
  tube(g,brass,0.09,0.105,0.15,0.13,0.91,-0.33,0);
  const jetGlow=new THREE.PointLight(tint,0,5); jetGlow.position.set(0,0.8,-0.38); g.add(jetGlow);
  const gun=makeWeaponWorld('pulse'); gun.scale.setScalar(0.75); gun.position.set(0.27,1.13,0.48); gun.rotation.y=Math.PI; g.add(gun);
  const flash=new THREE.PointLight(0xffffff,0,7); flash.position.set(0.27,1.16,1.14); g.add(flash);
  const tag=makeNameSprite(name,colorHex); g.add(tag);
  g.userData={torso,head,visor,armL,armR,legL,legR,flameL,flameR,jetGlow,gun,flash,tag,tagName:name,accent,walkPhase:Math.random()*10,dead:false,deadT:0};
  return g;
}
