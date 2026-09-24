const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/game.js'), 'utf8');
const visuals = fs.readFileSync(path.join(root, 'js/visuals.js'), 'utf8');
const update = visuals.match(/export function setPlayerName\([\s\S]*?\n}\n/);
const call = source.match(/\/\/ Update the label[^\n]*\n\s*(setPlayerName\([^;]+;)/);
assert.ok(update && call, 'remote player name update path exists');

const scene = {};
let disposed = 0;
const oldTag = { material: { map: { dispose() { disposed++; } }, dispose() { disposed++; } } };
const mesh = {
  parent: scene,
  userData: { tag: oldTag, tagName: undefined },
  remove(tag) { assert.equal(tag, oldTag); },
  add(tag) { assert.equal(tag.name, 'OTHER PLAYER'); }
};
const r = { mesh, name: 'OTHER PLAYER' };
const context = { r, makeNameSprite: name => ({ name }) };
vm.runInNewContext(update[0].replace('export ', '') + '\n' + call[1], context);
assert.equal(mesh.parent, scene, 'the remote player remains visible after its name arrives');
assert.equal(mesh.userData.tagName, 'OTHER PLAYER');
assert.equal(disposed, 2);
console.log('remote player remains in scene');
