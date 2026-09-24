const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Vector3 {
  constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
  clone(){ return new Vector3(this.x,this.y,this.z); }
}
class Mesh {
  constructor(geometry,material){
    this.geometry=geometry; this.material=material;
    this.position=new Vector3(); this.rotation={x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}};
    this.scale=new Vector3(1,1,1);
    this.userData={};
  }
  clone(){ return new Mesh(this.geometry,this.material); }
  updateMatrix(){ this.matrix={position:this.position.clone(),rotation:{...this.rotation},scale:this.scale.clone()}; }
}
class InstancedMesh extends Mesh {
  constructor(geometry,material,count){ super(geometry,material); this.count=count; this.matrices=[]; this.instanceMatrix={}; }
  setMatrixAt(i,matrix){ this.matrices[i]=matrix; }
}
let materialId=0;
class Material { constructor(options={}){ Object.assign(this,options); this.uuid=String(materialId++); } }
class Geometry {
  constructor(...size){ this.size=size; this.parameters={width:size[0],height:size[1],depth:size[2]}; }
  dispose(){}
}
class BoxGeometry extends Geometry { constructor(...size){ super(...size); this.type='BoxGeometry'; } }
class Light {
  constructor(){
    this.position=new Vector3();
    this.shadow={mapSize:{set(){}},camera:{}};
  }
}
const THREE={
  Vector3, Mesh, InstancedMesh,
  BoxGeometry, CylinderGeometry:Geometry, TorusGeometry:Geometry, PlaneGeometry:Geometry,
  MeshStandardMaterial:Material, MeshLambertMaterial:Material, MeshBasicMaterial:Material, CanvasTexture:Material,
  HemisphereLight:Light, DirectionalLight:Light, PointLight:Light,
  FogExp2:Material, Color:Material, GridHelper:Mesh,
  DoubleSide:2, SRGBColorSpace:'srgb',
};
const document={createElement(){return {getContext(){return {fillRect(){},fillText(){}};}};}};
const source=fs.readFileSync(path.join(__dirname,'../js/arena.js'),'utf8')
  .replace(/^import .*\n/m,'')
  .replace(/^export /gm,'')
  + '\nglobalThis.layout={ARENA,buildArena,isBlocked};';
const context={THREE,document};
vm.runInNewContext(source,context);
const {ARENA,buildArena,isBlocked}=context.layout;
const scene={objects:new Set(),removed:[],add(mesh){this.objects.add(mesh);},remove(mesh){this.objects.delete(mesh);this.removed.push(mesh);}};
buildArena(scene);
const batches=[...scene.objects].filter(mesh=>mesh instanceof InstancedMesh);
assert.ok(batches.length>0,'repeated decorative geometry is instanced');
assert.equal(batches.reduce((n,batch)=>n+batch.count,0),scene.removed.length,'every removed mesh is represented by an instance');
assert.ok(scene.removed.length>100,'batching removes a meaningful number of draw calls');
const transformKey=mesh=>JSON.stringify([mesh.position.x,mesh.position.y,mesh.position.z,mesh.rotation.x,mesh.rotation.y,mesh.rotation.z,mesh.scale.x,mesh.scale.y,mesh.scale.z]);
const originalTransforms=scene.removed.map(transformKey).sort();
const instanceTransforms=batches.flatMap(batch=>batch.matrices.map(matrix=>transformKey(matrix))).sort();
assert.deepEqual(instanceTransforms,originalTransforms,'batching preserves all decorative transforms');
for(const batch of batches){
  assert.equal(batch.matrices.length,batch.count,'each instance retains a transform');
  if(!batch.userData.allowUnshadowed) assert.equal(batch.receiveShadow,true,'decorative geometry still receives shadows');
  assert.deepEqual(batch.geometry.size,[1,1,1],'instances use a shared unit box');
}
for(const mesh of scene.removed){
  assert.deepEqual([mesh.scale.x,mesh.scale.y,mesh.scale.z],mesh.geometry.size,'instance scale preserves the original box dimensions');
}

assert.equal(ARENA.size,106);
assert.equal(ARENA.bounds,51);
assert.ok(ARENA.spawns.length>=18);
assert.ok(ARENA.weaponSpawns.length>=14);
assert.ok(ARENA.jumpPads.length>=8);
for(const spawn of ARENA.spawns){
  assert.ok(Math.abs(spawn.pos.x)<=ARENA.bounds && Math.abs(spawn.pos.z)<=ARENA.bounds);
  assert.equal(isBlocked(spawn.pos,0.5,spawn.pos.y),false,`blocked spawn at ${spawn.pos.x}, ${spawn.pos.z}`);
}
for(const pad of ARENA.jumpPads.filter(p=>Math.abs(p.pos.x)>33 || Math.abs(p.pos.z)>33)){
  assert.equal(isBlocked(pad.pos,0.5,0),false,`blocked jump pad at ${pad.pos.x}, ${pad.pos.z}`);
}
for(const pickup of ARENA.weaponSpawns.filter(p=>Math.abs(p.pos.x)>33 || Math.abs(p.pos.z)>33)){
  assert.equal(isBlocked(pickup.pos,0.5,pickup.pos.y),false,`blocked pickup at ${pickup.pos.x}, ${pickup.pos.z}`);
}
const renderables=[...scene.objects].filter(mesh=>mesh instanceof Mesh).length;
console.log(`expanded arena has clear spawns, jump pads, and pickups; ${scene.removed.length} meshes become ${batches.length} batches (${renderables+scene.removed.length-batches.length} → ${renderables} arena renderables)`);
