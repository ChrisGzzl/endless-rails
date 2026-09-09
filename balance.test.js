"use strict";

const assert = require("node:assert/strict");
const balance = require("./balance.js");

assert.equal(balance.START_TRAIN_LENGTH, 3, "the starting train remains three cars");
assert.equal(balance.initialWaveCount(1), 2, "opening starts sparse");
assert.equal(balance.enemyCap(1), 5, "opening keeps a safe live cap");
assert.ok(balance.spawnInterval(1) >= 2, "opening allows recovery between spawns");
assert.equal(balance.difficultyAt(1, 48).eliteChance, 0);
for(let station=1;station<=5;station++) {
  const early=balance.difficultyAt(station,0,48),late=balance.difficultyAt(station,48,48);
  assert.ok(late.cap>early.cap && late.interval<early.interval && late.hp>early.hp);
  if(station>1) assert.ok(early.hp>balance.difficultyAt(station-1).hp);
}
assert.ok(balance.REGULAR_ENEMY_HP_BASE < 1.8, "regular enemies start with less health");
assert.ok(balance.REGULAR_ENEMY_SPEED_BASE + balance.REGULAR_ENEMY_SPEED_JITTER < 118, "regular enemies start slower");
assert.ok(balance.ELITE_ENEMY_SPEED_BASE < 128, "elite enemies start slower");
assert.ok(balance.RAIL_HALF_LENGTH > 720, "rails extend beyond the existing screen span");
assert.ok(balance.RAIL_WIDTH < 11, "rails become thinner");
assert.ok(balance.CAR_LENGTH > 40, "each car is longer than the old short block");
assert.ok(balance.CAR_SPACING > 38, "cars have a longer train-like spacing");
assert.ok(balance.DRONE_BASE_DAMAGE > 1, "the base weapon hits harder");
assert.equal(balance.DRONE_BASE_INTERVAL, 0.4, "main weapon exposes its base interval");
assert.equal(balance.ESCORT_BASE_DAMAGE_RATIO, 0.4, "escort damage starts at forty percent of main base damage");
assert.equal(balance.ESCORT_INTERVAL_MULTIPLIER, 1.35, "escort fire interval is slower than main fire");
assert.equal(balance.ESCORT_DPS_CAP_RATIO, 0.6, "escort group dps has a hard cap");
assert.ok(balance.HIT_PARTICLE_COUNT > 5, "hits create a stronger burst");

console.log("balance tests passed");
