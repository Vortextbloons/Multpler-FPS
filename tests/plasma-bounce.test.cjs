const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Vector3 {
  constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  clone(){ return new Vector3(this.x,this.y,this.z); }
  multiplyScalar(n){ this.x*=n; this.y*=n; this.z*=n; return this; }
  add(v){ this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
  addScaledVector(v,n){ this.x+=v.x*n; this.y+=v.y*n; this.z+=v.z*n; return this; }
  dot(v){ return this.x*v.x+this.y*v.y+this.z*v.z; }
  distanceTo(v){ return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z); }
}

const source=fs.readFileSync(path.join(__dirname,'../js/game.js'),'utf8');
const move=source.match(/function movePlasma\([\s\S]*?\n}\n/);
assert.ok(move,'plasma movement exists');
const arena={colliders:[]};
const effects={impact(){}};
const context={THREE:{Vector3},ARENA:arena,WEAPONS:{plasma:{bounce:0.68,bounces:3,color:0x4ade80}},fx:effects};
vm.runInNewContext(move[0],context);

arena.colliders=[{min:new Vector3(1,-10,-10),max:new Vector3(1.1,10,10)}];
const wallShot={mesh:{position:new Vector3(0,1,0)},vel:new Vector3(30,0,0),bounces:0};
assert.equal(context.movePlasma(wallShot,0.1),false);
assert.equal(wallShot.bounces,1,'thin wall registers a bounce within one frame');
assert.ok(wallShot.vel.x<0,'wall reflects the projectile');
assert.ok(wallShot.mesh.position.x<0.78,'projectile moves away after the bounce');

arena.colliders=[{min:new Vector3(-10,-1,-10),max:new Vector3(10,0,10)}];
const floorShot={mesh:{position:new Vector3(0,1,0)},vel:new Vector3(0,-10,0),bounces:0};
assert.equal(context.movePlasma(floorShot,0.2),false);
assert.equal(floorShot.bounces,1);
assert.ok(floorShot.vel.y>0,'floor reflects the projectile upward');
floorShot.mesh.position.y=1;
floorShot.vel.y=-10;
floorShot.bounces=2;
assert.equal(context.movePlasma(floorShot,0.2),true,'third impact detonates');
console.log('plasma bounces off scenery and detonates on its third impact');

const detonate=source.match(/function detonatePlasma\([\s\S]*?\n}\n/);
assert.ok(detonate,'plasma detonation exists');
const hits=[];
context.WEAPONS.plasma.splash=48;
context.WEAPONS.plasma.splashR=6.5;
context.mode='solo';
context.me={id:'me',name:'PLAYER'};
context.bots=[
  {id:'near',alive:true,pos:new Vector3(5,0,0)},
  {id:'far',alive:true,pos:new Vector3(8,0,0)}
];
context.player={alive:true,pos:new Vector3(20,0,0)};
context.damageBot=(bot,dmg)=>hits.push([bot.id,dmg]);
context.fx.explosion=()=>{};
context.SFX={explosion(){}};
context.scene={remove(){}};
vm.runInNewContext(detonate[0],context);
const blast={owner:'me',mesh:{position:new Vector3(0,0,0),geometry:{dispose(){}},material:{dispose(){}}}};
context.detonatePlasma(blast,null);
assert.deepEqual(hits,[['near',48]],'scenery explosion damages nearby targets within the larger radius');
console.log('plasma scenery explosions apply splash damage');
