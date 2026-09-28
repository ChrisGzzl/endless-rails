"use strict";

import { $ } from "./dom.js";
import { ui, state, level, longterm, effects, resetJoystick, presentation } from "./game.js";
import { upgradePool, experiencePool, upgradeFamily, scopeLabel, upgradeBrief } from "../sim/station.js";
import { beginRoute } from "../sim/run.js";
import { updateHud } from "../view/hud.js";
import { settleFinish, chooseContract, prepareContractChoice, prepareRouteEvent, prepareLevelUp, breakthroughOptions, chooseUpgrade, chooseBreakthrough, enterStation, selectStationUpgrade, rerollStation, departStation, damageSummary } from "./flow-logic.js";

// DOM presentation of the screen flows. Every transition is computed by
// flow-logic.js; this module only renders its results into the page overlays
// and forwards clicks back. The canvas host (canvas-host.js) renders the same
// flow-logic results on the battlefield canvas for the mini-game builds.

function finish(result){
  const data=settleFinish(result);
  if(data)renderResultDom(data);
}
function renderResultDom(data){
  ui.result.hidden=false;
  const outcome=data.outcome,won=outcome==="won",extracted=outcome==="extracted",settlement=data.settlement;
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

function rerollUpgrades(){
  const picks=rerollStation();
  if(!picks)return;
  ui.reroll.disabled=true;ui.upgrades.innerHTML="";
  renderUpgradeChoices(picks);
  updateHud();
}
function openRouteEvent(){renderRouteEventCards(prepareRouteEvent())}
function renderRouteEventCards(cards){
  if(!cards)return;
  ui.eventList.innerHTML="";ui.eventScreen.hidden=false;
  cards.forEach(({event,intel})=>{
    const card=document.createElement("button");card.className="upgrade-card event-card";card.dataset.type=event.weather;card.dataset.icon=event.id;
    card.innerHTML='<span class="upgrade-icon">'+(event.weather==="dust"?"≈":event.weather==="speed"?"»":"▣")+"</span><span><h3>"+event.name+"</h3><p>"+event.description+intel+"</p></span>";
    card.addEventListener("click",()=>{ui.eventScreen.hidden=true;beginRoute(event)});
    ui.eventList.append(card);
  });
}
function openContractChoice(){
  const choices=prepareContractChoice();
  if(!choices)return;
  ui.contractList.innerHTML="";ui.contractScreen.hidden=false;
  choices.forEach(contract=>{
    const card=document.createElement("button");card.className="upgrade-card event-card";card.dataset.type="contract";card.dataset.icon=contract.id;
    card.innerHTML='<span class="upgrade-icon">◆</span><span><h3>'+contract.name+"</h3><p>"+contract.description+"</p></span>";
    card.addEventListener("click",()=>{ui.contractScreen.hidden=true;renderRouteEventCards(chooseContract(contract))});
    ui.contractList.append(card);
  });
}
function arriveStation() {
  renderStationDom(enterStation());
}
function renderStationDom(data) {
  ui.stationScreen.hidden=false;ui.stationTitle.textContent=String(data.station).padStart(2,"0");
  ui.continue.disabled=true;ui.continue.textContent="选择一项免费大升级";if(ui.extract){ui.extract.hidden=false;ui.extract.disabled=false;}
  ui.upgrades.innerHTML="";ui.reroll.disabled=!data.rerollAffordable;
  renderUpgradeChoices(data.picks);renderTrainPreview();
  if($("stationSalvage")&&data.secured)$("stationSalvage").textContent=`已锁定：废料 ${data.secured.scrap} · 组件 ${data.secured.components} · 数据 ${data.secured.data}。继续失败也保留。`;
  updateHud();if(state.pendingLevelUps>0)openLevelUp();
}
function renderUpgradeChoices(picks) {
  state.selectedUpgrade=null;ui.continue.disabled=true;ui.continue.textContent="选择一项免费大升级";
  picks.forEach(u=>{
    const card=document.createElement("button");card.className="upgrade-card";card.dataset.type="train";card.dataset.icon=u.id;
    card.innerHTML=`<span class="upgrade-icon">${u.icon}</span><span><h3>${u.name} <small>Lv.${level(u.id)+(u.id==="rapid"?2:1)}</small></h3><p>${u.desc}</p></span>`;
    card.addEventListener("click",()=>{
      selectStationUpgrade(u);ui.upgrades.querySelectorAll(".upgrade-card").forEach(x=>x.classList.remove("selected"));
      card.classList.add("selected");ui.continue.disabled=false;ui.continue.textContent="装配并发车 →";
    });ui.upgrades.append(card);
  });
}
function renderTrainPreview(){ui.trainLength.textContent=state.trainLength+" 节车厢";ui.miniTrain.innerHTML="";for(let i=0;i<Math.min(7,state.trainLength);i++){const car=document.createElement("i");car.className="mini-car"+(i===0?" mini-car--cab":"");car.textContent=i===0?"◆":i%2?"▦":"▤";ui.miniTrain.append(car)}}
function extractRun(){
  if(state.mode!=="station")return;
  // Keep the station open if the save write fails, so the player can retry.
  const data=settleFinish("extracted");
  if(!data)return;
  ui.stationScreen.hidden=true;renderResultDom(data);
}
function continueRun() {
  const u=state.selectedUpgrade;if(!u||state.mode!=="station")return;
  ui.stationScreen.hidden=true;
  const cards=departStation();
  if(cards)renderRouteEventCards(cards);
}
function openLevelUp() {
  const picks=prepareLevelUp();
  if(picks)renderLevelUpDom(picks);
}
function renderLevelUpDom(picks) {
  ui.levelUp.dataset.choiceCount="3";
  const eyebrow=ui.levelUp.querySelector(".eyebrow");if(eyebrow)eyebrow.textContent="战斗升级 · 三选一";
  const title=ui.levelUp.querySelector("h2"),copy=ui.levelUp.querySelector(".levelup-heading > p:not(.eyebrow)");
  if(title)title.textContent="选择升级";if(copy)copy.textContent="选择一项武器强化，继续护送。";
  resetJoystick();ui.levelUp.hidden=false;ui.levelUpList.innerHTML="";
  picks.forEach(u=>{
    const card=document.createElement("button");card.className="upgrade-card";
    card.dataset.scope=scopeLabel(effects.weaponOwnership(u.id));card.dataset.weapon=u.id;card.dataset.family=upgradeFamily[u.id];
    card.innerHTML=`<span class="upgrade-icon">${u.icon}</span><span><h3>${u.name} <small>Lv.${level(u.id)+(u.id==="rapid"?2:1)}</small></h3><p>${upgradeBrief[u.id]}</p></span>`;
    card.title=u.desc;
    card.addEventListener("click",()=>chooseLevelUp(u));ui.levelUpList.append(card);
  });
}
function chooseLevelUp(u) {
  const result=chooseUpgrade(u);
  if(result.breakthrough){openBreakthroughChoice(result.weapon);return;}
  ui.levelUp.hidden=true;
  if(state.pendingLevelUps>0)openLevelUp();
  updateHud();
}
function openBreakthroughChoice(id){
  const choices=breakthroughOptions(id);if(!choices.length)return false;
  ui.levelUp.dataset.choiceCount="2";
  const eyebrow=ui.levelUp.querySelector(".eyebrow");if(eyebrow)eyebrow.textContent="专精突破 · 二选一";
  const title=ui.levelUp.querySelector("h2"),copy=ui.levelUp.querySelector(".levelup-heading > p:not(.eyebrow)");
  if(title)title.textContent="Lv10 突破路线";if(copy)copy.textContent=(effects.droneIdentity(id)?.name||id)+" · 选择本局突破方向";
  ui.levelUpList.innerHTML="";
  choices.forEach(choice=>{const card=document.createElement("button");card.className="upgrade-card";card.dataset.weapon=id;card.dataset.family=upgradeFamily[id];card.dataset.icon=choice.id;
    card.innerHTML=`<span class="upgrade-icon">${choice.icon}</span><span><h3>${choice.name}</h3><p>${choice.desc}</p></span>`;
    card.addEventListener("click",()=>{ui.levelUp.hidden=true;const picks=chooseBreakthrough(id,choice);if(picks)renderLevelUpDom(picks);updateHud();});
    ui.levelUpList.append(card);});
  return true;
}
function renderDamageSummary(){
  const data=damageSummary();
  $("resultDroneDamage").innerHTML=data.drones.map(r=>`<span>${r.label} · 普攻<em>${r.damage}</em></span>`).join("")||"<span>暂无记录</span>";
  const live=data.bonds;
  $("resultBondDamage").innerHTML=live.map(b=>{
    return `<div class="bond-result"><span>${b.name} · ${b.stage}<em>${b.damage}</em></span><small>北辰释放 ${b.casts} 次 · 击杀 ${b.kills}</small></div>`;
  }).join("");
  $("resultTrainDamage").innerHTML=`<span>车炮　<em>${data.train}</em></span><span>近防　<em>${data.pointDefense}</em></span><span>有效维修　<em>${data.effectiveRepair}</em></span>`;
}

// Register the three flow screens this panel owns so the engine and the sim
// layer can open them from anywhere in the load order.
presentation.renderLevelUp=renderLevelUpDom;
presentation.renderStation=renderStationDom;
presentation.renderResult=renderResultDom;

export { openLevelUp, openBreakthroughChoice, chooseLevelUp, arriveStation, renderUpgradeChoices, renderTrainPreview, extractRun, continueRun, openRouteEvent, openContractChoice, rerollUpgrades, renderDamageSummary, finish, renderLevelUpDom, renderStationDom, renderResultDom };
