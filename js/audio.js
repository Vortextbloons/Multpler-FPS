// Procedural sci-fi audio — no assets needed
let ctx = null, master = null, muted = false;
export function initAudio(){
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
  } catch(e){}
}
export function toggleMute(){ muted = !muted; if(master) master.gain.value = muted?0:0.35; return muted; }
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
  const len=Math.floor(ctx.sampleRate*dur);
  const buf=ctx.createBuffer(1,len,ctx.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
  const src=ctx.createBufferSource(); src.buffer=buf;
  const f=ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=fc; f.Q.value=q;
  const g=ctx.createGain(); env(g,t0,0.004,vol,dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t0);
}
export const SFX = {
  shoot(w){
    switch(w){
      case 'pulse': osc('sawtooth',880,220,0.09,0.25); noise(0.05,0.12,4000,2); break;
      case 'storm': osc('square',1200,400,0.06,0.18); noise(0.04,0.1,6000,2); break;
      case 'scatter': noise(0.22,0.5,900,0.8); osc('sawtooth',220,60,0.2,0.4); break;
      case 'rail': osc('sawtooth',1800,120,0.35,0.4); noise(0.3,0.25,3000,1); osc('sine',90,30,0.3,0.5); break;
      case 'plasma': osc('sine',300,900,0.25,0.4); noise(0.15,0.15,800,1); break;
      case 'dual': osc('square',950,260,0.11,0.26); noise(0.07,0.15,3200,1.5); break;
      case 'rocket': noise(0.34,0.55,650,0.6); osc('sawtooth',180,45,0.38,0.48); osc('sine',70,32,0.4,0.3); break;
      default: osc('square',600,200,0.08,0.2);
    }
  },
  dry(){ osc('square',1200,800,0.05,0.12); },
  reload(){ osc('square',400,800,0.07,0.15); osc('square',600,1200,0.07,0.15,0.09); },
  hit(){ osc('sine',1400,1400,0.05,0.25); },
  kill(){ osc('sine',700,1400,0.18,0.35); osc('sine',1050,2100,0.22,0.25,0.06); },
  hurt(){ noise(0.15,0.3,500,1); osc('sawtooth',200,80,0.18,0.3); },
  jump(){ osc('sine',300,600,0.12,0.15); },
  dJump(){ osc('sine',400,900,0.14,0.18); },
  jet(){ noise(0.18,0.12,1200,0.7); },
  pickup(){ osc('sine',600,1200,0.12,0.3); osc('sine',900,1800,0.14,0.25,0.08); },
  spawn(){ osc('sine',200,800,0.3,0.25); },
  railCharge(){ osc('sawtooth',100,1500,0.4,0.12); },
  explosion(){ noise(0.6,0.6,300,0.6); osc('sine',120,30,0.5,0.5); },
  ui(){ osc('sine',800,1000,0.06,0.15); },
  jumpPad(){ osc('sine',250,900,0.25,0.3); },
  denied(){ osc('square',200,150,0.12,0.2); }
};
