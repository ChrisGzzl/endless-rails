"use strict";

const DEFAULT_LIFE = 0.5;
const DRONE_MOVE_SPEED = 180; // Logical canvas pixels per second at full stick tilt.

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function relativeCommand(point, train, bounds, radius) {
  const dx = point.x - train.x;
  const dy = point.y - train.y;
  const reach = Math.max(0, Number(radius) || 0);
  const distance = Math.hypot(dx, dy);
  const strength = reach && distance ? Math.min(1, distance / reach) : 0;
  const scale = distance ? Math.min(1, reach / distance) : 0;
  return {
    x: clamp(train.x + dx * scale, bounds.left, bounds.right),
    y: clamp(train.y + dy * scale, bounds.top, bounds.bottom),
    angle: distance ? Math.atan2(dy, dx) : 0,
    strength,
  };
}

function directCommand(point, bounds, padding = 0) {
  const inset = Math.max(0, Number(padding) || 0);
  return {
    x: clamp(point.x, bounds.left + inset, bounds.right - inset),
    y: clamp(point.y, bounds.top + inset, bounds.bottom - inset),
  };
}

// Normalize movement around the touch-down origin, independent of screen size.
function joystickVector(point, center, radius, deadzone = 0.08) {
  const reach = Math.max(0, Number(radius) || 0);
  const dx = point.x - center.x, dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (!reach || !Number.isFinite(distance)) return { x: 0, y: 0, strength: 0 };
  const zone = clamp(Number(deadzone) || 0, 0, 0.95);
  const strength = Math.max(0, (Math.min(1, distance / reach) - zone) / (1 - zone));
  if (!strength) return { x: 0, y: 0, strength: 0 };
  return { x: dx / distance * strength, y: dy / distance * strength, strength };
}

function joystickCommand(vector, train, bounds, radius = 132) {
  const reach = Math.max(0, Number(radius) || 0);
  return relativeCommand({ x: train.x + vector.x * reach, y: train.y + vector.y * reach }, train, bounds, reach);
}

function stepDrone(position, vector, speed, dt, bounds) {
  const x = Number.isFinite(vector.x) ? vector.x : 0;
  const y = Number.isFinite(vector.y) ? vector.y : 0;
  const length = Math.max(1, Math.hypot(x, y));
  const distance = Math.max(0, Number(speed) || 0) * Math.max(0, Number(dt) || 0);
  return {
    x: clamp(position.x + x / length * distance, bounds.left, bounds.right),
    y: clamp(position.y + y / length * distance, bounds.top, bounds.bottom),
  };
}

function createCommandRing(target, life = DEFAULT_LIFE) {
  return { target: { x: target.x, y: target.y }, life: Math.max(0, life) };
}

function advanceCommandRing(ring, dt) {
  if (!ring || ring.life <= 0) return null;
  const life = Math.max(0, ring.life - Math.max(0, Number(dt) || 0));
  if (life <= 0) return null;
  return { target: { x: ring.target.x, y: ring.target.y }, life };
}

const controlApi = { DRONE_MOVE_SPEED, stepDrone, relativeCommand, directCommand, joystickVector, joystickCommand, createCommandRing, advanceCommandRing };
if (typeof module !== "undefined" && module.exports) module.exports = controlApi;
if (typeof window !== "undefined") window.EndlessRailsControl = controlApi;
