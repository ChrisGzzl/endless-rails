'use strict';
const assert = require('node:assert/strict');
const meta = require('../src/meta/longterm');

const retired = new Set(meta.BLUEPRINTS.filter(bp => bp.retired).map(bp => bp.id));
for (const region of meta.REGIONS) {
  assert.ok(region.blueprintPool.length > 0, region.id + ' has an earnable blueprint');
  for (const id of region.blueprintPool) {
    assert.ok(meta.blueprintById(id) && !retired.has(id), region.id + ' cannot drop retired ' + id);
  }
  const rolled = meta.rollBlueprint([], region.id, () => 0);
  assert.ok(rolled && !retired.has(rolled), region.id + ' rolls a live blueprint');
  assert.equal(meta.rollBlueprint(region.blueprintPool, region.id), null, 'owned pool is exhausted');
}
const owner = meta.normalizeMeta({ blueprints: ['pd-array', 'bio-scan'] });
assert.deepEqual(owner.blueprints, ['pd-array', 'bio-scan'], 'legacy collection is preserved');
const run = meta.createRun(owner);
meta.addBlueprintRisk(run, 'pd-array');
assert.deepEqual(run.riskBlueprints, [], 'retired rewards cannot enter the new run ledger');

run.stats.dataYieldMul = 1.15;
meta.awardRisk(run, 'data', 2);
meta.bankRisk(run);
assert.equal(run.banked.data, 3.45, 'arrival data is secured with the other earned data');
assert.equal(run.risk.data, 0, 'nothing from the previous segment remains at risk');
assert.equal(run.stationsBanked, 1);
const failed = meta.settleRun(owner, run, 'lost', { segmentProgress: 0 });
assert.equal(failed.gained.data, 3.45, 'failure immediately after docking keeps arrival data');
assert.deepEqual(failed.meta.train, owner.train, 'arrival rewards do not automatically raise train level');

const values = new Map();
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};
assert.equal(meta.saveMeta(storage, failed.meta), true);
const saved = meta.loadMeta(storage);
assert.ok(saved.settledRunIds.includes(run.id));
const repeat = meta.settleRun(saved, run, 'won');
assert.equal(repeat.alreadySettled, true, 'a reload cannot settle the same run again');
assert.deepEqual(repeat.gained, { scrap: 0, components: 0, data: 0 });
assert.deepEqual(repeat.meta, saved, 'replay does not change resources, levels, unlocks or totals');
const later = meta.normalizeMeta({ ...saved, totals: { ...saved.totals, expeditions: saved.totals.expeditions + 257 }, settledRunIds: [] });
assert.equal(meta.settleRun(later, run, 'won').alreadySettled, true, 'old runs stay spent after their IDs leave the bounded ledger');
assert.equal(meta.saveMeta({ setItem() { throw new Error('quota'); } }, failed.meta), false);

console.log('blueprint drops, station banking and persistent settlement replay passed');
