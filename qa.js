'use strict';
const frameEl=document.getElementById('game');
let samples=[],costs=[],errors=[],stress=false,previous=0,updateCost=0;
const resetSamples=()=>{samples=[];costs=[];previous=0;updateCost=0;};
const gameWindow=()=>frameEl.contentWindow;
const state=()=>gameWindow().EndlessRailsGame.getState();
function profile(grown=false){
 const w=gameWindow(),m=w.EndlessRailsLongterm.emptyMeta();
 if(grown){m.train.level=11;m.resources={scrap:500,components:20,data:100};m.loadout=['hangar','pointDefense','storage','radar','repair'];for(const id in m.research)m.research[id]=3;for(const id in m.regions)m.regions[id].unlocked=true;m.blueprints=['cargo-lock','radar-pulse'];}
 w.EndlessRailsLongterm.saveMeta(w.EndlessRailsLongterm.gameStorage(w),m);return m;
}
function scenario(name){
 const w=gameWindow();if(!w.EndlessRailsGame)return;
 stress=false;resetSamples();
 for(const el of w.document.querySelectorAll('.overlay,#gmPanel'))el.hidden=true;
 const m=profile(!['fresh','normal'].includes(name));
 if(name==='fresh'||name==='grown'){w.EndlessRailsMetaUI.open();return;}
 w.EndlessRailsGame.startRun(w.EndlessRailsLongterm.planFor(m));
 const s=state();s.activeContract=w.EndlessRailsRouteEvents.CONTRACTS[2];w.document.getElementById('contractScreen').hidden=true;
 w.beginRoute(w.EndlessRailsRouteEvents.ROUTE_EVENTS[2]);
 if(name==='normal')return;
 s.modules={rapid:9,missile:10,incendiary:10,ricochet:10,chain:10,piercing:10,scatter:10,blades:10,wingman:3};s.station=5;
 if(name==='stress'){
   stress=true;s.trainHp=s.maxTrainHp=100000;s.cameraZoom=.85;s.routeElapsed=45;s.spawnClock=Infinity;s.enemies=[];w.syncSwarm();
   const v=w.cameraView();
   for(let i=0;i<240;i++){const a=i*2.399,r=60+i%11*12;s.enemies.push({kind:i%6===0?'charger':'walker',x:v.cx+Math.cos(a)*r,y:v.cy+Math.sin(a)*r,qaX:v.cx+Math.cos(a)*r,qaY:v.cy+Math.sin(a)*r,r:9,hp:100000,maxHp:100000,speed:0,delay:0,hit:0,hue:i/240});}
 }else if(name==='breakthrough'){
   s.modules.missile=9;s.pendingLevelUps=1;w.openLevelUp();w.chooseLevelUp({id:'missile'});
 }else{
   s.station=2;s.pendingLevelUps=0;s.longtermRun.risk={scrap:120,components:3,data:8};w.arriveStation();
   if(name==='result')w.extractRun();
 }
 w.updateHud();w.draw();
}
frameEl.addEventListener('load',()=>{
 const w=gameWindow();
 w.addEventListener('error',e=>errors.push(e.message));
 const update=w.update,draw=w.draw;
 w.update=function(...args){const start=performance.now();if(stress){state().trainHp=state().maxTrainHp;state().routeDistance=60;state().pendingLevelUps=0;for(const e of state().enemies){e.dead=false;e.x=e.qaX;e.y=e.qaY;}}const value=update(...args);updateCost+=performance.now()-start;return value;};
 w.draw=function(...args){const start=performance.now(),value=draw(...args);costs.push(updateCost+performance.now()-start);if(costs.length>600)costs.shift();updateCost=0;return value;};
 const tick=now=>{if(['combat','docking'].includes(state().mode)&&!state().paused){if(previous)samples.push(now-previous);if(samples.length>600)samples.shift();previous=now;}else previous=0;w.requestAnimationFrame(tick);};w.requestAnimationFrame(tick);
});
for(const button of document.querySelectorAll('[data-size]'))button.onclick=()=>{const [width,height]=button.dataset.size.split(',');frameEl.width=width;frameEl.height=height;resetSamples();};
for(const button of document.querySelectorAll('[data-case]'))button.onclick=()=>scenario(button.dataset.case);
document.getElementById('sample').onclick=resetSamples;
setInterval(()=>{
 const w=gameWindow();if(!w.EndlessRailsGame)return;
 const s=state(),mean=a=>a.length?a.reduce((a,b)=>a+b,0)/a.length:0,p95=a=>a.length?[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*.95)]:0;
 document.getElementById('metrics').textContent=JSON.stringify({viewport:`${w.innerWidth}×${w.innerHeight}`,mode:s.mode,frames:samples.length,fps:+(1000/(mean(samples)||Infinity)).toFixed(1),frameP95ms:+p95(samples).toFixed(2),workMeanMs:+mean(costs).toFixed(2),workP95Ms:+p95(costs).toFixed(2),enemies:s.enemies.filter(e=>!e.dead).length,shots:s.shots.length,effects:s.weaponFx.length,particles:s.particles.length,zoom:+s.cameraZoom.toFixed(3)},null,2);
 const problems=[];
 for(const panel of w.document.querySelectorAll('.overlay:not([hidden]),#gmPanel:not([hidden])')){
   for(const el of panel.querySelectorAll('button,.upgrade-card h3,.upgrade-card p')){
     if(!el.getClientRects().length)continue;
     // Scrollable preparation/result content is intentionally outside its scrollport.
     if(el.closest('.meta-scroll')||panel.id==='resultScreen')continue;
     const r=el.getBoundingClientRect();
     if(r.left<-.5||r.top<-.5||r.right>w.innerWidth+.5||r.bottom>w.innerHeight+.5)problems.push(el.textContent.trim().slice(0,32)+' 超出视口');
     if(el.scrollHeight>el.clientHeight+2&&w.getComputedStyle(el).overflowY==='hidden')problems.push(el.textContent.trim().slice(0,32)+' 内容被裁切');
   }
 }
 const v=w.cameraView();
 if(s.mode==='combat')for(let i=0;i<s.trainLength;i++){const p=w.carPosition(i),x=(p.x-v.cx)*v.zoom+w.innerWidth*0,y=(p.y-v.cy)*v.zoom;if(Math.abs(x)>w.document.getElementById("gameCanvas").width/2-20||Math.abs(y)>w.document.getElementById("gameCanvas").height/2-20)problems.push('车厢 '+i+' 超出战场');}
 document.getElementById('layout').textContent=problems.length?[...new Set(problems)].join('\n'):'可见操作区未超出视口';
 document.getElementById('errors').textContent=errors.length?errors.join('\n'):'无';
},1000);
