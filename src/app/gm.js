"use strict";

import { $ } from "./dom.js";
import { uiHooks } from "./hooks.js";
import { state, canvas, level, effects, syncSwarm, longterm, metaStorage } from "./game.js";
import { updateHud } from "../view/hud.js";
import { draw } from "../view/render.js";
import { resetJoystick } from "./input.js";

let gmPreviousPause=false,gmOpen=false;
// v0.10 (需求 §26.3): GM can set train level, research levels and resources
// for verification. Changes persist to the save; combat stats freeze at the
// next departure, matching the run-snapshot rule.
function setGMMeta(key,value){
  const next=longterm.normalizeMeta(state.metaProfile);
  if(key==="trainLevel"){
    const lv=Math.max(1,Math.min(longterm.MAX_TRAIN_LEVEL,Math.floor(Number(value)||1)));
    next.train.level=lv;next.train.xp=0;
  }else if(key==="resources"){
    const [scrap,components,data]=String(value).split(/[,\s]+/).map(n=>Math.max(0,Math.floor(Number(n)||0)));
    next.resources={scrap:scrap||0,components:components||0,data:data||0};
  }else if(longterm.RESEARCH_IDS.includes(key)){
    next.research[key]=Math.max(0,Math.min(longterm.MAX_RESEARCH_LEVEL,Math.floor(Number(value)||0)));
  }else return;
  state.metaProfile=longterm.normalizeMeta(next);
  longterm.saveMeta(metaStorage,state.metaProfile);
  window.EndlessRailsMetaUI?.refresh?.();
}
function setGMDroneLevel(id,value){
  const n=Math.max(0,Math.min(30,Math.floor(Number(value)||0)));
  if(id==="gun"||id==="rapid"){
    state.modules.rapid=Math.max(0,n-1);
    if(n===0)state.modules.gunDisabled=1;else delete state.modules.gunDisabled;
    id="gun";
  }else if(id==="wingman"){state.modules.wingman=Math.min(3,n);}
  else if(effects.DRONE_TYPES.some(d=>d.id===id))state.modules[id]=n;else return;
  // A GM edit applies to existing projectiles immediately rather than leaving old test attacks alive.
  state.shots=state.shots.filter(s=>s.owner!==id&&!s.bondId);
  state.zones=state.zones.filter(s=>s.owner!==id&&!s.bondId);
  state.weaponFx=[];state.weaponClocks[id]=0;state.weaponClocks.command=0;
  syncSwarm();updateHud();if(!$("pauseScreen").hidden)uiHooks.renderPause();
  draw();
}
function renderGM(){
  const wrap=$("gmControls");
  wrap.innerHTML=effects.DRONE_TYPES.map(d=>`<label>${effects.droneLabel(d.id)}<input aria-label="${d.name}等级" data-gm-id="${d.id}" type="number" min="0" max="30" value="${effects.droneLevel(state.modules,d.id)}"></label>`).join("")+
    `<label>雨燕僚机数量<input aria-label="僚机数量" data-gm-id="wingman" type="number" min="0" max="3" value="${level("wingman")}"></label>`+
    `<label>列车等级<input aria-label="GM 列车等级" data-gm-meta="trainLevel" type="number" min="1" max="30" value="${state.metaProfile.train.level}"></label>`+
    longterm.RESEARCH_IDS.map(id=>`<label>${longterm.RESEARCH_NAMES[id]}研究<input aria-label="GM ${longterm.RESEARCH_NAMES[id]}研究等级" data-gm-meta="${id}" type="number" min="0" max="30" value="${state.metaProfile.research[id]||0}"></label>`).join("")+
    `<label>资源 废料/组件/数据<input aria-label="GM 资源" data-gm-meta="resources" type="text" value="${Math.floor(state.metaProfile.resources.scrap)},${Math.floor(state.metaProfile.resources.components)},${Math.floor(state.metaProfile.resources.data)}"></label>`;
  wrap.querySelectorAll("input[data-gm-id]").forEach(input=>input.addEventListener("change",()=>{setGMDroneLevel(input.dataset.gmId,input.value);input.value=input.dataset.gmId==="wingman"?level("wingman"):effects.droneLevel(state.modules,input.dataset.gmId);renderGMBonds();}));
  wrap.querySelectorAll("input[data-gm-meta]").forEach(input=>input.addEventListener("change",()=>{setGMMeta(input.dataset.gmMeta,input.value);renderGM();}));
  renderGMBonds();
}
function renderGMBonds(){
  $("gmBonds").innerHTML=effects.bondStates(state.modules).map(b=>`<div><b>${b.name} · ${b.active?"Lv."+b.level:"未激活"}</b><small>${b.pair.map((id,i)=>effects.droneIdentity(id).name+" Lv."+b.levels[i]).join(" + ")}</small></div>`).join("");
}
function openGM(){gmOpen=true;gmPreviousPause=state.paused;state.paused=true;resetJoystick();$("gmPanel").hidden=false;renderGM();}
function closeGM(){if(!gmOpen)return;gmOpen=false;$("gmPanel").hidden=true;state.paused=gmPreviousPause;updateHud();canvas.focus?.();}
$("gmToggle")?.addEventListener("click",()=>{gmOpen?closeGM():openGM();});
$("gmClose")?.addEventListener("click",closeGM);
$("gmPanel").addEventListener("keydown",e=>{e.stopPropagation?.();if(e.code==="Escape"){e.preventDefault();closeGM();}});

export const gmGate = { get open() { return gmOpen; }, set open(value) { gmOpen = value; }, close: closeGM };
