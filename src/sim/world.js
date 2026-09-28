"use strict";

import { state, motion, balance } from "../app/engine.js";
import { W, H } from "../view/surface.js";

function carPosition(i){const {x:fx,y:fy}=motion.FORWARD;return{x:state.train.x-fx*i*balance.CAR_SPACING,y:state.train.y-fy*i*balance.CAR_SPACING}}
function droneBounds(){const v=cameraView();return{left:v.left+24/v.zoom,right:v.right-24/v.zoom,top:v.top+24/v.zoom,bottom:v.bottom-24/v.zoom}}
function advanceWorld(distance) {
  state.worldDistance+=distance;
  const drift=motion.worldDrift(1,distance);
  for(const z of state.zones){
    z.x+=drift.x;z.y+=drift.y;
    if(z.flight>0){z.sx+=drift.x;z.sy+=drift.y;}
  }
  for(const drop of state.drops){drop.x+=drift.x;drop.y+=drift.y;}
}
function updateCamera(dt){
  const n=Math.max(3,state.trainLength||3),base=n<=4?1:n===5?.94:n===6?.89:n===7?.84:n===8?.80:n===9?.76:.72;
  const curve=balance.difficultyAt?.(state.station,state.routeElapsed,state.routeDistanceTotal)||{cap:30};
  const pressure=Math.min(1,state.enemies.length/Math.max(1,curve.cap||30));
  const dynamic=(state.boss?.dead===false)?0.06:(pressure>.78?0.04:0);
  state.targetCameraZoom=Math.max(.72,base-dynamic);
  state.cameraZoom+=(state.targetCameraZoom-state.cameraZoom)*(1-Math.exp(-dt*3.5));
}
function cameraView(){
  const zoom=Math.max(.72,state.cameraZoom||1);
  const tail=state.expeditionPlan?Math.max(0,(state.trainLength||3)-1)*balance.CAR_SPACING:0;
  const cx=state.train.x-motion.FORWARD.x*tail/2,cy=state.train.y-motion.FORWARD.y*tail/2;
  return {zoom,cx,cy,left:cx-W/(2*zoom),right:cx+W/(2*zoom),top:cy-H/(2*zoom),bottom:cy+H/(2*zoom)};
}
const WORLD_SPEED=88;

export { WORLD_SPEED, cameraView, updateCamera, advanceWorld, carPosition, droneBounds };
