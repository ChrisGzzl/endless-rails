'use strict';
// Regression cover for the 2026-09-29 review fixes (worklog #16): acid vs
// armor, the fragile contract, first spec choice, preset lineups on both
// hosts, the apply confirmation, web extract on a failed save, radar intel
// from the run snapshot and repair kits counted as effective repair.
const assert = require('node:assert/strict');
const meta = require('../src/meta/longterm');
const createGame = require('./test-harness.cjs');

function memoryStorage() {
  const values = new Map();
  const storage = { failMeta: false, getItem: key => values.get(key) ?? null, setItem(key, value) { if (storage.failMeta && key === meta.STORAGE_KEY) throw new Error('quota'); values.set(key, String(value)); } };
  return storage;
}

// -- combat: acid armor and the fragile contract ------------------------------
{
  const { run } = createGame();
  const acidDamage = armor => run(`state.mode="combat";state.runStats=null;state.activeContract=null;state.modules={armor:${armor}};state.maxTrainHp=500;state.trainHp=500;
    state.hostileShots=[{x:state.train.x,y:state.train.y,vx:0,vy:0,life:1,damage:2.5}];updateHostileShots(0);500-state.trainHp`);
  assert.equal(acidDamage(0), 2.5);
  for (const armor of [1, 2, 3]) assert.ok(Math.abs(acidDamage(armor) - 2.5 * (1 - .12 * armor)) < 1e-9, 'acid respects armor Lv.' + armor);
  assert.ok(Math.abs(acidDamage(5) - 2.5 * .64) < 1e-9, 'armor reduction still caps at 36%');

  const hit = contract => run(`state.runStats=null;state.modules={};state.shieldReady=false;state.maxTrainHp=500;state.trainHp=500;
    state.activeContract=${contract ? `routeEvents.CONTRACTS.find(c=>c.id==="${contract}")` : 'null'};
    collideTrain({kind:"walker",elite:false,x:state.train.x,y:state.train.y});500-state.trainHp`);
  assert.equal(hit(null), 6);
  assert.ok(Math.abs(hit('fragile') - 7.2) < 1e-9, '脆弱护送 raises direct train damage by 20%');
  assert.equal(hit('pressure'), 6, 'other contracts leave train damage alone');

  // Repair kits count toward 有效维修 like every other heal.
  run(`state.mode="combat";state.paused=false;state.spawnClock=99;state.enemies=[];state.maxTrainHp=100;state.trainHp=50;state.effectiveRepair=0;
    state.drops=[{type:"repair-kit",x:state.drone.x,y:state.drone.y,life:5}];update(.001,false);`);
  assert.equal(run('state.trainHp'), 62);
  assert.equal(run('state.effectiveRepair'), 12, 'repair kit is recorded as effective repair');

  // Radar intel reads the departure snapshot, not the live account.
  run(`state.expeditionPlan={cars:["hangar","radar"]};state.disabledCars={};state.metaProfile.blueprints=[];state.runStats={ownedBlueprints:["radar-pulse"]};`);
  assert.match(run('eventIntel(routeEvents.ROUTE_EVENTS[0])'), /移速/, 'snapshot blueprint shows the full intel');
  run('state.runStats={ownedBlueprints:[]};state.metaProfile.blueprints=["radar-pulse"];');
  assert.doesNotMatch(run('eventIntel(routeEvents.ROUTE_EVENTS[0])'), /移速/, 'a blueprint gained mid-run waits for the next departure');
}

// -- first spec choice is free, swapping it is paid ----------------------------
{
  const m = meta.normalizeMeta({ ...meta.emptyMeta(), train: { level: 20, xp: 0, totalXp: 0 }, freeRefits: 0, resources: { scrap: 100, components: 0, data: 0 } });
  const bought = meta.applyTalents(m, meta.normalizeTalents({ nodes: { H1: 3, H2: 3, H3: 2, H4: 2, H5: 1 }, specs: {} }));
  assert.equal(bought.applied, true); assert.equal(bought.paid, false);
  const chosen = { nodes: { ...bought.meta.talents.nodes }, specs: { ...bought.meta.talents.specs, hull: 'fortress' } };
  assert.equal(meta.refitIsPaid(bought.meta.talents, chosen), false, 'picking a spec for the first time is not a swap');
  const applied = meta.applyTalents(bought.meta, chosen);
  assert.equal(applied.charged, 0); assert.equal(applied.meta.resources.scrap, 100);
  const swapped = { nodes: { ...applied.meta.talents.nodes }, specs: { ...applied.meta.talents.specs, hull: 'reserve' } };
  assert.equal(meta.refitIsPaid(applied.meta.talents, swapped), true, 'replacing a chosen spec stays paid');
}

// -- presets restore their lineup; confirmation survives the reset (web) -------
function presetAccount() {
  const m = meta.emptyMeta();
  m.train.level = 5; m.resources = { scrap: 200, components: 0, data: 0 };
  m.talents = meta.normalizeTalents({ nodes: { N0: 1, C0: 1 } });
  m.loadout = ['hangar', 'pointDefense'];
  m.presets[1] = { name: '方案 B', talents: meta.normalizeTalents({ nodes: { N0: 1, C0: 1 } }), loadout: ['hangar', 'storage'] };
  return m;
}
{
  const storage = memoryStorage();
  meta.saveMeta(storage, presetAccount());
  const g = createGame({ storage }), e = g.elements;
  e.homeTabTrain.events.click();
  e.talentPresetBar.children[1].children[0].events.click();  // load preset B
  assert.equal(e.talentApply.disabled, false, 'a preset with another lineup is a pending change');
  e.talentApply.events.click();
  const saved = meta.loadMeta(storage);
  assert.deepEqual(saved.loadout, ['hangar', 'storage'], 'applying a preset equips its saved cars');
  assert.equal(saved.freeRefits, 3, 'a lineup-only change is free');

  // A withdrawal consumes a free refit and the page says so after applying.
  const h1 = e.talentNodeList.children;  // hull branch rows
  h1[0].children[1].children[2].events.click();
  e.talentApply.events.click();
  h1[0].children[1].children[0].events.click();
  e.talentApply.events.click();
  assert.equal(meta.loadMeta(storage).freeRefits, 2);
  assert.match(e.talentProblems.textContent, /已消耗 1 次免费重构/, 'the refit confirmation stays visible');
  assert.equal(e.talentProblems.hidden, false);
}

// -- presets restore their lineup (canvas) ----------------------------------------
{
  const storage = memoryStorage();
  meta.saveMeta(storage, presetAccount());
  const g = createGame({ storage, entry: 'canvas.html' });
  const host = g.run('window.EndlessRailsCanvasHost');
  host.handleRegionAction({ presetLoad: 1 });
  assert.equal(host.host.talentSummary.canApply, true);
  host.handleRegionAction({ talentApply: true });
  assert.deepEqual(meta.loadMeta(storage).loadout, ['hangar', 'storage'], 'canvas apply commits the preset lineup');
  // A full lineup swaps out its oldest car, matching the web page.
  host.handleRegionAction({ toggleCar: 'pointDefense' });
  host.handleRegionAction({ toggleCar: 'storage' });
  assert.deepEqual(meta.loadMeta(storage).loadout, ['hangar', 'pointDefense']);
}

// -- web extract keeps the station open when the save write fails ------------
{
  const storage = memoryStorage();
  meta.saveMeta(storage, meta.emptyMeta());
  const g = createGame({ storage }), e = g.elements;
  g.run('beginRun();state.mode="station";');
  e.stationScreen.hidden = false;
  storage.failMeta = true;
  g.run('window.EndlessRailsGame.extractRun()');
  assert.equal(g.run('state.mode'), 'station');
  assert.equal(e.stationScreen.hidden, false, 'the player can still retry from the station');
  storage.failMeta = false;
  g.run('state.settlementRetryAt=0;window.EndlessRailsGame.extractRun()');
  assert.equal(g.run('state.mode'), 'result');
  assert.equal(e.stationScreen.hidden, true);
  assert.equal(e.resultScreen.hidden, false);
  assert.equal(meta.loadMeta(storage).totals.extracts, 1);
}

console.log('review fixes: acid armor, fragile contract, spec choice, preset lineups, apply notice, extract retry, radar snapshot, repair kits passed');
