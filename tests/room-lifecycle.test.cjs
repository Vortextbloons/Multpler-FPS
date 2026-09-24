const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class RoomServer {
  constructor(){ this.channels = new Set(); this.presences = new Map(); this.trackCount=0; }
  channel(topic, options){ return new Channel(this, topic, options); }
  sync(){ for(const channel of this.channels) channel.emit('presence:sync'); }
  state(){
    const state = {};
    for(const [channel, payload] of this.presences) state[channel.key] = [payload];
    return state;
  }
}
class Channel {
  constructor(server, topic, options){ this.server=server; this.topic=topic; this.key=options?.config?.presence?.key; this.handlers=new Map(); }
  on(type, filter, callback){ this.handlers.set(`${type}:${filter.event}`, callback); return this; }
  emit(key, payload){ this.handlers.get(key)?.(payload); }
  subscribe(callback){
    if(this.topic==='arena:public-1'){
      this.server.channels.add(this);
      queueMicrotask(()=>{ this.emit('presence:sync'); callback?.('SUBSCRIBED'); });
    }
    return this;
  }
  presenceState(){ return this.server.state(); }
  async track(payload){ this.server.trackCount++; this.server.presences.set(this, payload); this.server.sync(); return 'ok'; }
  async send(message){
    for(const channel of this.server.channels) if(channel!==this) channel.emit(`broadcast:${message.event}`, {payload:message.payload});
    return 'ok';
  }
  unsubscribe(){ this.server.channels.delete(this); this.server.presences.delete(this); this.server.sync(); }
}

const server = new RoomServer();
const createClient = () => ({
  channel: (topic, options) => server.channel(topic, options),
  from: () => ({ upsert: async()=>({error:null}) })
});
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'net.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export class Net', 'class Net');
const context = { createClient, SUPABASE_URL:'', SUPABASE_ANON:'', ROOM_ID:'public-1',
  performance, Date, console, setTimeout, clearTimeout, setInterval:()=>0, clearInterval:()=>{} };
vm.runInNewContext(`${source}\nglobalThis.Net=Net;`, context);
const { Net } = context;
const person = id => ({id,name:id,color:'#fff',kills:0,deaths:0,best:0,weapon:'pulse',alive:true});
const settle = () => new Promise(resolve=>setImmediate(resolve));

(async()=>{
  const a=new Net(), b=new Net(), c=new Net();
  assert.equal(a.hostId, null, 'empty room has no host');
  await a.init(person('A'), {x:1,y:0,z:2}); await settle();
  assert.equal(a.connected, true, 'joining waits for Presence tracking');
  assert.equal(a.hostId, 'A', 'first player becomes host');
  await b.init(person('B'), {x:2,y:0,z:2}); await settle();
  assert.equal(b.hostId, 'A', 'second player joins existing host');
  assert.equal(a.hostId, 'A');
  a._posT=-Infinity;
  a.sendPos({pos:{x:1,y:0,z:2},yaw:0,pitch:0,weapon:'pulse',alive:true,health:42,jet:false,firing:false});
  assert.equal(b.remotes.get('A').health, 42, 'opponent health reaches other players');
  a._posT=-Infinity;
  a.sendPos({pos:{x:1,y:0,z:2},yaw:0,pitch:0,weapon:'pulse',alive:false,health:0,jet:false,firing:false});
  assert.equal(b.remotes.get('A').health, 0, 'elimination health reaches other players');
  await c.init(person('C'), {x:3,y:0,z:2}); await settle();
  assert.equal(c.hostId, 'A');
  assert.ok(b.remotes.get('A')?.pos, 'new player receives initial host position');
  assert.ok(server.trackCount<=5, 'joining does not flood Presence updates');
  const tracksAtJoin=server.trackCount;
  for(let i=0;i<20;i++) a.updatePresence({weapon:i%2?'pulse':'rail'});
  assert.equal(server.trackCount, tracksAtJoin, 'rapid changes are coalesced before tracking Presence');
  const normalState=server.state.bind(server);
  server.state=()=>({}); server.sync(); server.state=normalState;
  assert.equal(a.hostId, 'A', 'temporary empty sync does not unset the host');
  a.disconnect(); await settle();
  assert.equal(b.hostId, 'B', 'next player is promoted');
  assert.equal(c.hostId, 'B', 'all peers agree on promoted host');
  assert.equal(b.remotes.has('A'), false, 'departed host leaves the room roster');
  b.disconnect(); await settle();
  assert.equal(c.hostId, 'C', 'last player becomes host');
  c.disconnect(); await settle();
  assert.equal(c.hostId, null, 'empty room has no host again');
  const d=new Net(), e=new Net();
  await Promise.all([
    d.init(person('D'), {x:4,y:0,z:2}),
    e.init(person('E'), {x:5,y:0,z:2})
  ]);
  await settle();
  assert.ok(['D','E'].includes(d.hostId), 'simultaneous join elects a present player');
  assert.equal(e.hostId, d.hostId, 'simultaneous join converges on one host');
  d.disconnect(); e.disconnect();
  const legacy=server.channel('arena:public-1', {config:{presence:{key:'legacy'}}});
  legacy.subscribe();
  await legacy.track({guest_id:'legacy',name:'OLD CLIENT',color:'#fff',alive:true,p:[6,0,2]});
  const f=new Net();
  await f.init(person('F'), {x:7,y:0,z:2}); await settle();
  assert.equal(f.hostId, 'legacy', 'a player already in the room keeps host priority');
  legacy.unsubscribe(); await settle();
  assert.equal(f.hostId, 'F', 'host moves to a modern client when the old client leaves');
  f.disconnect();
  console.log('room join and host handoff pass');
})().catch(error=>{ console.error(error); process.exitCode=1; });
