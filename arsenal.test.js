"use strict";
const assert=require("node:assert/strict");
const effects=require("./combat-effects.js");
const createGame=require("./test-harness.cjs");
const gun=effects.weaponProfile("gun"),missile=effects.weaponProfile("missile"),arc=effects.weaponProfile("chain");
assert.ok(gun.damage<arc.damage&&arc.damage<missile.damage);
assert.ok(gun.interval<arc.interval&&arc.interval<missile.interval);
assert.ok(gun.range<arc.range&&arc.range<missile.range);
for(const type of effects.DRONE_TYPES){
  for(const n of [1,2,10,50]){
    const p=effects.weaponProfile(type.id,n);
    assert.ok(p.damage>0&&p.interval>=.08&&p.range>0&&Number.isFinite(p.singleTargetDps));
  }
  // No weapon, including beams and area weapons, may acquire an out-of-range enemy.
  const {run}=createGame();
  run(`state.modules={${type.module}:1};syncSwarm();state.weaponClocks={gun:Infinity};
    const testDrone=state.swarm.find(d=>d.id==="${type.id}");testDrone.x=100;testDrone.y=300;
    const testProfile=effects.weaponProfile(testDrone.id,testDrone.level);
    state.enemies=[{x:100+testProfile.range+30,y:300,r:9,hp:100,maxHp:100,delay:0}];
    state.weaponClocks[testDrone.id]=0;updateArsenal(.01);`);
  assert.equal(run('state.weaponStats[testDrone.id]?.volleys||0'),0,type.id+" respects range");
  run('state.enemies[0].x=100+testProfile.range-1;updateArsenal(.01);');
  assert.equal(run('state.weaponStats[testDrone.id].volleys'),1,type.id+" fires in range");
  assert.equal(run('state.weaponClocks[testDrone.id]'),run('testProfile.interval'));
  run('updateArsenal(testProfile.interval/2);');
  assert.equal(run('state.weaponStats[testDrone.id].volleys'),1,"cooldown blocks a second volley");
}

const {run}=createGame();
run(`state.modules={};syncSwarm();state.swarm[0].x=100;state.swarm[0].y=300;
state.enemies=[{x:220,y:300,r:9,hp:20,maxHp:20,delay:0},{x:275,y:300,r:9,hp:20,maxHp:20,delay:0}];
fireDrone();state.enemies[0].dead=true;updateShots(1);`);
assert.equal(run('state.enemies[1].hp'),20,"bullets expire at short range, even with a long update step");
assert.equal(run('state.shots.length'),0);
// Swept collision prevents high-speed piercing shots skipping small zombies.
run(`state.shots=[{x:100,y:300,vx:560,vy:0,life:1,damage:3,pierce:2,owner:"piercing"}];
state.enemies=[{x:128,y:300,r:9,hp:2,maxHp:2,delay:0}];updateShots(.1);`);
assert.equal(run('state.enemies[0].dead'),true);
assert.equal(run('state.weaponStats.piercing.damage'),2,"overkill is excluded from damage stats");
assert.equal(run('state.weaponStats.piercing.kills'),1);

run(`state.modules={chain:1};state.swarm=[];state.drone.x=100;state.drone.y=300;syncSwarm();
state.weaponClocks={gun:Infinity};state.enemies=[{x:140,y:300,r:9,hp:20,maxHp:20,delay:0},
{x:190,y:300,r:9,hp:20,maxHp:20,delay:0},{x:240,y:300,r:9,hp:20,maxHp:20,delay:0},
{x:290,y:300,r:9,hp:20,maxHp:20,delay:0}];updateArsenal(.01);`);
assert.equal(run('state.enemies.filter(e=>e.hp<20).length'),3,"arc honors its chain count");
run(`state.shots=[{x:200,y:300,vx:0,vy:0,life:1,missile:true,damage:5,radius:68,owner:"missile"}];
state.enemies=[{x:200,y:300,r:9,hp:20,maxHp:20,delay:0},{x:250,y:300,r:9,hp:20,maxHp:20,delay:0},{x:290,y:300,r:9,hp:20,maxHp:20,delay:0}];updateShots(.01);`);
assert.equal(run('state.enemies.filter(e=>e.hp<20).length'),2,"missile explosion uses its displayed radius");
assert.equal(run('state.weaponStats.missile.damage'),10);

// Core changes are reflected in the same profile used by actual firing.
const core=effects.weaponProfile("gun",1,{scatter:1,overdrive:1,arc:1});
assert.equal(core.projectileCount,2);assert.ok(core.interval<gun.interval);assert.ok(core.coreArc);
assert.equal(effects.weaponProfile("missile",1,{scatter:3}).projectileCount,1);
console.log("weapon roles, range, cadence, collision, core and attribution tests passed");
