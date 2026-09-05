"use strict";

const assert = require("node:assert/strict");
const control = require("./control.js");

const bounds = { left: 46, right: 344, top: 120, bottom: 570 };
const train = { x: 195, y: 340 };

const target = control.relativeCommand({ x: 390, y: 680 }, train, bounds, 132);
assert.equal(target.x, 288);
assert.equal(target.y, 454);
assert.ok(target.strength <= 1);

assert.deepEqual(
  control.relativeCommand({ x: 195, y: 340 }, train, bounds, 132),
  { x: 195, y: 340, strength: 0 },
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

const ring = control.createCommandRing({ x: 288, y: 454 }, 0.5);
assert.deepEqual(ring.target, { x: 288, y: 454 });
assert.equal(ring.life, 0.5);
assert.equal(control.advanceCommandRing(ring, 0.2), true);
assert.equal(ring.life, 0.3);
assert.equal(control.advanceCommandRing(ring, 0.3), false);
assert.equal(ring.life, 0);

console.log("control tests passed");
