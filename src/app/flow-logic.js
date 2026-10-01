"use strict";
// DOM-free screen-flow logic: every transition the battle flow can take
// (contract -> route -> combat -> levelup -> station -> result) is computed
// here and returned as plain data. The web panels (flows.js) and the canvas
// host (canvas-host.js) both consume this module and present the result on
// their own surface - DOM overlays or canvas screens. Nothing here may touch
// the document; presentation goes through engine.presentation hooks.

import { state, level, carEnabled, gameAudio, longterm, expedition, routeEvents, effects, runRecord, metaStorage, presentation, beginEncounter } from "./engine.js";
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
  // 情报蓝图同样按出发快照读取 (需求 §20.1 / 修订方案 §4)，不查询局内账号。
  return state.runStats?.ownedBlueprints?.includes("radar-pulse")
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
  if (state.activeExpedition) { state.mode = "menu"; saveExpeditionContract(contract); presentation.showMap(); return null; }
  return prepareRouteEvent();
}

// -- v0.12 persistent expedition (规划 §6-§8/§12.1/§19) ----------------------------------------
// Every state change goes through one transaction: mutate a normalized copy,
// persist it, and only then let the game continue. Failures leave a pendingOp
// behind so a reload finishes (victory) or safely discards (interrupt) the
// half-settled node instead of replaying it.

function persistMeta(nextMeta, { quiet } = {}) {
  if (metaStorage) {
    if (!longterm.saveMeta(metaStorage, nextMeta)) { if (!quiet) showToast("存档写入失败 · 请重试"); return false; }
    state.metaProfile = nextMeta;
    window.EndlessRailsMetaUI?.refresh?.();
    return true;
  }
  // Headless/no-storage pages keep the whole flow alive on the in-memory
  // profile, exactly like the legacy settlement does (sim/run.js).
  state.metaProfile = nextMeta;
  return true;
}

// Fresh account state for transactions: the real storage when available,
// otherwise the in-memory profile persistMeta keeps updated.
const currentMeta = () => (metaStorage ? longterm.loadMeta(metaStorage) : state.metaProfile);

function createExpedition() {
  const meta = currentMeta();
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const exp = expedition.generateExpedition({ regionId: meta.selectedRegion || "wasteland", seed, startExpeditions: meta.totals.expeditions });
  // No L1 contract any more: departure itself clears the start node.
  const start = exp.nodes.find(node => node.layer === 1);
  if (start) exp.visitedIds.push(start.id);
  const next = longterm.normalizeMeta({ ...meta, activeExpedition: exp });
  if (!persistMeta(next)) return null;
  return next.activeExpedition;
}

function saveExpeditionContract(contract) {
  const meta = currentMeta();
  const exp = meta.activeExpedition;
  if (!exp || exp.status !== "active" || exp.contract) return;
  const copy = {};
  for (const field of ["id", "name", "description", "rewardMultiplier", "enemyHpMultiplier", "scrapMultiplier", "trainDamageMultiplier"]) copy[field] = contract[field];
  exp.contract = copy;
  // L1 departure: the start node is cleared by signing the contract.
  const start = exp.nodes.find(node => node.layer === 1);
  if (start && !exp.visitedIds.includes(start.id)) exp.visitedIds.push(start.id);
  if (persistMeta(longterm.normalizeMeta({ ...meta, activeExpedition: exp }))) state.activeExpedition = state.metaProfile.activeExpedition;
}

// Resume path at departure (规划 §6.3): finish a half-settled victory, roll
// back an interrupted attempt (no failure payout), then hand back the meta.
function resumeExpeditionMeta() {
  let meta = currentMeta();
  const exp = meta.activeExpedition;
  if (!exp) return meta;
  if (exp.pendingOp) {
    if (exp.pendingOp.kind === "victory") { const next = applyExpeditionVictory(); if (next) meta = next; }
    else { const next = applyExpeditionFailure(); if (next) meta = next; }
  } else if (exp.checkpoint) {
    expedition.applyCheckpoint(exp, exp.checkpoint);
    exp.checkpoint = null;
    persistMeta(longterm.normalizeMeta({ ...meta, activeExpedition: exp }), { quiet: true });
  }
  return currentMeta();
}

function encounterProgress() {
  const total = Math.max(1, state.routeDistanceTotal || 1);
  return Math.max(0, Math.min(1, 1 - Math.max(0, state.routeDistance || 0) / total));
}

function tokenAward(node) {
  const base = expedition.NODE_TYPES[node?.type]?.tokens || 0;
  if (!base) return 0;
  return Math.floor(base * (state.activeExpedition?.contract?.scrapMultiplier || 1));
}

function snapshotEncounter(exp) {
  exp.build = { modules: { ...state.modules }, coreStacks: { ...state.coreStacks }, breakthroughs: { ...state.breakthroughs } };
  exp.growth = { experience: state.experience, experienceToNext: state.experienceToNext, level: state.level, pendingLevelUps: state.pendingLevelUps };
  exp.trainHpPct = Math.max(0, Math.min(1, state.trainHp / Math.max(1, state.maxTrainHp)));
  exp.emergencyReserveUsed = !!state.emergencyReserveUsed;
  exp.tokens += tokenAward(state.expeditionNode);
  exp.riskBlueprints = [...(state.longtermRun?.riskBlueprints || [])];
  exp.summary.kills += state.kills;
}

function startExpeditionNode(nodeId) {
  const meta = currentMeta();
  const exp = meta.activeExpedition;
  if (!exp || exp.status !== "active") return { error: "expedition" };
  if (exp.pendingOp || exp.checkpoint) return { error: "attempt" };
  const node = expedition.nodeById(exp, nodeId);
  const reachable = expedition.reachableNext(exp);
  if (!node || !reachable.some(candidate => candidate.id === nodeId)) return { error: "unreachable" };
  const plan = longterm.planFor(meta);
  const stats = longterm.buildStats(meta);
  let entry = exp.nodeLedger.find(item => item.nodeId === nodeId);
  if (!entry) {
    entry = expedition.makeLedgerEntry(nodeId, expedition.budgetFor(node, plan.region?.reward || 1, stats), stats.failureKeep ?? 0.5);
    exp.nodeLedger.push(entry);
  }
  if (exp.nodeLedger.length > expedition.MAX_LEDGER) return { error: "ledger" };
  exp.lockedNodeId = nodeId;
  exp.checkpoint = expedition.checkpointFor(exp, nodeId);
  exp.summary.attempts++;
  if (!persistMeta(longterm.normalizeMeta({ ...meta, activeExpedition: exp }))) return { error: "save" };
  beginEncounter(plan, exp, node);
  return { ok: true };
}

// Phase 1 writes the victory into the expedition with a pendingOp; phase 2
// (applyExpeditionVictory) credits the payout and clears it. A crash between
// the two leaves a resumable "won but unclaimed" node, never a replayable one.
function finishExpeditionNode() {
  const exp = state.activeExpedition;
  if (!exp) return null;
  const node = state.expeditionNode;
  const entry = exp.nodeLedger.find(item => item.nodeId === node.id);
  // Idempotency: a settled node never pays, awards tokens or snapshots twice.
  if (entry?.done || exp.visitedIds.includes(node.id) || exp.pendingOp) return null;
  const payout = entry ? expedition.victoryPayout(entry) : { scrap: 0, data: 0, components: 0 };
  snapshotEncounter(exp);
  if (!exp.visitedIds.includes(node.id)) exp.visitedIds.push(node.id);
  exp.checkpoint = null;
  // Completing the node frees the layer lock; the next layer opens (§2.2).
  if (exp.lockedNodeId === node.id) exp.lockedNodeId = null;
  const isFinal = node.type === "final";
  if (isFinal) exp.status = "completed";
  exp.pendingOp = { kind: "victory", nodeId: node.id, payout, tokens: exp.tokens, hpPct: exp.trainHpPct, final: isFinal };
  if (isFinal) {
    const region = longterm.regionById(exp.regionId);
    exp.pendingOp.finalSettle = {
      regionReward: region?.reward || 1,
      startExpeditions: exp.startExpeditions,
      scrapYieldMul: state.runStats?.scrapYieldMul ?? 1,
      dataYieldMul: state.runStats?.dataYieldMul ?? 1,
      componentYieldMul: state.runStats?.componentYieldMul ?? 1,
      riskBlueprints: [...exp.riskBlueprints],
    };
  }
  const meta = currentMeta();
  if (!persistMeta(longterm.normalizeMeta({ ...meta, activeExpedition: exp }))) {
    state.settlementRetryAt = Date.now() + 2000;
    showToast("存档写入失败 · 请重试结算");
    return null;
  }
  return applyExpeditionVictory();
}

function applyExpeditionVictory() {
  const meta = currentMeta();
  const exp = meta.activeExpedition;
  const op = exp?.pendingOp;
  if (!exp || op?.kind !== "victory") return null;
  let next = meta, mapSettlement = { gained: { ...op.payout }, blueprints: [] };
  // Every victory first credits the node budget B minus prior failure
  // payouts (§7.1); the final node then adds the whole-map clear bonus on
  // top through settleRun.
  next = longterm.normalizeMeta({ ...next, resources: { scrap: next.resources.scrap + op.payout.scrap, components: next.resources.components + op.payout.components, data: next.resources.data + op.payout.data } });
  if (op.final) {
    // Whole-map settlement runs exactly once through the legacy settleRun
    // (dedup, totals, region unlock and the 30/3/1 clear bonus).
    const settle = op.finalSettle;
    const syntheticRun = {
      id: exp.id,
      startExpeditions: settle.startExpeditions,
      plan: { regionId: exp.regionId },
      stats: { scrapYieldMul: settle.scrapYieldMul, dataYieldMul: settle.dataYieldMul, componentYieldMul: settle.componentYieldMul },
      banked: { scrap: 0, components: 0, data: 0 },
      risk: { scrap: 0, components: 0, data: 0 },
      bankedBlueprints: [],
      riskBlueprints: [...settle.riskBlueprints],
      regionReward: settle.regionReward,
      stationsBanked: 0, eliteKills: 0, specialKills: 0,
    };
    const settlement = longterm.settleRun(next, syntheticRun, "won");
    next = settlement.meta;
    mapSettlement = {
      gained: {
        scrap: op.payout.scrap + settlement.gained.scrap,
        components: op.payout.components + settlement.gained.components,
        data: op.payout.data + settlement.gained.data,
      },
      blueprints: settlement.blueprints || [],
    };
    state.record = runRecord.mergeRecord(state.record, {
      stations: 5, kills: exp.summary.kills, scrap: Math.floor(exp.tokens), bestCombo: state.bestCombo || 0,
      eventId: null, contractId: exp.contract?.id || null, modules: { ...exp.build.modules }, cores: { ...exp.build.coreStacks },
      damageByWeapon: JSON.parse(JSON.stringify(state.weaponStats || {})), damageByBond: JSON.parse(JSON.stringify(state.bondStats || {})),
      trainDamage: state.trainDamage || 0, outcome: "won",
    });
    runRecord.saveRecord(metaStorage, state.record);
  }
  next.activeExpedition.pendingOp = null;
  next = longterm.normalizeMeta(next);
  if (!persistMeta(next)) { state.settlementRetryAt = Date.now() + 2000; showToast("存档写入失败 · 请重试结算"); return null; }
  state.activeExpedition = next.activeExpedition;
  state.metaSettled = true;
  const payload = { outcome: "won", expeditionFinal: op.final, nodeFailure: false, settlement: mapSettlement, tokens: op.tokens, tokensGain: tokenAward(expedition.nodeById(exp, op.nodeId)), payout: op.payout };
  if (op.final) state.outcome = "won";
  return payload;
}

function failExpeditionNode() {
  const exp = state.activeExpedition;
  if (!exp) return null;
  const node = state.expeditionNode;
  const entry = exp.nodeLedger.find(item => item.nodeId === node.id && !item.done);
  const payout = entry ? expedition.failurePayout(entry, encounterProgress()) : { scrap: 0, data: 0, components: 0 };
  exp.summary.failures++;
  if (exp.checkpoint) expedition.applyCheckpoint(exp, exp.checkpoint);
  exp.checkpoint = null;
  exp.pendingOp = { kind: "failure", nodeId: node.id, payout };
  const meta = currentMeta();
  if (!persistMeta(longterm.normalizeMeta({ ...meta, activeExpedition: exp }))) {
    state.settlementRetryAt = Date.now() + 2000;
    showToast("存档写入失败 · 请重试结算");
    return null;
  }
  return applyExpeditionFailure();
}

function applyExpeditionFailure() {
  const meta = currentMeta();
  const exp = meta.activeExpedition;
  const op = exp?.pendingOp;
  if (!exp || op?.kind !== "failure") return null;
  let next = longterm.normalizeMeta({ ...meta, resources: { scrap: meta.resources.scrap + op.payout.scrap, components: meta.resources.components + op.payout.components, data: meta.resources.data + op.payout.data } });
  next.activeExpedition.pendingOp = null;
  next = longterm.normalizeMeta(next);
  if (!persistMeta(next)) return null;
  state.activeExpedition = next.activeExpedition;
  state.mode = "result";
  state.outcome = "lost";
  return { outcome: "lost", expeditionFinal: false, nodeFailure: true, settlement: { gained: { ...op.payout }, blueprints: [] }, tokens: exp.tokens, payout: op.payout };
}

function resetExpedition() {
  const meta = currentMeta();
  const exp = meta.activeExpedition;
  if (!exp) return false;
  let next = meta;
  if (exp.visitedIds.length > 0 && !meta.settledRunIds.includes(exp.id)) {
    const region = longterm.regionById(exp.regionId);
    const syntheticRun = {
      id: exp.id, startExpeditions: exp.startExpeditions, plan: { regionId: exp.regionId },
      stats: longterm.buildStats(meta),
      banked: { scrap: 0, components: 0, data: 0 }, risk: { scrap: 0, components: 0, data: 0 },
      bankedBlueprints: [], riskBlueprints: [...exp.riskBlueprints],
      regionReward: region?.reward || 1, stationsBanked: 0, eliteKills: 0, specialKills: 0,
    };
    next = longterm.settleRun(meta, syntheticRun, "extracted").meta;
  }
  const cleared = next.activeExpedition;
  cleared.status = "reset";
  cleared.checkpoint = null; cleared.pendingOp = null; cleared.lockedNodeId = null;
  next = longterm.normalizeMeta(next);
  return persistMeta(next);
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

export { settleFinish, prepareContractChoice, chooseContract, prepareRouteEvent, prepareLevelUp, breakthroughOptions, chooseUpgrade, chooseBreakthrough, enterStation, rollStationUpgrades, selectStationUpgrade, rerollStation, departStation, extractRun, damageSummary, eventIntel, createExpedition, resumeExpeditionMeta, startExpeditionNode, finishExpeditionNode, failExpeditionNode, resetExpedition };
