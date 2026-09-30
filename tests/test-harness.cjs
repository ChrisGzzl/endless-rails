"use strict";
// Headless game harness. The game is a canvas-only page: index.html hands a
// canvas to the host and loads one ES module entry. This harness does the
// same with a fake canvas (a no-op 2D context with deterministic text
// metrics) inside a vm sandbox, evaluating the real module graph parsed from
// index.html. Tests drive the interface through the host bridge exactly as
// input would: taps land on laid-out nodes by key, pointers and keys go
// through the same handlers the page registers.
module.exports = function createGame({ context, window: windowOverrides = {}, storage, viewport = { w: 390, h: 844 }, fine = false, platform = {}, sources = {} } = {}) {

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const projectRoot = path.resolve(__dirname, "..");

// -- fake canvas -------------------------------------------------------------------------

const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯]/;
function fontSize(font) { const m = /(\d+(?:\.\d+)?)px/.exec(font || ""); return m ? parseFloat(m[1]) : 10; }
function createContext(canvas, custom) {
  const target = {
    canvas, font: "10px sans-serif", filter: "none", globalAlpha: 1, letterSpacing: "0px",
    measureText(text) {
      const size = fontSize(this.font);
      let width = 0;
      for (const ch of String(text)) width += CJK.test(ch) ? size : size * 0.55;
      return { width, fontBoundingBoxAscent: Math.round(size * 0.8), fontBoundingBoxDescent: Math.round(size * 0.2), actualBoundingBoxAscent: size * 0.7, actualBoundingBoxDescent: size * 0.1 };
    },
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return {}; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; },
  };
  return custom || new Proxy(target, { get: (t, p) => (p in t ? t[p] : () => {}), set: (t, p, v) => { t[p] = v; return true; } });
}
function createCanvas(width = 300, height = 150, custom = null) {
  const listeners = {};
  const canvas = {
    width, height, style: {},
    getContext() { return this._ctx || (this._ctx = createContext(canvas, custom)); },
    getBoundingClientRect() { return { left: 0, top: 0, x: 0, y: 0, width: viewport.w, height: viewport.h }; },
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return false; },
    listeners,
  };
  return canvas;
}

// -- sandbox -----------------------------------------------------------------------------

const screenCanvas = createCanvas(viewport.w, viewport.h);
let battlefieldPending = true;
let scheduledFrames = 0;
const windowEvents = {};
const sandbox = {
  localStorage: storage,
  performance: { now: () => 0 },
  requestAnimationFrame(callback) { sandbox.nextFrame = callback; scheduledFrames++; },
  console,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  innerWidth: viewport.w, innerHeight: viewport.h, devicePixelRatio: 1,
  addEventListener(type, handler) { (windowEvents[type] ||= []).push(handler); },
  __endlessRailsCanvas: screenCanvas,
  __endlessRailsPlatform: {
    // the first offscreen canvas is the battlefield surface: a test's custom
    // context (drawing assertions) belongs there, the interface keeps the fake
    createCanvas: (w, h) => { const c = createCanvas(w, h, battlefieldPending ? context : null); battlefieldPending = false; return c; },
    createImage: () => ({}),
    viewport: () => ({ w: viewport.w, h: viewport.h, dpr: 1, safe: { top: 0, right: 0, bottom: 0, left: 0 } }),
    pointerFine: fine, hover: fine, overlayScrollbars: true,
    ...platform,
  },
  ...windowOverrides,
};
vm.createContext(sandbox);
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

// The runtime is a native ES module graph rooted at the single module entry in
// index.html. Parse that graph from the real sources, validate every named
// import against the exporter's export list, evaluate in depth-first post-order
// (the browser's own order), and execute each module's source with import /
// export syntax stripped. What the tests exercise is therefore the real page's
// module set, graph order and cross-module wiring, not a hand-maintained list.
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const entries = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map(match => match[1].split("?")[0]);
assert.equal(entries.length, 1, "index.html must declare exactly one module entry");
const entryFile = path.resolve(projectRoot, entries[0]);

function parseModule(file) {
  const src = fs.readFileSync(file, "utf8");
  const imports = [];
  for (const m of src.matchAll(/^import\s*["']([^"']+)["']\s*;.*$/gm)) imports.push({ specifier: m[1], names: [] });
  for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']\s*;.*$/gm)) {
    const names = m[1].split(",").map(s => s.trim()).filter(Boolean).map(s => {
      const [name, alias] = s.split(/\s+as\s+/);
      return { name: name.trim(), alias: (alias || name).trim() };
    });
    imports.push({ specifier: m[2], names });
  }
  const exports = new Set();
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}\s*;.*$/gm)) {
    for (const s of m[1].split(",")) { const name = s.split(/\s+as\s+/)[0].trim(); if (name) exports.add(name); }
  }
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) exports.add(m[1]);
  return { file, src, imports, exports };
}

const modules = new Map();
const order = [];
function visit(file) {
  if (modules.has(file)) return;
  const mod = parseModule(file);
  modules.set(file, mod);
  for (const decl of mod.imports) {
    assert.ok(decl.specifier.startsWith("."), "only relative imports are supported: " + file);
    const target = path.resolve(path.dirname(file), decl.specifier);
    visit(target);
    for (const { name, alias } of decl.names) {
      assert.equal(alias, name, `${path.relative(projectRoot, file)} must not alias imports (the shared-scope bundle cannot rename)`);
      assert.ok(modules.get(target).exports.has(name), `${path.relative(projectRoot, file)} imports "${name}" but ${path.relative(projectRoot, target)} does not export it`);
    }
  }
  order.push(mod);
}
visit(entryFile);
for (const rel of ["src/main.js", "src/app/canvas-host.js", "src/app/engine.js", "src/app/ui-home.js", "src/app/ui-run.js", "src/app/ui-dialogs.js", "src/app/platform.js", "src/view/ui/kit.js", "src/view/screens/sheet.js", "src/meta/longterm.js", "src/core/audio.js", "src/core/cloud-sync.js", "src/core/cloud-config.js"]) {
  assert.ok(modules.has(path.resolve(projectRoot, rel)), "module graph must include " + rel);
}

// `sources` replaces a module's text by project-relative path, the way the
// test-save dev server hands out an enabled copy of src/core/cloud-config.js.
for (const mod of order) {
  const override = sources[path.relative(projectRoot, mod.file).replace(/\\/g, "/")];
  const stripped = (override ?? mod.src)
    .replace(/^import\s*["'][^"']+["']\s*;.*$/gm, "")
    .replace(/^import\s*\{[^}]*\}\s*from\s*["'][^"']+["']\s*;.*$/gm, "")
    .replace(/^export\s*\{[^}]*\}\s*;.*$/gm, "")
    .replace(/^export\s+(?=(?:async\s+)?(?:const|let|var|function\s*\*?|class))/gm, "");
  vm.runInContext(stripped, sandbox, { filename: path.relative(projectRoot, mod.file) });
}

const run = (code, timeout = 3000) => vm.runInContext(code, sandbox, { timeout });
const host = () => sandbox.EndlessRailsCanvasHost;

// -- interface helpers -----------------------------------------------------------------------

const ui = {
  host,
  render() { host().render(); },
  node(key) { host().render(); return host().node(key); },
  // Laid out, displayed and not visibility-hidden (like an unhidden element).
  visible(key) { const n = ui.node(key); return !!n && n.cs.display !== "none" && n.cs.visibility !== "hidden" && n.w > 0 && n.h > 0; },
  text(key) { host().render(); return host().text(key); },
  disabled(key) { const n = ui.node(key); assert.ok(n, "node " + key + " must be on screen"); return !!n.disabled; },
  // Taps like a finger: through hit-testing at the node's centre.
  tap(key, pointerId = 90) {
    let n = ui.node(key);
    assert.ok(n, "node " + key + " must be on screen to tap");
    const centre = n => [(n.boxX ?? n.absX) + n.w / 2, (n.boxY ?? n.absY) + n.h / 2];
    const reachable = n => host().kit.hitPath(...centre(n)).includes(n);
    if (!reachable(n)) {
      // scroll it into view first, like a player would
      for (let p = n.parent; p; p = p.parent) if (p.scrollH != null && p.scrollMax > 0) { host().kit.scrollIntoView(p.key, key); break; }
      n = ui.node(key);
    }
    assert.ok(reachable(n), "node " + key + " must be reachable by a tap");
    const [x, y] = centre(n);
    const ev = { pointerId, clientX: x, clientY: y, pointerType: "touch", button: 0, preventDefault() {} };
    host().pointerDown(ev); host().pointerUp(ev);
    host().render();
  },
  pointer(type, pointerId, clientX, clientY) {
    const ev = { pointerId, clientX, clientY, pointerType: "touch", button: 0, preventDefault() {} };
    const h = host();
    if (type === "down") h.pointerDown(ev); else if (type === "move") h.pointerMove(ev); else if (type === "up") h.pointerUp(ev); else h.pointerCancel(ev);
  },
  key(type, code, extra = {}) {
    host().render();
    for (const handler of windowEvents[type] || []) handler({ code, repeat: false, shiftKey: false, preventDefault() {}, ...extra });
  },
  keys(prefix) { host().render(); return host().boxes().map(b => b.key).filter(k => typeof k === "string" && k.startsWith(prefix)); },
  layers() { host().render(); return host().layers(); },
};

// Resize the fake viewport and deliver the resize to the page like a browser would.
function setViewport(w, h) {
  viewport.w = w; viewport.h = h; sandbox.innerWidth = w; sandbox.innerHeight = h;
  for (const handler of windowEvents.resize || []) handler({});
  host().render();
}

// Plain data out of the sandbox (vm objects fail deepStrictEqual on prototypes).
const json = code => JSON.parse(run(`JSON.stringify(${code})`));

return { sandbox, windowEvents, canvas: screenCanvas, createCanvas, ui, setViewport, get scheduledFrames() { return scheduledFrames; }, run, json };
};
