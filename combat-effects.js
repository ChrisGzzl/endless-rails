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
  {id:"gun", module:"rapid", name:"机枪机", color:"#65e5ff", icon:"ϟ"},
  {id:"missile", module:"missile", name:"导弹机", color:"#ff9c58", icon:"➤"},
  {id:"incendiary", module:"incendiary", name:"燃烧机", color:"#ffcf5c", icon:"♨"},
  {id:"ricochet", module:"ricochet", name:"弹跳机", color:"#d6a0ff", icon:"◉"},
  {id:"blades", module:"blades", name:"刀刃机", color:"#a5f1ff", icon:"✺"},
  {id:"chain", module:"chain", name:"电弧机", color:"#8b9dff", icon:"∿"},
  {id:"scatter", module:"scatter", name:"散射机", color:"#ff83b7", icon:"✣"},
  {id:"piercing", module:"piercing", name:"穿透机", color:"#f4f8ff", icon:"↠"},
]);
function swarmRoster(modules={}) {
  const fleet=DRONE_TYPES.flatMap((type,slot)=>type.id==="gun"||moduleLevel(modules,type.module)>0
    ? [{...type,slot,level:type.id==="gun"?1+moduleLevel(modules,"rapid"):moduleLevel(modules,type.module)}] : []);
  for(let i=0;i<Math.min(3,moduleLevel(modules,"wingman"));i++)fleet.push({...DRONE_TYPES[0],id:"escort"+i,slot:8+i,level:1,name:"机枪僚机"});
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
  if(Math.hypot(drone.x-base.x,drone.y-base.y)>75)behavior="return";
  else if(combat&&target&&Math.hypot(target.x-center.x,target.y-center.y)<230){
    const dx=target.x-base.x,dy=target.y-base.y,length=Math.hypot(dx,dy)||1;
    x+=dx/length*15;y+=dy/length*15;behavior="engage";
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
