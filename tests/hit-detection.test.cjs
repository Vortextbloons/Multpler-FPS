const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8');
const hitFn = source.match(/function rayVsPlayer\([\s\S]*?\n}\n/);
assert.ok(hitFn, 'player hit detection exists');
const context = {};
vm.runInNewContext(`${hitFn[0]}\nglobalThis.hit=rayVsPlayer;`, context);

const target = {x:0,y:0,z:0};
const toward = {x:0,y:0,z:-1};
assert.equal(context.hit({x:0,y:1.5,z:5}, toward, target).head, true, 'headshot stays a headshot');
assert.equal(context.hit({x:0,y:0.9,z:5}, toward, target).head, false, 'torso shot stays a torso shot');
assert.equal(context.hit({x:1,y:1.5,z:5}, toward, target), null, 'shots beside a player miss');
assert.equal(context.hit({x:0,y:1.5,z:5}, {x:0,y:0,z:1}, target), null, 'shots facing away miss');
