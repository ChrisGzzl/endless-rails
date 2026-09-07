"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

function boot(){
  const requests=[],timers=new Map(),draws=[];
  const elements=Object.fromEntries(["startButton","artStatus","retryArtButton"].map(id=>[id,{hidden:true,events:{},addEventListener(type,fn){this.events[type]=fn;}}]));
  let timerId=0;
  class Image{
    constructor(){this.naturalWidth=1254;}
    set src(value){this.url=value;requests.push(this);}
  }
  const context={Image,document:{getElementById:id=>elements[id]},setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},ctx:new Proxy({drawImage(...args){draws.push(args);}},{get:(target,key)=>target[key]||(()=>{})})};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname+"/renderer.js","utf8"),context);
  return {requests,timers,elements,draws,run:code=>vm.runInContext(code,context)};
}

// A missing atlas must never silently leave a whole run using line-art turrets.
const app=boot();
assert.equal(app.elements.startButton.disabled,true);
assert.equal(app.requests.length,4);
const [hover,atlas,ground,vfx]=app.requests;
hover.onload();ground.onload();vfx.onload();
assert.equal(app.elements.startButton.disabled,true,"wait for the train/turret atlas too");
atlas.onerror();
const retry1=app.requests.at(-1);
assert.match(retry1.url,/sci-fi-atlas-v1.webp\?v=.*&retry=/,"bypass a stale failed cache entry");
retry1.onerror();app.requests.at(-1).onerror();
assert.equal(app.requests.length,6,"automatic retries are bounded");
assert.equal(app.elements.retryArtButton.hidden,false);
assert.match(app.elements.artStatus.textContent,/列车与防御塔/);
app.elements.retryArtButton.events.click();
const recovered=app.requests.at(-1);recovered.onload();
assert.equal(app.elements.startButton.disabled,false);
assert.equal(app.elements.artStatus.hidden,true);
assert.equal(app.elements.retryArtButton.hidden,true);
assert.equal(app.timers.size,0);
assert.equal(app.run("paintSprite(0,0,0,80,80)"),true);
assert.equal(app.run("paintSprite(11,0,0,37,42)"),true);
assert.equal(app.draws[0][0],hover,"command drone uses the designed hover sheet");
assert.equal(app.draws[1][0],recovered,"station turret uses the restored atlas");
assert.deepEqual(app.draws[1].slice(1,5),[979,628,237,297]);

// A request that hangs, or a late callback from it, must not block recovery.
const stalled=boot(),oldLoad=stalled.requests[0].onload;
const timeout=stalled.timers.values().next().value;timeout();
const replacement=stalled.requests.at(-1);replacement.onload();oldLoad();
assert.equal(stalled.run("gameArt.hover") ,replacement);
stalled.requests[1].onload();stalled.requests[2].onload();stalled.requests[3].onload();
assert.equal(stalled.elements.startButton.disabled,false);
assert.equal(stalled.timers.size,0);
console.log("Art loading: gating, cache recovery, retry limits, timeout and sprite restoration passed.");
