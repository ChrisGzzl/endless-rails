"use strict";

import { state, level, effects, longterm, gameAudio, syncSwarm, carEnabled } from "../app/engine.js";
import { TAU } from "../view/surface.js";
import { cameraView, carPosition } from "./world.js";
import { burst } from "./fx.js";
import { nearestTarget, damageTarget, areaHit, normalStatsFor, bondStatsFor, combatTargets, ricochetBurst, isEliteTarget } from "./combat.js";

function bladeRadius(n=level("blades")){return effects.weaponProfile("blades",n).range;}
function bladePositions() {
  const origin=state.swarm.find(d=>d.id==="blades");if(!origin)return [];
  const count=Math.min(6,level("blades")+2);
  return Array.from({length:count},(_,i)=>{
    const a=state.visualTime*6+i*TAU/count;
    return {x:origin.x+Math.cos(a)*(bladeRadius()-9),y:origin.y+Math.sin(a)*(bladeRadius()-9),a};
  });
}
// Bonds belong exclusively to Beichen. A volley snapshots each active skill level.
// 火控算法 covers bond volleys too, multiplied exactly once here (需求 §17.1).
function fireCommandVolley(target,p,bonds){
  const origin=state.drone,angle=Math.atan2(target.y-origin.y,target.x-origin.x);
  origin.angle=angle;
  const damageMul=state.runStats?.droneDamageMul??1;
  const blue=bonds.find(b=>b.id==="blue");
  if(!blue){gameAudio?.play("shot");fireProfile(origin,p,"#8ff6ff");normalStatsFor("command").volleys++;}
  for(const bond of bonds){
    const source={owner:"command",bondId:bond.id,bondLevel:bond.level};
    bondStatsFor(bond.id,bond.level).casts++;
    if(bond.id==="red"){
      state.shots.push({...source,x:origin.x,y:origin.y,vx:Math.cos(angle)*bond.speed,vy:Math.sin(angle)*bond.speed,
        missile:true,target,life:bond.life,damage:bond.damage*damageMul,radius:bond.radius,seekRange:bond.range,turnRate:bond.turnRate,
        burnDamage:bond.burnDamage*damageMul,burnDuration:bond.duration,burnTick:bond.tick,color:"#ff6445"});
    }else if(bond.id==="purple"){
      state.shots.push({...source,x:origin.x,y:origin.y,vx:Math.cos(angle)*bond.speed,vy:Math.sin(angle)*bond.speed,
        bounce:true,life:bond.life,bounces:bond.bounces,damage:bond.damage*damageMul,hitRadius:bond.hitRadius,
        arcRadius:bond.arcRadius,arcDamage:bond.arcDamage*damageMul,arcInterval:bond.arcInterval,arcClock:0,color:"#be81ff"});
    }else{
      const end={x:origin.x+Math.cos(angle)*bond.range,y:origin.y+Math.sin(angle)*bond.range};
      for(const enemy of combatTargets()){
        const forward=(enemy.x-origin.x)*Math.cos(angle)+(enemy.y-origin.y)*Math.sin(angle);
        if(forward<0||forward>bond.range+(enemy.r||0))continue;
        const lateral=Math.abs((enemy.x-origin.x)*Math.sin(angle)-(enemy.y-origin.y)*Math.cos(angle));
        if(lateral<=(enemy.r||0)+bond.width/2)damageTarget(enemy,bond.damage*damageMul,source);
      }
      gameAudio?.play("laser");
      state.weaponFx.push({kind:"bondLaser",...source,x:origin.x,y:origin.y,tx:end.x,ty:end.y,width:bond.width,life:.36,maxLife:.36});
    }
  }
}
function purpleDischarge(shot,dt){
  if(shot.bondId!=="purple")return;
  shot.arcClock=(shot.arcClock||0)-dt;if(shot.arcClock>0)return;
  shot.arcClock=shot.arcInterval;
  for(const enemy of combatTargets()){
    if(Math.hypot(enemy.x-shot.x,enemy.y-shot.y)>shot.arcRadius+(enemy.r||0))continue;
    damageTarget(enemy,shot.arcDamage,shot);
    if(state.weaponFx.filter(f=>f.bondId==="purple").length<48)
      state.weaponFx.push({kind:"arc",bondId:"purple",x:shot.x,y:shot.y,tx:enemy.x,ty:enemy.y,life:.16,maxLife:.16});
  }
}
function updateArsenal(dt) {
  syncSwarm();
  state.weaponClocks.command=(state.weaponClocks.command||0)-dt;
  const commandProfile=applyResearchProfile("command",effects.weaponProfile("command",1,state.coreStacks)),bonds=effects.activeBonds(state.modules);
  const target=nearestTarget(state.drone,bonds.find(b=>b.id==="blue")?.range||commandProfile.range);
  if(state.weaponClocks.command<=0&&target){
    fireCommandVolley(target,commandProfile,bonds);
    state.weaponClocks.command=commandProfile.interval;state.drone.flash=.14;
  }
  for(const drone of state.swarm) {
    const id=drone.id;
    state.weaponClocks[id]=(state.weaponClocks[id]||0)-dt;
    if(state.weaponClocks[id]>0)continue;
    const p=applyResearchProfile(id,effects.weaponProfile(id,drone.level,state.coreStacks));
    const target=nearestTarget(drone,p.range);if(!target)continue;
    if(id==="gun"||id.startsWith("escort")||id==="scatter"||id==="piercing"){
      if(id==="piercing"){const lined=alignedTargetCount(drone,target,p.range,22);p.damage*=1+Math.min(.32,Math.max(0,lined-1)*.06);}
      fireProfile(drone,p,drone.color);
    }else if(id==="missile"){
      fireMissile(drone,p);
    }else if(id==="chain"){
      const density=combatTargets().filter(e=>Math.hypot(e.x-target.x,e.y-target.y)<=p.chainRange).length;
      p.damage*=1+Math.min(.30,Math.max(0,density-1)*.05);
      const chained=[target];
      for(let j=1;j<p.targets;j++){
        const previous=chained[chained.length-1];
        const next=combatTargets().filter(e=>!chained.includes(e)&&Math.hypot(e.x-previous.x,e.y-previous.y)<=p.chainRange)
          .sort((a,b)=>Math.hypot(a.x-previous.x,a.y-previous.y)-Math.hypot(b.x-previous.x,b.y-previous.y))[0];
        if(!next)break;chained.push(next);
      }
      let previous=drone;
      for(const e of chained){state.weaponFx.push({kind:"arc",x:previous.x,y:previous.y,tx:e.x,ty:e.y,life:.2,maxLife:.2,breakthrough:!!p.breakthrough,seed:Math.random()*4});
        damageTarget(e,p.damage,id);previous=e;}
    }else if(id==="blades"){
      for(const e of combatTargets())if(Math.hypot(e.x-drone.x,e.y-drone.y)<=p.range+e.r)damageTarget(e,p.damage,id);
    }else if(id==="incendiary"){
      const moving=Math.hypot(state.moveInput.x||0,state.moveInput.y||0)>.2,lead=moving?30:0;
      const zoneX=target.x+(state.moveInput.x||0)*lead,zoneY=target.y+(state.moveInput.y||0)*lead;
      state.zones.push({x:zoneX,y:zoneY,sx:drone.x,sy:drone.y,flight:p.flight,flightDuration:p.flight,life:p.duration,duration:p.duration,phase:state.visualTime*1.7,
        r:p.radius,damage:p.damage,tick:0,tickInterval:p.tick,owner:id,breakthrough:!!p.breakthrough});
    }else if(id==="ricochet"){
      const angle=Math.atan2(target.y-drone.y,target.x-drone.x);
      state.shots.push({x:drone.x,y:drone.y,vx:Math.cos(angle)*p.speed,vy:Math.sin(angle)*p.speed,life:p.life,
        damage:p.damage,bounce:true,bounces:p.bounces,color:drone.color,owner:id,breakthrough:!!p.breakthrough});
    }
    state.weaponClocks[id]=p.interval;
    (state.weaponStats[id]||={damage:0,kills:0,volleys:0}).volleys++;
    drone.flash=.15;
  }
  for(const z of state.zones){
    if(z.flight>0){z.flight-=dt;continue;}
    z.life-=dt;z.tick-=dt;
    if(z.tick<=0){areaHit(z,z.r,z.damage);z.tick=z.tickInterval||.4;}
  }
  const view=cameraView();
  state.zones=state.zones.filter(z=>z.life>0&&z.x>view.left-z.r&&z.x<view.right+z.r&&z.y>view.top-z.r&&z.y<view.bottom+z.r);
  for(const fx of state.weaponFx)fx.life-=dt;
  state.weaponFx=state.weaponFx.filter(f=>f.life>0);
}
function updateShots(dt) {
  const targets=combatTargets(),view=cameraView();
  for(let i=state.shots.length-1;i>=0;i--){
    const s=state.shots[i];
    if(s.missile){
      if(!s.target||s.target.dead)s.target=nearestTarget(s,s.seekRange??340);
      if(s.target){
        const desired=Math.atan2(s.target.y-s.y,s.target.x-s.x), current=Math.atan2(s.vy,s.vx);
        const delta=Math.atan2(Math.sin(desired-current),Math.cos(desired-current));
        const a=current+Math.max(-(s.turnRate||3)*dt,Math.min((s.turnRate||3)*dt,delta));
        s.vx=Math.cos(a)*220;s.vy=Math.sin(a)*220;
      }
    }
    const oldX=s.x,oldY=s.y;
    const speed=Math.hypot(s.vx,s.vy),step=Math.min(dt,Math.max(0,s.life),s.remainingRange===undefined?dt:Math.max(0,s.remainingRange)/Math.max(1,speed));
    s.x+=s.vx*step;s.y+=s.vy*step;s.life-=dt;
    if(s.remainingRange!==undefined)s.remainingRange-=speed*step;
    if(s.bounce){
      const reflected=s.x<view.left+10||s.x>view.right-10||s.y<view.top+10||s.y>view.bottom-10;
      if(s.x<view.left+10||s.x>view.right-10){s.vx*=-1;s.x=Math.max(view.left+10,Math.min(view.right-10,s.x));s.hitIds=[];if(s.bounces!==undefined)s.bounces--;}
      if(s.y<view.top+10||s.y>view.bottom-10){s.vy*=-1;s.y=Math.max(view.top+10,Math.min(view.bottom-10,s.y));s.hitIds=[];if(s.bounces!==undefined)s.bounces--;}
      if(reflected)ricochetBurst(s.x,s.y,34,s);
    }
    let consumed=s.bounces!==undefined&&s.bounces<0;
    if(!consumed)purpleDischarge(s,step);
    for(const e of targets){
      if(consumed)break;
      if(e.dead||s.hitIds?.includes(e))continue;
      const dx=s.x-oldX,dy=s.y-oldY,lengthSquared=dx*dx+dy*dy;
      const fraction=lengthSquared?Math.max(0,Math.min(1,((e.x-oldX)*dx+(e.y-oldY)*dy)/lengthSquared)):0;
      if(Math.hypot(e.x-(oldX+dx*fraction),e.y-(oldY+dy*fraction))>=e.r+(s.hitRadius||(s.bounce?10:6)))continue;
      s.hitIds||=[];s.hitIds.push(e);
      if(s.missile){
        areaHit(s,s.radius??68,s.damage);
        state.weaponFx.push({kind:"blast",x:s.x,y:s.y,r:s.radius??68,life:.4,maxLife:.4,bondId:s.bondId,breakthrough:s.breakthrough});
        if(s.cluster&&!s.bondId){
          for(let c=0;c<3;c++){const a=c*TAU/3+state.visualTime,x=s.x+Math.cos(a)*(s.radius||68)*.46,y=s.y+Math.sin(a)*(s.radius||68)*.46;
            const source={x,y,owner:s.owner};areaHit(source,(s.radius||68)*.42,s.damage*.34,source);
            state.weaponFx.push({kind:"blast",x,y,r:(s.radius||68)*.42,life:.28,maxLife:.28,breakthrough:true});
          }
        }
        if(s.bondId==="red")state.zones.push({owner:s.owner,bondId:s.bondId,bondLevel:s.bondLevel,x:s.x,y:s.y,
          r:s.radius,damage:s.burnDamage,flight:0,life:s.burnDuration,duration:s.burnDuration,tick:0,tickInterval:s.burnTick});
        burst(s.x,s.y,"#ff9658",18,110); consumed=true;break;
      }
      damageTarget(e,s.damage,s);burst(s.x,s.y,"#e7f5ff",3,35);
      if(s.bounce&&state.visualTime>=(s.nextImpactFx||0)){ricochetBurst(e.x,e.y,23,s);s.nextImpactFx=state.visualTime+.12;}
      if(s.coreArc)state.coreHitCounter++;
      if(s.chain||(s.coreArc&&state.coreHitCounter%4===0)){
        const arc=combatTargets().find(x=>x!==e&&Math.hypot(x.x-e.x,x.y-e.y)<110);
        if(arc){damageTarget(arc,s.damage*.65,s);state.weaponFx.push({kind:"arc",x:e.x,y:e.y,tx:arc.x,ty:arc.y,life:.18,maxLife:.18,breakthrough:s.breakthrough});}
      }
      if(s.railgun||s.bounce)continue;
      if(s.pierce>0){s.pierce--;continue;}
      consumed=true;break;
    }
    if(consumed||s.life<=0||s.remainingRange<=0)state.shots.splice(i,1);
  }
}
function weaponDrone(id) {
  syncSwarm();
  return state.swarm.find(d=>d.id===id);
}
function fireDrone(origin=weaponDrone("gun")) {
  if(!origin)return;
  const profile=applyResearchProfile(origin.id,effects.weaponProfile(origin.id,origin.level,state.coreStacks));
  fireProfile(origin,profile,origin.color);origin.flash=.12;
}
function fireMissile(origin=weaponDrone("missile"),profile=null) {
  if(!origin)return;
  const p=profile||applyResearchProfile(origin.id,effects.weaponProfile(origin.id,origin.level,state.coreStacks)),target=nearestTarget(origin,p.range);if(!target)return;
  const a=Math.atan2(target.y-origin.y,target.x-origin.x);
  state.shots.push({x:origin.x,y:origin.y,vx:Math.cos(a)*p.speed,vy:Math.sin(a)*p.speed,
    life:p.life,damage:p.damage,radius:p.radius,seekRange:p.range,turnRate:p.turnRate,
    missile:true,target,color:origin.color,owner:origin.id,breakthrough:!!p.breakthrough,breakthroughPath:state.breakthroughs?.missile,cluster:!!p.cluster});origin.flash=.22;
}
function fireRailgun(profile){const t=state.enemies.find(e=>!e.dead&&e.delay<=0)||state.boss;if(!t)return;const a=Math.atan2(t.y-(state.train.y-28),t.x-state.train.x);state.trainDamage=(state.trainDamage||0)+profile.railgunDamage;state.shots.push({x:state.train.x,y:state.train.y-28,vx:Math.cos(a)*500,vy:Math.sin(a)*500,life:1.2,damage:profile.railgunDamage,railgun:true,color:"#ffb45f"});burst(state.train.x,state.train.y-28,"#ffb45f",7,50)}
function fireProfile(origin,profile,color){
  const target=nearestTarget(origin,profile.range??Infinity);if(!target||!profile.projectileCount)return;
  const angle=Math.atan2(target.y-origin.y,target.x-origin.x),speed=profile.speed||410;origin.angle=angle;
  for(let i=0;i<profile.projectileCount;i++){
    const spread=(i-(profile.projectileCount-1)/2)*(profile.spread??.12);
    state.shots.push({x:origin.x,y:origin.y,vx:Math.cos(angle+spread)*speed,vy:Math.sin(angle+spread)*speed,
      life:profile.life||1,remainingRange:profile.range,damage:profile.damage,pierce:profile.pierce,
      chain:profile.chain,coreArc:!!profile.coreArc,color,breakthrough:!!profile.breakthrough,owner:origin.id||"train"});
  }
}
function alignedTargetCount(origin,target,range=330,width=26){
  const dx=target.x-origin.x,dy=target.y-origin.y,length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
  let count=0;
  for(const enemy of combatTargets()){
    const ex=enemy.x-origin.x,ey=enemy.y-origin.y,along=ex*ux+ey*uy,perp=Math.abs(ex*uy-ey*ux);
    if(along>0&&along<=range&&perp<=width+(enemy.r||0))count++;
  }
  return count;
}
// 列车近防 (需求 §9/§17): range/interval/damage all derive from the frozen
// run snapshot; 拦截阵列 targets the enemy closest to the train, 重型近防
// carries its own elite factor here (damageTarget only handles drone sources).
function pointDefenseTick(dt){
  state.pointDefenseClock=Math.max(0,(state.pointDefenseClock||0)-dt);
  const pd=state.runStats?.pd;
  if(!carEnabled("pointDefense")||!pd||state.pointDefenseClock>0)return;
  const origin=pd.intercept?state.train:carPosition(1+state.expeditionPlan.cars.indexOf("pointDefense"));
  const range=92*pd.rangeMul;
  const target=pd.intercept
    ?combatTargets().filter(e=>Math.hypot(e.x-state.train.x,e.y-state.train.y)<=range+ (e.r||0))
      .sort((a,b)=>Math.hypot(a.x-state.train.x,a.y-state.train.y)-Math.hypot(b.x-state.train.x,b.y-state.train.y))[0]
    :nearestTarget(origin,range);
  if(!target)return;
  const eliteFactor=isEliteTarget(target)?pd.eliteMul:1;
  const amount=damageTarget(target,.8*pd.damageMul*eliteFactor,{owner:"train-point-defense"});
  state.trainDamage=(state.trainDamage||0)+amount;
  state.weaponFx.push({kind:"stationBeam",x:origin.x,y:origin.y,tx:target.x,ty:target.y,life:.1,maxLife:.1});
  state.pointDefenseClock=.42*pd.intervalMul;
}
// v0.10 permanent research applies the three drone multipliers exactly once
// here (需求 §17): damage 火控算法, interval 循环控制, range 射程校准 (ranges
// only - radii, blast areas and laser widths are out of scope per §17.3).
function applyResearchProfile(id,profile){
  const q={...profile},S=state.runStats;
  q.damage=(q.damage||0)*(S?.droneDamageMul??1);
  if(q.interval)q.interval*=S?.droneIntervalMul??1;
  if(q.range)q.range*=S?.droneRangeMul??1;
  const path=state.breakthroughs?.[id];
  if(profile.breakthrough&&path){
    if(id==="missile"&&path==="cluster"){q.damage*=.90;q.cluster=true;}
    if(id==="missile"&&path==="heavy"){q.damage*=1.22;q.radius=(q.radius||0)*1.18;q.interval*=1.12;}
    if(id==="piercing"&&path==="focus"){q.damage*=1.24;q.pierce=(q.pierce||0)+2;}
    if(id==="piercing"&&path==="split"){q.damage*=.74;q.projectileCount=2;q.spread=.055;}
  }
  // Lv.10 breakthrough blueprint enhancers stay active (需求 §21): they modify
  // the in-run breakthrough choice, not the permanent stat stack.
  if(longterm.hasBlueprint(state.metaProfile,"rail-lens")&&path==="focus")q.pierce=(q.pierce||0)+1;
  if(longterm.hasBlueprint(state.metaProfile,"arc-resonator")&&id==="chain")q.targets=(q.targets||1)+1;
  if(longterm.hasBlueprint(state.metaProfile,"missile-guidance")&&path==="heavy")q.radius=(q.radius||0)*1.12;
  if(longterm.hasBlueprint(state.metaProfile,"incendiary-gel")&&id==="incendiary")q.radius=(q.radius||0)*1.12;
  if(longterm.hasBlueprint(state.metaProfile,"ricochet-prism")&&id==="ricochet")q.bounces=(q.bounces||0)+1;
  q.frequency=q.interval?1/q.interval:0;
  if(profile.singleTargetDps && profile.damage && profile.interval)
    q.singleTargetDps=profile.singleTargetDps*(q.damage/profile.damage)*(profile.interval/q.interval)*((q.projectileCount||1)/(profile.projectileCount||1));
  return q;
}

export { applyResearchProfile, pointDefenseTick, alignedTargetCount, fireProfile, weaponDrone, fireDrone, fireMissile, fireRailgun, updateShots, bladeRadius, bladePositions, fireCommandVolley, purpleDischarge, updateArsenal };
