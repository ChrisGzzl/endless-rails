'use strict';
// Development-only JSON saves. Test IDs are selectors, NOT authenticated identities.
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const meta=require('../../src/meta/longterm');
const expedition=require('../../src/meta/expedition');
const ROOT=path.resolve(__dirname,'../..');
const MAX_PAYLOAD=32768, MAX_BODY=MAX_PAYLOAD+4096;
class ApiError extends Error {constructor(status,message){super(message);this.status=status;}}
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
function validate(payload){
 if(!object(payload)||payload.schemaVersion!==1||!object(payload.meta)||!object(payload.record)
   ||![1,2,3,4].includes(payload.meta.version)||payload.record.version!==1
   ||!object(payload.meta.resources)||!object(payload.meta.train)
   ||Object.keys(payload).some(k=>!['schemaVersion','meta','record'].includes(k)))throw new ApiError(400,'invalid_save');
 if(Buffer.byteLength(JSON.stringify(payload))>MAX_PAYLOAD)throw new ApiError(413,'save_too_large');
 function walk(value,depth=0){
  if(depth>10)throw new ApiError(400,'save_too_deep');
  if(typeof value==='number'&&(!Number.isFinite(value)||value<0||value>1e12))throw new ApiError(400,'invalid_number');
  if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
   if(['__proto__','prototype','constructor'].includes(key))throw new ApiError(400,'invalid_key');walk(item,depth+1);
  }
 }
 walk(payload);
 const m=payload.meta, r=payload.record;
 const integer=value=>Number.isSafeInteger(value)&&value>=0&&value<=1e12;
 // v0.10 resources use fixed-3 fractional bookkeeping (需求 §19.2).
 const fixed3=value=>Number.isFinite(value)&&value>=0&&value<=1e12&&Math.abs(value*1000-Math.round(value*1000))<1e-6;
 if(!['scrap','components','data'].every(k=>integer(m.resources[k])||fixed3(m.resources[k]))
   ||(m.version<3&&!integer(m.train.xp))||(m.version>=3&&Object.keys(m.train).some(k=>k!=='level'))||!Number.isInteger(m.train.level)||m.train.level<1||m.train.level>30
   ||!object(m.totals)||!['expeditions','extracts','wins','losses'].every(k=>integer(m.totals[k]))
   ||!object(m.research)||!meta.RESEARCH_IDS.every(k=>Number.isInteger(m.research[k])&&m.research[k]>=0&&m.research[k]<=meta.MAX_RESEARCH_LEVEL)
   ||!object(m.regions)||!meta.REGIONS.every(region=>object(m.regions[region.id])&&integer(m.regions[region.id].clears)&&typeof m.regions[region.id].unlocked==='boolean'&&typeof m.regions[region.id].repaired==='boolean')
   ||!meta.REGIONS.some(region=>region.id===m.selectedRegion)
   ||!['runs','bestStations','bestKills','bestCombo','bestScrap'].every(k=>integer(r[k]))
   ||!(r.latest===null||object(r.latest)))throw new ApiError(400,'invalid_save');
 // v0.10: talents/presets exist on version-2 saves; unlockedCars is derived now.
 if(m.version>=2){
   if(!object(m.talents)||!object(m.talents.nodes)||!object(m.talents.specs)
     ||!Array.isArray(m.presets)||m.presets.length!==3
     ||!Number.isInteger(m.freeRefits)||m.freeRefits<0||m.freeRefits>99
     ||(m.settledRunIds!==undefined&&(!Array.isArray(m.settledRunIds)||m.settledRunIds.length>256
       ||new Set(m.settledRunIds).size!==m.settledRunIds.length
       ||!m.settledRunIds.every(id=>typeof id==='string'&&id.length>0&&id.length<=80)))
     ||!meta.TALENT_NODES.every(node=>m.talents.nodes[node.id]===undefined
        ||Number.isInteger(m.talents.nodes[node.id])&&m.talents.nodes[node.id]>=0&&m.talents.nodes[node.id]<=node.levels))
     throw new ApiError(400,'invalid_save');
 }
 for(const [key,allowed,max] of [['loadout',meta.CAR_DEFS.map(c=>c.id),6],['blueprints',meta.BLUEPRINTS.map(b=>b.id),12]]){
   if(!Array.isArray(m[key])||m[key].length>max||!m[key].every(id=>allowed.includes(id)))throw new ApiError(400,'invalid_save');
 }
 // v0.12: an attached expedition must survive the full whitelist rebuild; a
 // corrupt map is rejected whole, never partially sanitized (规划 §19.1).
 if(m.activeExpedition!==undefined&&m.activeExpedition!==null
   &&!expedition.normalizeExpedition(m.activeExpedition,{regionIds:meta.REGIONS.map(r=>r.id)}))throw new ApiError(400,'invalid_save');
 return payload;
}
function createFileStore(dataDir){
 const jobs=new Map();
 const filename=id=>{if(!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(id))throw new ApiError(400,'invalid_test_id');return path.join(dataDir,id.slice(0,2),id+'.json');};
 async function read(id){
  try{return JSON.parse(await fs.readFile(filename(id),'utf8'));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
 }
 async function atomic(file,data){
  await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.'+randomUUID()+'.tmp';let handle;
  try{handle=await fs.open(tmp,'wx',0o600);await handle.writeFile(JSON.stringify(data,null,2)+'\n');await handle.sync();await handle.close();handle=null;await fs.rename(tmp,file);}
  finally{await handle?.close();await fs.rm(tmp,{force:true});}
 }
 async function save(id,request){
  const file=filename(id);
  if(!object(request)||!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0
   ||typeof request.mutationId!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(request.mutationId))throw new ApiError(400,'invalid_request');
  validate(request.payload);
  // Serialize compare-and-swap for each test ID in this single server process.
  const previous=jobs.get(id)||Promise.resolve();
  const job=previous.catch(()=>{}).then(async()=>{
   const current=await read(id);
   if(current?.mutationId===request.mutationId){
    if(JSON.stringify(current.payload)!==JSON.stringify(request.payload))throw new ApiError(400,'mutation_reused');
    return {status:'ok',revision:current.revision};
   }
   if((current?.revision||0)!==request.expectedRevision)return {status:'conflict',revision:current?.revision||0};
   const next={revision:(current?.revision||0)+1,updatedAt:new Date().toISOString(),mutationId:request.mutationId,payload:request.payload};
   if(current)await atomic(file.replace(/\.json$/,'.previous.json'),current);
   await atomic(file,next);
   return {status:'ok',revision:next.revision};
  });
  jobs.set(id,job);
  try{return await job;}finally{if(jobs.get(id)===job)jobs.delete(id);}
 }
 return {read,save};
}
function createServer({dataDir=path.join(__dirname,'data'),root=ROOT}={}){
 const store=createFileStore(dataDir);
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.woff2':'font/woff2'};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   // Reject cross-site browser access; this service has no production authentication.
   if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)throw new ApiError(403,'cross_origin_denied');
   if(req.headers['sec-fetch-site']==='cross-site')throw new ApiError(403,'cross_origin_denied');
   if(url.pathname==='/api/health'){send(res,200,{ok:true,mode:'development-files'});return;}
   if(url.pathname.startsWith('/api/saves/')){
    const id=decodeURIComponent(url.pathname.slice('/api/saves/'.length));
    if(req.method==='GET'){
     const value=await store.read(id);send(res,200,value?{revision:value.revision,payload:value.payload,updatedAt:value.updatedAt}:null);return;
    }
    if(req.method!=='PUT')throw new ApiError(405,'method_not_allowed');
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new ApiError(415,'json_required');
    let size=0,chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY){send(res,413,{error:'request_too_large'});req.resume();return;}chunks.push(chunk);}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(400,'invalid_json');}
    const result=await store.save(id,input);send(res,result.status==='conflict'?409:200,result);return;
   }
   if(!['GET','HEAD'].includes(req.method))throw new ApiError(405,'method_not_allowed');
   if(url.pathname==='/src/core/cloud-config.js'){
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
    res.end('window.EndlessRailsCloudConfig=Object.freeze({enabled:true,apiBase:"/api/saves"});');return;
   }
   let relative=decodeURIComponent(url.pathname);
   if(!relative.startsWith('/')||relative.includes('..')||relative.includes('\\')||relative.includes('\0'))throw new ApiError(404,'not_found');
   if(relative.endsWith('/'))relative+='index.html';
   const ext=path.extname(relative);if(!mime[ext])throw new ApiError(404,'not_found');
   const file=path.join(root,relative);
   const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[ext],'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
  }catch(error){
   const status=error.status||(error.code==='ENOENT'?404:500);
   send(res,status,{error:status===500?'storage_error':error.message});
  }
 });
 server.requestTimeout=15000;
 return server;
}
if(require.main===module){
 const port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
 const server=createServer({dataDir:process.env.SAVE_DATA_DIR?path.resolve(process.env.SAVE_DATA_DIR):undefined});
 server.listen(port,host,()=>console.log(`Endless Rails development saves: http://${host}:${port}/`));
}
module.exports={createServer,createFileStore,validate};
