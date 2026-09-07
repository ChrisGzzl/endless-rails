"use strict";
const assert=require("node:assert/strict");
const createGame=require("./test-harness.cjs");
const balance=require("./balance.js"),progression=require("./progression.js"),events=require("./route-events.js");
for(let station=1;station<=5;station++)for(const event of events.ROUTE_EVENTS){
  const {run}=createGame();
  run(`state.station=${station};beginRoute(routeEvents.ROUTE_EVENTS.find(e=>e.id==="${event.id}"));`);
  assert.equal(run('state.routeDistanceTotal'),60,"route modifiers never shorten the 60-second run");
}
assert.ok(balance.difficultyAt(5,60,60).hp<1.7);
assert.ok(balance.difficultyAt(5,60,60).cap>200);
const kinds=new Set();for(let i=0;i<100;i++)kinds.add(balance.enemyTypeAt(5,40,false,()=>i/100));
assert.equal(kinds.size,5);assert.equal(balance.enemyTypeAt(5,40,true),"brute");
assert.equal(balance.enemyTypeAt(1,0,false,()=>.2),"walker","opening avoids special pressure");
assert.ok(progression.experienceForEnemy({},5,10)<progression.experienceForEnemy({},1,10));
assert.ok(progression.experienceForEnemy({},1,10)<1);
assert.equal(progression.experienceForEnemy({},1,1),1,"first two upgrades still form the initial fleet quickly");

const {run,sandbox,elements}=createGame();
run(`state.mode="combat";state.routeDistance=50;state.level=4;state.pendingLevelUps=2;state.visualTime=10;state.nextUpgradeAt=20;`);
assert.equal(run('progression.shouldOfferUpgrade(state)'),false);
run('state.visualTime=20;');assert.equal(run('progression.shouldOfferUpgrade(state)'),true);
run('state.routeDistance=4;');assert.equal(run('progression.shouldOfferUpgrade(state)'),false,"reserve final approach for uninterrupted combat");
run('startDocking(false);');assert.equal(run('state.pendingLevelUps'),2,"arrival preserves earned upgrades");
run('arriveStation();');assert.equal(run('state.mode'),"levelup");
run('chooseLevelUp(experiencePool[0]);chooseLevelUp(experiencePool[1]);');
assert.equal(run('state.mode'),"station");assert.equal(run('state.pendingLevelUps'),0);

// Reframing changes the available world, not the shape or relative position of units.
run(`state.drone.x=240;state.drone.y=300;state.zones=[{x:170,y:280,sx:180,sy:260,flight:.5,life:4}];
state.hostileShots=[{x:90,y:170,vx:0,vy:20,life:2}];state.enemies=[{x:100,y:200}];`);
const before=JSON.parse(run('JSON.stringify({train:{...state.train},drone:{...state.drone},zone:{...state.zones[0]}})'));
elements.gameCanvas.getBoundingClientRect=()=>({width:393,height:720});run('resizeBattlefield();');
assert.ok(Math.abs(run('W/H')-393/720)<.002,"canvas uses the same aspect as its CSS box");
assert.equal(run('state.drone.y-state.train.y'),before.drone.y-before.train.y);
assert.equal(run('state.zones[0].y-state.zones[0].sy'),before.zone.y-before.zone.sy);
elements.gameCanvas.getBoundingClientRect=()=>({width:800,height:280});run('resizeBattlefield();');
assert.ok(Math.abs(run('W/H')-800/280)<.002,"landscape remains uniformly scaled");
assert.ok(run('state.swarm.every(d=>d.x>=18&&d.x<=W-18&&d.y>=18&&d.y<=H-18)'));

run(`state.mode="combat";state.station=5;state.routeElapsed=59.99;state.routeDistance=.01;state.routeDistanceTotal=60;
state.trainHp=9999;state.pendingLevelUps=0;state.enemies=[];state.spawnClock=100;state.boss={x:100,y:-100,r:34,hp:260,maxHp:260,speed:1,summon:100,dead:false};
update(.02);`);
assert.equal(run('state.mode'),"docking","terminal approach begins at 60 seconds even with a living boss");
run('for(let i=0;i<650;i++)update(1/60);');assert.equal(run('state.outcome'),"won");
assert.equal(run('state.boss.dead'),true,"terminal defense finishes the pursuing boss");

run(`state.mode="combat";state.enemies=[{kind:"spitter",x:state.train.x+140,y:state.train.y,speed:60,spitClock:0,hue:0}];state.hostileShots=[];stepEnemy(state.enemies[0],.1);`);
assert.equal(run('state.hostileShots.length'),1);
const hp=run('state.trainHp');run('for(let i=0;i<90;i++)updateHostileShots(1/60);');assert.ok(run('state.trainHp')<hp);

(async()=>{
  // Fullscreen is initiated by explicit user action; unsupported/rejected calls get a usable fallback.
  sandbox.document.documentElement={classList:{toggle(){}}};
  run('document.documentElement.requestFullscreen=async()=>{document.fullscreenElement=document.documentElement;};');
  await elements.startFullscreenButton.events.click();assert.ok(sandbox.document.fullscreenElement);
  run('document.exitFullscreen=async()=>{document.fullscreenElement=null;};');
  await elements.startFullscreenButton.events.click();assert.equal(sandbox.document.fullscreenElement,null);
  run('document.documentElement.requestFullscreen=async()=>{throw new Error("unsupported");};');
  await elements.startFullscreenButton.events.click();assert.equal(elements.displayHelp.hidden,false);
  assert.equal(run('state.paused'),true,"fallback instructions never let combat run underneath");
  elements.closeDisplayHelp.events.click();assert.equal(elements.displayHelp.hidden,true);
  sandbox.navigator={userAgent:"iPhone",standalone:false};
  await elements.startInstallButton.events.click();assert.ok(elements.displayHelpText.textContent.includes("Safari"));
  console.log("60-second routes, flow cadence, variants, viewport and fullscreen fallback tests passed");
})().catch(error=>{console.error(error);process.exitCode=1;});
