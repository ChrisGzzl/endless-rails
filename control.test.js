"use strict";

const assert = require("node:assert/strict");
const control = require("./control.js");

const bounds = { left: 46, right: 344, top: 120, bottom: 570 };
const train = { x: 195, y: 340 };

const target = control.relativeCommand({ x: 390, y: 680 }, train, bounds, 132);
assert.ok(Math.abs(target.x - (195 + 195 * 132 / Math.hypot(195, 340))) < 0.0001);
assert.ok(Math.abs(target.y - (340 + 340 * 132 / Math.hypot(195, 340))) < 0.0001);
assert.equal(target.angle, Math.atan2(340, 195));
assert.equal(target.strength, 1);
assert.ok(
  Math.hypot(target.x - train.x, target.y - train.y) <= 132,
  "relative commands cannot exceed the configured radius"
);

const nearby = control.relativeCommand({ x: 225, y: 380 }, train, bounds, 132);
assert.deepEqual(
  nearby,
  { x: 225, y: 380, angle: Math.atan2(40, 30), strength: Math.hypot(30, 40) / 132 },
  "a nearby command preserves its relative displacement and normalized strength"
);

assert.deepEqual(
  control.relativeCommand({ x: 195, y: 340 }, train, bounds, 132),
  { x: 195, y: 340, angle: 0, strength: 0 },
  "a tap on the train center produces no offset"
);

assert.deepEqual(
  control.directCommand({ x: -10, y: 999 }, bounds, 0),
  { x: 46, y: 570 }
);
assert.deepEqual(
  control.directCommand({ x: 100, y: 200 }, bounds, 12),
  { x: 100, y: 200 }
);

const ring = control.createCommandRing({ x: 261, y: 454 }, 0.5);
assert.deepEqual(ring.target, { x: 261, y: 454 });
assert.equal(ring.life, 0.5);
assert.deepEqual(
  control.advanceCommandRing(ring, 0.2),
  { target: { x: 261, y: 454 }, life: 0.3 },
  "advancing returns a new fading ring"
);
assert.deepEqual(ring, { target: { x: 261, y: 454 }, life: 0.5 }, "advancing does not mutate the input ring");
assert.equal(control.advanceCommandRing(ring, 0.5), null, "a fully elapsed ring expires");

console.log("control tests passed");
