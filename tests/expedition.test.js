'use strict';
// v0.12 alpha.1 expedition tests (规划 §3-§8/§12.1/§19.1): generator
// constraints, the failure ledger math, the whitelist normalizer, the meta v4
// migration, the played flow through the real canvas host (victory, failure
// rollback, retry lock, reload persistence, interrupt recovery), and the
// serialization budget fixtures against the real save-service validator.
const assert = require('node:assert/strict');
const ex = require('../src/meta/expedition.js');
const lt = require('../src/meta/longterm.js');
const rr = require('../src/core/run-record.js');
const { validate } = require('../services/player-data/server.cjs');

// -- generator constraints (§3/§4.1) ---------------------------------------------------

for (let seed = 1; seed <= 60; seed++) {
  const exp = ex.generateExpedition({ regionId: 'wasteland', seed, id: 'abc123' });
  assert.ok(ex.validateNodes(exp.nodes), 'seed ' + seed + ' validates');
  assert.equal(exp.nodes.length, 29, 'the alpha.1 template has 29 nodes');
  assert.equal(exp.seed, seed, 'the accepted seed is persisted');
  assert.equal(JSON.stringify(exp.nodes), JSON.stringify(ex.generateExpedition({ regionId: 'wasteland', seed, id: 'abc123' }).nodes), 'the same seed regenerates the same graph');
  for (let layer = 1; layer <= 12; layer++) assert.equal(exp.nodes.filter(n => n.layer === layer).length, ex.LAYER_SIZES[layer - 1], 'layer sizes follow the template');
  const start = exp.nodes.find(n => n.layer === 1), finish = exp.nodes.find(n => n.layer === 12);
  assert.equal(start.type, 'start'); assert.equal(finish.type, 'final');
  for (const node of exp.nodes) {
    assert.equal(node.nextIds.length >= (node.layer === 12 ? 0 : 1), true, 'every pre-final position keeps at least one forward road');
    for (const id of node.nextIds) {
      const target = ex.nodeById(exp, id);
      assert.equal(target.layer, node.layer + 1, 'edges only connect adjacent layers');
    }
  }
  const startNode = exp.nodes.find(n => n.layer === 1);
  assert.equal(startNode.nextIds.length, 2, 'departure always offers both L2 roads');
  // Staircase generation is planar: with the natural slot order no two roads cross.
  let layerCrossings = 0;
  for (let l = 1; l < 12; l++) {
    const A = exp.nodes.filter(n => n.layer === l), B = exp.nodes.filter(n => n.layer === l + 1);
    const sa = new Map(A.map((n, i) => [n.id, i])), sb = new Map(B.map((n, i) => [n.id, i]));
    for (let x = 0; x < A.length; x++) for (let y = x + 1; y < A.length; y++) {
      for (const t1 of A[x].nextIds) for (const t2 of A[y].nextIds) {
        if ((sa.get(A[x].id) - sa.get(A[y].id)) * (sb.get(t1) - sb.get(t2)) < 0) layerCrossings++;
      }
    }
  }
  assert.equal(layerCrossings, 0, 'generated roads never cross in slot order');
}
{
  // Deterministic fallback when no candidate seed is supplied.
  const fallback = ex.generateExpedition({ regionId: 'wasteland' });
  assert.ok(ex.validateNodes(fallback.nodes), 'the fallback candidate validates');
}

// -- failure ledger math (§7.1/§7.2 doc example) ----------------------------------------

{
  const entry = ex.makeLedgerEntry('n3', { scrap: 100, data: 100, components: 100 }, 0.5);
  assert.deepEqual(ex.failurePayout(entry, 0.75), { scrap: 37.5, data: 37.5, components: 37.5 }, 'failing at 75% progress pays B×p×keep');
  assert.deepEqual(ex.failurePayout(entry, 0.5), { scrap: 0, data: 0, components: 0 }, 'a weaker retry adds nothing');
  const victory = ex.victoryPayout(entry);
  assert.deepEqual(victory, { scrap: 62.5, data: 62.5, components: 62.5 }, 'victory pays the remaining budget');
  assert.equal(37.5 + victory.scrap, 100, 'all attempts together never exceed B');
  const capped = ex.makeLedgerEntry('n4', { scrap: 50, data: 0, components: 0 }, 0.9);
  assert.equal(ex.failurePayout(capped, 1).scrap, 45, 'the 90% storage cap bounds the failure payout');
}
{
  // B fixes region reward and departure yields at first start; contract
  // multipliers never enter it (§12.1).
  const budget = ex.budgetFor({ type: 'combat' }, 1.16, { scrapYieldMul: 1.3, dataYieldMul: 1, componentYieldMul: 1 });
  assert.deepEqual(budget, { scrap: ex.fix3(28 * 1.16 * 1.3), data: ex.fix3(3 * 1.16), components: ex.fix3(0.4 * 1.16) });
}

// -- whitelist normalizer (§6.2/§19.1) -------------------------------------------------

{
  const exp = ex.generateExpedition({ regionId: 'ruins', seed: 42, id: 'k0abcd' });
  const round = ex.normalizeExpedition(JSON.parse(JSON.stringify(exp)));
  assert.deepEqual(round, exp, 'a generated expedition survives a normalize roundtrip');
  const rejects = mutate => {
    const bad = JSON.parse(JSON.stringify(exp));
    mutate(bad);
    return ex.normalizeExpedition(bad) === null;
  };
  assert.ok(rejects(b => { b.nodes[3].nextIds = ['zz']; }), 'dangling edges reject');
  assert.ok(rejects(b => { b.nodes[3].layer = 7; }), 'mis-layered nodes reject');
  assert.ok(rejects(b => { b.visitedIds = b.visitedIds; b.lockedNodeId = b.nodes[5].id; }), 'a lock that is not a forward choice rejects');
  assert.ok(rejects(b => { b.pendingOp = { kind: 'victory', nodeId: b.nodes[2].id, payout: { scrap: NaN, data: 0, components: 0 }, tokens: 0, hpPct: 1, final: true }; }), 'a final victory without finalSettle rejects');
  assert.ok(rejects(b => { b.nodes[0].type = 'shop'; }), 'unimplemented node types reject in alpha.1');
  assert.ok(rejects(b => { b.tokenx = 1; b.tokens = 5; b.nodes = b.nodes.slice(0, 10); }), 'a truncated node list rejects');
  const clamped = JSON.parse(JSON.stringify(exp));
  clamped.tokens = NaN; clamped.trainHpPct = -3;
  const healed = ex.normalizeExpedition(clamped);
  assert.equal(healed.tokens, 0, 'NaN tokens clamp to zero');
  assert.equal(healed.trainHpPct, 0, 'negative hp clamps to zero');
  // Unknown junk fields are dropped by the rebuild, not carried along.
  const junk = JSON.parse(JSON.stringify(exp));
  junk.evil = { deep: { deeper: { deepest: {} } } };
  assert.equal('evil' in ex.normalizeExpedition(junk), false, 'unknown fields never survive the whitelist');
  // A signed contract implies the L1 departure is cleared.
  const signed = JSON.parse(JSON.stringify(exp));
  signed.visitedIds = [];
  signed.contract = { id: 'pressure', name: '高压推进', description: 'x', rewardMultiplier: 1.3, enemyHpMultiplier: 1.18, scrapMultiplier: 1.12 };
  const healed2 = ex.normalizeExpedition(signed);
  assert.deepEqual(healed2.visitedIds, [signed.nodes.find(n => n.layer === 1).id], 'contract self-heals the L1 visit');
  // A failed node narrows the reachable set to itself (§2.2).
  const locked = healed2;
  const firstNext = locked.nodes.find(n => n.layer === 2);
  locked.lockedNodeId = firstNext.id;
  assert.deepEqual(ex.reachableNext(locked).map(n => n.id), [firstNext.id], 'after a failure only the locked node is reachable');
}

// -- meta v4 migration ------------------------------------------------------------------

{
  assert.equal(lt.SAVE_VERSION, 4, 'the expedition schema bumps the save version');
  assert.equal(lt.emptyMeta().activeExpedition, null, 'fresh accounts start without an expedition');
  const legacy = { version: 3, resources: { scrap: 500, components: 9, data: 10 }, train: { level: 12 }, talents: { nodes: { N0: 1 }, specs: {} }, loadout: ['hangar', 'pointDefense'], blueprints: ['radar-pulse'], settledRunIds: [], research: {}, totals: { expeditions: 3, extracts: 1, wins: 1, losses: 1 } };
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  storage.setItem(lt.STORAGE_KEY, JSON.stringify(legacy));
  const migrated = lt.loadMeta(storage);
  assert.equal(migrated.version, 4, 'a v3 save migrates to v4');
  assert.equal(migrated.resources.scrap, 500, 'migration keeps permanent resources');
  assert.equal(migrated.train.level, 12, 'migration keeps the train level');
  assert.equal(migrated.activeExpedition, null, 'migration starts without an expedition');
  // A broken expedition is dropped whole; the permanent account survives.
  const broken = lt.normalizeMeta({ ...legacy, activeExpedition: { id: 'x', regionId: 'wasteland', nodes: 'nope' } });
  assert.equal(broken.activeExpedition, null, 'a structurally invalid expedition is discarded');
  assert.equal(broken.resources.scrap, 500, 'discarding the map never touches permanent assets');
  assert.equal(lt.normalizeMeta({ ...legacy }).version, 4, 'plain metas stamp to v4');
}

// -- played flow through the real canvas host -------------------------------------------

const createGame = require('./test-harness.cjs');
{
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) };
  const game = createGame({ storage });
  const { ui, run, json } = game;
  ui.tap('startButton');
  assert.ok(ui.visible('mapScreen'), 'departure opens the map directly (no L1 contract)');
  assert.equal(run('state.activeExpedition.visitedIds.length'), 1, 'L1 is cleared on departure');
  const first = json('expedition.reachableNext(state.activeExpedition).map(n=>n.id)');
  assert.equal(first.length, 2, 'two L2 nodes are reachable');
  ui.tap('mapNode-' + first[0]);
  assert.equal(ui.disabled('mapStartButton'), false, 'a reachable node can be started');
  ui.tap('mapStartButton');
  assert.equal(run('state.mode'), 'combat', 'starting the node enters combat');
  assert.ok(run('state.activeExpedition.checkpoint') !== null, 'the entry checkpoint is persisted before combat');
  assert.equal(json('longterm.loadMeta(metaStorage).activeExpedition.checkpoint') !== null, true, 'and survives a reload in storage');
  assert.equal(json('longterm.loadMeta(metaStorage).activeExpedition.nodeLedger.length'), 1, 'the node budget B is fixed at first start');

  // Victory: survive to the end of the 60-second node.
  run('state.trainHp = state.maxTrainHp; state.enemies=[]; state.spawnClock=1e9; state.routeDistance=0.01; state.pendingLevelUps=0;');
  run('for(let i=0;i<400;i++) update(1/60);');
  assert.equal(run('state.mode'), 'menu', 'victory returns to the map');
  assert.ok(ui.visible('mapScreen'), 'the map is back after the node');
  const saved = json('longterm.loadMeta(metaStorage)');
  assert.equal(saved.activeExpedition.visitedIds.length, 2, 'the route advanced in storage');
  assert.equal(saved.activeExpedition.lockedNodeId, null, 'victory frees the layer lock');
  assert.ok(saved.resources.scrap > 0, 'the node payout reached permanent scrap: ' + saved.resources.scrap);
  assert.ok(saved.activeExpedition.tokens > 0, 'node tokens were awarded at the base rate: ' + saved.activeExpedition.tokens);
  assert.equal(saved.activeExpedition.pendingOp, null, 'the victory transaction fully committed');
  const ledger = saved.activeExpedition.nodeLedger[0];
  assert.equal(ledger.done, true, 'the ledger marks the node settled');
  assert.equal(ledger.paid.scrap, ledger.B.scrap, 'victory paid out the whole budget minus prior payouts');

  // Failure: die in the next node, verify rollback, payout cap and retry lock.
  const next = json('expedition.reachableNext(state.activeExpedition).map(n=>n.id)');
  ui.tap('mapNode-' + next[0]);
  ui.tap('mapStartButton');
  const hpAtEntry = run('state.maxTrainHp');
  run('state.enemies=[]; state.spawnClock=1e9; state.pendingLevelUps=0; state.routeDistance=30; state.trainHp=0;');
  run('update(1/60);');
  assert.equal(run('state.mode'), 'result', 'death opens the failure report');
  const failed = json('longterm.loadMeta(metaStorage).activeExpedition');
  assert.equal(failed.visitedIds.length, 2, 'failure does not advance the route');
  assert.equal(failed.checkpoint, null, 'the attempt checkpoint is cleared');
  assert.equal(failed.lockedNodeId, next[0], 'the layer stays locked to the failed node');
  assert.equal(failed.trainHpPct, 1, 'hp rolls back to the entry checkpoint value');
  const failLedger = failed.nodeLedger.find(e => e.nodeId === next[0]);
  assert.ok(failLedger.paid.scrap > 0, 'the capped failure payout was credited: ' + failLedger.paid.scrap);
  assert.ok(failLedger.paid.scrap <= ex.fix3(failLedger.B.scrap * failLedger.p * failLedger.keep) + 1e-9, 'and never exceeds B×p×keep');
  ui.tap('restartButton');
  assert.ok(ui.visible('mapScreen'), 'the failure report returns to the map');
  assert.deepEqual(json('expedition.reachableNext(state.activeExpedition).map(n=>n.id)'), [next[0]], 'retry is limited to the failed node');

  // Reload: a fresh page resumes the same map and expedition.
  const game2 = createGame({ storage });
  const { ui: ui2, run: run2, json: json2 } = game2;
  ui2.tap('startButton');
  assert.ok(ui2.visible('mapScreen'), 'a reload resumes the expedition map');
  assert.equal(json2('longterm.loadMeta(metaStorage).activeExpedition.visitedIds.length'), 2, 'with the persisted route');
  assert.ok(ui2.text('mapTitle').includes('2/12'), 'the header shows the current layer');
  assert.deepEqual(json2('expedition.reachableNext(state.activeExpedition).map(n=>n.id)'), [next[0]], 'the failure lock survives the reload');

  // Interrupt: starting a node and closing the page rolls back without payout.
  ui2.tap('mapNode-' + next[0]);
  ui2.tap('mapStartButton');
  const beforeInterrupt = json2('longterm.loadMeta(metaStorage).activeExpedition.nodeLedger.find(e=>e.nodeId==="' + next[0] + '")');
  const game3 = createGame({ storage });
  const { ui: ui3, json: json3 } = game3;
  ui3.tap('startButton');
  assert.ok(ui3.visible('mapScreen'), 'an interrupted attempt reopens on the map');
  const afterInterrupt = json3('longterm.loadMeta(metaStorage).activeExpedition');
  assert.equal(afterInterrupt.checkpoint, null, 'the interrupt checkpoint is cleared');
  assert.equal(afterInterrupt.pendingOp, null, 'an interrupt never pays out');
  assert.deepEqual(afterInterrupt.nodeLedger.find(e => e.nodeId === next[0]).paid, beforeInterrupt.paid, 'the ledger is unchanged by the interrupt');
}
// -- whole-map endgame: L12 settlement and reset ----------------------------------------

{
  const values = new Map();
  const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) };
  const game = createGame({ storage });
  const { ui, run, json } = game;
  ui.tap('startButton');
  for (let layer = 2; layer <= 12; layer++) {
    const next = json('expedition.reachableNext(state.activeExpedition).map(n=>n.id)');
    assert.ok(next.length >= 1, 'layer ' + layer + ' stays reachable');
    ui.tap('mapNode-' + next[0]);
    ui.tap('mapStartButton');
    run('state.trainHp = state.maxTrainHp; state.enemies=[]; state.spawnClock=1e9; state.routeDistance=0.01; state.pendingLevelUps=0;');
    run('for(let i=0;i<400;i++) update(1/60);');
    if (layer < 12) assert.equal(run('state.mode'), 'menu', 'layer ' + layer + ' cleared back to the map');
  }
  assert.equal(run('state.activeExpedition.status'), 'completed', 'the map completes at L12');
  const meta1 = json('longterm.loadMeta(metaStorage)');
  assert.equal(meta1.totals.expeditions, 1, 'one whole-map expedition is counted');
  assert.equal(meta1.totals.wins, 1, 'one win is counted');
  assert.equal(meta1.totals.losses, 0, 'node failures never inflate map losses');
  assert.ok(meta1.settledRunIds.includes(meta1.activeExpedition.id), 'the map id joins the dedup ledger');
  assert.equal(meta1.regions.wasteland.clears, 1, 'the region clear is counted once');
  assert.equal(meta1.regions.ruins.unlocked, true, 'winning unlocks the next region');
  // Final node budget (60 scrap at region 1.0 for a bare account) plus the
  // 30-scrap clear bonus - both must land (规划 §7.1).
  assert.ok(meta1.resources.scrap >= 90, 'the final node budget and the clear bonus are both paid: ' + meta1.resources.scrap);
  const totalsBefore = json('longterm.loadMeta(metaStorage).totals');
  run('longterm.settleRun(longterm.loadMeta(metaStorage), {id: state.activeExpedition.id, startExpeditions: 0}, "won")');
  assert.deepEqual(json('longterm.loadMeta(metaStorage).totals'), totalsBefore, 'settling the same map id twice is rejected');

  // Reset after real progress maps to exactly one extracted run.
  ui.tap('restartButton');
  const afterWin = json('longterm.loadMeta(metaStorage).totals');
  ui.tap('startButton');
  const next = json('expedition.reachableNext(state.activeExpedition).map(n=>n.id)');
  ui.tap('mapNode-' + next[0]);
  ui.tap('mapStartButton');
  run('state.trainHp = state.maxTrainHp; state.enemies=[]; state.spawnClock=1e9; state.routeDistance=0.01; state.pendingLevelUps=0;');
  run('for(let i=0;i<400;i++) update(1/60);');
  ui.tap('mapResetButton');
  ui.tap('mapResetConfirm');
  const meta2 = json('longterm.loadMeta(metaStorage)');
  assert.equal(meta2.totals.expeditions, afterWin.expeditions + 1, 'a reset with progress counts one expedition');
  assert.equal(meta2.totals.extracts, afterWin.extracts + 1, 'a reset maps to extracted');
  assert.equal(meta2.activeExpedition.status, 'reset', 'the reset map is kept as a summary');
  assert.equal(run('state.mode'), 'menu', 'reset returns home cleanly');
}
console.log('expedition domain, flow, migration and persistence tests passed');

// -- §19.1 serialization budget fixtures ------------------------------------------------

function depthOf(value) {
  let max = 0;
  const walk = (v, d) => { if (v && typeof v === 'object') { max = Math.max(max, d); for (const k of Object.keys(v)) walk(v[k], d + 1); } };
  walk(value, 0);
  return max;
}
{
  // Worst legal account: 256 settled UUIDs, longest names, full research and
  // blueprints, a complete expedition (ledger, checkpoint, pending victory)
  // and a realistic record.latest - all inside the 28KiB working budget and
  // depth 8, and accepted by the real save-service validator.
  const meta = lt.emptyMeta();
  for (let i = 0; i < 256; i++) meta.settledRunIds.push(crypto.randomUUID());
  for (const id of lt.RESEARCH_IDS) meta.research[id] = 30;
  meta.blueprints = lt.BLUEPRINTS.map(bp => bp.id);
  meta.loadout = lt.CAR_DEFS.map(car => car.id);
  meta.presets.forEach((preset, i) => { preset.name = '最长方案名一二三四五六七八九十' + (i + 1); });
  const exp = ex.generateExpedition({ regionId: 'infection', seed: 12345, id: 'zz9zz9', startExpeditions: 999 });
  const combatIds = exp.nodes.filter(n => n.type !== 'start').map(n => n.id);
  exp.contract = { id: 'fragile', name: '脆弱护送', description: '列车受到的直接伤害 +20%', rewardMultiplier: 1.2, enemyHpMultiplier: 1, scrapMultiplier: 1.25, trainDamageMultiplier: 1.2 };
  exp.tokens = 9999;
  for (let i = 0; i < 12; i++) {
    exp.nodeLedger.push(ex.makeLedgerEntry(combatIds[i], { scrap: 123.456, data: 67.891, components: 12.345 }, 0.9));
    exp.visitedIds.push(combatIds[i]);
  }
  for (const id of ex.MODULE_IDS) exp.build.modules[id] = 12;
  exp.build.breakthroughs = { missile: 'cluster', piercing: 'focus' };
  exp.growth = { experience: 999.999, experienceToNext: 40, level: 12, pendingLevelUps: 20 };
  exp.checkpoint = ex.checkpointFor(exp, combatIds[12]);
  exp.riskBlueprints = lt.BLUEPRINTS.map(bp => bp.id).slice(0, 12);
  exp.summary = { attempts: 999999, failures: 999999, kills: 999999 };
  const withExpedition = lt.normalizeMeta({ ...meta, activeExpedition: exp });
  assert.equal(withExpedition.activeExpedition && withExpedition.activeExpedition.nodes.length, 29, 'the fixture expedition survives normalization');
  const latest = rr.buildRunSummary({ station: 5, kills: 900, scrap: 999, bestCombo: 90, outcome: 'won', activeEvent: null, activeContract: null, modules: exp.build.modules, coreStacks: exp.build.coreStacks, weaponStats: Object.fromEntries(ex.MODULE_IDS.map(id => [id, { damage: 12345.6, kills: 678, volleys: 9012 }])), bondStats: { blue: { damage: 999.9, kills: 99, casts: 45, maxLevel: 9 }, red: { damage: 999.9, kills: 99, casts: 45, maxLevel: 9 }, purple: { damage: 999.9, kills: 99, casts: 45, maxLevel: 9 } } });
  const record = rr.mergeRecord(rr.emptyRecord(), latest);
  const payload = { schemaVersion: 1, meta: withExpedition, record };
  const bytes = Buffer.byteLength(JSON.stringify(payload));
  assert.ok(bytes <= 28672, 'worst legal payload stays inside the 28KiB working budget (got ' + bytes + ')');
  assert.ok(depthOf(payload) <= 8, 'worst legal payload stays inside depth 8 (got ' + depthOf(payload) + ')');
  assert.doesNotThrow(() => validate(payload), 'the real save service accepts the worst legal payload');
  // The victory pendingOp adds the final-settle snapshot and still validates.
  const pending = JSON.parse(JSON.stringify(withExpedition));
  pending.activeExpedition.pendingOp = { kind: 'victory', nodeId: combatIds[0], payout: { scrap: 28, data: 3, components: 0.4 }, tokens: 9999, hpPct: 0.5, final: false };
  assert.doesNotThrow(() => validate({ schemaVersion: 1, meta: pending, record }), 'a pending node victory validates');
  // Corrupt expeditions are rejected by the service, not partially sanitized.
  const broken = JSON.parse(JSON.stringify(withExpedition));
  broken.activeExpedition.nodes[5].nextIds = ['zz'];
  assert.throws(() => validate({ schemaVersion: 1, meta: broken, record }), /invalid_save/, 'a broken graph is rejected');
  const deep = JSON.parse(JSON.stringify(withExpedition));
  deep.activeExpedition.nodes[5].nextIds = [1, 2, 3];
  assert.throws(() => validate({ schemaVersion: 1, meta: deep, record }), /invalid_save|invalid_number/, 'non-id edges reject');
  assert.throws(() => validate({ schemaVersion: 1, meta: { ...meta, version: 5 }, record }), /invalid_save/, 'unknown meta versions still reject');
}
console.log('expedition serialization budget fixtures passed');
