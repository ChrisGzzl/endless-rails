"use strict";
const assert=require("node:assert/strict");
const createGame=require("./test-harness.cjs");
const game=createGame();
const {run,ui,windowEvents}=game;
run('homeCtl.isOpen=false;');
run(`state.mode="combat";state.routeDistance=40;state.moveInput={x:1,y:0};state.weaponClocks.gun=.1;
state.modules={missile:2};state.shots=[{x:100,y:200,vx:100,vy:0,life:2}];runCtl.togglePause();`);
assert.equal(run('state.paused'),true);
assert.equal(ui.visible('pauseScreen'),true);
assert.equal(run('state.moveInput.x'),0,"pause clears held movement");
const frozen=run('JSON.stringify({time:state.visualTime,world:state.worldDistance,shots:state.shots,clocks:state.weaponClocks,route:state.routeDistance})');
run('update(10);');
assert.equal(run('JSON.stringify({time:state.visualTime,world:state.worldDistance,shots:state.shots,clocks:state.weaponClocks,route:state.routeDistance})'),frozen);
const rowsText=()=>run('runCtl.inspector.model.rows.map(([l,v])=>l+" "+v).join("\\n")');
// the unit picker opens as a list; choosing an option switches the unit
ui.tap('inspectSelect');assert.ok(ui.visible('inspectSelectList'),'tapping the picker opens its option list');
const missileIndex=run('runCtl.pauseModel().options.findIndex(o=>o.value==="missile")');
ui.tap('inspectOption-'+missileIndex);
assert.equal(ui.visible('inspectSelectList'),false,'choosing an option closes the list');
assert.ok(ui.text('inspectSelect').includes('天隼'),'the picker shows the chosen unit');
assert.ok(ui.text('inspectRole').includes("远程"));
assert.ok(rowsText().includes("340 px"));
assert.ok(rowsText().includes("6.4"));
ui.tap('inspectUpgrade');
assert.ok(rowsText().includes("6.4 → 7.8"));
assert.equal(run('state.modules.missile'),2,"inspection never purchases upgrades");
assert.equal(ui.visible('inspectPageNav'),true,"single-page tabs keep the navigation rail in place");
ui.tap('resumeButton');
assert.equal(run('state.paused'),false);assert.equal(ui.visible('pauseScreen'),false);
assert.equal(run('state.moveInput.x'),0,"resuming does not restore stale joystick input");

run('state.mode="docking";state.docking={offset:100,elapsed:0,duration:2.4};runCtl.togglePause();');
run('update(1);');assert.equal(run('state.docking.offset'),100);
run('runCtl.togglePause();state.mode="levelup";state.pendingLevelUps=2;runCtl.togglePause();');
assert.equal(ui.text('resumeButton'),"返回选择界面");
ui.tap('resumeButton');
assert.equal(run('state.mode'),"levelup");assert.equal(run('state.pendingLevelUps'),2);
run('state.mode="combat";state.paused=false;');
windowEvents.blur.forEach(fn=>fn());assert.equal(run('state.paused'),true,"window blur pauses combat");
run('beginRun();');assert.equal(ui.visible('pauseScreen'),false);
run('Object.assign(runCtl.screens,{contract:null,route:null});');

// Small displays paginate data instead of creating a scrolling overlay; every
// page is checked against the data bay before the page size is fixed.
game.setViewport(390,568);
run('state.mode="combat";state.paused=false;runCtl.togglePause();runCtl.inspector.tab="global";runCtl.renderPause();');
const small=run('runCtl.inspector.pageSize');
assert.ok(small>=3&&small<=9,'short screens start from at most nine rows per page');
assert.equal(run('runCtl.inspector.model.rows.length')<=small,true);
assert.equal(ui.visible('inspectPageNav'),true);
const all=run('inspectRows(inspectFleet().find(d=>d.id===runCtl.inspector.id),"global").map(([l,v])=>l+" "+v).join("\\n")');
let collected=[],visited=0;
do{
  collected.push(rowsText());
  assert.equal(run('runCtl.inspector.page'),visited++);
  if(ui.disabled('inspectNextPage'))break;
  ui.tap('inspectNextPage');
}while(visited<30);
assert.equal(collected.join("\n"),all,"pagination neither skips nor repeats any parameter");
assert.ok(ui.text('inspectPage').startsWith(String(visited)),'the page counter follows Next');
ui.tap('inspectWeapon');assert.equal(run('runCtl.inspector.page'),0);
// the fitted page never overflows the data bay
const fits=run('(()=>{const vp=EndlessRailsCanvasHost.node("inspectViewport"),st=EndlessRailsCanvasHost.node("inspectStats");return st.h<=vp.h-vp.bt-vp.bb+1;})()');
assert.equal(fits,true,'every page fits the data bay');
game.setViewport(390,960);
assert.ok(run('runCtl.inspector.pageSize')>small,"resizing reclaims available data space");
// Native gestures (drag, selection, context menu) never start on the game canvas.
for(const type of ['dragstart','selectstart','contextmenu']){
  let prevented=false;(game.canvas.listeners[type]||[]).forEach(fn=>fn({preventDefault(){prevented=true;}}));
  assert.ok(prevented,"the canvas prevents native "+type);
}
console.log("pause freeze/resume, inspector, fitted pagination and touch-gesture tests passed");
