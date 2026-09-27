'use strict';
const assert=require('node:assert/strict'),createGame=require('./test-harness.cjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const g=createGame();
g.run(`resetRun({regionId:'wasteland',region:longterm.REGIONS[0],cars:['hangar','pointDefense','storage','radar','repair'],trainLength:6});state.cameraZoom=.85;`);
for(const [width,height] of [[360,450],[390,660],[844,230]]){
 g.elements.gameCanvas.getBoundingClientRect=()=>({width,height});g.run('resizeBattlefield();');
 assert.equal(g.run('Array.from({length:state.trainLength},(_,i)=>carPosition(i)).every(p=>{const v=cameraView();return p.x>v.left+20&&p.x<v.right-20&&p.y>v.top+20&&p.y<v.bottom-20;})'),true,'all six cars fit the visible world');
 g.run(`state.mode='combat';state.spawnClock=Infinity;state.enemies=[];state.moveInput={x:1,y:0};state.drone.x=droneBounds().right-1;update(.1);`);
 near(g.run('state.drone.x'),g.run('droneBounds().right'));
 g.run('state.enemies=[];for(let i=0;i<100;i++)spawnEnemy();');
 assert.equal(g.run('state.enemies.every(e=>{const v=cameraView();return e.x<v.left||e.x>v.right||e.y<v.top||e.y>v.bottom;})'),true,'spawn is outside the actual camera');
 g.run(`state.enemies=[];state.shots=[{x:cameraView().right-11,y:cameraView().cy,vx:270,vy:0,life:2,bounce:true,bounces:3,damage:1}];updateShots(.1);`);
 assert.ok(g.run('state.shots[0].vx')<0,'ricochet reflects at visible border');
}
// A low frame rate must not stretch the advertised 60-second route.
for(const fps of [20,30,60]){
 const t=createGame();t.run(`resetRun();state.activeContract=routeEvents.CONTRACTS[2];beginRoute(routeEvents.ROUTE_EVENTS[2]);state.spawnClock=Infinity;state.enemies=[];`);
 t.run(`for(let i=1;i<=${fps*59};i++)nextFrame(i*1000/${fps});`,10000);
 near(t.run('state.routeDistance'),1);
 t.run(`for(let i=${fps*59+1};i<=${fps*60+1};i++)nextFrame(i*1000/${fps});`);
 assert.equal(t.run('state.mode'),'docking');
}
console.log('camera world, long-train framing and real-time 20/30/60 FPS pacing passed');
