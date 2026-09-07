"use strict";
const assert=require("node:assert/strict");
const effects=require("./combat-effects.js");
const motion=require("./motion.js");
const createGame=require("./test-harness.cjs");
const {run,sandbox}=createGame();

assert.deepEqual(effects.swarmRoster({}).map(d=>d.id),["gun"]);
assert.deepEqual(effects.swarmRoster({missile:1}).map(d=>d.id),["gun","missile"]);
assert.equal(effects.swarmRoster({missile:5}).length,2,"upgrading a type strengthens its existing aircraft");
const modules={rapid:2,scatter:1,piercing:1,chain:1,missile:1,blades:1,incendiary:1,ricochet:1,wingman:3};
assert.equal(effects.swarmRoster(modules).length,11);
for(const center of [{x:24,y:24},{x:366,y:656}]){
 const fleet=effects.swarmRoster(modules).map(d=>effects.formationPosition(center,d.slot,1,390,680));
 assert.ok(fleet.every(p=>p.x>=16&&p.x<=374&&p.y>=16&&p.y<=664));
 for(let i=0;i<fleet.length;i++)for(let j=i+1;j<fleet.length;j++)
  assert.ok(Math.hypot(fleet[i].x-fleet[j].x,fleet[i].y-fleet[j].y)>25,"formation retains separated slots at screen edges");
}

// A fresh specialist's movement is bounded, and render/update use the same origin.
run('state.modules={missile:1};syncSwarm();state.drone.x=300;state.drone.y=500;');
const before=JSON.parse(run('JSON.stringify(state.swarm.find(d=>d.id==="missile"))'));
run('updateSwarm(.1);');
const after=JSON.parse(run('JSON.stringify(state.swarm.find(d=>d.id==="missile"))'));
assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<=25.0001);
run('state.enemies=[{x:330,y:400,r:9,hp:100,maxHp:100,delay:0}];state.shots=[];fireMissile();');
assert.equal(run('state.shots[0].owner'),"missile");
assert.equal(run('state.shots[0].x'),after.x);
assert.equal(run('state.shots[0].y'),after.y);

// Each aircraft fires only its own weapon; 北辰 adds exactly its independent pulse shot.
run('state.modules={rapid:2,scatter:1,piercing:1,chain:1,missile:1,blades:1,incendiary:1,ricochet:1};state.shots=[];state.zones=[];state.weaponClocks={};updateSwarm(.1);updateArsenal(.01);');
assert.equal(run('state.shots.filter(s=>s.owner==="gun").length'),1);
assert.equal(run('state.shots.filter(s=>s.owner==="command").length'),1);
assert.equal(run('state.shots.find(s=>s.owner==="gun").pierce'),0);
assert.ok(run('state.shots.filter(s=>s.owner==="missile").every(s=>s.missile)'));
assert.equal(run('state.shots.filter(s=>s.owner==="chain"||s.owner==="incendiary"||s.owner==="blades").length'),0);
assert.equal(run('state.zones[0].sx'),run('state.swarm.find(d=>d.id==="incendiary").x'));
assert.ok(run('state.weaponFx.some(f=>f.kind==="arc")'));

// Ground projection, rails, fire and drops share the exact camera displacement.
run('state.worldDistance=0;state.zones=[{x:200,y:300,r:60,flight:0,life:4,tick:1,damage:1}];state.drops=[{x:180,y:310,life:4,type:"arc"}];advanceWorld(88);');
const drift=motion.worldDrift(1,88);
assert.equal(run('state.zones[0].x'),200+drift.x);
assert.equal(run('state.zones[0].y'),300+drift.y);
assert.equal(run('state.drops[0].x'),180+drift.x);
const groundBefore=JSON.parse(run('JSON.stringify(state.zones[0])'));
run('state.drone.x+=100;updateSwarm(.1);');
assert.equal(run('state.zones[0].x'),groundBefore.x,"fire does not follow commander input");
run('state.station=1;startDocking(false);');
const worldBefore=run('state.worldDistance'), offsetBefore=run('state.docking.offset');
run('updateDocking(.5);');
assert.ok(Math.abs(run('state.worldDistance')-worldBefore-(offsetBefore-run('state.docking.offset')))<1e-8);
run('for(let i=0;i<190;i++)update(1/60);');
const stopped=run('state.worldDistance');run('update(1);');
assert.equal(run('state.worldDistance'),stopped,"all ground motion stops at the platform");

// Exercise real draw call paths at multiple animation poses, including the full swarm.
const moves=[];
sandbox.ctxRecorder=moves;
run('ctx.moveTo=(x,y)=>ctxRecorder.push([x,y]);state.mode="combat";state.enemies=[{x:100,y:200,r:9,hp:2,maxHp:2,hue:.3,speed:70,delay:0}];state.visualTime=0;draw();');
const pose0=JSON.stringify(moves);moves.length=0;
run('state.visualTime=.18;draw();');
assert.notEqual(JSON.stringify(moves),pose0,"zombie joints and drone rotors animate between frames");
// Compare actual renderer coordinates, not just the stored travel value.
const translations=[];sandbox.translationRecorder=translations;
run('ctx.translate=(x,y)=>translationRecorder.push([x,y]);state.worldDistance=100;drawBackground();');
const terrain0=translations[0];translations.length=0;
run('state.worldDistance=102;drawBackground();');
const terrain1=translations[0];
moves.length=0;run('state.worldDistance=100;drawRails();');const rail0=moves[3];
moves.length=0;run('state.worldDistance=102;drawRails();');const rail1=moves[3];
assert.ok(Math.abs(rail1[0]-rail0[0]+motion.FORWARD.x*2)<1e-8);
assert.ok(Math.abs(rail1[1]-rail0[1]+motion.FORWARD.y*2)<1e-8);
assert.ok(Math.abs((terrain1[0]-terrain0[0])-(rail1[0]-rail0[0]))<=1);
assert.ok(Math.abs((terrain1[1]-terrain0[1])-(rail1[1]-rail0[1]))<=1,"terrain and sleepers move together to pixel rounding precision");
console.log("swarm and ground-motion tests passed");
