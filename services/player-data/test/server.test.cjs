'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createServer,createFileStore}=require('../server.cjs');
const meta=require('../../../src/meta/longterm');
const record=require('../../../src/core/run-record');
const payload=()=>({schemaVersion:1,meta:meta.emptyMeta(),record:record.emptyRecord()});
const put=(revision,id,value=payload())=>({expectedRevision:revision,mutationId:id,payload:value});
async function fixture(t){
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'rails-saves-'));
 t.after(()=>fs.rm(dataDir,{recursive:true,force:true}));
 return {dataDir,store:createFileStore(dataDir)};
}
test('separate users, durable restart, retry idempotence and one previous version',async t=>{
 const {dataDir,store}=await fixture(t);const p=payload();p.meta.resources.scrap=23;
 assert.equal(await store.read('bob'),null);
 assert.equal((await store.save('alice',put(0,'m1',p))).revision,1);
 assert.equal(await store.read('bob'),null);
 assert.equal((await store.save('alice',put(0,'m1',p))).revision,1);
 await assert.rejects(store.save('alice',put(0,'m1')),/mutation_reused/);
 const restarted=createFileStore(dataDir);assert.equal((await restarted.read('alice')).payload.meta.resources.scrap,23);
 assert.equal((await restarted.save('alice',put(1,'m2'))).revision,2);
 const previous=JSON.parse(await fs.readFile(path.join(dataDir,'al','alice.previous.json'),'utf8'));assert.equal(previous.revision,1);
 assert.deepEqual((await fs.readdir(path.join(dataDir,'al'))).sort(),['alice.json','alice.previous.json']);
});
test('simultaneous writes with same base: one succeeds and the other conflicts',async t=>{
 const {store}=await fixture(t);
 const results=await Promise.all([store.save('player',put(0,'one')),store.save('player',put(0,'two'))]);
 assert.deepEqual(results.map(r=>r.status),['ok','conflict']);assert.equal((await store.read('player')).revision,1);
});
test('invalid IDs cannot escape data folder; invalid payload cannot destroy existing save',async t=>{
 const {store}=await fixture(t);
 for(const id of ['../secret','a/b','UPPER','x'.repeat(49),''])await assert.rejects(store.read(id),/invalid_test_id/);
 await store.save('alice',put(0,'good'));
 const bad=payload();bad.meta.resources.scrap=-1;await assert.rejects(store.save('alice',put(1,'bad',bad)),/invalid_number/);
 bad.meta.resources.scrap=0;bad.meta.settledRunIds=['same','same'];await assert.rejects(store.save('alice',put(1,'duplicate-ledger',bad)),/invalid_save/);
 bad.meta.settledRunIds=[];
 bad.meta.train.xp=1;await assert.rejects(store.save('alice',put(1,'old-xp',bad)),/invalid_save/);
 delete bad.meta.train.xp;
 bad.meta.resources.scrap=0;bad.record.latest={text:'x'.repeat(33000)};await assert.rejects(store.save('alice',put(1,'large',bad)),/save_too_large/);
 assert.equal((await store.read('alice')).revision,1);
});
test('HTTP read/write, invalid JSON, origin guard, static game config and data privacy',async t=>{
 const {dataDir}=await fixture(t);const server=createServer({dataDir});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/api/saves/player')).status,200);
 let r=await fetch(base+'/api/saves/player',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(put(0,'write'))});assert.equal(r.status,200);
 r=await fetch(base+'/api/saves/player',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(put(0,'conflict'))});assert.equal(r.status,409);
 assert.equal((await fetch(base+'/api/saves/player',{headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await fetch(base+'/services/player-data/data/pl/player.json')).status,404);
 assert.equal((await fetch(base+'/.git/config')).status,404);
 assert.match(await (await fetch(base+'/src/core/cloud-config.js')).text(),/enabled:true/);
 assert.match(await (await fetch(base+'/')).text(),/<canvas id="gameCanvas"/);
 assert.match(await (await fetch(base+'/src/view/screens/dialogs.js')).text(),/测试存档/);
 r=await fetch(base+'/api/saves/player',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(r.status,400);
 r=await fetch(base+'/api/saves/player',{method:'PUT',headers:{'Content-Type':'application/json'},body:'x'.repeat(40000)});assert.equal(r.status,413);
});
