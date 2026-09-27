"use strict";

import { ui, state, TAU } from "../app/game.js";

function showCombo(){if(state.combo<2||state.visualTime<(state.comboFxAt??-1))return;state.comboFxAt=state.visualTime+.15;ui.combo.textContent="连杀 ×"+state.combo;ui.combo.classList.remove("show");void ui.combo.offsetWidth;ui.combo.classList.add("show")}
function showToast(text){ui.toast.textContent=text;ui.toast.classList.remove("show");void ui.toast.offsetWidth;ui.toast.classList.add("show")}
function addText(text,x,y,color){if(state.texts.length>=24)return;state.texts.push({text,x,y,color,life:1})}function updateParticles(dt){for(const p of state.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.98;p.vy*=.98}state.particles=state.particles.filter(p=>p.life>0);for(const t of state.texts){t.life-=dt;t.y-=24*dt}state.texts=state.texts.filter(t=>t.life>0)}function burst(x,y,color,count,speed){const available=Math.min(count,420-state.particles.length);for(let i=0;i<available;i++){const a=Math.random()*TAU,v=speed*(.35+Math.random()*.65);state.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,size:2+Math.random()*4,life:.25+Math.random()*.45,color})}}

export { showCombo, showToast, addText, updateParticles, burst };
