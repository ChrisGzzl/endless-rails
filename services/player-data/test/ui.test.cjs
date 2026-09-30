'use strict';
// The test-save sheet of the canvas interface, driven by taps on the painted
// controls exactly like the page: select a test user, upload the guest save,
// refuse switching mid-run, return to the guest save.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const createGame=require('../../../tests/test-harness.cjs');
const meta=require('../../../src/meta/longterm');
const createStorage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v))};};
const idle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
test('enabled UI selects test users, uploads guest, restores guest and refuses mid-run switching',async()=>{
 const raw=createStorage(),session=createStorage(),remote=new Map();let counter=0,typed='';
 const fetch=async(url,options)=>{
  const id=url.split('/').pop();
  if(options.method==='GET')return {ok:true,json:async()=>remote.get(id)||null};
  const p=JSON.parse(options.body);remote.set(id,{revision:p.expectedRevision+1,payload:p.payload});return {ok:true,json:async()=>({status:'ok',revision:p.expectedRevision+1})};
 };
 const guest=meta.emptyMeta();guest.resources.scrap=77;raw.setItem(meta.STORAGE_KEY,JSON.stringify(guest));
 const game=createGame({storage:raw,
  sources:{'src/core/cloud-config.js':'window.EndlessRailsCloudConfig=Object.freeze({enabled:true,apiBase:"/api/saves"});'},
  window:{fetch,URLSearchParams,AbortSignal,sessionStorage:session,crypto:{randomUUID:()=>String(++counter)},navigator:{locks:{request:async(_name,_opts,fn)=>fn({})}},prompt:()=>typed}});
 const {ui,run}=game;
 await idle();
 assert.equal(run('EndlessRailsCloud.canStart()'),true);
 ui.tap('startSettingsButton');
 assert.equal(ui.visible('cloudButton'),true,'the test-save entry is offered when the service config is enabled');
 ui.tap('cloudButton');
 assert.equal(ui.visible('cloudScreen'),true);
 typed='alice';ui.tap('cloudUserId');ui.tap('cloudSelect');await idle();
 assert.equal(session.getItem('endless-rails-test-user'),'alice');assert.equal(run('EndlessRailsCloud.canStart()'),true);
 assert.equal(JSON.parse(run('EndlessRailsCloudStorage').getItem(meta.STORAGE_KEY)).resources.scrap,0,'a new test user starts empty');
 assert.equal(ui.disabled('cloudImport'),false);
 ui.tap('cloudImport');await idle();
 assert.equal(remote.get('alice').payload.meta.resources.scrap,77,'the guest save was uploaded');
 run('state.mode="combat"');typed='bob';ui.tap('cloudUserId');ui.tap('cloudSelect');await idle();
 assert.equal(session.getItem('endless-rails-test-user'),'alice','switching is refused mid-run');
 run('state.mode="result"');ui.tap('cloudLogout');await idle();
 assert.equal(JSON.parse(run('EndlessRailsCloudStorage').getItem(meta.STORAGE_KEY)).resources.scrap,77,'the guest save is back');
 assert.equal(run('state.metaProfile.resources.scrap'),77,'the game reloaded the guest profile');
 ui.tap('cloudClose');assert.equal(ui.visible('cloudScreen'),false);
});
