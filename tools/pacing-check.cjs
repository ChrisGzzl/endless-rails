'use strict';
// Deterministic, render-free pacing samples. This is not a browser FPS benchmark.
const createGame = require('../endless-rails/test-harness.cjs');
const runs = [];
for (let seed = 1; seed <= 12; seed++) {
  const {run} = createGame();
  run(`let rng=${seed};Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};resetRun();state.activeContract=routeEvents.CONTRACTS[2];beginRoute(routeEvents.ROUTE_EVENTS[2]);`);
  const result = run(`JSON.stringify((()=>{
    const upgrades=['blades','missile','incendiary','chain','piercing','rapid','ricochet','wingman'];
    let frames=0, peakEnemies=0, peakShots=0, upgradeCount=0;
    const checkpoints=[];
    while(state.mode!=='result'&&frames++<20000){
      if(state.mode==='levelup'){
        const ids=ui.levelUpList.children.map(c=>c.dataset.weapon).filter(Boolean);
        const choices=experiencePool.filter(u=>ids.includes(u.id));
        const choice=choices.sort((a,b)=>(level(a.id)*3+upgrades.indexOf(a.id))-(level(b.id)*3+upgrades.indexOf(b.id)))[0];
        chooseLevelUp(choice);upgradeCount++;
      }else if(state.mode==='station'){
        checkpoints.push({station:state.station,hp:Math.round(state.trainHp),level:state.level,kills:state.kills,banked:{...state.longtermRun.banked}});
        const offered=ui.upgrades.children.find(c=>c.innerHTML.includes('装甲铆接'))||ui.upgrades.children[0];offered.events.click();continueRun();beginRoute(routeEvents.ROUTE_EVENTS[2]);
      }else{
        // Modest pilot: patrol around the train, use pulse; no invincibility or GM buffs.
        const t=state.visualTime;
        const target={x:state.train.x+Math.cos(t*.5)*95,y:state.train.y+Math.sin(t*.5)*105};
        const dx=target.x-state.drone.x,dy=target.y-state.drone.y,d=Math.hypot(dx,dy)||1;
        state.moveInput={x:dx/d,y:dy/d};if(state.enemies.filter(e=>Math.hypot(e.x-state.train.x,e.y-state.train.y)<190).length>=7)pulse();
        update(1/60);
        peakEnemies=Math.max(peakEnemies,state.enemies.length);peakShots=Math.max(peakShots,state.shots.length);
      }
    }
    return {outcome:state.outcome,station:state.station,seconds:Math.round(state.visualTime),hp:Math.round(state.trainHp),level:state.level,kills:state.kills,upgradeCount,peakEnemies,peakShots,checkpoints,gained:state.metaSettlement?.gained};
  })())`, 60000);
  runs.push({seed,...JSON.parse(result)});
}
console.log(JSON.stringify(runs,null,2));
