// Graphics preset. High matches the original renderer. Low cuts fill-rate,
// shadow, light, and effect work. Auto stays on High, samples gameplay FPS,
// and drops to Low once if the machine cannot hold frame rate.
const STORAGE_KEY = 'nf2-quality';

const HIGH = {
  id: 'high',
  shadows: true,
  shadowMapSize: 2048,
  shadowType: 'pcfsoft',
  maxPixelRatio: 1.5,
  renderScale: 1,
  antialias: true,
  cheapTrim: false,
  pickupLights: true,
  actorLights: true,
  fxImpactScale: 1,
  fxImpactLight: true,
  fxExplosionLight: true,
  fxMaxExplosionLights: 8,
  fxProjectileLight: true,
  fxMaxParts: 480,
  fxMaxTracers: 200,
};

const LOW = {
  id: 'low',
  shadows: false,
  shadowMapSize: 512,
  shadowType: 'basic',
  maxPixelRatio: 1,
  renderScale: 0.8,
  antialias: false,
  cheapTrim: true,
  pickupLights: false,
  actorLights: false,
  fxImpactScale: 0.4,
  fxImpactLight: false,
  fxExplosionLight: true,
  fxMaxExplosionLights: 1,
  fxProjectileLight: false,
  fxMaxParts: 48,
  fxMaxTracers: 24,
};

let mode = 'high';
let level = 'high';
let autoDone = true;
let warm = 0;
const samples = [];
const listeners = new Set();

export function getQualityMode(){ return mode; }
export function getQualityLevel(){ return level; }
export function gfx(){ return level === 'low' ? LOW : HIGH; }

export function loadQuality(){
  let stored = null;
  try { stored = globalThis.localStorage?.getItem(STORAGE_KEY); } catch(e){}
  mode = stored === 'low' || stored === 'auto' ? stored : 'high';
  level = mode === 'low' ? 'low' : 'high';
  autoDone = mode !== 'auto';
  warm = 0;
  samples.length = 0;
  return mode;
}

export function setQualityMode(next){
  if(next !== 'high' && next !== 'low' && next !== 'auto') return;
  mode = next;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, mode); } catch(e){}
  warm = 0;
  samples.length = 0;
  if(mode === 'low'){ level = 'low'; autoDone = true; }
  else if(mode === 'high'){ level = 'high'; autoDone = true; }
  else { level = 'high'; autoDone = false; }
  for(const fn of listeners) fn();
}

export function onQualityChange(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Call with the latest half-second FPS sample. Warmup ignores shader compile.
// After about two more seconds, a low average commits Auto to Low for the session.
export function noteFps(fps, windowSec){
  if(mode !== 'auto' || autoDone || !Number.isFinite(fps)) return false;
  warm += windowSec || 0;
  if(warm <= 3) return false;
  samples.push(fps);
  if(samples.length < 4) return false;
  autoDone = true;
  const avg = samples.reduce((sum, n) => sum + n, 0) / samples.length;
  samples.length = 0;
  if(avg >= 45 || level === 'low') return false;
  level = 'low';
  for(const fn of listeners) fn();
  return true;
}
