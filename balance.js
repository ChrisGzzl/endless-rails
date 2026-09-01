"use strict";

const START_TRAIN_LENGTH = 3;
const REGULAR_ENEMY_HP_BASE = 1.3;
const REGULAR_ENEMY_HP_STEP = 0.16;
const ELITE_ENEMY_HP_BASE = 4;
const ELITE_ENEMY_HP_STEP = 0.4;
const REGULAR_ENEMY_SPEED_BASE = 88;
const REGULAR_ENEMY_SPEED_JITTER = 16;
const REGULAR_ENEMY_SPEED_STEP = 4;
const ELITE_ENEMY_SPEED_BASE = 108;
const ELITE_ENEMY_SPEED_STEP = 4;
const RAIL_HALF_LENGTH = 1100;
const RAIL_WIDTH = 8;
const RAIL_EDGE_WIDTH = 2.5;
const SLEEPER_WIDTH = 4;
const CAR_LENGTH = 50;
const CAR_HEIGHT = 34;
const CAR_SPACING = 58;
const SPAWN_BATCH_SIZE = 2;
const ENEMY_CAP = 18;
const BOSS_ENEMY_CAP = 22;
const SPAWN_INTERVAL_BASE = 0.42;
const SPAWN_INTERVAL_STEP = 0.025;
const DRONE_BASE_DAMAGE = 1.55;
const HIT_PARTICLE_COUNT = 8;

function initialWaveCount(station) {
  return station === 5 ? 12 : 7 + station;
}

function enemyCap(station) {
  return station === 5 ? BOSS_ENEMY_CAP : ENEMY_CAP;
}

function spawnInterval(station) {
  return Math.max(0.24, SPAWN_INTERVAL_BASE - station * SPAWN_INTERVAL_STEP);
}

const balanceApi = {
  START_TRAIN_LENGTH,
  REGULAR_ENEMY_HP_BASE,
  REGULAR_ENEMY_HP_STEP,
  ELITE_ENEMY_HP_BASE,
  ELITE_ENEMY_HP_STEP,
  REGULAR_ENEMY_SPEED_BASE,
  REGULAR_ENEMY_SPEED_JITTER,
  REGULAR_ENEMY_SPEED_STEP,
  ELITE_ENEMY_SPEED_BASE,
  ELITE_ENEMY_SPEED_STEP,
  RAIL_HALF_LENGTH,
  RAIL_WIDTH,
  RAIL_EDGE_WIDTH,
  SLEEPER_WIDTH,
  CAR_LENGTH,
  CAR_HEIGHT,
  CAR_SPACING,
  SPAWN_BATCH_SIZE,
  ENEMY_CAP,
  BOSS_ENEMY_CAP,
  SPAWN_INTERVAL_BASE,
  SPAWN_INTERVAL_STEP,
  DRONE_BASE_DAMAGE,
  HIT_PARTICLE_COUNT,
  initialWaveCount,
  enemyCap,
  spawnInterval,
};

if (typeof module !== "undefined" && module.exports) module.exports = balanceApi;
if (typeof window !== "undefined") window.EndlessRailsBalance = balanceApi;
