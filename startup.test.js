"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
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
    innerHTML: "",
    children: [],
    dataset: {},
    events: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, handler) { this.events[type] = handler; },
    querySelectorAll() { return []; },
    append(...nodes) { this.children.push(...nodes); },
    setPointerCapture(pointerId) { this.capturedPointer = pointerId; },
    hasPointerCapture(pointerId) { return this.capturedPointer === pointerId; },
    releasePointerCapture() { this.capturedPointer = null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 680 }; },
    getContext() {
      return new Proxy({}, { get: (_target, property) => {
        if (property === "createLinearGradient" || property === "createRadialGradient") return () => ({ addColorStop() {} });
        return () => {};
      } });
    },
  };
}

const elements = Object.fromEntries([...fs.readFileSync(__dirname + "/index.html", "utf8").matchAll(/id="([^"]+)"/g)].map(match => [match[1], createElement(match[1])]));
Object.assign(elements.gameCanvas, { width: 390, height: 680 });
let scheduledFrames = 0;
const windowEvents = {};
const sandbox = {
  document: { getElementById: id => elements[id], createElement: tag => createElement(tag) },
  window: { addEventListener(type, handler) { (windowEvents[type] ||= []).push(handler); } },
  performance: { now: () => 0 },
  requestAnimationFrame(callback) {
    sandbox.nextFrame = callback;
    scheduledFrames++;
  },
  console,
};

vm.createContext(sandbox);
const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const scriptNames = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1].split("?")[0]);
assert.deepEqual(scriptNames, ["balance.js", "motion.js", "progression.js", "combat-effects.js", "control.js", "route-events.js", "run-record.js", "renderer.js", "game.js", "armory.js"], "all runtime modules must load in dependency order");
for (const name of scriptNames) vm.runInContext(fs.readFileSync(__dirname + "/" + name, "utf8"), sandbox, { filename: name });

assert.equal(scheduledFrames, 1, "startup must schedule its first animation frame");
assert.doesNotThrow(() => {
  vm.runInContext("nextFrame(16)", sandbox, { timeout: 1000 });
}, "the first menu frame must finish without blocking the page");
assert.equal(scheduledFrames, 2, "the menu frame must schedule the next frame");

let clickError = null;
try {
  elements.startButton.events.click();
} catch (error) {
  clickError = error;
}

assert.equal(clickError, null, "clicking start must not fail");
assert.equal(elements.startScreen.hidden, true, "clicking start must hide the start screen");
assert.equal(elements.phaseLabel.textContent, "远征契约", "clicking start must open the contract choice");
assert.equal(elements.contractScreen.hidden, false, "clicking start must show contract choices before combat");
assert.ok(elements.contractList.children.length >= 3, "contract choice must render three options");
elements.contractList.children[0].events.click();
assert.equal(elements.contractScreen.hidden, true, "choosing a contract must close its overlay");
assert.equal(elements.eventScreen.hidden, false, "choosing a contract must open route choices");
assert.ok(elements.eventList.children.length >= 3, "route choice must render three options");
elements.eventList.children[0].events.click();
assert.equal(elements.eventScreen.hidden, true, "choosing a route must close its overlay");
assert.equal(elements.phaseLabel.textContent, "行驶中", "choosing a route must enter combat");

assert.doesNotThrow(() => {
  vm.runInContext("for (let i = 0; i < 60; i++) nextFrame(32 + i * 16);", sandbox, { timeout: 1000 });
}, "the combat loop must remain responsive after route selection");
assert.equal(scheduledFrames, 62, "each combat frame must schedule the next frame");
assert.ok(vm.runInContext("state.routeDistance < state.routeDistanceTotal", sandbox), "combat frames must advance the route");

vm.runInContext("state.enemies=[]; state.shots=[]; state.spawnClock=Infinity; state.fireClock=Infinity;", sandbox);
const stickEvent = (pointerId, clientX, clientY) => ({ pointerId, clientX, clientY, pointerType: "touch", button: 0, preventDefault() {} });
const dronePosition = () => vm.runInContext("JSON.stringify({x:state.drone.x,y:state.drone.y})", sandbox);
const initialPosition = dronePosition();
elements.gameCanvas.events.pointerdown(stickEvent(1, 70, 550));
assert.equal(dronePosition(), initialPosition, "touch-down does not teleport the drone");
assert.equal(elements.joystickBase.hidden, false);
assert.equal(vm.runInContext("joystickState.center.x", sandbox), 70, "stick origin is the touch point");
elements.gameCanvas.events.pointermove(stickEvent(1, 170, 550));
assert.equal(dronePosition(), initialPosition, "moving the finger only changes input, not position");
vm.runInContext("update(.1)", sandbox);
assert.equal(vm.runInContext("state.drone.x", sandbox), JSON.parse(initialPosition).x + 18, "movement is capped by speed times dt");
elements.gameCanvas.events.pointermove(stickEvent(2, -100, 550));
assert.equal(vm.runInContext("state.moveInput.x", sandbox), 1, "second touch cannot hijack movement");
vm.runInContext("update(1)", sandbox);
assert.equal(vm.runInContext("state.drone.x", sandbox), 366, "drone can reach the screen edge beyond the old train radius");
elements.gameCanvas.events.pointerup(stickEvent(1, 170, 550));
assert.equal(elements.joystickBase.hidden, true, "release hides the floating joystick");
const stoppedPosition = dronePosition();
vm.runInContext("update(.1)", sandbox);
assert.equal(dronePosition(), stoppedPosition, "release stops immediately without target chasing");
elements.gameCanvas.events.pointerdown(stickEvent(3, 280, 300));
assert.equal(vm.runInContext("joystickState.center.x", sandbox), 280, "next gesture gets a new origin");
elements.gameCanvas.events.pointermove(stickEvent(3, 280, 200));
vm.runInContext("update(2)", sandbox);
assert.equal(vm.runInContext("state.drone.y", sandbox), 24, "drone can reach the top of the battlefield");
elements.gameCanvas.events.pointercancel(stickEvent(3, 280, 200));
assert.equal(vm.runInContext("joystickState.pointerId", sandbox), null);
assert.equal(vm.runInContext("state.moveInput.y", sandbox), 0);
elements.gameCanvas.events.pointerdown(stickEvent(4, 100, 100));
elements.gameCanvas.events.pointermove(stickEvent(4, 150, 100));
elements.pauseButton.events.click();
assert.equal(vm.runInContext("joystickState.pointerId", sandbox), null, "pause releases movement input");
assert.equal(elements.pulseButton.disabled, true);
const pausedPosition = dronePosition();
vm.runInContext("update(.1)", sandbox);
assert.equal(dronePosition(), pausedPosition);
elements.pauseButton.events.click();
for (const handler of windowEvents.keydown) handler({ code: "ArrowLeft", preventDefault() {} });
assert.equal(dronePosition(), pausedPosition, "keyboard input also cannot teleport");
vm.runInContext("update(.1)", sandbox);
assert.equal(vm.runInContext("state.drone.x", sandbox), JSON.parse(pausedPosition).x - 18);
for (const handler of windowEvents.keyup) handler({ code: "ArrowLeft", preventDefault() {} });
const keyStopped = dronePosition();
vm.runInContext("state.train.x += 5; update(.1)", sandbox);
assert.equal(dronePosition(), keyStopped, "drone is no longer anchored to the train");
elements.gameCanvas.events.pointerdown(stickEvent(5, 70, 610));
elements.gameCanvas.events.pointermove(stickEvent(5, 170, 610));
for (const handler of windowEvents.blur) handler();
assert.equal(vm.runInContext("state.moveInput.x", sandbox), 0, "blur clears velocity input");
assert.equal(elements.joystickBase.hidden, true);

const css = fs.readFileSync(__dirname + "/styles.css", "utf8");
for (const id of ["routeProgressLabel", "routeProgressFill", "experienceProgressLabel", "experienceProgressFill", "levelUpScreen"]) {
  assert.match(html, new RegExp(`id=\\"${id}\\"`), `${id} must exist in the HUD`);
}
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, "reduced-motion styling must exist");
assert.match(css, /\.pause-button/, "pause control must be styled");
assert.match(css, /\.command-ring/, "command ring must be styled");
assert.match(css, /\.event-card/, "route and contract cards must be styled");
assert.match(css, /\.upgrade-card\[data-scope/, "upgrade scope must be styled");

console.log("startup test passed");
