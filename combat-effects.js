"use strict";

const COMBAT_ESCORT_BASE_DAMAGE_RATIO = 0.4;
const COMBAT_ESCORT_INTERVAL_MULTIPLIER = 1.35;
const COMBAT_ESCORT_DPS_CAP_RATIO = 0.6;

const OWNERSHIP = Object.freeze({
  rapid: "main-only",
  scatter: "main-only",
  piercing: "main-only",
  chain: "main-only",
  missile: "main-only",
  wingman: "escort-only",
  escort: "escort-only",
  railgun: "train-only",
  armor: "train-only",
  repair: "train-only",
  shield: "train-only",
  cargo: "team-utility",
  volatile: "team-utility",
  magnet: "team-utility",
  overclock: "team-utility",
});

const DRONE_TYPES = Object.freeze([
  {id:"gun", module:"rapid", name:"雨燕", weapon:"机枪", color:"#65e5ff", icon:"ϟ"},
  {id:"missile", module:"missile", name:"天隼", weapon:"导弹", color:"#ff9c58", icon:"➤"},
  {id:"incendiary", module:"incendiary", name:"烛龙", weapon:"燃烧", color:"#ffcf5c", icon:"♨"},
  {id:"ricochet", module:"ricochet", name:"回响", weapon:"跳弹", color:"#d6a0ff", icon:"◉"},
  {id:"blades", module:"blades", name:"弦月", weapon:"旋刃", color:"#a5f1ff", icon:"✺"},
  {id:"chain", module:"chain", name:"惊蛰", weapon:"电弧", color:"#8b9dff", icon:"∿"},
  {id:"scatter", module:"scatter", name:"繁星", weapon:"霰弹", color:"#ff83b7", icon:"✣"},
  {id:"piercing", module:"piercing", name:"白虹", weapon:"磁轨", color:"#f4f8ff", icon:"↠"},
]);
function droneIdentity(id){
  if(id==="command")return {name:"北辰",weapon:"星脉炮"};
  if(id==="wingman"||id.startsWith("escort"))return {name:"雨燕僚机",weapon:"机枪支援"};
  return DRONE_TYPES.find(type=>type.id===id||type.module===id);
}
function droneLabel(id){const type=droneIdentity(id);return type?`${type.name} · ${type.weapon}`:id;}
// Actual displayed levels, including the Swift's free starting level.
function droneLevel(modules={},id){
  if(id==="command")return 1;
  if(id==="gun"||id==="rapid")return modules.gunDisabled?0:1+moduleLevel(modules,"rapid");
  return moduleLevel(modules,DRONE_TYPES.find(d=>d.id===id)?.module||id);
}
const BOND_RULES=Object.freeze([
  {id:"red",name:"红色灼杀",pair:["missile","incendiary"],description:"北辰额外发射追踪燃烧弹，爆炸后留下火区"},
  {id:"blue",name:"蓝色穿透",pair:["gun","piercing"],description:"北辰普攻替换为蓝色直线穿透激光"},
  {id:"purple",name:"紫色共振",pair:["chain","ricochet"],description:"北辰额外发射紫色跳弹，弹体向附近敌人放电"},
]);
function bondProfile(id,level){
  const rule=BOND_RULES.find(b=>b.id===id);if(!rule)throw new Error("Unknown bond: "+id);
  const n=Math.max(1,Math.floor(level)),t=n-1;
  const specs={
    red:{damage:5*(1+t*.18),burnDamage:.7*(1+t*.18),range:340,radius:112+Math.min(t,16)*2,speed:220,life:4,turnRate:3.8,duration:2.4,tick:.4},
    blue:{damage:3*(1+t*.2),range:360+Math.min(t,16)*4,width:10+Math.min(t,10)*.4},
    purple:{damage:2*(1+t*.18),arcDamage:.8*(1+t*.18),range:260,speed:270,life:3.6,bounces:5,arcRadius:82+Math.min(t,16)*2,arcInterval:.35,hitRadius:14},
  };
  return {...rule,level:n,...specs[id]};
}
function bondStates(modules={}){
  return BOND_RULES.map(rule=>{const levels=rule.pair.map(id=>droneLevel(modules,id)),active=levels.every(n=>n>=5);
    return {...rule,levels,active,level:active?1+levels[0]-5+levels[1]-5:0};});
}
function activeBonds(modules={}){return bondStates(modules).filter(b=>b.active).map(b=>bondProfile(b.id,b.level));}
// One source of truth for firing rules, upgrade previews and the pause inspector.
function weaponProfile(id, level=1, cores={}) {
  const n=Math.max(1,Math.floor(Number(level)||1)),t=n-1;
  const kind=id.startsWith("escort")?"escort":id;
  const common={id,kind,level:n,projectileCount:1,pierce:0,spread:0,speed:410,range:0,radius:0,chain:false};
  const specs={
    command:{role:"中程 · 稳定脉冲",damage:.9,interval:.72,range:220,speed:480},
    gun:{role:"近程 · 高频点射",damage:.65+t*.09,interval:Math.max(.085,.15-t*.008),range:155+Math.min(t,5)*4},
    escort:{role:"近程 · 辅助点射",damage:.5,interval:.22,range:145},
    missile:{role:"远程 · 追踪爆破",damage:5+t*1.4,interval:Math.max(2.4,4.2-t*.25),range:340,radius:68+Math.min(t,6)*5,speed:220,life:4,turnRate:3},
    chain:{role:"中程 · 连锁清群",damage:1.65+t*.35,interval:Math.max(.55,1.05-t*.06),range:205,chainRange:100+Math.min(t,5)*5,targets:3+Math.min(t,3),speed:0},
    scatter:{role:"近程 · 扇形霰弹",damage:.65+t*.18,interval:Math.max(.45,.8-t*.04),range:135,projectileCount:5+Math.min(t,3)*2,spread:.16,speed:370},
    piercing:{role:"远程 · 直线贯穿",damage:2.8+t*.65,interval:Math.max(.65,1.25-t*.07),range:300,pierce:2+Math.min(t,5),speed:560},
    incendiary:{role:"中远程 · 地面封锁",damage:.5+t*.2,interval:Math.max(2.4,3.6-t*.15),range:250,radius:55+Math.min(t,6)*5,tick:.4,duration:3.8,flight:.65,speed:0},
    ricochet:{role:"中程 · 弹跳穿群",damage:1.3+t*.3,interval:Math.max(1,1.9-t*.1),range:230,speed:270,life:4.8,bounces:3+Math.min(t,3)},
    blades:{role:"近战 · 持续切割",damage:.75+n*.3,interval:.25,range:72+Math.min(t,5)*8,radius:72+Math.min(t,5)*8,blades:Math.min(6,n+2),speed:0},
  };
  const p={...common,...specs[kind]};
  if(!specs[kind])throw new Error("Unknown drone weapon: "+id);
  if(kind==="gun"){
    p.projectileCount+=moduleLevel(cores,"scatter");p.spread=.12;
    p.interval/=1+Math.min(5,moduleLevel(cores,"overdrive"))*.08;
    p.coreArc=moduleLevel(cores,"arc")>0;
  }
  p.breakthrough=n>=10&&kind!=="command"&&kind!=="escort";
  if(p.breakthrough){p.damage*=1.35;p.range*=1.25;if(p.radius)p.radius*=1.25;if(p.chainRange)p.chainRange*=1.25;}
  // Derive flight lifetime after the range bonus so Lv.10 bullets reach that range.
  p.life??=p.speed?p.range/p.speed:0;
  p.frequency=1/p.interval;
  // One target, one projectile, no splash/chain bonus; never a promise of real DPS.
  p.singleTargetDps=p.damage/(p.tick||p.interval);
  return p;
}
function swarmRoster(modules={}) {
  const fleet=DRONE_TYPES.flatMap((type,slot)=>droneLevel(modules,type.id)>0
    ? [{...type,slot,level:droneLevel(modules,type.id)}] : []);
  for(let i=0;i<Math.min(3,moduleLevel(modules,"wingman"));i++)fleet.push({...DRONE_TYPES[0],id:"escort"+i,slot:8+i,level:1,...droneIdentity("wingman")});
  return fleet;
}
function formationPosition(center, slot, time, width, height) {
  const radius=slot<8?64:92, angle=Math.PI/2+(slot<8?slot*Math.PI/4:(slot-8)*Math.PI*2/3)+Math.sin(time*.5)*.08;
  // Move the formation inward near edges instead of stacking every follower on the boundary.
  const cx=Math.max(108,Math.min(width-108,center.x)),cy=Math.max(108,Math.min(height-108,center.y));
  return {x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius};
}

function flightPose(previous, vx, vy, dt) {
  const speed=Math.hypot(vx,vy),oldAngle=previous.flightAngle??-Math.PI/2;
  const direction=speed>5?((Math.round((Math.atan2(vy,vx)+Math.PI/2)/(Math.PI/4))%8)+8)%8:(previous.direction??0);
  const target=direction*Math.PI/4-Math.PI/2;
  const delta=Math.atan2(Math.sin(target-oldAngle),Math.cos(target-oldAngle));
  const flightAngle=oldAngle+Math.max(-5*dt,Math.min(5*dt,delta));
  const blend=1-Math.exp(-8*Math.max(0,dt));
  return {direction,flightAngle,bank:(previous.bank||0)+(Math.sin(delta)*.3-(previous.bank||0))*blend,
    thrust:(previous.thrust||0)+(Math.min(1,speed/180)-(previous.thrust||0))*blend,vx,vy};
}

function autonomousGoal(center, drone, target, time, width, height, combat=true) {
  const base=formationPosition(center,drone.slot,time,width,height),phase=time*.95+drone.slot*2.399;
  let x=base.x+Math.sin(phase)*9,y=base.y+Math.cos(phase*.83)*7,behavior="patrol";
  if(Math.hypot(drone.x-base.x,drone.y-base.y)>(drone.id==="blades"?115:75))behavior="return";
  else if(combat&&target&&Math.hypot(target.x-center.x,target.y-center.y)<230){
    const dx=target.x-base.x,dy=target.y-base.y,length=Math.hypot(dx,dy)||1;
    const reach=drone.id==="blades"?Math.min(70,Math.max(0,length-28)):15;
    x+=dx/length*reach;y+=dy/length*reach;behavior="engage";
  }
  if(behavior==="return"){x=base.x;y=base.y;}
  return {x:Math.max(20,Math.min(width-20,x)),y:Math.max(20,Math.min(height-20,y)),behavior};
}

function moduleLevel(map, id) {
  return Math.max(0, Number(map?.[id]) || 0);
}

function weaponOwnership(id) {
  if(DRONE_TYPES.some(type=>type.module===id))return "escort-only";
  return OWNERSHIP[id] || "main-only";
}

function mainWeaponProfile({ baseDamage, baseInterval, modules = {}, cores = {} }) {
  const rapid = moduleLevel(modules, "rapid");
  const scatter = moduleLevel(modules, "scatter") * 2 + moduleLevel(cores, "scatter");
  const interval = Math.max(0.14, baseInterval - rapid * 0.07);
  const damage = Math.max(0, baseDamage + rapid * 0.12);
  const projectileCount = 1 + scatter;
  return {
    baseDamage,
    baseInterval,
    damage,
    interval,
    projectileCount,
    pierce: moduleLevel(modules, "piercing"),
    chain: moduleLevel(modules, "chain") > 0,
    coreArc: moduleLevel(cores, "arc") > 0,
    dps: damage * projectileCount / interval,
  };
}

function emptyEscortProfile() {
  return { damage: 0, interval: 0, projectileCount: 0, pierce: 0, chain: false, dpsPerEscort: 0, totalDps: 0 };
}

function escortWeaponProfile({ main, escortCount, escortLevel = 0 }) {
  const count = Math.max(0, Math.floor(Number(escortCount) || 0));
  if (!count || !main || !(main.dps > 0)) return emptyEscortProfile();
  const interval = Math.max(0.01, main.baseInterval * COMBAT_ESCORT_INTERVAL_MULTIPLIER);
  const cap = main.dps * COMBAT_ESCORT_DPS_CAP_RATIO * (1 + Math.max(0, Number(escortLevel) || 0) * 0.08);
  const levelBonus = Math.max(0, Number(escortLevel) || 0);
  const sharedBaseDps = main.baseDamage * COMBAT_ESCORT_BASE_DAMAGE_RATIO * (1 + levelBonus * 0.1) / interval;
  const totalDps = Math.min(sharedBaseDps, cap);
  const damage = totalDps * interval / count;
  const dpsPerEscort = damage / interval;
  return { damage, interval, projectileCount: 1, pierce: 0, chain: false, dpsPerEscort, totalDps: dpsPerEscort * count };
}

function trainWeaponProfile({ modules = {} }) {
  const railgun = moduleLevel(modules, "railgun");
  return { railgunDamage: railgun ? 2.6 + railgun * 0.35 : 0, railgunInterval: railgun ? Math.max(0.7, 1.2 - railgun * 0.08) : Infinity };
}

function wingmanPositions(center, count, time) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = time * 1.8 + (Math.PI * 2 * i) / count;
    positions.push({
      x: center.x + Math.cos(angle) * 34,
      y: center.y + Math.sin(angle) * 34,
    });
  }
  return positions;
}

function applyAreaDamage(targets, center, radius, damage) {
  let hitCount = 0;
  const defeated = [];
  for (const target of targets) {
    if (target.dead || Math.hypot(target.x - center.x, target.y - center.y) > radius) continue;
    target.hp -= damage;
    target.hit = 1;
    hitCount += 1;
    if (target.hp <= 0) {
      target.dead = true;
      defeated.push(target);
    }
  }
  return { hitCount, defeated };
}

const combatEffects = {
  droneLevel,
  BOND_RULES,
  bondProfile,
  bondStates,
  activeBonds,
  droneIdentity,
  droneLabel,
  weaponProfile,
  flightPose,
  autonomousGoal,
  DRONE_TYPES,
  swarmRoster,
  formationPosition,
  ESCORT_BASE_DAMAGE_RATIO: COMBAT_ESCORT_BASE_DAMAGE_RATIO,
  ESCORT_INTERVAL_MULTIPLIER: COMBAT_ESCORT_INTERVAL_MULTIPLIER,
  ESCORT_DPS_CAP_RATIO: COMBAT_ESCORT_DPS_CAP_RATIO,
  wingmanPositions,
  applyAreaDamage,
  weaponOwnership,
  mainWeaponProfile,
  emptyEscortProfile,
  escortWeaponProfile,
  trainWeaponProfile,
};
if (typeof module !== "undefined" && module.exports) module.exports = combatEffects;
if (typeof window !== "undefined") window.EndlessRailsCombatEffects = combatEffects;
