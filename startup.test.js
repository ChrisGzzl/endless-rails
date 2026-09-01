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
];

function createElement(id) {
  return {
    id,
    hidden: false,
    disabled: false,
    style: {},
    textContent: "",
    innerHTML: "",
    dataset: {},
    events: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, handler) { this.events[type] = handler; },
    querySelectorAll() { return []; },
    append() {},
    setPointerCapture() {},
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
const sandbox = {
  document: { getElementById: id => elements[id], createElement: tag => createElement(tag) },
  window: { addEventListener() {} },
  performance: { now: () => 0 },
  requestAnimationFrame() {},
  console,
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + "/balance.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(__dirname + "/motion.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(__dirname + "/progression.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync(__dirname + "/game.js", "utf8"), sandbox);

let clickError = null;
try {
  elements.startButton.events.click();
} catch (error) {
  clickError = error;
}

assert.equal(clickError, null, "clicking start must not fail when the optional motion script is unavailable");
assert.equal(elements.startScreen.hidden, true, "clicking start must hide the start screen");
assert.equal(elements.phaseLabel.textContent, "行驶中", "clicking start must enter combat");

const html = fs.readFileSync(__dirname + "/index.html", "utf8");
for (const id of ["routeProgressLabel", "routeProgressFill", "experienceProgressLabel", "experienceProgressFill", "levelUpScreen"]) {
  assert.match(html, new RegExp(`id=\\"${id}\\"`), `${id} must exist in the HUD`);
}

console.log("startup test passed");
