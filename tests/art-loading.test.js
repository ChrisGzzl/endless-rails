"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");

function boot(){
  const requests=[],timers=new Map(),draws=[];
  let timerId=0;
  class Image{
    constructor(){this.naturalWidth=1254;}
    set src(value){this.url=value;requests.push(this);}
  }
  const context={Image,setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},ctx:new Proxy({drawImage(...args){draws.push(args);}},{get:(target,key)=>target[key]||(()=>{})})};
  vm.createContext(context);
  // renderer.js is a real ES module; strip its import/export syntax exactly
  // like test-harness.cjs does before feeding it to the isolated sandbox.
  const source=fs.readFileSync(__dirname+"/../src/view/atlas.js","utf8")
    .replace(/^import\s*\{[^}]*\}\s*from\s*["'][^"']+["']\s*;.*$/gm,"")
    .replace(/^import\s*["'][^"']+["']\s*;.*$/gm,"")
    .replace(/^export\s*\{[^}]*\}\s*;.*$/gm,"")
    .replace(/^export\s+(?=(?:async\s+)?(?:const|let|var|function\s*\*?|class))/gm,"");
  vm.runInContext(source,context);
  // The start screen reads artState() and offers retryArt(); expose them the
  // way the canvas home shows them (start button / status line / retry button).
  const run=code=>vm.runInContext(code,context);
  const elements={
    startButton:{get disabled(){return run("artState()").startDisabled;}},
    artStatus:{get hidden(){return run("artState()").statusHidden;},get textContent(){return run("artState()").statusText;}},
    retryArtButton:{get hidden(){return run("artState()").retryHidden;},events:{click:()=>run("retryArt()")}},
  };
  return {requests,timers,elements,draws,run};
}

// A missing atlas must never silently leave a whole run using line-art turrets.
const app=boot();
assert.equal(app.elements.startButton.disabled,true);
assert.equal(app.requests.length,12);
const [hover,atlas,ground,vfx,combatVfx]=app.requests;
hover.onload();ground.onload();vfx.onload();combatVfx.onload();
assert.equal(app.elements.startButton.disabled,true,"wait for the train/turret atlas too");
atlas.onerror();
const retry1=app.requests.at(-1);
assert.match(retry1.url,/sci-fi-atlas-v1-mobile.webp\?v=.*&retry=/,"bypass a stale failed cache entry");
retry1.onerror();app.requests.at(-1).onerror();
assert.equal(app.requests.length,14,"automatic retries are bounded");
assert.equal(app.elements.retryArtButton.hidden,false);
assert.match(app.elements.artStatus.textContent,/列车与防御塔/);
app.elements.retryArtButton.events.click();
const recovered=app.requests.at(-1);recovered.onload();
assert.equal(app.elements.startButton.disabled,false);
assert.equal(app.elements.artStatus.hidden,true);
assert.equal(app.elements.retryArtButton.hidden,true);
assert.equal(app.timers.size,7,"optional skill art may still be decoding");
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
stalled.requests[1].onload();stalled.requests[2].onload();stalled.requests[3].onload();stalled.requests[4].onload();stalled.requests[5].onload();
assert.equal(stalled.elements.startButton.disabled,false);
assert.equal(stalled.timers.size,6);
// Optional skins never block a basic run, but failures remain visible and retryable.
const optional=boot();optional.requests.slice(0,5).forEach(i=>i.onload());
optional.requests[5].onerror();optional.requests.at(-1).onerror();optional.requests.at(-1).onerror();
assert.equal(optional.elements.startButton.disabled,false);
assert.equal(optional.elements.retryArtButton.hidden,false);
assert.match(optional.elements.artStatus.textContent,/北辰羁绊与突破攻击/);
optional.elements.retryArtButton.events.click();optional.requests.at(-1).onload();
assert.equal(optional.elements.retryArtButton.hidden,true);
console.log("Art loading: gating, cache recovery, retry limits, timeout and sprite restoration passed.");
