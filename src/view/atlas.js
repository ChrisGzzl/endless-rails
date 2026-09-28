"use strict";


const gameArt={atlas:null,ground:null,regionGround:null,hover:null,vfx:null,combatVfx:null,bond:null,breakthrough:null,evolvedVfx:null};
if(typeof Image!=="undefined"){
  const assets=[
    {key:"hover",path:"assets/hover-drones-v2-mobile.webp",name:"无人机"},
    {key:"atlas",path:"assets/sci-fi-atlas-v1-mobile.webp",name:"列车与防御塔"},
    {key:"ground",path:"assets/desert-ground-v1.webp",name:"地面"},
    {key:"vfx",path:"assets/weapon-vfx-v1-mobile.webp",name:"武器特效"},
    {key:"combatVfx",path:"assets/missile-arc-vfx-v1-mobile.webp",name:"导弹与电弧特效"},{key:"bond",path:"assets/attacks-v3-mobile.webp",name:"北辰羁绊与突破攻击"},
    {key:"breakthrough",path:"assets/hover-lv10-v3-mobile.webp",name:"Lv.10突破无人机"},{key:"evolvedVfx",path:"assets/weapon-lv10-v3-mobile.webp",name:"Lv.10突破特效"},
    {key:"heroWasteland",path:"assets/hero-wasteland-v3.webp",name:"起始荒原主视觉"},{key:"heroRuins",path:"assets/hero-ruins-v3.webp",name:"废墟城市主视觉"},
    {key:"heroIndustrial",path:"assets/hero-industrial-v3.webp",name:"工业区主视觉"},{key:"heroInfection",path:"assets/hero-infection-v3.webp",name:"感染区主视觉"},
  ];
  const optionalKeys=new Set(["bond","breakthrough","evolvedVfx","heroWasteland","heroRuins","heroIndustrial","heroInfection"]);
  const standaloneArt=(typeof window!=="undefined"&&window.matchMedia?.("(display-mode: standalone)").matches)||
    (typeof navigator!=="undefined"&&navigator.standalone===true);
  const artObjectUrls=[];
  // Art status wiring is optional: DOM-free hosts (canvas-only boot, mini-game)
  // load the same assets without a start button or status line to update.
  const start=typeof document!=="undefined"?document.getElementById("startButton"):null,
    status=typeof document!=="undefined"?document.getElementById("artStatus"):null,
    retry=typeof document!=="undefined"?document.getElementById("retryArtButton"):null;
  function updateArtStatus(){
    if(!start||!status||!retry)return;
    const ready=assets.filter(asset=>gameArt[asset.key]).length;
    const failed=assets.filter(asset=>asset.failed);
    const required=assets.filter(asset=>!optionalKeys.has(asset.key));
    start.disabled=required.some(asset=>!gameArt[asset.key]);
    status.hidden=required.every(asset=>gameArt[asset.key])&&failed.length===0;
    status.textContent=failed.length?`${failed.map(asset=>asset.name).join("、")}素材加载失败，请重试。`:`正在加载美术素材 ${ready} / ${assets.length}…`;
    retry.hidden=failed.length===0;
  }
  function loadArt(asset,attempt=0){
    asset.failed=false;
    updateArtStatus();
    const picture=new Image();
    let settled=false;
    const timeout=setTimeout(()=>finish(false),15000);
    function finish(ok){
      if(settled)return;
      settled=true;clearTimeout(timeout);
      picture.onload=picture.onerror=null;
      if(ok){gameArt[asset.key]=picture;updateArtStatus();}
      else if(attempt<2)loadArt(asset,attempt+1);
      else{asset.failed=true;updateArtStatus();}
    }
    picture.onload=()=>finish(picture.naturalWidth>0);
    picture.onerror=()=>finish(false);
    const version="20260912-bonds-v3",nonce=standaloneArt?`&standalone=${Date.now()}-${attempt}`:attempt?`&retry=${Date.now()}-${attempt}`:"";
    const requestUrl=asset.path+`?v=${version}${nonce}`;
    if(standaloneArt&&typeof fetch==="function"&&typeof URL!=="undefined"&&URL.createObjectURL){
      fetch(requestUrl,{cache:"reload"}).then(response=>{
        if(!response.ok)throw new Error("HTTP "+response.status);
        return response.blob();
      }).then(blob=>{
        if(settled)return;
        const objectUrl=URL.createObjectURL(blob);artObjectUrls.push(objectUrl);picture.src=objectUrl;
      }).catch(()=>{if(!settled)picture.src=requestUrl+"&direct=1";});
    }else picture.src=requestUrl;
  }
  if(typeof window!=="undefined")window.addEventListener?.("pagehide",()=>{for(const url of artObjectUrls)URL.revokeObjectURL?.(url);});
  if(start&&status&&retry)retry.addEventListener("click",()=>{for(const asset of assets)if(asset.failed)loadArt(asset,1);});
  for(const asset of assets)loadArt(asset);
}
// Other regions fetch their ground only after selection; the original desert remains
// visible while a region tile decodes, and a failed tile never blocks combat.
const regionGroundPaths={ruins:"assets/ruins-ground-v1.webp",industrial:"assets/industrial-ground-v1.webp",infection:"assets/infection-ground-v1.webp"};
const heroArtKeys={wasteland:"heroWasteland",ruins:"heroRuins",industrial:"heroIndustrial",infection:"heroInfection"};
function heroArtFor(regionId){return gameArt[heroArtKeys[regionId]||"heroWasteland"]||null;}
const regionGroundCache={};
let activeGroundRegion="wasteland";
function setRegionGround(regionId){
  activeGroundRegion=regionId;
  gameArt.regionGround=regionGroundCache[regionId]||null;
  if(!regionGroundPaths[regionId]||regionGroundCache[regionId]||typeof Image==="undefined")return;
  const picture=new Image();
  picture.onload=()=>{regionGroundCache[regionId]=picture;if(activeGroundRegion===regionId)gameArt.regionGround=picture;};
  picture.onerror=()=>{};
  picture.src=regionGroundPaths[regionId];
}
const spriteCells={command:0,gun:1,missile:2,incendiary:3,blades:4,ricochet:5,chain:6,scatter:7,piercing:8};
// Bounds ignore transparent atlas padding, keeping units readable at gameplay scale.
const spriteFrames=[[15,18,299,295],[371,28,221,259],[658,36,253,252],[957,19,281,277],[21,336,292,266],[364,336,236,267],[665,321,239,288],[953,326,290,284],[73,630,188,292],[416,630,114,302],[725,628,118,305],[979,628,237,297],[89,983,148,195],[402,989,139,188],[656,951,246,242],[955,941,281,274]];
const hoverFrames=[[30,45,378,351],[430,96,394,267],[876,64,334,316],[52,470,330,287],[447,437,352,346],[855,447,377,341],[39,851,361,340],[423,876,408,274],[869,855,350,321]];
function paintSprite(index,x,y,width,height,angle=0,bank=0,stretch=false,breakthrough=false){
  const img=index<9?(breakthrough&&gameArt.breakthrough?gameArt.breakthrough:gameArt.hover):gameArt.atlas;if(!img)return false;
  const [sx,sy,sw,sh]=(index<9?hoverFrames:spriteFrames)[index];
  const scale=Math.min(width/sw,height/sh),dw=stretch?width:sw*scale,dh=stretch?height:sh*scale;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  ctx.transform(1,bank*.14,0,1-Math.abs(bank)*.24,0,0);
  // Preserve the source art while aligning the three mismatched sprite accents.
  if(index===2||index===3)ctx.filter="hue-rotate(-36deg) saturate(1.12)";
  if(index===7)ctx.filter="grayscale(1) sepia(1) saturate(6) hue-rotate(140deg) brightness(1.14)";
  ctx.drawImage(img,sx,sy,sw,sh,-dw/2,-dh/2,dw,dh);ctx.restore();return true;
}
// Each generated attack cell is packed with a 16px transparent gutter.
function paintAttack(index,x,y,width,height=width,opacity=1,angle=0){
  const img=gameArt.bond;if(!img)return false;
  const col=index%4,row=Math.floor(index/4),iw=img.naturalWidth,ih=img.naturalHeight;
  const sx=Math.round(col*iw/4),sy=Math.round(row*ih/4),sw=Math.round((col+1)*iw/4)-sx,sh=Math.round((row+1)*ih/4)-sy;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalCompositeOperation="lighter";ctx.globalAlpha=opacity;
  ctx.drawImage(img,sx,sy,sw,sh,-width/2,-height/2,width,height);ctx.restore();return true;
}
// Imagegen's 4 x 4 atlas has black padding; additive blending removes the black
// without discarding the soft light. Frames crossfade instead of visibly popping.
function paintWeaponVfx(row,phase,x,y,size,opacity=1,angle=0,loop=true,breakthrough=false){
  const img=breakthrough&&gameArt.evolvedVfx?gameArt.evolvedVfx:gameArt.vfx;if(!img)return false;
  const frame=loop?((phase%4)+4)%4:Math.max(0,Math.min(3,phase));
  const current=Math.floor(frame),mix=frame-current,next=loop?(current+1)%4:Math.min(3,current+1);
  const cellW=img.naturalWidth/4,cellH=img.naturalHeight/4;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalCompositeOperation="lighter";
  for(const [col,weight] of [[current,1-mix],[next,mix]]){
    if(weight<.01)continue;
    ctx.globalAlpha=opacity*weight;
    ctx.drawImage(img,col*cellW,row*cellH,cellW,cellH,-size/2,-size/2,size,size);
  }
  ctx.restore();return true;
}
function paintCombatVfx(row,phase,x,y,width,height=width,opacity=1,angle=0,loop=true){
  const img=gameArt.combatVfx;if(!img)return false;
  const frame=loop?((phase%4)+4)%4:Math.max(0,Math.min(3,phase));
  const current=Math.floor(frame),mix=frame-current,next=loop?(current+1)%4:Math.min(3,current+1);
  const cellW=img.naturalWidth/4,cellH=img.naturalHeight/4;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalCompositeOperation="lighter";
  for(const [col,weight] of [[current,1-mix],[next,mix]]){
    if(weight<.01)continue;ctx.globalAlpha=opacity*weight;
    ctx.drawImage(img,col*cellW,row*cellH,cellW,cellH,-width/2,-height/2,width,height);
  }
  ctx.restore();return true;
}
import { ctx } from "./surface.js";

export { gameArt, spriteCells, paintSprite, paintAttack, paintWeaponVfx, paintCombatVfx, setRegionGround, heroArtFor };
