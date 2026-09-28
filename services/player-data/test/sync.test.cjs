'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStore}=require('../../../src/core/cloud-sync');
const meta=require('../../../src/meta/longterm');
const records=require('../../../src/core/run-record');
const defaults=()=>({schemaVersion:1,meta:meta.emptyMeta(),record:records.emptyRecord()});
const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){
 const map=new Map(),remote=new Map();let counter=0,sends=0;
 const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v))};
 const make=()=>createStore({storage,defaults,uuid:()=>String(++counter)});
 const transport={read:async id=>clone(remote.get(id)||null),save:async(id,p)=>{
  sends++;const r=remote.get(id);
  if(r?.mutation===p.id)return {status:'ok',revision:r.revision};
  if((r?.revision||0)!==p.revision)return {status:'conflict'};
  remote.set(id,{revision:p.revision+1,payload:clone(p.payload),mutation:p.id});return {status:'ok',revision:p.revision+1};
 }};
 return {make,storage,remote,transport,get sends(){return sends;}};
}
const put=(s,n)=>{const m=meta.emptyMeta();m.resources.scrap=n;s.storage.setItem(meta.STORAGE_KEY,JSON.stringify(m));};
test('guest import is explicit, account caches stay isolated and logout restores guest',async()=>{
 const f=fixture(),s=f.make();put(s,42);s.activate('A');assert.equal(s.document().payload.meta.resources.scrap,0);
 await s.sync(f.transport);s.importGuest();await s.sync(f.transport);assert.equal(f.remote.get('A').payload.meta.resources.scrap,42);
 assert.throws(()=>s.importGuest(),/cloud_not_empty/);s.activate('B');await s.sync(f.transport);assert.equal(s.document().payload.meta.resources.scrap,0);
 s.activate(null);assert.equal(JSON.parse(s.storage.getItem(meta.STORAGE_KEY)).resources.scrap,42);
});
test('response loss survives reload and retries same mutation, without double revision',async()=>{
 const f=fixture();let s=f.make();s.activate('A');await s.sync(f.transport);put(s,7);
 await assert.rejects(s.sync({...f.transport,save:async(...args)=>{await f.transport.save(...args);throw Error('network_lost');}}));
 assert.equal(f.remote.get('A').revision,1);assert.ok(s.document().pending);
 s=f.make();s.activate('A');await s.sync(f.transport);assert.equal(f.remote.get('A').revision,1);assert.equal(s.document().dirty,false);
});
test('local changes during upload are preserved for next upload',async()=>{
 const f=fixture(),s=f.make();s.activate('A');await s.sync(f.transport);put(s,7);
 await s.sync({...f.transport,save:async(...args)=>{put(s,9);return f.transport.save(...args);}});
 assert.equal(s.document().dirty,true);await s.sync(f.transport);assert.equal(f.remote.get('A').payload.meta.resources.scrap,9);
});
test('conflict stops automatic upload and selected local copy uses latest CAS',async()=>{
 const f=fixture(),s=f.make();s.activate('A');await s.sync(f.transport);put(s,5);await s.sync(f.transport);
 f.remote.set('A',{revision:2,payload:defaults()});put(s,20);
 assert.equal((await s.sync(f.transport)).status,'conflict');const sends=f.sends;await s.sync(f.transport);assert.equal(f.sends,sends);
 s.resolve('local');await s.sync(f.transport);assert.equal(f.remote.get('A').revision,3);assert.equal(f.remote.get('A').payload.meta.resources.scrap,20);
});
test('never apply remote mid-run; cloud choice retains a recovery copy',async()=>{
 const f=fixture(),s=f.make();f.remote.set('A',{revision:2,payload:defaults()});s.activate('A');
 await s.sync(f.transport,()=>false);assert.ok(s.conflict);assert.throws(()=>s.resolve('cloud',()=>false),/cannot_resolve_now/);
 s.resolve('cloud');assert.equal(s.document().revision,2);assert.ok(f.storage.getItem('endless-rails-cloud-v1:A:recovery'));
});
test('local save during initial read is a conflict, not silently replaced',async()=>{
 const f=fixture(),s=f.make();s.activate('A');f.remote.set('A',{revision:2,payload:defaults()});
 await s.sync({...f.transport,read:async id=>{put(s,99);return f.transport.read(id);}});
 assert.ok(s.conflict);assert.equal(s.document().payload.meta.resources.scrap,99);
});
test('throttle keeps durable pending request; auth switch blocked while syncing',async()=>{
 const f=fixture(),s=f.make();s.activate('A');await s.sync(f.transport);put(s,3);
 await s.sync({...f.transport,save:async()=>{assert.throws(()=>s.activate('B'),/sync_busy/);return {status:'throttled'};}});
 assert.ok(s.document().pending);await s.sync(f.transport);assert.equal(s.document().dirty,false);
});
