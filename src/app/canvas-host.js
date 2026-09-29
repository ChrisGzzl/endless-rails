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
  trainSlots: 4, carSlots: 2, trainLength: 4, trainUpgradeCost: null, talentPoints: 0,
  talent: { branch: "hull", draft: null, loadout: null, notice: "", confirmSave: null },
  presetRows: [], branchRows: [], nodeRows: [], specRows: [], talentSummary: null,
  regionMeta: null, regionTags: {}, blueprintText: "",
  audio: { music: true, sfx: true },
  version: "v0.10.2.1",
};
const viewport = { w: 390, h: 680 };
const stick = { pointerId: null, center: null, radius: 36 };
let regions = [];

// -- host data assembly -------------------------------------------------------

// Same display copy the DOM research page shows (meta-ui.js RESEARCH_COPY).
const RESEARCH_COPY = {
  fireControl: "提高北辰与所有无人机的伤害。",
  cycleControl: "缩短无人机普通攻击的基础间隔。",
  rangeCalibration: "扩大无人机索敌与攻击射程（不扩大爆炸/燃烧范围）。",
  hullEngineering: "提高列车最大耐久。",
  armorMaterials: "按乘法降低列车受到的直接攻击伤害。",
  repairEngineering: "提高所有到站维修与应急储备的维修量。",
  trainFireControl: "提高列车自身近防炮的伤害。",
};

function regionStatus(meta, regionId) {
  const region = longterm.regionById(regionId);
  if (!region) return { status: "已侦察", tag: "已侦察" };
  const st = meta.regions[regionId];
  const unlocked = !!st?.unlocked;
  const status = !unlocked ? "未知" : st.repaired ? "已修复" : st.clears > 0 ? "已完成" : "已侦察";
  return { status, tag: unlocked ? status : "未解锁" };
}

// Talent draft lives on the host exactly like the DOM page keeps one in
// meta-ui.js: edits are free previews, the single apply call commits. The
// reset derives from state.metaProfile (updated by applyTalents itself) -
// host.meta may still hold the previous frame's copy at action time.
function draftFromProfile() {
  const nodes = { ...(state.metaProfile?.talents?.nodes || {}) }, specs = { ...(state.metaProfile?.talents?.specs || {}) };
  host.talent.draft = { nodes, specs };
  host.talent.loadout = null;
  host.talent.confirmSave = null;
}
function draftDirty() {
  const current = host.meta?.talents;
  if (!current || !host.talent.draft) return false;
  for (const node of (longterm.TALENT_NODES || []))
    if ((host.talent.draft.nodes[node.id] || 0) !== (current.nodes[node.id] || 0)) return true;
  for (const key in host.talent.draft.specs) if (host.talent.draft.specs[key] !== current.specs[key]) return true;
  const cars = host.talent.loadout, saved = host.meta.loadout || [];
  return !!cars && (cars.length !== saved.length || cars.some((id, i) => id !== saved[i]));
}
function withdrawNode(nodeId) {
  const draft = host.talent.draft;
  draft.nodes[nodeId] = Math.max(0, (draft.nodes[nodeId] || 0) - 1);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of longterm.TALENT_NODES) {
      if (!(draft.nodes[node.id] > 0) || !node.prereq?.id) continue;
      if ((draft.nodes[node.prereq.id] || 0) < node.prereq.level) { draft.nodes[node.id] = 0; changed = true; }
    }
    for (const branchId of Object.keys(longterm.SPEC_NODE))
      if (draft.specs[branchId] && !(draft.nodes[longterm.SPEC_NODE[branchId]] > 0)) draft.specs[branchId] = null;
  }
}
function raiseNode(nodeId) {
  const node = longterm.NODE_BY_ID[nodeId], draft = host.talent.draft;
  if (!node || (draft.nodes[nodeId] || 0) >= node.levels || longterm.nodeBlockReason(host.meta, draft, nodeId)) return;
  draft.nodes[nodeId] = (draft.nodes[nodeId] || 0) + 1;
}

function refreshHostData() {
  const profile = state.metaProfile;
  host.meta = profile;
  const plan = longterm.planFor(profile);
  host.trainLength = plan.trainLength;
  host.trainSlots = longterm.trainSlots(profile);
  host.carSlots = longterm.carSlots(profile);
  host.trainUpgradeCost = profile.train.level < longterm.MAX_TRAIN_LEVEL ? longterm.trainUpgradeCost(profile.train.level) : null;
  host.talentPoints = longterm.talentPoints(profile);
  if (!host.talent.draft) draftFromProfile();
  host.carDefs = (longterm.CAR_DEFS || []).filter(car => !car.fixed).map(car => ({ id: car.id, name: car.name, icon: car.icon, description: car.description, fixed: car.fixed }));
  host.unlockedCars = longterm.unlockedCars(host.talent.loadout ? { ...profile, talents: host.talent.draft } : profile);
  host.loadoutCars = (host.talent.loadout || profile.loadout || []).map(id => longterm.CAR_DEFS?.find(c => c.id === id)?.name || id);
  // Talent panel data for the canvas painter.
  host.branchRows = (longterm.TALENT_BRANCHES || []).map(branch => ({
    id: branch.id, name: branch.name, cap: branch.cap,
    spent: longterm.branchSpent(host.talent.draft, branch.id),
    equipped: !branch.car || (host.talent.loadout || profile.loadout || []).includes(branch.car),
    active: host.talent.branch === branch.id,
  }));
  host.nodeRows = (longterm.TALENT_NODES || []).filter(node => node.branch === host.talent.branch).map(node => ({
    id: node.id, name: node.name, cost: node.cost, levels: node.levels,
    level: host.talent.draft.nodes[node.id] || 0,
    block: longterm.nodeBlockReason(profile, host.talent.draft, node.id),
    effect: host.talent.draft.nodes[node.id] > 0 ? node.effect(host.talent.draft.nodes[node.id]) : node.effect(1),
  }));
  host.specRows = (longterm.SPEC_OPTIONS?.[host.talent.branch] || []).map(option => ({
    branch: host.talent.branch, id: option.id, name: option.name, desc: option.desc,
    owned: (host.talent.draft.nodes[longterm.SPEC_NODE[host.talent.branch]] || 0) > 0,
    active: host.talent.draft.specs[host.talent.branch] === option.id,
  }));
  host.presetRows = (profile.presets || []).map((preset, index) => ({
    index, name: preset.name, spent: longterm.spentPoints(preset.talents), cars: Math.max(0, preset.loadout.length - 1),
  }));
  const dirty = draftDirty();
  const problems = dirty ? longterm.talentProblems(profile, host.talent.draft) : [];
  const paid = dirty && longterm.refitIsPaid(profile.talents, host.talent.draft);
  const cost = longterm.refitCost(profile);
  const currentStats = longterm.buildStats(profile);
  const nextStats = dirty ? longterm.buildStats({ ...profile, talents: host.talent.draft, loadout: host.talent.loadout || profile.loadout }) : currentStats;
  const changes = longterm.buildChangeRows(currentStats, nextStats);
  host.talentSummary = {
    points: longterm.talentPoints(profile) - longterm.spentPoints(host.talent.draft),
    dirty, problems,
    costText: !paid ? "仅追加新点 · 免费" : profile.freeRefits > 0 ? `消耗 1 次免费重构（剩 ${profile.freeRefits} 次）` : `改装费 ${cost} 废料${profile.resources.scrap < cost ? ` · 还差 ${Math.ceil(cost - profile.resources.scrap)}` : ""}`,
    canApply: dirty && !problems.length,
    rows: changes.length ? changes : [dirty ? "仅调整编组或未装备分支；当前属性无变化" : "当前属性无改动"],
  };
  host.researchRows = (longterm.RESEARCH_TRACKS || []).map(track => {
    const costData = longterm.researchCost(profile, track.id);
    const maxed = !costData;
    const effect = longterm.researchEffectText(track.id, profile.research[track.id] || 0);
    const next = longterm.researchEffectText(track.id, Math.min(longterm.MAX_RESEARCH_LEVEL, (profile.research[track.id] || 0) + 1));
    return {
      id: track.id, icon: longterm.RESEARCH_ICONS[track.id], group: track.group, name: track.name, scope: track.scope,
      level: profile.research[track.id] || 0, max: longterm.MAX_RESEARCH_LEVEL, maxed,
      cost: costData, effect: effect.total, nextEffect: maxed ? "" : next.total,
      desc: RESEARCH_COPY[track.id] || "",
      missing: maxed ? [] : [["scrap", "废料"], ["components", "组件"], ["data", "数据"]].filter(([key]) => profile.resources[key] < costData[key]).map(([key, name]) => `${name}还差 ${Math.ceil(costData[key] - profile.resources[key])}`),
      affordable: !maxed && profile.resources.scrap >= costData.scrap
        && profile.resources.data >= costData.data && profile.resources.components >= costData.components,
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
  // 出发页摘要 (需求 §22.3)，与 DOM 版 meta-ui.js 同一口径。
  {
    const S = longterm.buildStats(profile);
    host.departureSummary = `伤害×${S.droneDamageMul.toFixed(2)} · 耐久×${(S.maxHp / 100).toFixed(2)} · 维修×${S.repairMul.toFixed(2)}`;
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
  host.talent.draft = null; host.talent.notice = "";
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
    if (host.page !== action.homeTab) {
      if (host.page === "train" && draftDirty()) { host.talent.notice = "请先应用或重置草稿，再切换页面"; return; }
      host.page = action.homeTab; host.scroll = 0;
    }
  } else if (action.selectRegion) {
    const next = longterm.setRegion(state.metaProfile, action.selectRegion);
    if (next) {
      state.metaProfile = next; longterm.saveMeta(metaStorage, state.metaProfile);
      setRegionGround(action.selectRegion);
    }
  } else if (action.toggleCar) {
    // Every lineup edit stays in the draft until apply.
    const base = (host.talent.loadout || state.metaProfile.loadout).filter(id => id !== "hangar");
    let cars;
    if (base.includes(action.toggleCar)) cars = base.filter(id => id !== action.toggleCar);
    else {
      cars = [...base];
      if (cars.length >= longterm.carSlots(state.metaProfile)) { host.talent.notice = "编组已满：先移除一节已选车厢"; return; }
      cars.push(action.toggleCar);
    }
    host.talent.loadout = ["hangar", ...cars]; host.talent.notice = "编组草稿待应用";
  } else if (action.talentBranch) {
    host.talent.branch = action.talentBranch;
  } else if (action.talentPlus) {
    raiseNode(action.talentPlus);
  } else if (action.talentMinus) {
    withdrawNode(action.talentMinus);
  } else if (action.talentSpec) {
    const [branchId, optionId] = action.talentSpec;
    host.talent.draft.specs[branchId] = host.talent.draft.specs[branchId] === optionId ? null : optionId;
  } else if (action.presetLoad !== undefined) {
    const result = longterm.loadPreset(state.metaProfile, action.presetLoad);
    host.talent.draft = { nodes: { ...result.talents.nodes }, specs: { ...result.talents.specs } };
    host.talent.loadout = [...result.loadout];
    host.talent.confirmSave = null;
    host.talent.notice = result.problems.length ? `方案不可用：${result.problems[0]}` : "已载入方案到草稿";
  } else if (action.presetRename !== undefined) {
    const index = action.presetRename, previous = state.metaProfile.presets[index]?.name || `方案 ${"ABC"[index]}`;
    const commit = name => {
      if (!name?.trim()) return;
      state.metaProfile = longterm.renamePreset(state.metaProfile, index, name.trim());
      longterm.saveMeta(metaStorage, state.metaProfile);
      host.talent.notice = `方案已改名为 ${state.metaProfile.presets[index].name}`;
      drawOverlay();
    };
    if (typeof wx !== "undefined" && wx.showModal) {
      wx.showModal({ title: "重命名方案", editable: true, placeholderText: previous, content: previous, success: result => { if (result.confirm) commit(result.content); } });
    } else if (typeof globalThis.prompt === "function") commit(globalThis.prompt("方案名称", previous));
    else host.talent.notice = "当前环境暂不支持输入方案名称";
  } else if (action.presetSave !== undefined) {
    const index = action.presetSave;
    if (host.talent.confirmSave === index) {
      state.metaProfile = longterm.savePreset(state.metaProfile, index, host.talent.draft, host.talent.loadout || state.metaProfile.loadout);
      longterm.saveMeta(metaStorage, state.metaProfile);
      host.talent.notice = "草稿已存入方案"; host.talent.confirmSave = null;
    } else { host.talent.confirmSave = index; host.talent.notice = `再点保存，覆盖方案 ${"ABC"[index]}`; }
  } else if (action.talentReset) {
    draftFromProfile();
    host.talent.notice = "";
  } else if (action.trainUpgrade) {
    const result = longterm.buyTrainUpgrade(state.metaProfile);
    if (result.purchased) {
      state.metaProfile = result.meta;
      longterm.saveMeta(metaStorage, state.metaProfile);
      host.talent.notice = `列车升至 Lv.${result.meta.train.level} · 改装点 +2`;
    }
  } else if (action.talentApply) {
    const result = longterm.applyTalents(state.metaProfile, host.talent.draft, { loadout: host.talent.loadout || state.metaProfile.loadout });
    if (result.applied) {
      state.metaProfile = result.meta;
      longterm.saveMeta(metaStorage, state.metaProfile);
      draftFromProfile();
      host.talent.notice = result.charged ? `已支付改装费 ${result.charged} 废料` : result.paid ? `已消耗 1 次免费重构（剩 ${result.freeRefits} 次）` : "";
    } else {
      host.talent.notice = result.problems.join("；");
    }
  } else if (action.research) {
    const result = longterm.buyResearch(state.metaProfile, action.research);
    if (result?.purchased) { state.metaProfile = result.meta; longterm.saveMeta(metaStorage, state.metaProfile); }
    else if (result?.short?.length) host.researchNotice = result.short.join(" · ");
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
