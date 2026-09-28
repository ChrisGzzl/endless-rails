"use strict";
// Web composition root: installs the DOM presentation over the DOM-free
// engine and re-exports the runtime API that the interface panels consume.
// The canvas-only host used by the mini-game builds (canvas-host.js) boots
// the same engine with its own presentation instead of this module.
import { $ } from "./dom.js";
import { uiHooks } from "./hooks.js";
import { presentation, state, metaStorage, gameAudio, motion, balance, progression, effects, control, routeEvents, runRecord, longterm, level, carEnabled, beginRun, beginRoute, update, frameStep, resizeBattlefield, syncSwarm, pulse, cameraView, carPosition, stationCenter, stationTurrets, bladePositions, applyResearchProfile, upgradePool, experiencePool } from "./engine.js";
import { canvas, ctx, TAU, W, H, setSurface } from "../view/surface.js";
import { draw } from "../view/render.js";
import { updateHud } from "../view/hud.js";
import { resetJoystick, syncJoystick } from "./input.js";
import { gmGate } from "./gm.js";
import { openLevelUp, chooseLevelUp, arriveStation, extractRun, continueRun, openRouteEvent, openContractChoice, rerollUpgrades, renderDamageSummary, finish, renderLevelUpDom, renderStationDom, renderResultDom } from "./flows.js";

let settingsOpen=false;
// The page owns the canvas element; the renderer reads it from the surface.
setSurface($("gameCanvas"));
const ui={station:$("stationValue"),scrap:$("scrapValue"),health:$("healthText"),healthFill:$("healthFill"),timer:$("timerValue"),phase:$("phaseLabel"),drone:$("droneLevel"),pulse:$("pulseButton"),pulseCooldown:$("pulseCooldown"),objective:$("objectiveText"),combo:$("comboText"),toast:$("toast"),hint:$("touchHint"),start:$("startScreen"),stationScreen:$("stationScreen"),stationTitle:$("stationTitle"),upgrades:$("upgradeList"),continue:$("continueButton"),result:$("resultScreen"),bossWrap:$("bossWrap"),bossText:$("bossText"),bossFill:$("bossFill"),trainLength:$("trainLengthLabel"),miniTrain:$("miniTrain"),routeLabel:$("routeProgressLabel"),routeFill:$("routeProgressFill"),xpLabel:$("experienceProgressLabel"),xpFill:$("experienceProgressFill"),levelUp:$("levelUpScreen"),levelUpList:$("levelUpList"),pause:$("pauseButton"),commandRing:$("commandRing"),eventScreen:$("eventScreen"),eventList:$("eventList"),contractScreen:$("contractScreen"),contractList:$("contractList"),reroll:$("rerollButton"),resultBuild:$("resultBuild"),resultRecord:$("resultRecord"),resultMeta:$("resultMeta"),extract:$("extractButton")};

// DOM presentation hooks consumed by the engine, the sim layer and flow-logic.
presentation.updateHud=updateHud;
presentation.resetJoystick=resetJoystick;
presentation.showBoss=()=>{ui.bossWrap.hidden=false;};
presentation.hideBoss=()=>{ui.bossWrap.hidden=true;};
presentation.hideLevelUp=()=>{ui.levelUp.hidden=true;};
presentation.renderLevelUp=renderLevelUpDom;
presentation.renderStation=renderStationDom;
presentation.renderResult=renderResultDom;
presentation.toast=text=>{ui.toast.textContent=text;ui.toast.classList.remove("show");void ui.toast.offsetWidth;ui.toast.classList.add("show")};
presentation.combo=text=>{ui.combo.textContent=text;ui.combo.classList.remove("show");void ui.combo.offsetWidth;ui.combo.classList.add("show")};
presentation.runReset=()=>{gameAudio?.unlock();gmGate.open=false;$("gmPanel").hidden=true;$("pauseScreen").hidden=true;ui.pause.textContent="Ⅱ";ui.pause.setAttribute?.("aria-label","暂停游戏");ui.start.hidden=true;ui.stationScreen.hidden=true;ui.levelUp.hidden=true;ui.result.hidden=true;ui.eventScreen.hidden=true;ui.contractScreen.hidden=true;ui.hint.style.opacity=.8;openContractChoice();};

function togglePause(){
  if(settingsOpen)return;
  if(gmGate.open){gmGate.close();return;}
  if(!["combat","docking","station","levelup"].includes(state.mode)||!$("displayHelp").hidden)return;
  state.paused=!state.paused;resetJoystick();
  $("pauseScreen").hidden=!state.paused;
  ui.pause.textContent=state.paused?"▶":"Ⅱ";
  ui.pause.setAttribute?.("aria-label",state.paused?"继续游戏":"暂停游戏");
  if(state.paused){uiHooks.renderPause();$("resumeButton").focus?.();}else canvas.focus?.();
  updateHud();
}
ui.pulse.addEventListener("click",pulse);ui.pause.addEventListener("click",togglePause);ui.reroll.addEventListener("click",rerollUpgrades);
$("startButton").addEventListener("click",()=>{if(window.EndlessRailsMetaUI?.start)window.EndlessRailsMetaUI.start();else beginRun();});
$("restartButton").addEventListener("click",()=>{ui.result.hidden=true;if(window.EndlessRailsMetaUI?.open)window.EndlessRailsMetaUI.open();else beginRun();});
ui.continue.addEventListener("click",continueRun);ui.extract?.addEventListener("click",extractRun);
window.EndlessRailsGame={startRun:beginRun,extractRun,getState:()=>state,reloadSave:()=>{if(["menu","result"].includes(state.mode)){state.metaProfile=longterm.loadMeta(metaStorage);state.record=runRecord.loadRecord(metaStorage);}}};window.addEventListener("keydown",e=>{if(e.code==="Space"&&!state.paused&&!settingsOpen){e.preventDefault();pulse()}if((e.code==="KeyP"||e.code==="Escape")&&!e.repeat){e.preventDefault();togglePause()}});
 // QA surface: qa.js inspects the live game through the iframe window.
Object.assign(window,{update,draw,beginRoute,updateHud,openLevelUp,chooseLevelUp,arriveStation,extractRun,syncSwarm,cameraView});
function frame(now){
  frameStep(now);
  requestAnimationFrame(frame);
}
updateHud();requestAnimationFrame(frame);

// Gesture surfaces belong to the game; do not start text/image drags or long-press menus.
for(const surface of [$("app"),$("startScreen"),$("metaScreen"),$("pauseScreen"),ui.stationScreen,ui.levelUp,ui.eventScreen,ui.contractScreen,ui.result]){
  for(const type of ["dragstart","selectstart","contextmenu"])surface.addEventListener(type,event=>event.preventDefault());
}

$("claimUpgradeButton").addEventListener("click",()=>{if(state.mode==="combat"&&!state.paused&&state.pendingLevelUps>0)openLevelUp();});
// GM values are actual displayed drone levels. Zero undeploys a specialist.

export { state, metaStorage, gameAudio, motion, balance, control, effects, ui, syncJoystick, longterm, progression, routeEvents, runRecord, carEnabled, resetJoystick, cameraView, carPosition, stationCenter, stationTurrets, bladePositions, togglePause, resizeBattlefield, updateHud, applyResearchProfile, syncSwarm, level, upgradePool, experiencePool, beginRun, presentation };
export { canvas, ctx, TAU, W, H };
export const settingsGate = { get open() { return settingsOpen; }, set open(value) { settingsOpen = value; } };
