'use strict';
// v0.10 列车构筑与永久研究回归：曲线对账（两周成长计算表.xlsx）、点数合法性、
// 三套参考方案、派生属性、改装费用与方案槽、v0.9 存档迁移。
const assert = require('node:assert/strict');
const meta = require('../src/meta/longterm');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);

// 列车只使用长期废料购买整级，不积累局外经验。
assert.equal(meta.trainUpgradeCost(1), 71);
assert.equal(meta.trainUpgradeCost(29), 1723);
let total = 0; for (let L = 1; L < 30; L++) total += meta.trainUpgradeCost(L);
assert.equal(total, 21273, 'Lv1→Lv30 cumulative scrap');
const noFunds = meta.emptyMeta();
assert.equal(meta.buyTrainUpgrade(noFunds).purchased, false);
assert.equal(meta.buyTrainUpgrade(noFunds).short, 71);
noFunds.resources.scrap = 70.999;
assert.equal(meta.buyTrainUpgrade(noFunds).purchased, false, 'a fractional shortfall cannot buy a partial level');
noFunds.resources.scrap = 71;
const bought = meta.buyTrainUpgrade(noFunds);
assert.equal(bought.purchased, true); assert.equal(bought.meta.train.level, 2);
assert.equal(bought.meta.resources.scrap, 0); assert.deepEqual(noFunds.train, { level: 1 });
assert.equal(meta.talentPoints({ train: { level: 1 } }), 2, 'Lv1 grants two points');
assert.equal(meta.talentPoints({ train: { level: 30 } }), 60, 'Lv30 grants sixty points');
assert.deepEqual([1, 7, 8, 17, 18, 30].map(level => meta.carSlots({ train: { level } })), [2, 2, 3, 3, 4, 4], 'functional car slots are 2/3/4 by level band');

// §18/成本曲线 研究成本与计算表逐级对账（废料/主材料/交叉材料）
const XLSX_ATTACK = { 1: [13, 3, 0], 5: [33, 11, 1], 10: [93, 36, 3], 11: [96, 38, 0], 15: [110, 45, 3], 20: [128, 54, 3], 25: [145, 63, 3], 30: [163, 71, 3] };
const XLSX_TRAIN = { 1: [13, 0, 1], 5: [33, 5, 2], 10: [93, 15, 5], 15: [110, 15, 7], 20: [128, 15, 9], 30: [163, 15, 13] };
for (const [L, expect] of Object.entries(XLSX_ATTACK)) {
  const cost = meta.researchCostFor('fireControl', Number(L));
  assert.deepEqual([cost.scrap, cost.data, cost.components], expect, `attack research →Lv${L} matches the spreadsheet`);
}
for (const [L, expect] of Object.entries(XLSX_TRAIN)) {
  const cost = meta.researchCostFor('hullEngineering', Number(L));
  assert.deepEqual([cost.scrap, cost.data, cost.components], expect, `train research →Lv${L} matches the spreadsheet`);
}
for (const [target, expect] of [[10, [3066, 548, 104]], [20, [10906, 2048, 426]], [30, [21196, 4073, 908]]]) {
  const sums = { scrap: 0, data: 0, components: 0 };
  for (const id of meta.RESEARCH_IDS) for (let L = 1; L <= target; L++) {
    const cost = meta.researchCostFor(id, L);
    sums.scrap += cost.scrap; sums.data += cost.data; sums.components += cost.components;
  }
  assert.deepEqual([sums.scrap, sums.data, sums.components], expect, `seven tracks to Lv${target} match the growth model`);
}

// §16.1 阶段效果
near(meta.researchMultiplier('fireControl', 10), 1.15, 'fireControl Lv10');
near(meta.researchMultiplier('fireControl', 20), 1.23, 'fireControl Lv20');
near(meta.researchMultiplier('fireControl', 30), 1.28, 'fireControl Lv30');
near(meta.researchMultiplier('cycleControl', 10), 0.92, 'cycle Lv10');
near(meta.researchMultiplier('cycleControl', 30), 0.86, 'cycle Lv30');
near(meta.researchMultiplier('rangeCalibration', 30), 1.15, 'range Lv30');
near(meta.researchMultiplier('hullEngineering', 30), 1.35, 'hull engineering Lv30');
near(meta.researchMultiplier('repairEngineering', 10), 1.25, 'repair engineering Lv10');
near(meta.researchMultiplier('armorMaterials', 20), 0.99 ** 10 * 0.995 ** 10, 'armor stacks multiplicatively');

// §7 天赋树结构与合法性
let treeTotal = 0;
for (const branch of meta.TALENT_BRANCHES) {
  let branchMax = 0;
  for (const node of meta.TALENT_NODES.filter(node => node.branch === branch.id)) branchMax += node.levels * node.cost;
  assert.equal(branchMax, branch.cap, `${branch.name} branch max equals its cap`);
  treeTotal += branchMax;
}
assert.equal(treeTotal, 110, 'the effective tree is 110 points');
const lv5 = meta.normalizeMeta({ train: { level: 5 } });
assert.match(meta.nodeBlockReason(lv5, lv5.talents, 'H3'), /Lv\.8/, 'H3 is level-locked until Lv8');
assert.equal(meta.nodeBlockReason(lv5, lv5.talents, 'D0'), null, 'D0 is purchasable at Lv5');
const lv9 = meta.normalizeMeta({ train: { level: 9 } });
assert.match(meta.nodeBlockReason(lv9, lv9.talents, 'N3'), /连续供弹/, 'N3 requires its N2 prerequisite');
const lv30 = meta.normalizeMeta({ train: { level: 30 } });
const allNodes = {};
for (const node of meta.TALENT_NODES) allNodes[node.id] = node.levels;
const allSpecs = { hull: 'fortress', pointDefense: 'heavy', repair: 'field', radar: 'tactical', storage: 'armorBay' };
assert.ok(meta.talentProblems(lv30, meta.normalizeTalents({ nodes: allNodes, specs: allSpecs })).some(problem => problem.includes('超过可用')), 'allocations beyond 60 points are rejected');

// §13 三套参考 Build（Lv30、60 点、真实点法）
function buildCase(nodes, specs, loadout) {
  const normalized = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes, specs }, loadout, research: {} });
  return { normalized, problems: meta.talentProblems(normalized, normalized.talents), spent: meta.spentPoints(normalized.talents) };
}
const fireSupport = buildCase({ H1: 3, H2: 3, H3: 2, H4: 1, N0: 1, N1: 3, N2: 3, N3: 2, N4: 1, N5: 3, D0: 1, D1: 3, D2: 3, D3: 1, D4: 3 }, { pointDefense: 'heavy', radar: 'tactical' }, ['hangar', 'pointDefense', 'radar']);
const endurance = buildCase({ H1: 3, H2: 3, H3: 2, H4: 2, H5: 1, N0: 1, N1: 3, N2: 3, N3: 2, R0: 1, R1: 3, R2: 3, R3: 2, R4: 1, R5: 2 }, { hull: 'fortress', repair: 'field' }, ['hangar', 'pointDefense', 'repair']);
const recycler = buildCase({ H1: 2, H2: 2, R0: 1, R1: 3, R2: 3, R3: 2, D0: 1, D1: 3, D2: 3, D3: 1, D4: 3, C0: 1, C1: 2, C2: 3, C3: 1, C4: 3 }, { radar: 'survey', storage: 'cargoBay' }, ['hangar', 'repair', 'radar', 'storage']);
for (const [name, build] of [['火力支援', fireSupport], ['重装续航', endurance], ['资源回收', recycler]]) {
  assert.deepEqual(build.problems, [], `${name} is a legal allocation`);
  assert.equal(build.spent, 60, `${name} spends exactly 60 points`);
}
const recyclerStats = meta.buildStats(recycler.normalized);
near(recyclerStats.scrapYieldMul, 1.15, 'recycler scrap yield');
near(recyclerStats.dataYieldMul, 1.15, 'recycler data yield');
near(recyclerStats.componentYieldMul, 1.06, 'recycler component yield');

// §8/§11/§12 派生属性
const hullFull = { H1: 3, H2: 3, H3: 2, H4: 2, H5: 1 };
const fortress = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: { ...hullFull }, specs: { hull: 'fortress' } }, loadout: ['hangar'] });
near(meta.buildStats(fortress).maxHp, 140, 'full hull + 移动堡垒 reaches +40% HP');
near(meta.buildStats(fortress).damageTakenMul, 1 - .09, 'H2 buffers 9% at max');
const radarFull = { D0: 1, D1: 3, D2: 3, D3: 1, D4: 3 };
const radarOn = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: radarFull, specs: { radar: 'tactical' } }, loadout: ['hangar', 'radar'] });
near(meta.buildStats(radarOn).pickupRadiusMul, 1.42, 'radar pickup radius reaches +42%');
near(meta.buildStats(radarOn).eliteDamageMul, 1.06, '战术标定 adds 6% vs elites');
const radarOff = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: radarFull, specs: { radar: 'tactical' } }, loadout: ['hangar'] });
near(meta.buildStats(radarOff).pickupRadiusMul, 1, 'an unequipped radar car grants nothing');
near(meta.buildStats(radarOff).eliteDamageMul, 1, '战术标定 requires the radar car equipped');
const storeFull = { C0: 1, C1: 2, C2: 3, C3: 1, C4: 3 };
const armorBay = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: storeFull, specs: { storage: 'armorBay' } }, loadout: ['hangar', 'storage'] });
near(meta.buildStats(armorBay).failureKeep, .88, '装甲仓 at max storage keeps 88%');
const cargoBay = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: storeFull, specs: { storage: 'cargoBay' } }, loadout: ['hangar', 'storage'] });
near(meta.buildStats(cargoBay).failureKeep, .70, '回收货柜 keeps 70%');
assert.ok(meta.buildStats(armorBay).failureKeep <= .90 && meta.buildStats(cargoBay).failureKeep <= .90, 'failure keep never exceeds 90%');
const reserve = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: hullFull, specs: { hull: 'reserve' } }, loadout: ['hangar'] });
near(meta.buildStats(reserve).emergencyReserve, 100 * (1 + .12 + .12) * .18, '应急储备 heals 18% of max HP');
const repairFull = { R0: 1, R1: 3, R2: 3, R3: 2, R4: 1, R5: 2 };
const fieldRun = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: { ...repairFull, ...hullFull }, specs: { repair: 'field' } }, loadout: ['hangar', 'repair'] });
near(meta.buildStats(fieldRun).fieldRepairPer10s, 124 * .005 * (1 + .24 + .16), '行进抢修 scales with R1+R5');
const overhaul = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: { ...repairFull }, specs: { repair: 'overhaul' } }, loadout: ['hangar', 'repair'] });
const overhaulStats = meta.buildStats(overhaul);
near(overhaulStats.repairCar.flat * overhaulStats.repairCar.mul, (12 + 4) * (1 + .24 + .16), '到站大修 flat repair scales with R1+R5');
near(overhaulStats.repairCar.overhaulPct, .04, '到站大修 adds 4% of max HP per stop');
// 未装备维修车时 R 分支不生效（H4 仍生效）
const repairNoCar = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: { ...hullFull, ...repairFull }, specs: { hull: 'fortress' } }, loadout: ['hangar'], research: {} });
const noCarStats = meta.buildStats(repairNoCar);
assert.equal(noCarStats.repairCar, null, 'no repair car means no repair-car layer');
near(noCarStats.stationBaseMul, 1 + .05 * 2, 'H4 keeps working without the repair car');
// 近防专精
const pdHeavy = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: { N0: 1, N1: 3, N2: 3, N3: 2, N4: 1, N5: 3 }, specs: { pointDefense: 'heavy' } }, loadout: ['hangar', 'pointDefense'], research: { trainFireControl: 30 } });
const heavyStats = meta.buildStats(pdHeavy).pd;
near(heavyStats.damageMul, (1 + .2 + .15) * 1.35 * 1.28, '重型近防 damage');
near(heavyStats.intervalMul, (1 - .15) * 1.2, '重型近防 interval');
near(heavyStats.eliteMul, 1.15, '重型近防 elite factor');
const intercept = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: { N0: 1, N1: 3, N2: 3, N3: 2, N4: 1, N5: 3 }, specs: { pointDefense: 'intercept' } }, loadout: ['hangar', 'pointDefense'] });
const interceptStats = meta.buildStats(intercept).pd;
near(interceptStats.damageMul, (1 + .2 + .15) * .90, '拦截阵列 damage');
near(interceptStats.intervalMul, (1 - .15) * .85, '拦截阵列 interval');

// §14 改装费用与免费重构
assert.equal(meta.refitCost({ train: { level: 30 } }), 25, 'Lv30 refit costs 25 scrap');
assert.equal(meta.refitCost({ train: { level: 1 } }), 11, 'Lv1 refit costs 11 scrap');
const base = meta.normalizeMeta({ train: { level: 10 }, talents: { nodes: { H1: 3, H2: 3 } }, resources: { scrap: 0, components: 0, data: 0 } });
const add = meta.applyTalents(base, { nodes: { H1: 3, H2: 3, N0: 1 }, specs: {} });
assert.equal(add.applied, true); assert.equal(add.paid, false); assert.equal(add.meta.resources.scrap, 0, 'adding new points is free');
const withdraw = meta.applyTalents(add.meta, { nodes: { H1: 3 }, specs: {} });
assert.equal(withdraw.applied, true); assert.equal(withdraw.paid, true); assert.equal(withdraw.meta.freeRefits, 2); assert.equal(withdraw.meta.resources.scrap, 0, 'the first paid refit consumes a free one');
const readded = meta.applyTalents(withdraw.meta, { nodes: { H1: 3, H2: 1, N0: 1 }, specs: {} });
assert.equal(readded.paid, false, 're-adding withdrawn points is a fresh free addition');
let drained = meta.applyTalents(withdraw.meta, { nodes: { H1: 2 }, specs: {} }).meta;
drained = meta.applyTalents(drained, { nodes: { H1: 1 }, specs: {} }).meta;
assert.equal(drained.freeRefits, 0, 'free refits run out');
const rejected = meta.applyTalents(drained, { nodes: {}, specs: {} });
assert.equal(rejected.applied, false, 'a paid refit without scrap is rejected');
assert.match(rejected.problems.join(''), /废料不足/);
drained.resources.scrap = 40;
const paid = meta.applyTalents(drained, { nodes: {}, specs: {} });
assert.equal(paid.applied, true); assert.equal(paid.charged, meta.refitCost(drained)); assert.equal(paid.meta.resources.scrap, 40 - paid.charged);
// 非法草稿（超点数）被拒绝且不扣费
const illegal = meta.applyTalents(base, { nodes: { H1: 3, H2: 3, H3: 2, H4: 2, H5: 1 }, specs: { hull: 'fortress' } });
assert.equal(illegal.applied, false); assert.equal(illegal.meta.resources.scrap, 0);

// §14.3 方案槽：保存、载入、非法标记
const presetHolder = meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: { H1: 3 } } });
const withPreset = meta.savePreset(presetHolder, 1, { nodes: { N0: 1, N1: 3 }, specs: {} }, ['hangar', 'pointDefense']);
assert.equal(withPreset.presets[1].talents.nodes.N1, 3);
const loaded = meta.loadPreset(withPreset, 1);
assert.equal(loaded.problems.length, 0); assert.equal(loaded.loadout[1], 'pointDefense');
const lowLevelOwner = meta.normalizeMeta({ train: { level: 3 } });
const savedHigh = meta.savePreset(lowLevelOwner, 0, { nodes: { N0: 1, N1: 3, N2: 1 }, specs: {} }, ['hangar', 'pointDefense']);
const flagged = meta.loadPreset(savedHigh, 0);
assert.ok(flagged.problems.some(problem => problem.includes('连续供弹')), 'an over-level preset reports its problems');
assert.equal(flagged.talents.nodes.N2, 1, 'the preset contents are not silently trimmed');

// §24 v0.9 → v0.10 迁移
const legacy = {
  version: 1,
  resources: { scrap: 500, components: 9, data: 10 },
  train: { level: 12, xp: 35 },
  unlockedCars: ['hangar', 'pointDefense', 'storage', 'radar', 'repair'],
  loadout: ['hangar', 'pointDefense', 'storage', 'radar', 'repair'],
  selectedRegion: 'ruins',
  regions: { wasteland: { unlocked: true, clears: 3, repaired: true }, ruins: { unlocked: true, clears: 1 } },
  blueprints: ['pd-array', 'radar-pulse', 'bio-scan'],
  research: { rapid: 3, missile: 1 },
  totals: { expeditions: 40, wins: 20, losses: 20 },
};
const backup = new Map();
const store = { getItem: key => backup.get(key) ?? null, setItem: (key, value) => backup.set(key, value) };
store.setItem(meta.STORAGE_KEY, JSON.stringify(legacy));
const migrated = meta.loadMeta(store);
assert.equal(migrated.version, 4);
assert.equal(migrated.train.level, 12, 'levels up to 30 are kept');
assert.deepEqual(migrated.train, {level:12}, 'migration removes the experience field');
assert.equal(migrated.migration.refundedData, 48 + 8, 'old research is fully refunded in data');
assert.deepEqual(migrated.migration.convertedBlueprints, ['pd-array', 'bio-scan'], 'stat blueprints convert, intel ones stay');
assert.equal(migrated.resources.data, 10 + 56 + 30 * 2, 'refund + two blueprint compensations');
assert.equal(migrated.resources.scrap, 500 + 90 * 2 + Math.floor(35 / (70 + 11 * 35) * meta.trainUpgradeCost(12)), 'old progress returns scrap once');
const oldV2 = { ...meta.emptyMeta(), version: 2, resources: { scrap: 100, components: 0, data: 0 }, train: { level: 4, xp: 375, totalXp: 1000 } };
const converted = meta.normalizeMeta(oldV2);
assert.equal(converted.version, 4);
assert.deepEqual(converted.train, { level: 4 });
assert.equal(converted.resources.scrap, 100 + Math.floor(375 / (150 + 200 * 3) * meta.trainUpgradeCost(4)));
assert.deepEqual(meta.normalizeMeta(converted), converted, 'v2 conversion is idempotent');
// 旧编组映射：Lv12 三槽上限内按 近防>维修>仓储>雷达 生成合法起始编组（雷达节点仍解锁）
assert.deepEqual(migrated.loadout, ['hangar', 'pointDefense', 'repair', 'storage'], 'slot cap drops the lowest-priority car from the formation');
assert.equal(migrated.talents.nodes.N0, 1); assert.equal(migrated.talents.nodes.R0, 1);
assert.equal(migrated.talents.nodes.D0, 1); assert.equal(migrated.talents.nodes.C0, 1);
assert.equal(meta.talentProblems(migrated, migrated.talents).length, 0, 'the migrated default plan is legal');
assert.ok(meta.spentPoints(migrated.talents) <= meta.talentPoints(migrated), 'mapped nodes stay within the point budget');
assert.equal(migrated.freeRefits, 3, 'migrated accounts get three free refits');
assert.ok(migrated.blueprints.includes('radar-pulse'), 'kept blueprints stay in the collection');
assert.equal(migrated.regions.wasteland.repaired, true, 'region progress survives');
assert.deepEqual(meta.loadMeta(store), migrated, 're-loading does not re-migrate or double-refund');
assert.equal(backup.get(meta.BACKUP_KEY), JSON.stringify(legacy), 'the raw v0.9 save is snapshotted once');

console.log('v0.10 talent tree, research curves, reference builds, stats, refit, presets and migration passed');
