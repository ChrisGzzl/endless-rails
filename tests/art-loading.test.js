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
    .replace(/^import\s*\{[^}]*\}\s*from\s*["'][^"']+[\"']\s*;.*$/gm,"")
    .replace(/^import\s*[\"'][^\"']+[\"']\s*;.*$/gm,"")
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
// Cold start loads only the boot sheets (~1MB); the bond atlas and Lv.10
// breakthrough skins wait for their first in-run use.
assert.equal(app.requests.length,5);
assert.ok(app.requests.every(image=>!/attacks-v3|lv10/.test(image.url)),"late-game sheets stay lazy");
const [hover,atlas,ground,vfx,combatVfx]=app.requests;
hover.onload();ground.onload();vfx.onload();combatVfx.onload();
assert.equal(app.elements.startButton.disabled,true,"wait for the train/turret atlas too");
atlas.onerror();
const retry1=app.requests.at(-1);
assert.match(retry1.url,/sci-fi-atlas-v1-mobile.webp\?v=.*&retry=/,"bypass a stale failed cache entry");
retry1.onerror();app.requests.at(-1).onerror();
assert.equal(app.requests.length,7,"automatic retries are bounded");
assert.equal(app.elements.retryArtButton.hidden,false);
assert.match(app.elements.artStatus.textContent,/列车与防御塔/);
app.elements.retryArtButton.events.click();
const recovered=app.requests.at(-1);recovered.onload();
assert.equal(app.elements.startButton.disabled,false);
assert.equal(app.elements.artStatus.hidden,true);
assert.equal(app.elements.retryArtButton.hidden,true);
assert.equal(app.timers.size,0,"settled sheets leave no decode timers behind");
assert.equal(app.run("paintSprite(0,0,0,80,80)"),true);
assert.equal(app.run("paintSprite(11,0,0,37,42)"),true);
assert.equal(app.draws[0][0],hover,"command drone uses the designed hover sheet");
assert.equal(app.draws[1][0],recovered,"station turret uses the restored atlas");
assert.deepEqual(app.draws[1].slice(1,5),[979,628,237,297]);

// A request that hangs, or a late callback from it, must not block recovery.
const stalled=boot(),oldLoad=stalled.requests[0].onload;
const timeout=stalled.timers.values().next().value;timeout();
const replacement=stalled.requests.at(-1);replacement.onload();oldLoad();
assert.equal(stalled.run("gameArt.hover"),replacement);
stalled.requests[1].onload();stalled.requests[2].onload();stalled.requests[3].onload();stalled.requests[4].onload();
assert.equal(stalled.elements.startButton.disabled,false);
assert.equal(stalled.timers.size,0);

// Lazy sheets: departure starts the bond atlas; a Lv.10 paint starts the
// breakthrough skins and keeps the base sheet until they decode.
const lazy=boot();
lazy.requests.slice(0,5).forEach(image=>image.onload());
assert.equal(lazy.requests.length,5,"nothing else loads while the game idles in the menu");
lazy.run("ensureCombatArt()");
assert.equal(lazy.requests.length,6);
assert.match(lazy.requests.at(-1).url,/attacks-v3-mobile/);
assert.equal(lazy.run("paintAttack(2,0,0,42)"),false,"procedural fallback until the bond sheet decodes");
lazy.requests.at(-1).onload();
assert.equal(lazy.run("paintAttack(2,0,0,42)"),true);
assert.equal(lazy.run("paintSprite(2,0,0,80,80,0,0,false,true)"),true,"Lv.10 skin falls back to the base sheet");
assert.equal(lazy.draws.at(-1)[0],lazy.requests[0],"the fallback really painted the hover sheet");
const skin=lazy.requests.at(-1);
assert.match(skin.url,/hover-lv10-v3-mobile/);
skin.onload();
assert.equal(lazy.run("paintSprite(2,0,0,80,80,0,0,false,true)"),true);
assert.equal(lazy.draws.at(-1)[0],skin,"the decoded breakthrough sheet takes over");
lazy.run("paintWeaponVfx(1,1.5,0,0,30,1,0,true,true)");
assert.match(lazy.requests.at(-1).url,/weapon-lv10-v3-mobile/,"evolved VFX loads on its first breakthrough paint");
// A lazy sheet that exhausts its retries goes quiet instead of hammering
// the network from the paint loop, and recovers on a later ensure.
lazy.requests.at(-1).onerror();lazy.requests.at(-1).onerror();lazy.requests.at(-1).onerror();
const quiet=lazy.requests.length;
lazy.run("paintWeaponVfx(1,1.5,0,0,30,1,0,true,true)");
assert.equal(lazy.requests.length,quiet,"a fresh failed sheet is not retried from paint");
console.log("Art loading: boot gating, lazy run sheets, breakthrough fallback and bounded retries passed.");
