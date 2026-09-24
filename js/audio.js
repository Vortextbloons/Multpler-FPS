// Procedural sci-fi audio — no assets needed.
let ctx = null, master = null, muted = false, noiseBuffer = null, lastJet = 0;
export function initAudio(){
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.30;
    const limiter=ctx.createDynamicsCompressor();
    limiter.threshold.value=-18; limiter.knee.value=8; limiter.ratio.value=5;
    limiter.attack.value=0.003; limiter.release.value=0.16;
    master.connect(limiter); limiter.connect(ctx.destination);
    noiseBuffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate),ctx.sampleRate);
    const samples=noiseBuffer.getChannelData(0);
    for(let i=0;i<samples.length;i++) samples[i]=Math.random()*2-1;
  } catch(e){ ctx=null; master=null; noiseBuffer=null; }
}
export function toggleMute(){ muted = !muted; if(master) master.gain.value = muted?0:0.30; return muted; }
export function resumeAudio(){ if(ctx && ctx.state==='suspended') ctx.resume(); }
function env(g, t0, a, peak, d){
  g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(Math.max(peak,0.0002), t0+a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0+a+d);
}
function osc(type, f0, f1, dur, vol=0.5, delay=0){
  if(!ctx||muted) return;
  const t0 = ctx.currentTime+delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type=type; o.frequency.setValueAtTime(f0,t0);
  if(f1&&f1!==f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1,1),t0+dur);
  env(g,t0,0.005,vol,dur); o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0+dur+0.1);
}
function noise(dur, vol=0.4, fc=2000, q=1, delay=0){
  if(!ctx||muted) return;
  const t0=ctx.currentTime+delay;
  const src=ctx.createBufferSource(); src.buffer=noiseBuffer;
  const f=ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=fc; f.Q.value=q;
  const g=ctx.createGain(); env(g,t0,0.004,vol,dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0,Math.random()*Math.max(0,1-dur),dur); src.stop(t0+dur);
}
export const SFX = {
  shoot(w){
    switch(w){
      case 'pulse': osc('sawtooth',900,180,0.11,0.22); osc('sine',170,70,0.10,0.13); noise(0.045,0.11,3800,1.6); break;
      case 'storm': osc('square',1250,430,0.065,0.14); osc('sine',260,90,0.07,0.09); noise(0.035,0.09,5400,2); break;
      case 'scatter': noise(0.24,0.41,950,0.7); noise(0.075,0.18,4600,1.2); osc('sawtooth',235,55,0.22,0.30); break;
      case 'rail': osc('sawtooth',1900,110,0.38,0.28); noise(0.31,0.21,2800,1); osc('sine',105,32,0.4,0.43); osc('sine',1250,600,0.12,0.08,0.05); break;
      case 'plasma': osc('sine',320,1050,0.16,0.29); osc('sawtooth',600,120,0.25,0.11); noise(0.17,0.12,950,1); break;
      case 'dual': osc('square',1000,240,0.11,0.21); osc('sine',190,75,0.10,0.12); noise(0.065,0.13,3400,1.5); break;
      case 'rocket': noise(0.39,0.42,600,0.65); noise(0.10,0.16,3500,1); osc('sawtooth',180,42,0.40,0.37); osc('sine',72,30,0.45,0.34); break;
      default: osc('square',600,200,0.08,0.2);
    }
  },
  dry(){ osc('square',1200,800,0.05,0.12); },
  reload(){ noise(0.035,0.11,2400,2); osc('square',460,680,0.06,0.10); },
  reloadEnd(){ noise(0.05,0.15,1700,1.5); osc('sine',420,860,0.11,0.15); },
  equip(){ noise(0.055,0.10,2100,1.4); osc('sine',310,620,0.11,0.11,0.025); },
  step(){ noise(0.055,0.075,480,0.9); osc('sine',95,50,0.08,0.07); },
  land(){ noise(0.12,0.20,410,0.75); osc('sine',110,42,0.15,0.18); },
  slide(){ noise(0.28,0.16,780,0.5); osc('sawtooth',180,75,0.19,0.10); },
  hit(head=false){
    osc('sine',head?1100:600,head?1700:430,0.075,head?0.28:0.2);
    noise(0.045,head?0.13:0.08,head?3300:950,1.2);
    if(head) osc('triangle',1750,2300,0.1,0.16,0.035);
  },
  kill(){ osc('sine',700,1400,0.18,0.35); osc('sine',1050,2100,0.22,0.25,0.06); },
  hurt(){ noise(0.15,0.3,500,1); osc('sawtooth',200,80,0.18,0.3); },
  jump(){ osc('sine',300,600,0.12,0.15); },
  dJump(){ osc('sine',400,900,0.14,0.18); },
  jet(){
    if(!ctx || ctx.currentTime-lastJet<0.11) return;
    lastJet=ctx.currentTime;
    noise(0.15,0.075,1100,0.7);
    osc('sine',125,90,0.14,0.08);
  },
  pickup(){ osc('sine',600,1200,0.12,0.3); osc('sine',900,1800,0.14,0.25,0.08); },
  spawn(){ osc('sine',200,800,0.3,0.25); },
  railCharge(){ osc('sawtooth',100,1500,0.4,0.12); },
  explosion(){ noise(0.6,0.6,300,0.6); osc('sine',120,30,0.5,0.5); },
  ui(){ osc('sine',800,1000,0.06,0.15); },
  jumpPad(){ osc('sine',250,900,0.25,0.3); },
  denied(){ osc('square',200,150,0.12,0.2); }
};
