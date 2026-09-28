'use strict';
const assert=require('node:assert/strict');
const meta=require('../src/meta/longterm');
const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))};
const m=meta.emptyMeta();m.resources={scrap:500,components:20,data:100};meta.saveMeta(storage,m);
const g=require('./test-harness.cjs')({storage}),e=g.elements,home=g.sandbox.window.EndlessRailsMetaUI;
const tabs=[['shop','homeTabShop','homeShop'],['train','homeTabTrain','metaScreen'],['battle','homeTabBattle','homeBattle'],['research','homeTabResearch','homeResearch'],['settings','startSettingsButton','homeSettings']];
assert.equal(home.getTab(),'battle');assert.equal(e.homeBattle.hidden,false);assert.equal(e.homeScrap.textContent,'500');
e.homeLoadout.events.click();assert.equal(home.getTab(),'train');assert.equal(e.metaScreen.hidden,false);e.homeTabBattle.events.click();
for(const [key,id,panel] of tabs){e[id].events.click();assert.equal(home.getTab(),key);assert.equal(e[panel].hidden,false);for(const [other,otherId,otherPanel] of tabs){assert.equal(e[otherId]['aria-selected'],String(key===other));assert.equal(e[otherPanel].hidden,key!==other);}}
assert.equal(g.run('settingsOpen'),false,'settings tab is a page, not a blocking modal');
e.homeTabBattle.events.keydown({code:'ArrowRight',preventDefault(){},stopPropagation(){}});assert.equal(home.getTab(),'research');
// v0.10: the train page edits a draft and applies it; buying the first hull node
// only adds new points, so the refit is free (需求 §14.2).
e.homeTabTrain.events.click();
assert.ok(e.talentPointsLine.textContent.includes('2'),'draft shows two spare points at Lv1');
const h1Row=e.talentNodeList.children[0];
h1Row.children[1].children[2].events.click();  // raise H1 to 1
h1Row.children[1].children[2].events.click();  // raise H1 to 2
assert.equal(e.talentApply.disabled,false,'a legal draft enables apply');
e.talentApply.events.click();
const saved=meta.loadMeta(storage);
assert.equal(saved.talents.nodes.H1,2);assert.equal(saved.resources.scrap,500,'adding new points stays free');
assert.equal(e.talentApply.disabled,true,'apply resets once the draft matches the allocation');
// Withdrawing a bought point is a paid change consumed from the 3 free refits.
h1Row.children[1].children[0].events.click();
e.talentApply.events.click();
assert.equal(meta.loadMeta(storage).talents.nodes.H1,1);
assert.equal(meta.loadMeta(storage).freeRefits,2,'v0.10 accounts start with three free refits');
e.homeTabResearch.events.click();
// 2 group headers + 7 research rows
assert.equal(e.metaResearchList.children.length,9);
e.metaResearchList.children[1].queries.button.events.click();  // first track row (fireControl)
assert.equal(meta.loadMeta(storage).research.fireControl,1);assert.equal(e.homeData.textContent,'97');
e.metaStartButton.events.click();assert.equal(home.getTab(),'battle');assert.equal(e.startScreen.hidden,false);
e.startButton.events.click();assert.equal(e.startScreen.hidden,true);assert.equal(g.run('state.mode'),'contractChoice');
g.run('finish(false)');e.restartButton.events.click();assert.equal(home.getTab(),'battle');assert.equal(e.startScreen.hidden,false);
console.log('home tabs, keyboard navigation, talent draft economy, research purchase, direct launch and return passed');
