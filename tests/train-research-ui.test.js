'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const meta = require('../src/meta/longterm');
const createGame = require('./test-harness.cjs');

// The entry query alone does not invalidate cached transitive ES modules:
// every module of the graph must be mapped to the release-versioned URL.
{
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const imports = JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)[1]).imports;
  const version = html.match(/<script type="module" src="[^"]+\?v=(v[^"]+)"/)[1];
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return; seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/^import\s*(?:\{[^}]*\}\s*from\s*)?["']([^"']+)["']/gm)) visit(path.resolve(path.dirname(file), m[1]));
  };
  visit(path.join(root, 'src/main.js'));
  for (const file of seen) {
    const rel = './' + path.relative(root, file).replace(/\\/g, '/');
    if (rel === './src/main.js') continue;
    assert.equal(imports[rel], `${rel}?v=${version}`, `index.html must bypass stale ${rel}`);
  }
  assert.match(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'), new RegExp(version.replace(/\./g, '\\.')), 'the manifest carries the release version');
  assert.match(html, new RegExp('sw\\.js\\?v=' + version.replace(/\./g, '\\.')), 'the service worker registration carries the release version');
}

const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
};
const profile = () => {
  const m = meta.emptyMeta();
  m.train.level = 8;
  m.talents = meta.normalizeTalents({ nodes: { N0: 1, R0: 1, D0: 1, C0: 1 } });
  m.loadout = ['hangar', 'pointDefense', 'repair', 'radar'];
  return m;
};

// An affordable, atomic train purchase; settlement does not change level in the background.
{
  const saved = storage(), starting = meta.emptyMeta();
  starting.resources.scrap = 70;
  meta.saveMeta(saved, starting);
  const { ui, run, json } = createGame({ storage: saved });
  ui.tap('homeTabTrain');
  assert.equal(ui.disabled('metaTrainUpgradeButton'), true);
  assert.match(ui.text('metaTrainUpgradeButton'), /升级至 Lv\.2/);
  assert.match(ui.text('trainUpgradeHint'), /废料 71（差 1）/);
  assert.deepEqual(json('homeCtl.model().train.hint'), { short: true, cost: 71, gap: 1 }, 'the missing cost is marked short (red)');
  starting.resources.scrap = 100; meta.saveMeta(saved, starting);
  const game = createGame({ storage: saved });
  game.ui.tap('homeTabTrain');
  game.ui.tap('metaTrainUpgradeButton');
  assert.equal(meta.loadMeta(saved).train.level, 2);
  assert.equal(meta.loadMeta(saved).resources.scrap, 29);
  assert.match(game.ui.text('metaTalentPoints'), /可用改装点 4/);
  assert.match(game.ui.text('trainFirepower'), /无人机伤害 ×1\.00/);
  assert.match(game.ui.text('trainDurability'), /列车耐久 ×1\.00/);
}

// Cost numbers turn red only for resources actually short; enough stock enables purchase.
{
  const saved = storage(), starting = meta.emptyMeta();
  starting.resources.scrap = 30; starting.resources.data = 3;
  meta.saveMeta(saved, starting);
  const { ui, run, json } = createGame({ storage: saved });
  ui.tap('homeTabResearch');
  const row = json('homeCtl.model().research.groups[0].rows.find(r => r.name === "火控算法")');
  assert.ok(row.costs.every(c => !c.short));
  assert.equal(ui.disabled('research-fireControl'), false);
  ui.tap('research-fireControl');
  assert.equal(meta.loadMeta(saved).research.fireControl, 1);
}

// Full slots require an explicit removal, and the resulting lineup stays a draft.
{
  const saved = storage(); meta.saveMeta(saved, profile());
  const { ui, run, json } = createGame({ storage: saved });
  assert.match(ui.text('homeLoadout').replace(/\s+/g, ''), /^编组5节·伤害×1.00耐久×1.00·维修×1.00·调整→/);
  assert.match(ui.node('homeLoadout').label, /伤害×1.00，耐久×1.00 · 维修×1.00/);
  ui.tap('homeTabTrain');
  assert.equal(ui.visible('trainWorkshop'), false, 'workshop starts closed under the train overview');
  assert.match(ui.text('trainBuildCount'), /3 \/ 3 功能车厢/);
  assert.match(ui.text('trainBuildCars'), /近防车厢/);
  ui.tap('trainWorkshopOpen');
  assert.equal(ui.visible('trainWorkshop'), true);
  ui.tap('car-storage');
  assert.match(ui.text('talentProblems'), /编组已满/);
  assert.deepEqual(meta.loadMeta(saved).loadout, ['hangar', 'pointDefense', 'repair', 'radar']);
  ui.tap('car-repair'); ui.tap('car-storage');
  assert.match(ui.text('metaLoadoutSummary'), /草稿 3\/3/);
  assert.match(ui.text('car-storage'), /草稿加入/);
  assert.deepEqual(meta.loadMeta(saved).loadout, ['hangar', 'pointDefense', 'repair', 'radar']);
  ui.tap('talentApply');
  assert.deepEqual(meta.loadMeta(saved).loadout, ['hangar', 'pointDefense', 'radar', 'storage']);
  ui.tap('homeTabResearch');
  const row = json('homeCtl.model().research.groups[0].rows.find(r => r.name === "火控算法")');
  assert.deepEqual(row.costs.map(c => [c.label, c.value, c.short]), [['废料', 13, true], ['数据', 3, true]]);
  assert.equal(row.effect, '+0.0%'); assert.equal(row.nextEffect, '+1.5%');
  assert.equal(ui.text('research-fireControl'), '资源不足');
  assert.equal(ui.disabled('research-fireControl'), true);
}

// A selected car remains removable if its unlock talent is withdrawn in the draft.
{
  const saved = storage(); meta.saveMeta(saved, profile());
  const { ui } = createGame({ storage: saved });
  ui.tap('homeTabTrain'); ui.tap('trainWorkshopOpen');
  ui.tap('branch-pointDefense');
  ui.tap('minus-N0');
  assert.equal(ui.disabled('car-pointDefense'), false);
  assert.match(ui.text('car-pointDefense'), /点击从草稿移除/);
  ui.tap('car-pointDefense');
  assert.match(ui.text('metaLoadoutSummary'), /草稿/);
}

// Explicit save and rename controls avoid accidental preset overwrite.
{
  const saved = storage(); meta.saveMeta(saved, profile());
  let confirm = false;
  const { ui } = createGame({ storage: saved, window: { confirm: () => confirm, prompt: () => '新方案' } });
  ui.tap('homeTabTrain'); ui.tap('trainWorkshopOpen');
  ui.tap('presetRename0');
  assert.equal(meta.loadMeta(saved).presets[0].name, '新方案');
  ui.tap('presetSave0');
  assert.deepEqual(meta.loadMeta(saved).presets[0].loadout, ['hangar']);
  confirm = true; ui.tap('presetSave0');
  assert.deepEqual(meta.loadMeta(saved).presets[0].loadout, profile().loadout);
}

// Without a confirm dialog (mini-game runtimes) saving asks for a second tap.
{
  const saved = storage(); meta.saveMeta(saved, profile());
  const { ui, run, json } = createGame({ storage: saved, window: { prompt: () => '车间方案' } });
  run('delete globalThis.confirm');
  ui.tap('homeTabTrain'); ui.tap('trainWorkshopOpen');
  ui.tap('presetRename0');
  assert.equal(meta.loadMeta(saved).presets[0].name, '车间方案');
  ui.tap('presetSave0');
  assert.deepEqual(meta.loadMeta(saved).presets[0].loadout, ['hangar']);
  ui.tap('presetSave0');
  assert.deepEqual(meta.loadMeta(saved).presets[0].loadout, profile().loadout);
  // scrolled content stays tappable where it is drawn
  ui.tap('car-repair'); ui.tap('car-storage');
  ui.tap('talentApply');
  assert.deepEqual(meta.loadMeta(saved).loadout, ['hangar', 'pointDefense', 'radar', 'storage']);
  const scrolled = run('EndlessRailsCanvasHost.kit.getScroll("metaScreen")');
  assert.ok(scrolled > 0, 'reaching apply scrolled the train page');
  const research = json('homeCtl.model().research.groups.flatMap(g => g.rows)');
  assert.equal(new Set(research.map(row => row.icon)).size, 7);
  assert.ok(research.every(row => row.disabled && row.label.includes('还差')), 'insufficient research cannot be bought');
}

// The shared preview reports the attributes a draft actually changes.
{
  const before = profile(), after = profile();
  after.loadout = ['hangar', 'pointDefense', 'storage', 'radar'];
  const rows = meta.buildChangeRows(meta.buildStats(before), meta.buildStats(after));
  assert.ok(rows.some(row => row.includes('维修车固定量')));
  assert.ok(rows.some(row => row.includes('失败保留率')));
  assert.equal(new Set(Object.values(meta.RESEARCH_ICONS)).size, 7);
}
console.log('train and research draft, costs, icons, diff and scrolled taps passed');
