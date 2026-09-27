"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

test("iOS standalone mode bypasses stale image cache through reload fetch and Blob URLs",async()=>{
  const images=[],fetches=[],revoked=[],timers=new Map(),events={};let timerId=0,blobId=0;
  const elements=Object.fromEntries(["startButton","artStatus","retryArtButton"].map(id=>[id,{hidden:true,events:{},addEventListener(type,fn){this.events[type]=fn;}}]));
  class Image{constructor(){this.naturalWidth=1254;this.naturalHeight=1254;}set src(value){this.url=value;images.push(this);}}
  const context={Image,navigator:{standalone:true},window:{matchMedia:()=>({matches:true}),addEventListener(type,fn){events[type]=fn;}},
    document:{getElementById:id=>elements[id]},fetch(url,options){fetches.push({url,options});return Promise.resolve({ok:true,blob:()=>Promise.resolve({url})});},
    URL:{createObjectURL:()=>"blob:art-"+(++blobId),revokeObjectURL:url=>revoked.push(url)},
    setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
    ctx:new Proxy({},{get:(target,key)=>target[key]||(()=>{})})};
  vm.createContext(context);
  // renderer.js is a real ES module; strip import/export syntax as the shared harness does.
  const source=fs.readFileSync(__dirname+"/src/view/atlas.js","utf8")
    .replace(/^import\s*\{[^}]*\}\s*from\s*["'][^"']+["']\s*;.*$/gm,"")
    .replace(/^import\s*["'][^"']+["']\s*;.*$/gm,"")
    .replace(/^export\s*\{[^}]*\}\s*;.*$/gm,"")
    .replace(/^export\s+(?=(?:async\s+)?(?:const|let|var|function\s*\*?|class))/gm,"");
  vm.runInContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(fetches.length,8);
  assert.ok(fetches.every(call=>call.options.cache==="reload"&&call.url.includes("standalone=")));
  assert.equal(images.length,8);assert.ok(images.every(image=>image.url.startsWith("blob:art-")));
  for(const image of images)image.onload();
  assert.equal(elements.startButton.disabled,false);assert.equal(elements.artStatus.hidden,true);
  events.pagehide();assert.equal(revoked.length,8);
});
