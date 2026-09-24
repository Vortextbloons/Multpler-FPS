import * as THREE from 'three';
import { SUPABASE_URL, SUPABASE_ANON, ROOM_ID, WEAPONS, WEAPON_ORDER, MOVE, randomName, randomColor, guestId } from './config.js';
import { buildArena, ARENA, tickArena, pickSpawn } from './arena.js';
import { makeWeaponView, makeWeaponWorld, makePlayerMesh, setPlayerName, setPlayerWeapon, posePlayer, animateWeaponReload, FX } from './visuals.js';
import { LocalPlayer } from './player.js';
import { makeBots } from './bots.js';
import { SFX, initAudio, resumeAudio, toggleMute } from './audio.js';
import { Net } from './net.js';
import { createClient } from '@supabase/supabase-js';

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const canvas = $('game-canvas');
const hud=$('hud'), menu=$('menu'), endScreen=$('end-screen'), loading=$('loading');
const enemyHealthBars=$('enemy-health-bars');
const touchMode = matchMedia('(pointer: coarse)').matches;

// ---------- state ----------
let renderer, scene, camera, fx;
let player, bots=[], remotes=new Map(); // remotes: id -> {mesh, state, ...}
let net=null, mode='solo';
let me = { id: guestId(), name: randomName(), color: randomColor(), kills:0, deaths:0, best:0, streak:0, weapon:'pulse', alive:true };
let pickups=[]; // {id, weapon, pos, mesh, ring, light, available, timer}
let keys={}, input={f:0,b:0,l:0,r:0,sprint:0,jumpHeld:0,jumpPressed:0,firing:0,slidePressed:0,crouch:0};
let touchMove={x:0,y:0}, movePointer=null, lookPointer=null, lookX=0, lookY=0;
let viewHolder=null, viewMuzzleFlash=null, viewLight=null;
let camShake=0, crosshairBloom=0, bobPhase=0, viewSwayX=0, viewSwayY=0, stepDistance=0, landingKick=0;
let lastTime=0, sessionT=0, soloEnd=20, soloTimeLeft=600, matchOver=false;
let killfeedEl=$('killfeed');
let sbTimer=0, hbTimer=0;
let muted=false;
let clockFps=0, clockFrames=0, clockT=0;
let loopStarted=false;

function requestGameLock(){
  if(touchMode) return;
  const unsupported=()=>{
    $('focus-overlay').querySelector('h2').textContent='OPEN IN A DESKTOP BROWSER';
    $('focus-overlay').querySelector('p').textContent='This preview cannot capture the mouse. Open the game in Chrome or Edge to play.';
    $('btn-resume').classList.add('hidden');
    $('focus-overlay').classList.remove('hidden');
  };
  if(!canvas.requestPointerLock){ unsupported(); return; }
  try {
    const result=canvas.requestPointerLock();
    result?.catch?.(error=>{
      if(error?.name==='WrongDocumentError' || error?.name==='SecurityError') unsupported();
      else $('focus-overlay').classList.remove('hidden');
    });
  } catch(error){
    if(error?.name==='WrongDocumentError' || error?.name==='SecurityError') unsupported();
    else $('focus-overlay').classList.remove('hidden');
  }
}

// ---------- menu ----------
$('player-name').value = me.name;
$('reroll-name').onclick = ()=>{ SFX.ui?.(); $('player-name').value = randomName(); };
function setMenuNet(ok, txt){ const d=$('menu-dot'); d.className=''; if(ok) d.classList.add('ok'); $('menu-net').textContent = txt; }

// quick supabase ping for menu
(async()=>{
  initAudio();
  try{
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { error } = await sb.from('arena_rooms').select('*').limit(1);
    if(!error) setMenuNet(true, 'Supabase connected · PUBLIC ARENA 01 live · forever room');
    else setMenuNet(false, 'Supabase reachable (limited) — game still playable');
  }catch(e){ setMenuNet(false, 'Offline mode — solo vs bots still works'); }
})();

$('btn-multi').onclick = ()=>{ me.name = ($('player-name').value||me.name).toUpperCase().slice(0,14); startGame('multi'); };
$('btn-solo').onclick = ()=>{ me.name = ($('player-name').value||me.name).toUpperCase().slice(0,14); startGame('solo'); };
$('btn-again').onclick = ()=>{ endScreen.classList.add('hidden'); startGame(mode); };
$('btn-tomenu').onclick = ()=>{ location.reload(); };

// ---------- core setup ----------
async function startGame(m){
  mode=m;
  menu.classList.add('hidden'); endScreen.classList.add('hidden');
  loading.classList.remove('hidden'); $('loading-text').textContent = m==='multi'?'JOINING PUBLIC ARENA…':'LOADING ARENA…';
  initAudio(); resumeAudio(); SFX.ui();
  me.id = guestId(); me.kills=0; me.deaths=0; me.best=0; me.streak=0; me.weapon='pulse'; me.alive=true;
  sessionT=0; matchOver=false; soloTimeLeft=600;
  camShake=0; crosshairBloom=0; bobPhase=0; viewSwayX=0; viewSwayY=0; stepDistance=0; landingKick=0;
  $('damage-numbers').replaceChildren();
  $('damage-direction').style.opacity=0;

  // renderer/scene
  if(!renderer){
    renderer = new THREE.WebGLRenderer({canvas, antialias:!touchMode, powerPreference:touchMode?'default':'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,touchMode?1:1.5));
    renderer.setSize(innerWidth,innerHeight);
    renderer.shadowMap.enabled = !touchMode;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.42;
    addEventListener('resize', ()=>{ renderer.setSize(innerWidth,innerHeight); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); });
  }
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.08, 220);
  scene.add(camera);
  const viewFill = new THREE.PointLight(0xd4fff4, 3.2, 4);
  viewFill.position.set(-1,1,1); camera.add(viewFill);
  fx = new FX(scene);
  buildArena(scene);

  player = new LocalPlayer();
  {
    const avoid=[];
    const s = pickSpawn(avoid);
    player.pos.copy(s.pos); player.yaw=s.yaw;
  }

  // viewmodel
  if(viewHolder) camera.remove(viewHolder);
  viewHolder = makeWeaponView('pulse');
  camera.add(viewHolder);
  viewHolder.position.set(0,0,0);
  viewMuzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.18,0.18),
    new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false}));
  viewMuzzleFlash.position.set(0.28,-0.18,-1.1); camera.add(viewMuzzleFlash);
  viewLight = new THREE.PointLight(0x22d3ee, 0, 6); viewLight.position.set(0.3,-0.1,-1); camera.add(viewLight);

  buildPickups();

  bots=[]; remotes.clear(); enemyHealthBars.replaceChildren();
  if(window._netTimer){ clearInterval(window._netTimer); window._netTimer=null; }
  if(mode==='solo'){
    bots = makeBots();
    const occupied=[player.pos.clone()];
    for(const b of bots){
      const spawn=pickSpawn(occupied);
      b.pos.copy(spawn.pos); b.yaw=spawn.yaw;
      occupied.push(b.pos.clone());
      b.mesh = makePlayerMesh(b.color, b.name);
      addEnemyHealthBar(b);
      b.mesh.position.copy(b.pos);
      scene.add(b.mesh);
      setPlayerWeapon(b.mesh, 'pulse');
    }
    setNetStatus('solo','SOLO · 7 BOTS');
  } else {
    setNetStatus('conn','CONNECTING…');
    net = new Net();
    net.onEvent = onNetEvent;
    net.onPresence = ()=>refreshScoreboard();
    try {
      await net.init(me, player.pos);
    } catch(e) {
      console.error('Could not join arena', e);
      net.disconnect(); net=null;
      loading.classList.add('hidden'); menu.classList.remove('hidden');
      setMenuNet(false, 'Could not join the room — try JOIN again');
      return;
    }
    updateRoomStatus();
    // recent kills into feed
    net.fetchRecentKills(6).then(rec=>rec.reverse().forEach(k=>addKillfeed(k.killer_name||'???', k.victim_name||'???', k.weapon||'pulse', false)));
    $('center-toast').style.opacity=1; $('center-toast').textContent=`WELCOME ${me.name} — FOREVER FFA`;
    setTimeout(()=>$('center-toast').style.opacity=0, 2600);
    // Independent sender: rAF stops in hidden tabs, so broadcast on a timer too.
    // Foreground loop also calls sendPos; the 50ms throttle dedups. Hidden tabs stay alive (~1Hz).
    window._netTimer = setInterval(()=>{
      if(!net || !player || mode!=='multi') return;
      net.me.kills=me.kills; net.me.deaths=me.deaths; net.me.best=me.best; net.me.weapon=player.current; net.me.alive=player.alive;
      net.sendPos({pos:player.pos, yaw:player.yaw, pitch:player.pitch, weapon:player.current, alive:player.alive, health:player.health, jet:player.jetting, firing:input.firing});
    }, 120);
  }

  bindInputOnce();
  resetControls();
  $('scoreboard').classList.add('hidden');
  hud.classList.remove('hidden');
  $('ads-overlay').style.opacity=0;
  $('crosshair').classList.remove('ads','aimed');
  $('focus-overlay').classList.add('hidden');
  $('focus-overlay').querySelector('h2').textContent='READY WHEN YOU ARE.';
  $('focus-overlay').querySelector('p').textContent=touchMode?'Touch the controls to return to the arena.':'Click below to return to the arena.';
  $('btn-resume').classList.remove('hidden');
  loading.classList.add('hidden');
  requestGameLock();
  if(!touchMode) setTimeout(()=>{
    if(document.pointerLockElement!==canvas && !matchOver) $('focus-overlay').classList.remove('hidden');
  },250);
  buildWeaponSlots();
  refreshScoreboard();
  lastTime = performance.now();
  if(!loopStarted){ loopStarted=true; requestAnimationFrame(loop); }
  SFX.spawn();
}

// ---------- pickups ----------
function buildPickups(){
  for(const p of pickups){ scene.remove(p.group); }
  pickups=[];
  for(const s of ARENA.weaponSpawns){
    const group = new THREE.Group();
    group.position.copy(s.pos).add(new THREE.Vector3(0,0.7,0));
    const gun = makeWeaponWorld(s.weapon);
    gun.rotation.y = Math.random()*Math.PI*2;
    group.add(gun);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55,0.04,8,24),
      new THREE.MeshBasicMaterial({color: WEAPONS[s.weapon].color}));
    ring.rotation.x=Math.PI/2; group.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,2.4,12,1,true),
      new THREE.MeshBasicMaterial({color: WEAPONS[s.weapon].color, transparent:true, opacity:0.1, side:THREE.DoubleSide, depthWrite:false}));
    group.add(beam);
    const light = new THREE.PointLight(WEAPONS[s.weapon].color, 6, 7);
    group.add(light);
    scene.add(group);
    pickups.push({ id:s.id, weapon:s.weapon, pos:s.pos.clone(), group, gun, ring, available:true, timer:0 });
  }
}

// ---------- input ----------
let inputBound=false;
function bindInputOnce(){
  if(inputBound) return; inputBound=true;
  if(touchMode) bindTouchControls();
  addEventListener('keydown', e=>{
    if(e.code==='Tab'){ e.preventDefault(); $('scoreboard').classList.remove('hidden'); refreshScoreboard(); }
    const fresh=!keys[e.code];
    keys[e.code]=true;
    if(e.code==='Space') { input.jumpHeld=true; if(fresh) input.jumpPressed=true; e.preventDefault(); }
    if(e.code==='KeyR') tryReload();
    if(e.code==='KeyM'){ muted=toggleMute(); toast(`${muted?'MUTED':'SOUND ON'}`); }
    for(let i=0;i<WEAPON_ORDER.length;i++) if(e.code==='Digit'+(i+1)) switchWeapon(WEAPON_ORDER[i]);
    if(e.code==='KeyC'||e.code==='ControlLeft') { if(fresh) input.slidePressed=true; input.crouch=true; }
  });
  addEventListener('keyup', e=>{
    keys[e.code]=false;
    if(e.code==='Tab') $('scoreboard').classList.add('hidden');
    if(e.code==='Space') input.jumpHeld=false;
    if(e.code==='KeyC'||e.code==='ControlLeft') input.crouch=false;
  });
  addEventListener('mousedown', e=>{
    if(!player || document.pointerLockElement!==canvas) return;
    if(e.button===0) input.firing=true;
    if(e.button===2 && !player.reloading) player.adsTarget=1;
  });
  addEventListener('mouseup', e=>{
    if(e.button===0) input.firing=false;
    if(e.button===2 && player) player.adsTarget=0;
  });
  addEventListener('contextmenu', e=>e.preventDefault());
  addEventListener('mousemove', e=>{
    if(document.pointerLockElement!==canvas || !player || !player.alive) return;
    const sens = 0.0022 * (1-player.ads*0.4);
    player.yaw -= e.movementX*sens;
    player.pitch -= e.movementY*sens;
    player.pitch = THREE.MathUtils.clamp(player.pitch, -1.45, 1.45);
    viewSwayX=THREE.MathUtils.clamp(viewSwayX+e.movementX*0.00022,-0.045,0.045);
    viewSwayY=THREE.MathUtils.clamp(viewSwayY+e.movementY*0.00017,-0.035,0.035);
  });
  addEventListener('wheel', e=>{
    if(!player) return;
    const owned = WEAPON_ORDER.filter(w=>player.owned.has(w));
    if(!owned.length) return;
    let i = owned.indexOf(player.current);
    i = (i + (e.deltaY>0?1:-1) + owned.length)%owned.length;
    switchWeapon(owned[i]);
  });
  canvas.addEventListener('click', ()=>{ if(hud.classList.contains('hidden')===false && document.pointerLockElement!==canvas) requestGameLock(); resumeAudio(); });
  $('btn-resume').addEventListener('click', ()=>{ requestGameLock(); resumeAudio(); });
  document.addEventListener('pointerlockchange', ()=>{
    if(touchMode) return;
    const unlocked=document.pointerLockElement!==canvas;
    $('focus-overlay').classList.toggle('hidden', !unlocked || matchOver || hud.classList.contains('hidden'));
    if(unlocked){ keys={}; input.firing=0; input.jumpHeld=0; input.jumpPressed=0; input.slidePressed=0; if(player) player.adsTarget=0; }
  });
  addEventListener('blur', resetControls);
  document.addEventListener('visibilitychange', ()=>{ if(document.hidden) resetControls(); });
}

function pollKeys(){
  if(!touchMode && document.pointerLockElement!==canvas){ input.f=input.b=input.l=input.r=input.sprint=0; return; }
  input.f = Math.max(keys['KeyW']||keys['ArrowUp']?1:0, touchMode?Math.max(0,-touchMove.y):0);
  input.b = Math.max(keys['KeyS']||keys['ArrowDown']?1:0, touchMode?Math.max(0,touchMove.y):0);
  input.l = Math.max(keys['KeyA']||keys['ArrowLeft']?1:0, touchMode?Math.max(0,-touchMove.x):0);
  input.r = Math.max(keys['KeyD']||keys['ArrowRight']?1:0, touchMode?Math.max(0,touchMove.x):0);
  input.sprint = (keys['ShiftLeft']||keys['ShiftRight'] || (touchMode && touchMove.y < -0.78))?1:0;
}

function resetControls(){
  keys={}; touchMove={x:0,y:0}; movePointer=null; lookPointer=null;
  $('move-knob').style.transform='translate(-50%,-50%)';
  input.f=input.b=input.l=input.r=input.sprint=0;
  input.firing=0; input.jumpHeld=0; input.jumpPressed=0; input.slidePressed=0; input.crouch=0;
  if(player) player.adsTarget=0;
  for(const button of $('touch-controls').querySelectorAll('button')) button.classList.remove('pressed');
}

function bindTouchControls(){
  const stick=$('move-stick'), knob=$('move-knob');
  const updateStick=e=>{
    const rect=stick.getBoundingClientRect();
    const radius=rect.width*0.36;
    const dx=e.clientX-(rect.left+rect.width/2), dy=e.clientY-(rect.top+rect.height/2);
    const scale=Math.min(1,radius/(Math.hypot(dx,dy)||1));
    const x=dx*scale/radius, y=dy*scale/radius;
    touchMove={x:Math.abs(x)<0.12?0:x,y:Math.abs(y)<0.12?0:y};
    knob.style.transform=`translate(calc(-50% + ${dx*scale}px),calc(-50% + ${dy*scale}px))`;
  };
  stick.addEventListener('pointerdown', e=>{
    if(movePointer!==null) return;
    e.preventDefault(); movePointer=e.pointerId; stick.setPointerCapture(e.pointerId); updateStick(e);
  });
  stick.addEventListener('pointermove', e=>{ if(e.pointerId===movePointer) updateStick(e); });
  const stopMove=e=>{ if(e.pointerId!==movePointer) return; movePointer=null; touchMove={x:0,y:0}; knob.style.transform='translate(-50%,-50%)'; };
  stick.addEventListener('pointerup', stopMove);
  stick.addEventListener('pointercancel', stopMove);
  stick.addEventListener('lostpointercapture', stopMove);

  canvas.addEventListener('pointerdown', e=>{
    if(e.pointerType!=='touch' || lookPointer!==null || hud.classList.contains('hidden') || matchOver) return;
    e.preventDefault(); lookPointer=e.pointerId; lookX=e.clientX; lookY=e.clientY;
    canvas.setPointerCapture(e.pointerId); resumeAudio();
  });
  canvas.addEventListener('pointermove', e=>{
    if(e.pointerId!==lookPointer || !player?.alive) return;
    const dx=e.clientX-lookX, dy=e.clientY-lookY; lookX=e.clientX; lookY=e.clientY;
    const sens=0.005*(1-player.ads*0.4);
    player.yaw-=dx*sens;
    player.pitch=THREE.MathUtils.clamp(player.pitch-dy*sens,-1.45,1.45);
    viewSwayX=THREE.MathUtils.clamp(viewSwayX+dx*0.00022,-0.045,0.045);
    viewSwayY=THREE.MathUtils.clamp(viewSwayY+dy*0.00017,-0.035,0.035);
  });
  const stopLook=e=>{ if(e.pointerId===lookPointer) lookPointer=null; };
  canvas.addEventListener('pointerup', stopLook);
  canvas.addEventListener('pointercancel', stopLook);
  canvas.addEventListener('lostpointercapture', stopLook);

  const hold=(id,down,up)=>{
    const button=$(id);
    button.addEventListener('pointerdown',e=>{
      e.preventDefault(); button.setPointerCapture(e.pointerId); button.classList.add('pressed'); down(); resumeAudio();
    });
    const release=()=>{ button.classList.remove('pressed'); up(); };
    button.addEventListener('pointerup',release);
    button.addEventListener('pointercancel',release);
    button.addEventListener('lostpointercapture',release);
  };
  hold('touch-fire',()=>input.firing=1,()=>input.firing=0);
  hold('touch-aim',()=>{ if(player && !player.reloading) player.adsTarget=1; },()=>{ if(player) player.adsTarget=0; });
  hold('touch-jump',()=>{ if(!input.jumpHeld) input.jumpPressed=1; input.jumpHeld=1; },()=>input.jumpHeld=0);
  hold('touch-slide',()=>{ input.slidePressed=1; input.crouch=1; },()=>input.crouch=0);
  $('touch-reload').addEventListener('click',tryReload);
  $('touch-scores').addEventListener('click',()=>{
    const board=$('scoreboard'); board.classList.toggle('hidden');
    if(!board.classList.contains('hidden')) refreshScoreboard();
  });
}

// ---------- weapons ----------
function switchWeapon(id){
  if(!player || !WEAPONS[id]) return;
  if(player.switchTo(id)){
    me.weapon=id;
    showWeaponView(id);
    SFX.equip();
    buildWeaponSlots();
    net?.updatePresence({ weapon:id });
  }
}
function showWeaponView(id){
  camera.remove(viewHolder);
  viewHolder = makeWeaponView(id);
  viewHolder.position.y=-0.20;
  camera.add(viewHolder);
}
function tryReload(){
  if(player?.startReload()) SFX.reload();
}
function buildWeaponSlots(){
  const el=$('weapon-slots'); el.innerHTML='';
  WEAPON_ORDER.forEach((id,i)=>{
    const d=document.createElement('button');
    d.type='button';
    d.className='wslot'+(player.current===id?' active':'')+(player.owned.has(id)?' has':'');
    d.disabled=!player.owned.has(id);
    d.setAttribute('aria-label', `${WEAPONS[id].name}${player.owned.has(id)?'':' locked'}`);
    d.addEventListener('click',()=>switchWeapon(id));
    d.innerHTML=`<span class="k">${i+1}</span><span>${WEAPONS[id].emoji}</span>`;
    el.appendChild(d);
  });
  $('weapon-name').textContent = WEAPONS[player.current].name;
}

// ---------- shooting ----------
const _rcDir = new THREE.Vector3();
function rayVsWorld(origin, dir, maxDist){
  // returns {dist, point} nearest wall hit
  let best = maxDist;
  const o=origin, d=dir;
  for(const c of ARENA.colliders){
    let tmin=0, tmax=best, ok=true;
    for(const ax of ['x','y','z']){
      const oo=o[ax], dd=d[ax];
      if(Math.abs(dd)<1e-9){ if(oo<c.min[ax]||oo>c.max[ax]){ok=false;break;} }
      else { let t1=(c.min[ax]-oo)/dd, t2=(c.max[ax]-oo)/dd; if(t1>t2){const t=t1;t1=t2;t2=t;} tmin=Math.max(tmin,t1); tmax=Math.min(tmax,t2); if(tmin>tmax){ok=false;break;} }
    }
    if(ok && tmin>0.05 && tmin<best) best=tmin;
  }
  // ground plane y=0 if pointing down
  if(d.y<-1e-6){
    const t=-o.y/d.y;
    if(t>0.05&&t<best) best=t;
  }
  return best;
}

function rayVsPlayer(origin, dir, targetPos, radius=0.5, height=1.7){
  // capsule approx: two spheres (head + torso)
  let best=null;
  const dx=targetPos.x-origin.x, dz=targetPos.z-origin.z;
  for(let i=0;i<2;i++){
    const dy=targetPos.y+(i===0?1.5:0.9)-origin.y;
    const t=dx*dir.x+dy*dir.y+dz*dir.z;
    if(t<0) continue;
    const ex=dx-dir.x*t, ey=dy-dir.y*t, ez=dz-dir.z*t;
    const r=i===0?0.34:0.5;
    if(ex*ex+ey*ey+ez*ez<r*r && (!best||t<best.t)) best={t, head:i===0};
  }
  return best;
}

function addEnemyHealthBar(target){
  const bar=document.createElement('div');
  bar.className='enemy-health hidden';
  const fill=document.createElement('div');
  fill.className='enemy-health-fill';
  bar.append(fill);
  enemyHealthBars.append(bar);
  target.healthBar=bar;
  target.healthFill=fill;
}

function hideEnemyHealthBars(){
  for(const bar of enemyHealthBars.children) bar.classList.add('hidden');
}

const healthAnchor=new THREE.Vector3(), healthSight=new THREE.Vector3();
function updateEnemyHealthBars(){
  if(!player.alive || matchOver || (!touchMode && document.pointerLockElement!==canvas)){
    hideEnemyHealthBars();
    return;
  }
  camera.updateMatrixWorld();
  const targets=mode==='solo' ? bots : (net ? net.remotes.values() : []);
  for(const target of targets){
    const bar=target.healthBar;
    if(!bar) continue;
    bar.classList.add('hidden');
    const pos=mode==='solo' ? target.pos : target.meshPos;
    if(!target.alive || !target.mesh?.visible || !pos) continue;
    healthSight.set(pos.x,pos.y+1.65,pos.z);
    const distance=healthSight.distanceTo(camera.position);
    if(distance<0.5 || distance>55) continue;
    healthAnchor.set(pos.x,pos.y+2.48,pos.z).project(camera);
    if(healthAnchor.z<-1 || healthAnchor.z>1 || Math.abs(healthAnchor.x)>0.98 || Math.abs(healthAnchor.y)>0.98) continue;
    healthSight.sub(camera.position).normalize();
    if(rayVsWorld(camera.position,healthSight,distance-0.2)<distance-0.2) continue;
    const health=Math.max(0,Math.min(100,target.health ?? 100));
    target.healthFill.style.width=`${health}%`;
    bar.classList.toggle('low',health<35);
    bar.style.left=`${(healthAnchor.x+1)*innerWidth/2}px`;
    bar.style.top=`${(1-healthAnchor.y)*innerHeight/2}px`;
    bar.classList.remove('hidden');
  }
}

function localFire(){
  const w = WEAPONS[player.current];
  if(!player.canFire()){
    if(player.mag[player.current]<=0 && !player.reloading){ tryReload(); SFX.dry(); }
    return;
  }
  player.consumeShot();
  SFX.shoot(player.current);
  const spread = THREE.MathUtils.lerp(w.spread, w.adsSpread, player.ads);
  const eye = player.eyePos();
  const baseDir = player.forward();
  // recoil applied to camera
  player.pitch += w.kick*0.35;
  camShake = Math.min(1, camShake + w.kick*8);
  crosshairBloom=Math.min(13,crosshairBloom+(player.current==='scatter'?9:player.current==='rail'?7:3.5));
  viewMuzzleFlash.material.opacity=1;
  viewMuzzleFlash.material.color.setHex(w.color);
  viewLight.color.setHex(w.color); viewLight.intensity=14;
  viewHolder.position.z = 0.09; // kickback, recovered in loop

  const pellets = w.pellets||1;
  const muzzleWorld = new THREE.Vector3();
  const muzzles=viewHolder.userData.muzzles;
  const muzzle=muzzles?muzzles[(w.mag-player.mag[player.current]-1)%muzzles.length]:viewHolder.userData.muzzle;
  muzzle.getWorldPosition(muzzleWorld);
  viewMuzzleFlash.position.copy(camera.worldToLocal(muzzleWorld.clone()));
  viewLight.position.copy(viewMuzzleFlash.position);

  if(player.current==='plasma' || player.current==='rocket'){
    const dir = baseDir.clone();
    dir.x+=(Math.random()-0.5)*spread*2; dir.y+=(Math.random()-0.5)*spread*2; dir.z+=(Math.random()-0.5)*spread*2; dir.normalize();
    const velocity=dir.multiplyScalar(w.projectileSpeed).add(player.vel);
    fx.spawnProjectile(player.current, muzzleWorld, velocity, me.id);
    fx.impact(muzzleWorld, w.color, 4, 3);
    if(mode==='multi') net.sendShot(muzzleWorld, velocity.clone().normalize(), player.current);
    if(player.mag[player.current]<=0) setTimeout(()=>{ if(player && player.mag[player.current]<=0) tryReload(); }, 250);
    buildWeaponSlots();
    return;
  }

  let shotDamage=0, shotHead=false, shotKill=false, impactBursts=0;
  for(let i=0;i<pellets;i++){
    const dir = baseDir.clone();
    dir.x+=(Math.random()-0.5)*spread*2; dir.y+=(Math.random()-0.5)*spread*2; dir.z+=(Math.random()-0.5)*spread*2; dir.normalize();
    const wallDist = rayVsWorld(eye, dir, w.range);
    // find nearest hittable character
    let bestT=wallDist, hit=null, hitHead=false;
    const targets=[];
    if(mode==='solo') for(const b of bots){ if(b.alive) targets.push({pos:b.pos, ref:b, isBot:true}); }
    else for(const [id,r] of (net?.remotes || [])){ if(r.alive!==false && r.pos){ targets.push({pos:new THREE.Vector3(r.pos.x,r.pos.y,r.pos.z), ref:{id,name:r.name}, isBot:false, rid:id}); } }
    for(const t of targets){
      const h=rayVsPlayer(eye, dir, t.pos);
      if(h && h.t<bestT){ bestT=h.t; hit=t; hitHead=h.head; }
    }
    const end = eye.clone().addScaledVector(dir, bestT);
    // tracer from muzzle to end
    const tcol = w.tracer==='magenta'?0xe879f9 : w.tracer==='orange'?0xfb923c : w.tracer==='amber'?0xffd166 : w.tracer==='rail'?0xffffff : w.tracer==='green'?0x4ade80 : 0x22d3ee;
    fx.tracer(muzzleWorld, end, tcol, player.current==='rail'?0.05:0.025, player.current==='rail'?0.22:0.08);
    if(hit){
      const dmg = Math.round(w.dmg * (hitHead?w.headMul:1) * (bestT>w.range*0.6?0.7:1));
      if(impactBursts<2 || (hitHead && !shotHead)){ fx.hitBurst(end,hitHead); impactBursts++; }
      shotDamage+=dmg;
      shotHead ||= hitHead;
      if(mode==='solo'){
        shotKill=damageBot(hit.ref, dmg, me.name, player.current, hitHead) || shotKill;
      } else {
        net.sendDamage(hit.rid, dmg, player.current, hitHead);
        const targetMesh=net.remotes.get(hit.rid)?.mesh;
        if(targetMesh) targetMesh.userData.hitReact=Math.max(targetMesh.userData.hitReact||0,Math.min(1,dmg/45));
        // optimistic tracer already shown; victim confirms
      }
      if(player.current==='rail'){ fx.impact(end, 0xffffff, 8, 9); }
    } else {
      if(bestT<w.range) fx.impact(end, w.color, player.current==='rail'?10:5, 5);
    }
  }
  if(shotDamage) showImpactFeedback(shotDamage,shotHead,shotKill);
  if(mode==='multi') net.sendShot(eye, baseDir, player.current);
  if(player.mag[player.current]<=0) setTimeout(()=>{ if(player && player.mag[player.current]<=0) tryReload(); }, 250);
  buildWeaponSlots();
}

function damageBot(bot, dmg, killerName, weapon, head, killerBot=null){
  if(!bot.alive) return false;
  if(bot.mesh) bot.mesh.userData.hitReact=Math.max(bot.mesh.userData.hitReact||0,Math.min(1,dmg/45));
  bot.health -= dmg;
  if(bot.health<=0){
    bot.alive=false; bot.deaths++; bot.streak=0;
    bot.respawnT=2.5+Math.random();
    bot.resetLoadout();
    setPlayerWeapon(bot.mesh, 'pulse');
    bot.lastGun='pulse';
    if(killerBot){
      killerBot.kills++; killerBot.streak++; killerBot.best=Math.max(killerBot.best,killerBot.streak);
    } else {
      me.kills++; me.streak++; me.best=Math.max(me.best,me.streak);
    }
    addKillfeed(killerName||me.name, bot.name, weapon, !killerBot);
    if(!killerBot){ SFX.kill(); showHitmarker(true); toast(`ELIMINATED ${bot.name}`); }
    if(mode==='solo') checkSoloEnd();
    return true;
  }
  return false;
}

function damageLocal(dmg, fromName, weapon, fromId=null){
  if(!player.alive || matchOver) return;
  player.health -= dmg;
  SFX.hurt();
  const damageOverlay=$('damage-overlay');
  damageOverlay.style.opacity=Math.min(1,0.35+dmg/110);
  clearTimeout(damageOverlay._timer);
  damageOverlay._timer=setTimeout(()=>damageOverlay.style.opacity=0,160);
  camShake=Math.min(1,camShake+0.2+dmg/180);
  showDamageDirection(fromId);
  if(player.health<=0){
    player.health=0; player.alive=false; player.respawnT=3;
    player.adsTarget=0;
    const lostWeapon = player.current !== 'pulse';
    player.resetLoadout();
    if(lostWeapon) showWeaponView('pulse');
    buildWeaponSlots();
    me.alive=false; me.deaths++; me.streak=0; me.weapon='pulse';
    net?.updatePresence({ alive:false, deaths: me.deaths, weapon:'pulse' });
    showRespawn(fromName, weapon);
    addKillfeed(fromName||'???', me.name, weapon||'pulse', false);
    if(mode==='multi' && net){
      // victim reports the kill so killer gets credit + persistent feed
      const killerId = fromId || 'unknown';
      try {
        net.channel?.send({ type:'broadcast', event:'kill', payload:{ killer:killerId, killerName:fromName||'???', victim:me.id, victimName:me.name, weapon:weapon||'pulse', t:Date.now() }});
      } catch(e){}
      net.reportKill(killerId, fromName||'???', me.id, me.name, weapon||'pulse');
      net.touchProfile();
    }
  }
}

function killRemotePlayer(victimId, victimName, weapon){
  // local killed a remote (we received their death? or we landed killing blow and victim confirms via kill event)
  me.kills++; me.streak++; me.best=Math.max(me.best,me.streak);
  me.weapon=player.current;
  net.updatePresence({ kills: me.kills, best: me.best });
  net.sendKill(victimId, victimName, weapon);
  net.reportKill(me.id, me.name, victimId, victimName, weapon);
  net.touchProfile();
  SFX.kill(); showHitmarker(true);
  addKillfeed(me.name, victimName, weapon, true);
  toast(`ELIMINATED ${victimName}`);
}

function showHitmarker(kill,head=false){
  const h=$('hitmarker'); h.classList.remove('show','kill','head'); void h.offsetWidth;
  h.classList.add('show'); if(kill) h.classList.add('kill');
  else if(head) h.classList.add('head');
}
function showImpactFeedback(damage,head=false,kill=false,splash=false){
  showHitmarker(kill,head);
  if(!kill) SFX.hit(head);
  const container=$('damage-numbers');
  const number=document.createElement('div');
  number.className='damage-number'+(head?' head':'')+(splash?' splash':'');
  number.textContent=`${head?'CRIT ':splash?'BLAST ':''}+${damage}`;
  number.style.left=`calc(50% + ${Math.round((Math.random()-.5)*45)}px)`;
  number.style.top=`calc(50% + ${head?23:34}px)`;
  container.append(number);
  while(container.children.length>8) container.firstChild.remove();
  setTimeout(()=>number.remove(),700);
}
function showDamageDirection(fromId){
  const attacker=bots.find(b=>b.id===fromId) || net?.remotes.get(fromId);
  const pos=attacker?.meshPos || attacker?.pos;
  if(!pos) return;
  const dx=pos.x-player.pos.x, dz=pos.z-player.pos.z;
  const angle=Math.atan2(dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw),-dx*Math.sin(player.yaw)-dz*Math.cos(player.yaw));
  const indicator=$('damage-direction');
  indicator.style.transform=`translate(-50%,-50%) rotate(${angle}rad)`;
  indicator.style.opacity=0.85;
  clearTimeout(indicator._timer);
  indicator._timer=setTimeout(()=>indicator.style.opacity=0,450);
}
function toast(t){
  const el=$('pickup-toast'); el.textContent=t; el.style.opacity=1;
  clearTimeout(el._t); el._t=setTimeout(()=>el.style.opacity=0, 1600);
}
function addKillfeed(killer, victim, weapon, isMe){
  const d=document.createElement('div');
  d.className='kf'+(isMe||killer===me.name?' me':'');
  d.innerHTML=`<b>${escapeHtml(killer)}</b> <span class="w">[${escapeHtml((WEAPONS[weapon]?.name||weapon||'').split(' ')[0])}]</span> <b>${escapeHtml(victim)}</b>`;
  killfeedEl.prepend(d);
  while(killfeedEl.children.length>6) killfeedEl.lastChild.remove();
  setTimeout(()=>{ d.style.opacity=0; setTimeout(()=>d.remove(),400); }, 5200);
}
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function showRespawn(killer, weapon){
  const o=$('respawn-overlay'); o.classList.remove('hidden');
  $('respawn-sub').textContent = killer? `by ${killer} · ${WEAPONS[weapon]?.name||weapon}` : 'stay frosty';
}
function hideRespawn(){ $('respawn-overlay').classList.add('hidden'); }

function respawnLocal(){
  const avoid=[...bots.filter(b=>b.alive).map(b=>b.pos)];
  for(const [,r] of (net?.remotes || [])) if(r.pos&&r.alive!==false) avoid.push(new THREE.Vector3(r.pos.x,r.pos.y,r.pos.z));
  const s=pickSpawn(avoid);
  player.pos.copy(s.pos); player.vel.set(0,0,0); player.yaw=s.yaw; player.pitch=0;
  player.health=100; player.alive=true; player.fuel=MOVE.fuelMax;
  player.ads=0; player.adsTarget=0;
  player.mag[player.current]=WEAPONS[player.current].mag; player.reloading=false;
  me.alive=true; me.weapon=player.current;
  hideRespawn(); SFX.spawn();
  $('heal-overlay').style.opacity=1; setTimeout(()=>$('heal-overlay').style.opacity=0,300);
  net?.updatePresence({ alive:true });
}

// ---------- net events ----------
function onNetEvent(type, p){
  if(type==='connected'){ refreshScoreboard(); }
  else if(type==='host'){ refreshScoreboard(); }
  else if(type==='disconnected'){ refreshScoreboard(); setNetStatus('conn', `RECONNECTING · ${p.status.replace('_',' ')}`); }
  else if(type==='join'){ addKillfeed('»', p.name+' joined', 'pulse', false); refreshScoreboard(); }
  else if(type==='leave'){ if(p.mesh) scene.remove(p.mesh); p.healthBar?.remove(); addKillfeed('«', (p.name||'player')+' left', 'pulse', false); refreshScoreboard(); }
  else if(type==='shot'){
    // remote muzzle + tracer visual
    const o=new THREE.Vector3(p.o[0],p.o[1],p.o[2]);
    const d=new THREE.Vector3(p.d[0],p.d[1],p.d[2]);
    const r=net?.remotes.get(p.id);
    const col = p.weapon==='rail'?0xffffff: WEAPONS[p.weapon]?.color ?? 0xffffff;
    if(p.weapon==='plasma' || p.weapon==='rocket'){
      fx.spawnProjectile(p.weapon, o, d.normalize().multiplyScalar(WEAPONS[p.weapon].projectileSpeed), p.id);
    } else if(r?.meshPos){
      const from=r.meshPos.clone().add(new THREE.Vector3(0,1.4,0.5));
      const end=o.clone().addScaledVector(d, 30);
      fx.tracer(from, end, col, p.weapon==='rail'?0.05:0.025, 0.08);
    }
    const rm=net?.remotes.get(p.id); if(rm) rm.firing=true, setTimeout(()=>{rm.firing=false;},120);
  }
  else if(type==='dmg'){
    // someone damaged us? (victim-authoritative)
    if(p.to===me.id && player.alive){
      damageLocal(p.dmg, p.fromName, p.weapon, p.from);
    }
  }
  else if(type==='kill'){
    // someone reports a kill (victim reports so killer gets credit)
    if(p.killer===me.id){
      me.kills++; me.streak++; me.best=Math.max(me.best,me.streak);
      net.updatePresence({ kills: me.kills, best: me.best });
      net.touchProfile();
      SFX.kill(); showHitmarker(true);
      addKillfeed(me.name, p.victimName||'???', p.weapon, true);
      toast(`ELIMINATED ${p.victimName||'enemy'}`);
    }
    else if(p.victim===me.id){ /* our death already handled via dmg */ refreshScoreboard(); }
    else {
      addKillfeed(p.killerName||'???', p.victimName||'???', p.weapon, false);
    }
    refreshScoreboard();
  }
  else if(type==='killrow'){
    addKillfeed(p.killer_name||'???', p.victim_name||'???', p.weapon, false);
  }
  else if(type==='pickup'){
    const pk=pickups.find(x=>x.id===p.spot);
    if(pk && pk.available){ pk.available=false; pk.timer=12; pk.group.visible=false; }
  }
}

function setNetStatus(kind, txt){
  $('net-text').textContent=txt;
  const dot=$('net-dot');
  dot.className='';
  if(kind==='on') dot.classList.add('on');
  if(kind==='solo') dot.classList.add('solo');
}
function updateRoomStatus(){
  if(!net?.connected) return;
  const role = net.hostId===me.id ? 'HOST' : 'JOINED';
  setNetStatus('on', `ONLINE · ${net.list().length+1}/8 · ${role}`);
}

// ---------- scoreboard ----------
function standings(){
  const rows=[];
  rows.push({id:me.id, name:me.name, color:me.color, kills:me.kills, deaths:me.deaths, best:me.best, me:true, alive:player?.alive, ping: net?.connected?'~40':'—'});
  if(mode==='solo'){
    for(const b of bots) rows.push({name:b.name, color:b.color, kills:b.kills, deaths:b.deaths, best:b.best, alive:b.alive, ping:'BOT'});
  } else {
    for(const r of net?.list()||[]) rows.push({id:r.id, name:r.name, color:r.color, kills:r.kills||0, deaths:r.deaths||0, best:r.best||0, alive:r.alive, ping:'~50'});
  }
  rows.sort((a,b)=>b.kills-a.kills || a.deaths-b.deaths);
  return rows;
}
function refreshScoreboard(){
  const rows=standings();
  $('sb-count').textContent=`· ${rows.length}/8`;
  const el=$('sb-rows'); el.innerHTML='';
  rows.forEach((r,i)=>{
    const d=document.createElement('div');
    d.className='sb-row'+(r.me?' me':'')+(r.alive===false?' dead':'');
    d.innerHTML=`<span>${i+1}</span><span class="nm" style="color:${r.color}">${escapeHtml(r.name)}${r.me?' (YOU)':''}${mode==='multi'&&r.id===net?.hostId?' (HOST)':''}</span><span>${r.kills}</span><span>${r.deaths}</span><span>${r.best||0}</span><span>${r.ping}</span>`;
    el.appendChild(d);
  });
  updateRoomStatus();
}

// ---------- solo end ----------
function checkSoloEnd(){
  const top=[{name:me.name,kills:me.kills},...bots.map(b=>({name:b.name,kills:b.kills}))].sort((a,b)=>b.kills-a.kills)[0];
  if(top.kills>=soloEnd && !matchOver){
    matchOver=true;
    const rows=standings();
    const win=rows[0].me;
    showEnd(win?'VICTORY':'DEFEAT', win?'TOP OF THE FORGE':'BETTER LUCK, RUNNER', rows);
  }
}
function showEnd(title, sub, rows){
  endScreen.classList.remove('hidden');
  document.exitPointerLock?.();
  $('end-title').textContent=title;
  $('end-title').style.color = title==='VICTORY'?'#4ade80':'#ff3860';
  $('end-sub').textContent=sub;
  const el=$('end-rows'); el.innerHTML='';
  rows.forEach((r,i)=>{
    const d=document.createElement('div');
    d.className='sb-row'+(r.me?' me':'');
    d.style.cssText='background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)';
    d.innerHTML=`<span>${i+1}</span><span class="nm" style="color:${r.color}">${escapeHtml(r.name)}</span><span>${r.kills}K</span><span>${r.deaths}D</span><span>${r.best||0}</span><span></span>`;
    el.appendChild(d);
  });
}

// ---------- main loop ----------
function movePlasma(pr, dt){
  pr.vel.y-=4*dt;
  let remaining=dt;
  const radius=0.22;
  for(let bounce=0; bounce<4 && remaining>0.0001; bounce++){
    const pos=pr.mesh.position;
    const move=pr.vel.clone().multiplyScalar(remaining);
    let hitT=1, hitNormal=null;
    for(const c of ARENA.colliders){
      let entry=-Infinity, exit=Infinity, normal=null, missed=false;
      for(const axis of ['x','y','z']){
        const min=c.min[axis]-radius, max=c.max[axis]+radius;
        const speed=move[axis];
        if(Math.abs(speed)<0.000001){
          if(pos[axis]<min || pos[axis]>max){ missed=true; break; }
          continue;
        }
        const near=Math.min((min-pos[axis])/speed,(max-pos[axis])/speed);
        const far=Math.max((min-pos[axis])/speed,(max-pos[axis])/speed);
        if(near>entry){
          entry=near;
          normal=new THREE.Vector3(0,0,0);
          normal[axis]=speed>0?-1:1;
        }
        exit=Math.min(exit,far);
      }
      if(!missed && entry>=0 && entry<=exit && entry<=hitT && exit>=0){
        hitT=entry; hitNormal=normal;
      }
    }
    if(!hitNormal){ pos.add(move); break; }
    pos.addScaledVector(move,hitT).addScaledVector(hitNormal,0.005);
    const inward=pr.vel.dot(hitNormal);
    if(inward<0) pr.vel.addScaledVector(hitNormal,-(1+WEAPONS.plasma.bounce)*inward);
    pr.vel.multiplyScalar(0.9);
    pr.bounces++;
    fx.impact(pos, WEAPONS.plasma.color, 5, 4);
    if(pr.bounces>=WEAPONS.plasma.bounces) return true;
    remaining*=1-hitT;
  }
  return false;
}

function moveRocket(pr, dt){
  pr.previous=pr.mesh.position.clone();
  const distance=pr.vel.length()*dt;
  const direction=pr.vel.clone().normalize();
  const wallDistance=rayVsWorld(pr.previous,direction,distance);
  pr.mesh.position.addScaledVector(direction,wallDistance);
  return wallDistance<distance-0.0001;
}

function rocketContact(pr, targetPos){
  const start=pr.previous, end=pr.mesh.position;
  const center=new THREE.Vector3(targetPos.x,targetPos.y+1,targetPos.z);
  const segment=new THREE.Vector3().subVectors(end,start);
  const lengthSq=segment.lengthSq();
  const t=lengthSq?THREE.MathUtils.clamp(new THREE.Vector3().subVectors(center,start).dot(segment)/lengthSq,0,1):0;
  const point=start.clone().addScaledVector(segment,t);
  return point.distanceTo(center)<0.98?point:null;
}

function splashDamage(weapon, distance){
  if(distance>=weapon.splashR) return 0;
  const edge=distance/weapon.splashR;
  return Math.round(weapon.splash*(1-0.75*edge*edge));
}

function detonatePlasma(pr, directId){
  const pp=pr.mesh.position;
  const weapon=pr.weapon||'plasma';
  const w=WEAPONS[weapon];
  let dealt=0, killed=false;
  if(mode==='solo'){
    const owner=bots.find(b=>b.id===pr.owner);
    if(pr.owner!==me.id && player.alive && directId!==me.id){
      const damage=splashDamage(w,pp.distanceTo(new THREE.Vector3(player.pos.x,player.pos.y+1,player.pos.z)));
      if(damage) damageLocal(damage,owner?.name||'???',weapon,pr.owner);
    }
    for(const b of bots){
      if(!b.alive || b.id===pr.owner || b.id===directId) continue;
      const damage=splashDamage(w,pp.distanceTo(new THREE.Vector3(b.pos.x,b.pos.y+1,b.pos.z)));
      if(damage){
        killed=damageBot(b,damage,owner?.name||me.name,weapon,false,owner) || killed;
        if(pr.owner===me.id) dealt+=damage;
      }
    }
  } else if(pr.owner===me.id){
    for(const [id,r] of net.remotes){
      if(r.alive===false || !r.meshPos || id===directId) continue;
      const damage=splashDamage(w,pp.distanceTo(new THREE.Vector3(r.meshPos.x,r.meshPos.y+1,r.meshPos.z)));
      if(damage){
        net.sendDamage(id,damage,weapon,false);
        if(r.mesh) r.mesh.userData.hitReact=Math.max(r.mesh.userData.hitReact||0,Math.min(1,damage/45));
        dealt+=damage;
      }
    }
  }
  if(dealt) showImpactFeedback(dealt,false,killed,true);
  fx.explosion(pp.clone(),w.color); SFX.explosion();
  scene.remove(pr.mesh);
  pr.mesh.geometry.dispose(); pr.mesh.material.dispose();
}

function loop(now){
  requestAnimationFrame(loop);
  let dt=Math.min(0.05,(now-lastTime)/1000); lastTime=now;
  if(mode==='solo' && !touchMode && document.pointerLockElement!==canvas && !matchOver){
    hideEnemyHealthBars();
    renderer.render(scene,camera);
    return;
  }
  sessionT+=dt;
  pollKeys();
  tickArena(dt);
  fx.update(dt);

  // player
  const w=WEAPONS[player.current];
  if(player.alive && !matchOver){
    if(input.firing && player.adsTarget!==1) { /* allow */ }
    const wasAirborne=!player.onGround, fallSpeed=player.vel.y;
    const wasSliding=player.sliding, wasReloading=player.reloading;
    player.update(dt, input);
    input.jumpPressed=false; input.slidePressed=false;
    if(wasAirborne && player.onGround && fallSpeed<-2){
      SFX.land();
      landingKick=Math.min(0.13,-fallSpeed*0.008);
    }
    if(!wasSliding && player.sliding) SFX.slide();
    if(wasReloading && !player.reloading) SFX.reloadEnd();
    if(player.onGround && player.speed2d>1.4 && !player.sliding){
      stepDistance+=player.speed2d*dt;
      if(stepDistance>(input.sprint?2.45:1.95)){ SFX.step(); stepDistance=0; }
    } else stepDistance=0;
    if(player.lastJumpSfx){ SFX.jump(); player.lastJumpSfx=false; }
    if(player.lastDoubleSfx){ SFX.dJump(); player.lastDoubleSfx=false; fx.impact(player.pos.clone().add(new THREE.Vector3(0,0.3,0)),0x22d3ee,6,4); }
    if(player.lastPad){ SFX.jumpPad(); player.lastPad=false; }
    if(player.jetting) SFX.jet();
    if(input.firing && (touchMode || document.pointerLockElement===canvas)) localFire();
    // auto reload prompt
    $('reload-hint').textContent = player.reloading? 'RELOADING…' : player.mag[player.current]<=Math.ceil(w.mag*0.25)? (touchMode?'tap R to reload':'press R to reload') : '';
    // death by falling? no fall damage by design (arena friendly)
    if(!player.alive){ /* handled */ }
    if(player.respawnT!==undefined && !player.alive){
      player.respawnT-=dt;
      $('respawn-timer').textContent=Math.ceil(player.respawnT);
      if(player.respawnT<=0) respawnLocal();
    }
  } else if(!player.alive){
    player.respawnT-=dt;
    $('respawn-timer').textContent=Math.ceil(Math.max(0,player.respawnT));
    if(player.respawnT<=0 && !matchOver) respawnLocal();
  }

  // camera
  const eye=player.eyePos();
  camera.position.copy(eye);
  camera.position.y += Math.sin(bobPhase)*0.03*(player.speed2d>1?1:0)*(1-player.ads*0.84)-landingKick;
  landingKick=Math.max(0,landingKick-dt*0.48);
  camera.rotation.order='YXZ';
  camera.rotation.y=player.yaw;
  camera.rotation.x=player.pitch + player.recoilPitch*0.4;
  camera.rotation.z=THREE.MathUtils.lerp(camera.rotation.z, (input.r-input.l)*0.015 + (player.sliding?0.06:0), 0.15);
  // recoil shake
  if(camShake>0){
    const shake=camShake*(1-player.ads*0.62);
    camera.rotation.x+=(Math.random()-0.5)*shake*0.02;
    camera.rotation.y+=(Math.random()-0.5)*shake*0.02;
    camShake=Math.max(0,camShake-dt*4);
  }
  // Pull out of the sight as the reload starts, including the rail scope overlay.
  const reloadProgress=player.reloading?THREE.MathUtils.clamp(1-player.reloadT/w.reload,0,1):null;
  const visualAds=player.ads*(reloadProgress===null?1:Math.max(0,1-reloadProgress*5));
  const targetFov=THREE.MathUtils.lerp(75, w.adsFov, visualAds);
  if(Math.abs(camera.fov-targetFov)>0.01){ camera.fov=targetFov; camera.updateProjectionMatrix(); }
  // weapon bob/sway/ads position
  bobPhase += dt*(2+player.speed2d*1.4);
  viewSwayX*=Math.exp(-dt*12); viewSwayY*=Math.exp(-dt*12);
  const vw=viewHolder.userData.weapon;
  const bp=viewHolder.userData.basePos;
  const adsPos=viewHolder.userData.adsPos;
  const motion=1-visualAds*0.86;
  const hipBob=new THREE.Vector3(Math.sin(bobPhase)*0.012*motion, Math.abs(Math.cos(bobPhase))*0.014*motion, 0);
  vw.position.lerpVectors(bp.clone().add(hipBob), adsPos, visualAds);
  vw.position.x += viewSwayX*(1-visualAds*0.85);
  vw.position.y -= viewSwayY*(1-visualAds*0.85)+landingKick*0.45;
  vw.rotation.set(viewHolder.userData.baseRot.x + player.recoil*1.2,
    THREE.MathUtils.lerp(viewHolder.userData.baseRot.y,0,visualAds)+viewSwayX*0.25,
    -viewSwayX*0.38);
  animateWeaponReload(viewHolder,reloadProgress);
  vw.visible = player.current!=='rail' || visualAds<0.88;
  viewHolder.position.z = THREE.MathUtils.lerp(viewHolder.position.z, 0, dt*10);
  viewHolder.position.y = THREE.MathUtils.lerp(viewHolder.position.y, 0, Math.min(1,dt*12));
  $('crosshair').classList.toggle('ads', visualAds>0.5);
  $('crosshair').classList.toggle('aimed', visualAds>0.82);
  crosshairBloom=Math.max(0,crosshairBloom-dt*25);
  const movementBloom=Math.min(6,player.speed2d*0.48)+(player.onGround?0:3);
  $('crosshair').style.setProperty('--bloom',`${((movementBloom+crosshairBloom)*(1-visualAds*0.75)).toFixed(1)}px`);
  const adsOverlay=$('ads-overlay');
  adsOverlay.classList.toggle('rail',player.current==='rail');
  adsOverlay.style.opacity=player.current==='rail'?
    THREE.MathUtils.clamp((visualAds-0.36)/0.64,0,1):visualAds*0.36;
  viewMuzzleFlash.material.opacity=Math.max(0,viewMuzzleFlash.material.opacity-dt*10);
  viewMuzzleFlash.rotation.z=Math.random()*Math.PI;
  viewLight.intensity=Math.max(0,viewLight.intensity-dt*120);
  viewMuzzleFlash.visible = player.ads<0.5;

  // bots
  if(mode==='solo' && !matchOver){
    soloTimeLeft-=dt;
    const ctx={ local:{pos:player.pos, alive:player.alive}, bots, pickups,
      onRespawn:(b)=>{ setPlayerWeapon(b.mesh,b.current); },
      onPickup:(b,p)=>{ const pk=pickups.find(x=>x.pos===p.pos||x.id===p.id); setPlayerWeapon(b.mesh,b.current); } };
    // need ctx.pickups with available flags
    for(const b of bots){
      const shot=b.update(dt, ctx);
      // pose + move mesh
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.y=b.yaw;
      const botSpeed=Math.hypot(b.vel.x,b.vel.z);
      const botStrafe=botSpeed>0.1?(b.vel.x*Math.cos(b.yaw)-b.vel.z*Math.sin(b.yaw))/botSpeed:0;
      posePlayer(b.mesh, {speed:botSpeed, jet:b.jetting, firing:b.firing, airborne:!b.onGround, dead:!b.alive, strafe:botStrafe, pitch:b.pitch, posY:b.pos.y}, dt);
      if(b.mesh.userData.gun && b.lastGun!==b.current){ setPlayerWeapon(b.mesh,b.current); b.lastGun=b.current; }
      // bot shots -> test hit vs local player
      if(shot){
        const bw=WEAPONS[shot.weapon];
        SFX.shoot(shot.weapon);
        if(shot.weapon==='plasma' || shot.weapon==='rocket'){
          fx.spawnProjectile(shot.weapon, shot.origin, shot.dir.clone().multiplyScalar(bw.projectileSpeed), b.id);
        } else {
          const pellets=bw.pellets||1;
          for(let i=0;i<pellets;i++){
            const dir=shot.dir.clone();
            dir.x+=(Math.random()-0.5)*bw.spread*2; dir.y+=(Math.random()-0.5)*bw.spread*2; dir.normalize();
            const wallD=rayVsWorld(shot.origin,dir,bw.range);
            let bestT=wallD, victim=null, head=false;
            if(player.alive){
              const h=rayVsPlayer(shot.origin,dir,player.pos);
              if(h&&h.t<bestT){ bestT=h.t; victim=player; head=h.head; }
            }
            for(const other of bots){
              if(other===b||!other.alive) continue;
              const h=rayVsPlayer(shot.origin,dir,other.pos);
              if(h&&h.t<bestT){ bestT=h.t; victim=other; head=h.head; }
            }
            const end=shot.origin.clone().addScaledVector(dir,bestT);
            if(victim){
              const dmg=Math.round(bw.dmg*(head?bw.headMul:1));
              if(victim===player) damageLocal(dmg,b.name,shot.weapon,b.id);
              else damageBot(victim,dmg,b.name,shot.weapon,head,b);
              fx.impact(end,0xff706f,6,5);
            }
            fx.tracer(shot.origin,end,bw.color,0.025,0.08);
            if(!player.alive) break;
          }
        }
        fx.impact(shot.origin, bw.color, 3, 2);
      }
      // bot pickups visuals
      for(const p of pickups){
        if(p.available && b.pos.distanceTo(p.pos)<1.6 && (p.weapon!==b.current||!b.owned.has(p.weapon))){
          p.available=false; p.timer=12; p.group.visible=false;
          SFX.pickup();
        }
      }
    }
    // solo timer end
    if(soloTimeLeft<=0 && !matchOver){
      matchOver=true;
      const rows=standings();
      showEnd(rows[0].me?'VICTORY':'DEFEAT','TIME UP — HIGHEST SCORE WINS',rows);
    }
    // clock shows countdown
    const mm=String(Math.floor(Math.max(0,soloTimeLeft)/60)).padStart(2,'0'), ss=String(Math.floor(Math.max(0,soloTimeLeft)%60)).padStart(2,'0');
    $('session-clock').textContent=`${mm}:${ss} · 1ST TO ${soloEnd}`;
  } else {
    const mm=String(Math.floor(sessionT/60)).padStart(2,'0'), ss=String(Math.floor(sessionT%60)).padStart(2,'0');
    $('session-clock').textContent=`${mm}:${ss} · FOREVER`;
  }

  // multiplayer remotes
  if(mode==='multi' && net){
    net.sendPos({pos:player.pos, yaw:player.yaw, pitch:player.pitch, weapon:player.current, alive:player.alive, health:player.health, jet:player.jetting, firing:input.firing});
    net.me.kills=me.kills; net.me.deaths=me.deaths; net.me.best=me.best; net.me.weapon=player.current; net.me.alive=player.alive;
    for(const [id,r] of net.remotes){
      if(!r.mesh){
        r.mesh=makePlayerMesh(r.color||'#fff', r.name||'GHOST');
        addEnemyHealthBar(r);
        scene.add(r.mesh);
      }
      // interp
      let tp=null, ty=r.yaw, tpitch=r.pitch;
      if(r.buf && r.buf.length){
        // render 100ms behind
        const tRender=performance.now()-100;
        let a=r.buf[0], b=r.buf[r.buf.length-1];
        for(let i=0;i<r.buf.length-1;i++){ if(r.buf[i].t<=tRender && r.buf[i+1].t>=tRender){a=r.buf[i];b=r.buf[i+1];break;} }
        const span=Math.max(1,b.t-a.t);
        const k=THREE.MathUtils.clamp((tRender-a.t)/span,0,1);
        tp=new THREE.Vector3(a.pos.x+(b.pos.x-a.pos.x)*k, a.pos.y+(b.pos.y-a.pos.y)*k, a.pos.z+(b.pos.z-a.pos.z)*k);
        ty=a.yaw+(b.yaw-a.yaw)*k;
      } else if(r.pos){ tp=new THREE.Vector3(r.pos.x,r.pos.y,r.pos.z); }
      if(tp){
        if(!r.meshPos) r.meshPos=tp.clone();
        r.meshPos.lerp(tp, Math.min(1,dt*12));
        // snap if too far (respawn/teleport)
        if(r.meshPos.distanceTo(tp)>6) r.meshPos.copy(tp);
        r.mesh.position.copy(r.meshPos);
        r.mesh.rotation.y=ty;
        // weapon
        if(r.mesh.userData.gunId!==r.weapon){ setPlayerWeapon(r.mesh,r.weapon||'pulse'); r.mesh.userData.gunId=r.weapon; }
        r.mesh.visible=r.alive!==false;
        const previous=r.mesh.userData.lastPosePos;
        const remoteSpeed=previous?Math.min(12,r.meshPos.distanceTo(previous)/Math.max(dt,0.001)):0;
        const dx=previous?r.meshPos.x-previous.x:0, dz=previous?r.meshPos.z-previous.z:0;
        const remoteStrafe=remoteSpeed>0.1?THREE.MathUtils.clamp((dx*Math.cos(ty)-dz*Math.sin(ty))/(remoteSpeed*dt),-1,1):0;
        if(previous) previous.copy(r.meshPos); else r.mesh.userData.lastPosePos=r.meshPos.clone();
        posePlayer(r.mesh,{speed:remoteSpeed,jet:r.jet,firing:r.firing,airborne:!!r.jet,dead:r.alive===false,strafe:remoteStrafe,pitch:tpitch,posY:r.meshPos.y},dt);
        // Update the label without detaching the player from the scene.
        setPlayerName(r.mesh, r.name||'GHOST', r.color||'#fff');
      }
      // timeout ghost removal (30s without presence AND without broadcast)
      const lastSig = Math.max(r.lastSeen||0, r.lastPosRx||0);
      if(performance.now()-lastSig>30000){ scene.remove(r.mesh); r.healthBar?.remove(); net.remotes.delete(id); refreshScoreboard(); }
    }
  }

  // Explosive projectiles (shared)
  for(let i=fx.projectiles.length-1;i>=0;i--){
    const pr=fx.projectiles[i];
    const weapon=pr.weapon||'plasma';
    const projectileWeapon=WEAPONS[weapon];
    const rocket=weapon==='rocket';
    pr.life-=dt;
    let boom=rocket?moveRocket(pr,dt):movePlasma(pr,dt);
    const pp=pr.mesh.position;
    let directId=null;
    // Rockets sweep between frames; plasma still bounces off scenery.
    if(!boom || rocket){
      if(mode==='solo'){
        if(pr.owner===me.id){
          for(const b of bots){ if(!b.alive) continue;
            const contact=rocket?rocketContact(pr,b.pos):pp.distanceTo(new THREE.Vector3(b.pos.x,b.pos.y+1,b.pos.z))<0.9?pp:null;
            if(contact){
              pp.copy(contact);
              const killed=damageBot(b,projectileWeapon.dmg,me.name,weapon,false);
              showImpactFeedback(projectileWeapon.dmg,false,killed);
              boom=true; directId=b.id; break;
            } }
        } else {
          const owner=bots.find(b=>b.id===pr.owner);
          const contact=player.alive && (rocket?rocketContact(pr,player.pos):pp.distanceTo(new THREE.Vector3(player.pos.x,player.pos.y+1,player.pos.z))<0.9?pp:null);
          if(contact){ pp.copy(contact); damageLocal(projectileWeapon.dmg, owner?.name||'???', weapon, pr.owner); boom=true; directId=me.id; }
          if(!directId && (!boom || rocket)) for(const target of bots){
            if(!target.alive || target.id===pr.owner) continue;
            const hit=rocket?rocketContact(pr,target.pos):pp.distanceTo(new THREE.Vector3(target.pos.x,target.pos.y+1,target.pos.z))<0.9?pp:null;
            if(hit){
              pp.copy(hit);
              damageBot(target,projectileWeapon.dmg,owner?.name||'???',weapon,false,owner);
              boom=true; directId=target.id; break;
            }
          }
        }
      } else if(pr.owner===me.id){
        for(const [id,r] of net.remotes){ if(r.alive===false||!r.meshPos) continue;
          const contact=rocket?rocketContact(pr,r.meshPos):pp.distanceTo(new THREE.Vector3(r.meshPos.x,r.meshPos.y+1,r.meshPos.z))<1.0?pp:null;
          if(contact){
            pp.copy(contact);
            net.sendDamage(id, projectileWeapon.dmg, weapon, false);
            if(r.mesh) r.mesh.userData.hitReact=1;
            showImpactFeedback(projectileWeapon.dmg);
            boom=true; directId=id; break;
          } }
      }
    }
    if(boom || pr.life<=0){
      detonatePlasma(pr,directId);
      fx.projectiles.splice(i,1);
    }
  }

  // pickups anim + local pickup
  for(const p of pickups){
    if(!p.available){
      p.timer-=dt;
      if(p.timer<=0){ p.available=true; p.group.visible=true; }
      continue;
    }
    p.gun.rotation.y+=dt*1.2;
    p.group.position.y = p.pos.y+0.7+Math.sin(sessionT*2+p.pos.x)*0.12;
    p.ring.rotation.z+=dt;
    if(player.alive && player.pos.distanceTo(p.pos)<1.7){
      const isNew=player.giveWeapon(p.weapon);
      SFX.pickup();
      toast(isNew?`PICKED UP ${WEAPONS[p.weapon].name}`:`${WEAPONS[p.weapon].name} RESTOCKED`);
      if(isNew) switchWeapon(p.weapon); else { player.mag[p.weapon]=WEAPONS[p.weapon].mag; buildWeaponSlots(); }
      p.available=false; p.timer=12; p.group.visible=false;
      if(mode==='multi') net.sendPickup(p.id, p.weapon);
    }
  }

  // HUD
  $('health-num').textContent=Math.ceil(player.health);
  $('health-num').classList.toggle('low', player.health<35);
  $('health-bar').style.width=player.health+'%';
  $('fuel-bar').style.width=(player.fuel/MOVE.fuelMax*100)+'%';
  const w2=WEAPONS[player.current];
  $('ammo-mag').textContent=player.reloading?'--':player.mag[player.current];
  $('ammo-res').textContent='∞';
  // fps + net debug (multi): tx/rx proves broadcast path, vis = remotes with pos
  clockFrames++; clockT+=dt;
  if(clockT>0.5){
    let extra='';
    if(mode==='multi' && net){
      const vis=[...net.remotes.values()].filter(r=>r.pos).length;
      const rxAge = net.lastRx ? Math.round((performance.now()-net.lastRx)/1000)+'s ago' : 'never';
      extra=` · tx${net.txCount||0}/rx${net.rxCount||0} (${rxAge}) vis${vis}/${net.remotes.size}`;
      // first contact toast
      if(net.rxCount>0 && !window._contactToast){ window._contactToast=true; toast('CONTACT — enemy position linked'); }
    }
    $('fps-text').textContent=`· ${Math.round(clockFrames/clockT)}fps${extra}`; clockFrames=0; clockT=0;
  }
  sbTimer+=dt; if(sbTimer>2){ sbTimer=0; if(!$('scoreboard').classList.contains('hidden')) refreshScoreboard(); }

  updateEnemyHealthBars();
  renderer.render(scene,camera);
}
