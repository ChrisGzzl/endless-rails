"use strict";

import { $ } from "../app/dom.js";
import { ui, state, effects, syncJoystick } from "../app/game.js";

// HUD writes are dirty-checked: at 10Hz the values rarely change, so each
// cached setter skips the DOM write when the formatted output is identical.
// Formatting itself stays verbatim from the previous single-line version.
const textCache = new Map();
const styleCache = new Map();
const attrCache = new Map();
function setText(node, value) {
  if (textCache.get(node) !== value) { textCache.set(node, value); node.textContent = value; }
}
function setStyle(node, prop, value) {
  if (styleCache.get(node) !== value) { styleCache.set(node, value); node.style[prop] = value; }
}
function setAttr(node, name, value) {
  const key = node;
  const cached = attrCache.get(key) || {};
  if (cached[name] !== value) { cached[name] = value; attrCache.set(key, cached); node.setAttribute?.(name, value); }
}

function updateHud() {
  syncJoystick();
  const claim = $("claimUpgradeButton");
  const claimVisible = !(state.pendingLevelUps <= 0 || state.mode !== "combat" || state.paused);
  if (claim.hidden !== claimVisible) claim.hidden = claimVisible;
  setText(claim, "强化 ×" + state.pendingLevelUps);
  setText(ui.station, String(Math.min(state.station, 5)).padStart(2, "0") + " / 05");
  setText(ui.scrap, String(state.scrap).padStart(3, "0"));
  setText(ui.health, Math.ceil(state.trainHp) + "/" + state.maxTrainHp);
  setStyle(ui.healthFill, "width", Math.min(100, Math.max(0, state.trainHp / state.maxTrainHp * 100)) + "%");
  setText($("levelTrainHealthText"), Math.ceil(state.trainHp) + " / " + state.maxTrainHp);
  setStyle($("levelTrainHealthFill"), "width", Math.min(100, Math.max(0, state.trainHp / state.maxTrainHp * 100)) + "%");
  setText(ui.timer, Math.max(0, state.timer).toFixed(1));
  setText(ui.phase, state.paused ? "暂停中" : state.mode === "combat" ? "行驶中" : state.mode === "levelup" ? "战斗升级" : state.mode === "routeChoice" ? "路线选择" : state.mode === "contractChoice" ? "远征契约" : state.mode === "docking" ? "进站清场" : state.mode === "station" ? "安全停靠" : "待命");
  setText($("moveSpeedValue"), state.drone.moveSpeed + " px/s");
  setText(ui.drone, (1 + effects.swarmRoster(state.modules).length) + " 架");
  setStyle(ui.pulseCooldown, "height", state.pulseClock ? state.pulseClock / 7 * 100 + "%" : "0%");
  ui.pulse.classList.toggle("cooling", state.pulseClock > 0);
  setText(ui.objective, state.mode === "docking" ? "防卫炮台清场 · 列车减速进站" : state.mode === "station" ? "安全区 · 列车已停稳" : state.station === 5 ? "守住列车，抵达终点防区" : "护送列车抵达下一站");
  updateProgressHud();
  if (state.boss) {
    setText(ui.bossText, Math.max(0, Math.ceil(state.boss.hp / state.boss.maxHp * 100)) + "%");
    setStyle(ui.bossFill, "width", Math.max(0, state.boss.hp / state.boss.maxHp * 100) + "%");
  }
}
// Both instruments fill left to right: completed travel and earned experience.
function updateProgressHud() {
  const arrived = state.mode === "docking" || state.mode === "station";
  const total = Math.max(1, state.routeDistanceTotal || 0);
  const routePercent = arrived ? 100 : Math.min(100, Math.max(0, (total - state.routeDistance) / total * 100));
  const xpPercent = Math.min(100, Math.max(0, state.experience / Math.max(1, state.experienceToNext) * 100));
  setText(ui.routeLabel, arrived ? "行程 · 已抵达车站" : `行程 · 已完成 ${Math.floor(routePercent)}%`);
  setStyle(ui.routeFill, "width", routePercent + "%");
  setText(ui.xpLabel, `经验 Lv.${state.level} · ${Math.floor(state.experience)} / ${state.experienceToNext}`);
  setStyle(ui.xpFill, "width", xpPercent + "%");
  setAttr($("routeProgressTrack"), "aria-valuenow", String(Math.round(routePercent)));
  setAttr($("experienceProgressTrack"), "aria-valuenow", String(Math.round(xpPercent)));
}

export { updateHud };
