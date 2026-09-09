"use strict";
const assert=require("node:assert/strict");
const createGame=require("./test-harness.cjs");
const {run,elements,windowEvents}=createGame();
run(`state.mode="combat";state.routeDistance=40;state.moveInput={x:1,y:0};state.weaponClocks.gun=.1;
state.modules={missile:2};state.shots=[{x:100,y:200,vx:100,vy:0,life:2}];togglePause();`);
assert.equal(run('state.paused'),true);
assert.equal(elements.pauseScreen.hidden,false);
assert.equal(run('state.moveInput.x'),0,"pause clears held movement");
const frozen=run('JSON.stringify({time:state.visualTime,world:state.worldDistance,shots:state.shots,clocks:state.weaponClocks,route:state.routeDistance})');
run('update(10);');
assert.equal(run('JSON.stringify({time:state.visualTime,world:state.worldDistance,shots:state.shots,clocks:state.weaponClocks,route:state.routeDistance})'),frozen);
elements.inspectSelect.events.change({target:{value:"missile"}});
assert.ok(elements.inspectRole.textContent.includes("远程"));
assert.ok(elements.inspectStats.innerHTML.includes("340 px"));
assert.ok(elements.inspectStats.innerHTML.includes("6.4"));
elements.inspectUpgrade.events.click();
assert.ok(elements.inspectStats.innerHTML.includes("6.4 → 7.8"));
assert.equal(run('state.modules.missile'),2,"inspection never purchases upgrades");
elements.resumeButton.events.click();
assert.equal(run('state.paused'),false);assert.equal(elements.pauseScreen.hidden,true);
assert.equal(run('state.moveInput.x'),0,"resuming does not restore stale joystick input");

run('state.mode="docking";state.docking={offset:100,elapsed:0,duration:2.4};togglePause();');
run('update(1);');assert.equal(run('state.docking.offset'),100);
run('togglePause();state.mode="levelup";state.pendingLevelUps=2;togglePause();');
assert.equal(elements.resumeButton.textContent,"返回选择界面");
elements.resumeButton.events.click();
assert.equal(run('state.mode'),"levelup");assert.equal(run('state.pendingLevelUps'),2);
run('state.mode="combat";state.paused=false;');
windowEvents.blur.forEach(fn=>fn());assert.equal(run('state.paused'),true,"window blur pauses combat");
run('resetRun();');assert.equal(elements.pauseScreen.hidden,true);

// Small displays paginate data instead of creating a scrolling overlay.
run('window.innerHeight=568;state.mode="combat";togglePause();inspector.tab="global";renderPause();');
assert.equal((elements.inspectStats.innerHTML.match(/inspect-stat/g)||[]).length,9);
assert.equal(elements.inspectPageNav.hidden,false);
elements.inspectNextPage.events.click();assert.ok(elements.inspectPage.textContent.startsWith("2"));
elements.inspectWeapon.events.click();assert.equal(run('inspector.page'),0);
for(const id of ['app','startScreen','pauseScreen','stationScreen','levelUpScreen']){
  for(const type of ['dragstart','selectstart','contextmenu']){
    let prevented=false;elements[id].events[type]({preventDefault(){prevented=true;}});
    assert.ok(prevented,id+" prevents native "+type);
  }
}
console.log("pause freeze/resume, inspector, pagination and touch-gesture tests passed");
