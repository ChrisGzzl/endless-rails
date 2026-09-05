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
assert.equal(motion.scrollOffset(2, 88, 1), 176, "scroll offset uses elapsed time and layer speed");

const near = motion.projectLandmark("seed-7", 3, 390, 680, 176, "near");
const far = motion.projectLandmark("seed-7", 3, 390, 680, 176, "far");
assert.notDeepEqual(near, far, "near and far landmarks use different layer speeds");
assert.deepEqual(
  near,
  motion.projectLandmark("seed-7", 3, 390, 680, 176, "near"),
  "landmark projection is deterministic"
);
assert.ok(near.x >= 0 && near.x < 390, "landmark x wraps into the viewport");
assert.ok(near.y >= 0 && near.y < 680, "landmark y wraps into the viewport");

for (const side of ["top", "right", "bottom", "left"]) {
  const point = motion.spawnPoint(side, 390, 680, 42, () => 0.5);
  const step = motion.stepChaser({ x: point.x, y: point.y, speed: 112 }, 1, center, 78);
  const before = Math.hypot(point.x - center.x, point.y - center.y);
  const after = Math.hypot(step.x - center.x, step.y - center.y);
  assert.ok(after < before, `${side} chaser must close distance while world drifts`);
}

console.log("motion tests passed");
