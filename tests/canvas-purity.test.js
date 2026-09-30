"use strict";
// Purity gate: the game is drawn entirely on one canvas. The module graph must
// evaluate and run the whole flow with NO document in the sandbox at all (any
// direct document access becomes a ReferenceError), and no source module may
// build DOM nodes - platform.js alone may feature-detect page APIs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const createGame = require("./test-harness.cjs");

const game = createGame();
assert.equal(game.run("typeof document"), "undefined", "the harness has no document");
const { ui } = game;
const host = ui.host();
assert.ok(host, "the canvas graph must boot without a document");
assert.equal(host.state.mode, "menu", "a documentless boot still reaches the menu");

ui.tap("startButton");
assert.equal(host.state.mode, "contractChoice", "flow logic runs without any DOM panels");
ui.tap("contractList-0");
ui.tap("eventList-0");
assert.equal(host.state.mode, "combat", "combat is reachable entirely without the document");
game.run("for (let i = 0; i < 60; i++) nextFrame(2000 + i * 16);");
assert.ok(host.state.routeDistance < host.state.routeDistanceTotal, "simulation advances without any DOM");

const root = path.join(__dirname, "..", "src");
const files = [];
const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".js")) files.push(p); } };
walk(root);
for (const file of files) {
  const code = fs.readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
  const rel = path.relative(root, file).replace(/\\/g, "/");
  // app/platform.js is the one page adapter (feature detection, offscreen canvases)
  if (rel === "app/platform.js") continue;
  assert.doesNotMatch(code, /createElement|querySelector|getElementById|innerHTML|classList|\.dataset\b/, rel + " must not build or query DOM nodes");
  assert.doesNotMatch(code, /\bdocument\s*\./, rel + " must not touch the document");
}
assert.ok(!fs.existsSync(path.join(__dirname, "..", "css")), "no stylesheet directory remains: the interface is painted on the canvas");

console.log("Canvas graph DOM purity passed.");
