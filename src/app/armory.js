"use strict";
import { $ } from "./dom.js";
import { uiHooks } from "./hooks.js";
import { state, syncSwarm, togglePause, effects, applyResearchProfile } from "./game.js";
import { inspectFleet, inspectRows, tabNote } from "./telemetry.js";
const inspector = { id: "gun", tab: "weapon", page: 0 };
function renderPause(){
  syncSwarm();
  const fleet=inspectFleet(),unit=fleet.find(d=>d.id===inspector.id)||fleet[1];inspector.id=unit.id;
  $("inspectSelect").innerHTML=fleet.map(d=>`<option value="${d.id}">${effects.droneLabel(d.id)}${d.id.startsWith("escort")?" "+(Number(d.id.slice(6))+1):""}${d.id==="command"?"":" · Lv."+d.level}${d.owned?"":" · 未解锁"}</option>`).join("");
  $("inspectSelect").value=unit.id;
  $("pauseSummary").textContent=`第 ${state.station} 站 · Lv.${state.level} · ${state.swarm.length+1} 架 · 列车 ${Math.ceil(state.trainHp)}/${state.maxTrainHp}`;
  const portrait=$("inspectPortrait");portrait.dataset.kind=unit.id.startsWith("escort")?"gun":unit.id;
  portrait.dataset.breakthrough=String(unit.id!=="command"&&unit.level>=10);
  const p=applyResearchProfile(unit.id,effects.weaponProfile(unit.id,unit.level,state.coreStacks));
  $("inspectRole").textContent=inspector.tab==="global"?"列车 · 构筑 · 路线修正":p.role;
  const rows=inspectRows(unit,inspector.tab),requestedPage=inspector.page;
  for(const [id,tab] of [["inspectWeapon","weapon"],["inspectStatus","status"],["inspectUpgrade","upgrade"],["inspectGlobal","global"]]){
    $(id).classList.toggle("active",inspector.tab===tab);$(id).setAttribute?.("aria-pressed",String(inspector.tab===tab));
  }
  $("inspectNote").textContent=tabNote(inspector.tab,unit);
  $("resumeButton").textContent=["levelup","station"].includes(state.mode)?"返回选择界面":"继续护送";
  // The shell, note and action rails stay fixed. Fit whole rows inside the data bay.
  // Keep the requested page while trying sizes so later pages remain reachable.
  const viewport=$("inspectViewport"),stats=$("inspectStats");
  const layoutKey=[unit.id,inspector.tab,window.innerWidth,window.innerHeight,viewport.clientHeight].join(":");
  let pageSize=inspector.layoutKey===layoutKey?inspector.pageSize:window.innerHeight<450?6:window.innerHeight<700?9:12;
  const renderPage=(page=requestedPage)=>{
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));
    inspector.page=Math.min(page,pages-1);
    $("inspectStats").innerHTML=rows.slice(inspector.page*pageSize,inspector.page*pageSize+pageSize).map(([label,value])=>`<div class="inspect-stat"><dt>${label}</dt><dd>${value}</dd></div>`).join("");
    $("inspectPage").textContent=`${inspector.page+1} / ${pages}`;
    $("inspectPrevPage").disabled=inspector.page===0;$("inspectNextPage").disabled=inspector.page>=pages-1;
    $("inspectPageNav").hidden=false;
  };
  if(inspector.layoutKey!==layoutKey&&viewport.clientHeight){
    // Check every page, including long values near the end, before fixing the
    // page size. Next must never change page boundaries and repeat/skip rows.
    while(pageSize>3){
      let fits=true;
      for(let page=0;page<Math.ceil(rows.length/pageSize);page++){
        renderPage(page);
        if(stats.scrollHeight>viewport.clientHeight+1){fits=false;break;}
      }
      if(fits)break;
      pageSize-=3;
    }
  }
  renderPage();
  inspector.layoutKey=layoutKey;inspector.pageSize=pageSize;
}
uiHooks.renderPause = renderPause;
$("inspectSelect").addEventListener("change",e=>{inspector.id=e.target.value;inspector.page=0;renderPause();});
for(const [id,delta] of [["inspectPrev",-1],["inspectNext",1]])$(id).addEventListener("click",()=>{
  const fleet=inspectFleet(),index=fleet.findIndex(d=>d.id===inspector.id);inspector.id=fleet[(index+delta+fleet.length)%fleet.length].id;inspector.page=0;renderPause();
});
for(const [id,tab] of [["inspectWeapon","weapon"],["inspectStatus","status"],["inspectUpgrade","upgrade"],["inspectGlobal","global"]])$(id).addEventListener("click",()=>{inspector.tab=tab;inspector.page=0;renderPause();});
for(const [id,delta] of [["inspectPrevPage",-1],["inspectNextPage",1]])$(id).addEventListener("click",()=>{inspector.page=Math.max(0,inspector.page+delta);renderPause();});
$("resumeButton").addEventListener("click",()=>{if(state.paused)togglePause();});
for(const id of ["levelInspectButton","stationInspectButton"])$(id).addEventListener("click",togglePause);
window.addEventListener("resize",()=>{if(state.paused&&!$("pauseScreen").hidden)renderPause();});
// Keep keyboard navigation inside the modal; P / Escape are handled by the game.
$("pauseScreen").addEventListener("keydown",event=>{
  if(event.code!=="Tab")return;
  const controls=[...$("pauseScreen").querySelectorAll("button:not(:disabled), select")].filter(e=>!e.closest("[hidden]"));
  const first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
});
export { renderPause };
