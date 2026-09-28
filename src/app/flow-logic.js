"use strict";
// DOM-free screen-flow logic: every transition the battle flow can take
// (contract -> route -> combat -> levelup -> station -> result) is computed
// here and returned as plain data. The web panels (flows.js) and the canvas
// host (canvas-host.js) both consume this module and present the result on
// their own surface - DOM overlays or canvas screens. Nothing here may touch
// the document; presentation goes through engine.presentation hooks.

import { state, level, carEnabled, gameAudio, longterm, routeEvents, effects, runRecord, metaStorage, presentation } from "./engine.js";
import { beginRoute, syncSwarm, settleLongterm } from "../sim/run.js";
import { experiencePool, stationUpgradePool } from "../sim/station.js";
import { showToast } from "../sim/fx.js";

function settleFinish(result) {
  if (state.mode === "result" && state.metaSettled) return null;
  const outcome = result === true ? "won" : result === "extracted" ? "extracted" : "lost";
  const settlement = settleLongterm(outcome);
  if (!settlement) return null;
  state.mode = "result"; state.outcome = outcome;
  state.record = runRecord.mergeRecord(state.record, runRecord.buildRunSummary(state));
  runRecord.saveRecord(metaStorage, state.record);
  presentation.updateHud();
  return { outcome, settlement, record: state.record };
}

// Route-event intel text is shared by the DOM cards and the canvas cards.
function eventIntel(event) {
  if (!carEnabled("radar")) return "";
  const base = event.weather === "dust" ? " · 雷达：Elite 活跃" : event.weather === "speed" ? " · 雷达：高速威胁" : " · 雷达：资源信号增强";
  return longterm.hasBlueprint(state.metaProfile, "radar-pulse")
    ? base + `，移速 ×${event.enemySpeedMultiplier} / 精英 ×${event.eliteChanceMultiplier} / 核心 ×${event.coreChanceMultiplier}`
    : base;
}

function prepareContractChoice() {
  const choices = routeEvents.pickContracts(state.runSeed);
  if (!choices.length) {
    state.activeContract = routeEvents.CONTRACTS?.[0] || null;
    prepareRouteEvent();
    return null;
  }
  state.mode = "contractChoice"; state.contractChoices = choices;
  return choices;
}

function chooseContract(contract) {
  state.activeContract = contract;
  return prepareRouteEvent();
}

function prepareRouteEvent() {
  const choices = routeEvents.pickRouteEvents(state.runSeed, state.station);
  if (!choices.length) { beginRoute(null); return null; }
  state.mode = "routeChoice"; state.eventChoices = choices;
  return choices.map(event => ({ event, intel: eventIntel(event) }));
}

function prepareLevelUp() {
  if (state.mode === "levelup" || state.pendingLevelUps <= 0) return null;
  state.upgradeReturnMode = state.mode === "station" ? "station" : "combat";
  state.mode = "levelup";
  const pool = experiencePool.filter(u => u.id !== "wingman" || level("wingman") < 3).sort(() => Math.random() - .5);
  // Always offer a distinct trajectory while one remains unlearned.
  const novel = pool.find(u => u.id !== "rapid" && u.id !== "wingman" && !level(u.id));
  const picks = novel ? [novel, ...pool.filter(u => u !== novel).slice(0, 2)] : pool.slice(0, 3);
  return picks;
}

function breakthroughOptions(id) {
  if (id === "missile") return [
    { id: "cluster", icon: "✹", name: "集束弹头", desc: "主弹爆炸后产生三次次级爆破，强化尸潮清理。" },
    { id: "heavy", icon: "⬢", name: "重型弹头", desc: "射速略降，但主弹伤害与爆炸范围显著提高。" }
  ];
  if (id === "piercing") return [
    { id: "focus", icon: "↠", name: "聚束磁轨", desc: "保持单束射击，进一步提高伤害与贯穿能力。" },
    { id: "split", icon: "⋙", name: "双轨齐射", desc: "同时发射两束窄角磁轨弹，扩大覆盖面。" }
  ];
  return [];
}

function chooseUpgrade(u) {
  gameAudio?.play("upgrade");
  if (u.id === "rapid") delete state.modules.gunDisabled;
  state.modules[u.id] = level(u.id) + 1;
  state.pendingLevelUps = Math.max(0, state.pendingLevelUps - 1);
  syncSwarm();
  const droneId = u.id === "rapid" ? "gun" : u.id;
  const displayLevel = effects.droneLevel(state.modules, droneId);
  // v0.10: the old per-drone research Lv3 gate is gone with that system; the
  // Lv.10 breakthrough choice itself keeps its previous rules (需求 §2/§26.1).
  if (displayLevel === 10 && ["missile", "piercing"].includes(droneId) && !state.breakthroughs[droneId]) {
    const options = breakthroughOptions(droneId);
    if (options.length) return { weapon: droneId, breakthrough: options };
  }
  state.mode = state.upgradeReturnMode || "combat";
  state.nextUpgradeAt = state.visualTime + 15;
  showToast(level(u.id) === 1 && u.id !== "rapid" ? "新机加入蜂群" : "专机武器升级");
  presentation.updateHud();
  return { weapon: droneId, breakthrough: null };
}

function chooseBreakthrough(weaponId, choice) {
  state.breakthroughs[weaponId] = choice.id;
  state.mode = state.upgradeReturnMode || "combat";
  state.nextUpgradeAt = state.visualTime + 15;
  showToast((effects.droneIdentity(weaponId)?.name || weaponId) + " · " + choice.name);
  const picks = state.pendingLevelUps > 0 ? prepareLevelUp() : null;
  presentation.updateHud();
  return picks;
}

function enterStation() {
  gameAudio?.play("station");
  state.mode = "station"; state.timer = 0; state.enemies = []; state.boss = null; state.drops = [];
  presentation.hideBoss();
  longterm.bankRisk(state.longtermRun); state.disabledCars = {};
  // 到站维修分层 (需求 §17): base ×(1+H4+R2), repair car (12+R3+大修%)×(1+R1+R5),
  // then the whole sum ×维修工程. H4 and the research part work without a car.
  const S = state.runStats || {};
  let heal = (25 + level("repair") * 18) * (S.stationBaseMul ?? 1);
  if (S.repairCar) heal += (S.repairCar.flat + S.repairCar.overhaulPct * state.maxTrainHp) * S.repairCar.mul;
  const beforeHeal = state.trainHp;
  state.trainHp = Math.min(state.maxTrainHp, state.trainHp + heal * (S.repairMul ?? 1));
  state.effectiveRepair = (state.effectiveRepair || 0) + (state.trainHp - beforeHeal);
  state.shieldReady = !!level("shield"); state.selectedUpgrade = null;
  state.rerollUsed = false;
  const data = {
    station: state.station,
    picks: rollStationUpgrades(),
    rerollAffordable: state.scrap >= 15,
    trainLength: state.trainLength,
    secured: state.longtermRun?.banked || null,
  };
  presentation.updateHud();
  return data;
}

function rollStationUpgrades() {
  return [...stationUpgradePool].sort(() => Math.random() - .5).slice(0, 3);
}

function selectStationUpgrade(u) {
  state.selectedUpgrade = u;
}

function rerollStation() {
  if (state.rerollUsed || state.scrap < 15 || state.mode !== "station") return null;
  state.scrap -= 15; state.rerollUsed = true;
  const picks = rollStationUpgrades();
  showToast("补给重新编排");
  return picks;
}

function departStation() {
  const u = state.selectedUpgrade;
  if (!u || state.mode !== "station") return null;
  state.modules[u.id] = level(u.id) + 1;
  if (u.id === "armor") { state.maxTrainHp += 35; state.trainHp = Math.min(state.maxTrainHp, state.trainHp + 35); }
  if (u.id === "cargo") state.trainLength++;
  if (u.id === "shield") state.shieldReady = true;
  state.station++; state.selectedUpgrade = null;
  return prepareRouteEvent();
}

function extractRun() {
  if (state.mode !== "station") return null;
  return settleFinish("extracted");
}

// Structured damage rows shared by the DOM result panel and the canvas result.
function damageSummary() {
  const fmt = n => Number((n || 0).toFixed(1)).toString();
  const drones = Object.entries(state.weaponStats)
    .filter(([id, v]) => !id.startsWith("train-") && (v.volleys || v.damage))
    .sort((a, b) => (b[1].damage || 0) - (a[1].damage || 0))
    .map(([id, v]) => ({
      label: (effects.droneIdentity(id)?.name || id) + (id.startsWith("escort") ? " " + (Number(id.slice(6)) + 1) : ""),
      damage: fmt(v.damage),
    }));
  const bonds = effects.bondStates(state.modules).map(b => {
    const v = state.bondStats[b.id] || { damage: 0, kills: 0, casts: 0, maxLevel: 0 };
    return {
      name: b.name,
      stage: b.active ? "Lv." + b.level : v.casts ? "已失效 · 最高 Lv." + v.maxLevel : "未激活",
      damage: fmt(v.damage),
      casts: v.casts,
      kills: v.kills,
    };
  });
  return { drones, bonds, train: fmt(state.trainDamage), pointDefense: fmt(state.weaponStats?.["train-point-defense"]?.damage), effectiveRepair: fmt(state.effectiveRepair) };
}

export { settleFinish, prepareContractChoice, chooseContract, prepareRouteEvent, prepareLevelUp, breakthroughOptions, chooseUpgrade, chooseBreakthrough, enterStation, rollStationUpgrades, selectStationUpgrade, rerollStation, departStation, extractRun, damageSummary, eventIntel };
