"use strict";
const assert = require("node:assert/strict");
const createGame = require("./test-harness.cjs");

// The proactive upgrade prompt ("强化 ×N") must appear only while a banked
// level-up is claimable in live combat - not in menu, not paused, not while
// the choice screen itself is open. Guards the polarity of the visibility rule.
const game = createGame();
const { ui } = game;
const state = game.run("state");
game.run("EndlessRailsMetaUI.close(); homeCtl.isOpen = false;");

game.run("updateHud()");
assert.equal(ui.visible("claimUpgradeButton"), false, "menu with no banked levels hides the prompt");

state.mode = "combat";
state.pendingLevelUps = 2;
game.run("updateHud()");
assert.equal(ui.visible("claimUpgradeButton"), true, "combat with a banked level shows the prompt");
assert.equal(ui.text("claimUpgradeButton"), "强化 ×2");

state.paused = true;
game.run("updateHud()");
assert.equal(ui.visible("claimUpgradeButton"), false, "pausing hides the prompt");

state.paused = false;
state.mode = "levelup";
game.run("updateHud()");
assert.equal(ui.visible("claimUpgradeButton"), false, "the choice screen itself hides the prompt");

state.mode = "combat";
game.run("updateHud()");
ui.tap("claimUpgradeButton");
assert.equal(state.mode, "levelup", "tapping the prompt opens the level-up choice");
assert.ok(ui.visible("levelUpScreen"));

console.log("HUD claim prompt visibility passed.");
