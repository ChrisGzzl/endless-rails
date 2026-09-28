"use strict";
// Purity gate for the mini-game builds: the canvas module graph must evaluate
// and run a combat frame with NO document in the sandbox at all. Any direct
// document access becomes a ReferenceError and fails this test, so a future
// DOM leak in shared modules cannot slip past the suite.
const assert = require("node:assert/strict");
const createGame = require("./test-harness.cjs");

const game = createGame({ entry: "canvas.html", omitDocument: true });
const host = game.run("window.EndlessRailsCanvasHost");

assert.ok(host, "the canvas graph must boot without a document");
assert.equal(host.state.mode, "menu", "a documentless boot still reaches the menu");

host.handleRegionAction("start");
assert.equal(host.state.mode, "contractChoice", "flow logic runs without the DOM panels");
host.handleRegionAction(host.regions.find(r => r.action && r.action.contract).action);
host.handleRegionAction(host.regions.find(r => r.action && r.action.route).action);
assert.equal(host.state.mode, "combat", "combat is reachable entirely without the document");

game.run("for (let i = 0; i < 60; i++) nextFrame(2000 + i * 16);");
assert.ok(host.state.routeDistance < host.state.routeDistanceTotal, "simulation advances without any DOM");

console.log("Canvas graph DOM purity passed.");
