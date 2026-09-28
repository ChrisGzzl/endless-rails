"use strict";

import { state, level, balance, effects, progression, longterm } from "../app/engine.js";
import { TAU } from "../view/surface.js";
import { burst, addText, showToast, showCombo } from "./fx.js";

function killBoss(){if(!state.boss||state.boss.dead)return;state.boss.dead=true;state.score+=1200;state.scrap+=80;if(state.longtermRun){longterm.awardRisk(state.longtermRun,"components",4);longterm.awardRisk(state.longtermRun,"data",3);const bp=longterm.rollBlueprint(state.metaProfile,state.expeditionPlan?.regionId);if(bp)longterm.addBlueprintRisk(state.longtermRun,bp);}state.shake=15;burst(state.boss.x,state.boss.y,"#ffb45f",60,190);showToast("感染巨兽核心崩解 · 高价值资料已回收")}
function killEnemy(e, fromBlast=false){
  if(e.rewarded)return;e.dead=true;e.rewarded=true;releaseCarSuppression(e);
  state.kills++;state.combo++;state.bestCombo=Math.max(state.bestCombo,state.combo);
  const gain=Math.ceil((e.elite?14:6)*(1+level("cargo")*.3+level("magnet")*.5)*state.routeModifiers.scrapMultiplier);
  state.scrap+=gain;state.score+=Math.ceil((e.elite?130:50)*Math.max(1,state.combo)*state.routeModifiers.rewardMultiplier);
  if(state.longtermRun){
    longterm.awardRisk(state.longtermRun,"scrap",Math.max(1,Math.round((e.elite?4:1)*(state.expeditionPlan?.region?.reward||1))));
    if(["charger","climber","spitter"].includes(e.kind)){state.longtermRun.specialKills++;if(Math.random()<.18)state.drops.push({type:"research-data",x:e.x,y:e.y,life:7});}
    if(e.elite){
      state.longtermRun.eliteKills++;state.drops.push({type:"meta-tech",x:e.x,y:e.y,life:8});
      if(Math.random()<.14){const bp=longterm.rollBlueprint(state.metaProfile,state.expeditionPlan?.regionId);if(bp)state.drops.push({type:"blueprint",blueprintId:bp,x:e.x+10,y:e.y-8,life:10});}
    }else if(Math.random()<.025)state.drops.push({type:"repair-kit",x:e.x,y:e.y,life:6});
  }
  const xp=progression.awardExperience(state,progression.experienceForEnemy(e,state.station,state.level));Object.assign(state,xp.state);
  let firstDropRoll=true;const coreType=progression.rollCoreDrop({elite:e.elite,combo:state.combo,random:()=>{const value=Math.random();if(firstDropRoll){firstDropRoll=false;return value/Math.max(.01,state.routeModifiers.coreChance)}return value}});
  if(coreType)state.drops.push({type:coreType,x:e.x,y:e.y,life:8});
  if((level("volatile")||e.kind==="bloater")&&!fromBlast){const blast=effects.applyAreaDamage(state.enemies.filter(target=>target!==e),e,e.kind==="bloater"?54:balance.KILL_BLAST_RADIUS,e.kind==="bloater"?1.2:balance.KILL_BLAST_DAMAGE);for(const target of blast.defeated)killEnemy(target,true);if(blast.hitCount)burst(e.x,e.y,"#ffb45f",18,100)}
  state.shake=e.elite?7:3;addText("+"+gain,e.x,e.y-15,"#ffb45f");burst(e.x,e.y,e.elite?"#ffb45f":"#b6e36b",e.elite?26:16,e.elite?125:90);showCombo()
}
function combatTargets() {
  return [...state.enemies.filter(e=>!e.dead&&e.delay<=0),...(state.boss&&!state.boss.dead?[state.boss]:[])];
}
function damageTarget(target, amount, owner) {
  if(!target||target.dead||target.hp<=0||!Number.isFinite(amount)||amount<=0)return 0;
  const source=typeof owner==="string"?{owner}:owner||{};
  const actual=Math.min(Math.max(0,target.hp),amount);
  if(source.owner){
    const stats=source.bondId?bondStatsFor(source.bondId,source.bondLevel):normalStatsFor(source.owner);
    stats.damage+=actual;
    if(target.hp<=amount)stats.kills++;
  }
  target.hp-=actual; target.hit=1;
  if(target.hp<=0)target===state.boss?killBoss():killEnemy(target);
  return actual;
}
function normalStatsFor(id){return state.weaponStats[id]||={damage:0,kills:0,volleys:0};}
function bondStatsFor(id,level=1){
  state.bondStats||={};const s=state.bondStats[id]||={damage:0,kills:0,casts:0,maxLevel:0};
  s.maxLevel=Math.max(s.maxLevel,level||1);return s;
}
function areaHit(center,radius,damage,owner=center) {
  for(const target of combatTargets())if(Math.hypot(target.x-center.x,target.y-center.y)<radius+target.r)damageTarget(target,damage,owner);
}
function ricochetBurst(x,y,r,source={}){
  if(state.weaponFx.filter(f=>f.kind==="ricochetBurst").length<24)state.weaponFx.push({kind:"ricochetBurst",x,y,r,life:.32,maxLife:.32,breakthrough:source.breakthrough,bondId:source.bondId});
}
function bladeHuntTarget(origin){
  const cells=new Map();
  for(const e of state.enemies){
    if(e.dead||e.delay>0||Math.hypot(e.x-state.drone.x,e.y-state.drone.y)>200)continue;
    const key=Math.floor(e.x/56)+","+Math.floor(e.y/56),cell=cells.get(key)||{x:0,y:0,count:0};
    cell.x+=e.x;cell.y+=e.y;cell.count++;cells.set(key,cell);
  }
  let best,score=-Infinity;
  for(const c of cells.values()){
    c.x/=c.count;c.y/=c.count;
    const value=c.count-Math.hypot(c.x-origin.x,c.y-origin.y)/160;
    if(value>score){score=value;best=c;}
  }
  return best;
}
function nearestTarget(origin,range=Infinity){
  let nearest,distance=Infinity;
  for(const e of state.enemies){
    if(e.dead||e.delay>0)continue;
    const squared=(e.x-origin.x)**2+(e.y-origin.y)**2;
    if(squared<distance&&squared<=(range+(e.r||0))**2){distance=squared;nearest=e;}
  }
  const boss=state.boss;
  if(boss&&!boss.dead){const squared=(boss.x-origin.x)**2+(boss.y-origin.y)**2;if(squared<distance&&squared<=(range+(boss.r||0))**2)nearest=boss;}
  return nearest;
}
function collideTrain(e){e.dead=true;releaseCarSuppression(e);if(state.shieldReady){state.shieldReady=false;burst(e.x,e.y,"#7ce9e6",14,80);showToast("护盾挡下撞击");return}const damage=(e.elite?11:6)*(e.kind==="charger"?1.8:1)*(1-Math.min(.36,level("armor")*.12));state.trainHp=Math.max(0,state.trainHp-damage);state.hurtFlash=.3;state.shake=5;burst(e.x,e.y,"#f16d63",9,60);addText("-"+Math.ceil(damage),state.train.x,state.train.y-40,"#f16d63")}
function releaseCarSuppression(enemy){
  const id=enemy?.suppressedCar;if(!id)return;
  if(!state.enemies.some(other=>other!==enemy&&!other.dead&&other.attached&&other.suppressedCar===id))delete state.disabledCars[id];
}

export { releaseCarSuppression, collideTrain, nearestTarget, bladeHuntTarget, combatTargets, damageTarget, normalStatsFor, bondStatsFor, areaHit, ricochetBurst, killEnemy, killBoss };
