"use strict";
let settingsReturnFocus=null,settingsPreviousPause=false;
const settingsInert=[];
$("settingsScreen").hidden=true;
function renderSoundSettings(){
  const prefs=gameAudio?.getPreferences()||{music:false,sfx:false};
  for(const [id,key] of [["musicToggle","music"],["sfxToggle","sfx"],["homeMusicToggle","music"],["homeSfxToggle","sfx"]]){
    const button=$(id);button.setAttribute?.("aria-checked",String(prefs[key]));
    const value=button.querySelector?.(".switch-value");if(value)value.textContent=prefs[key]?"开启":"关闭";
    button.disabled=!gameAudio?.supported;
  }
  $("soundNote").textContent=gameAudio?.supported?"设置自动保存 · 切到后台时静音":"当前浏览器暂不支持音频，游戏可继续运行。";
  $("homeSoundNote").textContent=$("soundNote").textContent;
}
function openSettings(){
  if(settingsOpen)return;
  settingsReturnFocus=document.activeElement;settingsPreviousPause=state.paused;
  settingsOpen=true;state.paused=true;resetJoystick();gameAudio?.tick(state.mode,true);
  for(const id of ["app","startScreen","pauseScreen","stationScreen","levelUpScreen","eventScreen","contractScreen","resultScreen","gmPanel","displayHelp"]){
    const element=$(id);settingsInert.push([element,!!element.inert]);element.inert=true;
  }
  renderSoundSettings();$("settingsScreen").hidden=false;
  ($("musicToggle").disabled?$("closeSettingsButton"):$("musicToggle")).focus?.();
}
function closeSettings(){
  if(!settingsOpen)return;
  $("settingsScreen").hidden=true;settingsOpen=false;state.paused=settingsPreviousPause;
  for(const [element,inert] of settingsInert.splice(0))element.inert=inert;
  gameAudio?.tick(state.mode,state.paused);updateHud();settingsReturnFocus?.focus?.();
}
for(const id of ["pauseSettingsButton"])$(id).addEventListener("click",openSettings);
$("closeSettingsButton").addEventListener("click",closeSettings);
for(const [id,key] of [["musicToggle","music"],["sfxToggle","sfx"],["homeMusicToggle","music"],["homeSfxToggle","sfx"]])$(id).addEventListener("click",()=>{
  if(!gameAudio)return;
  const enabled=!gameAudio.getPreferences()[key];gameAudio.setPreference(key,enabled);renderSoundSettings();
  if(enabled)gameAudio.unlock().then(()=>{if(key==="sfx")gameAudio.play("ui");});
});
$("settingsScreen").addEventListener("keydown",event=>{
  event.stopPropagation?.();
  if(event.code==="Escape"){event.preventDefault();closeSettings();}
  if(event.code==="Tab"){
    const controls=[$("musicToggle"),$("sfxToggle"),$("closeSettingsButton")].filter(e=>!e.disabled);
    const index=controls.indexOf(document.activeElement),next=(index+(event.shiftKey?-1:1)+controls.length)%controls.length;
    event.preventDefault();controls[next].focus?.();
  }
});
for(const type of ["dragstart","selectstart","contextmenu"])$("settingsScreen").addEventListener(type,event=>event.preventDefault());
// Capture gestures before gameplay handlers; swipes do not generate repeated audio cues.
document.addEventListener?.("pointerdown",()=>gameAudio?.unlock(),{capture:true,passive:true});
document.addEventListener?.("keydown",event=>{if(!event.repeat)gameAudio?.unlock();},{capture:true});
document.addEventListener?.("click",event=>{
  const button=event.target.closest?.("button");
  if(button&&!button.disabled&&button.getAttribute("role")!=="switch"&&!button.classList.contains("upgrade-card")&&button.id!=="pulseButton")gameAudio?.play("ui");
},{capture:true});
document.addEventListener?.("visibilitychange",()=>gameAudio?.setHidden(!!document.hidden));
window.addEventListener("pagehide",()=>gameAudio?.setHidden(true));
window.addEventListener("pageshow",()=>gameAudio?.setHidden(!!document.hidden));
renderSoundSettings();

window.EndlessRailsSettings={refresh:renderSoundSettings};
