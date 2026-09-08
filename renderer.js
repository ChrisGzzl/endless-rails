"use strict";

const gameArt={atlas:null,ground:null,hover:null,vfx:null,combatVfx:null,bond:null};
if(typeof Image!=="undefined"){
  const assets=[
    {key:"hover",path:"assets/hover-drones-v2.webp",name:"无人机"},
    {key:"atlas",path:"assets/sci-fi-atlas-v1.webp",name:"列车与防御塔"},
    {key:"ground",path:"assets/slate-ground-v1.webp",name:"地面"},
    {key:"vfx",path:"assets/weapon-vfx-v1.webp",name:"武器特效"},
    {key:"combatVfx",path:"assets/missile-arc-vfx-v1.webp",name:"导弹与电弧特效"},{key:"bond",path:"assets/bond-vfx-v1.png",name:"羁绊组合技"},
  ];
  const standaloneArt=(typeof window!=="undefined"&&window.matchMedia?.("(display-mode: standalone)").matches)||
    (typeof navigator!=="undefined"&&navigator.standalone===true);
  const artObjectUrls=[];
  const start=document.getElementById("startButton"),status=document.getElementById("artStatus"),retry=document.getElementById("retryArtButton");
  function updateArtStatus(){
    const ready=assets.filter(asset=>gameArt[asset.key]).length;
    const failed=assets.filter(asset=>asset.failed);
    const required=assets.filter(asset=>asset.key!=="bond");
    start.disabled=required.some(asset=>!gameArt[asset.key]);
    status.hidden=ready===assets.length;
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
    const version="20260908-standalone-art",nonce=standaloneArt?`&standalone=${Date.now()}-${attempt}`:attempt?`&retry=${Date.now()}-${attempt}`:"";
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
  retry.addEventListener("click",()=>{for(const asset of assets)if(asset.failed)loadArt(asset,1);});
  for(const asset of assets)loadArt(asset);
}
const spriteCells={command:0,gun:1,missile:2,incendiary:3,blades:4,ricochet:5,chain:6,scatter:7,piercing:8};
// Bounds ignore transparent atlas padding, keeping units readable at gameplay scale.
const spriteFrames=[[15,18,299,295],[371,28,221,259],[658,36,253,252],[957,19,281,277],[21,336,292,266],[364,336,236,267],[665,321,239,288],[953,326,290,284],[73,630,188,292],[416,630,114,302],[725,628,118,305],[979,628,237,297],[89,983,148,195],[402,989,139,188],[656,951,246,242],[955,941,281,274]];
const hoverFrames=[[30,45,378,351],[430,96,394,267],[876,64,334,316],[52,470,330,287],[447,437,352,346],[855,447,377,341],[39,851,361,340],[423,876,408,274],[869,855,350,321]];
function paintSprite(index,x,y,width,height,angle=0,bank=0,stretch=false){
  const img=index<9?gameArt.hover:gameArt.atlas;if(!img)return false;
  const [sx,sy,sw,sh]=(index<9?hoverFrames:spriteFrames)[index];
  const scale=Math.min(width/sw,height/sh),dw=stretch?width:sw*scale,dh=stretch?height:sh*scale;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  ctx.transform(1,bank*.14,0,1-Math.abs(bank)*.24,0,0);
  ctx.drawImage(img,sx,sy,sw,sh,-dw/2,-dh/2,dw,dh);ctx.restore();return true;
}
// Imagegen's 4 x 4 atlas has black padding; additive blending removes the black
// without discarding the soft light. Frames crossfade instead of visibly popping.
function paintWeaponVfx(row,phase,x,y,size,opacity=1,angle=0,loop=true){
  const img=gameArt.vfx;if(!img)return false;
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
// Rendering stays independent of combat rules and uses the game's logical 390 × 680 canvas.
const terrainPalettes = [
  { ground: "#454637", shade: "#292f28", stone: "#63604b", edge: "#888066", dust: "#bba178" },
  { ground: "#554436", shade: "#302e26", stone: "#745e45", edge: "#998265", dust: "#cfaa77" },
  { ground: "#384a49", shade: "#222f32", stone: "#506460", edge: "#7a8c78", dust: "#a6b9a0" },
  { ground: "#494739", shade: "#2b312b", stone: "#66664e", edge: "#8e9270", dust: "#c2c096" },
  { ground: "#53403b", shade: "#2c2828", stone: "#756052", edge: "#a18469", dust: "#c59476" },
];
const terrainPaint = new Map();
const terrainSeeds = Array.from({ length: 92 }, (_, i) => {
  const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  return { x: hash(i + 1), y: hash(i + 94), size: hash(i + 181), angle: hash(i + 273) * Math.PI * 2 };
});

function shape(points, fill, stroke, width = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function line(x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function glow(x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color); gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
function drawBackground() {
  if(gameArt.ground){
    const tile=360,drift=motion.worldDrift(1,state.worldDistance);
    const ox=((drift.x%tile)+tile)%tile-tile,oy=((drift.y%tile)+tile)%tile-tile;
    for(let x=ox;x<W;x+=tile)for(let y=oy;y<H;y+=tile)ctx.drawImage(gameArt.ground,x,y,tile+1,tile+1);
    ctx.fillStyle="#07132430";ctx.fillRect(0,0,W,H);
    if(state.routeModifiers.weather==="dust"){ctx.fillStyle="#c3a16915";ctx.fillRect(0,0,W,H);}
    return;
  }
  const index = Math.max(0, Math.min(4, state.station - 1));
  const palette = terrainPalettes[index];
  if (!terrainPaint.has(index)) {
    const paint = ctx.createLinearGradient(0, 0, W, H);
    paint.addColorStop(0, palette.ground); paint.addColorStop(1, palette.shade);
    terrainPaint.set(index, paint);
  }
  ctx.fillStyle = terrainPaint.get(index); ctx.fillRect(0, 0, W, H);
  const offset = state.worldDistance;
  const seedShift = (state.runSeed % 997) / 997;
  for (let i = 0; i < terrainSeeds.length; i++) {
    const seed = terrainSeeds[i];
    const speed = 1;
    const x = (((seed.x + seedShift) * (W + 140) - motion.FORWARD.x * offset * speed) % (W + 140) + W + 140) % (W + 140) - 70;
    const y = (((seed.y + seedShift * .7) * (H + 140) - motion.FORWARD.y * offset * speed) % (H + 140) + H + 140) % (H + 140) - 70;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(seed.angle);
    if (i < 12) {
      const r = 20 + seed.size * 33;
      shape([[-r, -r * .2], [-r * .4, -r * .65], [r * .5, -r * .5], [r, 0], [r * .2, r * .45], [-r * .8, r * .3]], "#18271e27");
      line(-r * .7, -4, r * .2, -r * .3, "#9c987115", 2);
    } else if (i < 37) {
      const r = 4 + seed.size * 12;
      shape([[-r + 3, 3], [-r * .6, -r * .7], [r * .4, -r * .8], [r + 5, 2], [r * .6 + 5, r * .5], [-r * .4, r * .7]], "#121b1866");
      shape([[-r, 0], [-r * .6, -r * .7], [r * .4, -r * .8], [r, -2], [r * .6, r * .4], [-r * .4, r * .5]], palette.stone);
      shape([[-r * .6, -r * .7], [r * .4, -r * .8], [r * .25, -1], [-r * .45, r * .1]], palette.edge);
    } else if (i < 48) {
      line(-7, 1, 7, -2, palette.stone, 2);
      line(-4, -5, 2, 3, palette.edge, 1);
      ctx.fillStyle = palette.shade; ctx.fillRect(-2, -2, 3, 3);
    } else {
      ctx.globalAlpha = .35; ctx.fillStyle = palette.dust;
      ctx.fillRect(0, 0, 1 + seed.size * 2, 1);
      ctx.fillRect(5, 4, 2, 1);
    }
    ctx.restore();
  }
  if (state.routeModifiers.weather === "dust") {
    ctx.fillStyle = "#daa45c12"; ctx.fillRect(0, 0, W, H);
  }
}
function drawRails() {
  const { x: fx, y: fy } = motion.FORWARD;
  const nx = -fy, ny = fx, length = balance.RAIL_HALF_LENGTH;
  const track = (offset, color, width) => line(state.train.x + nx * offset - fx * length, state.train.y + ny * offset - fy * length, state.train.x + nx * offset + fx * length, state.train.y + ny * offset + fy * length, color, width);
  track(0, "#161d1866", 77); track(0, "#1c293a", 63); track(0, "#65604455", 51);
  const scroll = state.worldDistance % 26;
  for (let t = -length - scroll; t < length; t += 26) {
    const x = state.train.x + fx * t, y = state.train.y + fy * t;
    line(x - nx * 27 + 1, y - ny * 27 + 3, x + nx * 27 + 1, y + ny * 27 + 3, "#151e19", 7);
    line(x - nx * 26, y - ny * 26, x + nx * 26, y + ny * 26, "#50627a", 5);
    line(x - nx * 24 - fx * 2, y - ny * 24 - fy * 2, x + nx * 24 - fx * 2, y + ny * 24 - fy * 2, "#8b9bab", 1);
  }
  for (const side of [-1, 1]) {
    track(side * 16 + 2, "#151d19", 8);
    track(side * 16, "#63798b", 5);
    track(side * 16 - 1, "#b2d3dd", 1.5);
  }
}
function drawTrain() {
  const angle = Math.atan2(motion.FORWARD.y, motion.FORWARD.x);
  for (let i = state.trainLength - 1; i >= 0; i--) {
    const p = carPosition(i), half = balance.CAR_LENGTH / 2, height = balance.CAR_HEIGHT / 2;
    if(gameArt.atlas){
      const next=carPosition(i+1);if(i<state.trainLength-1)line(p.x,p.y,next.x,next.y,"#8195a6",4);
      paintSprite(i===0?9:10,p.x,p.y,34,54,angle+Math.PI/2,0,true);continue;
    }
    ctx.save(); ctx.translate(p.x + 5, p.y + 8); ctx.rotate(angle);
    ctx.fillStyle = "#08141088"; ctx.fillRect(-half - 3, -height - 2, half * 2 + 7, height * 2 + 5); ctx.restore();
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle);
    if (i > 0) { ctx.fillStyle = "#b3a384"; ctx.fillRect(half, -3, balance.CAR_SPACING - balance.CAR_LENGTH + 3, 6); }
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#131d19"; ctx.fillRect(-half + 4, side * (height + 3) - 3, 12, 6); ctx.fillRect(half - 16, side * (height + 3) - 3, 12, 6);
      line(-half + 5, side * (height + 4), half - 6, side * (height + 4), "#6c7560", 1);
    }
    const body = i === 0 ? "#ffc44d" : i % 2 ? "#e89429" : "#ffbb48";
    shape([[-half, -height + 3], [-half + 4, -height], [half - 4, -height], [half, -height + 4], [half, height - 3], [half - 3, height], [-half, height]], body, "#151e18", 3);
    line(-half + 4, -height + 2, half - 5, -height + 2, "#ebbd79", 2);
    line(-half + 2, height - 2, half - 2, height - 2, "#573c29", 3);
    ctx.fillStyle = "#ce9b5b";
    for (const x of [-half + 5, half - 5]) for (const y of [-height + 5, height - 5]) ctx.fillRect(x - 1, y - 1, 2, 2);
    if (i === 0) {
      // Engine roof, cooling vents, cab glass and front plough.
      ctx.fillStyle = "#573e2e"; ctx.fillRect(-half + 6, -10, 19, 20);
      ctx.fillStyle = "#282e24"; ctx.fillRect(-half + 8, -8, 15, 16);
      for (let x = -half + 9; x < -2; x += 4) line(x, -7, x, 7, "#8c7750", 1);
      ctx.fillStyle = "#ddac66"; ctx.fillRect(3, -13, 11, 26);
      ctx.fillStyle = "#213e38"; ctx.fillRect(6, -11, 7, 9); ctx.fillRect(6, 2, 7, 9);
      line(7, -10, 11, -10, "#c0e0bf", 1); line(7, 3, 11, 3, "#c0e0bf", 1);
      shape([[half - 1, -height + 2], [half + 9, -height - 2], [half + 12, 0], [half + 9, height + 2], [half - 1, height - 2]], "#485042", "#151c17", 2);
      for (const y of [-10, 10]) {
        glow(half + 4, y, 13, "#f4c57644");
        ctx.fillStyle = "#ffe4a0"; ctx.fillRect(half + 1, y - 2, 4, 4);
      }
      const beam = ctx.createLinearGradient(half + 6, 0, half + 115, 0);
      beam.addColorStop(0, "#ffdb861b"); beam.addColorStop(1, "#ffdb8600");
      shape([[half + 6, -11], [half + 118, -42], [half + 118, 42], [half + 6, 11]], beam);
    } else {
      ctx.fillStyle = i % 2 ? "#986122" : "#ab7327"; ctx.fillRect(-half + 6, -height + 6, half * 2 - 12, height * 2 - 12);
      for (let x = -half + 9; x < half - 6; x += 7) {
        line(x, -height + 5, x, height - 5, "#1d2b2188", 2);
        line(x + 1, -height + 6, x + 1, height - 6, "#b7a46b77", 1);
      }
      ctx.fillStyle = "#d0b477"; ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = "#3a4937"; ctx.fillRect(-2, -2, 4, 4);
    }
    ctx.restore();
  }
}
function drawZombie(e, boss=false) {
  if(gameArt.atlas){
    const gait=state.visualTime*(7+(e.speed||60)*.045)+(e.hue||0)*TAU;
    const index=boss?15:e.elite?14:12+(Math.sin(gait)>0?0:1);
    const size=boss?e.r*2.8:e.elite?e.r*2.8:e.r*3.1;
    ctx.save();ctx.globalAlpha=e.hit>.4?.65:1;
    paintSprite(index,e.x,e.y,size,size,Math.atan2(state.train.y-e.y,state.train.x-e.x)-Math.PI/2+Math.sin(gait)*.055);
    ctx.restore();drawInfectionTraits(e,boss);return;
  }
  const phase=state.visualTime*(7+(e.speed||60)*.045)+(e.hue||0)*TAU;
  const stride=Math.sin(phase),sway=Math.sin(phase*.5)*.08,r=e.r;
  ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.atan2(state.train.y-e.y,state.train.x-e.x)+sway);
  const skin=e.hit>.4?"#ffffff":boss?"#d680b9":e.elite?"#d0ff52":"#91dc5b";
  ctx.fillStyle="#100d1b80";ctx.beginPath();ctx.ellipse(2,3,r*1.2,r*.8,0,0,TAU);ctx.fill();
  // Two articulated, alternating steps; hunched shoulders and loose reaching hands.
  for(const side of [-1,1]){
    const step=stride*side,hipY=side*r*.31,kneeX=-r*.68+step*r*.18;
    const footX=-r*1.22+step*r*.28,footY=side*r*.44;
    line(-r*.28,hipY,kneeX,side*r*.38,"#37253f",r*.37);
    line(kneeX,side*r*.38,footX,footY,"#251e31",r*.3);
    line(footX,footY,footX+r*.2,footY,"#b9b2b9",r*.26);
    const elbowX=r*.24-step*r*.12,handX=r*.84-step*r*.1,handY=side*r*.74;
    line(0,side*r*.45,elbowX,side*r*.8,skin,r*.32);
    line(elbowX,side*r*.8,handX,handY,skin,r*.24);
    line(handX,handY,handX+r*.2,handY-side*r*.08,"#c2f18d",r*.16);
  }
  shape([[-r*.6,-r*.42],[r*.15,-r*.58],[r*.45,0],[r*.12,r*.52],[-r*.58,r*.4],[-r*.4,0]],boss?"#67345c":"#714775","#1c1428",1.5);
  line(-r*.15,-r*.37,r*.1,r*.24,"#ac6d93",1);
  const bob=Math.abs(stride)*r*.06;
  ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(r*.55+bob,0,r*.37,r*.34,0,0,TAU);ctx.fill();
  ctx.strokeStyle="#213221";ctx.lineWidth=1.2;ctx.stroke();
  ctx.fillStyle="#ff426c";ctx.fillRect(r*.72,-r*.2,2,2);ctx.fillRect(r*.72,r*.08,2,2);
  line(r*.87,-r*.1,r*.87,r*.1,"#302130",1);
  if(e.elite||boss){
    ctx.fillStyle="#e3ff87";
    for(const [x,y] of [[-.35,-.32],[-.3,.25],[.12,.32]]){ctx.beginPath();ctx.arc(x*r,y*r,r*.14,0,TAU);ctx.fill();}
    line(-r*.45,-r*.5,0,-r*.65,"#fc4778",2);
  }
  ctx.restore();
}
function drawEnemies() {
  for(const e of state.enemies) {
    if(e.dead||e.delay>0)continue;
    drawZombie(e);
    if(e.elite||e.hp<e.maxHp){
      ctx.fillStyle="#25142e";ctx.fillRect(e.x-14,e.y+e.r+9,28,3);
      ctx.fillStyle=e.elite?"#ff628d":"#b6ff65";ctx.fillRect(e.x-14,e.y+e.r+9,28*Math.max(0,e.hp/e.maxHp),2);
    }
  }
}
function drawBoss() {
  if(!state.boss||state.boss.dead)return;
  drawZombie({...state.boss,hue:.5},true);
}
function droneSprite(x,y,scale,color) {
  // Compact lift-pod fallback remains readable before the sprite download finishes.
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  shape([[-12,-12],[12,-12],[16,0],[12,12],[-12,12],[-16,0]],"#dceeff","#173d5e",2);
  for(const px of [-16,16])for(const py of [-14,14]){
    ctx.fillStyle="#18324a";ctx.strokeStyle=color;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(px,py,8,0,TAU);ctx.fill();ctx.stroke();
    line(px-4,py,px+4,py,color,2);
  }
  glow(0,0,7,color);ctx.restore();
}
function drawFlight(drone,command=false){
  const kind=command?"command":drone.id.startsWith("escort")?"gun":drone.id;
  const color=command?"#68e6ff":drone.color,angle=(drone.flightAngle??-Math.PI/2)+Math.PI/2;
  const width=command?70:44+Math.min(3,drone.level-1)*2;
  const thrust=drone.thrust||0,bank=drone.bank||0;
  const phase=state.visualTime*3+(drone.slot??0)*2.399,bob=Math.sin(phase)*1.7;
  // Lift is directed toward the ground, so hovering never needs a forward jet trail.
  ctx.fillStyle="#030b1766";ctx.beginPath();ctx.ellipse(drone.x+4,drone.y+11,width*.34,width*.23,0,0,TAU);ctx.fill();
  glow(drone.x,drone.y+7,width*.48,color+"18");
  ctx.strokeStyle=color;ctx.lineWidth=1;
  const wash=(state.visualTime*1.4+(drone.slot??0)*.17)%1;
  ctx.globalAlpha=(1-wash)*.18;ctx.beginPath();ctx.ellipse(drone.x,drone.y+9,width*(.24+wash*.26),width*(.12+wash*.13),0,0,TAU);ctx.stroke();ctx.globalAlpha=1;
  // Short side RCS puffs oppose actual translation, independently of body heading.
  const speed=Math.hypot(drone.vx||0,drone.vy||0);
  if(speed>8){
    const dx=drone.vx/speed,dy=drone.vy/speed,reach=width*.37;
    ctx.globalAlpha=.25+thrust*.4;
    line(drone.x-dx*reach,drone.y-dy*reach+bob,drone.x-dx*(reach+4+thrust*5),drone.y-dy*(reach+4+thrust*5)+bob,color,3);ctx.globalAlpha=1;
  }
  // Eight eased headings with a small hover tilt; weapons keep independent aim.
  if(!paintSprite(spriteCells[kind],drone.x,drone.y+bob,width,width,angle,bank)){
    ctx.save();ctx.translate(drone.x,drone.y+bob);ctx.rotate(angle);droneSprite(0,0,command?1.25:.8,color);ctx.restore();
  }
  if(!command){
    for(let i=0;i<Math.min(3,drone.level);i++){ctx.fillStyle=color;ctx.fillRect(drone.x-5+i*4,drone.y+width*.47,2,2);}
    if(drone.level>=10){ctx.save();ctx.translate(drone.x,drone.y+bob);ctx.strokeStyle="#ffe06b";ctx.lineWidth=2;ctx.globalAlpha=.85;ctx.beginPath();ctx.arc(0,0,width*.58,0,TAU);ctx.stroke();for(let i=0;i<4;i++){const a=i*Math.PI/2+state.visualTime*.35;line(Math.cos(a)*width*.42,Math.sin(a)*width*.42,Math.cos(a)*width*.7,Math.sin(a)*width*.7,"#ffe06b",2);}ctx.restore();}
  }
}
function drawSpecialist(drone){drawFlight(drone);}
function drawDrone(){
  for(const specialist of state.swarm)drawSpecialist(specialist);
  const x=state.drone.x,y=state.drone.y;
  glow(x,y,42,"#31a7ff25");
  ctx.strokeStyle="#67dfff88";ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(x,y,37,0,TAU);ctx.stroke();
  drawFlight(state.drone,true);

  for(const side of [-1,1]){
    line(x+side*41,y-5,x+side*45,y,"#e1faff",2);
    line(x+side*45,y,x+side*41,y+5,"#e1faff",2);
  }
  ctx.fillStyle="#edfaff";ctx.font="bold 9px sans-serif";ctx.textAlign="center";ctx.fillText(effects.droneIdentity("command").name,x,Math.min(H-7,y+47));
}
function drawShots() {
  for (const shot of state.shots) {
    if(shot.bounce){
      const phase=state.visualTime*10+shot.life,angle=Math.atan2(shot.vy,shot.vx);
      if(gameArt.vfx){
        paintWeaponVfx(0,phase-1,shot.x-shot.vx*.065,shot.y-shot.vy*.065,22,.16,angle);
        paintWeaponVfx(0,phase-.5,shot.x-shot.vx*.03,shot.y-shot.vy*.03,28,.3,angle);
        paintWeaponVfx(0,phase,shot.x,shot.y,36,.9,angle);
      }else{glow(shot.x,shot.y,19,"#ce84ff66");ctx.strokeStyle=shot.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(shot.x,shot.y,8,0,TAU);ctx.stroke();}
      continue;
    }
    if(shot.missile&&gameArt.combatVfx){
      paintCombatVfx(0,state.visualTime*9,shot.x,shot.y,50,34,.9,Math.atan2(shot.vy,shot.vx));
      continue;
    }
    const trail = shot.missile ? .05 : .023;
    line(shot.x, shot.y, shot.x - shot.vx * trail, shot.y - shot.vy * trail, shot.color, shot.missile ? 4 : 2);
    ctx.fillStyle = "#f5efcf"; ctx.fillRect(shot.x - 1, shot.y - 1, 2, 2);
  }
}

function drawStation() {
  const c=stationCenter();
  if(c.y < -380 || c.x>W+380)return;
  ctx.save();ctx.translate(c.x,c.y);ctx.rotate(Math.atan2(motion.FORWARD.y,motion.FORWARD.x));
  for(const side of [-1,1]){
    ctx.fillStyle="#101f31";ctx.fillRect(-190,side>0?37:-111,300,74);
    ctx.strokeStyle="#69c2f0";ctx.lineWidth=2;ctx.strokeRect(-190,side>0?37:-111,300,74);
    ctx.fillStyle="#314960";ctx.fillRect(-177,side>0?48:-100,272,50);
    for(let x=-180;x<110;x+=18)line(x,side*40,x+9,side*40,"#ffd364",4);
    for(let x=-155;x<90;x+=42)line(x,side*54,x+22,side*54,"#8fe7ff66",2);
  }
  // Reinforced gate, illuminated landing corridor and supply crates.
  line(107,-112,107,112,"#9ad5e4",7);
  for(const side of [-1,1]){
    ctx.fillStyle="#142c48";ctx.fillRect(-175,side>0?65:-94,38,28);
    line(-168,side*80,-145,side*80,"#f5c558",3);
    glow(107,side*116,18,"#79efff66");
  }
  ctx.restore();
  const turrets=stationTurrets();
  for(const t of turrets){
    const target=state.enemies.find(e=>!e.dead),angle=target?Math.atan2(target.y-t.y,target.x-t.x):-.8;
    if(paintSprite(11,t.x,t.y,37,42,angle+Math.PI/2))continue;
    ctx.save();ctx.translate(t.x,t.y);ctx.rotate(angle);
    ctx.fillStyle="#122238";ctx.fillRect(-14,-14,28,28);
    ctx.strokeStyle="#94e5ff";ctx.lineWidth=2;ctx.strokeRect(-14,-14,28,28);
    ctx.fillStyle="#d7f4ff";ctx.fillRect(-7,-9,17,18);
    line(4,-4,24,-4,"#64deff",4);line(4,4,24,4,"#64deff",4);ctx.restore();
  }
  ctx.save();ctx.font="bold 12px sans-serif";ctx.textAlign="center";ctx.fillStyle="#e0f8ff";
  ctx.fillText("SAFE ZONE / "+String(state.station).padStart(2,"0"),c.x,c.y-130);
  ctx.restore();
}
function drawZones() {
  for(const z of state.zones){
    if(z.flight>0) {
      const t=1-z.flight/(z.flightDuration||.65),x=z.sx+(z.x-z.sx)*t,y=z.sy+(z.y-z.sy)*t-Math.sin(t*Math.PI)*65;
      if(!paintWeaponVfx(3,0,x,y,38,.95,state.visualTime*2,false)){
        glow(x,y,12,"#ffba6277");ctx.fillStyle="#ffdfa1";ctx.fillRect(x-4,y-4,8,8);
      }
      ctx.strokeStyle="#ffb85b66";ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(z.x,z.y,z.r,z.r*.8,0,0,TAU);ctx.stroke();
    }else{
      const fade=Math.min(1,z.life);
      if(gameArt.vfx){
        const age=(z.duration||3.8)-z.life;
        ctx.save();ctx.globalAlpha=fade*.24;ctx.fillStyle="#1a0c09";
        ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.fill();ctx.restore();
        paintWeaponVfx(2,state.visualTime*7+(z.phase||0),z.x,z.y,z.r*2.35,fade*.72);
        if(age<.55)paintWeaponVfx(3,age/.55*3,z.x,z.y,z.r*2.5,(1-age/.55)*.85,0,false);
        continue;
      }
      ctx.globalAlpha=fade;glow(z.x,z.y,z.r,"#ff70245c");
      ctx.fillStyle="#f8772635";ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.fill();
      ctx.strokeStyle="#ff9b48bb";ctx.lineWidth=2;ctx.stroke();
      for(let i=0;i<9;i++){
        const a=i*2.4,r=z.r*(.25+(i%3)*.24),x=z.x+Math.cos(a)*r,y=z.y+Math.sin(a)*r;
        const flicker=5+Math.sin(state.visualTime*15+i)*3;
        shape([[x-4,y+3],[x,y-flicker-7],[x+5,y+3]],"#ffd36a");
      }
      ctx.globalAlpha=1;
    }
  }
}
function drawWeaponEffects() {
  const cutter=state.swarm.find(d=>d.id==="blades");
  if(cutter){
    const r=bladeRadius(),phase=state.visualTime*6;
    ctx.fillStyle="#5cdeff09";ctx.strokeStyle="#8defff35";ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(cutter.x,cutter.y,r,0,TAU);ctx.fill();ctx.stroke();
    for(let i=0;i<3;i++){
      ctx.strokeStyle=cutter.flash>0?"#b7f6ff88":"#67dfff44";ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(cutter.x,cutter.y,r-8,phase+i*TAU/3,phase+i*TAU/3+1.1);ctx.stroke();
    }
  }
  for(const b of bladePositions()){
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.a+Math.PI/2);
    shape([[-3,-15],[4,-9],[7,3],[3,13],[-4,16],[-1,2],[-5,-7]],"#d4f4ff","#57dfff",1.5);
    line(-10,-18,-14,2,"#72e4ff99",3);ctx.restore();
  }
  for(const f of state.weaponFx){
    if(f.kind==="ricochetBurst"){
      const age=1-f.life/f.maxLife;
      paintWeaponVfx(1,age*3,f.x,f.y,f.r*2,(1-age)*.8,0,false);
      continue;
    }
    ctx.globalAlpha=Math.min(1,f.life/f.maxLife);
    if(f.kind==="bond"&&gameArt.bond){const age=1-f.life/f.maxLife,row={"紫色共振":0,"红色灼杀号":1,"蓝色穿透":2,"青色近卫":3}[f.bond]??0,fw=gameArt.bond.width/6,fh=gameArt.bond.height/4;ctx.save();ctx.globalCompositeOperation="lighter";ctx.drawImage(gameArt.bond,Math.min(5,Math.floor(age*6))*fw,row*fh,fw,fh,f.x-110,f.y-70,220,140);ctx.restore();continue;}
    if(f.kind==="ultimate"){
      const age=1-f.life/f.maxLife, radius=22+age*70;
      ctx.save();
      ctx.globalCompositeOperation="lighter";
      ctx.strokeStyle=f.color||"#ffe06b"; ctx.lineWidth=5*(1-age); ctx.shadowBlur=18; ctx.shadowColor=f.color||"#ffe06b";
      ctx.beginPath(); ctx.arc(f.x,f.y,radius,0,TAU); ctx.stroke();
      ctx.strokeStyle="#ffffff"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y,radius*.58,-Math.PI*.7,Math.PI*.7); ctx.stroke();
      ctx.fillStyle="#fff7c2"; ctx.beginPath(); ctx.arc(f.x,f.y,8+10*(1-age),0,TAU); ctx.fill();
      for(let i=0;i<8;i++){const a=i*TAU/8+age*2; line(f.x+Math.cos(a)*12,f.y+Math.sin(a)*12,f.x+Math.cos(a)*(radius+12),f.y+Math.sin(a)*(radius+12),f.color||"#ffe06b",3*(1-age));}
      ctx.restore();
    }else if(f.kind==="blast"){
      const age=1-f.life/f.maxLife;
      if(!paintCombatVfx(1,age*3,f.x,f.y,f.r*2.25,f.r*2.25,(1-age)*.95,0,false)){
        ctx.strokeStyle="#ffbf72";ctx.lineWidth=4;ctx.beginPath();ctx.arc(f.x,f.y,f.r*age,0,TAU);ctx.stroke();
      }
    }else if(f.kind==="arc"){
      const dx=f.tx-f.x,dy=f.ty-f.y,length=Math.hypot(dx,dy),age=1-f.life/f.maxLife;
      if(gameArt.combatVfx){
        paintCombatVfx(2,state.visualTime*18+(f.seed||0),(f.x+f.tx)/2,(f.y+f.ty)/2,length+18,34,Math.min(1,f.life/.08),Math.atan2(dy,dx));
        paintCombatVfx(3,age*3,f.tx,f.ty,42,42,(1-age)*.9,0,false);
      }else{line(f.x,f.y,f.tx,f.ty,"#c093ff",3);line(f.x,f.y,f.tx,f.ty,"#f2fdff",1.5);}
    }else{
      line(f.x,f.y,f.tx,f.ty,f.kind==="stationBeam"?"#62dcff":"#c093ff",f.kind==="stationBeam"?6:3);
      line(f.x,f.y,f.tx,f.ty,"#f2fdff",1.5);
    }
    ctx.globalAlpha=1;
  }
}

function drawInfectionTraits(e,boss){
  if(boss||!e.kind||e.kind==="walker")return;
  const color=balance.ENEMY_TYPES[e.kind]?.color||"#b0dd70",r=e.r;
  ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.atan2(state.train.y-e.y,state.train.x-e.x));
  if(e.kind==="runner"){
    line(-r*1.6,-r*.4,-r*.9,-r*.4,color,2);line(-r*1.9,r*.35,-r,r*.35,color,2);
    shape([[-2,-5],[5,0],[-2,5]],"#bd6735");
  }else if(e.kind==="crawler"){
    for(const side of [-1,1]){const step=Math.sin(state.visualTime*12+e.hue*TAU)*2;line(-r*.6,side*r*.5,-r+step,side*r*1.3,color,2);}
    ctx.fillStyle="#4b896c";ctx.beginPath();ctx.ellipse(-2,0,r*.75,r*.48,0,0,TAU);ctx.fill();
  }else if(e.kind==="spitter"||e.kind==="bloater"){
    const pulse=1+Math.sin(state.visualTime*4+e.hue)*.1;
    for(const side of [-1,1]){ctx.fillStyle=color;ctx.beginPath();ctx.arc(-r*.4,side*r*.6,r*.37*pulse,0,TAU);ctx.fill();}
    if(e.kind==="spitter"&&e.spitFlash>0)glow(r*.8,0,13,"#d4ed6388");
    if(e.kind==="bloater"){ctx.strokeStyle=color+"88";ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r*1.4,0,TAU);ctx.stroke();}
  }else if(e.kind==="brute")shape([[-r,-r*.7],[r*.2,-r*.65],[r*.3,r*.65],[-r,r*.7]],"#65783b","#c6d868",1);
  ctx.restore();
}
function drawHostileShots(){
  for(const s of state.hostileShots){line(s.x,s.y,s.x-s.vx*.06,s.y-s.vy*.06,"#9cb82d",3);ctx.fillStyle="#e8ff74";ctx.beginPath();ctx.arc(s.x,s.y,4,0,TAU);ctx.fill();}
}
