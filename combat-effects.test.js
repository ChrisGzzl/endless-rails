"use strict";

const assert = require("node:assert/strict");
const effects = require("./combat-effects.js");

const wingmen = effects.wingmanPositions({ x: 195, y: 340 }, 2, 0);
assert.equal(wingmen.length, 2, "two wingmen create two independent firing positions");
assert.notDeepEqual(wingmen[0], wingmen[1], "wingmen occupy distinct positions");

const targets = [
  { x: 100, y: 100, hp: 3, dead: false },
  { x: 118, y: 100, hp: 3, dead: false },
  { x: 180, y: 100, hp: 3, dead: false },
];
const result = effects.applyAreaDamage(targets, { x: 100, y: 100 }, 30, 3);
assert.equal(result.hitCount, 2, "kill explosion hits nearby enemies only");
assert.equal(targets[0].dead, true, "explosion can finish its source target");
assert.equal(targets[1].hp, 0, "explosion damages a nearby target");
assert.equal(targets[2].hp, 3, "explosion leaves distant targets untouched");

const main = effects.mainWeaponProfile({
  baseDamage: 1.55,
  baseInterval: 0.4,
  modules: { rapid: 2, scatter: 1, piercing: 1, chain: 1 },
  cores: { scatter: 1 },
});
const oneEscort = effects.escortWeaponProfile({ main, escortCount: 1, escortLevel: 0 });
const threeEscorts = effects.escortWeaponProfile({ main, escortCount: 3, escortLevel: 0 });
assert.equal(oneEscort.projectileCount, 1, "escorts always fire a single projectile");
assert.equal(oneEscort.pierce, 0, "escorts do not inherit main piercing");
assert.equal(oneEscort.chain, false, "escorts do not inherit main chain effects");
assert.ok(threeEscorts.totalDps <= main.dps * 0.6 + 0.000001, "escort group remains within its dps cap");
assert.ok(threeEscorts.dpsPerEscort < oneEscort.dpsPerEscort, "escort count redistributes a shared budget");
assert.equal(effects.weaponOwnership("wingman"), "escort-only", "wingmen are escort-only upgrades");
assert.equal(effects.weaponOwnership("railgun"), "train-only", "railgun belongs to the train");
assert.equal(effects.weaponOwnership("magnet"), "team-utility", "magnet is shared utility");
assert.deepEqual(effects.escortWeaponProfile({ main, escortCount: 0, escortLevel: 3 }), effects.emptyEscortProfile(), "zero escorts produce no escort weapon");
assert.ok(effects.mainWeaponProfile({ baseDamage: 1.55, baseInterval: 0.4, modules: {}, cores: {} }).dps > 0, "base main weapon has positive dps");

console.log("combat effects tests passed");
