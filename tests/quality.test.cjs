const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const store = new Map();
const context = {
  localStorage: {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
  },
};
const source = fs.readFileSync(path.join(__dirname, '../js/quality.js'), 'utf8').replace(/^export /gm, '');
vm.runInNewContext(source + '\nglobalThis.api={loadQuality,setQualityMode,getQualityMode,getQualityLevel,gfx,noteFps};', context);
const api = context.api;

store.clear();
assert.equal(api.loadQuality(), 'high');
assert.equal(api.getQualityLevel(), 'high');
assert.equal(api.gfx().shadows, true);
assert.equal(api.gfx().shadowMapSize, 2048);
assert.equal(api.gfx().maxPixelRatio, 1.5);
assert.equal(api.gfx().fxImpactScale, 1);
assert.equal(api.gfx().fxImpactLight, true);
assert.equal(api.noteFps(20, 1), false, 'auto sampling stays idle while High is selected');

api.setQualityMode('low');
assert.equal(store.get('nf2-quality'), 'low');
assert.equal(api.gfx().shadows, false);
assert.equal(api.gfx().renderScale, 0.8);
assert.equal(api.gfx().fxImpactLight, false);
assert.equal(api.gfx().fxMaxExplosionLights, 1);
assert.equal(api.gfx().pickupLights, false);
assert.equal(api.gfx().cheapTrim, true);

api.setQualityMode('high');
assert.equal(api.gfx().id, 'high');
assert.equal(api.gfx().antialias, true);

api.setQualityMode('auto');
assert.equal(api.getQualityLevel(), 'high', 'auto starts on the current look');
assert.equal(api.noteFps(20, 1), false);
assert.equal(api.noteFps(20, 1), false);
assert.equal(api.noteFps(20, 1), false, 'warmup ignores the first three seconds');
assert.equal(api.noteFps(30, 0.5), false);
assert.equal(api.noteFps(28, 0.5), false);
assert.equal(api.noteFps(32, 0.5), false);
assert.equal(api.noteFps(30, 0.5), true, 'a low sample commits auto to low');
assert.equal(api.getQualityMode(), 'auto');
assert.equal(api.getQualityLevel(), 'low');
assert.equal(api.noteFps(120, 0.5), false, 'auto does not bounce back to high');

api.setQualityMode('auto');
assert.equal(api.getQualityLevel(), 'high');
for(let i=0;i<3;i++) api.noteFps(20, 1);
for(let i=0;i<4;i++) api.noteFps(70, 0.5);
assert.equal(api.getQualityLevel(), 'high', 'a healthy sample leaves auto on high');

store.set('nf2-quality', 'nope');
assert.equal(api.loadQuality(), 'high');
console.log('quality preset defaults to high and auto drops only after a low sample');
