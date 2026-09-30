'use strict';
const frameEl=document.getElementById('game');
let samples=[],costs=[],errors=[],stress=false,previous=0,updateCost=0;
const resetSamples=()=>{samples=[];costs=[];previous=0;updateCost=0;};
const gameWindow=()=>frameEl.contentWindow;
const readState=()=>gameWindow().EndlessRailsGame.getState();
function profile(grown=false){
 const w=gameWindow(),m=w.EndlessRailsLongterm.emptyMeta();
 if(grown){m.train.level=11;m.resources={scrap:500,components:20,data:100};m.loadout=['hangar','pointDefense','storage','radar','repair'];for(const id in m.research)m.research[id]=3;for(const id in m.regions)m.regions[id].unlocked=true;m.blueprints=['cargo-lock','radar-pulse'];}
 w.EndlessRailsLongterm.saveMeta(w.EndlessRailsLongterm.gameStorage(w),m);return m;
}
// The interface is painted on one canvas: overlays are host screen state, not elements.
function hideOverlays(w){
 const h=w.EndlessRailsCanvasHost;h.home.isOpen=false;h.dialogs.resetGM();
 Object.assign(h.run.screens,{contract:null,route:null,levelUp:null,station:null,result:null,pause:false});h.kit.invalidate();
}
function scenario(name){
 const w=gameWindow();if(!w.EndlessRailsGame)return;
 stress=false;resetSamples();
 hideOverlays(w);
 const m=profile(!['fresh','normal'].includes(name));
 if(name==='reference'){
   m.train={level:3,xp:51};m.resources={scrap:5116,components:56,data:26};
   m.selectedRegion='ruins';m.loadout=['hangar','storage','repair'];
   m.regions.wasteland.clears=1;m.regions.ruins.unlocked=true;m.regions.industrial.unlocked=false;m.regions.infection.unlocked=false;
   for(const id in m.research)m.research[id]=id==='rapid'?1:0;
   w.EndlessRailsLongterm.saveMeta(w.EndlessRailsLongterm.gameStorage(w),m);
   readState().mode='menu';readState().paused=false;w.EndlessRailsMetaUI.open();return;
 }
 if(name==='fresh'||name==='grown'){readState().mode='menu';readState().paused=false;w.EndlessRailsMetaUI.open();return;}
 if(['ruins','industrial','infection'].includes(name))m.selectedRegion=name;
 w.EndlessRailsGame.startRun(w.EndlessRailsLongterm.planFor(m));
 const s=readState();s.activeContract=w.EndlessRailsRouteEvents.CONTRACTS[2];w.EndlessRailsCanvasHost.run.screens.contract=null;
 w.beginRoute(w.EndlessRailsRouteEvents.ROUTE_EVENTS[2]);
 if(name==='normal'||['ruins','industrial','infection'].includes(name))return;
 if(name==='levelup'){s.pendingLevelUps=1;w.openLevelUp();w.updateHud();w.draw();return;}
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
 w.update=function(...args){const start=performance.now();if(stress){readState().trainHp=readState().maxTrainHp;readState().routeDistance=60;readState().pendingLevelUps=0;for(const e of readState().enemies){e.dead=false;e.x=e.qaX;e.y=e.qaY;}}const value=update(...args);updateCost+=performance.now()-start;return value;};
 w.draw=function(...args){const start=performance.now(),value=draw(...args);costs.push(updateCost+performance.now()-start);if(costs.length>600)costs.shift();updateCost=0;return value;};
 const tick=now=>{if(['combat','docking'].includes(readState().mode)&&!readState().paused){if(previous)samples.push(now-previous);if(samples.length>600)samples.shift();previous=now;}else previous=0;w.requestAnimationFrame(tick);};w.requestAnimationFrame(tick);
});
for(const button of document.querySelectorAll('[data-size]'))button.onclick=()=>{const [width,height]=button.dataset.size.split(',');frameEl.width=width;frameEl.height=height;resetSamples();};
for(const button of document.querySelectorAll('[data-case]'))button.onclick=()=>scenario(button.dataset.case);
document.getElementById('sample').onclick=resetSamples;
setInterval(()=>{
 const w=gameWindow();if(!w.EndlessRailsGame)return;
 const s=readState(),mean=a=>a.length?a.reduce((a,b)=>a+b,0)/a.length:0,p95=a=>a.length?[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*.95)]:0;
 document.getElementById('metrics').textContent=JSON.stringify({viewport:`${w.innerWidth}×${w.innerHeight}`,mode:s.mode,frames:samples.length,fps:+(1000/(mean(samples)||Infinity)).toFixed(1),frameP95ms:+p95(samples).toFixed(2),workMeanMs:+mean(costs).toFixed(2),workP95Ms:+p95(costs).toFixed(2),enemies:s.enemies.filter(e=>!e.dead).length,shots:s.shots.length,effects:s.weaponFx.length,particles:s.particles.length,zoom:+s.cameraZoom.toFixed(3)},null,2);
 const problems=[],h=w.EndlessRailsCanvasHost;h.render();
 // Controls and card copy of the open overlay layers must sit inside the viewport.
 // Scrollable preparation/result content is intentionally outside its scrollport.
 const scrolls=new Set(['metaScreen','homeResearch','homeShop','homeSettings','resultScreen','inspectViewport']);
 const inScroll=n=>{for(let p=n;p;p=p.parent)if(scrolls.has(p.key))return true;return false;};
 const label=n=>h.kit.textOf(n).trim().slice(0,32)||String(n.key);
 for(const b of h.boxes()){
   const n=b.node;if(!(n.onTap||/^(levelCard|stationCard|contractList|eventList)-\d+$/.test(String(n.key))))continue;
   if(!b.w||!b.h||n.cs?.visibility==='hidden'||inScroll(n))continue;
   if(b.x<-.5||b.y<-.5||b.x+b.w>w.innerWidth+.5||b.y+b.h>w.innerHeight+.5)problems.push(label(n)+' 超出视口');
   if(n.scrollH!=null&&n.scrollH>b.h+2&&n.cs?.overflowY==='hidden')problems.push(label(n)+' 内容被裁切');
 }
 const v=w.cameraView();
 if(s.mode==='combat')for(let i=0;i<s.trainLength;i++){const p=w.carPosition(i),x=(p.x-v.cx)*v.zoom+w.innerWidth*0,y=(p.y-v.cy)*v.zoom;if(Math.abs(x)>h.battlefield.width/2-20||Math.abs(y)>h.battlefield.height/2-20)problems.push('车厢 '+i+' 超出战场');}
 document.getElementById('layout').textContent=problems.length?[...new Set(problems)].join('\n'):'可见操作区未超出视口';
 document.getElementById('errors').textContent=errors.length?errors.join('\n'):'无';
},1000);
