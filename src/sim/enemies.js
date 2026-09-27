"use strict";

import { state, TAU, motion, level, longterm } from "../app/game.js";
import { WORLD_SPEED, carPosition } from "./world.js";
import { burst, showToast } from "./fx.js";

function stepEnemy(e,dt){
  if(e.kind==="climber"){
    const target=carPosition(Math.max(1,Math.min(state.trainLength-1,e.targetCarIndex||1)));
    if(e.attached){
      e.x=target.x+Math.sin(e.hue*TAU)*10;e.y=target.y+Math.cos(e.hue*TAU)*8;
      if(e.targetCarId)state.disabledCars[e.targetCarId]=true;
      return;
    }
    Object.assign(e,motion.stepChaser(e,dt,target,WORLD_SPEED*.08));
    if(Math.hypot(e.x-target.x,e.y-target.y)<20){
      e.attached=true;e.suppressedCar=e.targetCarId;if(e.suppressedCar)state.disabledCars[e.suppressedCar]=true;
      showToast("攀爬感染者压制 · "+(longterm.CAR_DEFS?.find?.(c=>c.id===e.suppressedCar)?.name||"功能车厢"));
    }
    return;
  }
  const distance=Math.hypot(e.x-state.train.x,e.y-state.train.y);
  if(e.kind==="spitter"&&distance>90&&distance<210){
    e.spitClock-=dt;
    if(e.spitClock<=0&&state.hostileShots.length<32){
      const a=Math.atan2(state.train.y-e.y,state.train.x-e.x);
      state.hostileShots.push({x:e.x,y:e.y,vx:Math.cos(a)*150,vy:Math.sin(a)*150,life:2.5,damage:2.5});
      e.spitClock=2.8;e.spitFlash=.25;
    }
  }else{
    const target=e.kind==="crawler"?{x:state.train.x+Math.sin(state.visualTime*2.2+e.hue*TAU)*32,y:state.train.y}:state.train;
    Object.assign(e,motion.stepChaser(e,dt,target,WORLD_SPEED*.3));
  }
  e.spitFlash=Math.max(0,(e.spitFlash||0)-dt);
}
function updateHostileShots(dt){
  for(const s of state.hostileShots){
    s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;
    if(Math.hypot(s.x-state.train.x,s.y-state.train.y)<27){
      state.trainHp=Math.max(0,state.trainHp-s.damage*(1-Math.min(.36,level("armor")*.12)));
      state.hurtFlash=.15;s.life=0;burst(s.x,s.y,"#cce855",5,45);
    }
  }
  state.hostileShots=state.hostileShots.filter(s=>s.life>0);
}

export { stepEnemy, updateHostileShots };
