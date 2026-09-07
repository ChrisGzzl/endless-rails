"use strict";
let installOffer=null,displayReturnFocus=null;
$("displayHelp").hidden=true;
function standaloneDisplay(){
  return !!(window.matchMedia?.("(display-mode: standalone)")?.matches||window.matchMedia?.("(display-mode: fullscreen)")?.matches||(typeof navigator!=="undefined"&&navigator.standalone));
}
function updateDisplay(){
  const full=!!(document.fullscreenElement||document.webkitFullscreenElement),standalone=standaloneDisplay();
  document.documentElement?.classList.toggle("immersive",full||standalone);
  for(const id of ["startFullscreenButton","gameFullscreenButton","pauseFullscreenButton"]){
    const button=$(id);button.textContent=id==="gameFullscreenButton"?"⛶":full?"退出全屏":standalone?"已独立运行":"全屏游玩";
    button.setAttribute?.("aria-label",full?"退出全屏":"进入全屏");
  }
  for(const id of ["startInstallButton","pauseInstallButton"])$(id).hidden=standalone;
  resizeBattlefield();if(state.paused&&typeof renderPause==="function")renderPause();
}
function showDisplayHelp(){
  displayReturnFocus=document.activeElement;
  if(!state.paused&&["combat","docking"].includes(state.mode))togglePause();
  const apple=typeof navigator!=="undefined"&&(/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1));
  $("displayHelpText").textContent=apple?"在 Safari 打开此页面 → 分享 → 添加到主屏幕；如果出现“作为 Web App 打开”，请保持开启。":"当前浏览器未提供全屏或安装入口。请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”；内置浏览器可先选择在系统浏览器打开。";
  $("displayHelp").hidden=false;$("closeDisplayHelp").focus?.();
}
async function toggleFullscreen(){
  try{
    if(document.fullscreenElement||document.webkitFullscreenElement){
      const exit=document.exitFullscreen||document.webkitExitFullscreen;await exit?.call(document);
    }else if(!standaloneDisplay()){
      const root=document.documentElement,request=root?.requestFullscreen||root?.webkitRequestFullscreen;
      if(!request){showDisplayHelp();return;}
      await request.call(root);
    }
    updateDisplay();
  }catch{showDisplayHelp();}
}
async function installGame(){
  if(!installOffer){showDisplayHelp();return;}
  const offer=installOffer;installOffer=null;
  try{await offer.prompt();await offer.userChoice;}catch{showDisplayHelp();}
}
for(const id of ["startFullscreenButton","gameFullscreenButton","pauseFullscreenButton"])$(id).addEventListener("click",toggleFullscreen);
for(const id of ["startInstallButton","pauseInstallButton"])$(id).addEventListener("click",installGame);
$("closeDisplayHelp").addEventListener("click",()=>{$("displayHelp").hidden=true;displayReturnFocus?.focus?.();});
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installOffer=event;});
window.addEventListener("appinstalled",()=>{installOffer=null;updateDisplay();});
window.addEventListener("resize",updateDisplay);
window.visualViewport?.addEventListener("resize",updateDisplay);
document.addEventListener?.("fullscreenchange",updateDisplay);
document.addEventListener?.("webkitfullscreenchange",updateDisplay);
for(const type of ["dragstart","selectstart","contextmenu"])$("displayHelp").addEventListener(type,event=>event.preventDefault());
updateDisplay();

$("displayHelp").addEventListener("keydown",event=>{
  if(event.code==="Escape"){event.preventDefault();event.stopPropagation?.();$("displayHelp").hidden=true;displayReturnFocus?.focus?.();}
  if(event.code==="Tab"){event.preventDefault();$("closeDisplayHelp").focus?.();}
});
