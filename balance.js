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

function difficultyAt(station, elapsed = 0, duration = 60) {
  const stage = Math.max(0, Math.min(4, station - 1));
  const progress = Math.max(0, Math.min(1, elapsed / duration));
  return {
    cap: Math.round(5 + stage * 26 + stage * stage * 4 + progress * (9 + stage * 9)),
    batch: 1 + stage * 3 + Math.floor(progress * (1 + stage)),
    interval: Math.max(.48, 2.3 - stage * .35 - progress * .8),
    hp: .9 + stage * .16 + progress * .14,
    speed: 62 + stage * 9 + progress * 12,
    eliteChance: stage === 0 ? 0 : .018 * stage + progress * .01,
  };
}

function enemyCap(station, elapsed, duration) { return difficultyAt(station, elapsed, duration).cap; }
function spawnInterval(station, elapsed, duration) { return difficultyAt(station, elapsed, duration).interval; }
function routeDuration() { return 60; }


const ENEMY_TYPES=Object.freeze({
  walker:{name:"游荡丧尸",hp:1,speed:1,r:9,color:"#9bdc65"},
  runner:{name:"疾行感染者",hp:.62,speed:1.32,r:7,color:"#ffa76c"},
  crawler:{name:"匍匐感染者",hp:.5,speed:.95,r:7,color:"#68c99e"},
  spitter:{name:"酸液喷吐者",hp:.85,speed:.8,r:10,color:"#e2f565"},
  bloater:{name:"孢囊感染者",hp:1.2,speed:.78,r:12,color:"#d38acf"},
  brute:{name:"变异重尸",hp:2.4,speed:.78,r:15,color:"#e2ff73"},
});
function enemyTypeAt(station,elapsed,elite=false,random=Math.random){
  if(elite)return "brute";
  const roll=random();
  if(station>=4&&roll<.1)return "bloater";
  if(station>=3&&roll<.19)return "spitter";
  if(station>=2&&roll<.34)return "crawler";
  if((station>=2||elapsed>=28)&&roll<.55)return "runner";
  return "walker";
}

const balanceApi = {
  ENEMY_TYPES,enemyTypeAt,
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
