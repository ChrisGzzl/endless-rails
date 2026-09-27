"use strict";
const assert = require("node:assert/strict");
const createGame = require("./test-harness.cjs");

// The proactive upgrade prompt ("强化 ×N") must appear only while a banked
// level-up is claimable in live combat - not in menu, not paused, not while
// the choice screen itself is open. Guards the polarity of the hidden write.
const game = createGame();
const { sandbox, elements } = game;
const button = elements.claimUpgradeButton;
const state = game.run("state");

game.run("updateHud()");
assert.equal(button.hidden, true, "menu with no banked levels hides the prompt");

state.mode = "combat";
state.pendingLevelUps = 2;
game.run("updateHud()");
assert.equal(button.hidden, false, "combat with a banked level shows the prompt");
assert.equal(button.textContent, "强化 ×2");

state.paused = true;
game.run("updateHud()");
assert.equal(button.hidden, true, "pausing hides the prompt");

state.paused = false;
state.mode = "levelup";
game.run("updateHud()");
assert.equal(button.hidden, true, "the choice screen itself hides the prompt");

console.log("HUD claim prompt visibility passed.");
