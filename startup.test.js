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
  "pauseButton", "commandRing", "eventScreen", "eventList", "contractScreen", "contractList", "rerollButton", "resultBuild", "resultRecord", "joystickBase", "joystickThumb",
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

const elements = Object.fromEntries(ids.map(id => [id, createElement(id)]));
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
assert.deepEqual(scriptNames, ["balance.js", "motion.js", "progression.js", "combat-effects.js", "control.js", "route-events.js", "run-record.js", "renderer.js", "game.js"], "all runtime modules must load in dependency order");
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

assert.equal(elements.gameCanvas.events.pointerdown, undefined, "battlefield taps must not deploy the drone");
assert.equal(elements.gameCanvas.events.pointermove, undefined, "the drone cannot be dragged on the battlefield");
elements.joystickBase.getBoundingClientRect = () => ({ left: 20, top: 600, width: 100, height: 100 });
const stickEvent = (pointerId, clientX, clientY) => ({ pointerId, clientX, clientY, pointerType: "touch", button: 0, preventDefault() {} });
elements.joystickBase.events.pointerdown(stickEvent(1, 70, 650));
elements.joystickBase.events.pointermove(stickEvent(1, 170, 650));
assert.equal(vm.runInContext("state.drone.tx - state.train.x", sandbox), 132, "full right stick deploys to the right of the train");
elements.joystickBase.events.pointermove(stickEvent(2, -100, 650));
assert.equal(vm.runInContext("state.drone.tx - state.train.x", sandbox), 132, "a second finger must not hijack the stick");
elements.joystickBase.events.pointerup(stickEvent(1, 170, 650));
assert.equal(elements.joystickThumb.style.transform, "translate(0px, 0px)", "release recenters the stick");
assert.equal(vm.runInContext("state.drone.tx - state.train.x", sandbox), 132, "release keeps the deployment position");
elements.joystickBase.events.pointerdown(stickEvent(3, 70, 610));
elements.joystickBase.events.pointercancel(stickEvent(3, 70, 610));
assert.equal(vm.runInContext("joystickState.pointerId", sandbox), null, "touch cancellation releases the stick");
elements.joystickBase.events.pointerdown(stickEvent(4, 70, 610));
elements.pauseButton.events.click();
assert.equal(vm.runInContext("joystickState.pointerId", sandbox), null, "pause clears active input");
assert.equal(elements.pulseButton.disabled, true, "pulse is disabled while paused");
const pausedTarget = vm.runInContext("state.drone.tx", sandbox);
elements.joystickBase.events.pointermove(stickEvent(4, 170, 650));
assert.equal(vm.runInContext("state.drone.tx", sandbox), pausedTarget);
elements.pauseButton.events.click();
for (const handler of windowEvents.keydown) handler({ code: "ArrowLeft", preventDefault() {} });
assert.equal(vm.runInContext("state.drone.tx - state.train.x", sandbox), -132, "keyboard directions use the virtual stick mapping");
for (const handler of windowEvents.keyup) handler({ code: "ArrowLeft", preventDefault() {} });
assert.equal(elements.joystickThumb.style.transform, "translate(0px, 0px)");
vm.runInContext("state.train.x += 5; update(0.016);", sandbox);
assert.equal(vm.runInContext("state.drone.tx - state.train.x", sandbox), -132, "the deployed offset follows a moving train");
elements.joystickBase.events.pointerdown(stickEvent(5, 70, 610));
for (const handler of windowEvents.blur) handler();
assert.equal(vm.runInContext("joystickState.pointerId", sandbox), null, "losing focus releases the stick");

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
