"use strict";

import { state, motion, presentation } from "../app/engine.js";
import { WORLD_SPEED, advanceWorld } from "./world.js";
import { updateSwarm } from "./run.js";
import { updateParticles, burst, showToast } from "./fx.js";
import { killBoss, releaseCarSuppression } from "./combat.js";
import { enterStation, settleFinish } from "../app/flow-logic.js";

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
  state.hostileShots=[];presentation.hideLevelUp();presentation.resetJoystick();
  showToast("进入车站防区 · 炮台接管");
  presentation.updateHud();
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
    if(d.final){const resultData=settleFinish(true);if(resultData)presentation.renderResult(resultData);}
    else presentation.renderStation(enterStation());
  }
}

export { stationCenter, stationTurrets, startDocking, updateDocking };
