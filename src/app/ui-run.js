"use strict";
// Run controller for the canvas interface (port of the former DOM game.js,
// hud.js, input.js, flows.js and armory.js): the HUD view model, toast and
// combo cues, the floating joystick and keyboard steering, the flow screens
// (contract -> route -> level-up / breakthrough -> station -> result), the
// pause terminal with its fleet inspector, and pause / autopause rules.
// All transitions still come from flow-logic.js; texts and rules are the
// DOM version's verbatim.

import { state, presentation, beginRun, pulse, level, effects, control, gameAudio, syncSwarm, applyResearchProfile, longterm, upgradePool, experiencePool } from "./engine.js";
import { chooseContract, prepareContractChoice, chooseUpgrade, chooseBreakthrough, breakthroughOptions, selectStationUpgrade, rerollStation, departStation, settleFinish, prepareLevelUp, enterStation, damageSummary } from "./flow-logic.js";
import { beginRoute } from "../sim/run.js";
import { upgradeBrief, scopeLabel, upgradeFamily } from "../sim/station.js";
import { inspectFleet, inspectRows, tabNote } from "./telemetry.js";

const runCtl = (() => {
  let hub = null; // host services: invalidate, focus, blur, keyboardFocus, openHome, measurePause, viewport, dialogs
  const screens = { contract: null, route: null, levelUp: null, station: null, result: null, pause: false };
  let bossVisible = false, bossModel = { text: "100%", percent: 100 };
  let hintOpacity = null;
  const toast = { text: "", serial: 0 }, combo = { text: "", serial: 0 };
  let hud = null, hudSig = "";
  let salvageText = "";
  function changed() { hub?.invalidate(); }

  // -- HUD ---------------------------------------------------------------------------------------

  const clampPct = v => Math.min(100, Math.max(0, v));
  function updateHud() {
    syncJoystick();
    const claimHidden = state.pendingLevelUps <= 0 || state.mode !== "combat" || state.paused;
    const arrived = state.mode === "docking" || state.mode === "station";
    const total = Math.max(1, state.routeDistanceTotal || 0);
    const routePercent = arrived ? 100 : clampPct((total - state.routeDistance) / total * 100);
    const xpPercent = clampPct(state.experience / Math.max(1, state.experienceToNext) * 100);
    const healthPercent = clampPct(state.trainHp / state.maxTrainHp * 100);
    if (state.boss) bossModel = { text: Math.max(0, Math.ceil(state.boss.hp / state.boss.maxHp * 100)) + "%", percent: Math.max(0, state.boss.hp / state.boss.maxHp * 100) };
    const next = {
      paused: state.paused,
      timer: Math.max(0, state.timer).toFixed(1),
      station: String(Math.min(state.station, 5)).padStart(2, "0") + " / 05",
      scrap: String(state.scrap).padStart(3, "0"),
      routeLabel: arrived ? "行程 · 已抵达车站" : `行程 · 已完成 ${Math.floor(routePercent)}%`,
      routePercent,
      xpLabel: `经验 Lv.${state.level} · ${Math.floor(state.experience)} / ${state.experienceToNext}`,
      xpPercent,
      drones: (1 + effects.swarmRoster(state.modules).length) + " 架",
      pulseCooling: state.pulseClock > 0,
      pulseDisabled: !canUseJoystick(),
      pulseCooldown: state.pulseClock ? state.pulseClock / 7 * 100 : 0,
      claimVisible: !claimHidden,
      claimText: "强化 ×" + state.pendingLevelUps,
      objective: state.mode === "docking" ? "防卫炮台清场 · 列车减速进站" : state.mode === "station" ? "安全区 · 列车已停稳" : state.station === 5 ? "守住列车，抵达终点防区" : "护送列车抵达下一站",
      health: Math.ceil(state.trainHp) + "/" + state.maxTrainHp,
      healthPercent,
      levelHealthText: Math.ceil(state.trainHp) + " / " + state.maxTrainHp,
      boss: bossVisible ? bossModel : null,
      hintOpacity,
      moveSpeed: state.drone.moveSpeed + " px/s",
    };
    const sig = JSON.stringify(next);
    if (sig !== hudSig) { hudSig = sig; hud = next; changed(); }
  }
  function hudModel() { if (!hud) updateHud(); return hud; }

  // -- joystick / keyboard steering -----------------------------------------------------------------

  const joystickState = { pointerId: null, center: null, radius: 0, keys: new Set(), visible: false, x: 0, y: 0, dx: 0, dy: 0 };
  const joystickKeys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
  function canUseJoystick() { return state.mode === "combat" && !state.paused; }
  function setCommand(vector) {
    if (!canUseJoystick()) return;
    state.moveInput = { x: vector.x, y: vector.y };
    if (vector.strength && hintOpacity !== 0) { hintOpacity = 0; updateHud(); }
  }
  function resetJoystick() {
    const had = joystickState.pointerId !== null || joystickState.visible;
    const id = joystickState.pointerId;
    joystickState.pointerId = null; joystickState.center = null; joystickState.keys.clear();
    state.moveInput = { x: 0, y: 0 };
    joystickState.visible = false; joystickState.dx = 0; joystickState.dy = 0;
    if (id !== null) hub?.releasePointer?.(id);
    if (had) changed();
  }
  function syncJoystick() { if (!canUseJoystick()) resetJoystick(); }
  function showJoystickVector(vector, radius) {
    joystickState.dx = vector.x * radius; joystickState.dy = vector.y * radius;
    setCommand(vector); changed();
  }
  // Pointer handlers of the battlefield node (onPress / onDrag / onRelease).
  function stickDown(e, node) {
    if (!canUseJoystick() || joystickState.pointerId !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    joystickState.keys.clear();
    joystickState.center = { x: e.x, y: e.y };
    joystickState.radius = 36;
    joystickState.x = e.x - node.absX; joystickState.y = e.y - node.absY;
    joystickState.visible = true;
    hub?.blur?.();
    joystickState.pointerId = e.id;
    stickMove(e);
  }
  function stickMove(e) {
    if (e.id !== joystickState.pointerId) return;
    if (!canUseJoystick()) { resetJoystick(); return; }
    const vector = control.joystickVector({ x: e.x, y: e.y }, joystickState.center, joystickState.radius);
    showJoystickVector(vector, joystickState.radius);
  }
  function stickUp(e) { if (e.id === joystickState.pointerId) resetJoystick(); }
  function moveKeyboardJoystick() {
    let x = 0, y = 0;
    for (const key of joystickState.keys) { x += joystickKeys[key][0]; y += joystickKeys[key][1]; }
    setCommand(control.joystickVector({ x, y }, { x: 0, y: 0 }, 1, 0));
  }
  function keyDownSteer(e) {
    if (!joystickKeys[e.code] || !canUseJoystick() || joystickState.pointerId !== null) return false;
    joystickState.keys.add(e.code); moveKeyboardJoystick(); return true;
  }
  function keyUpSteer(e) {
    if (!joystickKeys[e.code] || !joystickState.keys.has(e.code)) return false;
    joystickState.keys.delete(e.code);
    if (!canUseJoystick()) resetJoystick(); else moveKeyboardJoystick();
    return true;
  }
  function autoPause() {
    resetJoystick();
    if (!state.paused && ["combat", "docking"].includes(state.mode)) togglePause();
  }

  // -- pause -----------------------------------------------------------------------------------------

  function togglePause(opts = {}) {
    if (hub?.dialogs.settingsOpen()) return;
    if (hub?.dialogs.gmOpen()) { hub.dialogs.closeGM(); return; }
    if (!["combat", "docking", "station", "levelup"].includes(state.mode) || hub?.dialogs.displayHelpOpen()) return;
    state.paused = !state.paused; resetJoystick();
    screens.pause = state.paused;
    if (state.paused) { renderPause(); hub?.focus("resumeButton", opts.keyboard); } else hub?.blur();
    updateHud(); changed();
  }
  const inspector = { id: "gun", tab: "weapon", page: 0, layoutKey: null, pageSize: 12, model: null };
  function unitLabel(d) { return `${effects.droneLabel(d.id)}${d.id.startsWith("escort") ? " " + (Number(d.id.slice(6)) + 1) : ""}${d.id === "command" ? "" : " · Lv." + d.level}${d.owned ? "" : " · 未解锁"}`; }
  function renderPause() {
    syncSwarm();
    const fleet = inspectFleet(), unit = fleet.find(d => d.id === inspector.id) || fleet[1]; inspector.id = unit.id;
    const p = applyResearchProfile(unit.id, effects.weaponProfile(unit.id, unit.level, state.coreStacks));
    const rows = inspectRows(unit, inspector.tab), requestedPage = inspector.page;
    const vp = hub?.viewport() || { w: 390, h: 844 };
    const base = {
      summary: `第 ${state.station} 站 · Lv.${state.level} · ${state.swarm.length + 1} 架 · 列车 ${Math.ceil(state.trainHp)}/${state.maxTrainHp}`,
      options: fleet.map(d => ({ value: d.id, label: unitLabel(d), selected: d.id === unit.id })),
      selectText: unitLabel(unit),
      portrait: { kind: unit.id.startsWith("escort") ? "gun" : unit.id, breakthrough: unit.id !== "command" && unit.level >= 10 },
      role: inspector.tab === "global" ? "列车 · 构筑 · 路线修正" : p.role,
      tab: inspector.tab,
      note: tabNote(inspector.tab, unit),
      resumeText: ["levelup", "station"].includes(state.mode) ? "返回选择界面" : "继续护送",
    };
    const pageModel = (pageSize, page) => {
      const pages = Math.max(1, Math.ceil(rows.length / pageSize));
      const current = Math.min(page, pages - 1);
      return { ...base, page: current, rows: rows.slice(current * pageSize, current * pageSize + pageSize), pageText: `${current + 1} / ${pages}`, prevDisabled: current === 0, nextDisabled: current >= pages - 1 };
    };
    // Fit whole rows inside the data bay: check every page before fixing the
    // page size so Next never shifts page boundaries.
    const probe = hub?.measurePause ? hub.measurePause(pageModel(1, 0)) : null;
    const layoutKey = [unit.id, inspector.tab, vp.w, vp.h, probe ? Math.round(probe.viewportH) : 0].join(":");
    let pageSize = inspector.layoutKey === layoutKey ? inspector.pageSize : vp.h < 450 ? 6 : vp.h < 700 ? 9 : 12;
    if (inspector.layoutKey !== layoutKey && probe && probe.viewportH) {
      while (pageSize > 3) {
        let fits = true;
        for (let page = 0; page < Math.ceil(rows.length / pageSize); page++) {
          const r = hub.measurePause(pageModel(pageSize, page));
          if (r.statsH > r.viewportH + 1) { fits = false; break; }
        }
        if (fits) break;
        pageSize -= 3;
      }
    }
    const model = pageModel(pageSize, requestedPage);
    inspector.page = model.page;
    inspector.layoutKey = layoutKey; inspector.pageSize = pageSize;
    inspector.model = model;
    changed();
  }
  function pauseModel() {
    const m = inspector.model;
    if (!m) return null;
    const d = hub.dialogs.display();
    return { ...m, fullscreen: d.pause, installHidden: d.installHidden, on: pauseActions };
  }
  let selectOpen = false;
  const pauseActions = {
    fullscreen: () => hub.dialogs.toggleFullscreen(),
    install: () => hub.dialogs.installGame(),
    settings: () => hub.dialogs.openSettings(),
    openSelect: () => { selectOpen = true; changed(); },
    closeSelect: () => { selectOpen = false; hub.focus("inspectSelect", false); changed(); },
    pick: id => { selectOpen = false; hub.focus("inspectSelect", false); if (id !== inspector.id) { inspector.id = id; inspector.page = 0; renderPause(); } else changed(); },
    prevUnit: () => stepUnit(-1),
    nextUnit: () => stepUnit(1),
    tab: tab => { inspector.tab = tab; inspector.page = 0; renderPause(); },
    prevPage: () => { inspector.page = Math.max(0, inspector.page - 1); renderPause(); },
    nextPage: () => { inspector.page = Math.max(0, inspector.page + 1); renderPause(); },
    resume: () => { if (state.paused) togglePause(); },
  };
  function stepUnit(delta) {
    const fleet = inspectFleet(), index = fleet.findIndex(d => d.id === inspector.id);
    inspector.id = fleet[(index + delta + fleet.length) % fleet.length].id; inspector.page = 0; renderPause();
  }
  // Keyboard on the closed unit picker: arrows step through the options like a native select.
  function selectKey(e) {
    const fleet = inspectFleet(), index = fleet.findIndex(d => d.id === inspector.id);
    if (e.code === "ArrowDown" || e.code === "ArrowRight") { if (index < fleet.length - 1) { inspector.id = fleet[index + 1].id; inspector.page = 0; renderPause(); } return true; }
    if (e.code === "ArrowUp" || e.code === "ArrowLeft") { if (index > 0) { inspector.id = fleet[index - 1].id; inspector.page = 0; renderPause(); } return true; }
    return false;
  }

  // -- flows -------------------------------------------------------------------------------------------

  function openContractChoice() {
    const choices = prepareContractChoice();
    if (!choices) return;
    screens.contract = choices; changed();
  }
  function renderRouteEventCards(cards) {
    if (!cards) return;
    screens.route = cards; changed();
  }
  function pickContract(i) {
    const contract = screens.contract?.[i];
    if (!contract) return;
    screens.contract = null; changed();
    renderRouteEventCards(chooseContract(contract));
  }
  function pickRoute(i) {
    const card = screens.route?.[i];
    if (!card) return;
    screens.route = null; changed();
    beginRoute(card.event);
  }
  function arriveStation() { renderStation(enterStation()); }
  function stationCards(picks) {
    return picks.map(u => ({ u, id: u.id, glyph: u.icon, name: u.name, small: `Lv.${level(u.id) + (u.id === "rapid" ? 2 : 1)}`, text: u.desc, selected: false }));
  }
  function renderStation(data) {
    if (data.secured) salvageText = `已锁定：废料 ${data.secured.scrap} · 组件 ${data.secured.components} · 数据 ${data.secured.data}。继续失败也保留。`;
    screens.station = {
      stationTitle: String(data.station).padStart(2, "0"),
      cards: stationCards(data.picks), rerollDisabled: !data.rerollAffordable,
      continueDisabled: true, continueText: "选择一项免费大升级", extractHidden: false, extractDisabled: false,
    };
    state.selectedUpgrade = null;
    updateHud(); changed();
    if (state.pendingLevelUps > 0) openLevelUp();
  }
  function rerollUpgrades() {
    const picks = rerollStation();
    if (!picks || !screens.station) return;
    state.selectedUpgrade = null;
    screens.station = { ...screens.station, rerollDisabled: true, cards: stationCards(picks), continueDisabled: true, continueText: "选择一项免费大升级" };
    updateHud(); changed();
  }
  function selectStationCard(i) {
    const st = screens.station, card = st?.cards[i];
    if (!card) return;
    selectStationUpgrade(card.u);
    screens.station = { ...st, cards: st.cards.map((c, j) => ({ ...c, selected: j === i })), continueDisabled: false, continueText: "装配并发车 →" };
    changed();
  }
  function extractRun() {
    if (state.mode !== "station") return;
    // Keep the station open if the save write fails, so the player can retry.
    const data = settleFinish("extracted");
    if (!data) return;
    screens.station = null; renderResult(data);
  }
  function continueRun() {
    const u = state.selectedUpgrade; if (!u || state.mode !== "station") return;
    screens.station = null; changed();
    const cards = departStation();
    if (cards) renderRouteEventCards(cards);
  }
  function openLevelUp() {
    const picks = prepareLevelUp();
    if (picks) renderLevelUp(picks);
  }
  function renderLevelUp(picks) {
    resetJoystick();
    screens.levelUp = {
      kind: "level", title: "选择升级", picks,
      cards: picks.map(u => ({ weapon: u.id, family: upgradeFamily[u.id], icon: u.id, glyph: u.icon, name: u.name, small: `Lv.${level(u.id) + (u.id === "rapid" ? 2 : 1)}`, text: upgradeBrief[u.id], scope: scopeLabel(effects.weaponOwnership(u.id)), title: u.desc })),
    };
    changed();
  }
  function chooseLevelUp(u) {
    const result = chooseUpgrade(u);
    if (result.breakthrough) { openBreakthroughChoice(result.weapon); return; }
    screens.levelUp = null; changed();
    if (state.pendingLevelUps > 0) openLevelUp();
    updateHud();
  }
  function openBreakthroughChoice(id) {
    const choices = breakthroughOptions(id); if (!choices.length) return false;
    screens.levelUp = {
      kind: "breakthrough", title: "Lv10 突破路线", weapon: id, choices,
      cards: choices.map(choice => ({ weapon: id, family: upgradeFamily[id], icon: choice.id, glyph: choice.icon, name: choice.name, small: null, text: choice.desc, scope: null, title: null })),
    };
    changed();
    return true;
  }
  function pickLevelCard(i) {
    const lv = screens.levelUp;
    if (!lv) return;
    if (lv.kind === "level") { const u = lv.picks[i]; if (u) chooseLevelUp(u); return; }
    const choice = lv.choices[i]; if (!choice) return;
    screens.levelUp = null; changed();
    const picks = chooseBreakthrough(lv.weapon, choice);
    if (picks) renderLevelUp(picks);
    updateHud();
  }
  function renderResult(data) {
    const outcome = data.outcome, won = outcome === "won", extracted = outcome === "extracted", settlement = data.settlement;
    const gained = settlement?.gained || { scrap: 0, components: 0, data: 0 }, bps = settlement?.blueprints || [];
    screens.result = {
      outcome,
      eyebrow: won ? "远征完成" : extracted ? "安全撤离" : "列车失守",
      title: won ? "列车穿过了黑夜" : extracted ? "资源已经锁定" : "铁轨被荒原吞没",
      copy: won ? "你完成了区域远征，并将成果带回列车。" : extracted ? "你选择在风险继续扩大前返回基地。" : "已锁定资源被带回，未保护的风险资源发生损失。",
      kills: state.kills, stations: outcome === "won" ? 5 : state.longtermRun?.stationsBanked || 0, scrap: state.scrap,
      damage: damageSummary(),
      build: "构筑：" + Object.keys(state.modules).filter(id => level(id) > 0).map(id => (experiencePool.find(u => u.id === id) || upgradePool.find(u => u.id === id))?.name || id).join(" / ") + " / 核心：" + Object.keys(state.coreStacks).filter(id => state.coreStacks[id] > 0).join(" · "),
      meta: `长期带回：废料 ${gained.scrap} · 技术组件 ${gained.components} · 研究数据 ${gained.data}` + (bps.length ? " · 新蓝图：" + bps.map(id => longterm.blueprintById(id)?.name || id).join(" / ") : ""),
      record: "最佳：" + state.record.bestStations + " 站 · " + state.record.bestCombo + " 连杀",
    };
    hub?.resetScroll("resultScreen");
    changed();
  }
  function restart() { screens.result = null; changed(); hub.openHome(); }
  function claim() { if (state.mode === "combat" && !state.paused && state.pendingLevelUps > 0) openLevelUp(); }

  // -- engine presentation hooks -----------------------------------------------------------------------

  function install() {
    presentation.updateHud = updateHud;
    presentation.resetJoystick = resetJoystick;
    presentation.showBoss = () => { bossVisible = true; updateHud(); changed(); };
    presentation.hideBoss = () => { bossVisible = false; updateHud(); changed(); };
    presentation.hideLevelUp = () => { screens.levelUp = null; changed(); };
    presentation.renderLevelUp = renderLevelUp;
    presentation.renderStation = renderStation;
    presentation.renderResult = renderResult;
    presentation.toast = text => { toast.text = text; toast.serial++; changed(); };
    presentation.combo = text => { combo.text = text; combo.serial++; changed(); };
    presentation.runReset = () => {
      gameAudio?.unlock();
      hub.dialogs.resetGM();
      screens.pause = false; hub.closeHome();
      screens.station = null; screens.levelUp = null; screens.result = null; screens.route = null; screens.contract = null;
      hintOpacity = 0.8;
      openContractChoice();
      changed();
    };
  }

  // -- view models -----------------------------------------------------------------------------------------

  function battleModel(paintBattlefield, display) {
    const h = hudModel();
    return {
      hud: h, toast, combo,
      joystick: { visible: joystickState.visible, x: joystickState.x, y: joystickState.y, dx: joystickState.dx, dy: joystickState.dy },
      display: { gameDisabled: display.game.disabled, label: display.game.label },
      paintBattlefield,
      on: {
        pause: e => togglePause({ keyboard: !!e?.keyboard }), gm: () => hub.dialogs.toggleGM(), pulse, claim,
        fullscreen: () => hub.dialogs.toggleFullscreen(),
        stickDown, stickMove, stickUp,
      },
    };
  }
  function flowModels() {
    const out = {};
    if (screens.contract) out.contract = { cards: screens.contract, pick: pickContract };
    if (screens.route) out.route = { cards: screens.route.map(({ event, intel }) => ({ id: event.id, weather: event.weather, name: event.name, text: event.description + intel })), pick: pickRoute };
    if (screens.levelUp) {
      const h = hudModel();
      out.levelUp = { ...screens.levelUp, healthText: h.levelHealthText, healthPercent: h.healthPercent, pick: pickLevelCard, inspect: e => togglePause({ keyboard: !!e?.keyboard }) };
    }
    if (screens.station) out.station = { ...screens.station, salvage: salvageText, select: selectStationCard, reroll: rerollUpgrades, extract: extractRun, depart: continueRun, inspect: e => togglePause({ keyboard: !!e?.keyboard }) };
    if (screens.result) out.result = { ...screens.result, restart };
    return out;
  }

  function attach(h) { hub = h; install(); }

  return {
    attach, updateHud, hudModel, battleModel, flowModels, pauseModel, renderPause, togglePause, autoPause, resetJoystick,
    keyDownSteer, keyUpSteer, selectKey, openLevelUp, chooseLevelUp, arriveStation, extractRun, continueRun, rerollUpgrades,
    get pauseVisible() { return screens.pause; }, get selectOpen() { return selectOpen && screens.pause; },
    closeSelect: () => { if (selectOpen) { selectOpen = false; changed(); } },
    screens, pauseActions, startRun: plan => beginRun(plan),
    get joystick() { return joystickState; }, get inspector() { return inspector; },
  };
})();

export { runCtl };
