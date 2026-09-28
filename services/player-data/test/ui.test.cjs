'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const sync=require('../../../src/core/cloud-sync');
const meta=require('../../../src/meta/longterm');
const records=require('../../../src/core/run-record');
const createStorage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v))};};
const idle=()=>new Promise(r=>setImmediate(r));
test('enabled UI selects test users, uploads guest, restores guest and refuses mid-run switching',async()=>{
 const raw=createStorage(),session=createStorage(),remote=new Map();let phase='menu',counter=0,refreshes=0;
 const els={};const $=id=>els[id]??={hidden:true,disabled:false,value:'',textContent:'',addEventListener(type,fn){this[type]=fn;}};
 const win={EndlessRailsCloudConfig:{enabled:true,apiBase:'/api/saves'},location:{search:''},localStorage:raw,
  EndlessRailsCloudSync:sync,EndlessRailsLongterm:meta,EndlessRailsRunRecord:records,
  EndlessRailsGame:{getState:()=>({mode:phase}),reloadSave:()=>refreshes++},EndlessRailsMetaUI:{refresh(){}},addEventListener(){}};
 const fetch=async(url,options)=>{
  const id=url.split('/').pop();
  if(options.method==='GET')return {ok:true,json:async()=>remote.get(id)||null};
  const p=JSON.parse(options.body);remote.set(id,{revision:p.expectedRevision+1,payload:p.payload});return {ok:true,json:async()=>({status:'ok',revision:p.expectedRevision+1})};
 };
 const sandbox={window:win,document:{getElementById:$},navigator:{locks:{request:async(_name,_opts,fn)=>fn({})}},sessionStorage:session,fetch,URLSearchParams,AbortSignal,crypto:{randomUUID:()=>String(++counter)},setInterval(){}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../../../src/app/cloud-ui.js','utf8'),sandbox);
 await idle();assert.equal($('cloudButton').hidden,false);assert.equal(win.EndlessRailsCloud.canStart(),true);
 const guest=meta.emptyMeta();guest.resources.scrap=77;raw.setItem(meta.STORAGE_KEY,JSON.stringify(guest));
 $('cloudUserId').value='alice';await $('cloudSelect').click();
 assert.equal(session.getItem('endless-rails-test-user'),'alice');assert.equal(win.EndlessRailsCloud.canStart(),true);
 assert.equal(JSON.parse(win.EndlessRailsCloudStorage.getItem(meta.STORAGE_KEY)).resources.scrap,0);
 $('cloudImport').click();await idle();assert.equal(remote.get('alice').payload.meta.resources.scrap,77);
 $('cloudUserId').value='bob';phase='combat';await $('cloudSelect').click();assert.equal(session.getItem('endless-rails-test-user'),'alice');
 phase='result';await $('cloudLogout').click();assert.equal(JSON.parse(win.EndlessRailsCloudStorage.getItem(meta.STORAGE_KEY)).resources.scrap,77);
 assert.ok(refreshes>=3);
});
