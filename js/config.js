export const SUPABASE_URL = 'https://jkyatcblkxqtcdaxkvks.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpreWF0Y2Jsa3hxdGNkYXhrdmtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMDIxNTksImV4cCI6MjEwNTc3ODE1OX0.qYvmt1YN1tvkPOBtoG1Q8vv3VtsoyUDd9NMtp6X4Fu0';
export const ROOM_ID = 'public-1';
export const MAX_PLAYERS = 8;

export const CALLSIGNS = ['NOVA','VOLT','HEX','JINX','ORBIT','FLUX','PYRO','ECHO','ZERO','BLITZ','ONYX','SOL','VEX','ION','KRYO','DASH','PULSE','NEBULA','ASTRA','ROGUE'];

export function randomName(){
  const a = CALLSIGNS[Math.floor(Math.random()*CALLSIGNS.length)];
  return `${a}-${Math.floor(2+Math.random()*97)}`;
}
export function randomColor(){
  const palette = ['#22d3ee','#e879f9','#4ade80','#fbbf24','#fb7185','#a78bfa','#38bdf8','#f97316'];
  return palette[Math.floor(Math.random()*palette.length)];
}
export function guestId(){
  return 'g_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
}

export const WEAPONS = {
  pulse: {
    id:'pulse', name:'K-7 PULSE REPEATER', slot:0, color:0x22d3ee, emoji:'⌁',
    dmg:13, headMul:1.6, rpm:540, mag:30, reload:1.35, spread:0.014, adsSpread:0.004,
    range:90, auto:true, kick:0.011, adsKick:0.006, adsFov:58, adsTime:0.16,
    sound:'pulse', tracer:'cyan', desc:'Starter · reliable'
  },
  storm: {
    id:'storm', name:'VX-9 STORM NEEDLER', slot:1, color:0xe879f9, emoji:'≋',
    dmg:9, headMul:1.5, rpm:840, mag:42, reload:1.6, spread:0.03, adsSpread:0.012,
    range:55, auto:true, kick:0.008, adsKick:0.005, adsFov:60, adsTime:0.14,
    sound:'needler', tracer:'magenta', desc:'CQC shredder'
  },
  scatter: {
    id:'scatter', name:'MAW-12 SCATTER CORE', slot:2, color:0xfb923c, emoji:'✸',
    dmg:9, pellets:8, headMul:1.3, rpm:78, mag:6, reload:2.2, spread:0.075, adsSpread:0.05,
    range:26, auto:false, kick:0.055, adsKick:0.04, adsFov:62, adsTime:0.18,
    sound:'scatter', tracer:'orange', desc:'Delete up close'
  },
  rail: {
    id:'rail', name:'LX RAILSPIKE', slot:3, color:0xbfdbfe, emoji:'—',
    dmg:82, headMul:2.0, rpm:52, mag:5, reload:2.6, spread:0.002, adsSpread:0.0,
    range:160, auto:false, kick:0.035, adsKick:0.02, adsFov:42, adsTime:0.2,
    sound:'rail', tracer:'rail', desc:'Long-range spike'
  },
  plasma: {
    id:'plasma', name:'HELIOS PLASMA CASTER', slot:4, color:0x4ade80, emoji:'●',
    dmg:58, splash:48, splashR:6.5, headMul:1.2, rpm:95, mag:4, reload:2.0,
    spread:0.01, adsSpread:0.005, range:60, auto:false, kick:0.03, adsKick:0.02,
    adsFov:58, adsTime:0.18, projectileSpeed:30, fuse:2.8, bounces:3, bounce:0.68,
    sound:'plasma', tracer:'green', desc:'Bouncing blast'
  },
  dual: {
    id:'dual', name:'D-2 TWIN FANGS', slot:5, color:0xffd166, emoji:'Ⅱ',
    dmg:17, headMul:1.5, rpm:480, mag:24, reload:1.7, spread:0.025, adsSpread:0.01,
    range:62, auto:true, kick:0.012, adsKick:0.007, adsFov:64, adsTime:0.13,
    sound:'dual', tracer:'amber', desc:'Alternating sidearms'
  },
  rocket: {
    id:'rocket', name:'R-1 SIEGEBREAKER', slot:6, color:0xff6b45, emoji:'✦',
    dmg:90, splash:62, splashR:5.5, headMul:1, rpm:42, mag:1, reload:2.8,
    spread:0.006, adsSpread:0.002, range:95, auto:false, kick:0.065, adsKick:0.045,
    adsFov:60, adsTime:0.22, projectileSpeed:48, fuse:2.2,
    sound:'rocket', tracer:'orange', desc:'Single-shot explosive'
  },
};
export const WEAPON_ORDER = ['pulse','storm','scatter','rail','plasma','dual','rocket'];

export const MOVE = {
  walk: 7.2, sprint: 9.8, accelGround: 60, accelAir: 16, airDrag: 1.2,
  jump: 7.9, doubleJump: 7.5, gravity: 29, fallGravityScale: 1.35,
  jetThrust: 14, jetMaxSpeed: 7, jetGravityScale: 0.4,
  fuelMax: 100, fuelDrain: 40, fuelRechargeTime: 3, slideBoost: 4.5,
  eye: 1.62, radius: 0.42, height: 1.72
};
