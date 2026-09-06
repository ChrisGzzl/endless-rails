"use strict";

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
  track(0, "#161d1866", 77); track(0, "#33372c", 63); track(0, "#65604455", 51);
  const scroll = state.worldDistance % 26;
  for (let t = -length - scroll; t < length; t += 26) {
    const x = state.train.x + fx * t, y = state.train.y + fy * t;
    line(x - nx * 27 + 1, y - ny * 27 + 3, x + nx * 27 + 1, y + ny * 27 + 3, "#151e19", 7);
    line(x - nx * 26, y - ny * 26, x + nx * 26, y + ny * 26, "#796747", 5);
    line(x - nx * 24 - fx * 2, y - ny * 24 - fy * 2, x + nx * 24 - fx * 2, y + ny * 24 - fy * 2, "#ab8a58", 1);
  }
  for (const side of [-1, 1]) {
    track(side * 16 + 2, "#151d19", 8);
    track(side * 16, "#786c51", 5);
    track(side * 16 - 1, "#b9b293", 1.5);
  }
}
function drawTrain() {
  const angle = Math.atan2(motion.FORWARD.y, motion.FORWARD.x);
  for (let i = state.trainLength - 1; i >= 0; i--) {
    const p = carPosition(i), half = balance.CAR_LENGTH / 2, height = balance.CAR_HEIGHT / 2;
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
function droneSprite(x, y, scale, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = "#091b1644"; ctx.beginPath(); ctx.ellipse(4, 11, 19, 9, 0, 0, TAU); ctx.fill();
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    line(side * 3, front * 5, side * 15, front * 11, "#192f29", 5);
    line(side * 3, front * 5 - 1, side * 15, front * 11 - 1, "#b3be9f", 2);
    ctx.fillStyle = "#16332d"; ctx.beginPath(); ctx.ellipse(side * 16, front * 12, 7, 5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
    const spin=state.visualTime*35+side+front,rx=Math.cos(spin)*6,ry=Math.sin(spin)*4;
    line(side*16-rx,front*12-ry,side*16+rx,front*12+ry,"#e5f8ffbb",1.5);
    ctx.fillStyle = "#e1e5be"; ctx.fillRect(side * 16 - 1, front * 12 - 1, 2, 2);
  }
  shape([[-6, -12], [5, -12], [9, 4], [4, 12], [-5, 12], [-9, 4]], "#f3fcff", "#123b62", 2);
  ctx.fillStyle = "#187cad"; ctx.fillRect(-4, -7, 8, 11);
  ctx.fillStyle = color; ctx.fillRect(-3, -5, 6, 5);
  line(-3, 7, 3, 7, "#716f4e", 2);
  glow(0, -3, 17, "#99ead733"); ctx.restore();
}
function drawSpecialist(drone) {
  const kind=drone.id.startsWith("escort")?"gun":drone.id;
  const scale=.69+Math.min(3,drone.level-1)*.035;
  ctx.save();ctx.translate(drone.x,drone.y);ctx.rotate(drone.angle+Math.PI/2);
  droneSprite(0,0,scale,drone.color);
  ctx.scale(scale,scale);
  ctx.fillStyle=drone.color;
  if(kind==="missile") {
    for(const side of [-1,1]){
      ctx.fillStyle="#334450";ctx.fillRect(side*10-4,-14,8,23);
      shape([[side*10-3,-13],[side*10,-20],[side*10+3,-13]],drone.color);
      line(side*10,-10,side*10,5,"#effaff",2);
    }
  }else if(kind==="incendiary"){
    ctx.fillStyle="#674628";ctx.fillRect(-10,-5,20,14);
    ctx.fillStyle=drone.color;ctx.beginPath();ctx.arc(0,1,7,0,TAU);ctx.fill();
    line(-4,-12,4,-12,"#ff7948",4);
  }else if(kind==="ricochet"){
    glow(0,-5,20,"#ba75ff66");ctx.strokeStyle=drone.color;ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(0,-5,9,0,TAU);ctx.stroke();
  }else if(kind==="blades"){
    ctx.strokeStyle=drone.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,20,0,TAU);ctx.stroke();
    shape([[-22,-4],[-29,5],[-16,4]],"#effcff");shape([[22,4],[29,-5],[16,-4]],"#effcff");
  }else if(kind==="chain"){
    line(-8,0,-8,-22,drone.color,3);line(8,0,8,-22,drone.color,3);
    line(-8,-22,8,-22,"#e2eaff",1);
  }else{
    const barrels=kind==="scatter"?[-9,0,9]:[0];
    for(const x of barrels)line(x,-6,x,kind==="piercing"?-29:-21,drone.color,3);
  }
  // Hardware tier marks remain visible between attacks.
  for(let i=0;i<Math.min(3,drone.level);i++){ctx.fillStyle=drone.color;ctx.fillRect(-7+i*6,11,3,2);}
  if(drone.flash>0){glow(0,-24,17,drone.color+"88");shape([[-4,-23],[0,-34],[4,-23]],"#ffffff");}
  ctx.restore();
}
function drawDrone() {
  for(const specialist of state.swarm)drawSpecialist(specialist);
  const x=state.drone.x,y=state.drone.y;
  glow(x,y,46,"#37bfff35");
  ctx.strokeStyle="#63dfff";ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(x,y,34,0,TAU);ctx.stroke();
  for(const side of [-1,1]){
    line(x+side*39,y-9,x+side*44,y,"#ffffff",2.5);
    line(x+side*44,y,x+side*39,y+9,"#ffffff",2.5);
  }
  droneSprite(x,y,1.38,"#43d8ff");
  ctx.fillStyle="#f3fdff";ctx.font="bold 10px sans-serif";ctx.textAlign="center";
  ctx.fillText("主控",x,Math.min(H-7,y+47));
}
function drawShots() {
  for (const shot of state.shots) {
    if(shot.bounce){glow(shot.x,shot.y,19,"#ce84ff66");ctx.strokeStyle=shot.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(shot.x,shot.y,8,0,TAU);ctx.stroke();continue;}
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
      const t=1-z.flight/.65,x=z.sx+(z.x-z.sx)*t,y=z.sy+(z.y-z.sy)*t-Math.sin(t*Math.PI)*65;
      glow(x,y,12,"#ffba6277");ctx.fillStyle="#ffdfa1";ctx.fillRect(x-4,y-4,8,8);
      ctx.strokeStyle="#ffb85b66";ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(z.x,z.y,z.r,z.r*.8,0,0,TAU);ctx.stroke();
    }else{
      const fade=Math.min(1,z.life);
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
  for(const b of bladePositions()){
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.a+Math.PI/2);
    shape([[-6,-14],[7,-9],[4,13],[-7,7]],"#ecfaff","#57dfff",2);
    line(-10,-18,-14,2,"#72e4ff99",3);ctx.restore();
  }
  for(const f of state.weaponFx){
    ctx.globalAlpha=Math.min(1,f.life/f.maxLife);
    if(f.kind==="blast"){
      ctx.strokeStyle="#ffbf72";ctx.lineWidth=4;ctx.beginPath();ctx.arc(f.x,f.y,f.r*(1-f.life/f.maxLife),0,TAU);ctx.stroke();
    }else{
      line(f.x,f.y,f.tx,f.ty,f.kind==="stationBeam"?"#62dcff":"#c093ff",f.kind==="stationBeam"?6:3);
      line(f.x,f.y,f.tx,f.ty,"#f2fdff",1.5);
    }
    ctx.globalAlpha=1;
  }
}
