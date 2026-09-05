"use strict";

const DEFAULT_LIFE = 0.5;

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

function createCommandRing(target, life = DEFAULT_LIFE) {
  return { target: { x: target.x, y: target.y }, life: Math.max(0, life) };
}

function advanceCommandRing(ring, dt) {
  if (!ring || ring.life <= 0) return null;
  const life = Math.max(0, ring.life - Math.max(0, Number(dt) || 0));
  if (life <= 0) return null;
  return { target: { x: ring.target.x, y: ring.target.y }, life };
}

const controlApi = { relativeCommand, directCommand, createCommandRing, advanceCommandRing };
if (typeof module !== "undefined" && module.exports) module.exports = controlApi;
if (typeof window !== "undefined") window.EndlessRailsControl = controlApi;
