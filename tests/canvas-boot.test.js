"use strict";
// The canvas-only boot path (canvas.html -> canvas-main.js -> canvas-host.js)
// must run the full expedition flow with nothing but a canvas element: menu,
// contract, route, combat, pulse - driven through the same pointer regions a
// finger would hit. This is the acceptance line for the mini-game builds.
const assert = require("node:assert/strict");
const createGame = require("./test-harness.cjs");

const game = createGame({ entry: "canvas.html" });
const { sandbox, run } = game;
const host = () => run("window.EndlessRailsCanvasHost");

assert.ok(host(), "canvas boot must publish the host bridge");
assert.equal(host().state.mode, "menu", "canvas boot starts at the menu");
assert.ok(game.scheduledFrames >= 1, "canvas boot must schedule its first frame");

const tap = actionName => {
  const region = host().regions.find(r => r.action === actionName);
  assert.ok(region, "a tappable region must exist for " + actionName);
  const cx = region.x + region.w / 2, cy = region.y + region.h / 2;
  host().pointerDown({ pointerId: 7, clientX: cx, clientY: cy, pointerType: "touch", button: 0, preventDefault() {} });
  host().pointerUp({ pointerId: 7 });
};

const tapCard = index => {
  const region = host().regions.filter(r => r.action && typeof r.action === "object")[index];
  assert.ok(region, "flow card region " + index + " must exist");
  const cx = region.x + region.w / 2, cy = region.y + region.h / 2;
  host().pointerDown({ pointerId: 8, clientX: cx, clientY: cy, pointerType: "touch", button: 0, preventDefault() {} });
  host().pointerUp({ pointerId: 8 });
};

tap("start");
assert.equal(host().state.mode, "contractChoice", "starting must open the contract choice");
assert.ok(host().state.contractChoices.length >= 3, "contract choice must offer three contracts");

tapCard(0);
assert.equal(host().state.mode, "routeChoice", "choosing a contract must open the route choice");

tapCard(0);
assert.equal(host().state.mode, "combat", "choosing a route must enter combat");
assert.equal(host().state.train.x, 195, "the logical 390-wide surface centers the train");

run("for (let i = 0; i < 90; i++) nextFrame(1000 + i * 16);");
assert.ok(host().state.routeDistance < host().state.routeDistanceTotal, "combat frames must advance the route on the canvas path");
// Early gun volleys can clear both opening walkers inside the 2.3s spawn
// interval, so count kills too: either proves the canvas path spawns enemies.
assert.ok(host().state.enemies.length > 0 || host().state.kills > 0, "the canvas path must spawn enemies");

// Early kills can bank a level-up and pause the fight on the choice screen;
// the canvas path must present it and accept a tap like every other screen.
if (host().state.mode === "levelup") {
  tapCard(0);
  assert.equal(host().state.mode, "combat", "choosing a canvas level-up returns to combat");
}

const pulseRegion = host().regions.find(r => r.action === "pulse");
assert.ok(pulseRegion, "combat must expose a pulse region");
host().pointerDown({ pointerId: 9, clientX: pulseRegion.x + pulseRegion.w / 2, clientY: pulseRegion.y + pulseRegion.h / 2, pointerType: "touch", button: 0, preventDefault() {} });
host().pointerUp({ pointerId: 9 });
assert.ok(host().state.pulseClock > 0, "tapping the pulse region must fire the EMP");

console.log("Canvas-only boot flow passed.");
