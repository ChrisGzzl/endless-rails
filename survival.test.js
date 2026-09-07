"use strict";
const assert=require("node:assert/strict");
const createGame=require("./test-harness.cjs");
const {run}=createGame();
run('state.activeContract=routeEvents.CONTRACTS[2]; beginRoute(routeEvents.ROUTE_EVENTS[2]);');
assert.equal(run("state.enemies.length"),2);
assert.equal(run("state.enemies.some(e=>e.elite)"),false);

// Multiple pending upgrades must drain one by one, never leave an empty blocking overlay.
run('state.pendingLevelUps=3;openLevelUp();chooseLevelUp(experiencePool[0]);');
assert.equal(run('state.mode'),"levelup");
assert.equal(run('state.pendingLevelUps'),2);
run('chooseLevelUp(experiencePool[1]);chooseLevelUp(experiencePool[2]);');
assert.equal(run('state.mode'),"combat");

// Each new weapon has distinct damage / movement behavior.
run('state.enemies=[];state.boss=null;state.swarm=[];state.modules={blades:1};state.visualTime=0;state.weaponClocks={gun:Infinity};state.drone.x=180;state.drone.y=260;state.enemies.push({x:220,y:260,r:9,hp:10,maxHp:10,delay:0});updateArsenal(.1);');
assert.ok(run('state.enemies[0].hp')<10,"orbiting blade cuts an adjacent target");
run('state.modules={incendiary:1};state.weaponClocks={};state.zones=[];updateArsenal(.1);');
assert.equal(run('state.zones.length'),1);
const before=run('state.enemies[0].hp');
run('updateArsenal(.65);updateArsenal(.4);');
assert.ok(run('state.enemies[0].hp')<before,"grenade lands and burns without a bullet collision");
run('state.modules={ricochet:1};state.weaponClocks={gun:Infinity};state.shots=[];updateArsenal(.1);state.shots[0].x=389;state.shots[0].vx=270;updateShots(.1);');
assert.ok(run('state.shots.find(s=>s.bounce).vx')<0,"energy ball bounces from the wall");
run('state.modules={missile:1};state.shots=[];fireMissile();state.enemies[0].y+=100;updateShots(.1);');
assert.ok(run('state.shots[0].vy')>0,"missile steers towards moving target");
run('state.enemies=[{x:200,y:260,r:13,hp:10,maxHp:10,delay:0},{x:235,y:260,r:13,hp:10,maxHp:10,delay:0}];state.shots=[{x:200,y:260,vx:0,vy:0,life:2,missile:true,damage:4,color:"#fff"}];updateShots(.001);');
assert.ok(run('state.enemies.every(e=>e.hp<10)'),"missile explosion damages a cluster");
assert.equal(run('state.shots.length'),0,"missile is consumed by explosion");

// Station does not delete the horde at arrival: visible turrets clear it while the train stops.
run('state.pendingLevelUps=0;state.station=1;state.mode="combat";state.enemies=Array.from({length:46},(_,i)=>({x:20+i*7,y:100,r:13,hp:100,maxHp:100,delay:0,speed:80}));state.trainHp=50;state.scrap=0;startDocking(false);');
assert.equal(run('state.enemies.filter(e=>!e.dead).length'),46);
run('update(.4);');
assert.equal(run('state.mode'),"docking");
run('update(.2);');
assert.ok(run('state.weaponFx.some(f=>f.kind==="stationBeam")'));
assert.ok(run('state.enemies.filter(e=>!e.dead).length')<46);
run('for(let i=0;i<210;i++)update(1/60);');
assert.equal(run('state.mode'),"station");
assert.equal(run('state.docking.offset'),0);
assert.equal(run('state.enemies.length'),0);
assert.equal(run('state.trainHp'),75,"station safely repairs the train");
run('state.selectedUpgrade=stationUpgradePool.find(u=>u.id==="armor");continueRun();beginRoute(routeEvents.ROUTE_EVENTS[2]);');
assert.equal(run('state.station'),2,"zero scrap never blocks a free upgrade");
assert.equal(run('state.maxTrainHp'),135);
assert.equal(run('state.docking'),null);
assert.equal(run('state.routeElapsed'),0);
assert.ok(run('state.spawnClock')>1);

// Final victory waits for the same protected arrival sequence.
run('state.boss={dead:true};startDocking(true);for(let i=0;i<650;i++)update(1/60);');
assert.equal(run('state.mode'),"result");
assert.equal(run('state.outcome'),"won");

// Sample opening play across deterministic seeds, with no pulse or manual movement.
const openings=[];
for(let seed=1;seed<=12;seed++){
 const g=createGame();
 g.run(`let rngState=${seed};Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};state.activeContract=routeEvents.CONTRACTS[2];beginRoute(routeEvents.ROUTE_EVENTS[seed%3]);`.replace('seed%3',String(seed%3)));
 g.run('for(let i=0;i<4300&&state.mode!=="station"&&state.mode!=="result";i++){if(state.mode==="levelup")chooseLevelUp(experiencePool.find(u=>u.id==="blades"));else update(1/60);}');
 const result=JSON.parse(g.run('JSON.stringify({mode:state.mode,hp:state.trainHp,level:state.level,kills:state.kills})'));
 assert.equal(result.mode,"station","opening must be survivable with basic automatic play");
 assert.ok(result.level>=3,"opening gives at least two upgrades");
 openings.push(result);
}
console.log("survival tests passed",JSON.stringify(openings));
