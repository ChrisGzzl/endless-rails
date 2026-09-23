"use strict";
(() => {
  const META = 'endless-rails-v09-meta', RECORD = 'endless-rails-v04-record';
  const clone = value => JSON.parse(JSON.stringify(value));
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  // Pure synchronization core, shared by browser integration and failure-path tests.
  function createStore({storage, defaults, uuid, changed=()=>{}}) {
    let userId = null, conflict = null, busy = false;
    const key = id => 'endless-rails-cloud-v1:' + id;
    function read(id=userId) {
      const raw=storage.getItem(key(id));
      if(raw){const doc=JSON.parse(raw);if(doc.version!==1)throw Error('unsupported_local_save');return doc;}
      return {version:1,revision:null,base:null,payload:defaults(),dirty:false,pending:null};
    }
    function write(doc,id=userId) { storage.setItem(key(id),JSON.stringify(doc)); }
    const api = {
      activate(id) { if(busy)throw Error('sync_busy');userId=id;conflict=null;if(id)write(read());changed(); },
      get userId(){return userId;}, get conflict(){return conflict;}, get busy(){return busy;},
      document(){return clone(read());},
      storage: {
        getItem(k) { if(!userId||![META,RECORD].includes(k))return storage.getItem(k);
          return JSON.stringify(read().payload[k===META?'meta':'record']); },
        setItem(k,v) { if(!userId||![META,RECORD].includes(k)){storage.setItem(k,v);return;}
          const doc=read();doc.payload[k===META?'meta':'record']=JSON.parse(v);
          doc.dirty=!same(doc.payload,doc.base);write(doc);changed(); },
      },
      importGuest() {
        if(!userId||busy)throw Error('account_not_ready');
        const doc=read();if(doc.revision!==0||doc.base||doc.pending)throw Error('cloud_not_empty');
        const payload=defaults();
        for(const [k,field] of [[META,'meta'],[RECORD,'record']]){const value=storage.getItem(k);if(value)payload[field]=JSON.parse(value);}
        doc.payload=payload;doc.dirty=true;write(doc);changed();
      },
      async sync(transport, canApply=()=>true) {
        if(!userId||busy||conflict)return {status:conflict?'conflict':'idle'};
        busy=true;const id=userId;
        try {
          let doc=read(id);
          if(doc.revision===null || (!doc.dirty&&!doc.pending)) {
            const remote=await transport.read(id);
            doc=read(id); // A local save may have happened while waiting for the server.
            if(remote&&remote.revision!==doc.revision){
              if(doc.dirty||!canApply()){conflict=remote;changed();return {status:'conflict'};}
              doc={...doc,revision:remote.revision,base:remote.payload,payload:remote.payload,dirty:false,pending:null};
              write(doc,id);changed();return {status:'downloaded'};
            }
            if(!remote&&doc.revision!==null&&doc.revision!==0){conflict={revision:0,payload:defaults()};changed();return {status:'conflict'};}
            if(doc.revision===null){doc.revision=remote?.revision||0;write(doc,id);}
          }
          doc=read(id);
          if(!doc.dirty&&!doc.pending)return {status:'synced'};
          if(!doc.pending){doc.pending={id:uuid(),revision:doc.revision,payload:clone(doc.payload)};write(doc,id);}
          const pending=doc.pending;
          const result=await transport.save(id,pending);
          if(result.status==='conflict'){
            conflict=await transport.read(id)||{revision:0,payload:defaults()};changed();return {status:'conflict'};
          }
          if(result.status!=='ok')return result;
          doc=read(id);doc.revision=result.revision;doc.base=pending.payload;doc.pending=null;
          doc.dirty=!same(doc.payload,doc.base);write(doc,id);changed();
          return {status:doc.dirty?'pending':'synced'};
        } finally {busy=false;}
      },
      resolve(choice,canApply=()=>true) {
        if(!conflict||busy||!canApply())throw Error('cannot_resolve_now');
        const doc=read();
        // Keep one recovery copy locally before either side is replaced.
        storage.setItem(key(userId)+':recovery',JSON.stringify({local:doc.payload,remote:conflict}));
        if(choice==='cloud')doc.payload=clone(conflict.payload);
        else if(choice!=='local')throw Error('invalid_choice');
        doc.revision=conflict.revision;doc.base=conflict.revision?conflict.payload:null;
        doc.pending=null;doc.dirty=choice==='local';write(doc);conflict=null;changed();
      },
    };
    return api;
  }
  const api={createStore};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.EndlessRailsCloudSync=api;
})();
