"use strict";

const DEFAULT_LIFE = 0.5;

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function relativeCommand(point, train, bounds, radius) {
  const dx = point.x - train.x;
  const dy = point.y - train.y;
  const reach = Math.max(0, Number(radius) || 0);
  const xSoftLimit = reach * 0.62;
  const ySoftLimit = reach * 0.4053030303030303;
  const xOffset = dx ? (dx / (Math.abs(dx) + xSoftLimit)) * reach : 0;
  const yOffset = dy ? (dy / (Math.abs(dy) + ySoftLimit)) * reach : 0;
  const distance = Math.hypot(dx, dy);
  const strength = distance ? Math.min(1, distance / (distance + Math.min(xSoftLimit, ySoftLimit))) : 0;
  return {
    x: Math.round(clamp(train.x + xOffset, bounds.left, bounds.right)),
    y: Math.round(clamp(train.y + yOffset, bounds.top, bounds.bottom)),
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
  if (!ring || ring.life <= 0) return false;
  ring.life = Math.max(0, ring.life - Math.max(0, dt));
  return ring.life > 0;
}

const controlApi = { relativeCommand, directCommand, createCommandRing, advanceCommandRing };
if (typeof module !== "undefined" && module.exports) module.exports = controlApi;
if (typeof window !== "undefined") window.EndlessRailsControl = controlApi;
