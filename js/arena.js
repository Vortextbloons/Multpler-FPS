import * as THREE from 'three';

export const ARENA = {
  size: 106,
  colliders: [],       // {min:Vector3,max:Vector3}
  spawns: [],          // {pos:Vector3, yaw}
  weaponSpawns: [],    // {id, pos, weapon, cooldownUntil}
  jumpPads: [],        // {pos, radius, power}
  navPoints: [],
  bounds: 51,
};

const arenaLightRig = [];
const farTrimMeshes = [];
let sunLight = null;

export function getArenaSun(){ return sunLight; }

// Low keeps the sun and hemisphere, drops fill lights, and swaps distant trim
// onto Lambert. High restores the original intensities and standard materials.
export function applyArenaQuality(low){
  for(const entry of arenaLightRig){
    if(!low || entry.role === 'core'){
      entry.light.visible = true;
      entry.light.intensity = entry.intensity;
      entry.light.distance = entry.distance;
    } else if(entry.role === 'landmark'){
      entry.light.visible = true;
      entry.light.intensity = entry.intensity * 0.55;
      entry.light.distance = entry.distance * 0.75;
    } else {
      entry.light.visible = false;
      entry.light.intensity = 0;
    }
  }
  for(const mesh of farTrimMeshes){
    const next = low ? mesh.userData.cheapMaterial : mesh.userData.richMaterial;
    if(next && mesh.material !== next) mesh.material = next;
  }
}

function addBox(scene, colliders, x,y,z, w,h,d, mat){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z);
  m.receiveShadow = true; m.castShadow = true;
  scene.add(m);
  colliders.push({ min:new THREE.Vector3(x-w/2,y-h/2,z-d/2), max:new THREE.Vector3(x+w/2,y+h/2,z+d/2), mesh:m });
  return m;
}

export function buildArena(scene){
  ARENA.colliders.length = 0; ARENA.spawns.length=0; ARENA.weaponSpawns.length=0; ARENA.jumpPads.length=0; ARENA.navPoints.length=0;
  spinRings.length=0;
  arenaLightRig.length = 0;
  farTrimMeshes.length = 0;
  sunLight = null;

  scene.fog = new THREE.FogExp2(0x172e37, 0.010);
  scene.background = new THREE.Color(0x172e37);

  // Lights
  scene.add(new THREE.HemisphereLight(0xb8e5dd, 0x25343c, 1.8));
  const sun = new THREE.DirectionalLight(0xffd9aa, 2.5);
  sun.position.set(20,40,10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-58; sun.shadow.camera.right=58; sun.shadow.camera.top=58; sun.shadow.camera.bottom=-58;
  scene.add(sun);
  sunLight = sun;
  function trackLight(light, role){
    arenaLightRig.push({light, role, intensity:light.intensity, distance:light.distance});
    scene.add(light);
  }
  const coreLight = new THREE.PointLight(0x62dfd1, 38, 34); coreLight.position.set(0,8,0); trackLight(coreLight, 'core');
  const magLight = new THREE.PointLight(0xffb56d, 22, 32); magLight.position.set(-20,6,20); trackLight(magLight, 'fill');
  const orgLight = new THREE.PointLight(0xffb56d, 18, 28); orgLight.position.set(20,5,-20); trackLight(orgLight, 'fill');
  const dockLight = new THREE.PointLight(0x65d9de, 20, 27); dockLight.position.set(0,8,-43); trackLight(dockLight, 'landmark');
  const coolantLight = new THREE.PointLight(0x86e8aa, 18, 27); coolantLight.position.set(0,7,43); trackLight(coolantLight, 'fill');
  const furnaceLight = new THREE.PointLight(0xff9a50, 22, 28); furnaceLight.position.set(-43,7,0); trackLight(furnaceLight, 'landmark');

  const mats = {
    floor: new THREE.MeshStandardMaterial({color:0x394d53, roughness:0.88, metalness:0.24}),
    floorGrid: new THREE.MeshStandardMaterial({color:0x243b43, roughness:0.7, metalness:0.5}),
    wall: new THREE.MeshStandardMaterial({color:0x607a80, roughness:0.62, metalness:0.42}),
    dark: new THREE.MeshStandardMaterial({color:0x243b42, roughness:0.56, metalness:0.6}),
    cyan: new THREE.MeshStandardMaterial({color:0x3c9e9d, emissive:0x4bdad0, emissiveIntensity:1.5}),
    magenta: new THREE.MeshStandardMaterial({color:0x967150, emissive:0xf2a765, emissiveIntensity:0.8}),
    orange: new THREE.MeshStandardMaterial({color:0xa7794c, emissive:0xf2a765, emissiveIntensity:0.9}),
    green: new THREE.MeshStandardMaterial({color:0x568f75, emissive:0x9adeaa, emissiveIntensity:1.2}),
    glass: new THREE.MeshStandardMaterial({color:0x72d5cf, transparent:true, opacity:0.20, emissive:0x4bdad0, emissiveIntensity:0.45, side:THREE.DoubleSide}),
    ramp: new THREE.MeshStandardMaterial({color:0x718c8f, roughness:0.62, metalness:0.5}),
  };
  // Distant shell trim uses its own standard material so Low can swap it to Lambert
  // without flattening the floor and cover the player actually stands next to.
  const farTrim = new THREE.MeshStandardMaterial({color:0xb1bbb0,metalness:0.68,roughness:0.37});
  const farTrimCheap = new THREE.MeshLambertMaterial({color:0xb1bbb0});
  const farRecess = new THREE.MeshStandardMaterial({color:0x203740,metalness:0.45,roughness:0.68});
  const farRecessCheap = new THREE.MeshLambertMaterial({color:0x203740});
  const haloRich = new THREE.MeshStandardMaterial({color:0x111827, emissive:0x22d3ee, emissiveIntensity:0.9, metalness:0.8, roughness:0.3});
  const haloCheap = new THREE.MeshLambertMaterial({color:0x111827, emissive:0x22d3ee, emissiveIntensity:0.9});
  const rimCheap = new THREE.MeshLambertMaterial({color:0x568f75, emissive:0x9adeaa, emissiveIntensity:1.2});
  const farPending = [];
  const farBatches = [];
  const removedFar = new Set();
  const looseBoxes = [];
  function asFar(mesh, cheap){
    mesh.userData.richMaterial = mesh.material;
    mesh.userData.cheapMaterial = cheap;
    farPending.push(mesh);
    return mesh;
  }
  function looseBox(w,h,d,mat,x,y,z){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y,z);
    m.castShadow = false;
    m.receiveShadow = false;
    scene.add(m);
    looseBoxes.push(m);
    return m;
  }

  // Ground — segmented sci-fi plates
  const ground = new THREE.Mesh(new THREE.BoxGeometry(ARENA.size,1,ARENA.size), mats.floor);
  ground.position.y = -0.5; ground.receiveShadow = true; scene.add(ground);
  ARENA.colliders.push({min:new THREE.Vector3(-53,-1,-53), max:new THREE.Vector3(53,0,53)});

  // Grid lines
  const grid = new THREE.GridHelper(ARENA.size, 53, 0x6b9696, 0x44656c);
  grid.position.y = 0.025; grid.material.transparent = true; grid.material.opacity = 0.32;
  scene.add(grid);

  // Glowing edge strips on floor
  for (const [x,z,w,d,c] of [[0,-16,20,0.3,'cyan'],[0,16,20,0.3,'cyan'],[-16,0,0.3,20,'magenta'],[16,0,0.3,20,'magenta']]){
    looseBox(w,0.06,d, mats[c], x,0.05,z);
  }

  // Perimeter walls with neon tops
  const WH = 14;
  const walls = [[0,-52.5,106,WH,1],[0,52.5,106,WH,1],[-52.5,0,1,WH,106],[52.5,0,1,WH,106]];
  for(const [x,z,w,h,d] of walls){
    addBox(scene, ARENA.colliders, x, h/2, z, w,h,d, mats.wall);
    looseBox(w===1?1.2:w, 0.25, d===1?1.2:d, mats.cyan, x, h+0.1, z);
  }
  // Corner pillar landmarks (color-coded, tall) — 4 corners
  const corners = [[-26,-26,mats.cyan,'NW'],[26,-26,mats.orange,'NE'],[-26,26,mats.magenta,'SW'],[26,26,mats.green,'SE']];
  for(const [x,z,m] of corners){
    addBox(scene, ARENA.colliders, x,6,z, 5,12,5, mats.dark);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(5.3,0.4,5.3), m);
    glow.position.set(x,12.1,z); scene.add(glow);
    const glow2 = new THREE.Mesh(new THREE.BoxGeometry(0.5,11,0.5), m);
    glow2.position.set(x+2.2,6,z+2.2); scene.add(glow2);
    // floating holo ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2,0.08,8,40), m);
    ring.position.set(x,14,z); ring.rotation.x = Math.PI/2; scene.add(ring);
    ring.userData.spin = true; spinRings.push(ring);
  }

  // CENTRAL CORE TOWER — four supports frame an exposed reactor and open routes.
  for(const x of [-3.25,3.25]) for(const z of [-3.25,3.25]){
    addBox(scene, ARENA.colliders, x,5,z, 1.45,10,1.45, mats.dark);
    const cap=new THREE.Mesh(new THREE.BoxGeometry(1.75,0.32,1.75),mats.orange);
    cap.position.set(x,9.82,z); scene.add(cap);
  }
  // The core is round to the eye and approximated by one small solid collider.
  ARENA.colliders.push({min:new THREE.Vector3(-1.25,0,-1.25),max:new THREE.Vector3(1.25,10,1.25)});
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,11,16), mats.cyan);
  core.position.set(0,5.5,0); scene.add(core);
  const coreGlass = new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.2,10,4,1,true), mats.glass);
  coreGlass.position.set(0,5,0); coreGlass.rotation.y = Math.PI/4; scene.add(coreGlass);
  // top disc platform (sniper nest)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(6,6,0.6,8), mats.ramp);
  top.position.set(0,10.3,0); top.castShadow=top.receiveShadow=true; scene.add(top);
  ARENA.colliders.push({min:new THREE.Vector3(-5,10,-5),max:new THREE.Vector3(5,10.6,5)});
  const topGlow = new THREE.Mesh(new THREE.TorusGeometry(6,0.12,8,8), mats.cyan);
  topGlow.position.set(0,10.6,0); topGlow.rotation.x=Math.PI/2; scene.add(topGlow);

  // 4 mid platforms (y=4.5) diagonal — jetpack friendly
  const mids = [[-14,-14],[14,-14],[-14,14],[14,14]];
  for(const [x,z] of mids){
    addBox(scene, ARENA.colliders, x,4.5,z, 8,0.6,8, mats.ramp);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(8.2,0.12,8.2), mats.magenta);
    edge.position.set(x,4.85,z); scene.add(edge);
    // support pillar
    addBox(scene, ARENA.colliders, x,2,z, 1.2,4,1.2, mats.dark);
  }

  // 2 sky bridges at y=9 connecting mid platforms N-S and E-W
  addBox(scene, ARENA.colliders, 0,8.7,-14, 4,0.5,12, mats.ramp);
  addBox(scene, ARENA.colliders, -14,8.7,0, 12,0.5,4, mats.ramp);
  addBox(scene, ARENA.colliders, 14,8.7,0, 12,0.5,4, mats.ramp);
  // bridge glow rails
  for(const [x,z,w,d] of [[0,-14,4,12],[-14,0,12,4],[14,0,12,4]]){
    const r1 = new THREE.Mesh(new THREE.BoxGeometry(w,0.1,0.15), mats.cyan);
    r1.position.set(x,9.25,z - d/2 + 0.2); scene.add(r1);
    const r2 = r1.clone(); r2.position.set(x,9.25,z + d/2 - 0.2); scene.add(r2);
  }

  // Ramps ground -> mid platforms (4)
  function ramp(x1,z1,x2,z2,y2){
    const dx=x2-x1, dz=z2-z1;
    const len=Math.hypot(dx,dz);
    const ang=Math.atan2(dz,dx);
    const slope=Math.atan2(y2,len);
    const geo=new THREE.BoxGeometry(len,0.4,3.2);
    const m=new THREE.Mesh(geo,mats.ramp);
    m.position.set((x1+x2)/2, y2/2, (z1+z2)/2);
    m.rotation.order='YXZ'; m.rotation.y=-ang; m.rotation.z=slope;
    m.castShadow=m.receiveShadow=true;
    scene.add(m);
    // approximate collider as low walkable steps (rise ~0.6 each = steppable)
    const steps=8;
    for(let i=0;i<steps;i++){
      const t=(i+0.5)/steps;
      const px=x1+dx*t, pz=z1+dz*t, py=y2*t;
      ARENA.colliders.push({min:new THREE.Vector3(px-1.7,py-0.3,pz-1.7),max:new THREE.Vector3(px+1.7,py+0.24,pz+1.7)});
    }
    // glow strip
    const strip=new THREE.Mesh(new THREE.BoxGeometry(len,0.08,0.2),mats.cyan);
    strip.position.set((x1+x2)/2, y2/2+0.35,(z1+z2)/2); strip.rotation.order='YXZ'; strip.rotation.y=-ang; strip.rotation.z=slope; scene.add(strip);
  }
  ramp(-8,-8,-14,-14,4.8); ramp(8,-8,14,-14,4.8); ramp(-8,8,-14,14,4.8); ramp(8,8,14,14,4.8);
  // ramp to top? jetpack route only — add two jump pads instead

  // Cover crates — mix of open + tight areas
  const crates = [
    [-6,1,-20,3,2,3],[6,1,-20,3,2,3],[-6,1,20,3,2,3],[6,1,20,3,2,3],
    [-22,1,-6,2.5,2,4],[22,1,6,2.5,2,4],[-22,1,6,4,1.4,2],[22,1,-6,4,1.4,2],
    [0,0.8,-24,6,1.6,1.2],[0,0.8,24,6,1.6,1.2],
    [-10,5,0,2,2,6],[10,5,0,2,2,6], // mid-level cover on bridges sides
    [0,11,4,3,1.5,1],[0,11,-4,3,1.5,1], // top cover
  ];
  for(const [x,y,z,w,h,d] of crates){
    addBox(scene, ARENA.colliders, x,y,z, w,h,d, mats.wall);
    looseBox(w+0.1,0.1,d+0.1, mats.orange, x,y+h/2+0.05,z);
  }

  // Side tunnels (tight combat) — two short walls forming corridors east/west (gaps kept wide)
  addBox(scene, ARENA.colliders, -26,2.5,0, 1.5,5,10, mats.wall);
  addBox(scene, ARENA.colliders, 26,2.5,0, 1.5,5,10, mats.wall);

  // The old central arena stays open; four new sectors fill the outer 18m ring.
  // North loading dock: stepped access to a cargo gantry and staggered cover.
  addBox(scene, ARENA.colliders, 0,3.2,-44, 16,0.6,8, mats.ramp);
  for(const x of [-7,7]) for(const z of [-47,-41])
    addBox(scene, ARENA.colliders, x,1.45,z, 0.8,2.9,0.8, mats.dark);
  for(const [z,h] of [[-36.5,0.8],[-38,1.6],[-39.5,2.4]])
    addBox(scene, ARENA.colliders, 0,h/2,z, 5,h,1.35, mats.ramp);
  for(const [x,z,w,d] of [[-15,-43,5,6],[15,-43,5,6],[-10,-36,4,3],[10,-36,4,3]])
    addBox(scene, ARENA.colliders, x,1.4,z, w,2.8,d, mats.wall);
  const dockCrane = new THREE.Mesh(new THREE.BoxGeometry(24,0.45,0.7), mats.cyan);
  dockCrane.position.set(0,8,-47); scene.add(dockCrane);
  for(const x of [-11,11]) addBox(scene, ARENA.colliders, x,4,-47, 0.7,8,0.7, mats.dark);

  // South coolant works: tank cover, a low service walk, and an open center lane.
  for(const x of [-14,14]){
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(3,3,7,16), mats.dark);
    tank.position.set(x,3.5,43); tank.castShadow=true; tank.receiveShadow=true; scene.add(tank);
    ARENA.colliders.push({min:new THREE.Vector3(x-3,0,40),max:new THREE.Vector3(x+3,7,46)});
    for(const y of [2,5,7.1]){
      const rim = new THREE.Mesh(new THREE.TorusGeometry(3.1,0.18,8,24), mats.green);
      rim.position.set(x,y,43); rim.rotation.x=Math.PI/2; scene.add(rim);
      asFar(rim, rimCheap);
    }
  }
  addBox(scene, ARENA.colliders, 0,3.1,43, 7,0.6,14, mats.ramp);
  for(const z of [37,49]) addBox(scene, ARENA.colliders, 0,1.4,z, 0.8,2.8,0.8, mats.dark);
  for(const x of [-7,7]) addBox(scene, ARENA.colliders, x,0.85,43, 1.2,1.7,9, mats.wall);
  for(const z of [36,50]) addBox(scene, ARENA.colliders, 0,0.8,z, 5,1.6,1.2, mats.wall);

  // West smelter: two furnace blocks create a close-range lane through the middle.
  for(const z of [-13,13]){
    addBox(scene, ARENA.colliders, -44,3,z, 7,6,7, mats.dark);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(7.4,0.3,7.4), mats.orange);
    cap.position.set(-44,6.2,z); scene.add(cap);
    const fire = new THREE.Mesh(new THREE.BoxGeometry(0.12,2.4,3.8), mats.orange);
    fire.position.set(-40.42,2.8,z); scene.add(fire);
    addBox(scene, ARENA.colliders, -38,1,z, 3,2,4, mats.wall);
  }
  addBox(scene, ARENA.colliders, -44,4.5,0, 7,0.6,9, mats.ramp);
  for(const x of [-48,-40]) addBox(scene, ARENA.colliders, x,1.95,0, 0.8,3.9,0.8, mats.dark);
  for(const z of [-5,5]) addBox(scene, ARENA.colliders, -49,1,z, 2,2,2, mats.wall);

  // East rail yard: container lanes and a compact overlook, with routes on both sides.
  for(const z of [-14,14]){
    addBox(scene, ARENA.colliders, 43,1.7,z, 7,3.4,8, mats.wall);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(7.2,0.12,8.2), mats.magenta);
    stripe.position.set(43,3.46,z); scene.add(stripe);
  }
  addBox(scene, ARENA.colliders, 43,4.2,0, 7,0.6,7, mats.ramp);
  for(const x of [40,46]) for(const z of [-3,3])
    addBox(scene, ARENA.colliders, x,1.95,z, 0.7,3.9,0.7, mats.dark);
  for(const z of [-7,7]) addBox(scene, ARENA.colliders, 37,0.9,z, 3,1.8,2, mats.wall);
  for(const x of [38,48]){
    looseBox(0.2,0.07,45, mats.magenta, x,0.09,0);
  }
  for(let z=-22;z<=22;z+=4) looseBox(10,0.06,0.22, mats.dark, 43,0.07,z);

  // Small corner barricades interrupt long sightlines without closing the loop.
  for(const x of [-42,42]) for(const z of [-42,42]){
    addBox(scene, ARENA.colliders, x,0.9,z, 3.5,1.8,3.5, mats.dark);
    const marker = new THREE.Mesh(new THREE.BoxGeometry(3.7,0.12,3.7), x===z?mats.cyan:mats.orange);
    marker.position.set(x,1.86,z); scene.add(marker);
  }
  // Inlaid route lines point back toward the reactor from each sector.
  for(const [x,z,w,d] of [[0,-34,0.25,17],[0,34,0.25,17],[-34,0,17,0.25],[34,0,17,0.25]]){
    looseBox(w,0.035,d, mats.cyan, x,0.06,z);
  }

  // Overhead halo ring — visual landmark
  const halo = new THREE.Mesh(new THREE.TorusGeometry(18,0.35,10,60), haloRich);
  halo.position.set(0,20,0); halo.rotation.x=Math.PI/2; scene.add(halo); spinRings.push(halo);
  asFar(halo, haloCheap);

  // Jump pads
  const padSpots = [[-8,0,-8],[8,0,-8],[-8,0,8],[8,0,8],[0,0,-49],[9,0,36],[-43,0,6],[43,0,7]];
  const padMat = new THREE.MeshStandardMaterial({color:0x052e2b, emissive:0x4ade80, emissiveIntensity:1.5});
  const padBeamGeo = new THREE.CylinderGeometry(1.0,1.0,6,12,1,true);
  const padBeamMat = new THREE.MeshBasicMaterial({color:0x4ade80, transparent:true, opacity:0.12, side:THREE.DoubleSide});
  for(const [x,y,z] of padSpots){
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.5,0.25,16), padMat);
    pad.position.set(x,0.13,z); scene.add(pad);
    const beam = new THREE.Mesh(padBeamGeo, padBeamMat);
    beam.position.set(x,3,z); scene.add(beam);
    ARENA.jumpPads.push({pos:new THREE.Vector3(x,0,z), radius:1.6, power:13});
  }

  // Weapon spawn locations — encourage rotation
  const wdefs = [
    ['rail', 0,11.2,0],        // top of tower — high risk/reward
    ['plasma', -14,5.4,-14], ['plasma', 14,5.4,14],
    ['scatter', -6,1.1,-20], ['scatter', 6,1.1,20],
    ['storm', -22,1.1,-6], ['storm', 22,1.1,6],
    ['rail', 0,1.1,-24], ['scatter', 0,1.1,24],
    ['storm', -15,3.8,-43], ['rail', 0,4,-44],
    ['plasma', 0,4,43], ['scatter', -43,1.1,0], ['storm', 43,5.1,0],
    ['dual', -34,1.1,34], ['dual', 34,1.1,-34],
    ['rocket', -40,1.1,-32], ['rocket', 40,1.1,32],
  ];
  wdefs.forEach(([w,x,y,z],i)=>{
    ARENA.weaponSpawns.push({id:'w'+i, weapon:w, pos:new THREE.Vector3(x,y,z), cooldownUntil:0});
  });

  // Player spawns spread between the original ring and the new sectors.
  const sdefs = [[-20,0,-20],[20,0,-20],[-20,0,20],[20,0,20],[0,0,-30],[0,0,30],[-28,0,12],[28,0,-12],[-14,4.8,-14],[14,4.8,14],
    [-25,0,-43],[25,0,-43],[-25,0,43],[25,0,43],[-43,0,-26],[-43,0,26],[43,0,-26],[43,0,26]];
  for(const [x,y,z] of sdefs){
    const yaw = Math.atan2(x,z);
    ARENA.spawns.push({pos:new THREE.Vector3(x,y+1,z), yaw});
    ARENA.navPoints.push(new THREE.Vector3(x,0,z));
  }
  // extra nav points: mids, bridges, pads, center
  [[-14,0,-14],[14,0,-14],[-14,0,14],[14,0,14],[0,0,-14],[0,0,14],[-14,0,0],[14,0,0],[0,0,0],
   [-14,4.8,-14],[14,4.8,-14],[-14,4.8,14],[14,4.8,14],[0,10.6,0],[0,0,-24],[0,0,24],
   [0,3.5,-44],[0,3.4,43],[-44,4.8,0],[43,4.5,0],[-42,0,-35],[-42,0,35],[42,0,-35],[42,0,35],
   [0,0,-36],[0,0,36],[-36,0,0],[36,0,0]].forEach(([x,y,z])=>ARENA.navPoints.push(new THREE.Vector3(x,y,z)));
  ARENA.weaponSpawns.forEach(w=>ARENA.navPoints.push(w.pos.clone()));

  // spawn beacons (visual)
  const beaconGeo = new THREE.CylinderGeometry(0.8,0.8,3,12,1,true);
  const beaconMat = new THREE.MeshBasicMaterial({color:0x22d3ee, transparent:true, opacity:0.25});
  for(const s of ARENA.spawns){
    const b = new THREE.Mesh(beaconGeo, beaconMat);
    b.position.set(s.pos.x, 1.5, s.pos.z); scene.add(b);
  }

  // V2 foundry dressing: these surfaces do not change collision or bot routes.
  const trim = new THREE.MeshStandardMaterial({color:0xb1bbb0,metalness:0.68,roughness:0.37});
  const recess = new THREE.MeshStandardMaterial({color:0x203740,metalness:0.45,roughness:0.68});
  const hazard = new THREE.MeshStandardMaterial({color:0xf4ad63,emissive:0x9a4b1c,emissiveIntensity:0.35,roughness:0.65});
  const staticDetails = [];
  function detail(geo,material,x,y,z,rx=0,ry=0,rz=0){
    const m=new THREE.Mesh(geo,material); m.position.set(x,y,z); m.rotation.set(rx,ry,rz);
    m.castShadow=false; m.receiveShadow=true; scene.add(m);
    if(geo.type==='BoxGeometry') staticDetails.push(m);
    return m;
  }
  // Recessed plate islands and narrow maintenance seams make the floor legible
  // at player height without adding hundreds of colliders.
  for(let ix=-7;ix<=7;ix++) for(let iz=-7;iz<=7;iz++){
    const x=ix*6.8, z=iz*6.8;
    if(Math.abs(x)<5 && Math.abs(z)<5) continue;
    detail(new THREE.BoxGeometry(6.45,0.018,6.45), (ix+iz)%3===0?mats.floorGrid:mats.ramp, x,0.012,z);
    if((ix+iz)%2===0){
      detail(new THREE.BoxGeometry(1.15,0.022,0.075),trim,x-2.2,0.029,z-2.15);
      detail(new THREE.BoxGeometry(0.075,0.022,1.1),trim,x-2.75,0.029,z-1.65);
    }
  }
  // Continuous wall ribs and service ducts give scale and depth to the shell.
  for(let v=-49;v<=49;v+=7){
    for(const side of [-1,1]){
      asFar(detail(new THREE.BoxGeometry(0.36,10.8,0.55),farRecess,v,5.5,side*51.88), farRecessCheap);
      asFar(detail(new THREE.BoxGeometry(0.55,10.8,0.36),farRecess,side*51.88,5.5,v), farRecessCheap);
      asFar(detail(new THREE.BoxGeometry(3.3,0.16,0.22),farTrim,v,8.4,side*51.82), farTrimCheap);
      asFar(detail(new THREE.BoxGeometry(0.22,0.16,3.3),farTrim,side*51.82,8.4,v), farTrimCheap);
    }
  }
  asFar(detail(new THREE.CylinderGeometry(0.24,0.24,102,10),farTrim,-48.8,3.2,0,Math.PI/2), farTrimCheap);
  asFar(detail(new THREE.CylinderGeometry(0.24,0.24,102,10),farTrim,48.8,3.2,0,Math.PI/2), farTrimCheap);
  for(const side of [-1,1]) asFar(detail(new THREE.CylinderGeometry(0.24,0.24,102,10),farTrim,0,3.2,side*48.8,0,0,Math.PI/2), farTrimCheap);
  // Cover receives framed panels and orange top edge warnings.
  for(const [x,y,z,w,h,d] of crates){
    detail(new THREE.BoxGeometry(Math.max(0.4,w-0.34),Math.max(0.3,h-0.45),0.045),recess,x,y,z+d/2+0.03);
    detail(new THREE.BoxGeometry(Math.max(0.4,w-0.34),0.055,0.065),hazard,x,y+h/2-0.19,z+d/2+0.065);
    for(const sx of [-1,1]) detail(new THREE.BoxGeometry(0.07,Math.max(0.3,h-0.4),0.065),trim,x+sx*(w/2-0.11),y,z+d/2+0.07);
  }
  // The central reactor is a stack of cooling hoops and vertical conduits.
  for(const y of [1.4,3.2,5,6.8,8.6]){
    const hoop=detail(new THREE.TorusGeometry(2.38,0.10,8,8),trim,0,y,0,Math.PI/2,Math.PI/4);
    hoop.castShadow=false;
  }
  for(const x of [-1,1]) for(const z of [-1,1]){
    detail(new THREE.CylinderGeometry(0.11,0.11,9.5,8),mats.cyan,x*2.25,5,z*2.25);
    detail(new THREE.BoxGeometry(0.35,0.22,0.35),hazard,x*2.25,9.8,z*2.25);
  }
  // Radiating warning wedges around each launch pad show its usable footprint.
  for(const [x,,z] of padSpots){
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6;
      const wedge=detail(new THREE.BoxGeometry(0.26,0.018,0.55),i%3===0?hazard:trim,
        x+Math.sin(a)*1.87,0.034,z+Math.cos(a)*1.87,0,a);
      wedge.castShadow=false;
    }
  }
  // Route identifiers are rendered as physical signage on the arena walls.
  function sign(label,x,y,z,rotY){
    const c=document.createElement('canvas'); c.width=512; c.height=128;
    const ctx=c.getContext('2d');
    ctx.fillStyle='#1b333a'; ctx.fillRect(0,0,512,128);
    ctx.fillStyle='#edaa64'; ctx.fillRect(0,0,14,128);
    ctx.font='bold 28px monospace'; ctx.fillStyle='#b7e5df';
    ctx.fillText('FORGE / SECTOR',36,42);
    ctx.font='bold 50px monospace'; ctx.fillStyle='#f4d6aa'; ctx.fillText(label,34,103);
    const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
    const m=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide});
    detail(new THREE.PlaneGeometry(5.5,1.38),m,x,y,z,0,rotY);
  }
  sign('LOADING DOCK',0,5.4,-51.94,0);
  sign('COOLANT WORKS',0,5.4,51.94,Math.PI);
  sign('SMELTER',-51.94,5.4,0,Math.PI/2);
  sign('RAIL YARD',51.94,5.4,0,-Math.PI/2);

  // Instance repeated dressing within local tiles, retaining per-tile frustum culling.
  // These meshes are decorative only; collision boxes remain independent above.
  if(THREE.InstancedMesh){
    const groups=new Map();
    const unitBox=new THREE.BoxGeometry(1,1,1);
    for(const mesh of staticDetails){
      const key=`${mesh.material.uuid}|${Math.floor(mesh.position.x/32)},${Math.floor(mesh.position.z/32)}`;
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(mesh);
    }
    for(const meshes of groups.values()){
      if(meshes.length<2) continue;
      const batch=new THREE.InstancedMesh(unitBox,meshes[0].material,meshes.length);
      batch.castShadow=false; batch.receiveShadow=true;
      if(meshes[0].userData.cheapMaterial){
        batch.userData.richMaterial=batch.material;
        batch.userData.cheapMaterial=meshes[0].userData.cheapMaterial;
        farBatches.push(batch);
      }
      meshes.forEach((mesh,i)=>{
        const {width,height,depth}=mesh.geometry.parameters;
        mesh.scale.set(width,height,depth);
        mesh.updateMatrix();
        batch.setMatrixAt(i,mesh.matrix);
        scene.remove(mesh);
        if(mesh.userData.cheapMaterial) removedFar.add(mesh);
        mesh.geometry.dispose();
      });
      batch.instanceMatrix.needsUpdate=true;
      scene.add(batch);
    }
  }

  // Repeated unshadowed trim (ties, caps, lane lines) shares one unit box per tile.
  // Shadow flags stay off so the High sun shadow matches the previous individual meshes.
  if(THREE.InstancedMesh && looseBoxes.length){
    const groups=new Map();
    const unitBox=new THREE.BoxGeometry(1,1,1);
    const disposed=new Set();
    for(const mesh of looseBoxes){
      const key=`${mesh.material.uuid}|${Math.floor(mesh.position.x/64)},${Math.floor(mesh.position.z/64)}`;
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(mesh);
    }
    for(const meshes of groups.values()){
      if(meshes.length<2) continue;
      const batch=new THREE.InstancedMesh(unitBox,meshes[0].material,meshes.length);
      batch.castShadow=false; batch.receiveShadow=false;
      batch.userData.allowUnshadowed=true;
      meshes.forEach((mesh,i)=>{
        const {width,height,depth}=mesh.geometry.parameters;
        mesh.scale.set(width,height,depth);
        mesh.updateMatrix();
        batch.setMatrixAt(i,mesh.matrix);
        scene.remove(mesh);
        if(!disposed.has(mesh.geometry)){ disposed.add(mesh.geometry); mesh.geometry.dispose(); }
      });
      batch.instanceMatrix.needsUpdate=true;
      scene.add(batch);
    }
  }
  farTrimMeshes.push(...farBatches);
  for(const mesh of farPending) if(!removedFar.has(mesh)) farTrimMeshes.push(mesh);
}

const spinRings = [];
export function tickArena(dt){
  for(const r of spinRings) r.rotation.z += dt*0.2;
}

// AABB collision helpers
export function collideCircle(pos, radius, colliders){
  // resolve XZ; pos is feet position. Step-up allowed so ramps/platforms don't wall you off.
  const STEP = 0.78;
  for(const c of colliders){
    // standing on top (or able to step onto it) -> no XZ push, groundHeight handles lift
    if (pos.y >= c.max.y - 0.12) continue;
    if (c.max.y - pos.y < STEP && c.min.y < pos.y + 0.6) continue;
    const footY = pos.y, headY = pos.y + 1.72;
    if (headY < c.min.y || footY > c.max.y) continue;
    const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
    const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx*dx+dz*dz;
    if (d2 < radius*radius){
      if (d2 > 1e-8){
        const d = Math.sqrt(d2);
        const push = (radius - d);
        pos.x += dx/d*push; pos.z += dz/d*push;
      } else {
        // inside box — push out along smallest penetration
        const px1 = pos.x - c.min.x, px2 = c.max.x - pos.x;
        const pz1 = pos.z - c.min.z, pz2 = c.max.z - pos.z;
        const m = Math.min(px1,px2,pz1,pz2);
        if(m===px1) pos.x = c.min.x - radius;
        else if(m===px2) pos.x = c.max.x + radius;
        else if(m===pz1) pos.z = c.min.z - radius;
        else pos.z = c.max.z + radius;
      }
    }
  }
}

export function groundHeight(pos, colliders){
  // find highest collider top below feet+step that overlaps XZ
  let g = 0;
  for(const c of colliders){
    if (pos.x > c.min.x-0.35 && pos.x < c.max.x+0.35 && pos.z > c.min.z-0.35 && pos.z < c.max.z+0.35){
      if (c.max.y <= pos.y + 0.78 && c.max.y > g) g = c.max.y;
    }
  }
  return g;
}

export function isBlocked(pos, radius=0.42, feetY=0){
  for(const c of ARENA.colliders){
    if (feetY >= c.max.y - 0.12) continue;
    if (c.max.y - feetY < 0.78 && c.min.y < feetY + 0.6) continue;
    if (feetY + 1.72 < c.min.y || feetY > c.max.y) continue;
    const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x));
    const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z));
    if (Math.hypot(pos.x-cx, pos.z-cz) < radius) return true;
  }
  return false;
}

export function pickSpawn(avoidPositions=[]){
  // choose spawn maximizing min distance to enemies; skip blocked spawns
  let best=null, bestScore=-1;
  for(const s of ARENA.spawns){
    if (isBlocked(s.pos, 0.5, s.pos.y)) continue;
    let minD = 999;
    for(const p of avoidPositions){
      const d = Math.hypot(s.pos.x-p.x, s.pos.z-p.z);
      if(d<minD) minD=d;
    }
    const score = minD + Math.random()*6;
    if(score>bestScore){bestScore=score;best=s;}
  }
  if(!best){
    // fallback: first open ground spot
    for(const s of ARENA.spawns){ best=s; break; }
  }
  return best;
}
