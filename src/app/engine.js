"use strict";
// DOM-free game engine: state construction, the update step and the frame
// step live here so both presentation hosts can drive the same simulation -
// the web page (game.js + DOM overlays) and the canvas-only host used by the
// mini-game builds (canvas-host.js). Anything that paints or queries the
// document goes through the presentation hook object below; each host
// replaces those hooks with its own implementation before the first frame.

import "../core/audio.js";
import "../core/balance.js";
import "../core/motion.js";
import "../core/progression.js";
import "../core/combat-effects.js";
import "../core/control.js";
import "../core/route-events.js";
import "../core/run-record.js";
import "../meta/expedition.js";
import "../meta/longterm.js";
import { canvas, W, H, resizeSurface } from "../view/surface.js";
import { draw, setRegionGround } from "../view/render.js";
import { ensureCombatArt } from "../view/atlas.js";
import { WORLD_SPEED, cameraView, updateCamera, advanceWorld, carPosition, droneBounds } from "../sim/world.js";
import { showToast, updateParticles } from "../sim/fx.js";
import { spawnWave, spawnEnemy } from "../sim/spawn.js";
import { stepEnemy, updateHostileShots } from "../sim/enemies.js";
import { applyResearchProfile, pointDefenseTick, fireRailgun, updateShots, bladePositions, updateArsenal } from "../sim/weapons.js";
import { releaseCarSuppression, collideTrain, nearestTarget, bladeHuntTarget, damageTarget, normalStatsFor, bondStatsFor, areaHit, ricochetBurst, killEnemy, killBoss, applyTrainDamage, healTrain } from "../sim/combat.js";
import { syncSwarm, updateSwarm, beginRoute, pulse, settleLongterm } from "../sim/run.js";
import { stationCenter, stationTurrets, startDocking, updateDocking } from "../sim/docking.js";
import { upgradePool, experiencePool } from "../sim/station.js";
import { settleFinish, prepareLevelUp, failExpeditionNode } from "./flow-logic.js";

// Presentation hooks, replaced by each host. Defaults are inert so a bare
// boot (tests, headless smoke) can run the simulation without a surface.
export const presentation = {
  updateHud() {},
  resetJoystick() {},
  toast() {},
  combo() {},
  showBoss() {},
  hideBoss() {},
  hideLevelUp() {},
  renderLevelUp() {},
  renderStation() {},
  renderResult() {},
  runReset() {},
  showMap() {},
  hideMap() {},
  encounterStart() {},
};

const requireModule = (file, value) => { if (!value) throw new Error(file + " 未加载"); return value; };
const gameAudio = requireModule("audio.js", window.EndlessRailsAudio).createAudio(window);
let audioTrainHp = 100;
const motion = requireModule("motion.js", window.EndlessRailsMotion);
const balance = requireModule("balance.js", window.EndlessRailsBalance);
const progression = requireModule("progression.js", window.EndlessRailsProgression);
const effects = requireModule("combat-effects.js", window.EndlessRailsCombatEffects);
const control = requireModule("control.js", window.EndlessRailsControl);
const routeEvents = requireModule("route-events.js", window.EndlessRailsRouteEvents);
const runRecord = requireModule("run-record.js", window.EndlessRailsRunRecord);
const expedition = requireModule("expedition.js", window.EndlessRailsExpedition);
const longterm = requireModule("longterm.js", window.EndlessRailsLongterm);
const metaStorage = longterm.gameStorage ? longterm.gameStorage(window) : null;

const state = { metaProfile: longterm.loadMeta(metaStorage), expeditionPlan: null, longtermRun: null, metaSettlement: null, metaSettled: false, disabledCars: {}, breakthroughs: {}, cameraZoom: 1, targetCameraZoom: 1, pointDefenseClock: 0, nextUpgradeAt: 0, upgradeReturnMode: "combat", hostileShots: [], weaponStats: {}, bondStats: {}, worldDistance: 0, comboFxAt: -1, swarm: [], routeElapsed: 0, docking: null, zones: [], weaponFx: [], weaponClocks: {}, mode: "menu", visualTime: 0, paused: false, commandRing: null, commandRingLife: 0, runSeed: 1, activeEvent: null, activeContract: null, activeExpedition: null, expeditionNode: null, routeModifiers: { routeDistance: 60, enemySpeed: 1, enemyHp: 1, eliteChance: .07, coreChance: 1, rewardMultiplier: 1, scrapMultiplier: 1, weather: "clear" }, record: runRecord.loadRecord(metaStorage), escortClock: .2, eventChoices: [], contractChoices: [], rerollUsed: false, coreHitCounter: 0, station: 1, timer: 60, maxTrainHp: 100, trainHp: 100, scrap: 0, kills: 0, combo: 0, bestCombo: 0, score: 0, droneLevel: 1, trainLength: balance.START_TRAIN_LENGTH, fireClock: 0, missileClock: 0, spawnClock: .2, pulseClock: 0, railClock: 0, hurtFlash: 0, shake: 0, moveInput: { x: 0, y: 0 }, drone: { id: "command", x: 240, y: 300, moveSpeed: control.DRONE_MOVE_SPEED, flash: 0 }, train: { x: W / 2, y: H / 2 }, enemies: [], shots: [], particles: [], texts: [], selectedUpgrade: null, modules: {}, boss: null, shieldReady: false, ...progression.createProgression({ routeDistanceTotal: 60 }) };
const level = id => state.modules[id] || 0;
const carEnabled = id => !!state.expeditionPlan?.cars?.includes(id) && !state.disabledCars?.[id];

function beginRun(plan) {
  if (window.EndlessRailsCloud && !window.EndlessRailsCloud.canStart()) { window.EndlessRailsCloud.open(); return; }
  state.record = runRecord.loadRecord(metaStorage);
  state.metaProfile = longterm.loadMeta(metaStorage);
  state.expeditionPlan = plan || longterm.planFor(state.metaProfile);
  setRegionGround(state.expeditionPlan?.regionId || "wasteland");
  ensureCombatArt();
  state.longtermRun = longterm.createRun(state.metaProfile, state.expeditionPlan);
  state.activeExpedition = null; state.expeditionNode = null;
  state.metaSettlement = null; state.metaSettled = false; state.settlementRetryAt = 0; state.disabledCars = {}; state.breakthroughs = {}; state.cameraZoom = 1; state.targetCameraZoom = 1; state.pointDefenseClock = 0; state.trainDamage = 0; state.effectiveRepair = 0;
  // v0.10: attributes freeze into a per-run snapshot at departure (需求 §14.3/§17).
  state.runStats = state.longtermRun.stats;
  state.emergencyReserveUsed = false; state.fieldRepairClock = 0;
  const startHp = Math.round(state.runStats.maxHp);
  const seed = routeEvents.createSeed(Date.now());
  Object.assign(state, { nextUpgradeAt: 0, upgradeReturnMode: "combat", hostileShots: [], weaponStats: {}, bondStats: {}, worldDistance: 0, comboFxAt: -1, swarm: [], routeElapsed: 0, docking: null, zones: [], weaponFx: [], weaponClocks: {}, mode: "contractChoice", visualTime: 0, paused: false, runSeed: seed, activeEvent: null, activeContract: null, routeModifiers: { routeDistance: 60, enemySpeed: 1, enemyHp: 1, eliteChance: .07, coreChance: 1, rewardMultiplier: 1, scrapMultiplier: 1, weather: "clear" }, station: 1, timer: 60, maxTrainHp: startHp, trainHp: startHp, scrap: 0, kills: 0, combo: 0, bestCombo: 0, score: 0, droneLevel: 1, trainLength: state.expeditionPlan?.trainLength || balance.START_TRAIN_LENGTH, fireClock: 0, escortClock: .2, missileClock: 0, spawnClock: .2, pulseClock: 0, railClock: 0, hurtFlash: 0, shake: 0, coreHitCounter: 0, enemies: [], shots: [], particles: [], texts: [], selectedUpgrade: null, modules: {}, boss: null, shieldReady: false, commandRing: null, rerollUsed: false, ...progression.createProgression({ routeDistanceTotal: 60 }) });
  state.train.x = W / 2; state.train.y = H / 2;
  Object.assign(state.drone, { x: W / 2 + 45, y: H / 2 - 40, moveSpeed: control.DRONE_MOVE_SPEED, flightAngle: -Math.PI / 2, direction: 0, bank: 0, thrust: 0, vx: 0, vy: 0 });
  presentation.resetJoystick();
  presentation.runReset();
  presentation.updateHud();
}

// v0.12 alpha.1: start one node of a persistent expedition (规划 §5/§8). Like
// beginRun it freezes a fresh departure snapshot (stats from the CURRENT
// applied train/research), but the in-run build, growth and normalized HP come
// back from the expedition; combat stays the current 60-second timed segment.
function beginEncounter(plan, exp, node) {
  if (window.EndlessRailsCloud && !window.EndlessRailsCloud.canStart()) { window.EndlessRailsCloud.open(); return; }
  state.record = runRecord.loadRecord(metaStorage);
  state.metaProfile = longterm.loadMeta(metaStorage);
  state.expeditionPlan = plan || longterm.planFor(state.metaProfile);
  setRegionGround(state.expeditionPlan?.regionId || exp.regionId || "wasteland");
  ensureCombatArt();
  state.longtermRun = longterm.createRun(state.metaProfile, state.expeditionPlan);
  state.longtermRun.riskBlueprints = [...(exp.riskBlueprints || [])];
  state.metaSettlement = null; state.metaSettled = false; state.settlementRetryAt = 0; state.disabledCars = {}; state.cameraZoom = 1; state.targetCameraZoom = 1; state.pointDefenseClock = 0; state.trainDamage = 0; state.effectiveRepair = 0;
  state.activeExpedition = exp; state.expeditionNode = node;
  state.runStats = state.longtermRun.stats;
  state.emergencyReserveUsed = !!exp.emergencyReserveUsed; state.fieldRepairClock = 0;
  const maxHp = Math.max(1, Math.round(state.runStats.maxHp));
  const startHp = Math.max(1, Math.round(Math.min(1, Math.max(0.05, exp.trainHpPct ?? 1)) * maxHp));
  const build = exp.build || {}, growth = exp.growth || {};
  const seed = routeEvents.createSeed(exp.seed + ":" + node.id + ":" + exp.summary.attempts);
  // Layer drives the difficulty stage; capped at 4 so the legacy station-5
  // boss trigger never fires inside an expedition node (alpha.1 has no boss).
  const stage = Math.max(1, Math.min(4, Math.ceil((node.layer / expedition.LAYER_COUNT) * 4)));
  Object.assign(state, { nextUpgradeAt: 0, upgradeReturnMode: "combat", hostileShots: [], weaponStats: {}, bondStats: {}, worldDistance: 0, comboFxAt: -1, swarm: [], routeElapsed: 0, docking: null, zones: [], weaponFx: [], weaponClocks: {}, mode: "combat", visualTime: 0, paused: false, runSeed: seed, activeEvent: null, activeContract: exp.contract || expedition.NEUTRAL_CONTRACT, routeModifiers: { routeDistance: 60, enemySpeed: 1, enemyHp: 1, eliteChance: .07, coreChance: 1, rewardMultiplier: 1, scrapMultiplier: 1, weather: "clear" }, station: stage, timer: 60, maxTrainHp: maxHp, trainHp: startHp, scrap: 0, kills: 0, combo: 0, bestCombo: 0, score: 0, droneLevel: 1, trainLength: state.expeditionPlan?.trainLength || balance.START_TRAIN_LENGTH, fireClock: 0, escortClock: .2, missileClock: 0, spawnClock: .2, pulseClock: 0, railClock: 0, hurtFlash: 0, shake: 0, coreHitCounter: 0, enemies: [], shots: [], particles: [], texts: [], selectedUpgrade: null, modules: { ...build.modules }, boss: null, shieldReady: false, commandRing: null, rerollUsed: false, breakthroughs: { ...build.breakthroughs }, ...progression.createProgression({ routeDistanceTotal: 60, experience: growth.experience, experienceToNext: growth.experienceToNext, level: growth.level, pendingLevelUps: growth.pendingLevelUps, coreStacks: build.coreStacks }) });
  state.train.x = W / 2; state.train.y = H / 2;
  Object.assign(state.drone, { x: W / 2 + 45, y: H / 2 - 40, moveSpeed: control.DRONE_MOVE_SPEED, flightAngle: -Math.PI / 2, direction: 0, bank: 0, thrust: 0, vx: 0, vy: 0 });
  presentation.resetJoystick();
  presentation.encounterStart();
  beginRoute(expedition.NEUTRAL_EVENT);
  const override = expedition.ROUTE_OVERRIDES[node.type] || {};
  if (override.enemyHp) state.routeModifiers.enemyHp *= override.enemyHp;
  if (override.eliteChance) state.routeModifiers.eliteChance *= override.eliteChance;
  presentation.updateHud();
}

function update(dt, refreshHud = true) {
  gameAudio?.tick(state.mode, state.paused);
  if (state.trainHp < audioTrainHp) gameAudio?.play("hurt");
  audioTrainHp = state.trainHp;
  if (state.paused || state.mode === "levelup") return;
  if (state.settlementRetryAt && Date.now() < state.settlementRetryAt) return;
  if (state.mode === "docking") { updateDocking(dt); if (refreshHud) presentation.updateHud(); return; }
  if (state.mode !== "combat") return;
  state.visualTime += dt;
  updateCamera(dt);
  advanceWorld(WORLD_SPEED * dt);
  state.routeElapsed += dt;
  state.routeDistance = progression.advanceRoute(state, dt).routeDistance;
  state.timer = state.routeDistance;
  for (const key of ["fireClock", "escortClock", "missileClock", "spawnClock"]) state[key] -= dt;
  state.pulseClock = Math.max(0, state.pulseClock - dt);
  state.railClock += dt;
  state.hurtFlash = Math.max(0, state.hurtFlash - dt);
  state.shake = Math.max(0, state.shake - dt * 20);
  const previousDrone = { x: state.drone.x, y: state.drone.y };
  Object.assign(state.drone, control.stepDrone(state.drone, state.moveInput, state.drone.moveSpeed, dt, droneBounds()));
  Object.assign(state.drone, effects.flightPose(state.drone, (state.drone.x - previousDrone.x) / Math.max(dt, .001), (state.drone.y - previousDrone.y) / Math.max(dt, .001), dt));
  state.drone.flash = Math.max(0, (state.drone.flash || 0) - dt);
  updateSwarm(dt);
  state.commandRing = control.advanceCommandRing(state.commandRing, dt);
  state.drops = progression.expireDrops(state.drops, dt);
  const pickupRadius = (28 + level("magnet") * 16) * (state.runStats?.pickupRadiusMul ?? 1);
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const drop = state.drops[i];
    if (Math.hypot(drop.x - state.drone.x, drop.y - state.drone.y) < pickupRadius) {
      if (drop.type === "meta-tech") { longterm.awardRisk(state.longtermRun, "components", 1); state.drops.splice(i, 1); showToast("技术组件已回收 · 风险资源"); continue; }
      // bio-scan was retired into migration compensation (需求 §21/§24.3):
      // the drop stays a flat 1 data, no account-state read mid-combat.
      if (drop.type === "research-data") { longterm.awardRisk(state.longtermRun, "data", 1); state.drops.splice(i, 1); showToast("研究数据已回收 · 风险资源"); continue; }
      if (drop.type === "repair-kit") { healTrain(12); state.drops.splice(i, 1); showToast("现场维修 +12"); continue; }
      if (drop.type === "blueprint") { longterm.addBlueprintRisk(state.longtermRun, drop.blueprintId); state.drops.splice(i, 1); showToast("发现蓝图 · " + (longterm.blueprintById(drop.blueprintId)?.name || "未知")); continue; }
      const picked = progression.collectCore(state, drop.type);
      Object.assign(state, picked.state); state.scrap += picked.scrap; state.drops.splice(i, 1);
      showToast(picked.collected ? "武器核心已装配" : "核心转化为废料");
    }
  }
  // Remove corpses every frame, keeping collision cost proportional to the live cap.
  state.enemies = state.enemies.filter(e => !e.dead);
  const curve = balance.difficultyAt(state.station, state.routeElapsed, state.routeDistanceTotal);
  if (state.spawnClock <= 0) {
    const density = state.expeditionPlan?.region?.density || 1, batch = Math.max(1, Math.ceil(curve.batch * density)), cap = Math.ceil(curve.cap * density);
    for (let i = 0; i < batch && state.enemies.length < cap; i++) spawnEnemy(i * .1);
    state.spawnClock = curve.interval / Math.max(.75, density) * (state.activeEvent?.id === "freight" ? 1.2 : 1);
  }
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (e.delay > 0) { e.delay -= dt; continue; }
    stepEnemy(e, dt);
    e.hit = Math.max(0, e.hit - dt * 5);
    if (e.kind !== "climber" && Math.hypot(state.train.x - e.x, state.train.y - e.y) < 42) collideTrain(e);
  }
  if (state.station === 5 && state.routeElapsed >= 22 && !state.boss) {
    state.boss = { hp: 260, maxHp: 260, x: W / 2 + 105, y: -40, r: 34, speed: 44, hit: 0, summon: 3.2, dead: false };
    presentation.showBoss(); showToast("感染巨兽接近 · 最后防线");
  }
  if (state.boss && !state.boss.dead) {
    const b = state.boss; b.hit = Math.max(0, b.hit - dt * 4); b.summon -= dt;
    Object.assign(b, motion.stepChaser(b, dt, state.train, WORLD_SPEED * .15));
    if (b.summon <= 0) {
      for (let i = 0; i < 3 && state.enemies.length < curve.cap; i++) spawnEnemy(i * .15);
      b.summon = 6; showToast("感染巨兽召集尸群");
    }
    if (Math.hypot(b.x - state.train.x, b.y - state.train.y) < 55) {
      applyTrainDamage(7 * dt * (state.runStats?.damageTakenMul ?? 1) * (state.activeContract?.trainDamageMultiplier ?? 1)); state.hurtFlash = .1;
    }
  }
  updateHostileShots(dt);
  // 行进抢修 (需求 §10): only effective combat time accumulates; the remainder
  // carries across segments within the same run and resets on departure.
  if (state.runStats?.fieldRepairPer10s) {
    state.fieldRepairClock = (state.fieldRepairClock || 0) + dt;
    while (state.fieldRepairClock >= 10) {
      state.fieldRepairClock -= 10;
      healTrain(state.runStats.fieldRepairPer10s);
    }
  }
  pointDefenseTick(dt);
  const trainProfile = effects.trainWeaponProfile({ modules: state.modules });
  if (trainProfile.railgunDamage && state.railClock > trainProfile.railgunInterval) { fireRailgun(trainProfile); state.railClock = 0; }
  updateArsenal(dt);
  updateShots(dt); updateParticles(dt);
  if (state.trainHp <= 0) {
    const resultData = state.activeExpedition ? failExpeditionNode() : settleFinish(false);
    if (resultData) presentation.renderResult(resultData);
    return;
  }
  // alpha.1 expedition nodes always end in a normal arrival dock; the legacy
  // station-5 final defense only belongs to the five-segment run.
  if (state.routeDistance <= 0) startDocking(state.station === 5 && !state.activeExpedition);
  else if (progression.shouldOfferUpgrade(state)) {
    const picks = prepareLevelUp();
    if (picks) presentation.renderLevelUp(picks);
  }
  // Every route reaches the defense perimeter after exactly 60 seconds.
  if (refreshHud) presentation.updateHud();
}

// Shared frame step for both hosts: substeps preserve wall-clock pacing at
// 20/30 FPS and keep collision steps small; HUD refresh is throttled to 10Hz.
let last = performance.now(), lastHud = 0, lastDrawMode = null;
function frameStep(now) {
  const dt = Math.max(0, Math.min(.25, (now - last) / 1000)); last = now;
  const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
  for (let i = 0; i < steps; i++) update(dt / steps, false);
  if (now - lastHud >= 100) { presentation.updateHud(); lastHud = now; }
  if (!state.paused && (["combat", "docking"].includes(state.mode) || lastDrawMode !== state.mode)) { draw(); lastDrawMode = state.mode; }
}

// box: the battlefield's CSS-pixel size on screen, supplied by the host from
// its layout (the canvas UI knows where the arena sits; no DOM query needed).
function resizeBattlefield(box) {
  if (!box || !box.width || !box.height) return;
  const scale = 390 / Math.min(box.width, box.height), nextWidth = Math.round(box.width * scale), nextHeight = Math.round(box.height * scale);
  if (nextHeight === H && nextWidth === W) return;
  const dx = (nextWidth - W) / 2, dy = (nextHeight - H) / 2;
  resizeSurface(nextWidth, nextHeight); canvas.width = nextWidth; canvas.height = nextHeight; presentation.resetJoystick();
  const objects = [state.train, state.drone, ...state.swarm, ...state.enemies, ...state.shots, ...state.hostileShots, ...state.zones, ...state.drops, ...state.particles, ...state.texts, ...state.weaponFx];
  if (state.boss) objects.push(state.boss);
  for (const item of objects) { if (Number.isFinite(item.x)) item.x += dx; if (Number.isFinite(item.sx)) item.sx += dx; if (Number.isFinite(item.tx)) item.tx += dx; if (Number.isFinite(item.y)) item.y += dy; if (Number.isFinite(item.sy)) item.sy += dy; if (Number.isFinite(item.ty)) item.ty += dy; }
  const bounds = droneBounds(), view = cameraView();
  state.drone.x = Math.max(bounds.left, Math.min(bounds.right, state.drone.x)); state.drone.y = Math.max(bounds.top, Math.min(bounds.bottom, state.drone.y));
  for (const d of state.swarm) { d.x = Math.max(view.left + 18, Math.min(view.right - 18, d.x)); d.y = Math.max(view.top + 18, Math.min(view.bottom - 18, d.y)); d.huntTarget = null; d.huntClock = 0; }
  if (state.paused) draw();
}

export { state, metaStorage, gameAudio, motion, balance, progression, effects, control, routeEvents, runRecord, expedition, longterm, level, carEnabled, beginRun, beginEncounter, update, frameStep, resizeBattlefield, syncSwarm, pulse, beginRoute, cameraView, carPosition, droneBounds, stationCenter, stationTurrets, bladePositions, applyResearchProfile, upgradePool, experiencePool };
