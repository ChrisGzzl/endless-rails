"use strict";

const assert = require("node:assert/strict");
const progression = require("./progression.js");

const initial = progression.createProgression({ routeDistanceTotal: 20, experienceToNext: 10 });
const result = progression.awardExperience(initial, 25);
assert.equal(result.levelsGained, 2);
assert.equal(result.state.level, 3);
assert.equal(result.state.experience, 1);
assert.equal(result.state.pendingLevelUps, 2);
assert.equal(progression.advanceRoute(result.state, 2).routeDistance, 18);
assert.equal(progression.rollCoreDrop({ elite: true, combo: 0, random: () => 0.1 }), "overdrive");
assert.equal(progression.rollCoreDrop({ elite: false, combo: 4, random: () => 0.01 }), null);
assert.equal(progression.rollCoreDrop({ elite: false, combo: 5, random: () => 0.01 }), "overdrive");
assert.equal(progression.collectCore({ ...result.state, coreStacks: {} }, "overdrive").collected, true);
assert.equal(progression.collectCore({ ...result.state, coreStacks: { overdrive: 3 } }, "arc").scrap, 10);
assert.equal(progression.expireDrops([{ type: "arc", life: 0.5 }], 0.6).length, 0);

console.log("progression tests passed");
