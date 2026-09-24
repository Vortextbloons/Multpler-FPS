const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Vector3 {
  constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  clone(){ return new Vector3(this.x,this.y,this.z); }
  copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; }
  addScaledVector(v,n){ this.x+=v.x*n; this.y+=v.y*n; this.z+=v.z*n; return this; }
  subVectors(a,b){ this.x=a.x-b.x; this.y=a.y-b.y; this.z=a.z-b.z; return this; }
  length(){ return Math.hypot(this.x,this.y,this.z); }
  lengthSq(){ return this.x*this.x+this.y*this.y+this.z*this.z; }
  normalize(){ return this.multiplyScalar(1/this.length()); }
  multiplyScalar(n){ this.x*=n; this.y*=n; this.z*=n; return this; }
  dot(v){ return this.x*v.x+this.y*v.y+this.z*v.z; }
  distanceTo(v){ return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z); }
}

const source=fs.readFileSync(path.join(__dirname,'../js/game.js'),'utf8');
const extract=name=>{
  const match=source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`));
  assert.ok(match,`${name} exists`);
  return match[0];
};
const context={
  THREE:{Vector3,MathUtils:{clamp:(value,min,max)=>Math.max(min,Math.min(max,value))}},
  rayVsWorld:()=>2,
  WEAPONS:{rocket:{splash:62,splashR:5.5,color:0xff6b45}},
  mode:'solo', me:{id:'me',name:'PLAYER'},
  bots:[{id:'near',alive:true,pos:new Vector3(4,0,0)},{id:'far',alive:true,pos:new Vector3(8,0,0)}],
  player:{alive:true,pos:new Vector3(20,0,0)},
  SFX:{explosion(){}}, fx:{explosion(){}}, scene:{remove(){}},
};
vm.runInNewContext(`${extract('moveRocket')}\n${extract('rocketContact')}\n${extract('detonatePlasma')}`,context);

const shot={weapon:'rocket',owner:'me',vel:new Vector3(48,0,0),mesh:{position:new Vector3(0,1.6,0),geometry:{dispose(){}},material:{dispose(){}}}};
assert.equal(context.moveRocket(shot,0.1),true,'rocket explodes on first wall hit');
assert.equal(shot.mesh.position.x,2,'rocket stops at the wall rather than passing through');
assert.ok(context.rocketContact(shot,new Vector3(1,0,0)),'rocket detects targets swept between frames');
assert.equal(context.rocketContact(shot,new Vector3(4,0,0)),null,'rocket cannot hit a target behind the wall');

const hits=[];
context.damageBot=(bot,dmg,_,weapon)=>hits.push([bot.id,dmg,weapon]);
context.detonatePlasma(shot,null);
assert.deepEqual(hits,[['near',62,'rocket']],'rocket blast applies its own splash radius and damage');
console.log('rocket wall collision, swept hits, and splash damage pass');
