"use strict";
// Mini-game smoke test: build the single-file bundle from src/main.js, run the
// real minigame/game.js adapter against a fake `wx` runtime (no document, no
// Image, no window), and play through menu -> contract -> route -> combat with
// touches delivered exactly as wx.onTouch* would deliver them.
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "er-minigame-")), "game-bundle.js");
execFileSync(process.execPath, [path.join(root, "tools/build-minigame.cjs"), bundle]);

const context2d = () => new Proxy({
  font: "10px sans-serif",
  measureText(t) { const s = parseFloat(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] || 10); return { width: String(t).length * s * 0.6, fontBoundingBoxAscent: s * 0.8, fontBoundingBoxDescent: s * 0.2, actualBoundingBoxAscent: s * 0.7, actualBoundingBoxDescent: s * 0.1 }; },
  getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
  createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
  createPattern() { return {}; }, getImageData() { return { data: new Uint8ClampedArray(4) }; },
}, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
const canvases = [];
const touch = {};
let frame = null;
const wx = {
  getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 47, left: 0, right: 390, bottom: 810 } }),
  createCanvas: () => { const c = { width: 300, height: 150, getContext() { return this._c || (this._c = context2d()); } }; canvases.push(c); return c; },
  createImage: () => {
    const image = { width: 64, height: 64, naturalWidth: 64, naturalHeight: 64, complete: false };
    Object.defineProperty(image, "src", { set(v) { this._src = v; setTimeout(() => { image.complete = true; image.onload?.(); }, 0); }, get() { return this._src; } });
    return image;
  },
  onTouchStart: f => { touch.start = f; }, onTouchMove: f => { touch.move = f; }, onTouchEnd: f => { touch.end = f; }, onTouchCancel: f => { touch.cancel = f; },
  onHide: f => { touch.hide = f; }, onWindowResize() {}, showModal() {},
};
const G = { wx, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: f => { frame = f; }, performance: { now: () => 0 } };
G.GameGlobal = G;
vm.createContext(G);
const load = file => {
  const module = { exports: {} };
  const fn = vm.runInContext("(function (module, exports, require) {" + fs.readFileSync(file, "utf8") + "\n})", G, { filename: file });
  fn(module, module.exports, spec => load(spec === "./game-bundle.js" ? bundle : path.join(root, "minigame", spec)));
  return module.exports;
};

(async () => {
  load(path.join(root, "minigame/game.js"));
  assert.equal(G.document, undefined, "the mini-game runtime has no document");
  await new Promise(resolve => setTimeout(resolve, 50)); // art images "load"
  const host = G.EndlessRailsCanvasHost;
  assert.ok(host, "the bundle publishes the canvas host");
  assert.equal(canvases[0].width, 390 * 3, "the screen canvas is backed at the device pixel ratio");
  assert.equal(canvases[0].height, 844 * 3);
  assert.equal(host.state.mode, "menu");
  const tap = key => {
    host.render();
    let n = host.node(key);
    assert.ok(n, key + " is on screen");
    // Like a player, scroll the map column first when the chip is clipped.
    const centre = node => [(node.boxX ?? node.absX) + node.w / 2, (node.boxY ?? node.absY) + node.h / 2];
    if (!host.kit.hitPath(...centre(n)).includes(n)) {
      for (let p = n.parent; p; p = p.parent) if (p.scrollH != null && p.scrollMax > 0) { host.kit.scrollIntoView(p.key, key); break; }
      host.render();
      n = host.node(key);
    }
    const t = { identifier: 3, clientX: n.boxX + n.w / 2, clientY: n.boxY + n.h / 2 };
    touch.start({ touches: [t], changedTouches: [t] }); touch.end({ touches: [], changedTouches: [t] });
    host.render();
  };
  for (let i = 1; i < 5; i++) frame(i * 16);
  tap("startButton");
  assert.equal(!!host.state.activeExpedition, true, "the mini-game path persists an expedition");
  assert.equal(host.state.activeExpedition.visitedIds.length, 1, "departure clears the start node");
  const start = host.state.activeExpedition.nodes.find(n => n.layer === 1);
  const reachable = host.state.activeExpedition.nodes.filter(n => start.nextIds.includes(n.id)).map(n => n.id);
  tap("mapNode-" + reachable[0]);
  tap("mapStartButton");
  assert.equal(host.state.mode, "combat");
  for (let i = 5; i < 90; i++) frame(i * 16);
  assert.ok(host.state.routeDistance < host.state.routeDistanceTotal, "combat advances on the mini-game path");
  touch.hide();
  assert.equal(host.state.paused, true, "going to the background pauses the run");
  console.log("mini-game bundle smoke test passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
