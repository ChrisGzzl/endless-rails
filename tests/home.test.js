'use strict';
const assert=require('node:assert/strict');
const meta=require('../src/meta/longterm');
const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))};
const m=meta.emptyMeta();m.resources={scrap:500,components:20,data:100};meta.saveMeta(storage,m);
const g=require('./test-harness.cjs')({storage}),{ui}=g,home=g.sandbox.EndlessRailsMetaUI;
const tabs=[['shop','homeTabShop','homeShop'],['train','homeTabTrain','metaScreen'],['battle','homeTabBattle','homeBattle'],['research','homeTabResearch','homeResearch'],['settings','startSettingsButton','homeSettings']];
assert.equal(home.getTab(),'battle');assert.equal(ui.visible('homeBattle'),true);assert.equal(ui.text('homeScrap'),'500');
ui.tap('homeLoadout');assert.equal(home.getTab(),'train');assert.equal(ui.visible('metaScreen'),true);ui.tap('homeTabBattle');
for(const [key,id,panel] of tabs){ui.tap(id);assert.equal(home.getTab(),key);assert.equal(ui.visible(panel),true);for(const [other,otherId,otherPanel] of tabs){assert.equal(!!ui.node(otherId).focusable,key===other,'only the selected tab is in the Tab order');assert.equal(ui.visible(otherPanel),key===other);}}
assert.equal(g.run('dialogCtl.settingsOpen'),false,'settings tab is a page, not a blocking modal');
ui.tap('homeTabBattle');g.run("EndlessRailsCanvasHost.kit.focus('homeTabBattle', true)");
ui.key('keydown','ArrowRight');assert.equal(home.getTab(),'research');assert.equal(g.run('EndlessRailsCanvasHost.kit.focusedKey()'),'homeTabResearch','arrow keys move focus with the selection');
// v0.10: the train page edits a draft and applies it; buying the first hull node
// only adds new points, so the refit is free (需求 §14.2).
ui.tap('homeTabTrain');ui.tap('trainWorkshopOpen');
assert.ok(ui.text('talentPointsLine').includes('2'),'draft shows two spare points at Lv1');
ui.tap('plus-H1');  // raise H1 to 1
ui.tap('plus-H1');  // raise H1 to 2
assert.equal(ui.disabled('talentApply'),false,'a legal draft enables apply');
ui.tap('talentApply');
const saved=meta.loadMeta(storage);
assert.equal(saved.talents.nodes.H1,2);assert.equal(saved.resources.scrap,500,'adding new points stays free');
assert.equal(ui.disabled('talentApply'),true,'apply resets once the draft matches the allocation');
// Withdrawing a bought point is a paid change consumed from the 3 free refits.
ui.tap('minus-H1');
ui.tap('talentApply');
assert.equal(meta.loadMeta(storage).talents.nodes.H1,1);
assert.equal(meta.loadMeta(storage).freeRefits,2,'v0.10 accounts start with three free refits');
ui.tap('homeTabResearch');
// seven permanent research rows
assert.equal(ui.keys('research-').filter(k=>/^research-\w+$/.test(k)).length,7);
ui.tap('research-fireControl');
assert.equal(meta.loadMeta(storage).research.fireControl,1);assert.equal(ui.text('homeData'),'97');
ui.tap('homeTabTrain');ui.tap('metaStartButton');assert.equal(home.getTab(),'battle');assert.equal(ui.visible('startScreen'),true);
ui.tap('startButton');assert.equal(ui.visible('startScreen'),false);assert.equal(g.run('state.mode'),'contractChoice');
g.run('presentation.renderResult(settleFinish(false))');ui.tap('restartButton');assert.equal(home.getTab(),'battle');assert.equal(ui.visible('startScreen'),true);
console.log('home tabs, keyboard navigation, talent draft economy, research purchase, direct launch and return passed');
