"use strict";

import { state, ui, balance, motion } from "../app/game.js";
import { cameraView } from "./world.js";

function spawnWave(){const count=balance.initialWaveCount(state.station);for(let i=0;i<count;i++)spawnEnemy(i*.14);state.boss=null;ui.bossWrap.hidden=true;}
function spawnEnemy(delay=0) {
  const curve = balance.difficultyAt(state.station, state.routeElapsed, state.routeDistanceTotal);
  const sides = ["top", "right", "bottom", "left"], side = sides[Math.floor(Math.random()*4)];
  const view=cameraView();
  const point = motion.spawnPoint(side, view.right-view.left, view.bottom-view.top, 34);
  point.x+=view.left;point.y+=view.top;
  const region=state.expeditionPlan?.region||{elite:1};
  const elite = Math.random() < curve.eliteChance * (state.activeEvent?.eliteChanceMultiplier || 1) * (region.elite||1);
  const kind=balance.enemyTypeAt(state.station,state.routeElapsed,elite),type=balance.ENEMY_TYPES[kind];
  const hp = curve.hp * type.hp * state.routeModifiers.enemyHp;
  const enemy={ ...point,kind,spitClock:1.5+Math.random(),r:type.r,hp,maxHp:hp,
    speed: curve.speed * type.speed * state.routeModifiers.enemySpeed,
    hue: Math.random(), elite, side, delay, hit: 0, dead: false };
  if(kind==="climber"){
    const cars=(state.expeditionPlan?.cars||[]).map((id,index)=>({id,index:index+1})).filter(car=>car.id!=="hangar");
    const target=cars[Math.floor(Math.random()*Math.max(1,cars.length))]||{id:"hangar",index:1};
    enemy.targetCarIndex=target.index;enemy.targetCarId=target.id;
  }
  state.enemies.push(enemy);
}

export { spawnWave, spawnEnemy };
