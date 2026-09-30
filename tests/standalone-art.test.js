"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

// Installed-standalone launches must reuse the HTTP cache like browser tabs
// do. The old workaround (fetch with cache:"reload" plus a Date.now() nonce)
// re-downloaded every sheet on each launch, which made home-screen starts
// painfully slow on throttled links; the service worker now owns offline
// freshness instead.
test("standalone mode keeps plain cacheable image requests",async()=>{
  const requests=[],fetches=[],timers=new Map();
  let timerId=0;
  class Image{constructor(){this.naturalWidth=1254;}set src(value){this.url=value;requests.push(this);}}
  const context={Image,navigator:{standalone:true},window:{matchMedia:()=>({matches:true})},
    fetch(url,options){fetches.push({url,options});return Promise.resolve({ok:true,blob:()=>Promise.resolve({})});},
    URL:{createObjectURL:()=>"blob:art"},
    setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
    ctx:new Proxy({},{get:(target,key)=>target[key]||(()=>{})})};
  vm.createContext(context);
  const source=fs.readFileSync(__dirname+"/../src/view/atlas.js","utf8")
    .replace(/^import\s*\{[^}]*\}\s*from\s*["'][^"']+[\"']\s*;.*$/gm,"")
    .replace(/^import\s*[\"'][^\"']+[\"']\s*;.*$/gm,"")
    .replace(/^export\s*\{[^}]*\}\s*;.*$/gm,"")
    .replace(/^export\s+(?=(?:async\s+)?(?:const|let|var|function\s*\*?|class))/gm,"");
  vm.runInContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fetches.length,0,"no cache-reload fetch path remains");
  assert.equal(requests.length,5,"cold start requests only the boot sheets");
  for(const image of requests){
    assert.ok(image.url.startsWith("assets/"),"plain relative URLs");
    assert.doesNotMatch(image.url,/standalone=|Date|\d{13}/,"no cache-busting nonce");
    image.onload();
  }
  const status=vm.runInContext("artState()",context);
  assert.equal(status.startDisabled,false);
  assert.equal(status.statusHidden,true);
});
