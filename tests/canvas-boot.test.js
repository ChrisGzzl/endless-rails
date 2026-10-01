"use strict";
// The canvas-only page (index.html -> main.js -> canvas-host.js) must run the
// full expedition flow with nothing but a canvas element: menu, contract,
// route, combat, level-up, pulse - driven through taps on laid-out interface
// nodes, exactly where a finger would land. This is the acceptance line for
// the web page and the mini-game builds alike.
const assert = require("node:assert/strict");
const createGame = require("./test-harness.cjs");

const game = createGame();
const { ui, run } = game;
const host = () => ui.host();

assert.ok(host(), "canvas boot must publish the host bridge");
assert.equal(host().state.mode, "menu", "canvas boot starts at the menu");
assert.ok(game.scheduledFrames >= 1, "canvas boot must schedule its first frame");

ui.tap("startButton");
assert.ok(ui.visible("mapScreen"), "departure opens the expedition map directly");
assert.equal(host().state.activeExpedition.contract, null, "alpha.1 expeditions run contract-less");

const firstNode = game.json("expedition.reachableNext(state.activeExpedition).map(n=>n.id)")[0];
ui.tap("mapNode-" + firstNode);
assert.ok(ui.visible("mapDetail"), "tapping a map node opens its detail card");
ui.tap("mapStartButton");
assert.equal(host().state.mode, "combat", "confirming a map node must enter combat");

run("for (let i = 0; i < 90; i++) nextFrame(1000 + i * 16);");
assert.ok(host().state.routeDistance < host().state.routeDistanceTotal, "combat frames must advance the route on the canvas path");
// Early gun volleys can clear both opening walkers inside the 2.3s spawn
// interval, so count kills too: either proves the canvas path spawns enemies.
assert.ok(host().state.enemies.length > 0 || host().state.kills > 0, "the canvas path must spawn enemies");

// Early kills can bank a level-up and pause the fight on the choice screen;
// the canvas path must present it and accept a tap like every other screen.
if (host().state.mode === "levelup") {
  ui.tap("levelCard-0");
  assert.equal(host().state.mode, "combat", "choosing a canvas level-up returns to combat");
}

run("state.pulseClock = 0; state.pulseCooldown = 0;");
ui.tap("pulseButton");
assert.ok(host().state.pulseClock > 0, "tapping the pulse button must fire the EMP");

console.log("Canvas-only boot flow passed.");
