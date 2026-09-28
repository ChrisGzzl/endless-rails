"use strict";

import { state, level, gameAudio, effects, longterm, routeEvents, balance, metaStorage, presentation } from "../app/engine.js";
import { cameraView } from "./world.js";
import { nearestTarget, bladeHuntTarget, killEnemy, killBoss } from "./combat.js";
import { burst, showToast } from "./fx.js";
import { spawnWave } from "./spawn.js";

function settleLongterm(outcome){
  if(state.metaSettled)return state.metaSettlement;
  const segmentProgress=state.routeDistanceTotal>0?1-Math.max(0,Math.min(1,state.routeDistance/state.routeDistanceTotal)):0;
  const settlement=longterm.settleRun(state.metaProfile,state.longtermRun,outcome,{segmentProgress,kills:state.kills,elapsed:state.routeElapsed});
  state.metaProfile=settlement.meta;state.metaSettlement=settlement;state.metaSettled=true;longterm.saveMeta(metaStorage,state.metaProfile);
  window.EndlessRailsMetaUI?.refresh?.();return settlement;
}
function pulse(){if(state.mode!=="combat"||state.paused||state.pulseClock>0)return;gameAudio?.play("pulse");state.pulseClock=Math.max(3.8,7-level("overclock")*1.4);state.shake=12;const damageMul=state.runStats?.droneDamageMul??1;state.enemies.forEach(e=>{if(!e.dead&&Math.hypot(e.x-state.train.x,e.y-state.train.y)<190){e.hp-=4.5*damageMul;burst(e.x,e.y,"#5de1df",10,100);if(e.hp<=0)killEnemy(e)}});if(state.boss&&Math.hypot(state.boss.x-state.train.x,state.boss.y-state.train.y)<220){state.boss.hp-=8*damageMul;state.boss.hit=1;if(state.boss.hp<=0)killBoss()}burst(state.train.x,state.train.y,"#5de1df",34,170);showToast("电磁脉冲")}
function beginRoute(event) {
  state.activeEvent=event||routeEvents.ROUTE_EVENTS?.[0]||null;
  state.routeModifiers=routeEvents.applyRouteModifiers({routeDistance:balance.routeDuration(state.station),enemySpeed:1,enemyHp:1,eliteChance:1,coreChance:1,rewardMultiplier:1,scrapMultiplier:1},state.activeEvent,state.activeContract);
  const region=state.expeditionPlan?.region||{enemyHp:1,reward:1};state.routeModifiers.enemyHp*=region.enemyHp||1;state.routeModifiers.rewardMultiplier*=region.reward||1;state.routeModifiers.scrapMultiplier*=Math.sqrt(region.reward||1);
  state.mode="combat";state.routeElapsed=0;state.docking=null;
  state.routeDistanceTotal=state.routeModifiers.routeDistance;state.routeDistance=state.routeDistanceTotal;
  state.timer=state.routeDistance;state.enemies=[];state.hostileShots=[];state.shots=[];state.zones=[];state.weaponFx=[];
  state.spawnClock=balance.spawnInterval(state.station);state.fireClock=0;state.shieldReady=!!level("shield");
  syncSwarm();spawnWave();showToast(state.station===1?"稀疏尸群 · 先积累火力":state.activeEvent?.name||"模块在线");presentation.updateHud();
}
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

export { syncSwarm, updateSwarm, beginRoute, pulse, settleLongterm };
