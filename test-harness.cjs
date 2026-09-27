"use strict";
module.exports = function createGame({context,window:windowOverrides={},storage} = {}) {

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ids = [
  "gameCanvas", "stationValue", "scrapValue", "healthText", "healthFill", "timerValue", "phaseLabel",
  "droneLevel", "pulseButton", "pulseCooldown", "objectiveText", "comboText", "toast", "touchHint",
  "startScreen", "stationScreen", "stationTitle", "upgradeList", "continueButton", "resultScreen",
  "bossWrap", "bossText", "bossFill", "trainLengthLabel", "miniTrain", "startButton", "restartButton",
  "routeProgressLabel", "routeProgressFill", "experienceProgressLabel", "experienceProgressFill", "levelUpScreen", "levelUpList",
  "pauseButton", "commandRing", "eventScreen", "eventList", "contractScreen", "contractList", "rerollButton", "resultBuild", "resultRecord", "joystickBase", "joystickThumb", "moveSpeedValue",
];

function createElement(id) {
  return {
    id,
    hidden: false,
    disabled: false,
    style: {},
    textContent: "",
    get innerHTML() { return this._html || ""; },
    set innerHTML(value) { this._html = value; this.children = []; },
    children: [],
    dataset: {},
    events: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, handler) { this.events[type] = handler; },
    setAttribute(name,value) { this[name]=String(value); },
    getAttribute(name) { return this[name]; },
    focus() { sandbox.document.activeElement=this; },
    querySelectorAll() { return []; },
    querySelector(selector) { return (this.queries ||= {})[selector] ||= createElement(selector); },
    append(...nodes) { this.children.push(...nodes); },
    setPointerCapture(pointerId) { this.capturedPointer = pointerId; },
    hasPointerCapture(pointerId) { return this.capturedPointer === pointerId; },
    releasePointerCapture() { this.capturedPointer = null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 680 }; },
    getContext() {
      if(context)return context;
      return new Proxy({}, { get: (target, property) => {
        if(property in target)return target[property];
        if (property === "createLinearGradient" || property === "createRadialGradient") return () => ({ addColorStop() {} });
        return () => {};
      } });
    },
  };
}

const elements = Object.fromEntries([...fs.readFileSync(__dirname + '/index.html','utf8').matchAll(/id="([^"]+)"/g)].map(match => [match[1], createElement(match[1])]));
Object.assign(elements.gameCanvas, { width: 390, height: 680 });
let scheduledFrames = 0;
const windowEvents = {};
const sandbox = {
  localStorage: storage,
  document: { getElementById: id => elements[id], createElement: tag => createElement(tag) },
  window: { ...windowOverrides, addEventListener(type, handler) { (windowEvents[type] ||= []).push(handler); } },
  performance: { now: () => 0 },
  requestAnimationFrame(callback) {
    sandbox.nextFrame = callback;
    scheduledFrames++;
  },
  console,
};

vm.createContext(sandbox);

// The runtime is a native ES module graph rooted at the single module entry in
// index.html. Parse that graph from the real sources, validate every named
// import against the exporter's export list, evaluate in depth-first post-order
// (the browser's own order), and execute each module's source with import /
// export syntax stripped. What the tests exercise is therefore the real page's
// module set, graph order and cross-module wiring, not a hand-maintained list.
const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const entries = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map(match => match[1].split("?")[0]);
assert.equal(entries.length, 1, "index.html must declare exactly one module entry");
const entryFile = path.resolve(__dirname, entries[0]);

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
function visit(file, from) {
  if (modules.has(file)) return;
  const mod = parseModule(file);
  modules.set(file, mod);
  for (const decl of mod.imports) {
    assert.ok(decl.specifier.startsWith("."), "only relative imports are supported: " + file);
    const target = path.resolve(path.dirname(file), decl.specifier);
    visit(target, file);
    if (decl.names.length) {
      const targetExports = modules.get(target).exports;
      for (const { name } of decl.names) {
        assert.ok(targetExports.has(name), `${path.relative(__dirname, file)} imports "${name}" but ${path.relative(__dirname, target)} does not export it`);
      }
    }
  }
  order.push(mod);
}
visit(entryFile, null);
const expected = ["src/main.js", "src/app/game.js", "src/view/renderer.js", "src/app/meta-ui.js", "src/app/armory.js", "src/app/display.js", "src/app/settings.js", "src/app/cloud-ui.js", "src/meta/longterm.js", "src/core/audio.js", "src/core/balance.js", "src/core/motion.js", "src/core/progression.js", "src/core/combat-effects.js", "src/core/control.js", "src/core/route-events.js", "src/core/run-record.js", "src/core/cloud-sync.js", "src/core/cloud-config.js"];
for (const rel of expected) assert.ok(modules.has(path.resolve(__dirname, rel)), "module graph must include " + rel);

for (const mod of order) {
  const stripped = mod.src
    .replace(/^import\s*["'][^"']+["']\s*;.*$/gm, "")
    .replace(/^import\s*\{[^}]*\}\s*from\s*["'][^"']+["']\s*;.*$/gm, "")
    .replace(/^export\s*\{[^}]*\}\s*;.*$/gm, "")
    .replace(/^export\s+(?=(?:async\s+)?(?:const|let|var|function\s*\*?|class))/gm, "");
  vm.runInContext(stripped, sandbox, { filename: path.relative(__dirname, mod.file) });
}


return { sandbox, elements, windowEvents, get scheduledFrames() { return scheduledFrames; }, run: (code, timeout = 3000) => vm.runInContext(code, sandbox, { timeout }) };
};
