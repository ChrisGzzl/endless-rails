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
const SPAWN_BATCH_SIZE = 3;
const ENEMY_CAP = 26;
const BOSS_ENEMY_CAP = 30;
const SPAWN_INTERVAL_BASE = 0.34;
const SPAWN_INTERVAL_STEP = 0.02;
const DRONE_BASE_DAMAGE = 1.55;
const DRONE_BASE_INTERVAL = 0.4;
const ESCORT_BASE_DAMAGE_RATIO = 0.4;
const ESCORT_INTERVAL_MULTIPLIER = 1.35;
const ESCORT_DPS_CAP_RATIO = 0.6;
const HIT_PARTICLE_COUNT = 8;
const KILL_BLAST_RADIUS = 46;
const KILL_BLAST_DAMAGE = 0.85;

function initialWaveCount(station) {
  return 2 + (station - 1) * 2;
}

function difficultyAt(station, elapsed = 0, duration = 48) {
  const stage = Math.max(0, Math.min(4, station - 1));
  const progress = Math.max(0, Math.min(1, elapsed / duration));
  return {
    cap: Math.round(5 + stage * 8 + progress * (5 + stage)),
    batch: stage < 2 ? 1 : stage < 4 ? 2 : 3,
    interval: Math.max(.62, 2.4 - stage * .4 - progress * .85),
    hp: 1.1 + stage * .65 + progress * .35,
    speed: 62 + stage * 9 + progress * 12,
    eliteChance: stage === 0 ? 0 : .035 * stage + progress * .025,
  };
}

function enemyCap(station, elapsed, duration) { return difficultyAt(station, elapsed, duration).cap; }
function spawnInterval(station, elapsed, duration) { return difficultyAt(station, elapsed, duration).interval; }
function routeDuration(station) { return 42 + station * 6; }

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
  DRONE_BASE_INTERVAL,
  ESCORT_BASE_DAMAGE_RATIO,
  ESCORT_INTERVAL_MULTIPLIER,
  ESCORT_DPS_CAP_RATIO,
  HIT_PARTICLE_COUNT,
  KILL_BLAST_RADIUS,
  KILL_BLAST_DAMAGE,
  initialWaveCount,
  difficultyAt,
  routeDuration,
  enemyCap,
  spawnInterval,
};

if (typeof module !== "undefined" && module.exports) module.exports = balanceApi;
if (typeof window !== "undefined") window.EndlessRailsBalance = balanceApi;
