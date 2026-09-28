'use strict';
const assert=require('node:assert/strict');
const meta=require('../src/meta/longterm');
const createGame=require('./test-harness.cjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value))};
let m=meta.emptyMeta();m.resources={scrap:500,components:40,data:60};
// 研究：attack 轨道升 1 级 = 废料 25 + 数据 3（无交叉材料）
const r1=meta.buyResearch(m,'fireControl');assert.equal(r1.purchased,true);assert.equal(r1.meta.research.fireControl,1);
assert.equal(r1.meta.resources.scrap,475);assert.equal(r1.meta.resources.data,57);
// 资源不足时拒绝且不扣费（train 轨道 Lv1 需要组件 1 + 数据 5 里程碑）
const broke=meta.emptyMeta();broke.resources={scrap:10,components:0,data:0};
const r2=meta.buyResearch(broke,'hullEngineering');assert.equal(r2.purchased,false);
assert.deepEqual(broke.resources,{scrap:10,components:0,data:0});
meta.saveMeta(storage,r1.meta);assert.deepEqual(meta.loadMeta(storage),r1.meta);
// 失败保留率来自出发快照：无仓储 50%，满仓储+装甲仓 88%
const run=meta.createRun(m);run.risk={scrap:100,components:10,data:10};meta.bankRisk(run);run.risk={scrap:100,components:10,data:10};
meta.addBlueprintRisk(run,'radar-pulse');
const lost=meta.settleRun(m,run,'lost',{segmentProgress:.5});
assert.equal(lost.gained.scrap,100+50);assert.equal(lost.blueprints.length,0);
const storeFull={C0:1,C1:2,C2:3,C3:1,C4:3};
const armored=meta.normalizeMeta({train:{level:30},talents:{nodes:storeFull,specs:{storage:'armorBay'}},loadout:['hangar','storage'],research:{}});
const run2=meta.createRun(armored);run2.risk={scrap:100,components:10,data:10};
const lost2=meta.settleRun(armored,run2,'lost');
near(lost2.gained.scrap,88);
// 通关：结算含通关奖励（区域系数 ×1、无收益天赋时 = 30/3/1），XP = (4+1)×40+40 = 240
run.stationsBanked=4;
const won=meta.settleRun(m,run,'won');assert.equal(won.meta.regions.ruins.unlocked,true);
assert.equal(won.trainXp,240,'a full clear pays five segments plus the clear bonus');
near(won.gained.scrap,200+30);near(won.gained.data,20+1+3);near(won.gained.components,20+1);
assert.deepEqual(won.blueprints,['radar-pulse']);
// 失败 XP：已到站 2 次 + 当前进度 60%（24，未超过 39 上限）
run.stationsBanked=2;
const lostXp=meta.settleRun(m,run,'lost',{segmentProgress:.6});
assert.equal(lostXp.trainXp,104);
// 未完成段折算上限 39
run.stationsBanked=0;
assert.equal(meta.settleRun(m,run,'lost',{segmentProgress:1}).trainXp,39);
assert.equal(meta.settleRun(meta.emptyMeta(),meta.createRun(m),'lost').trainXp,0,'immediate failure cannot farm train XP');
const twice=meta.settleRun(won.meta,run,'won');
assert.equal(twice.alreadySettled,true,'replaying a settled run is rejected by its persisted ID');
assert.equal(twice.meta.totals.expeditions,won.meta.totals.expeditions);
assert.deepEqual(twice.meta.resources,won.meta.resources);
const qaHost={location:{search:'?qa=1'},localStorage:storage};
assert.equal(meta.gameStorage(qaHost),meta.gameStorage(qaHost));assert.notEqual(meta.gameStorage(qaHost),storage,'QA must be isolated');
assert.equal(meta.gameStorage({get localStorage(){throw new Error('blocked');}}),null);

const g=createGame({storage});
g.run(`beginRun();state.longtermRun.risk={scrap:100,components:10,data:10};state.kills=20;state.routeElapsed=40;finish(false);`);
const resources=g.run('state.metaProfile.resources.scrap'),runs=g.run('state.record.runs');
g.run('finish(false);');assert.equal(g.run('state.metaProfile.resources.scrap'),resources);assert.equal(g.run('state.record.runs'),runs,'settlement and records are idempotent');
// A rejected local write must not consume the settlement in memory.
let rejectWrite=false;
const flakyValues=new Map(),flakyStorage={getItem:k=>flakyValues.get(k)??null,setItem:(k,v)=>{if(rejectWrite)throw Error('quota');flakyValues.set(k,String(v));}};
const retryGame=createGame({storage:flakyStorage});
retryGame.run('beginRun();state.mode="combat";state.longtermRun.risk.scrap=10;');
rejectWrite=true;
retryGame.run('finish(false);');
assert.equal(retryGame.run('state.metaSettled'),false);
assert.equal(retryGame.run('state.mode'),'combat');
assert.ok(retryGame.run('state.settlementRetryAt')>Date.now());
assert.equal(meta.loadMeta(flakyStorage).totals.expeditions,0);
rejectWrite=false;
retryGame.run('finish(false);');
assert.equal(retryGame.run('state.metaSettled'),true);
assert.equal(retryGame.run('state.settlementRetryAt'),0);
assert.equal(meta.loadMeta(flakyStorage).totals.expeditions,1);
g.run('state.trainDamage=123;beginRun();');assert.equal(g.run('state.trainDamage'),0,'damage is per run');
// 车厢压制：需要一节已装备的仓储车（v0.10 空账号默认只有机库）
g.run(`longterm.saveMeta(metaStorage,longterm.normalizeMeta({train:{level:5},talents:{nodes:{N0:1,C0:1}},loadout:['hangar','pointDefense','storage']}));beginRun();state.mode='combat';state.disabledCars={storage:true};
state.enemies=[{suppressedCar:'storage',targetCarId:'storage',attached:true,hp:5},{suppressedCar:'storage',targetCarId:'storage',attached:true,hp:5}];
state.enemies[0].dead=true;releaseCarSuppression(state.enemies[0]);`);
assert.equal(g.run('carEnabled("storage")'),false,'another climber still suppresses the car');
g.run('state.enemies[1].dead=true;releaseCarSuppression(state.enemies[1]);');assert.equal(g.run('carEnabled("storage")'),true);
g.run(`state.metaProfile.research.fireControl=0;state.metaProfile.train.level=5;
state.modules={missile:9};state.pendingLevelUps=1;state.mode='combat';openLevelUp();chooseLevelUp({id:'missile'});`);
assert.equal(g.run('state.mode'),'levelup');assert.equal(g.elements.levelUpList.children.length,2);
g.elements.levelUpList.children[0].events.click();assert.equal(g.run('state.breakthroughs.missile'),'cluster','breakthroughs no longer gate on the removed per-drone research');
g.run(`state.modules.missile=10;inspector.tab='weapon';inspector.id='missile';`);
const rows=JSON.parse(g.run('JSON.stringify(inspectRows({id:"missile",level:10,owned:true}))'));
near(Number(rows[0][1]),Number(g.run('numberText(applyResearchProfile("missile",effects.weaponProfile("missile",10,state.coreStacks)).damage)')));
// v0.10 快照：研究在出发时固化，局内修改存档不改变本局倍率
g.run(`beginRun();state.runStats.droneDamageMul=1;state.metaProfile.research.fireControl=30;`);
const dmg=g.run('applyResearchProfile("missile",effects.weaponProfile("missile",5,{})).damage');
near(Number(dmg),Number(g.run('effects.weaponProfile("missile",5,{}).damage*1')));
console.log('long-term persistence, settlement, suppression, breakthroughs and frozen run stats passed');
