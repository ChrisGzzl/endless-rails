"use strict";
import { $ } from "./dom.js";
import { uiHooks } from "./hooks.js";
import "../core/audio.js";
import "../core/balance.js";
import "../core/motion.js";
import "../core/progression.js";
import "../core/combat-effects.js";
import "../core/control.js";
import "../core/route-events.js";
import "../core/run-record.js";
import "../meta/longterm.js";
import { draw, setRegionGround } from "../view/render.js";
import { updateHud } from "../view/hud.js";
import { WORLD_SPEED, cameraView, updateCamera, advanceWorld, carPosition, droneBounds } from "../sim/world.js";
import { showCombo, showToast, addText, updateParticles, burst } from "../sim/fx.js";
import { spawnWave, spawnEnemy } from "../sim/spawn.js";
import { stepEnemy, updateHostileShots } from "../sim/enemies.js";
import { applyResearchProfile, pointDefenseTick, fireRailgun, updateShots, bladePositions, updateArsenal } from "../sim/weapons.js";
import { releaseCarSuppression, collideTrain, nearestTarget, bladeHuntTarget, damageTarget, normalStatsFor, bondStatsFor, areaHit, ricochetBurst, killEnemy, killBoss } from "../sim/combat.js";
import { syncSwarm, updateSwarm, beginRoute, pulse, settleLongterm } from "../sim/run.js";
import { stationCenter, stationTurrets, startDocking, updateDocking } from "../sim/docking.js";
import { upgradePool, experiencePool } from "../sim/station.js";
import { openLevelUp, chooseLevelUp, arriveStation, extractRun, continueRun, openRouteEvent, openContractChoice, rerollUpgrades, renderDamageSummary, finish } from "../app/flows.js";
const requireModule=(file,value)=>{if(!value)throw new Error(file+" 未加载");return value;};
const gameAudio=requireModule("audio.js",window.EndlessRailsAudio).createAudio(window);
let settingsOpen=false,audioTrainHp=100;
const canvas=document.getElementById("gameCanvas"),ctx=canvas.getContext("2d"),TAU=Math.PI*2,motion=requireModule("motion.js",window.EndlessRailsMotion);
let W=canvas.width,H=canvas.height;
const balance=requireModule("balance.js",window.EndlessRailsBalance);
const progression=requireModule("progression.js",window.EndlessRailsProgression);
const effects=requireModule("combat-effects.js",window.EndlessRailsCombatEffects);
const control=requireModule("control.js",window.EndlessRailsControl);
const routeEvents=requireModule("route-events.js",window.EndlessRailsRouteEvents);
const runRecord=requireModule("run-record.js",window.EndlessRailsRunRecord);
const longterm=requireModule("longterm.js",window.EndlessRailsLongterm);
const metaStorage=longterm.gameStorage ? longterm.gameStorage(window) : null;
const ui={station:$("stationValue"),scrap:$("scrapValue"),health:$("healthText"),healthFill:$("healthFill"),timer:$("timerValue"),phase:$("phaseLabel"),drone:$("droneLevel"),pulse:$("pulseButton"),pulseCooldown:$("pulseCooldown"),objective:$("objectiveText"),combo:$("comboText"),toast:$("toast"),hint:$("touchHint"),start:$("startScreen"),stationScreen:$("stationScreen"),stationTitle:$("stationTitle"),upgrades:$("upgradeList"),continue:$("continueButton"),result:$("resultScreen"),bossWrap:$("bossWrap"),bossText:$("bossText"),bossFill:$("bossFill"),trainLength:$("trainLengthLabel"),miniTrain:$("miniTrain"),routeLabel:$("routeProgressLabel"),routeFill:$("routeProgressFill"),xpLabel:$("experienceProgressLabel"),xpFill:$("experienceProgressFill"),levelUp:$("levelUpScreen"),levelUpList:$("levelUpList"),pause:$("pauseButton"),commandRing:$("commandRing"),eventScreen:$("eventScreen"),eventList:$("eventList"),contractScreen:$("contractScreen"),contractList:$("contractList"),reroll:$("rerollButton"),resultBuild:$("resultBuild"),resultRecord:$("resultRecord"),resultMeta:$("resultMeta"),extract:$("extractButton")};
const state={metaProfile:longterm.loadMeta(metaStorage),expeditionPlan:null,longtermRun:null,metaSettlement:null,metaSettled:false,disabledCars:{},breakthroughs:{},cameraZoom:1,targetCameraZoom:1,pointDefenseClock:0,nextUpgradeAt:0,upgradeReturnMode:"combat",hostileShots:[],weaponStats:{},bondStats:{},worldDistance:0,comboFxAt:-1,swarm:[],routeElapsed:0,docking:null,zones:[],weaponFx:[],weaponClocks:{},mode:"menu",visualTime:0,paused:false,commandRing:null,commandRingLife:0,runSeed:1,activeEvent:null,activeContract:null,routeModifiers:{routeDistance:60,enemySpeed:1,enemyHp:1,eliteChance:.07,coreChance:1,rewardMultiplier:1,scrapMultiplier:1,weather:"clear"},record:runRecord.loadRecord(metaStorage),escortClock:.2,eventChoices:[],contractChoices:[],rerollUsed:false,coreHitCounter:0,station:1,timer:60,maxTrainHp:100,trainHp:100,scrap:0,kills:0,combo:0,bestCombo:0,score:0,droneLevel:1,trainLength:balance.START_TRAIN_LENGTH,fireClock:0,missileClock:0,spawnClock:.2,pulseClock:0,railClock:0,hurtFlash:0,shake:0,moveInput:{x:0,y:0},drone:{id:"command",x:240,y:300,moveSpeed:control.DRONE_MOVE_SPEED,flash:0},train:{x:W/2,y:H/2},enemies:[],shots:[],particles:[],texts:[],selectedUpgrade:null,modules:{},boss:null,shieldReady:false,...progression.createProgression({routeDistanceTotal:60})};
const level=id=>state.modules[id]||0;
const carEnabled=id=>!!state.expeditionPlan?.cars?.includes(id)&&!state.disabledCars?.[id];
function resetRun(plan){
  if(window.EndlessRailsCloud&&!window.EndlessRailsCloud.canStart()){window.EndlessRailsCloud.open();return;}
  state.record=runRecord.loadRecord(metaStorage);
  state.metaProfile=longterm.loadMeta(metaStorage);
  state.expeditionPlan=plan||longterm.planFor(state.metaProfile);
  setRegionGround(state.expeditionPlan?.regionId||"wasteland");
  state.longtermRun=longterm.createRun(state.metaProfile,state.expeditionPlan);
  state.metaSettlement=null;state.metaSettled=false;state.disabledCars={};state.breakthroughs={};state.cameraZoom=1;state.targetCameraZoom=1;state.pointDefenseClock=0;state.trainDamage=0;
  const metaBonuses=longterm.trainBonuses(state.metaProfile);
gameAudio?.unlock();gmOpen=false;$("gmPanel").hidden=true;$("pauseScreen").hidden=true;ui.pause.textContent="Ⅱ";ui.pause.setAttribute?.("aria-label","暂停游戏");resetJoystick();const seed=routeEvents.createSeed(Date.now());Object.assign(state,{nextUpgradeAt:0,upgradeReturnMode:"combat",hostileShots:[],weaponStats:{},bondStats:{},worldDistance:0,comboFxAt:-1,swarm:[],routeElapsed:0,docking:null,zones:[],weaponFx:[],weaponClocks:{},mode:"contractChoice",visualTime:0,paused:false,runSeed:seed,activeEvent:null,activeContract:null,routeModifiers:{routeDistance:60,enemySpeed:1,enemyHp:1,eliteChance:.07,coreChance:1,rewardMultiplier:1,scrapMultiplier:1,weather:"clear"},station:1,timer:60,maxTrainHp:Math.round(100*metaBonuses.hpMultiplier),trainHp:Math.round(100*metaBonuses.hpMultiplier),scrap:0,kills:0,combo:0,bestCombo:0,score:0,droneLevel:1,trainLength:state.expeditionPlan?.trainLength||balance.START_TRAIN_LENGTH,fireClock:0,escortClock:.2,missileClock:0,spawnClock:.2,pulseClock:0,railClock:0,hurtFlash:0,shake:0,coreHitCounter:0,enemies:[],shots:[],particles:[],texts:[],selectedUpgrade:null,modules:{},boss:null,shieldReady:false,commandRing:null,rerollUsed:false,...progression.createProgression({routeDistanceTotal:60})});state.train.x=W/2;state.train.y=H/2;Object.assign(state.drone,{x:W/2+45,y:H/2-40,moveSpeed:control.DRONE_MOVE_SPEED,flightAngle:-Math.PI/2,direction:0,bank:0,thrust:0,vx:0,vy:0});ui.start.hidden=true;ui.stationScreen.hidden=true;ui.levelUp.hidden=true;ui.result.hidden=true;ui.eventScreen.hidden=true;ui.contractScreen.hidden=true;ui.hint.style.opacity=.8;openContractChoice();updateHud()}
function update(dt, refreshHud=true) {
  gameAudio?.tick(state.mode,state.paused);
  if(state.trainHp<audioTrainHp)gameAudio?.play("hurt");
  audioTrainHp=state.trainHp;
  if (state.paused || state.mode === "levelup") return;
  if (state.mode === "docking") { updateDocking(dt); if(refreshHud)updateHud(); return; }
  if (state.mode !== "combat") return;
  state.visualTime += dt;
  updateCamera(dt);
  advanceWorld(WORLD_SPEED*dt);
  state.routeElapsed += dt;
  state.routeDistance = progression.advanceRoute(state, dt).routeDistance;
  state.timer = state.routeDistance;
  for (const key of ["fireClock", "escortClock", "missileClock", "spawnClock"]) state[key] -= dt;
  state.pulseClock = Math.max(0, state.pulseClock-dt);
  state.railClock += dt;
  state.hurtFlash = Math.max(0, state.hurtFlash-dt);
  state.shake = Math.max(0, state.shake-dt*20);
  const previousDrone={x:state.drone.x,y:state.drone.y};
  Object.assign(state.drone, control.stepDrone(state.drone, state.moveInput, state.drone.moveSpeed, dt, droneBounds()));
  Object.assign(state.drone,effects.flightPose(state.drone,(state.drone.x-previousDrone.x)/Math.max(dt,.001),(state.drone.y-previousDrone.y)/Math.max(dt,.001),dt));
  state.drone.flash=Math.max(0,(state.drone.flash||0)-dt);
  updateSwarm(dt);
  state.commandRing = control.advanceCommandRing(state.commandRing, dt);
  state.drops = progression.expireDrops(state.drops, dt);
  for (let i=state.drops.length-1; i>=0; i--) {
    const drop=state.drops[i];
    if (Math.hypot(drop.x-state.drone.x,drop.y-state.drone.y) < 28+level("magnet")*16) {
      if(drop.type==="meta-tech"){longterm.awardRisk(state.longtermRun,"components",1);state.drops.splice(i,1);showToast("技术组件已回收 · 风险资源");continue;}
      if(drop.type==="research-data"){longterm.awardRisk(state.longtermRun,"data",1+(longterm.hasBlueprint(state.metaProfile,"bio-scan")?1:0));state.drops.splice(i,1);showToast("研究数据已回收 · 风险资源");continue;}
      if(drop.type==="repair-kit"){state.trainHp=Math.min(state.maxTrainHp,state.trainHp+12);state.drops.splice(i,1);showToast("现场维修 +12");continue;}
      if(drop.type==="blueprint"){longterm.addBlueprintRisk(state.longtermRun,drop.blueprintId);state.drops.splice(i,1);showToast("发现蓝图 · "+(longterm.blueprintById(drop.blueprintId)?.name||"未知"));continue;}
      const picked=progression.collectCore(state,drop.type);
      Object.assign(state,picked.state); state.scrap+=picked.scrap; state.drops.splice(i,1);
      showToast(picked.collected ? "武器核心已装配" : "核心转化为废料");
    }
  }
  // Remove corpses every frame, keeping collision cost proportional to the live cap.
  state.enemies = state.enemies.filter(e=>!e.dead);
  const curve = balance.difficultyAt(state.station, state.routeElapsed, state.routeDistanceTotal);
  if (state.spawnClock<=0) {
    const density=state.expeditionPlan?.region?.density||1,batch=Math.max(1,Math.ceil(curve.batch*density)),cap=Math.ceil(curve.cap*density);
    for (let i=0; i<batch && state.enemies.length<cap; i++) spawnEnemy(i*.1);
    state.spawnClock = curve.interval / Math.max(.75,density) * (state.activeEvent?.id === "freight" ? 1.2 : 1);
  }
  for (const e of state.enemies) {
    if(e.dead)continue;
    if(e.delay>0){e.delay-=dt;continue;}
    stepEnemy(e,dt);
    e.hit=Math.max(0,e.hit-dt*5);
    if(e.kind!=="climber"&&Math.hypot(state.train.x-e.x,state.train.y-e.y)<42)collideTrain(e);
  }
  if (state.station===5 && state.routeElapsed>=22 && !state.boss) {
    state.boss={hp:260,maxHp:260,x:W/2+105,y:-40,r:34,speed:44,hit:0,summon:3.2,dead:false};
    ui.bossWrap.hidden=false;showToast("感染巨兽接近 · 最后防线");
  }
  if (state.boss && !state.boss.dead) {
    const b=state.boss; b.hit=Math.max(0,b.hit-dt*4); b.summon-=dt;
    Object.assign(b,motion.stepChaser(b,dt,state.train,WORLD_SPEED*.15));
    if(b.summon<=0){
      for(let i=0;i<3 && state.enemies.length<curve.cap;i++)spawnEnemy(i*.15);
      b.summon=6; showToast("感染巨兽召集尸群");
    }
    if(Math.hypot(b.x-state.train.x,b.y-state.train.y)<55) {
      state.trainHp=Math.max(0,state.trainHp-7*dt); state.hurtFlash=.1;
    }
  }
  updateHostileShots(dt);
  pointDefenseTick(dt);
  const trainProfile=effects.trainWeaponProfile({modules:state.modules});
  if(trainProfile.railgunDamage&&state.railClock>trainProfile.railgunInterval){fireRailgun(trainProfile);state.railClock=0;}
  updateArsenal(dt);
  updateShots(dt); updateParticles(dt);
  if(state.trainHp<=0){finish(false);return;}
  if(state.routeDistance<=0)startDocking(state.station===5);
  else if(progression.shouldOfferUpgrade(state))openLevelUp();
  // Every route reaches the defense perimeter after exactly 60 seconds.
  if(refreshHud)updateHud();
}
// A coarse density grid avoids an all-pairs search as the horde grows.


function setCommand(vector) {
  if (!canUseJoystick()) return;
  state.moveInput = { x: vector.x, y: vector.y };
  if (vector.strength) ui.hint.style.opacity = 0;
}
const joystickBase = $("joystickBase"), joystickThumb = $("joystickThumb");
const joystickState = { pointerId: null, center: null, radius: 0, keys: new Set() };
const joystickKeys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
function canUseJoystick() { return state.mode === "combat" && !state.paused; }
function resetJoystick() {
  const pointerId = joystickState.pointerId;
  joystickState.pointerId = null;
  joystickState.center = null;
  joystickState.keys.clear();
  state.moveInput = { x: 0, y: 0 };
  joystickBase.hidden = true;
  joystickThumb.style.transform = "translate(0px, 0px)";
  joystickBase.classList.remove("active");
  if (pointerId !== null && canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
}
function syncJoystick() {
  const enabled = canUseJoystick();
  canvas.setAttribute?.("aria-disabled", String(!enabled));
  ui.pulse.disabled = !enabled;
  if (!enabled) resetJoystick();
}
function showJoystickVector(vector, radius) {
  joystickThumb.style.transform = "translate(" + vector.x * radius + "px, " + vector.y * radius + "px)";
  joystickBase.classList.add("active");
  setCommand(vector);
}
function moveJoystick(event) {
  if (event.pointerId !== joystickState.pointerId) return;
  if (!canUseJoystick()) { resetJoystick(); return; }
  event.preventDefault();
  const vector = control.joystickVector({ x: event.clientX, y: event.clientY }, joystickState.center, joystickState.radius);
  showJoystickVector(vector, joystickState.radius);
}
canvas.addEventListener("pointerdown", event => {
  if (!canUseJoystick() || joystickState.pointerId !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
  event.preventDefault();
  joystickState.keys.clear();
  const rect = canvas.getBoundingClientRect();
  joystickState.center = { x: event.clientX, y: event.clientY };
  joystickState.radius = 36;
  joystickBase.style.left = (event.clientX - rect.left) + "px";
  joystickBase.style.top = (event.clientY - rect.top) + "px";
  joystickBase.hidden = false;
  canvas.focus?.({ preventScroll: true });
  joystickState.pointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  moveJoystick(event);
});
canvas.addEventListener("pointermove", moveJoystick);
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(type, event => {
  if (event.pointerId === joystickState.pointerId) resetJoystick();
});
function moveKeyboardJoystick() {
  let x = 0, y = 0;
  for (const key of joystickState.keys) { x += joystickKeys[key][0]; y += joystickKeys[key][1]; }
  const vector = control.joystickVector({ x, y }, { x: 0, y: 0 }, 1, 0);
  setCommand(vector);
}
window.addEventListener("keydown", event => {
  if (!joystickKeys[event.code] || !canUseJoystick() || joystickState.pointerId !== null) return;
  event.preventDefault();
  joystickState.keys.add(event.code);
  moveKeyboardJoystick();
});
window.addEventListener("keyup", event => {
  if (!joystickKeys[event.code] || !joystickState.keys.has(event.code)) return;
  event.preventDefault();
  joystickState.keys.delete(event.code);
  if (!canUseJoystick()) resetJoystick(); else moveKeyboardJoystick();
});
window.addEventListener("blur",()=>{resetJoystick();if(!state.paused&&["combat","docking"].includes(state.mode))togglePause();});
window.addEventListener("resize", resetJoystick);
document.addEventListener?.("visibilitychange", () => { if(document.hidden){resetJoystick();if(!state.paused&&["combat","docking"].includes(state.mode))togglePause();} });
function togglePause(){
  if(settingsOpen)return;
  if(gmOpen){closeGM();return;}
  if(!["combat","docking","station","levelup"].includes(state.mode)||!$("displayHelp").hidden)return;
  state.paused=!state.paused;resetJoystick();
  $("pauseScreen").hidden=!state.paused;
  ui.pause.textContent=state.paused?"▶":"Ⅱ";
  ui.pause.setAttribute?.("aria-label",state.paused?"继续游戏":"暂停游戏");
  if(state.paused){uiHooks.renderPause();$("resumeButton").focus?.();}else canvas.focus?.();
  updateHud();
}
ui.pulse.addEventListener("click",pulse);ui.pause.addEventListener("click",togglePause);ui.reroll.addEventListener("click",rerollUpgrades);
$("startButton").addEventListener("click",()=>{if(window.EndlessRailsMetaUI?.start)window.EndlessRailsMetaUI.start();else resetRun();});
$("restartButton").addEventListener("click",()=>{ui.result.hidden=true;if(window.EndlessRailsMetaUI?.open)window.EndlessRailsMetaUI.open();else resetRun();});
ui.continue.addEventListener("click",continueRun);ui.extract?.addEventListener("click",extractRun);
window.EndlessRailsGame={startRun:resetRun,extractRun,getState:()=>state,reloadSave:()=>{if(["menu","result"].includes(state.mode)){state.metaProfile=longterm.loadMeta(metaStorage);state.record=runRecord.loadRecord(metaStorage);}}};window.addEventListener("keydown",e=>{if(e.code==="Space"&&!state.paused&&!settingsOpen){e.preventDefault();pulse()}if((e.code==="KeyP"||e.code==="Escape")&&!e.repeat){e.preventDefault();togglePause()}});let last=performance.now(),lastHud=0,lastDrawMode=null;
 // QA surface: qa.js inspects the live game through the iframe window.
Object.assign(window,{update,draw,beginRoute,updateHud,openLevelUp,chooseLevelUp,arriveStation,extractRun,syncSwarm,cameraView});
function frame(now){
  // Substeps preserve wall-clock pacing at 20/30 FPS and keep collision steps small.
  const dt=Math.max(0,Math.min(.25,(now-last)/1000));last=now;
  const steps=Math.max(1,Math.ceil(dt/(1/60)));
  for(let i=0;i<steps;i++)update(dt/steps,false);
  if(now-lastHud>=100){updateHud();lastHud=now;}
  if(!state.paused&&(["combat","docking"].includes(state.mode)||lastDrawMode!==state.mode)){draw();lastDrawMode=state.mode;}
  requestAnimationFrame(frame);
}
updateHud();requestAnimationFrame(frame);

// Gesture surfaces belong to the game; do not start text/image drags or long-press menus.
for(const surface of [$("app"),$("startScreen"),$("metaScreen"),$("pauseScreen"),ui.stationScreen,ui.levelUp,ui.eventScreen,ui.contractScreen,ui.result]){
  for(const type of ["dragstart","selectstart","contextmenu"])surface.addEventListener(type,event=>event.preventDefault());
}

$("claimUpgradeButton").addEventListener("click",()=>{if(state.mode==="combat"&&!state.paused&&state.pendingLevelUps>0)openLevelUp();});
// GM values are actual displayed drone levels. Zero undeploys a specialist.
let gmPreviousPause=false,gmOpen=false;
function setGMDroneLevel(id,value){
  const n=Math.max(0,Math.min(30,Math.floor(Number(value)||0)));
  if(id==="gun"||id==="rapid"){
    state.modules.rapid=Math.max(0,n-1);
    if(n===0)state.modules.gunDisabled=1;else delete state.modules.gunDisabled;
    id="gun";
  }else if(id==="wingman"){state.modules.wingman=Math.min(3,n);}
  else if(effects.DRONE_TYPES.some(d=>d.id===id))state.modules[id]=n;else return;
  // A GM edit applies to existing projectiles immediately rather than leaving old test attacks alive.
  state.shots=state.shots.filter(s=>s.owner!==id&&!s.bondId);
  state.zones=state.zones.filter(s=>s.owner!==id&&!s.bondId);
  state.weaponFx=[];state.weaponClocks[id]=0;state.weaponClocks.command=0;
  syncSwarm();updateHud();if(!$("pauseScreen").hidden)uiHooks.renderPause();
  draw();
}
function renderGM(){
  const wrap=$("gmControls");
  wrap.innerHTML=effects.DRONE_TYPES.map(d=>`<label>${effects.droneLabel(d.id)}<input aria-label="${d.name}等级" data-gm-id="${d.id}" type="number" min="0" max="30" value="${effects.droneLevel(state.modules,d.id)}"></label>`).join("")+
    `<label>雨燕僚机数量<input aria-label="僚机数量" data-gm-id="wingman" type="number" min="0" max="3" value="${level("wingman")}"></label>`;
  wrap.querySelectorAll("input[data-gm-id]").forEach(input=>input.addEventListener("change",()=>{setGMDroneLevel(input.dataset.gmId,input.value);input.value=input.dataset.gmId==="wingman"?level("wingman"):effects.droneLevel(state.modules,input.dataset.gmId);renderGMBonds();}));
  renderGMBonds();
}
function renderGMBonds(){
  $("gmBonds").innerHTML=effects.bondStates(state.modules).map(b=>`<div><b>${b.name} · ${b.active?"Lv."+b.level:"未激活"}</b><small>${b.pair.map((id,i)=>effects.droneIdentity(id).name+" Lv."+b.levels[i]).join(" + ")}</small></div>`).join("");
}
function openGM(){gmOpen=true;gmPreviousPause=state.paused;state.paused=true;resetJoystick();$("gmPanel").hidden=false;renderGM();}
function closeGM(){if(!gmOpen)return;gmOpen=false;$("gmPanel").hidden=true;state.paused=gmPreviousPause;updateHud();canvas.focus?.();}
$("gmToggle")?.addEventListener("click",()=>{gmOpen?closeGM():openGM();});
$("gmClose")?.addEventListener("click",closeGM);
$("gmPanel").addEventListener("keydown",e=>{e.stopPropagation?.();if(e.code==="Escape"){e.preventDefault();closeGM();}});
function resizeBattlefield(){
  const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;
  const scale=390/Math.min(box.width,box.height),nextWidth=Math.round(box.width*scale),nextHeight=Math.round(box.height*scale);if(nextHeight===H&&nextWidth===W)return;
  const dx=(nextWidth-W)/2,dy=(nextHeight-H)/2;W=nextWidth;H=nextHeight;canvas.width=W;canvas.height=H;resetJoystick();
  const objects=[state.train,state.drone,...state.swarm,...state.enemies,...state.shots,...state.hostileShots,...state.zones,...state.drops,...state.particles,...state.texts,...state.weaponFx];
  if(state.boss)objects.push(state.boss);
  for(const item of objects){if(Number.isFinite(item.x))item.x+=dx;if(Number.isFinite(item.sx))item.sx+=dx;if(Number.isFinite(item.tx))item.tx+=dx;if(Number.isFinite(item.y))item.y+=dy;if(Number.isFinite(item.sy))item.sy+=dy;if(Number.isFinite(item.ty))item.ty+=dy;}
  const bounds=droneBounds(),view=cameraView();
  state.drone.x=Math.max(bounds.left,Math.min(bounds.right,state.drone.x));state.drone.y=Math.max(bounds.top,Math.min(bounds.bottom,state.drone.y));
  for(const d of state.swarm){d.x=Math.max(view.left+18,Math.min(view.right-18,d.x));d.y=Math.max(view.top+18,Math.min(view.bottom-18,d.y));d.huntTarget=null;d.huntClock=0;}
  if(state.paused)draw();
}

export { state, metaStorage, gameAudio, ctx, TAU, W, H, motion, balance, effects, ui, syncJoystick, longterm, progression, routeEvents, runRecord, carEnabled, resetJoystick, cameraView, carPosition, stationCenter, stationTurrets, bladePositions, togglePause, resizeBattlefield, updateHud, applyResearchProfile, syncSwarm, level, upgradePool, experiencePool };
export const settingsGate = { get open() { return settingsOpen; }, set open(value) { settingsOpen = value; } };
