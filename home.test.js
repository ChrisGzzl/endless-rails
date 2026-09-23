'use strict';
const assert=require('node:assert/strict');
const meta=require('./longterm');
const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))};
const m=meta.emptyMeta();m.resources={scrap:500,components:20,data:100};meta.saveMeta(storage,m);
const g=require('./test-harness.cjs')({storage}),e=g.elements,home=g.sandbox.window.EndlessRailsMetaUI;
const tabs=[['shop','homeTabShop','homeShop'],['train','homeTabTrain','metaScreen'],['battle','homeTabBattle','homeBattle'],['research','homeTabResearch','homeResearch'],['settings','startSettingsButton','homeSettings']];
assert.equal(home.getTab(),'battle');assert.equal(e.homeBattle.hidden,false);assert.equal(e.homeScrap.textContent,'500');
for(const [key,id,panel] of tabs){e[id].events.click();assert.equal(home.getTab(),key);assert.equal(e[panel].hidden,false);for(const [other,otherId,otherPanel] of tabs){assert.equal(e[otherId]['aria-selected'],String(key===other));assert.equal(e[otherPanel].hidden,key!==other);}}
assert.equal(g.run('settingsOpen'),false,'settings tab is a page, not a blocking modal');
e.homeTabBattle.events.keydown({code:'ArrowRight',preventDefault(){},stopPropagation(){}});assert.equal(home.getTab(),'research');
e.homeTabTrain.events.click();e.metaTrainUpgradeButton.events.click();assert.equal(meta.loadMeta(storage).train.level,2);assert.equal(e.homeScrap.textContent,'440');
e.homeTabResearch.events.click();e.metaResearchList.children[0].queries.button.events.click();assert.equal(meta.loadMeta(storage).research.rapid,1);assert.equal(e.homeData.textContent,'92');
e.metaStartButton.events.click();assert.equal(home.getTab(),'battle');assert.equal(e.startScreen.hidden,false);
e.startButton.events.click();assert.equal(e.startScreen.hidden,true);assert.equal(g.run('state.mode'),'contractChoice');
g.run('finish(false)');e.restartButton.events.click();assert.equal(home.getTab(),'battle');assert.equal(e.startScreen.hidden,false);
console.log('home tabs, keyboard navigation, shared economy, direct launch and return passed');
