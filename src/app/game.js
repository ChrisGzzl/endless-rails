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
const upgradePool=[
 {id:"volatile",type:"train",icon:"✹",name:"连锁爆破协议",desc:"击破敌人引发范围爆炸，适合清理尸群。",cost:0},
 {id:"rapid",type:"drone",icon:"ϟ",name:"脉冲机枪",desc:"射速提升 28%。",cost:28},{id:"missile",type:"drone",icon:"➤",name:"追踪导弹",desc:"每轮发射一枚高伤导弹。",cost:38},{id:"scatter",type:"drone",icon:"✣",name:"裂片散射",desc:"每次射击额外释放两枚碎弹。",cost:44},{id:"tesla",type:"drone",icon:"∿",name:"电弧线圈",desc:"命中后跳电附近目标。",cost:52},{id:"wingman",type:"drone",icon:"◇",name:"伴飞无人机",desc:"增加一架伴飞机，火力 +45%。",cost:64},{id:"overclock",type:"drone",icon:"◎",name:"过载核心",desc:"脉冲冷却时间缩短 30%。",cost:58},
 {id:"armor",type:"train",icon:"⬢",name:"装甲铆接",desc:"最大完整度 +35，撞击伤害降低。",cost:42},{id:"railgun",type:"train",icon:"⌁",name:"车头磁轨炮",desc:"列车向前方周期性发射穿透弹。",cost:46},{id:"cargo",type:"train",icon:"▣",name:"货运舱",desc:"车厢 +1，击破废料收益 +30%。",cost:48},{id:"repair",type:"train",icon:"+",name:"维修车",desc:"每到站额外修复 18 点完整度。",cost:50},{id:"shield",type:"train",icon:"◈",name:"偏转护盾",desc:"每轮抵挡第一次撞击。",cost:55},{id:"magnet",type:"train",icon:"⊕",name:"废料磁吸",desc:"废料收益 +50%，并吸引远处掉落。",cost:60}];
const experiencePool=[
 {id:"blades",icon:"✺",name:effects.droneLabel("blades"),desc:"大范围持续切割，主动靠近尸群；升级扩大刀环。"},
 {id:"incendiary",icon:"♨",name:effects.droneLabel("incendiary"),desc:"专机投掷榴弹；北辰移动方向会牵引落点，主动铺设火墙。"},
 {id:"ricochet",icon:"◉",name:effects.droneLabel("ricochet"),desc:"中程低频能量球，反弹并贯穿尸群。"},
 {id:"rapid",icon:"ϟ",name:effects.droneLabel("rapid"),desc:"升级雨燕的近程机枪，提高射速与单弹伤害。"},{id:"scatter",icon:"✣",name:effects.droneLabel("scatter"),desc:"近程扇形霰弹，贴近尸群集中清扫。"},{id:"piercing",icon:"↠",name:effects.droneLabel("piercing"),desc:"远程低频磁轨弹；主动调整角度让更多敌人排成一线可提高伤害。"},{id:"chain",icon:"∿",name:effects.droneLabel("chain"),desc:"中程中频电弧；靠近密集尸潮时连锁伤害提高。"},{id:"missile",icon:"➤",name:effects.droneLabel("missile"),desc:"远程低频追踪弹，高伤爆炸清理尸群。"},{id:"wingman",icon:"◇",name:effects.droneLabel("wingman"),desc:"增派一架雨燕僚机，独立机枪支援，最多三架。"}];
const stationUpgradePool=upgradePool.filter(u=>u.type==="train"&&!["cargo","railgun","magnet"].includes(u.id));
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
function syncSwarm() {
  const old=new Map(state.swarm.map(d=>[d.id,d]));
  state.swarm=effects.swarmRoster(state.modules).map(spec=>{
    const existing=old.get(spec.id);
    return existing?Object.assign(existing,spec):{...spec,x:state.drone.x,y:state.drone.y,flash:0,angle:-Math.PI/2,flightAngle:-Math.PI/2,direction:0,bank:0,thrust:0,vx:0,vy:0};
  });
}
function updateSwarm(dt) {
  syncSwarm();
  // Read previous positions for all neighbors so separation does not depend on update order.
  const positions=state.swarm.map(d=>({id:d.id,x:d.x,y:d.y}));
  for(const d of state.swarm){
    let target=nearestTarget(d);
    if(d.id==="blades"){
      d.huntClock=(d.huntClock||0)-dt;
      if(d.huntClock<=0){d.huntTarget=bladeHuntTarget(d);d.huntClock=.3;}
      target=d.huntTarget||target;
    }
    const view=cameraView(),center={x:state.drone.x-view.left,y:state.drone.y-view.top};
    const localDrone={...d,x:d.x-view.left,y:d.y-view.top};
    const localTarget=target?{...target,x:target.x-view.left,y:target.y-view.top}:null;
    const goal=effects.autonomousGoal(center,localDrone,localTarget,state.visualTime,view.right-view.left,view.bottom-view.top,state.mode==="combat");
    goal.x+=view.left;goal.y+=view.top;
    for(const other of positions){
      if(other.id===d.id)continue;
      const dx=d.x-other.x,dy=d.y-other.y,length=Math.hypot(dx,dy);
      if(length>0&&length<25){goal.x+=dx/length*(25-length)*.45;goal.y+=dy/length*(25-length)*.45;}
    }
    const dx=goal.x-d.x,dy=goal.y-d.y,length=Math.hypot(dx,dy)||1;
    const speed=Math.min(240,length*4),blend=1-Math.exp(-7*dt);
    let vx=(d.vx||0)+(dx/length*speed-(d.vx||0))*blend;
    let vy=(d.vy||0)+(dy/length*speed-(d.vy||0))*blend;
    const travel=Math.hypot(vx,vy)*dt;
    if(travel>length){vx*=length/travel;vy*=length/travel;}
    const x=Math.max(view.left+18,Math.min(view.right-18,d.x+vx*dt)),y=Math.max(view.top+18,Math.min(view.bottom-18,d.y+vy*dt));
    Object.assign(d,effects.flightPose(d,(x-d.x)/Math.max(dt,.001),(y-d.y)/Math.max(dt,.001),dt));
    d.x=x;d.y=y;d.behavior=goal.behavior;d.flash=Math.max(0,d.flash-dt);
    if(target)d.angle=Math.atan2(target.y-d.y,target.x-d.x);
  }
}
function scopeLabel(scope){return scope==="main-only"?"主机":scope==="escort-only"?"伴飞":scope==="train-only"?"列车":scope==="team-utility"?"全队":"主机"}
const upgradeBrief={blades:"近战持续切割",incendiary:"燃烧区域封锁",ricochet:"弹跳贯穿尸潮",rapid:"机枪射速提升",scatter:"近程扇形霰弹",piercing:"远程直线贯穿",chain:"连锁电弧",missile:"远程追踪爆破",wingman:"增派机枪僚机"};
const upgradeFamily={rapid:"blue",wingman:"blue",piercing:"blue",missile:"red",incendiary:"red",chain:"purple",ricochet:"purple",blades:"cyan",scatter:"cyan"};
function openLevelUp() {
  if(state.mode==="levelup"||state.pendingLevelUps<=0)return;
  const title=ui.levelUp.querySelector("h2"),copy=ui.levelUp.querySelector(".levelup-heading > p:not(.eyebrow)");
  ui.levelUp.dataset.choiceCount="3";
  const eyebrow=ui.levelUp.querySelector(".eyebrow");if(eyebrow)eyebrow.textContent="战斗升级 · 三选一";
  if(title)title.textContent="选择升级";if(copy)copy.textContent="选择一项武器强化，继续护送。";
  state.upgradeReturnMode=state.mode==="station"?"station":"combat";state.mode="levelup";resetJoystick();ui.levelUp.hidden=false;ui.levelUpList.innerHTML="";
  const pool=experiencePool.filter(u=>u.id!=="wingman"||level("wingman")<3).sort(()=>Math.random()-.5);
  // Always offer a distinct trajectory while one remains unlearned.
  const novel=pool.find(u=>u.id!=="rapid"&&u.id!=="wingman"&&!level(u.id));
  const picks=novel?[novel,...pool.filter(u=>u!==novel).slice(0,2)]:pool.slice(0,3);
  picks.forEach(u=>{
    const card=document.createElement("button");card.className="upgrade-card";
    card.dataset.scope=scopeLabel(effects.weaponOwnership(u.id));card.dataset.weapon=u.id;card.dataset.family=upgradeFamily[u.id];
    card.innerHTML=`<span class="upgrade-icon">${u.icon}</span><span><h3>${u.name} <small>Lv.${level(u.id)+(u.id==="rapid"?2:1)}</small></h3><p>${upgradeBrief[u.id]}</p></span>`;
    card.title=u.desc;
    card.addEventListener("click",()=>chooseLevelUp(u));ui.levelUpList.append(card);
  });
}
function breakthroughChoices(id){
  if(id==="missile")return[
    {id:"cluster",icon:"✹",name:"集束弹头",desc:"主弹爆炸后产生三次次级爆破，强化尸潮清理。"},
    {id:"heavy",icon:"⬢",name:"重型弹头",desc:"射速略降，但主弹伤害与爆炸范围显著提高。"}
  ];
  if(id==="piercing")return[
    {id:"focus",icon:"↠",name:"聚束磁轨",desc:"保持单束射击，进一步提高伤害与贯穿能力。"},
    {id:"split",icon:"⋙",name:"双轨齐射",desc:"同时发射两束窄角磁轨弹，扩大覆盖面。"}
  ];
  return[];
}
function openBreakthroughChoice(id){
  const choices=breakthroughChoices(id);if(!choices.length)return false;
  ui.levelUp.dataset.choiceCount="2";
  const eyebrow=ui.levelUp.querySelector(".eyebrow");if(eyebrow)eyebrow.textContent="专精突破 · 二选一";
  state.mode="levelup";ui.levelUp.hidden=false;ui.levelUpList.innerHTML="";
  const title=ui.levelUp.querySelector("h2"),copy=ui.levelUp.querySelector(".levelup-heading > p:not(.eyebrow)");
  if(title)title.textContent="Lv10 突破路线";if(copy)copy.textContent=(effects.droneIdentity(id)?.name||id)+" · 选择本局突破方向";
  choices.forEach(choice=>{const card=document.createElement("button");card.className="upgrade-card";card.dataset.weapon=id;card.dataset.family=upgradeFamily[id];card.dataset.icon=choice.id;
    card.innerHTML=`<span class="upgrade-icon">${choice.icon}</span><span><h3>${choice.name}</h3><p>${choice.desc}</p></span>`;
    card.addEventListener("click",()=>{state.breakthroughs[id]=choice.id;ui.levelUp.hidden=true;state.mode=state.upgradeReturnMode||"combat";state.nextUpgradeAt=state.visualTime+15;showToast((effects.droneIdentity(id)?.name||id)+" · "+choice.name);if(state.pendingLevelUps>0)openLevelUp();updateHud();});
    ui.levelUpList.append(card);});
  return true;
}
function chooseLevelUp(u) {
  gameAudio?.play("upgrade");
  if(u.id==="rapid")delete state.modules.gunDisabled;
  state.modules[u.id]=level(u.id)+1;state.pendingLevelUps=Math.max(0,state.pendingLevelUps-1);
  syncSwarm();
  const droneId=u.id==="rapid"?"gun":u.id,displayLevel=effects.droneLevel(state.modules,droneId),research=longterm.researchProfile(state.metaProfile,droneId);
  if(displayLevel===10&&research.specialized&&["missile","piercing"].includes(droneId)&&!state.breakthroughs[droneId]){
    if(openBreakthroughChoice(droneId)){updateHud();return;}
  }
  ui.levelUp.hidden=true;state.mode=state.upgradeReturnMode||"combat";
  state.nextUpgradeAt=state.visualTime+15;
  if(state.pendingLevelUps>0)openLevelUp();else showToast(level(u.id)===1&&u.id!=="rapid"?"新机加入蜂群":"专机武器升级");
  updateHud();
}
function stationCenter() {
  const distance=state.mode==="docking"?state.docking.offset:
    state.mode==="station"||state.mode==="routeChoice"&&state.docking?0:
    state.station<5&&state.routeDistance<7?WORLD_SPEED*1.2+state.routeDistance*WORLD_SPEED:900;
  return {x:state.train.x+motion.FORWARD.x*distance,y:state.train.y+motion.FORWARD.y*distance};
}
function stationTurrets() {
  const c=stationCenter(),f=motion.FORWARD,n={x:-f.y,y:f.x};
  return [-1,1].flatMap(side=>[-100,60].map(along=>({x:c.x+f.x*along+n.x*side*76,y:c.y+f.y*along+n.y*side*76})));
}
function startDocking(final=false) {
  const offset=final?420:WORLD_SPEED*1.2;
  state.mode="docking";state.docking={time:0,clock:0,offset,startOffset:offset,duration:2*offset/WORLD_SPEED,final};
  state.routeDistance=0;state.timer=0;state.shots=[];state.weaponFx=[];
  state.hostileShots=[];ui.levelUp.hidden=true;resetJoystick();
  showToast("进入车站防区 · 炮台接管");
  updateHud();
}
function updateDocking(dt) {
  const d=state.docking;d.time+=dt;d.clock-=dt;
  const fraction=Math.min(1,d.time/d.duration), previous=d.offset;
  d.offset=d.startOffset*(1-fraction)**2;
  advanceWorld(previous-d.offset);state.visualTime+=dt;updateSwarm(dt);
  for(const z of state.zones){z.flight-=dt;z.life-=dt;}
  state.zones=state.zones.filter(z=>z.life>0);
  state.shake=Math.max(0,state.shake-dt*20);state.hurtFlash=0;
  for(const fx of state.weaponFx)fx.life-=dt;
  state.weaponFx=state.weaponFx.filter(f=>f.life>0);
  for(const e of state.enemies)if(!e.dead) {
    e.delay=0;Object.assign(e,motion.stepChaser(e,dt,state.train,0));
  }
  if(d.time>.5&&d.clock<=0) {
    const turrets=stationTurrets();
    const targets=state.enemies.filter(e=>!e.dead).slice(0,8);
    targets.forEach((e,i)=>{
      const turret=turrets[i%turrets.length];
      state.weaponFx.push({kind:"stationBeam",x:turret.x,y:turret.y,tx:e.x,ty:e.y,life:.24,maxLife:.24});
      releaseCarSuppression(e);e.dead=true;burst(e.x,e.y,"#b8ff4e",10,90);
    });
    if(d.final&&state.boss&&!state.boss.dead){
      const turret=turrets[0],boss=state.boss;
      state.weaponFx.push({kind:"stationBeam",x:turret.x,y:turret.y,tx:boss.x,ty:boss.y,life:.24,maxLife:.24});
      boss.hp-=boss.maxHp*.3;if(boss.hp<=0)killBoss();
    }
    d.clock=.16;
  }
  updateParticles(dt);
  if(d.time>=Math.max(3.4,d.duration+.6)&&!state.enemies.some(e=>!e.dead)&&(!d.final||!state.boss||state.boss.dead)) {
    if(d.final)finish(true);else arriveStation();
  }
}
function arriveStation() {
  gameAudio?.play("station");
  state.mode="station";state.timer=0;state.enemies=[];state.boss=null;state.drops=[];
  ui.bossWrap.hidden=true;longterm.bankRisk(state.longtermRun);state.disabledCars={};
  const fieldRepair=carEnabled("repair")?(longterm.hasBlueprint(state.metaProfile,"field-repair")?18:12):0;
  state.trainHp=Math.min(state.maxTrainHp,state.trainHp+Math.round((25+level("repair")*18+fieldRepair)*longterm.trainBonuses(state.metaProfile).repairMultiplier));
  state.shieldReady=!!level("shield");state.selectedUpgrade=null;
  ui.stationScreen.hidden=false;ui.stationTitle.textContent=String(state.station).padStart(2,"0");
  ui.continue.disabled=true;ui.continue.textContent="选择一项免费大升级";if(ui.extract){ui.extract.hidden=false;ui.extract.disabled=false;}
  ui.upgrades.innerHTML="";state.rerollUsed=false;ui.reroll.disabled=state.scrap<15;
  renderUpgradeChoices();renderTrainPreview();
  const secured=state.longtermRun?.banked;
  if($("stationSalvage")&&secured)$("stationSalvage").textContent=`已锁定：废料 ${secured.scrap} · 组件 ${secured.components} · 数据 ${secured.data}。继续失败也保留。`;
  updateHud();if(state.pendingLevelUps>0)openLevelUp();
}
function renderUpgradeChoices() {
  state.selectedUpgrade=null;ui.continue.disabled=true;ui.continue.textContent="选择一项免费大升级";
  const picks=[...stationUpgradePool].sort(()=>Math.random()-.5).slice(0,3);
  picks.forEach(u=>{
    const card=document.createElement("button");card.className="upgrade-card";card.dataset.type="train";card.dataset.icon=u.id;
    card.innerHTML=`<span class="upgrade-icon">${u.icon}</span><span><h3>${u.name} <small>Lv.${level(u.id)+(u.id==="rapid"?2:1)}</small></h3><p>${u.desc}</p></span>`;
    card.addEventListener("click",()=>{
      state.selectedUpgrade=u;ui.upgrades.querySelectorAll(".upgrade-card").forEach(x=>x.classList.remove("selected"));
      card.classList.add("selected");ui.continue.disabled=false;ui.continue.textContent="装配并发车 →";
    });ui.upgrades.append(card);
  });
}
function renderTrainPreview(){ui.trainLength.textContent=state.trainLength+" 节车厢";ui.miniTrain.innerHTML="";for(let i=0;i<Math.min(7,state.trainLength);i++){const car=document.createElement("i");car.className="mini-car"+(i===0?" mini-car--cab":"");car.textContent=i===0?"◆":i%2?"▦":"▤";ui.miniTrain.append(car)}}
function extractRun(){
  if(state.mode!=="station")return;
  ui.stationScreen.hidden=true;finish("extracted");
}
function continueRun() {
  const u=state.selectedUpgrade;if(!u||state.mode!=="station")return;
  state.modules[u.id]=level(u.id)+1;
  if(u.id==="armor"){state.maxTrainHp+=35;state.trainHp=Math.min(state.maxTrainHp,state.trainHp+35);}
  if(u.id==="cargo")state.trainLength++;
  if(u.id==="shield")state.shieldReady=true;
  state.station++;state.selectedUpgrade=null;ui.stationScreen.hidden=true;openRouteEvent();
}
function openRouteEvent(){const choices=routeEvents.pickRouteEvents(state.runSeed,state.station);if(!choices.length){beginRoute(null);return}state.mode="routeChoice";state.eventChoices=choices;ui.eventList.innerHTML="";ui.eventScreen.hidden=false;choices.forEach(event=>{const card=document.createElement("button");card.className="upgrade-card event-card";card.dataset.type=event.weather;card.dataset.icon=event.id;const intel=carEnabled("radar")?" · 雷达："+(event.weather==="dust"?"Elite 活跃":event.weather==="speed"?"高速威胁":"资源信号增强")+(longterm.hasBlueprint(state.metaProfile,"radar-pulse")?`，移速 ×${event.enemySpeedMultiplier} / 精英 ×${event.eliteChanceMultiplier} / 核心 ×${event.coreChanceMultiplier}`:""):"";card.innerHTML='<span class="upgrade-icon">'+(event.weather==="dust"?"≈":event.weather==="speed"?"»":"▣")+"</span><span><h3>"+event.name+"</h3><p>"+event.description+intel+"</p></span>";card.addEventListener("click",()=>{ui.eventScreen.hidden=true;beginRoute(event)});ui.eventList.append(card)})}
function openContractChoice(){const choices=routeEvents.pickContracts(state.runSeed);if(!choices.length){state.activeContract=routeEvents.CONTRACTS?.[0]||null;openRouteEvent();return}state.mode="contractChoice";state.contractChoices=choices;ui.contractList.innerHTML="";ui.contractScreen.hidden=false;choices.forEach(contract=>{const card=document.createElement("button");card.className="upgrade-card event-card";card.dataset.type="contract";card.dataset.icon=contract.id;card.innerHTML='<span class="upgrade-icon">◆</span><span><h3>'+contract.name+"</h3><p>"+contract.description+"</p></span>";card.addEventListener("click",()=>{state.activeContract=contract;ui.contractScreen.hidden=true;openRouteEvent()});ui.contractList.append(card)})}
function beginRoute(event) {
  state.activeEvent=event||routeEvents.ROUTE_EVENTS?.[0]||null;
  state.routeModifiers=routeEvents.applyRouteModifiers({routeDistance:balance.routeDuration(state.station),enemySpeed:1,enemyHp:1,eliteChance:1,coreChance:1,rewardMultiplier:1,scrapMultiplier:1},state.activeEvent,state.activeContract);
  const region=state.expeditionPlan?.region||{enemyHp:1,reward:1};state.routeModifiers.enemyHp*=region.enemyHp||1;state.routeModifiers.rewardMultiplier*=region.reward||1;state.routeModifiers.scrapMultiplier*=Math.sqrt(region.reward||1);
  state.mode="combat";state.routeElapsed=0;state.docking=null;
  state.routeDistanceTotal=state.routeModifiers.routeDistance;state.routeDistance=state.routeDistanceTotal;
  state.timer=state.routeDistance;state.enemies=[];state.hostileShots=[];state.shots=[];state.zones=[];state.weaponFx=[];
  state.spawnClock=balance.spawnInterval(state.station);state.fireClock=0;state.shieldReady=!!level("shield");
  syncSwarm();spawnWave();showToast(state.station===1?"稀疏尸群 · 先积累火力":state.activeEvent?.name||"模块在线");updateHud();
}
function rerollUpgrades(){if(state.rerollUsed||state.scrap<15||state.mode!=="station")return;state.scrap-=15;state.rerollUsed=true;ui.reroll.disabled=true;ui.upgrades.innerHTML="";renderUpgradeChoices();showToast("补给重新编排");updateHud()}
function pulse(){if(state.mode!=="combat"||state.paused||state.pulseClock>0)return;gameAudio?.play("pulse");state.pulseClock=Math.max(3.8,7-level("overclock")*1.4);state.shake=12;state.enemies.forEach(e=>{if(!e.dead&&Math.hypot(e.x-state.train.x,e.y-state.train.y)<190){e.hp-=4.5;burst(e.x,e.y,"#5de1df",10,100);if(e.hp<=0)killEnemy(e)}});if(state.boss&&Math.hypot(state.boss.x-state.train.x,state.boss.y-state.train.y)<220){state.boss.hp-=8;state.boss.hit=1;if(state.boss.hp<=0)killBoss()}burst(state.train.x,state.train.y,"#5de1df",34,170);showToast("电磁脉冲")}
function renderDamageSummary(){
  const fmt=n=>Number((n||0).toFixed(1)).toString();
  const rows=Object.entries(state.weaponStats).filter(([id,v])=>!id.startsWith("train-")&&(v.volleys||v.damage)).sort((a,b)=>(b[1].damage||0)-(a[1].damage||0));
  $("resultDroneDamage").innerHTML=rows.map(([id,v])=>`<span>${effects.droneIdentity(id)?.name||id}${id.startsWith("escort")?" "+(Number(id.slice(6))+1):""} · 普攻<em>${fmt(v.damage)}</em></span>`).join("")||"<span>暂无记录</span>";
  const live=effects.bondStates(state.modules);
  $("resultBondDamage").innerHTML=live.map(b=>{
    const v=state.bondStats[b.id]||{damage:0,kills:0,casts:0,maxLevel:0};
    const stage=b.active?"Lv."+b.level:v.casts?"已失效 · 最高 Lv."+v.maxLevel:"未激活";
    return `<div class="bond-result"><span>${b.name} · ${stage}<em>${fmt(v.damage)}</em></span><small>北辰释放 ${v.casts} 次 · 击杀 ${v.kills}</small></div>`;
  }).join("");
  $("resultTrainDamage").textContent=`车炮　${fmt(state.trainDamage)}`;
}
function settleLongterm(outcome){
  if(state.metaSettled)return state.metaSettlement;
  const settlement=longterm.settleRun(state.metaProfile,state.longtermRun,outcome,{storageActive:carEnabled("storage"),kills:state.kills,elapsed:state.routeElapsed});
  state.metaProfile=settlement.meta;state.metaSettlement=settlement;state.metaSettled=true;longterm.saveMeta(metaStorage,state.metaProfile);
  window.EndlessRailsMetaUI?.refresh?.();return settlement;
}
function finish(result){
  if(state.mode==="result"&&state.metaSettled)return;
  const outcome=result===true?"won":result==="extracted"?"extracted":"lost";
  state.mode="result";state.outcome=outcome;
  const settlement=settleLongterm(outcome);
  state.record=runRecord.mergeRecord(state.record,runRecord.buildRunSummary(state));runRecord.saveRecord(metaStorage,state.record);
  ui.result.hidden=false;
  const won=outcome==="won",extracted=outcome==="extracted";
  $("resultBadge").dataset.outcome=outcome;$("resultBadge").textContent="";
  $("resultEyebrow").textContent=won?"远征完成":extracted?"安全撤离":"列车失守";
  $("resultTitle").textContent=won?"列车穿过了黑夜":extracted?"资源已经锁定":"铁轨被荒原吞没";
  $("resultCopy").textContent=won?"你完成了区域远征，并将成果带回列车。":extracted?"你选择在风险继续扩大前返回基地。":"已锁定资源被带回，未保护的风险资源发生损失。";
  $("resultKills").textContent=state.kills;$("resultStations").textContent=(outcome==="won"?5:state.longtermRun?.stationsBanked||0);$("resultScrap").textContent=state.scrap;
  renderDamageSummary();
  ui.resultBuild.textContent="构筑："+Object.keys(state.modules).filter(id=>level(id)>0).map(id=>(experiencePool.find(u=>u.id===id)||upgradePool.find(u=>u.id===id))?.name||id).join(" / ")+" / 核心："+Object.keys(state.coreStacks).filter(id=>state.coreStacks[id]>0).join(" · ");
  const gained=settlement?.gained||{scrap:0,components:0,data:0},bps=settlement?.blueprints||[];
  if(ui.resultMeta)ui.resultMeta.textContent=`长期带回：废料 ${gained.scrap} · 技术组件 ${gained.components} · 研究数据 ${gained.data} · 列车 XP +${settlement?.trainXp||0}`+(bps.length?" · 新蓝图："+bps.map(id=>longterm.blueprintById(id)?.name||id).join(" / "):"");
  ui.resultRecord.textContent="最佳："+state.record.bestStations+" 站 · "+state.record.bestCombo+" 连杀";
}


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

export { state, metaStorage, gameAudio, ctx, TAU, W, H, motion, balance, effects, ui, syncJoystick, longterm, progression, cameraView, carPosition, stationCenter, stationTurrets, bladePositions, togglePause, resizeBattlefield, updateHud, resetJoystick, applyResearchProfile, syncSwarm, level, upgradePool, experiencePool };
export const settingsGate = { get open() { return settingsOpen; }, set open(value) { settingsOpen = value; } };
