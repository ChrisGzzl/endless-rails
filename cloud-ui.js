"use strict";
(() => {
  const cfg=window.EndlessRailsCloudConfig, $=id=>document.getElementById(id), button=$('cloudButton');
  if(!button||!cfg?.enabled||new URLSearchParams(window.location.search).get('qa')==='1')return;
  button.hidden=false;
  const panel=$('cloudScreen'),safe=()=>['menu','result'].includes(window.EndlessRailsGame.getState().mode);
  let working=false,ready=false,lastSync=0,retryAt=0,failures=0,tabOwner=false,initializing=true;
  const say=message=>{$('cloudStatus').textContent=message;};
  const defaults=()=>({schemaVersion:1,meta:window.EndlessRailsLongterm.emptyMeta(),record:window.EndlessRailsRunRecord.emptyRecord()});
  let store;
  function render(){
    const id=store?.userId;
    $('cloudIdentity').textContent=id?'测试用户：'+id:'本机游客存档';
    $('cloudAccount').hidden=!id;
    $('cloudConflict').hidden=!store?.conflict;
    if(store?.conflict){const summary=p=>`列车 Lv.${p.meta.train.level} · 废料 ${p.meta.resources.scrap} · 远征 ${p.meta.totals.expeditions} 次`;$('cloudCompare').textContent='本机：'+summary(store.document().payload)+'；服务器：'+summary(store.conflict.payload);}
    $('cloudImport').disabled=!ready||store?.document().revision!==0||!!store?.document().base;
    $('cloudSync').disabled=working||!ready;
    $('cloudLogout').disabled=working;
    $('cloudSelect').disabled=working||initializing;
    $('cloudBadge').textContent=store?.conflict?'存档冲突':id?(store.document().dirty?'等待上传':'测试用户已连接'):'本机存档';
  }
  function refreshGame(){window.EndlessRailsGame.reloadSave();window.EndlessRailsMetaUI.refresh();}
  async function request(id,body){
    const response=await fetch(cfg.apiBase+'/'+encodeURIComponent(id),{
      method:body?'PUT':'GET',headers:body?{'Content-Type':'application/json'}:{},
      body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(10000),
    });
    const value=await response.json();
    if(!response.ok&&response.status!==409)throw Error(value.error||'save_failed');
    return value;
  }
  const transport={read:id=>request(id),save:(id,p)=>request(id,{expectedRevision:p.revision,mutationId:p.id,payload:p.payload})};
  async function synchronize(force=false){
    if(!store?.userId||!safe()||working||!tabOwner)return;
    const now=Date.now();if(!force&&(now<retryAt||now-lastSync<60000))return;
    working=true;render();
    try {
      const result=await store.sync(transport,safe);lastSync=Date.now();failures=0;retryAt=0;ready=true;
      say(result.status==='conflict'?'设备进度不同，请选择要保留的一份。':store.document().revision===0?'服务器暂无此用户存档，可导入本机进度或直接开始新档。':result.status==='pending'?'进度已留在本机，下一次同步将上传最新变化。':'服务器存档已同步。');
      if(result.status==='downloaded')refreshGame();
    }catch(error){failures++;retryAt=Date.now()+Math.min(300000,5000*2**Math.min(failures,6))+Math.random()*3000;
      ready=store.document().revision!==null;say('暂时无法同步，进度留在本机。服务恢复后会重试。');
    }finally{working=false;render();}
  }
  async function select(id){
    if(working||!safe())return;
    if(!tabOwner){say('另一个标签页正在使用测试存档，请关闭它后刷新。');return;}
    if(id&&!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(id)){say('测试 ID 使用 1–48 位小写字母、数字、下划线或短横线。');return;}
    try{
      store.activate(id||null);sessionStorage.setItem('endless-rails-test-user',id||'');ready=false;refreshGame();render();
      if(id)await synchronize(true);else say('已返回游客存档。测试用户未上传的进度仍保留在本机。');
    }catch{say('本机存储不可用，无法切换测试存档。');}
  }
  button.addEventListener('click',()=>{if(safe()){panel.hidden=false;render();}});
  $('cloudClose').addEventListener('click',()=>{panel.hidden=true;});
  $('cloudSelect').addEventListener('click',()=>select($('cloudUserId').value.trim()));
  $('cloudLogout').addEventListener('click',()=>select(null));
  $('cloudSync').addEventListener('click',()=>synchronize(true));
  $('cloudImport').addEventListener('click',()=>{
    if(working||!safe())return;
    try{store.importGuest();refreshGame();lastSync=0;synchronize(true);}catch{say('只能导入到尚未创建服务器存档的新测试用户。');}
  });
  for(const choice of ['cloud','local'])$('cloudUse'+(choice==='cloud'?'Remote':'Local')).addEventListener('click',()=>{
    try{store.resolve(choice,safe);refreshGame();lastSync=0;synchronize(true);}catch{say('暂时无法处理冲突，请返回准备页后重试。');}
  });
  window.EndlessRailsCloud={
    canStart(){return !initializing&&!working&&(!store?.userId||(tabOwner&&ready&&!store.conflict));},
    open(){panel.hidden=false;render();},
  };
  async function initialize(){
    // One active test-save tab prevents stale in-memory game state clobbering the same local cache.
    if(!navigator.locks)throw Error('locks_unavailable');
    await new Promise((resolve,reject)=>{
      navigator.locks.request('endless-rails-test-save-tab',{ifAvailable:true},lock=>{
        if(!lock){reject(Error('another_tab'));return;}
        tabOwner=true;resolve();return new Promise(()=>{});
      }).catch(reject);
    });
    store=window.EndlessRailsCloudSync.createStore({storage:window.localStorage,defaults,uuid:()=>crypto.randomUUID(),changed:render});
    window.EndlessRailsCloudStorage=store.storage;
    const id=sessionStorage.getItem('endless-rails-test-user');if(id)await select(id);
  }
  initialize().catch(()=>say('测试存档暂不可用：请使用新版浏览器，并关闭其他游戏标签页。'))
    .finally(()=>{initializing=false;render();});
  setInterval(()=>{if(safe())synchronize();},2000);
  window.addEventListener('online',()=>{retryAt=0;lastSync=0;});
})();
