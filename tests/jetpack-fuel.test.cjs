const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const config = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8')
  .replace(/^export /gm, '') + '\nglobalThis.MOVE = MOVE; globalThis.WEAPONS = WEAPONS;';
const playerSource = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8')
  .replace(/^import .*\n/gm, '')
  .replace(/^export /gm, '') + '\nglobalThis.LocalPlayer = LocalPlayer;';
class Vector3 {
  constructor(x=0, y=0, z=0){ this.set(x,y,z); }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
}
const context = {
  THREE: { Vector3, MathUtils: { clamp:(v,lo,hi)=>Math.min(hi,Math.max(lo,v)), lerp:(a,b,t)=>a+(b-a)*t } },
  ARENA: { colliders:[], jumpPads:[], bounds:100 },
  groundHeight:()=>0,
  collideCircle:()=>{},
};
vm.runInNewContext(config + '\n' + playerSource, context);
const { MOVE, LocalPlayer } = context;
assert.equal(MOVE.fuelMax/MOVE.fuelDrain, 2.5);

const player = new LocalPlayer();
player.pos.y=10;
player.jumps=1;
const input = { jumpHeld:true };
for(let i=0; i<50; i++) player.update(0.05, input);
assert.equal(player.fuel, 0, 'full fuel lasts exactly 2.5 seconds');
assert.ok(player.vel.y<=MOVE.jetMaxSpeed, 'boost respects the reduced speed cap');
player.update(0.05, input);
assert.equal(player.jetting, false, 'empty fuel stops the boost');
assert.equal(player.fuel, 0, 'fuel stays empty in midair');

input.jumpHeld=false;
player.pos.y=0.1;
player.vel.y=-1;
player.update(0.05, input);
assert.equal(player.onGround, true);
assert.equal(player.fuel, 0, 'landing does not refill fuel immediately');
for(let i=0; i<29; i++) player.update(0.1, input);
assert.ok(player.fuel>0 && player.fuel<MOVE.fuelMax, 'fuel recharges gradually while grounded');
player.update(0.1, input);
assert.ok(Math.abs(player.fuel-MOVE.fuelMax)<1e-9, 'empty fuel refills after three seconds on the ground');

const falling = new LocalPlayer();
falling.pos.y=5;
falling.vel.set(8,-2,0);
falling.update(0.1, {});
assert.ok(falling.vel.y < -2-MOVE.gravity*0.1, 'falling accelerates faster than rising');
assert.ok(falling.vel.x < 7.2, 'airborne movement slows when input is released');

const jumper = new LocalPlayer();
jumper.pos.y=0;
let apex=0, frames=0;
const jumpInput = { jumpPressed:true };
do {
  jumper.update(1/60, jumpInput);
  apex=Math.max(apex,jumper.pos.y);
  frames++;
} while(!jumper.onGround && frames<120);
assert.ok(apex>0.9, 'a normal jump still clears low cover');
assert.ok(frames<36, 'a normal jump lands in under 0.6 seconds');
console.log('jetpack fuel and weighted movement pass');
