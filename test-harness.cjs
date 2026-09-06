"use strict";
module.exports = function createGame({context} = {}) {

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


return { sandbox, elements, windowEvents, run: code => vm.runInContext(code, sandbox, { timeout: 3000 }) };
};
