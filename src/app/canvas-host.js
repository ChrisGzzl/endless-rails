"use strict";
// Canvas-only host: boots the DOM-free engine against a single canvas with no
// document at all. The web page uses game.js + DOM overlays instead; this host
// is what the canvas smoke page (canvas.html) and the mini-game adapter run.
// The adapter installs its canvas on globalThis.__endlessRailsCanvas before
// this module evaluates, and mirrors touch events into the pointer handlers
// exposed on window.EndlessRailsCanvasHost.
//
// UI geometry note: the engine's surface keeps the battlefield's logical
// coordinate system (the 390-wide frame the simulation is tuned for, scaled
// by resizeBattlefield), while the HUD and flow screens draw in viewport CSS
// pixels - the same responsive frame the DOM version lays out in. drawOverlay
// scales the context so both share one physical canvas.

import { setSurface, ctx, canvas } from "../view/surface.js";
import { gameArt, setRegionGround } from "../view/atlas.js";
import { drawHome } from "../view/canvas-home.js";
import { state, presentation, beginRun, frameStep, pulse, level, longterm, runRecord, metaStorage, control, effects, gameAudio, upgradePool, experiencePool } from "./engine.js";
import { drawHud, drawCardListScreen, drawLevelUpScreen, drawStationScreen, drawResultScreen, drawPauseScreen, tickFx, setToast, setCombo, setStickVisual, overlayBackdrop, resetOverlayBackdrop } from "../view/canvas-ui.js";
import { chooseContract, prepareContractChoice, chooseUpgrade, chooseBreakthrough, selectStationUpgrade, rerollStation, departStation, settleFinish, prepareLevelUp, damageSummary } from "./flow-logic.js";
import { beginRoute } from "../sim/run.js";
import { upgradeBrief, scopeLabel } from "../sim/station.js";
import { inspectFleet, inspectRows, tabNote, pauseSummaryText } from "./telemetry.js";

const SCREEN_MODES = ["contractChoice", "routeChoice", "levelup", "station", "result"];
const host = {
  page: "battle",
  scroll: 0, contentHeight: 0, viewportHeight: 800,
  levelPicks: null, breakthrough: null, stationData: null, resultData: null,
  resultBuild: "", resultDamage: null, routeCards: null, resultScroll: 0, resultContentHeight: 0,
  pause: { unitIndex: 1, tab: "weapon", page: 0 }, pauseFleet: [], pauseRows: [], pauseNote: "", pauseSummary: "",
  meta: null, carDefs: [], unlockedCars: [], loadoutCars: [], researchRows: [], blueprintNames: {},
  trainSlots: 4, trainLength: 4, xpToNext: 1, trainUpgradeCost: 0, trainUpgradeComponents: 0,
  maxedTrain: false, canUpgradeTrain: false, regionMeta: null, regionTags: {}, blueprintText: "",
  audio: { music: true, sfx: true },
  version: "v0.9.0-rc.5",
};
const viewport = { w: 390, h: 680 };
const stick = { pointerId: null, center: null, radius: 36 };
let regions = [];

// -- host data assembly -------------------------------------------------------

// Same display copy the DOM research page shows (meta-ui.js compactDescriptions).
const RESEARCH_COPY = {
  rapid: "近程高频点射，提高射速与伤害。",
  missile: "远程追踪弹，高伤爆炸清理尸群。",
  incendiary: "投掷燃烧弹，在地面留下火墙。",
  ricochet: "中程能量球，反弹穿过尸群。",
  chain: "连锁电弧，密集目标伤害更高。",
  piercing: "远程磁轨弹，贯穿多个敌人。",
  scatter: "近程扇形霰弹，贴近尸群清扫。",
  blades: "近战持续切割，主动靠近尸群。",
};

function regionStatus(meta, regionId) {
  const region = longterm.regionById(regionId);
  if (!region) return { status: "已侦察", tag: "已侦察" };
  const st = meta.regions[regionId];
  const unlocked = !!st?.unlocked;
  const status = !unlocked ? "未知" : st.repaired ? "已修复" : st.clears > 0 ? "已完成" : "已侦察";
  return { status, tag: unlocked ? status : "未解锁" };
}

function refreshHostData() {
  const profile = state.metaProfile;
  host.meta = profile;
  const plan = longterm.planFor(profile);
  host.trainLength = plan.trainLength;
  host.trainSlots = longterm.trainSlots(profile);
  host.xpToNext = longterm.xpToNext(profile.train.level);
  const cost = longterm.trainUpgradeCost(profile);
  host.maxedTrain = !Number.isFinite(cost.scrap);
  host.trainUpgradeCost = host.maxedTrain ? 0 : cost.scrap;
  host.trainUpgradeComponents = cost.components;
  host.canUpgradeTrain = !host.maxedTrain
    && profile.resources.scrap >= cost.scrap && profile.resources.components >= cost.components;
  host.carDefs = (longterm.CAR_DEFS || []).map(car => ({ id: car.id, name: car.name, icon: car.icon, description: car.description, fixed: car.fixed }));
  host.unlockedCars = profile.unlockedCars || [];
  host.loadoutCars = (profile.loadout || []).map(id => longterm.CAR_DEFS?.find(c => c.id === id)?.name || id);
  host.researchRows = (longterm.RESEARCH_IDS || []).map(id => {
    const costData = longterm.researchCost(profile, id);
    const maxed = !Number.isFinite(costData);
    return {
      id, name: longterm.RESEARCH_NAMES?.[id] || id, level: profile.research[id] || 0,
      cost: maxed ? 0 : costData, maxed, desc: RESEARCH_COPY[id] || "研究等级影响对应无人机的长期性能。",
    };
  });
  const selectedRegion = profile.selectedRegion || "wasteland";
  const regionInfo = longterm.regionById(selectedRegion);
  host.regionMeta = regionInfo ? { ...regionInfo, ...regionStatus(profile, selectedRegion) } : null;
  host.regionTags = {};
  for (const region of (longterm.REGIONS || [])) host.regionTags[region.id] = regionStatus(profile, region.id).tag;
  host.blueprintNames = {};
  for (const id of profile.blueprints || []) {
    const bp = longterm.blueprintById(id);
    if (bp) host.blueprintNames[id] = bp.name;
  }
  host.blueprintText = (profile.blueprints || []).length
    ? (profile.blueprints || []).map(id => { const bp = longterm.blueprintById(id); return bp ? bp.name + "：" + bp.description : id; }).join("\n")
    : "暂无蓝图 · 击破精英或区域 Boss 后回收，到站锁定。";
  if (gameAudio?.getPreferences) host.audio = gameAudio.getPreferences();
}

function refreshPauseData() {
  host.pauseFleet = inspectFleet().map(d => ({ ...d }));
  if (host.pause.unitIndex >= host.pauseFleet.length) host.pause.unitIndex = Math.min(1, Math.max(0, host.pauseFleet.length - 1));
  const unit = host.pauseFleet[host.pause.unitIndex] || host.pauseFleet[0];
  host.pauseRows = unit ? inspectRows(unit, host.pause.tab) : [];
  host.pauseNote = unit ? tabNote(host.pause.tab, unit) : "";
  host.pauseSummary = pauseSummaryText();
}

// -- presentation hooks -------------------------------------------------------

presentation.updateHud = () => {};
presentation.resetJoystick = resetStick;
presentation.toast = setToast;
presentation.combo = setCombo;
presentation.showBoss = () => {};
presentation.hideBoss = () => {};
presentation.hideLevelUp = () => {};
presentation.renderLevelUp = picks => {
  // Picks carry the pool entry; add the display fields the DOM cards show.
  host.levelPicks = picks.map(u => ({
    ...u, brief: upgradeBrief[u.id], level: level(u.id) + (u.id === "rapid" ? 2 : 1),
    scope: scopeLabel(effects.weaponOwnership(u.id)),
  }));
  host.breakthrough = null;
};
presentation.renderStation = data => {
  // Picks carry the pool entry; add the display level the DOM cards show.
  host.stationData = data ? { ...data, picks: (data.picks || []).map(u => ({ ...u, level: level(u.id) })) } : data;
};
presentation.renderResult = data => {
  host.resultData = data;
  host.resultScroll = 0;
  host.resultDamage = damageSummary();
  const names = Object.keys(state.modules).filter(id => level(id) > 0)
    .map(id => experiencePool.find(x => x.id === id)?.name || upgradePool.find(x => x.id === id)?.name || id);
  const cores = Object.keys(state.coreStacks).filter(id => state.coreStacks[id] > 0);
  host.resultBuild = "构筑：" + (names.join(" / ") || "—") + " / 核心：" + (cores.join(" · ") || "");
};
presentation.runReset = () => {
  host.levelPicks = null; host.breakthrough = null; host.stationData = null; host.resultData = null; host.routeCards = null; host.page = "battle";
  const prepared = prepareContractChoice();
  if (state.mode === "routeChoice") host.routeCards = prepared;
};

// -- flow actions -------------------------------------------------------------

function startRun(plan) { beginRun(plan); }
function backToMenu() {
  state.mode = "menu";
  state.metaProfile = longterm.loadMeta(metaStorage);
  state.record = runRecord.loadRecord(metaStorage);
  host.levelPicks = null; host.breakthrough = null; host.stationData = null; host.resultData = null; host.routeCards = null; host.page = "battle"; host.scroll = 0;
  refreshHostData();
  drawOverlay();
}
function extractRun() {
  if (state.mode !== "station") return;
  const data = settleFinish("extracted");
  if (data) presentation.renderResult(data);
  drawOverlay();
}
function togglePause() {
  if (!["combat", "docking", "station", "levelup"].includes(state.mode)) return;
  state.paused = !state.paused;
  if (state.paused) refreshPauseData();
  resetStick();
  drawOverlay();
}
function pauseForHidden() {
  if (!state.paused && ["combat", "docking"].includes(state.mode)) togglePause();
  resetStick();
}

function applyAction(action) {
  if (action === "start") { startRun(); return; }
  if (action === "pause") { togglePause(); return; }
  if (action === "pulse") { pulse(); return; }
  if (action === "menu") { backToMenu(); return; }
  if (action === "claim") {
    if (state.mode === "combat" && !state.paused && state.pendingLevelUps > 0) {
      const picks = prepareLevelUp();
      if (picks) presentation.renderLevelUp(picks);
    }
    return;
  }
  if (action === "reroll") {
    const picks = rerollStation();
    if (picks && host.stationData) host.stationData = { ...host.stationData, picks };
    return;
  }
  if (action === "extract") { extractRun(); return; }
  if (action === "depart") {
    const cards = departStation();
    if (cards) { host.stationData = null; host.routeCards = cards; }
    return;
  }
  if (action === "pausePrevUnit") {
    host.pause.unitIndex = (host.pause.unitIndex - 1 + host.pauseFleet.length) % host.pauseFleet.length;
    host.pause.page = 0; refreshPauseData(); return;
  }
  if (action === "pauseNextUnit") {
    host.pause.unitIndex = (host.pause.unitIndex + 1) % Math.max(1, host.pauseFleet.length);
    host.pause.page = 0; refreshPauseData(); return;
  }
  if (action === "pausePrevPage") { host.pause.page = Math.max(0, host.pause.page - 1); return; }
  if (action === "pauseNextPage") { host.pause.page += 1; return; }
  if (typeof action !== "object" || !action) return;
  if (action.contract) {
    const cards = chooseContract(action.contract);
    host.routeCards = state.mode === "routeChoice" ? cards : null;
  } else if (action.route) {
    host.routeCards = null;
    beginRoute(action.route);
  } else if (action.upgrade) {
    const result = chooseUpgrade(action.upgrade);
    if (result.breakthrough) { host.breakthrough = { weapon: result.weapon, options: result.breakthrough }; }
    else { host.levelPicks = null; }
  } else if (action.breakthrough) {
    const picks = chooseBreakthrough(host.breakthrough.weapon, action.breakthrough);
    host.breakthrough = null;
    host.levelPicks = picks || null;
  } else if (action.stationUpgrade) {
    selectStationUpgrade(action.stationUpgrade);
  } else if (action.homeTab) {
    if (host.page !== action.homeTab) { host.page = action.homeTab; host.scroll = 0; }
  } else if (action.selectRegion) {
    const next = longterm.setRegion(state.metaProfile, action.selectRegion);
    if (next) {
      state.metaProfile = next; longterm.saveMeta(metaStorage, state.metaProfile);
      setRegionGround(action.selectRegion);
    }
  } else if (action.toggleCar) {
    const cars = state.metaProfile.loadout.includes(action.toggleCar)
      ? state.metaProfile.loadout.filter(id => id !== action.toggleCar)
      : [...state.metaProfile.loadout, action.toggleCar];
    if (cars.length > 1) {
      const next = longterm.setLoadout(state.metaProfile, cars);
      if (next) { state.metaProfile = next; longterm.saveMeta(metaStorage, state.metaProfile); }
    }
  } else if (action.trainUpgrade) {
    const result = longterm.upgradeTrain(state.metaProfile);
    if (result?.purchased) { state.metaProfile = result.meta; longterm.saveMeta(metaStorage, state.metaProfile); }
  } else if (action.research) {
    const result = longterm.buyResearch(state.metaProfile, action.research);
    if (result?.purchased) { state.metaProfile = result.meta; longterm.saveMeta(metaStorage, state.metaProfile); }
  } else if (action.audioToggle) {
    gameAudio?.setPreference?.(action.audioToggle, !host.audio[action.audioToggle]);
    host.audio = gameAudio?.getPreferences?.() || host.audio;
  } else if (action.pauseTab) {
    host.pause.tab = action.pauseTab; host.pause.page = 0; refreshPauseData();
  }
}

function handleRegionAction(action) {
  applyAction(action);
  // Regions are rebuilt synchronously so back-to-back taps never read a
  // stale screen from the previous frame.
  drawOverlay();
}

// -- pointer input ------------------------------------------------------------

const regionAt = (x, y) => regions.find(r => !r.disabled && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);

// Tap-vs-drag tracking for the scrollable overlays (home panes, result sheet):
// a press that moves past the threshold scrolls the page instead of firing
// the region under the finger, exactly like touch scrolling on the DOM page.
const tap = { active: false, moved: false, x: 0, y: 0, scrollBase: 0 };
const TAP_SLOP = 8;

function scrollableNow() {
  if (state.mode === "menu") return { key: "home", max: Math.max(0, (host.contentHeight || 800) - host.viewportHeight) };
  if (state.mode === "result") return { key: "result", max: Math.max(0, (host.resultContentHeight || 800) - viewport.h) };
  return null;
}

function pointerDown(event) {
  const x = event.clientX, y = event.clientY;
  if (state.mode === "combat" && !state.paused) {
    // HUD buttons sit at fixed screen positions; they win over the joystick.
    const hit = regionAt(x, y);
    if (hit) { handleRegionAction(hit.action); return; }
  }
  if ((state.paused || state.mode === "menu" || SCREEN_MODES.includes(state.mode)) && state.mode !== "docking") {
    const scroller = scrollableNow();
    tap.active = true; tap.moved = false; tap.x = x; tap.y = y;
    tap.region = regionAt(x, y);
    tap.scrollBase = scroller ? (scroller.key === "home" ? host.scroll : host.resultScroll) : 0;
    return;
  }
  if (state.mode !== "combat" || state.paused || stick.pointerId !== null) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  stick.pointerId = event.pointerId;
  stick.center = { x, y };
  stick.radius = 36;
  stickMove(event);
}
function pointerMove(event) {
  if (tap.active) {
    const scroller = scrollableNow();
    const dx = event.clientX - tap.x, dy = event.clientY - tap.y;
    if (!tap.moved && Math.hypot(dx, dy) > TAP_SLOP) tap.moved = true;
    if (tap.moved && scroller) {
      const next = Math.max(0, Math.min(scroller.max, tap.scrollBase - dy));
      if (scroller.key === "home") host.scroll = next; else host.resultScroll = next;
      event.preventDefault?.();
    }
    return;
  }
  if (stick.pointerId === null) return;
  stickMove(event);
}
function pointerUp(event) {
  if (tap.active) {
    if (!tap.moved && tap.region) handleRegionAction(tap.region.action);
    tap.active = false; tap.region = null;
    return;
  }
  if (event.pointerId === stick.pointerId) resetStick();
}
function stickMove(event) {
  if (event.pointerId !== stick.pointerId) return;
  if (state.mode !== "combat" || state.paused) { resetStick(); return; }
  event.preventDefault?.();
  const vector = control.joystickVector({ x: event.clientX, y: event.clientY }, stick.center, stick.radius);
  state.moveInput = { x: vector.x, y: vector.y };
  setStickVisual({ visible: true, cx: stick.center.x, cy: stick.center.y, dx: vector.x * stick.radius, dy: vector.y * stick.radius, radius: stick.radius });
  if (vector.strength) setToast("");
}
function resetStick() {
  stick.pointerId = null;
  stick.center = null;
  state.moveInput = { x: 0, y: 0 };
  setStickVisual({ visible: false });
}

// Keyboard movement for desktop canvas testing; the mini-game adapter is touch-first.
function attachKeyboard(hostWindow) {
  if (typeof hostWindow?.addEventListener !== "function") return;
  const keys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
  const held = new Set();
  const apply = () => {
    if (stick.pointerId !== null) return;
    let x = 0, y = 0;
    for (const key of held) { x += keys[key][0]; y += keys[key][1]; }
    const vector = control.joystickVector({ x, y }, { x: 0, y: 0 }, 1, 0);
    if (state.mode === "combat" && !state.paused) state.moveInput = { x: vector.x, y: vector.y };
  };
  hostWindow.addEventListener("keydown", event => { if (keys[event.code]) { held.add(event.code); apply(); } });
  hostWindow.addEventListener("keyup", event => { if (keys[event.code]) { held.delete(event.code); apply(); } });
  hostWindow.addEventListener("blur", pauseForHidden);
}

// -- frame loop ---------------------------------------------------------------

function frame(now) {
  const fxDt = lastFrame ? Math.min(.1, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  try {
    tickFx(fxDt);
    frameStep(now);
    drawOverlay();
  } catch (error) {
    // A bad frame must never kill the loop silently: report, keep cycling.
    console.error("frame error", error);
    if (typeof window !== "undefined" && window.__errs) window.__errs.push("frame: " + (error?.message || error));
  }
  requestAnimationFrame(frame);
}
let lastFrame = 0;

function drawOverlay() {
  const c = ctx;
  if (!c) return;
  regions = [];
  // HUD/screens draw in viewport CSS pixels: scale from canvas pixels.
  const sx = canvas.width / viewport.w, sy = canvas.height / viewport.h;
  if (state.mode === "menu") {
    refreshHostData();
    c.save();
    c.scale(sx, sy);
    drawHome({ c, vw: viewport.w, vh: viewport.h, X: x => x * sx0(), Y: y => y * sy0(), F: f => f * Math.min(sx0(), sy0()) }, host, region => regions.push(region));
    c.restore();
    return;
  }
  drawHud({ c, vw: viewport.w, vh: viewport.h, X: x => x * sx0(), Y: y => y * sy0(), F: f => f * Math.min(sx0(), sy0()) }, state, region => regions.push(region));
  c.save();
  c.scale(sx, sy);
  const u = { c, vw: viewport.w, vh: viewport.h, X: x => x * sx0(), Y: y => y * sy0(), F: f => f * Math.min(sx0(), sy0()) };
  // Flow sheets sit on a blurred battlefield like the DOM's backdrop-filter;
  // the level-up sheet only replays the pristine frame (DOM has no blur there).
  const backdropKey = state.mode + ":" + (state.paused ? 1 : 0);
  if (state.paused) {
    overlayBackdrop(u, backdropKey, true);
    drawPauseScreen(u, state, host, region => regions.push(region));
  } else if (state.mode === "contractChoice") {
    overlayBackdrop(u, backdropKey, true);
    drawCardListScreen(u, state, {
      eyebrow: "远征指挥部 / 契约授权", title: "签订远征契约", copy: "更高风险，换取更高回报。", footer: "选择一份契约 · 本次远征生效",
      cards: (state.contractChoices || []).map((contract, i) => ({
        iconId: contract.id, counter: String(i + 1).padStart(2, "0"),
        title: contract.name, sub: contract.description, action: { contract },
      })),
    }, region => regions.push(region));
  } else if (state.mode === "routeChoice") {
    overlayBackdrop(u, backdropKey, true);
    drawCardListScreen(u, state, {
      eyebrow: "轨道导航 / 路线规划", title: "选择前方路线", copy: "路线会改变地面、敌群和掉落。", footer: "选择一条路线 · 即刻发车",
      cards: (host.routeCards || []).map(({ event, intel }) => ({
        iconId: event.id, title: event.name, sub: event.description + intel, action: { route: event },
      })),
    }, region => regions.push(region));
  } else if (state.mode === "levelup") {
    overlayBackdrop(u, backdropKey, false);
    drawLevelUpScreen(u, state, host, region => regions.push(region));
  } else if (state.mode === "station") {
    overlayBackdrop(u, backdropKey, true);
    drawStationScreen(u, state, host, region => regions.push(region));
  } else if (state.mode === "result") {
    drawResultScreen(u, state, host, region => regions.push(region));
  } else {
    // Live combat keeps painting fresh frames: the next overlay must
    // re-capture the battlefield instead of replaying a stale snapshot.
    resetOverlayBackdrop();
  }
  c.restore();
}
function sx0() { return viewport.w / 420; }
function sy0() { return viewport.h / 800; }

// -- boot -----------------------------------------------------------------------

function applyViewportSize() {
  if (typeof window === "undefined" || !window.innerWidth) return;
  viewport.w = window.innerWidth;
  viewport.h = window.innerHeight;
}

function startCanvasGame(canvasEl, { width, height } = {}) {
  applyViewportSize();
  setSurface(canvasEl, width || viewport.w, height || viewport.h);
  if (typeof window !== "undefined") {
    window.__errs = window.__errs || [];
    window.EndlessRailsCanvasHost = api;
    if (typeof canvasEl.addEventListener === "function") {
      canvasEl.addEventListener("pointerdown", pointerDown);
      canvasEl.addEventListener("pointermove", pointerMove);
      canvasEl.addEventListener("pointerup", pointerUp);
      canvasEl.addEventListener("pointercancel", pointerUp);
    }
    attachKeyboard(window);
    if (typeof window.addEventListener === "function") {
      window.addEventListener("resize", () => {
        applyViewportSize();
        canvasEl.width = viewport.w; canvasEl.height = viewport.h;
      });
    }
  }
  refreshHostData();
  presentation.updateHud();
  drawOverlay();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(frame);
  return api;
}

const api = {
  startRun,
  backToMenu,
  extractRun,
  togglePause,
  pauseForHidden,
  pointerDown,
  pointerMove,
  pointerUp,
  handleRegionAction,
  get state() { return state; },
  get regions() { return regions; },
  get host() { return host; },
};

export { startCanvasGame };

// Mini-game adapter contract: it installs its canvas here before requiring
// this module, so the game boots without any document or DOM whatsoever.
// The browser smoke page sets it on globalThis; the test sandbox sets it on
// the window object - accept either.
const adapterCanvas = (typeof globalThis !== "undefined" && globalThis.__endlessRailsCanvas) ||
  (typeof window !== "undefined" && window.__endlessRailsCanvas);
if (adapterCanvas) {
  startCanvasGame(adapterCanvas);
}
