"use strict";

const CORE_TYPES = ["overdrive", "scatter", "arc"];

function createProgression(config = {}) {
  const routeDistanceTotal = config.routeDistanceTotal ?? 20;
  return {
    routeDistanceTotal,
    routeDistance: config.routeDistance ?? routeDistanceTotal,
    experience: config.experience ?? 0,
    experienceToNext: config.experienceToNext ?? 10,
    level: config.level ?? 1,
    pendingLevelUps: config.pendingLevelUps ?? 0,
    drops: config.drops ? [...config.drops] : [],
    coreStacks: { ...(config.coreStacks || {}) },
  };
}

function awardExperience(state, amount) {
  const next = { ...state };
  let experience = next.experience + Math.max(0, amount);
  let experienceToNext = next.experienceToNext;
  let level = next.level;
  let pendingLevelUps = next.pendingLevelUps;
  let levelsGained = 0;
  while (experience >= experienceToNext) {
    experience -= experienceToNext;
    level += 1;
    pendingLevelUps += 1;
    levelsGained += 1;
    experienceToNext = 10 + (level - 1) * 4;
  }
  return { state: { ...next, experience, experienceToNext, level, pendingLevelUps }, levelsGained };
}

function advanceRoute(state, dt) {
  return { ...state, routeDistance: Math.max(0, state.routeDistance - Math.max(0, dt)) };
}

function rollCoreDrop({ elite = false, combo = 0, random = Math.random }) {
  const chance = elite ? 0.28 : combo > 0 && combo % 5 === 0 ? 0.1 : 0;
  if (random() >= chance) return null;
  return CORE_TYPES[Math.floor(random() * CORE_TYPES.length)];
}

function collectCore(state, coreType) {
  const total = Object.values(state.coreStacks || {}).reduce((sum, value) => sum + value, 0);
  if (total >= 3) return { state, collected: false, scrap: 10 };
  const coreStacks = { ...(state.coreStacks || {}) };
  coreStacks[coreType] = (coreStacks[coreType] || 0) + 1;
  return { state: { ...state, coreStacks }, collected: true, scrap: 0 };
}

function expireDrops(drops, dt) {
  return drops.map(drop => ({ ...drop, life: drop.life - Math.max(0, dt) })).filter(drop => drop.life > 0);
}

const progressionApi = { CORE_TYPES, createProgression, awardExperience, advanceRoute, rollCoreDrop, collectCore, expireDrops };
if (typeof module !== "undefined" && module.exports) module.exports = progressionApi;
if (typeof window !== "undefined") window.EndlessRailsProgression = progressionApi;
