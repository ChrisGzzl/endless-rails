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

const LAYER_MULTIPLIERS = Object.freeze({ near: 1, mid: 0.48, far: 0.16 });

function scrollOffset(time, speed, multiplier = 1) {
  return time * speed * multiplier;
}

function hashSeed(seed, index) {
  let hash = 2166136261;
  const text = `${seed}:${index}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function wrap(value, size) {
  return ((value % size) + size) % size;
}

function projectLandmark(seed, index, width, height, offset, layer = "near") {
  const multiplier = typeof layer === "number" ? layer : (LAYER_MULTIPLIERS[layer] ?? 1);
  const xSeed = hashSeed(seed, index * 2);
  const ySeed = hashSeed(seed, index * 2 + 1);
  const distance = scrollOffset(offset, 1, multiplier);
  return {
    x: wrap(xSeed * width - FORWARD.x * distance, width),
    y: wrap(ySeed * height - FORWARD.y * distance, height),
    layer,
    multiplier,
  };
}

const motionApi = { FORWARD, worldDrift, spawnPoint, stepChaser, scrollOffset, projectLandmark };
if (typeof module !== "undefined" && module.exports) module.exports = motionApi;
if (typeof window !== "undefined") window.EndlessRailsMotion = motionApi;
