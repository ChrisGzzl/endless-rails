"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const game = require("./test-harness.cjs")();
const { sandbox, ui, run } = game;
const html = fs.readFileSync(__dirname + "/../index.html", "utf8");

// The page is a single canvas: no interface markup may come back.
assert.match(html, /<canvas id="gameCanvas"/, "index.html hosts the game canvas");
assert.doesNotMatch(html, /<(button|section|main|header|footer|nav|select|input)\b/, "no DOM interface elements in index.html");
assert.doesNotMatch(html, /stylesheet/, "no interface stylesheets are loaded");

assert.equal(game.scheduledFrames, 1, "startup must schedule its first animation frame");
assert.doesNotThrow(() => {
  vm.runInContext("nextFrame(16)", sandbox, { timeout: 1000 });
}, "the first menu frame must finish without blocking the page");
assert.equal(game.scheduledFrames, 2, "the menu frame must schedule the next frame");
assert.ok(ui.visible("startScreen"), "the expedition base opens at boot");
assert.equal(ui.keys("region-").filter(k => /^region-\w+$/.test(k)).length, 4, "four regions are listed");

let clickError = null;
try {
  ui.tap("startButton");
} catch (error) {
  clickError = error;
}
assert.equal(clickError, null, "tapping start must not fail");
assert.equal(ui.visible("startScreen"), false, "starting must close the expedition base");
assert.ok(ui.visible("mapScreen"), "departure opens the persistent map directly (no L1 contract)");
assert.equal(run("state.activeExpedition.visitedIds.length"), 1, "the start node is cleared on departure");
const firstNode = game.json("expedition.reachableNext(state.activeExpedition).map(n=>n.id)")[0];
ui.tap("mapNode-" + firstNode);
assert.ok(ui.visible("mapDetail"), "tapping a reachable node opens its detail card");
ui.tap("mapStartButton");
assert.equal(ui.visible("mapScreen"), false, "starting a node closes the map");
assert.equal(run("state.mode"), "combat", "confirming a node enters combat");

assert.doesNotThrow(() => {
  vm.runInContext("for (let i = 0; i < 60; i++) nextFrame(32 + i * 16);", sandbox, { timeout: 3000 });
}, "the combat loop must remain responsive after route selection");
assert.equal(game.scheduledFrames, 62, "each combat frame must schedule the next frame");
assert.ok(run("state.routeDistance < state.routeDistanceTotal"), "combat frames must advance the route");

// Floating joystick: presses on the battlefield steer, they never teleport.
run("state.enemies=[]; state.shots=[]; state.spawnClock=Infinity; state.fireClock=Infinity;");
const joy = () => run("runCtl.joystick");
const dronePosition = () => run("JSON.stringify({x:state.drone.x,y:state.drone.y})");
const initialPosition = dronePosition();
ui.pointer("down", 1, 70, 550);
assert.equal(dronePosition(), initialPosition, "touch-down does not teleport the drone");
assert.equal(joy().visible, true, "the floating joystick appears under the finger");
assert.equal(joy().center.x, 70, "stick origin is the touch point");
ui.pointer("move", 1, 170, 550);
assert.equal(dronePosition(), initialPosition, "moving the finger only changes input, not position");
run("update(.1)");
assert.equal(run("state.drone.x"), JSON.parse(initialPosition).x + 18, "movement is capped by speed times dt");
ui.pointer("move", 2, -100, 550);
assert.equal(run("state.moveInput.x"), 1, "second touch cannot hijack movement");
run("update(1)");
assert.equal(run("state.drone.x"), run("droneBounds().right"), "drone can reach the screen edge beyond the old train radius");
ui.pointer("up", 1, 170, 550);
assert.equal(joy().visible, false, "release hides the floating joystick");
const stoppedPosition = dronePosition();
run("update(.1)");
assert.equal(dronePosition(), stoppedPosition, "release stops immediately without target chasing");
ui.pointer("down", 3, 280, 300);
assert.equal(joy().center.x, 280, "next gesture gets a new origin");
ui.pointer("move", 3, 280, 200);
run("update(2)");
assert.equal(run("state.drone.y"), run("droneBounds().top"), "drone can reach the top of the battlefield");
ui.pointer("cancel", 3, 280, 200);
assert.equal(joy().pointerId, null);
assert.equal(run("state.moveInput.y"), 0);
ui.pointer("down", 4, 100, 400);
ui.pointer("move", 4, 150, 400);
ui.pointer("up", 4, 150, 400);
ui.pointer("down", 4, 100, 400);
ui.pointer("move", 4, 150, 400);
ui.tap("pauseButton", 11);
assert.equal(joy().pointerId, null, "pause releases movement input");
assert.equal(ui.visible("pauseScreen"), true, "pausing opens the fleet terminal");
assert.equal(run("runCtl.hudModel().pulseDisabled"), true, "the pulse is disabled while paused");
const pausedPosition = dronePosition();
run("update(.1)");
assert.equal(dronePosition(), pausedPosition);
ui.tap("resumeButton", 12);
ui.key("keydown", "ArrowLeft");
assert.equal(dronePosition(), pausedPosition, "keyboard input also cannot teleport");
run("update(.1)");
assert.equal(run("state.drone.x"), JSON.parse(pausedPosition).x - 18);
ui.key("keyup", "ArrowLeft");
const keyStopped = dronePosition();
run("state.train.x += 5; update(.1)");
assert.equal(dronePosition(), keyStopped, "drone is no longer anchored to the train");
ui.pointer("down", 5, 70, 610);
ui.pointer("move", 5, 170, 610);
for (const handler of game.windowEvents.blur) handler();
assert.equal(run("state.moveInput.x"), 0, "blur clears velocity input");
assert.equal(joy().visible, false);
assert.equal(run("state.paused"), true, "leaving the window pauses combat");

// HUD instruments and flows exist as canvas nodes.
ui.tap("resumeButton", 13);
for (const key of ["routeProgressLabel", "routeProgressFill", "experienceProgressLabel", "experienceProgressFill", "pauseButton", "pulseButton", "commandRing"]) {
  assert.ok(ui.node(key), `${key} must exist in the HUD`);
}

console.log("startup test passed");
