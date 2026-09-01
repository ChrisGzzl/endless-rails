"use strict";

const assert = require("node:assert/strict");
const balance = require("./balance.js");

assert.equal(balance.START_TRAIN_LENGTH, 3, "the starting train remains three cars");
assert.equal(balance.initialWaveCount(1), 8, "station one starts with a visible horde");
assert.ok(balance.enemyCap(1) >= 16, "combat keeps a horde on screen");
assert.equal(balance.SPAWN_BATCH_SIZE, 2, "spawns arrive in small horde bursts");
assert.ok(balance.spawnInterval(1) <= 0.4, "horde replenishes frequently");
assert.ok(balance.REGULAR_ENEMY_HP_BASE < 1.8, "regular enemies start with less health");
assert.ok(balance.REGULAR_ENEMY_SPEED_BASE + balance.REGULAR_ENEMY_SPEED_JITTER < 118, "regular enemies start slower");
assert.ok(balance.ELITE_ENEMY_SPEED_BASE < 128, "elite enemies start slower");
assert.ok(balance.RAIL_HALF_LENGTH > 720, "rails extend beyond the existing screen span");
assert.ok(balance.RAIL_WIDTH < 11, "rails become thinner");
assert.ok(balance.CAR_LENGTH > 40, "each car is longer than the old short block");
assert.ok(balance.CAR_SPACING > 38, "cars have a longer train-like spacing");
assert.ok(balance.DRONE_BASE_DAMAGE > 1, "the base weapon hits harder");
assert.ok(balance.HIT_PARTICLE_COUNT > 5, "hits create a stronger burst");

console.log("balance tests passed");
