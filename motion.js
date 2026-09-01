"use strict";

const FORWARD = Object.freeze({ x: 0.5, y: -Math.sqrt(3) / 2 });

function worldDrift(dt, speed) {
  return { x: -FORWARD.x * speed * dt, y: -FORWARD.y * speed * dt };
}

function spawnPoint(side, width, height, margin, random = Math.random) {
  const along = random() * (side === "top" || side === "bottom" ? width + margin * 2 : height + margin * 2) - margin;
  if (side === "top") return { x: along, y: -margin };
  if (side === "right") return { x: width + margin, y: along };
  if (side === "bottom") return { x: along, y: height + margin };
  return { x: -margin, y: along };
}

function stepChaser(entity, dt, center, driftSpeed) {
  const dx = center.x - entity.x;
  const dy = center.y - entity.y;
  const distance = Math.hypot(dx, dy) || 1;
  const drift = worldDrift(dt, driftSpeed);
  return {
    x: entity.x + drift.x + (dx / distance) * entity.speed * dt,
    y: entity.y + drift.y + (dy / distance) * entity.speed * dt,
  };
}

const motionApi = { FORWARD, worldDrift, spawnPoint, stepChaser };
if (typeof module !== "undefined" && module.exports) module.exports = motionApi;
if (typeof window !== "undefined") window.EndlessRailsMotion = motionApi;
