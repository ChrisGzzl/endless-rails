'use strict';
// 修订方案 §4 核查路径 1 的机器化红线：战斗路径不得逐帧读取账号对象。
// sim 层（除结算）禁止出现 metaProfile；hasBlueprint 只允许出现在
// meta 门面与局外 UI（flow-logic 的雷达情报文案是展示，不是数值）。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const meta = require('../src/meta/longterm');

const read = rel => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const simFiles = fs.readdirSync(path.resolve(__dirname, '../src/sim')).filter(f => f.endsWith('.js'));

for (const file of simFiles) {
  const src = read('src/sim/' + file);
  if (file === 'run.js') {
    // settleLongterm 在终局读写账号（结算事务），是 sim 层唯一合法入口。
    const settlementVocabulary = line => line.includes('settleRun') || line.includes('settlement') || line.includes('metaSettled');
    const lines = src.split('\n').map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(item => item.line.includes('metaProfile') && !settlementVocabulary(item.line));
    assert.deepEqual(lines, [], 'sim/run.js may touch metaProfile only inside the settlement transaction');
  } else {
    assert.ok(!src.includes('metaProfile'), `src/sim/${file} must not read the account profile mid-combat (修订方案 §4)`);
  }
  assert.ok(!src.includes('hasBlueprint'), `src/sim/${file} must not query blueprint ownership; fold effects into the departure snapshot instead`);
}
{
  const engine = read('src/app/engine.js');
  const offender = engine.split('\n').map((line, i) => ({ line: line.trim(), no: i + 1 }))
    .filter(item => item.line.includes('hasBlueprint'));
  assert.deepEqual(offender, [], 'engine.js combat loop must not query blueprint ownership (bio-scan 残留红线)');
}

// 快照确实承载蓝图效果位：拥有 rail-lens 的账号出发快照带标记，未拥有为 false。
const withBp = meta.normalizeMeta({ train: { level: 30 }, blueprints: ['rail-lens', 'ricochet-prism'], talents: { nodes: {} }, loadout: ['hangar'] });
const statsWith = meta.buildStats(withBp);
assert.equal(statsWith.blueprints.railLens, true, 'owned rail-lens folds into the snapshot');
assert.equal(statsWith.blueprints.ricochetPrism, true, 'owned ricochet-prism folds into the snapshot');
assert.equal(statsWith.blueprints.arcResonator, false, 'unowned blueprints stay false');
const statsWithout = meta.buildStats(meta.normalizeMeta({ train: { level: 30 }, talents: { nodes: {} }, loadout: ['hangar'] }));
assert.deepEqual(statsWithout.blueprints, { railLens: false, arcResonator: false, missileGuidance: false, incendiaryGel: false, ricochetPrism: false }, 'a bare account folds no blueprint effects');

// 行为验证（通过真实引擎）：蓝图增强作用于局内突破选择，且出发后修改账号不影响本局。
const values = new Map(), storage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, String(v)) };
const createGame = require('./test-harness.cjs');
const g = createGame({ storage });
g.run(`longterm.saveMeta(metaStorage,longterm.normalizeMeta({train:{level:10},blueprints:['rail-lens'],talents:{nodes:{N0:1}},loadout:['hangar','pointDefense']}));beginRun();`);
const basePierce = g.run('applyResearchProfile("piercing",effects.weaponProfile("piercing",10,{})).pierce');
g.run('state.breakthroughs.piercing="focus";');
const focusPierce = g.run('applyResearchProfile("piercing",effects.weaponProfile("piercing",10,{})).pierce');
// 局内移除账号蓝图（模拟局外修改），快照仍生效。
g.run('state.metaProfile.blueprints=[];');
const frozenPierce = g.run('applyResearchProfile("piercing",effects.weaponProfile("piercing",10,{})).pierce');
assert.equal(focusPierce, basePierce + 1 + 2, 'focus breakthrough adds its +2 and rail-lens adds +1 pierce (folded from the snapshot)');
assert.equal(frozenPierce, focusPierce, 'editing the account mid-run cannot change this run\'s folded blueprint effects');
// 无蓝图账号同样的突破只吃基础 +2。
const g2 = createGame({ storage: (() => { const m = new Map(); return { getItem: k => m.get(k) || null, setItem: (k, v) => m.set(k, String(v)) }; })() });
g2.run(`longterm.saveMeta(metaStorage,longterm.normalizeMeta({train:{level:10},talents:{nodes:{N0:1}},loadout:['hangar','pointDefense']}));beginRun();state.breakthroughs.piercing="focus";`);
assert.equal(g2.run('applyResearchProfile("piercing",effects.weaponProfile("piercing",10,{})).pierce'), basePierce + 2, 'without the blueprint the same breakthrough adds only its own +2');

console.log('meta boundary red line, blueprint snapshot folding and run freezing passed');
