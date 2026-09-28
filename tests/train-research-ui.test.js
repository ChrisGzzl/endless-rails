'use strict';
const assert = require('node:assert/strict');
const meta = require('../src/meta/longterm');
const createGame = require('./test-harness.cjs');

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

// Full slots require an explicit removal, and the resulting lineup stays a draft.
{
  const saved = storage(); meta.saveMeta(saved, profile());
  const { elements: e } = createGame({ storage: saved });
  e.homeTabTrain.events.click();
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
  assert.match(row.innerHTML, /research-cost/);
  assert.match(row.innerHTML, /废料还差/);
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
  assert.ok(h.regions.some(r => r.action?.talentApply === true) === false);
  h.handleRegionAction({ toggleCar: 'storage' });
  assert.match(h.host.talent.notice, /编组已满/);
  assert.deepEqual(meta.loadMeta(saved).loadout, ['hangar', 'pointDefense', 'repair', 'radar']);
  h.handleRegionAction({ toggleCar: 'repair' });
  const apply = h.regions.find(r => r.action?.talentApply);
  assert.ok(apply && apply.y >= h.host.viewportHeight && apply.y + apply.h <= 730 * 680 / 800, 'apply remains fixed above tabs');
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
