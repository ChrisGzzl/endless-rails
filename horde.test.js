"use strict";
const assert=require("node:assert/strict");
const createGame=require("./test-harness.cjs");
const balance=require("./balance.js");
const effects=require("./combat-effects.js");

const opening=balance.difficultyAt(1,0,48),late=balance.difficultyAt(5,72,72);
assert.ok(late.hp<=opening.hp*2,"late ordinary zombies stay easy to cut down");
assert.ok(late.cap>=150&&late.batch/late.interval>=18,"late pressure comes from horde volume");
assert.ok(late.eliteChance<.1,"the crowd remains mostly ordinary zombies");

// The cutter hits every angle and its center, without sampling gaps, at level one.
const {run}=createGame();
run(`state.modules={blades:1};state.swarm=[];state.drone={x:195,y:340};syncSwarm();
state.weaponClocks={gun:Infinity};state.enemies=Array.from({length:16},(_,i)=>({
x:195+Math.cos(i*TAU/16)*70,y:340+Math.sin(i*TAU/16)*70,r:9,hp:10,maxHp:10,delay:0}));
state.enemies.push({x:195,y:340,r:9,hp:10,maxHp:10,delay:0},{x:295,y:340,r:9,hp:10,maxHp:10,delay:0});
updateArsenal(.01);`);
assert.ok(run('state.enemies.slice(0,17).every(e=>e.hp<10)'),"disc cuts center and all directions");
assert.equal(run('state.enemies[17].hp'),10,"outside targets remain untouched");
const first=run('state.enemies[0].hp');
run('updateArsenal(.1)');
assert.equal(run('state.enemies[0].hp'),first,"damage is throttled, not applied every frame");
run('state.modules.blades=5;state.weaponClocks.blades=0;updateArsenal(.01);');
assert.ok(run('state.enemies[17].hp')<10,"higher tiers expand actual damage range");

// Seek the crowd rather than the nearest singleton; do not pursue beyond the leash.
run(`state.enemies=[{x:200,y:340,delay:0},...Array.from({length:5},(_,i)=>({x:145+i,y:390,delay:0}))];`);
assert.ok(run('bladeHuntTarget(state.drone).x')<160);
const center={x:195,y:340},base=effects.formationPosition(center,4,0,390,680);
const cutter={...base,slot:4,id:"blades"};
const patrol=effects.autonomousGoal(center,cutter,null,0,390,680);
const attack=effects.autonomousGoal(center,cutter,{x:280,y:250},0,390,680);
assert.ok(Math.hypot(attack.x-patrol.x,attack.y-patrol.y)>40,"cutter can leave its normal slot to engage");
assert.ok(Math.hypot(attack.x-patrol.x,attack.y-patrol.y)<=70.001);
assert.equal(effects.autonomousGoal(center,{...cutter,x:0,y:0},{x:40,y:10},0,390,680).behavior,"return");

// One mass kill cannot create unbounded particles, text or combo layout restarts.
run(`state.enemies=Array.from({length:166},(_,i)=>({x:50+i%20*10,y:100,r:9,hp:1,delay:0}));
state.modules={};state.particles=[];state.texts=[];state.visualTime=10;state.comboFxAt=-1;
let comboRestarts=0;ui.combo.classList.remove=()=>comboRestarts++;
for(const e of state.enemies)killEnemy(e);`);
assert.ok(run('state.particles.length')<=420);
assert.ok(run('state.texts.length')<=24);
assert.equal(run('comboRestarts'),1);
assert.equal(run('state.enemies.filter(e=>e.rewarded).length'),166,"visual budgets never discard kill rewards");

// The larger horde still clears visibly before the station upgrade overlay opens.
run(`state.mode="combat";state.station=4;state.pendingLevelUps=0;state.trainHp=50;
state.enemies=Array.from({length:166},(_,i)=>({x:20+i%35*10,y:100+Math.floor(i/35)*20,r:9,hp:10,delay:0,speed:80}));
startDocking(false);update(.4);`);
assert.equal(run('state.enemies.filter(e=>!e.dead).length'),166);
run('for(let i=0;i<600&&state.mode==="docking";i++)update(1/60);');
assert.equal(run('state.mode'),"station");
assert.equal(run('state.enemies.length'),0);
assert.equal(run('state.trainHp'),75);
console.log("horde pacing, cutter coverage, VFX budget and station tests passed");
