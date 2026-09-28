"use strict";
// Builds the mini-game bundle and executes it inside a simulated mini-game
// runtime (GameGlobal + wx + canvas, no document, no window, no Image).
// Guards the whole platform path: if the canvas module graph ever grows a
// browser-only dependency or the packer drops a module, this test fails.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const bundlePath = path.join(projectRoot, "minigame", "game-bundle.js");

// 1. Build fresh, exactly like the release step does.
execFileSync(process.execPath, [path.join(projectRoot, "tools", "build-minigame.cjs")], { cwd: projectRoot });
assert.ok(fs.existsSync(bundlePath), "build must emit minigame/game-bundle.js");

// 2. Simulated mini-game runtime: the global has wx + a canvas with a 2d
//    context stub; document/Image/localStorage never exist.
const screenScale = 2;
function fakeContext() {
  return new Proxy({}, {
    get: (target, property) => {
      if (property in target) return target[property];
      if (property === "measureText") return () => ({ width: 0 });
      if (property === "createLinearGradient" || property === "createRadialGradient") return () => ({ addColorStop() {} });
      return () => {};
    },
    set: (target, property, value) => { target[property] = value; return true; },
  });
}
const screenCanvas = { width: 390, height: 680, getContext: () => fakeContext(), addEventListener() {}, focus() {} };
const systemInfo = { pixelRatio: screenScale, windowWidth: 390, windowHeight: 680 };
const runtime = {
  GameGlobal: null,
  // Real mini-game runtimes wrap this file as a CommonJS module: `module` is
  // in scope. Keep it here so the UMD branch decision is tested for real.
  module: { exports: {} },
  wx: {
    getSystemInfoSync: () => systemInfo,
    createCanvas: () => screenCanvas,
    onTouchStart(handler) { runtime.onTouchStart = handler; },
    onTouchMove(handler) { runtime.onTouchMove = handler; },
    onTouchEnd(handler) { runtime.onTouchEnd = handler; },
    onTouchCancel(handler) { runtime.onTouchCancel = handler; },
    onHide(handler) { runtime.onHide = handler; },
  },
  console,
  performance: { now: () => Date.now() },
  requestAnimationFrame(callback) { runtime.nextFrame = callback; },
  setTimeout, clearTimeout,
};
runtime.GameGlobal = runtime;
vm.createContext(runtime);

// 3. Run minigame/game.js against the runtime. Its `require("./game-bundle.js")`
//    maps to loading the generated bundle; everything else runs verbatim.
runtime.__loadBundle = () => { vm.runInContext(fs.readFileSync(bundlePath, "utf8"), runtime, { filename: "minigame/game-bundle.js" }); };
const adapterSource = fs.readFileSync(path.join(projectRoot, "minigame", "game.js"), "utf8")
  .replace(/^const root = .*$/m, "const root = GameGlobal;")
  .replace('require("./game-bundle.js");', "__loadBundle();");
vm.runInContext(`(function(){\n${adapterSource}\n})();`, runtime, { filename: "minigame/game.js" });

const host = runtime.EndlessRailsCanvasHost;
assert.ok(host, "the mini-game runtime must expose EndlessRailsCanvasHost");
assert.equal(host.state.mode, "menu", "mini-game boot reaches the menu");

// 4. Simulated wx touches drive the flow with device-scaled coordinates:
//    pick a region, tap its center expressed in screen pixels, and the
//    adapter's scale conversion must land the hit.
const tapRegion = (id, region) => {
  const logicalX = region.x + region.w / 2, logicalY = region.y + region.h / 2;
  runtime.onTouchStart({ touches: [{ identifier: id, clientX: logicalX * screenScale, clientY: logicalY * screenScale }] });
  runtime.onTouchEnd({ changedTouches: [{ identifier: id, clientX: logicalX * screenScale, clientY: logicalY * screenScale }] });
};
tapRegion(1, host.regions.find(r => r.action === "start"));
assert.equal(host.state.mode, "contractChoice", "a scaled wx touch starts the expedition");
const cards = () => host.regions.filter(r => r.action && typeof r.action === "object");
tapRegion(2, cards()[0]);
tapRegion(3, cards()[0]);
assert.equal(host.state.mode, "combat", "contract and route taps work through wx touch");

for (let i = 0; i < 30; i++) runtime.nextFrame(1000 + i * 16);
assert.ok(host.state.routeDistance < host.state.routeDistanceTotal, "the mini-game frame loop advances the route");

console.log("Mini-game bundle smoke passed.");
