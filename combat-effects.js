"use strict";

const COMBAT_ESCORT_BASE_DAMAGE_RATIO = 0.4;
const COMBAT_ESCORT_INTERVAL_MULTIPLIER = 1.35;
const COMBAT_ESCORT_DPS_CAP_RATIO = 0.6;

const OWNERSHIP = Object.freeze({
  rapid: "main-only",
  scatter: "main-only",
  piercing: "main-only",
  chain: "main-only",
  missile: "main-only",
  wingman: "escort-only",
  escort: "escort-only",
  railgun: "train-only",
  armor: "train-only",
  repair: "train-only",
  shield: "train-only",
  cargo: "team-utility",
  volatile: "team-utility",
  magnet: "team-utility",
  overclock: "team-utility",
});

function moduleLevel(map, id) {
  return Math.max(0, Number(map?.[id]) || 0);
}

function weaponOwnership(id) {
  return OWNERSHIP[id] || "main-only";
}

function mainWeaponProfile({ baseDamage, baseInterval, modules = {}, cores = {} }) {
  const rapid = moduleLevel(modules, "rapid");
  const scatter = moduleLevel(modules, "scatter") * 2 + moduleLevel(cores, "scatter");
  const interval = Math.max(0.14, baseInterval - rapid * 0.07);
  const damage = Math.max(0, baseDamage + rapid * 0.12);
  const projectileCount = 1 + scatter;
  return {
    baseDamage,
    baseInterval,
    damage,
    interval,
    projectileCount,
    pierce: moduleLevel(modules, "piercing"),
    chain: moduleLevel(modules, "chain") > 0,
    coreArc: moduleLevel(cores, "arc") > 0,
    dps: damage * projectileCount / interval,
  };
}

function emptyEscortProfile() {
  return { damage: 0, interval: 0, projectileCount: 0, pierce: 0, chain: false, dpsPerEscort: 0, totalDps: 0 };
}

function escortWeaponProfile({ main, escortCount, escortLevel = 0 }) {
  const count = Math.max(0, Math.floor(Number(escortCount) || 0));
  if (!count || !main || !(main.dps > 0)) return emptyEscortProfile();
  const interval = Math.max(0.01, main.baseInterval * COMBAT_ESCORT_INTERVAL_MULTIPLIER);
  const cap = main.dps * COMBAT_ESCORT_DPS_CAP_RATIO * (1 + Math.max(0, Number(escortLevel) || 0) * 0.08);
  const levelBonus = Math.max(0, Number(escortLevel) || 0);
  const sharedBaseDps = main.baseDamage * COMBAT_ESCORT_BASE_DAMAGE_RATIO * (1 + levelBonus * 0.1) / interval;
  const totalDps = Math.min(sharedBaseDps, cap);
  const damage = totalDps * interval / count;
  const dpsPerEscort = damage / interval;
  return { damage, interval, projectileCount: 1, pierce: 0, chain: false, dpsPerEscort, totalDps: dpsPerEscort * count };
}

function trainWeaponProfile({ modules = {} }) {
  const railgun = moduleLevel(modules, "railgun");
  return { railgunDamage: railgun ? 2.6 + railgun * 0.35 : 0, railgunInterval: railgun ? Math.max(0.7, 1.2 - railgun * 0.08) : Infinity };
}

function wingmanPositions(center, count, time) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = time * 1.8 + (Math.PI * 2 * i) / count;
    positions.push({
      x: center.x + Math.cos(angle) * 34,
      y: center.y + Math.sin(angle) * 34,
    });
  }
  return positions;
}

function applyAreaDamage(targets, center, radius, damage) {
  let hitCount = 0;
  const defeated = [];
  for (const target of targets) {
    if (target.dead || Math.hypot(target.x - center.x, target.y - center.y) > radius) continue;
    target.hp -= damage;
    target.hit = 1;
    hitCount += 1;
    if (target.hp <= 0) {
      target.dead = true;
      defeated.push(target);
    }
  }
  return { hitCount, defeated };
}

const combatEffects = {
  ESCORT_BASE_DAMAGE_RATIO: COMBAT_ESCORT_BASE_DAMAGE_RATIO,
  ESCORT_INTERVAL_MULTIPLIER: COMBAT_ESCORT_INTERVAL_MULTIPLIER,
  ESCORT_DPS_CAP_RATIO: COMBAT_ESCORT_DPS_CAP_RATIO,
  wingmanPositions,
  applyAreaDamage,
  weaponOwnership,
  mainWeaponProfile,
  emptyEscortProfile,
  escortWeaponProfile,
  trainWeaponProfile,
};
if (typeof module !== "undefined" && module.exports) module.exports = combatEffects;
if (typeof window !== "undefined") window.EndlessRailsCombatEffects = combatEffects;
