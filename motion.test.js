"use strict";

const assert = require("node:assert/strict");
const motion = require("./motion.js");

const center = { x: 195, y: 340 };

assert.ok(motion.FORWARD.x > 0, "train heading must point right");
assert.ok(motion.FORWARD.y < 0, "train heading must point up");

const drift = motion.worldDrift(1, 78);
assert.ok(drift.x < 0, "world drift must move left");
assert.ok(drift.y > 0, "world drift must move down");
assert.ok(Math.abs(Math.hypot(drift.x, drift.y) - 78) < 0.001, "drift keeps configured speed");

for (const side of ["top", "right", "bottom", "left"]) {
  const point = motion.spawnPoint(side, 390, 680, 42, () => 0.5);
  const step = motion.stepChaser({ x: point.x, y: point.y, speed: 112 }, 1, center, 78);
  const before = Math.hypot(point.x - center.x, point.y - center.y);
  const after = Math.hypot(step.x - center.x, step.y - center.y);
  assert.ok(after < before, `${side} chaser must close distance while world drifts`);
}

console.log("motion tests passed");
