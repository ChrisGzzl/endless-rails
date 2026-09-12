"use strict";
const assert=require('node:assert/strict');
const effects=require('./combat-effects');
const createGame=require('./test-harness.cjs');
const record=require('./run-record');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const rule of effects.BOND_RULES){
  for(const [a,b,want] of [[4,5,0],[5,4,0],[5,5,1],[6,5,2],[6,6,3],[10,10,11],[0,10,0]]){
    const modules={};rule.pair.forEach((id,i)=>{const n=i?b:a;if(id==='gun'){modules.rapid=Math.max(0,n-1);modules.gunDisabled=n===0;}else modules[id]=n;});
    assert.equal(effects.bondStates(modules).find(x=>x.id===rule.id).level,want,rule.id+' actual levels');
  }
}
assert.deepEqual(effects.activeBonds({missile:5,chain:5}),[],'old incorrect missile/arc pair is removed');
assert.deepEqual(effects.activeBonds({blades:10,ricochet:10}),[],'old guard pair is removed');
assert.equal(effects.activeBonds({rapid:4,piercing:5})[0].level,1,'Swift starts at Lv.1, four upgrades reaches Lv.5');
for(const d of effects.DRONE_TYPES){
  const p9=effects.weaponProfile(d.id,9),p10=effects.weaponProfile(d.id,10);
  assert.ok(!p9.breakthrough&&p10.breakthrough);assert.equal(p10.ultimate,undefined);
  if(['gun','scatter','piercing'].includes(d.id))near(p10.life*p10.speed,p10.range);
  assert.ok(p10.damage>p9.damage&&p10.range>p9.range);
}
near(effects.weaponProfile('missile',10).damage,(5+9*1.4)*1.35);
near(effects.weaponProfile('missile',10).radius,98*1.25);

function setup(modules){
  const game=createGame();game.run(`state.mode='combat';state.modules=${JSON.stringify(modules)};state.drone.x=100;state.drone.y=300;syncSwarm();
    state.enemies=[{x:160,y:300,r:8,hp:1000,maxHp:1000,delay:0},{x:220,y:300,r:8,hp:1000,maxHp:1000,delay:0}];
    state.weaponClocks=Object.fromEntries(state.swarm.map(d=>[d.id,Infinity]));state.weaponClocks.command=0;`);return game;
}
const all=setup({rapid:4,piercing:5,missile:5,incendiary:5,chain:5,ricochet:5});
all.run('updateArsenal(.01)');
assert.equal(all.run('state.shots.filter(s=>s.bondId==="red").length'),1);
assert.equal(all.run('state.shots.filter(s=>s.bondId==="purple").length'),1);
assert.equal(all.run('state.shots.filter(s=>!s.bondId).length'),0,'blue replaces the ordinary Beichen bullet');
assert.equal(all.run('state.weaponFx.filter(f=>f.kind==="bondLaser").length'),1);
assert.equal(all.run('state.shots.every(s=>s.owner==="command"&&s.x===100&&s.y===300)'),true);
assert.equal(all.run('state.bondStats.blue.damage'),6,'beam damages every enemy on its line');
assert.equal(all.run('state.weaponStats.command?.damage||0'),0,'laser is not double counted as ordinary damage');
all.run('updateArsenal(.1)');assert.equal(all.run('state.bondStats.red.casts'),1,'cadence follows Beichen');
all.run('updateShots(.1)');assert.equal(all.run('Object.values(state.bondStats).every(s=>s.casts===1)'),true,'secondary effects cannot cast more bonds');
all.run('state.weaponClocks.command=Infinity;state.weaponClocks.missile=0;updateArsenal(.01)');
assert.equal(all.run('state.bondStats.red.casts'),1,'specialist fire does not trigger bond');

const red=setup({missile:5,incendiary:5});
red.run(`fireCommandVolley(state.enemies[0],effects.weaponProfile('command'),effects.activeBonds(state.modules));
  state.shots=state.shots.filter(s=>s.bondId);const redShot=state.shots[0];redShot.x=160;
  state.enemies[0].hp=2;state.enemies[1].hp=2;state.enemies.push({x:180,y:320,r:8,hp:3,maxHp:3,delay:2});
  state.boss={x:180,y:300,r:12,hp:1,maxHp:1,dead:false};updateShots(.001);`);
assert.equal(red.run('state.bondStats.red.damage'),5,'red caps overkill and includes boss damage');
assert.equal(red.run('state.bondStats.red.kills'),3,'boss counts once as skill kill');
assert.equal(red.run('state.boss.dead'),true,'boss follows killBoss path');
assert.equal(red.run('state.enemies[2].hp'),3,'spawn delay protects incoming enemies');
assert.equal(red.run('state.zones.length'),1,'red impact leaves a burning zone');
red.run(`state.enemies=[{x:160,y:300,r:8,hp:1,maxHp:1,delay:0}];state.weaponClocks.command=Infinity;updateArsenal(.01);`);
near(red.run('state.bondStats.red.damage'),5.7);
assert.equal(red.run('state.weaponStats.command?.damage||0'),0,'burn inherits bond attribution');
red.run('updateArsenal(.4)');near(red.run('state.bondStats.red.damage'),6);
assert.equal(red.run('state.bondStats.red.kills'),4);
red.run('advanceWorld(10)');assert.notEqual(red.run('state.zones[0].x'),160,'bond fire stays on scrolling ground');

const purple=setup({chain:5,ricochet:5});
purple.run(`fireCommandVolley(state.enemies[0],effects.weaponProfile('command'),effects.activeBonds(state.modules));
  state.shots=state.shots.filter(s=>s.bondId);const orb=state.shots[0];
  state.enemies=[{x:orb.x,y:orb.y+40,r:8,hp:100,maxHp:100,delay:0},{x:orb.x,y:orb.y+100,r:8,hp:100,maxHp:100,delay:0}];purpleDischarge(orb,.01);`);
near(purple.run('state.bondStats.purple.damage'),.8);
assert.equal(purple.run('state.enemies[1].hp'),100,'orb aura has a bounded radius');
purple.run('purpleDischarge(orb,.05)');near(purple.run('state.bondStats.purple.damage'),.8);
purple.run('purpleDischarge(orb,.35)');near(purple.run('state.bondStats.purple.damage'),1.6);
purple.run('orb.x=11;orb.vx=-270;updateShots(.02)');assert.ok(purple.run('orb.vx')>0,'purple reflects like the original ricochet');

const gm=setup({});
gm.elements.gmToggle.events.click();assert.equal(gm.run('state.paused'),true);
gm.run('setGMDroneLevel("gun",5);setGMDroneLevel("piercing",5);renderGMBonds();');
assert.equal(gm.run('state.modules.rapid'),4);assert.match(gm.elements.gmBonds.innerHTML,/蓝色穿透 · Lv.1/);
gm.run('setGMDroneLevel("gun",6)');assert.equal(gm.run('effects.activeBonds(state.modules)[0].level'),2);
gm.run('setGMDroneLevel("gun",0)');assert.equal(gm.run('effects.activeBonds(state.modules).length'),0);
assert.equal(gm.run('state.swarm.some(d=>d.id==="gun")'),false);
gm.run('setGMDroneLevel("gun",10)');assert.equal(gm.run('state.swarm.find(d=>d.id==="gun").level'),10);
gm.run('state.shots=[{owner:"gun",breakthrough:true}];setGMDroneLevel("gun",9)');assert.equal(gm.run('state.shots.length'),0,'GM removes stale upgraded shots');
gm.elements.gmClose.events.click();assert.equal(gm.run('state.paused'),false);
gm.run('state.paused=true;openGM();closeGM()');assert.equal(gm.run('state.paused'),true,'GM preserves prior pause');

all.run('renderDamageSummary();inspector.id="command";inspector.tab="weapon";renderPause()');
for(const name of ['红色灼杀','蓝色穿透','紫色共振'])assert.ok(all.elements.resultBondDamage.innerHTML.includes(name));
assert.ok(!all.elements.resultDroneDamage.innerHTML.includes('技能'),'no phantom zero skill rows for specialists');
const summary=record.buildRunSummary({bondStats:{red:{damage:5}}});assert.equal(summary.damageByBond.red.damage,5);
all.run('resetRun()');assert.equal(all.run('Object.keys(state.bondStats).length'),0);
console.log('Bonds: thresholds, levels, command-only casting, coexistence, real damage/boss/DoT attribution, GM and records passed.');
