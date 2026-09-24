import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON, ROOM_ID } from './config.js';

export class Net {
  constructor(){
    this.sb = createClient(SUPABASE_URL, SUPABASE_ANON, { realtime: { params: { eventsPerSecond: 20 } } });
    this.channel = null;
    this.killsChannel = null;
    this.connected = false;
    this._closed = false;
    this.hostId = null;
    this.joinedAt = 0;
    this.me = null;
    this.remotes = new Map(); // id -> state
    this.onEvent = null; // (type, payload)
    this.onPresence = null;
    this._posT = 0;
    this._lastPos = null;
    this._lastPresenceAt = 0;
    this._presenceTimer = null;
    this._presencePatch = {};
    this.rxCount = 0; this.txCount = 0; this.lastRx = 0;
    this.pingMs = 0;
  }
  async init(me, initialPos){
    this._closed = false;
    this.me = me;
    this.joinedAt = Date.now();
    this._lastPos = initialPos ? [initialPos.x, initialPos.y, initialPos.z] : null;
    let finishJoin, failJoin;
    const joined = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Room connection timed out')), 12000);
      finishJoin = () => { clearTimeout(timer); resolve(this); };
      failJoin = error => { clearTimeout(timer); reject(error); };
    });
    // Profile storage is separate from joining the live room.
    this.touchProfile();

    this.channel = this.sb.channel('arena:'+ROOM_ID, {
      config: { presence: { key: me.id }, broadcast: { self: false } }
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        const seen = new Set();
        const members = [];
        for(const key in state){
          for(const p of state[key]){
            if(!p.guest_id) continue;
            members.push(p);
            if(p.guest_id===this.me.id) continue;
            seen.add(p.guest_id);
            let r = this.remotes.get(p.guest_id);
            if(!r){ r = { id: p.guest_id }; this.remotes.set(p.guest_id, r); }
            const isNew = !r.name;
            r.inPresence = true;
            r.name = p.name; r.color = p.color;
            r.kills = p.kills||0; r.deaths = p.deaths||0; r.best = p.best||0;
            r.weapon = p.weapon||r.weapon||'pulse'; r.alive = p.alive!==false;
            // presence pos fallback (slower than broadcast, but proves the link)
            if(p.p && Array.isArray(p.p) && (!r.lastPosRx || performance.now()-r.lastPosRx>1000)){
              r.pos = { x:+p.p[0], y:+p.p[1], z:+p.p[2] };
              if(!r.buf) r.buf = [];
              r.buf.push({ t: performance.now(), pos: {...r.pos}, yaw: r.yaw||0, pitch: r.pitch||0 });
              if(r.buf.length>8) r.buf.shift();
            }
            if(!r.pos){ r.pos = null; r.yaw = 0; r.pitch = 0; }
            r.jet = r.jet||false; r.firing = r.firing||false;
            r.lastSeen = performance.now();
            if(isNew && this.onEvent) this.onEvent('join', r);
          }
        }
        // A Presence reconciliation can briefly omit our own record. Wait for
        // the complete snapshot before changing the host or room roster.
        if(this.connected && !members.some(p => p.guest_id===this.me.id)) return;
        this.electHost(members);
        // A previously tracked player has left the room. Broadcast-only players
        // get a short grace period while their Presence record catches up.
        const now = performance.now();
        for(const id of [...this.remotes.keys()]){
          if(!seen.has(id)){
            const old = this.remotes.get(id);
            const fresh = old && !old.inPresence && old.lastPosRx && (now - old.lastPosRx < 10000);
            if(fresh) continue;
            this.remotes.delete(id);
            if(this.onEvent) this.onEvent('leave', { id, ...(old||{}) });
          }
        }
        if(this.onPresence) this.onPresence(this.list());
      })
      .on('broadcast', { event: 'pos' }, ({ payload }) => {
        if(!payload || payload.id===this.me?.id) return;
        this.rxCount++; this.lastRx = performance.now();
        let r = this.remotes.get(payload.id);
        const wasNew = !r;
        if(!r){ r = { id: payload.id, name: payload.name||'GHOST', color: payload.color||'#fff' }; this.remotes.set(payload.id, r); }
        r.pos = { x: payload.p[0], y: payload.p[1], z: payload.p[2] };
        r.yaw = payload.r[0]; r.pitch = payload.r[1];
        r.weapon = payload.w; r.alive = payload.a; r.jet = payload.j; r.firing = payload.f;
        if(Number.isFinite(payload.h)) r.health = Math.max(0, Math.min(100, payload.h));
        r.kills = payload.k??r.kills??0; r.deaths = payload.d??r.deaths??0;
        r.lastSeen = performance.now(); r.lastPosRx = performance.now();
        // interp buffer
        r.buf = r.buf||[];
        r.buf.push({ t: performance.now(), pos: {...r.pos}, yaw: r.yaw, pitch: r.pitch });
        if(r.buf.length>8) r.buf.shift();
        if(wasNew){
          if(this.onEvent) this.onEvent('join', r);
          if(this.onPresence) this.onPresence(this.list());
        }
      })
      .on('broadcast', { event: 'shot' }, ({ payload }) => { if(this.onEvent) this.onEvent('shot', payload); })
      .on('broadcast', { event: 'dmg' }, ({ payload }) => { if(this.onEvent) this.onEvent('dmg', payload); })
      .on('broadcast', { event: 'kill' }, ({ payload }) => { if(this.onEvent) this.onEvent('kill', payload); })
      .on('broadcast', { event: 'pickup' }, ({ payload }) => { if(this.onEvent) this.onEvent('pickup', payload); })
      .subscribe(async (status) => {
        if(this._closed) return;
        if(status==='SUBSCRIBED'){
          try {
            this.connected = false;
            const trackedHost = this.hostId;
            this._lastPresenceAt = performance.now();
            const result = await this.channel.track(this.presencePayload());
            if(result!=='ok') throw new Error(`Presence tracking failed: ${result}`);
            this.connected = true;
            this.electHost(Object.values(this.channel.presenceState()).flat());
            if(this.hostId===this.me.id && trackedHost!==this.me.id) this.updatePresence();
            if(this.onEvent) this.onEvent('connected', {});
            finishJoin();
          } catch(e){ failJoin(e); }
        } else if(status==='CHANNEL_ERROR' || status==='TIMED_OUT' || status==='CLOSED'){
          this.connected = false;
          this.hostId = null;
          if(this.onEvent) this.onEvent('disconnected', { status });
          failJoin(new Error(`Room connection ${status.toLowerCase()}`));
        }
      });

    // postgres kill feed live
    this.killsChannel = this.sb.channel('arena-kills')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'arena_kill_events', filter: `room=eq.${ROOM_ID}` }, (pl) => {
        if(this.onEvent) this.onEvent('killrow', pl.new);
      })
      .subscribe();

    // Positions use Broadcast. Presence is only for slow-changing room state.
    this._hb = setInterval(()=>this.touchProfile(), 30000);
    return await joined;
  }
  list(){ return [...this.remotes.values()]; }
  presencePayload(patch={}){
    return {
      guest_id: this.me.id, name: this.me.name, color: this.me.color,
      joined_at: this.joinedAt, host_id: this.hostId,
      kills: this.me.kills||0, deaths: this.me.deaths||0, best: this.me.best||0,
      weapon: this.me.weapon||'pulse', alive: this.me.alive!==false,
      ...(this._lastPos ? { p: this._lastPos } : {}),
      ...patch,
    };
  }
  electHost(presences){
    const members = new Map();
    for(const p of presences){
      if(p?.guest_id && !members.has(p.guest_id)) members.set(p.guest_id, p);
    }
    const online = [...members.values()];
    const order = (a,b) => (Number(a.joined_at)||0)-(Number(b.joined_at)||0)
      || a.guest_id.localeCompare(b.guest_id);
    const claims = [...new Set(online.map(p => p.host_id).filter(id => members.has(id)))];
    claims.sort((a,b) => order(members.get(a), members.get(b)));
    const next = claims[0] || online.sort(order)[0]?.guest_id || null;
    if(next===this.hostId) return;
    this.hostId = next;
    if(this.connected && next===this.me.id) this.updatePresence();
    if(this.onEvent) this.onEvent('host', { id: next, isHost: next===this.me.id });
  }
  updatePresence(patch={}){
    if(!this.channel || !this.connected) return;
    Object.assign(this._presencePatch, patch);
    if(this._presenceTimer) return;
    const wait = Math.max(0, 8000 - (performance.now() - this._lastPresenceAt));
    this._presenceTimer = setTimeout(() => {
      this._presenceTimer = null;
      if(!this.connected || this._closed) return;
      const payload = this.presencePayload(this._presencePatch);
      this._presencePatch = {};
      this._lastPresenceAt = performance.now();
      this.channel.track(payload).catch(e => console.warn('Presence update failed', e));
    }, wait);
  }
  async touchProfile(){
    try { await this.sb.from('arena_profiles').upsert({
      guest_id: this.me.id, display_name: this.me.name, color: this.me.color,
      kills: this.me.kills||0, deaths: this.me.deaths||0, best_streak: this.me.best||0,
      last_seen: new Date().toISOString()
    }, { onConflict: 'guest_id' }); } catch(e){}
  }
  sendPos(s){
    const now = performance.now();
    if(now - this._posT < 50) return; // 20Hz
    this._posT = now;
    const p = [+s.pos.x.toFixed(2), +s.pos.y.toFixed(2), +s.pos.z.toFixed(2)];
    this._lastPos = p;
    if(!this.channel || !this.connected) return;
    this.txCount++;
    this.channel.send({ type:'broadcast', event:'pos', payload:{
      id: this.me.id, name: this.me.name, color: this.me.color,
      p,
      r: [+s.yaw.toFixed(3), +s.pitch.toFixed(3)],
      w: s.weapon, a: s.alive, j: !!s.jet, f: !!s.firing,
      h: Math.max(0, Math.min(100, Math.round(s.health ?? 100))),
      k: this.me.kills||0, d: this.me.deaths||0,
    }});
  }
  sendShot(o, d, weapon){
    this.channel?.send({ type:'broadcast', event:'shot', payload:{
      id:this.me.id, name:this.me.name, color:this.me.color, weapon,
      o:[+o.x.toFixed(2),+o.y.toFixed(2),+o.z.toFixed(2)],
      d:[+d.x.toFixed(3),+d.y.toFixed(3),+d.z.toFixed(3)],
    }});
  }
  sendDamage(to, dmg, weapon, head=false){
    this.channel?.send({ type:'broadcast', event:'dmg', payload:{
      from:this.me.id, fromName:this.me.name, to, dmg, weapon, head,
    }});
  }
  sendKill(victimId, victimName, weapon){
    this.channel?.send({ type:'broadcast', event:'kill', payload:{
      killer:this.me.id, killerName:this.me.name, victim:victimId, victimName, weapon, t:Date.now(),
    }});
  }
  sendPickup(spotId, weapon){
    this.channel?.send({ type:'broadcast', event:'pickup', payload:{ by:this.me.id, spot:spotId, weapon, t:Date.now() }});
  }
  async reportKill(killerId, killerName, victimId, victimName, weapon){
    try {
      await this.sb.from('arena_kill_events').insert({
        room: ROOM_ID, killer_id: killerId, killer_name: killerName,
        victim_id: victimId, victim_name: victimName, weapon,
      });
    } catch(e){}
  }
  async fetchRecentKills(limit=12){
    try {
      const { data } = await this.sb.from('arena_kill_events')
        .select('*').eq('room', ROOM_ID).order('created_at',{ascending:false}).limit(limit);
      return data||[];
    } catch(e){ return []; }
  }
  async fetchLeaders(limit=8){
    try {
      const { data } = await this.sb.from('arena_profiles')
        .select('*').order('kills',{ascending:false}).limit(limit);
      return data||[];
    } catch(e){ return []; }
  }
  disconnect(){
    this._closed=true;
    clearInterval(this._hb);
    clearTimeout(this._presenceTimer);
    this._presenceTimer=null;
    try { this.channel?.unsubscribe(); } catch(e){}
    try { this.killsChannel?.unsubscribe(); } catch(e){}
    this.connected=false;
    this.hostId=null;
  }
}
