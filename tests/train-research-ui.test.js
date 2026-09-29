'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const meta = require('../src/meta/longterm');
const createGame = require('./test-harness.cjs');

// The entry query alone does not invalidate cached transitive ES modules.
for (const [page, modules] of [
  ['index.html', ['src/meta/longterm.js', 'src/app/meta-ui.js', 'src/app/flows.js', 'src/app/gm.js']],
  ['canvas.html', ['src/meta/longterm.js', 'src/app/canvas-host.js', 'src/view/canvas-home.js', 'src/view/canvas-ui.js']],
]) {
  const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
  const imports = JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)[1]).imports;
  const version = html.match(/<script type="module" src="[^"]+\?v=(v[^"]+)"/)[1];
  for (const module of modules) assert.equal(imports[`./${module}`], `./${module}?v=${version}`, `${page} must bypass stale ${module}`);
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

// Both hosts expose an affordable, atomic train purchase; settlement does not
// change level in the background.
{
  const saved = storage(), starting = meta.emptyMeta();
  starting.resources.scrap = 70;
  meta.saveMeta(saved, starting);
  const { elements: e } = createGame({ storage: saved });
  e.homeTabTrain.events.click();
  assert.equal(e.metaTrainUpgradeButton.disabled, true);
  assert.match(e.metaTrainUpgradeButton.textContent, /升级至 Lv\.2/);
  assert.match(e.trainUpgradeHint.innerHTML, /resource-short">71<\/b>（差 1）/);
  starting.resources.scrap = 100; meta.saveMeta(saved, starting);
  const game = createGame({ storage: saved });
  game.elements.homeTabTrain.events.click();
  game.elements.metaTrainUpgradeButton.events.click();
  assert.equal(meta.loadMeta(saved).train.level, 2);
  assert.equal(meta.loadMeta(saved).resources.scrap, 29);
  assert.match(game.elements.metaTalentPoints.textContent, /可用改装点 4/);
  assert.match(game.elements.trainFirepower.textContent, /无人机伤害 ×1\.00/);
  assert.match(game.elements.trainDurability.textContent, /列车耐久 ×1\.00/);
  const canvasSave = storage(); starting.resources.scrap = 100; meta.saveMeta(canvasSave, starting);
  const canvas = createGame({ storage: canvasSave, entry: 'canvas.html' });
  const host = canvas.run('window.EndlessRailsCanvasHost');
  host.handleRegionAction({ homeTab: 'train' });
  assert.ok(host.regions.some(region => region.action?.trainUpgrade), 'Canvas exposes upgrade hitbox');
  host.handleRegionAction({ trainUpgrade: true });
  assert.equal(meta.loadMeta(canvasSave).train.level, 2);
  assert.equal(meta.loadMeta(canvasSave).resources.scrap, 29);
  assert.equal(host.host.trainStats.fire, 1);
}

// Cost numbers turn red only for resources actually short; enough stock enables purchase.
{
  const saved = storage(), starting = meta.emptyMeta();
  starting.resources.scrap = 30; starting.resources.data = 3;
  meta.saveMeta(saved, starting);
  const { elements: e } = createGame({ storage: saved });
  e.homeTabResearch.events.click();
  const row = e.metaResearchList.children.find(child => child.innerHTML?.includes('火控算法'));
  assert.doesNotMatch(row.innerHTML, /research-cost__item is-short/);
  assert.equal(row.querySelector('button').disabled, false);
  row.querySelector('button').events.click();
  assert.equal(meta.loadMeta(saved).research.fireControl, 1);
}

// Full slots require an explicit removal, and the resulting lineup stays a draft.
{
  const saved = storage(); meta.saveMeta(saved, profile());
  const { elements: e } = createGame({ storage: saved });
  assert.match(e.homeLoadout.innerHTML, /<b>编组 5 节 · 伤害×1.00<\/b><small>耐久×1.00 · 维修×1.00 · 调整 →<\/small>/);
  assert.match(e.homeLoadout['aria-label'], /伤害×1.00，耐久×1.00 · 维修×1.00/);
  e.homeTabTrain.events.click();
  assert.equal(e.trainWorkshop.hidden, true, 'workshop starts closed under the train overview');
  assert.match(e.trainBuildCount.textContent, /3 \/ 3 功能车厢/);
  assert.match(e.trainBuildCars.innerHTML, /近防车厢/);
  e.trainWorkshopOpen.events.click();
  assert.equal(e.trainWorkshop.hidden, false);
  assert.equal(e.trainWorkshopOpen['aria-expanded'], 'true');
  const storageCar = () => e.metaCarList.children.find(button => button.innerHTML.includes('仓储车厢'));
  const repairCar = () => e.metaCarList.children.find(button => button.innerHTML.includes('维修车厢'));
  storageCar().events.click();
  assert.match(e.talentProblems.textContent, /编组已满/);
  assert.deepEqual(meta.loadMeta(saved).loadout, ['hangar', 'pointDefense', 'repair', 'radar']);
  repairCar().events.click(); storageCar().events.click();
  assert.match(e.metaLoadoutSummary.textContent, /草稿 3\/3/);
  assert.match(storageCar().innerHTML, /草稿加入/);
  assert.deepEqual(meta.loadMeta(saved).loadout, ['hangar', 'pointDefense', 'repair', 'radar']);
  e.talentApply.events.click();
  assert.deepEqual(meta.loadMeta(saved).loadout, ['hangar', 'pointDefense', 'radar', 'storage']);
  const row = e.metaResearchList.children.find(child => child.innerHTML?.includes('火控算法'));
  assert.doesNotMatch(row.innerHTML, /research-progress|role="progressbar"/);
  assert.match(row.innerHTML, /research-cost/);
  assert.match(row.innerHTML, /research-cost__item is-short[^\n]*废料 <b>13<\/b>/);
  assert.match(row.innerHTML, /research-cost__item is-short[^\n]*数据 <b>3<\/b>/);
  assert.match(row.innerHTML, /当前 \+0\.0%[^<]*<span aria-hidden="true">→<\/span> 升级 \+1\.5%/);
  assert.match(row.innerHTML, /data-research="fireControl"[^>]*disabled/);
}

// A selected car remains removable if its unlock talent is withdrawn in the draft.
{
  const saved = storage(); meta.saveMeta(saved, profile());
  const { elements: e } = createGame({ storage: saved });
  e.homeTabTrain.events.click();
  e.talentBranchTabs.children[1].events.click();
  e.talentNodeList.children[0].children[1].children[0].events.click();
  const car = e.metaCarList.children.find(button => button.innerHTML.includes('近防车厢'));
  assert.equal(car.disabled, false);
  assert.match(car.innerHTML, /点击从草稿移除/);
  car.events.click();
  assert.match(e.metaLoadoutSummary.textContent, /草稿/);
}

// Explicit save and rename controls avoid accidental preset overwrite.
{
  const saved = storage(); meta.saveMeta(saved, profile());
  let confirm = false;
  const { elements: e } = createGame({ storage: saved, window: { confirm: () => confirm, prompt: () => '新方案' } });
  e.homeTabTrain.events.click();
  const actions = () => e.talentPresetBar.children[0].children[1].children;
  actions()[0].events.click();
  assert.equal(meta.loadMeta(saved).presets[0].name, '新方案');
  actions()[1].events.click();
  assert.deepEqual(meta.loadMeta(saved).presets[0].loadout, ['hangar']);
  confirm = true; actions()[1].events.click();
  assert.deepEqual(meta.loadMeta(saved).presets[0].loadout, profile().loadout);
}

// The Canvas scroll layer must expose hitboxes at displayed screen coordinates.
{
  const saved = storage(); meta.saveMeta(saved, profile());
  const game = createGame({ storage: saved, entry: 'canvas.html' });
  const h = game.run('window.EndlessRailsCanvasHost');
  h.handleRegionAction({ homeTab: 'train' });
  assert.ok(h.regions.some(r => r.action?.trainWorkshopToggle), 'Canvas shows workshop entry');
  assert.ok(!h.regions.some(r => r.action?.toggleCar), 'closed Canvas workshop hides its car actions');
  assert.ok(h.regions.some(r => r.action?.talentApply === true) === false);
  h.handleRegionAction({ trainWorkshopToggle: true });
  h.handleRegionAction({ toggleCar: 'storage' });
  assert.match(h.host.talent.notice, /编组已满/);
  assert.deepEqual(meta.loadMeta(saved).loadout, ['hangar', 'pointDefense', 'repair', 'radar']);
  h.handleRegionAction({ toggleCar: 'repair' });
  h.host.scroll = Math.max(0, h.host.contentHeight - h.host.viewportHeight);
  game.run('nextFrame(16)');
  const apply = h.regions.find(r => r.action?.talentApply);
  assert.ok(apply && apply.y >= 0 && apply.y + apply.h <= h.host.viewportHeight, 'apply appears inline at the end of scrolled workshop');
  h.host.scroll = Math.min(360, h.host.contentHeight - h.host.viewportHeight);
  game.run('nextFrame(16)');
  const region = h.regions.find(r => r.action?.toggleCar === 'storage');
  assert.ok(region && region.y >= 0 && region.y + region.h <= h.host.viewportHeight, 'visible scrolled car hitbox is clipped to viewport');
  h.pointerDown({ pointerId: 9, clientX: region.x + region.w / 2, clientY: region.y + region.h / 2, pointerType: 'touch', button: 0 });
  h.pointerUp({ pointerId: 9 });
  assert.ok(h.host.talent.loadout.includes('storage'), 'tap selects displayed car after scrolling');
  assert.deepEqual(meta.loadMeta(saved).loadout, ['hangar', 'pointDefense', 'repair', 'radar']);
  h.handleRegionAction({ talentApply: true });
  assert.deepEqual(meta.loadMeta(saved).loadout, ['hangar', 'pointDefense', 'radar', 'storage']);
  h.handleRegionAction({ homeTab: 'research' });
  assert.equal(new Set(h.host.researchRows.map(row => row.icon)).size, 7);
  assert.ok(h.host.researchRows.every(row => row.missing.some(x => x.includes('还差'))));
  assert.ok(h.host.researchRows.every(row => row.shortKeys.length > 0));
  assert.ok(!h.regions.some(r => r.action?.research), 'insufficient Canvas research has no active hitbox');
  game.sandbox.prompt = () => '车间方案';
  h.handleRegionAction({ presetRename: 0 });
  assert.equal(meta.loadMeta(saved).presets[0].name, '车间方案');
  h.handleRegionAction({ presetSave: 0 });
  assert.deepEqual(meta.loadMeta(saved).presets[0].loadout, ['hangar']);
  h.handleRegionAction({ presetSave: 0 });
  assert.deepEqual(meta.loadMeta(saved).presets[0].loadout, profile().loadout.filter(id => id !== 'repair').concat('storage'));
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
console.log('train and research draft, costs, icons, diff and canvas hitboxes passed');
