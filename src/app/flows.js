"use strict";

import { $ } from "./dom.js";
import { ui, state, level, carEnabled, gameAudio, longterm, routeEvents, effects, resetJoystick, runRecord, metaStorage } from "./game.js";
import { upgradePool, experiencePool, stationUpgradePool, upgradeFamily, upgradeBrief, scopeLabel } from "../sim/station.js";
import { syncSwarm, settleLongterm, beginRoute } from "../sim/run.js";
import { showToast } from "../sim/fx.js";
import { updateHud } from "../view/hud.js";

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
function rerollUpgrades(){if(state.rerollUsed||state.scrap<15||state.mode!=="station")return;state.scrap-=15;state.rerollUsed=true;ui.reroll.disabled=true;ui.upgrades.innerHTML="";renderUpgradeChoices();showToast("补给重新编排");updateHud()}
function openRouteEvent(){const choices=routeEvents.pickRouteEvents(state.runSeed,state.station);if(!choices.length){beginRoute(null);return}state.mode="routeChoice";state.eventChoices=choices;ui.eventList.innerHTML="";ui.eventScreen.hidden=false;choices.forEach(event=>{const card=document.createElement("button");card.className="upgrade-card event-card";card.dataset.type=event.weather;card.dataset.icon=event.id;const intel=carEnabled("radar")?" · 雷达："+(event.weather==="dust"?"Elite 活跃":event.weather==="speed"?"高速威胁":"资源信号增强")+(longterm.hasBlueprint(state.metaProfile,"radar-pulse")?`，移速 ×${event.enemySpeedMultiplier} / 精英 ×${event.eliteChanceMultiplier} / 核心 ×${event.coreChanceMultiplier}`:""):"";card.innerHTML='<span class="upgrade-icon">'+(event.weather==="dust"?"≈":event.weather==="speed"?"»":"▣")+"</span><span><h3>"+event.name+"</h3><p>"+event.description+intel+"</p></span>";card.addEventListener("click",()=>{ui.eventScreen.hidden=true;beginRoute(event)});ui.eventList.append(card)})}
function openContractChoice(){const choices=routeEvents.pickContracts(state.runSeed);if(!choices.length){state.activeContract=routeEvents.CONTRACTS?.[0]||null;openRouteEvent();return}state.mode="contractChoice";state.contractChoices=choices;ui.contractList.innerHTML="";ui.contractScreen.hidden=false;choices.forEach(contract=>{const card=document.createElement("button");card.className="upgrade-card event-card";card.dataset.type="contract";card.dataset.icon=contract.id;card.innerHTML='<span class="upgrade-icon">◆</span><span><h3>'+contract.name+"</h3><p>"+contract.description+"</p></span>";card.addEventListener("click",()=>{state.activeContract=contract;ui.contractScreen.hidden=true;openRouteEvent()});ui.contractList.append(card)})}
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

export { openLevelUp, breakthroughChoices, openBreakthroughChoice, chooseLevelUp, arriveStation, renderUpgradeChoices, renderTrainPreview, extractRun, continueRun, openRouteEvent, openContractChoice, rerollUpgrades, renderDamageSummary, finish };
