const smooth=(start,end,value)=>{
  const t=Math.max(0,Math.min(1,(value-start)/(end-start)));
  return t*t*(3-2*t);
};

// Normalized timing keeps every reload in step with its weapon's reload duration.
export function reloadPose(id, progress){
  if(progress==null) return {dip:0,roll:0,seat:0,cells:[0,0]};
  const p=Math.max(0,Math.min(1,progress));
  const dip=smooth(0,0.18,p)*(1-smooth(0.76,1,p));
  const first=smooth(0.15,0.34,p)*(1-smooth(id==='dual'?0.48:0.57,id==='dual'?0.68:0.79,p));
  const second=id==='dual'?smooth(0.38,0.55,p)*(1-smooth(0.72,0.91,p)):0;
  const roll={pulse:0.38,storm:0.48,scatter:0.57,rail:0.31,plasma:0.45,dual:0.22,rocket:-0.54}[id]||0.38;
  const seat=smooth(0.78,0.86,p)*(1-smooth(0.88,1,p));
  return {dip,roll:dip*roll,seat,cells:[first,second]};
}
