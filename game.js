"use strict";
const canvas=document.getElementById("gameCanvas"),ctx=canvas.getContext("2d"),W=canvas.width,H=canvas.height,TAU=Math.PI*2,$=id=>document.getElementById(id),motion=window.EndlessRailsMotion||{FORWARD:{x:.5,y:-Math.sqrt(3)/2},spawnPoint(side,width,height,margin,random=Math.random){const along=random()*(side==="top"||side==="bottom"?width+margin*2:height+margin*2)-margin;if(side==="top")return{x:along,y:-margin};if(side==="right")return{x:width+margin,y:along};if(side==="bottom")return{x:along,y:height+margin};return{x:-margin,y:along}},stepChaser(entity,dt,center,driftSpeed){const dx=center.x-entity.x,dy=center.y-entity.y,d=Math.hypot(dx,dy)||1;return{x:entity.x-motion.FORWARD.x*driftSpeed*dt+dx/d*entity.speed*dt,y:entity.y-motion.FORWARD.y*driftSpeed*dt+dy/d*entity.speed*dt}}};
const WORLD_SPEED=88;
if(!motion.scrollOffset)motion.scrollOffset=(time,speed,multiplier=1)=>Math.max(0,time)*Math.max(0,speed)*Math.max(0,multiplier);
if(!motion.projectLandmark)motion.projectLandmark=(seed,index,width,height,offset,layer)=>{const value=Math.abs(Math.sin((Number(seed)||1)*12.9898+index*78.233)),multiplier=layer==="far"?.16:layer==="mid"?.48:1;return{x:(value*width-motion.FORWARD.x*offset*multiplier)%width,y:(value*height-motion.FORWARD.y*offset*multiplier)%height}};
const balance=window.EndlessRailsBalance||{START_TRAIN_LENGTH:3,REGULAR_ENEMY_HP_BASE:1.3,REGULAR_ENEMY_HP_STEP:.16,ELITE_ENEMY_HP_BASE:4,ELITE_ENEMY_HP_STEP:.4,REGULAR_ENEMY_SPEED_BASE:88,REGULAR_ENEMY_SPEED_JITTER:16,REGULAR_ENEMY_SPEED_STEP:4,ELITE_ENEMY_SPEED_BASE:108,ELITE_ENEMY_SPEED_STEP:4,RAIL_HALF_LENGTH:1100,RAIL_WIDTH:8,RAIL_EDGE_WIDTH:2.5,SLEEPER_WIDTH:4,CAR_LENGTH:50,CAR_HEIGHT:34,CAR_SPACING:58,SPAWN_BATCH_SIZE:3,ENEMY_CAP:26,BOSS_ENEMY_CAP:30,SPAWN_INTERVAL_BASE:.34,SPAWN_INTERVAL_STEP:.02,DRONE_BASE_DAMAGE:1.55,HIT_PARTICLE_COUNT:8,KILL_BLAST_RADIUS:46,KILL_BLAST_DAMAGE:.85,initialWaveCount:station=>station===5?12:7+station,enemyCap:station=>station===5?30:26,spawnInterval:station=>Math.max(.24,.34-station*.02)};
const progression=window.EndlessRailsProgression||{createProgression:()=>({routeDistance:20,routeDistanceTotal:20,experience:0,experienceToNext:10,level:1,pendingLevelUps:0,drops:[],coreStacks:{}}),awardExperience:(s,a)=>({...s,experience:s.experience+a}),advanceRoute:(s,dt)=>({...s,routeDistance:Math.max(0,s.routeDistance-dt)}),rollCoreDrop:()=>null,collectCore:(s)=>({state:s,collected:false,scrap:0}),expireDrops:(drops,dt)=>drops.map(d=>({...d,life:d.life-dt})).filter(d=>d.life>0)};
const effects=window.EndlessRailsCombatEffects||{wingmanPositions:(center)=>[{x:center.x,y:center.y}],applyAreaDamage:()=>({hitCount:0,defeated:[]}),mainWeaponProfile:({baseDamage,baseInterval,modules={}})=>{const rapid=Math.max(0,Number(modules.rapid)||0),scatter=Math.max(0,Number(modules.scatter)||0)*2,damage=baseDamage+rapid*.12,interval=Math.max(.14,baseInterval-rapid*.07);return{baseDamage,baseInterval,damage,interval,projectileCount:1+scatter,pierce:Math.max(0,Number(modules.piercing)||0),chain:Math.max(0,Number(modules.chain)||0)>0,coreArc:false,dps:damage*(1+scatter)/interval}},escortWeaponProfile:({main,escortCount})=>{const count=Math.max(0,Number(escortCount)||0);if(!count)return{damage:0,interval:0,projectileCount:0,pierce:0,chain:false,totalDps:0};const interval=main.baseInterval*1.35,damage=main.baseDamage*.4/count;return{damage,interval,projectileCount:1,pierce:0,chain:false,totalDps:damage*count/interval}},weaponOwnership:id=>["wingman","escort"].includes(id)?"escort-only":["railgun","armor","repair","shield"].includes(id)?"train-only":["cargo","magnet","overclock"].includes(id)?"team-utility":"main-only",trainWeaponProfile:({modules={}})=>{const railgun=Math.max(0,Number(modules.railgun)||0);return{railgunDamage:railgun?2.6+railgun*.35:0,railgunInterval:railgun?Math.max(.7,1.2-railgun*.08):Infinity}}};
const control=window.EndlessRailsControl||{relativeCommand:(point,train,bounds)=>({x:point.x,y:point.y,angle:0,strength:1}),directCommand:(point,bounds)=>({x:Math.max(bounds.left,Math.min(bounds.right,point.x)),y:Math.max(bounds.top,Math.min(bounds.bottom,point.y))}),createCommandRing:(target,life)=>({target,life}),advanceCommandRing:ring=>ring};
const routeEvents=window.EndlessRailsRouteEvents||{ROUTE_EVENTS:[{id:"default",name:"标准线路",description:"稳定推进。",weather:"clear",routeDistanceMultiplier:1,enemySpeedMultiplier:1,eliteChanceMultiplier:1,coreChanceMultiplier:1}],CONTRACTS:[{id:"default",name:"标准契约",description:"按基础规则推进。",rewardMultiplier:1,enemyHpMultiplier:1,scrapMultiplier:1}],createSeed:()=>1,pickRouteEvents:()=>[],pickContracts:()=>[],applyRouteModifiers:base=>({...base})};
const runRecord=window.EndlessRailsRunRecord||{emptyRecord:()=>({runs:0,bestStations:0,bestKills:0,bestCombo:0,bestScrap:0,latest:null}),loadRecord:()=>({runs:0,bestStations:0,bestKills:0,bestCombo:0,bestScrap:0,latest:null}),buildRunSummary:state=>({stations:state.station,kills:state.kills,scrap:state.scrap,bestCombo:state.bestCombo,modules:{...state.modules},cores:{...state.coreStacks},outcome:state.outcome||"lost"}),mergeRecord:(record,summary)=>({...record,runs:(record.runs||0)+1,bestStations:Math.max(record.bestStations||0,summary.stations),bestKills:Math.max(record.bestKills||0,summary.kills),bestCombo:Math.max(record.bestCombo||0,summary.bestCombo),bestScrap:Math.max(record.bestScrap||0,summary.scrap),latest:summary}),saveRecord:()=>false};
const ui={station:$("stationValue"),scrap:$("scrapValue"),health:$("healthText"),healthFill:$("healthFill"),timer:$("timerValue"),phase:$("phaseLabel"),drone:$("droneLevel"),pulse:$("pulseButton"),pulseCooldown:$("pulseCooldown"),objective:$("objectiveText"),combo:$("comboText"),toast:$("toast"),hint:$("touchHint"),start:$("startScreen"),stationScreen:$("stationScreen"),stationTitle:$("stationTitle"),upgrades:$("upgradeList"),continue:$("continueButton"),result:$("resultScreen"),bossWrap:$("bossWrap"),bossText:$("bossText"),bossFill:$("bossFill"),trainLength:$("trainLengthLabel"),miniTrain:$("miniTrain"),routeLabel:$("routeProgressLabel"),routeFill:$("routeProgressFill"),xpLabel:$("experienceProgressLabel"),xpFill:$("experienceProgressFill"),levelUp:$("levelUpScreen"),levelUpList:$("levelUpList"),pause:$("pauseButton"),commandRing:$("commandRing"),eventScreen:$("eventScreen"),eventList:$("eventList"),contractScreen:$("contractScreen"),contractList:$("contractList"),reroll:$("rerollButton"),resultBuild:$("resultBuild"),resultRecord:$("resultRecord")};
const upgradePool=[
 {id:"volatile",type:"train",icon:"✹",name:"连锁爆破协议",desc:"击破敌人引发范围爆炸，适合清理尸群。",cost:0},
 {id:"rapid",type:"drone",icon:"ϟ",name:"脉冲机枪",desc:"射速提升 28%。",cost:28},{id:"missile",type:"drone",icon:"➤",name:"追踪导弹",desc:"每轮发射一枚高伤导弹。",cost:38},{id:"scatter",type:"drone",icon:"✣",name:"裂片散射",desc:"每次射击额外释放两枚碎弹。",cost:44},{id:"tesla",type:"drone",icon:"∿",name:"电弧线圈",desc:"命中后跳电附近目标。",cost:52},{id:"wingman",type:"drone",icon:"◇",name:"伴飞无人机",desc:"增加一架伴飞机，火力 +45%。",cost:64},{id:"overclock",type:"drone",icon:"◎",name:"过载核心",desc:"脉冲冷却时间缩短 30%。",cost:58},
 {id:"armor",type:"train",icon:"⬢",name:"装甲铆接",desc:"最大完整度 +35，撞击伤害降低。",cost:42},{id:"railgun",type:"train",icon:"⌁",name:"车头磁轨炮",desc:"列车向前方周期性发射穿透弹。",cost:46},{id:"cargo",type:"train",icon:"▣",name:"货运舱",desc:"车厢 +1，击破废料收益 +30%。",cost:48},{id:"repair",type:"train",icon:"+",name:"维修车",desc:"每到站额外修复 18 点完整度。",cost:50},{id:"shield",type:"train",icon:"◈",name:"偏转护盾",desc:"每轮抵挡第一次撞击。",cost:55},{id:"magnet",type:"train",icon:"⊕",name:"废料磁吸",desc:"废料收益 +50%，并吸引远处掉落。",cost:60}];
const experiencePool=[
 {id:"blades",icon:"✺",name:"刀刃机",desc:"大范围持续切割，主动靠近尸群；升级扩大刀环。"},
 {id:"incendiary",icon:"♨",name:"燃烧机",desc:"专机投掷榴弹，落地留下一片火区。"},
 {id:"ricochet",icon:"◉",name:"弹跳机",desc:"专机发射能量球，撞墙反弹。"},
 {id:"rapid",icon:"ϟ",name:"机枪机强化",desc:"强化已有机枪机的射速与伤害。"},{id:"scatter",icon:"✣",name:"散射机",desc:"独立专机发射扇形弹幕。"},{id:"piercing",icon:"↠",name:"穿透机",desc:"独立专机发射高伤穿透弹。"},{id:"chain",icon:"∿",name:"电弧机",desc:"独立专机释放链式闪电。"},{id:"missile",icon:"➤",name:"导弹机",desc:"独立专机只发射追踪爆破导弹。"},{id:"wingman",icon:"◇",name:"机枪僚机",desc:"增派一架机枪僚机，最多三架。"}];
const stationUpgradePool=upgradePool.filter(u=>u.type==="train");
const state={worldDistance:0,comboFxAt:-1,swarm:[],routeElapsed:0,docking:null,zones:[],weaponFx:[],weaponClocks:{},mode:"menu",visualTime:0,paused:false,commandRing:null,commandRingLife:0,runSeed:1,activeEvent:null,activeContract:null,routeModifiers:{routeDistance:20,enemySpeed:1,enemyHp:1,eliteChance:.07,coreChance:1,rewardMultiplier:1,scrapMultiplier:1,weather:"clear"},record:runRecord.loadRecord(typeof localStorage!=="undefined"?localStorage:null),escortClock:.2,eventChoices:[],contractChoices:[],rerollUsed:false,coreHitCounter:0,station:1,timer:20,maxTrainHp:100,trainHp:100,scrap:0,kills:0,combo:0,bestCombo:0,score:0,droneLevel:1,trainLength:balance.START_TRAIN_LENGTH,fireClock:0,missileClock:0,spawnClock:.2,pulseClock:0,railClock:0,hurtFlash:0,shake:0,moveInput:{x:0,y:0},drone:{x:240,y:300,moveSpeed:control.DRONE_MOVE_SPEED},train:{x:W/2,y:H/2},enemies:[],shots:[],particles:[],texts:[],selectedUpgrade:null,modules:{},boss:null,shieldReady:false,...progression.createProgression({routeDistanceTotal:20})};
const level=id=>state.modules[id]||0;
function resetRun(){resetJoystick();const seed=routeEvents.createSeed(Date.now());Object.assign(state,{worldDistance:0,comboFxAt:-1,swarm:[],routeElapsed:0,docking:null,zones:[],weaponFx:[],weaponClocks:{},mode:"contractChoice",visualTime:0,paused:false,runSeed:seed,activeEvent:null,activeContract:null,routeModifiers:{routeDistance:20,enemySpeed:1,enemyHp:1,eliteChance:.07,coreChance:1,rewardMultiplier:1,scrapMultiplier:1,weather:"clear"},station:1,timer:20,maxTrainHp:100,trainHp:100,scrap:0,kills:0,combo:0,bestCombo:0,score:0,droneLevel:1,trainLength:balance.START_TRAIN_LENGTH,fireClock:0,escortClock:.2,missileClock:0,spawnClock:.2,pulseClock:0,railClock:0,hurtFlash:0,shake:0,coreHitCounter:0,enemies:[],shots:[],particles:[],texts:[],selectedUpgrade:null,modules:{},boss:null,shieldReady:false,commandRing:null,rerollUsed:false,...progression.createProgression({routeDistanceTotal:20})});state.train.x=W/2;state.train.y=H/2;Object.assign(state.drone,{x:W/2+45,y:H/2-40,moveSpeed:control.DRONE_MOVE_SPEED,flightAngle:-Math.PI/2,direction:0,bank:0,thrust:0,vx:0,vy:0});ui.start.hidden=true;ui.stationScreen.hidden=true;ui.levelUp.hidden=true;ui.result.hidden=true;ui.eventScreen.hidden=true;ui.contractScreen.hidden=true;ui.hint.style.opacity=.8;openContractChoice();updateHud()}
function spawnWave(){const count=balance.initialWaveCount(state.station);for(let i=0;i<count;i++)spawnEnemy(i*.14);state.boss=null;ui.bossWrap.hidden=true;}
function spawnEnemy(delay=0) {
  const curve = balance.difficultyAt(state.station, state.routeElapsed, state.routeDistanceTotal);
  const sides = ["top", "right", "bottom", "left"], side = sides[Math.floor(Math.random()*4)];
  const point = motion.spawnPoint(side, W, H, 28);
  const elite = Math.random() < curve.eliteChance * (state.activeEvent?.eliteChanceMultiplier || 1);
  const hp = curve.hp * (elite ? 3.4 : 1) * state.routeModifiers.enemyHp;
  state.enemies.push({ ...point, r: elite ? 17 : 9, hp, maxHp: hp,
    speed: curve.speed * (elite ? 1.12 : 1) * state.routeModifiers.enemySpeed,
    hue: Math.random(), elite, side, delay, hit: 0, dead: false });
}
function update(dt) {
  if (state.paused || state.mode === "levelup") return;
  if (state.mode === "docking") { updateDocking(dt); updateHud(); return; }
  if (state.mode !== "combat") return;
  state.visualTime += dt;
  advanceWorld(WORLD_SPEED*dt);
  state.routeElapsed += dt;
  state.routeDistance = progression.advanceRoute(state, dt).routeDistance;
  state.timer = state.routeDistance;
  for (const key of ["fireClock", "escortClock", "missileClock", "spawnClock"]) state[key] -= dt;
  state.pulseClock = Math.max(0, state.pulseClock-dt);
  state.railClock += dt;
  state.hurtFlash = Math.max(0, state.hurtFlash-dt);
  state.shake = Math.max(0, state.shake-dt*20);
  const previousDrone={x:state.drone.x,y:state.drone.y};
  Object.assign(state.drone, control.stepDrone(state.drone, state.moveInput, state.drone.moveSpeed, dt, droneBounds()));
  Object.assign(state.drone,effects.flightPose(state.drone,(state.drone.x-previousDrone.x)/Math.max(dt,.001),(state.drone.y-previousDrone.y)/Math.max(dt,.001),dt));
  updateSwarm(dt);
  state.commandRing = control.advanceCommandRing(state.commandRing, dt);
  state.drops = progression.expireDrops(state.drops, dt);
  for (let i=state.drops.length-1; i>=0; i--) {
    const drop=state.drops[i];
    if (Math.hypot(drop.x-state.drone.x,drop.y-state.drone.y) < 28+level("magnet")*16) {
      const picked=progression.collectCore(state,drop.type);
      Object.assign(state,picked.state); state.scrap+=picked.scrap; state.drops.splice(i,1);
      showToast(picked.collected ? "武器核心已装配" : "核心转化为废料");
    }
  }
  // Remove corpses every frame, keeping collision cost proportional to the live cap.
  state.enemies = state.enemies.filter(e=>!e.dead);
  const curve = balance.difficultyAt(state.station, state.routeElapsed, state.routeDistanceTotal);
  if (state.spawnClock<=0) {
    for (let i=0; i<curve.batch && state.enemies.length<curve.cap; i++) spawnEnemy(i*.1);
    state.spawnClock = curve.interval * (state.activeEvent?.id === "freight" ? 1.2 : 1);
  }
  for (const e of state.enemies) {
    if(e.dead)continue;
    if(e.delay>0){e.delay-=dt;continue;}
    Object.assign(e,motion.stepChaser(e,dt,state.train,WORLD_SPEED*.3));
    e.hit=Math.max(0,e.hit-dt*5);
    if(Math.hypot(state.train.x-e.x,state.train.y-e.y)<42)collideTrain(e);
  }
  if (state.station===5 && state.routeElapsed>=22 && !state.boss) {
    state.boss={hp:260,maxHp:260,x:W/2+105,y:-40,r:34,speed:44,hit:0,summon:3.2,dead:false};
    ui.bossWrap.hidden=false;showToast("感染巨兽接近 · 最后防线");
  }
  if (state.boss && !state.boss.dead) {
    const b=state.boss; b.hit=Math.max(0,b.hit-dt*4); b.summon-=dt;
    Object.assign(b,motion.stepChaser(b,dt,state.train,WORLD_SPEED*.15));
    if(b.summon<=0){
      for(let i=0;i<3 && state.enemies.length<curve.cap;i++)spawnEnemy(i*.15);
      b.summon=6; showToast("感染巨兽召集尸群");
    }
    if(Math.hypot(b.x-state.train.x,b.y-state.train.y)<55) {
      state.trainHp=Math.max(0,state.trainHp-7*dt); state.hurtFlash=.1;
    }
  }
  const trainProfile=effects.trainWeaponProfile({modules:state.modules});
  if(trainProfile.railgunDamage&&state.railClock>trainProfile.railgunInterval){fireRailgun(trainProfile);state.railClock=0;}
  updateArsenal(dt);
  updateShots(dt); updateParticles(dt);
  if(state.trainHp<=0){finish(false);return;}
  if(state.station===5&&state.boss?.dead){startDocking(true);return;}
  if(state.pendingLevelUps>0)openLevelUp();
  else if(state.routeDistance<=0&&state.station<5)startDocking(false);
  // Final route holds at zero until the boss is defeated.
  updateHud();
}
function collideTrain(e){e.dead=true;if(state.shieldReady){state.shieldReady=false;burst(e.x,e.y,"#7ce9e6",14,80);showToast("护盾挡下撞击");return}const damage=(e.elite?11:6)*(1-Math.min(.36,level("armor")*.12));state.trainHp=Math.max(0,state.trainHp-damage);state.hurtFlash=.3;state.shake=5;burst(e.x,e.y,"#f16d63",9,60);addText("-"+Math.ceil(damage),state.train.x,state.train.y-40,"#f16d63")}
function nearestTarget(origin){
  let nearest,distance=Infinity;
  for(const e of combatTargets()){
    const squared=(e.x-origin.x)**2+(e.y-origin.y)**2;
    if(squared<distance){distance=squared;nearest=e;}
  }
  return nearest;
}
// A coarse density grid avoids an all-pairs search as the horde grows.
function bladeHuntTarget(origin){
  const cells=new Map();
  for(const e of state.enemies){
    if(e.dead||e.delay>0||Math.hypot(e.x-state.drone.x,e.y-state.drone.y)>200)continue;
    const key=Math.floor(e.x/56)+","+Math.floor(e.y/56),cell=cells.get(key)||{x:0,y:0,count:0};
    cell.x+=e.x;cell.y+=e.y;cell.count++;cells.set(key,cell);
  }
  let best,score=-Infinity;
  for(const c of cells.values()){
    c.x/=c.count;c.y/=c.count;
    const value=c.count-Math.hypot(c.x-origin.x,c.y-origin.y)/160;
    if(value>score){score=value;best=c;}
  }
  return best;
}
function fireProfile(origin,profile,color){const target=nearestTarget(origin);if(!target||!profile.projectileCount)return;const angle=Math.atan2(target.y-origin.y,target.x-origin.x);for(let i=0;i<profile.projectileCount;i++){const spread=profile.projectileCount===1?0:(i-(profile.projectileCount-1)/2)*.12;state.shots.push({x:origin.x,y:origin.y,vx:Math.cos(angle+spread)*410,vy:Math.sin(angle+spread)*410,life:1,damage:profile.damage,pierce:profile.pierce,chain:profile.chain,coreArc:!!profile.coreArc,color,owner:origin.id||"train"})}}
function advanceWorld(distance) {
  state.worldDistance+=distance;
  const drift=motion.worldDrift(1,distance);
  for(const z of state.zones){
    z.x+=drift.x;z.y+=drift.y;
    if(z.flight>0){z.sx+=drift.x;z.sy+=drift.y;}
  }
  for(const drop of state.drops){drop.x+=drift.x;drop.y+=drift.y;}
}
function syncSwarm() {
  const old=new Map(state.swarm.map(d=>[d.id,d]));
  state.swarm=effects.swarmRoster(state.modules).map(spec=>{
    const existing=old.get(spec.id);
    return existing?Object.assign(existing,spec):{...spec,x:state.drone.x,y:state.drone.y,flash:0,angle:-Math.PI/2,flightAngle:-Math.PI/2,direction:0,bank:0,thrust:0,vx:0,vy:0};
  });
}
function updateSwarm(dt) {
  syncSwarm();
  // Read previous positions for all neighbors so separation does not depend on update order.
  const positions=state.swarm.map(d=>({id:d.id,x:d.x,y:d.y}));
  for(const d of state.swarm){
    let target=nearestTarget(d);
    if(d.id==="blades"){
      d.huntClock=(d.huntClock||0)-dt;
      if(d.huntClock<=0){d.huntTarget=bladeHuntTarget(d);d.huntClock=.3;}
      target=d.huntTarget||target;
    }
    const goal=effects.autonomousGoal(state.drone,d,target,state.visualTime,W,H,state.mode==="combat");
    for(const other of positions){
      if(other.id===d.id)continue;
      const dx=d.x-other.x,dy=d.y-other.y,length=Math.hypot(dx,dy);
      if(length>0&&length<25){goal.x+=dx/length*(25-length)*.45;goal.y+=dy/length*(25-length)*.45;}
    }
    const dx=goal.x-d.x,dy=goal.y-d.y,length=Math.hypot(dx,dy)||1;
    const speed=Math.min(240,length*4),blend=1-Math.exp(-7*dt);
    let vx=(d.vx||0)+(dx/length*speed-(d.vx||0))*blend;
    let vy=(d.vy||0)+(dy/length*speed-(d.vy||0))*blend;
    const travel=Math.hypot(vx,vy)*dt;
    if(travel>length){vx*=length/travel;vy*=length/travel;}
    const x=Math.max(18,Math.min(W-18,d.x+vx*dt)),y=Math.max(18,Math.min(H-18,d.y+vy*dt));
    Object.assign(d,effects.flightPose(d,(x-d.x)/Math.max(dt,.001),(y-d.y)/Math.max(dt,.001),dt));
    d.x=x;d.y=y;d.behavior=goal.behavior;d.flash=Math.max(0,d.flash-dt);
    if(target)d.angle=Math.atan2(target.y-d.y,target.x-d.x);
  }
}
function weaponDrone(id) {
  syncSwarm();
  return state.swarm.find(d=>d.id===id);
}
function fireDrone(origin=weaponDrone("gun")) {
  if(!origin)return;
  // The machine gun never inherits another aircraft's scatter or piercing modules.
  const profile=effects.mainWeaponProfile({baseDamage:balance.DRONE_BASE_DAMAGE,baseInterval:.4,
    modules:{rapid:level("rapid")},cores:state.coreStacks});
  fireProfile(origin,profile,origin.color);origin.flash=.12;
}
function fireMissile(origin=weaponDrone("missile")) {
  if(!origin)return;
  const target=nearestTarget(origin);if(!target)return;
  const a=Math.atan2(target.y-origin.y,target.x-origin.x);
  state.shots.push({x:origin.x,y:origin.y,vx:Math.cos(a)*220,vy:Math.sin(a)*220,
    life:4,damage:3+level("missile"),missile:true,target,color:origin.color,owner:origin.id});
  origin.flash=.22;
}
function fireRailgun(profile){const t=state.enemies.find(e=>!e.dead&&e.delay<=0)||state.boss;if(!t)return;const a=Math.atan2(t.y-(state.train.y-28),t.x-state.train.x);state.shots.push({x:state.train.x,y:state.train.y-28,vx:Math.cos(a)*500,vy:Math.sin(a)*500,life:1.2,damage:profile.railgunDamage,railgun:true,color:"#ffb45f"});burst(state.train.x,state.train.y-28,"#ffb45f",7,50)}
function combatTargets() {
  return [...state.enemies.filter(e=>!e.dead&&e.delay<=0),...(state.boss&&!state.boss.dead?[state.boss]:[])];
}
function damageTarget(target, amount) {
  if(target.dead)return;
  target.hp-=amount; target.hit=1;
  if(target.hp<=0)target===state.boss?killBoss():killEnemy(target);
}
function areaHit(center,radius,damage) {
  for(const target of combatTargets())if(Math.hypot(target.x-center.x,target.y-center.y)<radius+target.r)damageTarget(target,damage);
}
function updateShots(dt) {
  for(let i=state.shots.length-1;i>=0;i--){
    const s=state.shots[i];
    if(s.missile){
      if(!s.target||s.target.dead)s.target=nearestTarget(s);
      if(s.target){
        const desired=Math.atan2(s.target.y-s.y,s.target.x-s.x), current=Math.atan2(s.vy,s.vx);
        const delta=Math.atan2(Math.sin(desired-current),Math.cos(desired-current));
        const a=current+Math.max(-3*dt,Math.min(3*dt,delta));
        s.vx=Math.cos(a)*220;s.vy=Math.sin(a)*220;
      }
    }
    s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;
    if(s.bounce){
      if(s.x<10||s.x>W-10){s.vx*=-1;s.x=Math.max(10,Math.min(W-10,s.x));s.hitIds=[];}
      if(s.y<10||s.y>H-10){s.vy*=-1;s.y=Math.max(10,Math.min(H-10,s.y));s.hitIds=[];}
    }
    let consumed=false;
    for(const e of combatTargets()){
      if(e.dead||s.hitIds?.includes(e))continue;
      if(Math.hypot(e.x-s.x,e.y-s.y)>=e.r+(s.bounce?10:6))continue;
      s.hitIds||=[];s.hitIds.push(e);
      if(s.missile){
        areaHit(s,65+level("missile")*5,s.damage);
        state.weaponFx.push({kind:"blast",x:s.x,y:s.y,r:65,life:.4,maxLife:.4});
        burst(s.x,s.y,"#ff9658",18,110); consumed=true;break;
      }
      damageTarget(e,s.damage);burst(s.x,s.y,"#e7f5ff",3,35);
      state.coreHitCounter++;
      if(s.chain||(s.coreArc&&state.coreHitCounter%4===0)){
        const arc=combatTargets().find(x=>x!==e&&Math.hypot(x.x-e.x,x.y-e.y)<110);
        if(arc){damageTarget(arc,s.damage*.65);state.weaponFx.push({kind:"arc",x:e.x,y:e.y,tx:arc.x,ty:arc.y,life:.18,maxLife:.18});}
      }
      if(s.railgun||s.bounce)continue;
      if(s.pierce>0){s.pierce--;continue;}
      consumed=true;break;
    }
    if(consumed||s.life<=0)state.shots.splice(i,1);
  }
}
function bladeRadius(n=level("blades")){return 72+Math.min(5,Math.max(0,n-1))*8;}
function bladePositions() {
  const origin=state.swarm.find(d=>d.id==="blades");if(!origin)return [];
  const count=Math.min(6,level("blades")+2);
  return Array.from({length:count},(_,i)=>{
    const a=state.visualTime*6+i*TAU/count;
    return {x:origin.x+Math.cos(a)*(bladeRadius()-9),y:origin.y+Math.sin(a)*(bladeRadius()-9),a};
  });
}
function updateArsenal(dt) {
  syncSwarm();
  for(const drone of state.swarm) {
    const id=drone.id;
    state.weaponClocks[id]=(state.weaponClocks[id]||0)-dt;
    if(state.weaponClocks[id]>0)continue;
    const target=nearestTarget(drone);if(!target)continue;
    const n=drone.level;
    if(id==="gun"){
      fireDrone(drone);state.weaponClocks[id]=Math.max(.14,.4-level("rapid")*.07);
    }else if(id.startsWith("escort")){
      fireProfile(drone,{damage:.55,projectileCount:1,pierce:0,chain:false},drone.color);
      state.weaponClocks[id]=.65;
    }else if(id==="missile"){
      fireMissile(drone);state.weaponClocks[id]=Math.max(1.8,4.5-n*.5);
    }else if(id==="scatter"||id==="piercing"){
      fireProfile(drone,{damage:id==="scatter"?.85+n*.15:1.4+n*.4,
        projectileCount:id==="scatter"?Math.min(7,1+n*2):1,pierce:id==="piercing"?n+1:0,chain:false},drone.color);
      state.weaponClocks[id]=id==="scatter"?.8:.65;
    }else if(id==="chain"){
      const chained=[target];
      for(let j=0;j<Math.min(4,n+1);j++){
        const previous=chained[chained.length-1];
        const next=combatTargets().filter(e=>!chained.includes(e)&&Math.hypot(e.x-previous.x,e.y-previous.y)<125)
          .sort((a,b)=>Math.hypot(a.x-previous.x,a.y-previous.y)-Math.hypot(b.x-previous.x,b.y-previous.y))[0];
        if(!next)break;chained.push(next);
      }
      let previous=drone;
      for(const e of chained){state.weaponFx.push({kind:"arc",x:previous.x,y:previous.y,tx:e.x,ty:e.y,life:.2,maxLife:.2});
        damageTarget(e,1+n*.45);previous=e;}
      state.weaponClocks[id]=Math.max(.6,1.5-n*.12);
    }else if(id==="blades"){
      // The whole swept disc cuts: no gaps between sampled blade tips or at the hub.
      for(const e of combatTargets())if(Math.hypot(e.x-drone.x,e.y-drone.y)<=bladeRadius(n)+e.r)damageTarget(e,.75+n*.3);
      state.weaponClocks[id]=.25;
    }else if(id==="incendiary"){
      state.zones.push({x:target.x,y:target.y,sx:drone.x,sy:drone.y,flight:.65,life:3.8,
        r:48+n*7,damage:.45+n*.25,tick:0,owner:id});
      state.weaponClocks[id]=3.2;
    }else if(id==="ricochet"){
      const angle=Math.atan2(target.y-drone.y,target.x-drone.x);
      state.shots.push({x:drone.x,y:drone.y,vx:Math.cos(angle)*270,vy:Math.sin(angle)*270,life:5,
        damage:.9+n*.45,bounce:true,color:drone.color,owner:id});
      state.weaponClocks[id]=Math.max(1,2.5-n*.2);
    }
    drone.flash=.15;
  }
  for(const z of state.zones){
    if(z.flight>0){z.flight-=dt;continue;}
    z.life-=dt;z.tick-=dt;
    if(z.tick<=0){areaHit(z,z.r,z.damage);z.tick=.4;}
  }
  state.zones=state.zones.filter(z=>z.life>0&&z.x>-z.r&&z.x<W+z.r&&z.y>-z.r&&z.y<H+z.r);
  state.weaponFx=state.weaponFx.map(f=>({...f,life:f.life-dt})).filter(f=>f.life>0);
}
function killEnemy(e, fromBlast=false){if(e.rewarded)return;e.dead=true;e.rewarded=true;state.kills++;state.combo++;state.bestCombo=Math.max(state.bestCombo,state.combo);const gain=Math.ceil((e.elite?14:6)*(1+level("cargo")*.3+level("magnet")*.5)*state.routeModifiers.scrapMultiplier);state.scrap+=gain;state.score+=Math.ceil((e.elite?130:50)*Math.max(1,state.combo)*state.routeModifiers.rewardMultiplier);const xp=progression.awardExperience(state,e.elite?4:1);Object.assign(state,xp.state);let firstDropRoll=true;const coreType=progression.rollCoreDrop({elite:e.elite,combo:state.combo,random:()=>{const value=Math.random();if(firstDropRoll){firstDropRoll=false;return value/Math.max(.01,state.routeModifiers.coreChance)}return value}});if(coreType)state.drops.push({type:coreType,x:e.x,y:e.y,life:8});if(level("volatile")&&!fromBlast){const blast=effects.applyAreaDamage(state.enemies.filter(target=>target!==e),e,balance.KILL_BLAST_RADIUS,balance.KILL_BLAST_DAMAGE);for(const target of blast.defeated)killEnemy(target,true);if(blast.hitCount)burst(e.x,e.y,"#ffb45f",18,100)}state.shake=e.elite?7:3;addText("+"+gain,e.x,e.y-15,"#ffb45f");burst(e.x,e.y,e.elite?"#ffb45f":"#b6e36b",e.elite?26:16,e.elite?125:90);showCombo()}
function scopeLabel(scope){return scope==="main-only"?"主机":scope==="escort-only"?"伴飞":scope==="train-only"?"列车":scope==="team-utility"?"全队":"主机"}
function openLevelUp() {
  if(state.mode==="levelup"||state.pendingLevelUps<=0)return;
  state.mode="levelup";resetJoystick();ui.levelUp.hidden=false;ui.levelUpList.innerHTML="";
  const pool=experiencePool.filter(u=>u.id!=="wingman"||level("wingman")<3).sort(()=>Math.random()-.5);
  // Always offer a distinct trajectory while one remains unlearned.
  const novel=pool.find(u=>u.id!=="rapid"&&u.id!=="wingman"&&!level(u.id));
  const picks=novel?[novel,...pool.filter(u=>u!==novel).slice(0,2)]:pool.slice(0,3);
  picks.forEach(u=>{
    const card=document.createElement("button");card.className="upgrade-card";
    card.dataset.scope=scopeLabel(effects.weaponOwnership(u.id));card.dataset.weapon=u.id;
    card.innerHTML=`<span class="upgrade-icon">${u.icon}</span><span><h3>${u.name} <small>Lv.${level(u.id)+1}</small></h3><p>${u.desc}</p></span>`;
    card.addEventListener("click",()=>chooseLevelUp(u));ui.levelUpList.append(card);
  });
}
function chooseLevelUp(u) {
  state.modules[u.id]=level(u.id)+1;state.pendingLevelUps=Math.max(0,state.pendingLevelUps-1);
  ui.levelUp.hidden=true;state.mode="combat";
  syncSwarm();if(state.pendingLevelUps>0)openLevelUp();else showToast(level(u.id)===1&&u.id!=="rapid"?"新机加入蜂群":"专机武器升级");
  updateHud();
}
function killBoss(){if(!state.boss||state.boss.dead)return;state.boss.dead=true;state.score+=1200;state.scrap+=80;state.shake=15;burst(state.boss.x,state.boss.y,"#ffb45f",60,190);showToast("感染巨兽核心崩解")}
function stationCenter() {
  const distance=state.mode==="docking"?state.docking.offset:
    state.mode==="station"||state.mode==="routeChoice"&&state.docking?0:
    state.station<5&&state.routeDistance<7?WORLD_SPEED*1.2+state.routeDistance*WORLD_SPEED:900;
  return {x:state.train.x+motion.FORWARD.x*distance,y:state.train.y+motion.FORWARD.y*distance};
}
function stationTurrets() {
  const c=stationCenter(),f=motion.FORWARD,n={x:-f.y,y:f.x};
  return [-1,1].flatMap(side=>[-100,60].map(along=>({x:c.x+f.x*along+n.x*side*76,y:c.y+f.y*along+n.y*side*76})));
}
function startDocking(final=false) {
  const offset=final?420:WORLD_SPEED*1.2;
  state.mode="docking";state.docking={time:0,clock:0,offset,startOffset:offset,duration:2*offset/WORLD_SPEED,final};
  state.routeDistance=0;state.timer=0;state.shots=[];state.weaponFx=[];
  state.pendingLevelUps=0;ui.levelUp.hidden=true;resetJoystick();
  showToast("进入车站防区 · 炮台接管");
  updateHud();
}
function updateDocking(dt) {
  const d=state.docking;d.time+=dt;d.clock-=dt;
  const fraction=Math.min(1,d.time/d.duration), previous=d.offset;
  d.offset=d.startOffset*(1-fraction)**2;
  advanceWorld(previous-d.offset);state.visualTime+=dt;updateSwarm(dt);
  for(const z of state.zones){z.flight-=dt;z.life-=dt;}
  state.zones=state.zones.filter(z=>z.life>0);
  state.shake=Math.max(0,state.shake-dt*20);state.hurtFlash=0;
  state.weaponFx=state.weaponFx.map(f=>({...f,life:f.life-dt})).filter(f=>f.life>0);
  for(const e of state.enemies)if(!e.dead) {
    e.delay=0;Object.assign(e,motion.stepChaser(e,dt,state.train,0));
  }
  if(d.time>.5&&d.clock<=0) {
    const turrets=stationTurrets();
    const targets=state.enemies.filter(e=>!e.dead).slice(0,8);
    targets.forEach((e,i)=>{
      const turret=turrets[i%turrets.length];
      state.weaponFx.push({kind:"stationBeam",x:turret.x,y:turret.y,tx:e.x,ty:e.y,life:.24,maxLife:.24});
      e.dead=true;burst(e.x,e.y,"#b8ff4e",10,90);
    });
    d.clock=.16;
  }
  updateParticles(dt);
  if(d.time>=Math.max(3.4,d.duration+.6)&&!state.enemies.some(e=>!e.dead)) {
    if(d.final)finish(true);else arriveStation();
  }
}
function arriveStation() {
  state.mode="station";state.timer=0;state.enemies=[];state.boss=null;state.drops=[];
  ui.bossWrap.hidden=true;
  state.trainHp=Math.min(state.maxTrainHp,state.trainHp+25+level("repair")*18);
  state.shieldReady=!!level("shield");state.selectedUpgrade=null;
  ui.stationScreen.hidden=false;ui.stationTitle.textContent=String(state.station).padStart(2,"0");
  ui.continue.disabled=true;ui.continue.textContent="选择一项免费大升级";
  ui.upgrades.innerHTML="";state.rerollUsed=false;ui.reroll.disabled=state.scrap<15;
  renderUpgradeChoices();renderTrainPreview();updateHud();
}
function renderUpgradeChoices() {
  state.selectedUpgrade=null;ui.continue.disabled=true;ui.continue.textContent="选择一项免费大升级";
  const picks=[...stationUpgradePool].sort(()=>Math.random()-.5).slice(0,3);
  picks.forEach(u=>{
    const card=document.createElement("button");card.className="upgrade-card";card.dataset.type="train";
    card.innerHTML=`<span class="upgrade-icon">${u.icon}</span><span><h3>${u.name} <small>Lv.${level(u.id)+1}</small></h3><p>${u.desc}</p></span>`;
    card.addEventListener("click",()=>{
      state.selectedUpgrade=u;ui.upgrades.querySelectorAll(".upgrade-card").forEach(x=>x.classList.remove("selected"));
      card.classList.add("selected");ui.continue.disabled=false;ui.continue.textContent="装配并发车 →";
    });ui.upgrades.append(card);
  });
}
function renderTrainPreview(){ui.trainLength.textContent=state.trainLength+" 节车厢";ui.miniTrain.innerHTML="";for(let i=0;i<Math.min(7,state.trainLength+1);i++){const car=document.createElement("i");car.className="mini-car"+(i===0?" mini-car--cab":"");car.textContent=i===0?"◆":i%2?"▦":"▤";ui.miniTrain.append(car)}}
function continueRun() {
  const u=state.selectedUpgrade;if(!u||state.mode!=="station")return;
  state.modules[u.id]=level(u.id)+1;
  if(u.id==="armor"){state.maxTrainHp+=35;state.trainHp=Math.min(state.maxTrainHp,state.trainHp+35);}
  if(u.id==="cargo")state.trainLength++;
  if(u.id==="shield")state.shieldReady=true;
  state.station++;state.selectedUpgrade=null;ui.stationScreen.hidden=true;openRouteEvent();
}
function openRouteEvent(){const choices=routeEvents.pickRouteEvents(state.runSeed,state.station);if(!choices.length){beginRoute(null);return}state.mode="routeChoice";state.eventChoices=choices;ui.eventList.innerHTML="";ui.eventScreen.hidden=false;choices.forEach(event=>{const card=document.createElement("button");card.className="upgrade-card event-card";card.dataset.type=event.weather;card.innerHTML='<span class="upgrade-icon">'+(event.weather==="dust"?"≈":event.weather==="speed"?"»":"▣")+"</span><span><h3>"+event.name+"</h3><p>"+event.description+"</p></span>";card.addEventListener("click",()=>{ui.eventScreen.hidden=true;beginRoute(event)});ui.eventList.append(card)})}
function openContractChoice(){const choices=routeEvents.pickContracts(state.runSeed);if(!choices.length){state.activeContract=routeEvents.CONTRACTS?.[0]||null;openRouteEvent();return}state.mode="contractChoice";state.contractChoices=choices;ui.contractList.innerHTML="";ui.contractScreen.hidden=false;choices.forEach(contract=>{const card=document.createElement("button");card.className="upgrade-card event-card";card.dataset.type="contract";card.innerHTML='<span class="upgrade-icon">◆</span><span><h3>'+contract.name+"</h3><p>"+contract.description+"</p></span>";card.addEventListener("click",()=>{state.activeContract=contract;ui.contractScreen.hidden=true;openRouteEvent()});ui.contractList.append(card)})}
function beginRoute(event) {
  state.activeEvent=event||routeEvents.ROUTE_EVENTS?.[0]||null;
  state.routeModifiers=routeEvents.applyRouteModifiers({routeDistance:balance.routeDuration(state.station),enemySpeed:1,enemyHp:1,eliteChance:1,coreChance:1,rewardMultiplier:1,scrapMultiplier:1},state.activeEvent,state.activeContract);
  state.mode="combat";state.routeElapsed=0;state.docking=null;
  state.routeDistanceTotal=state.routeModifiers.routeDistance;state.routeDistance=state.routeDistanceTotal;
  state.timer=state.routeDistance;state.enemies=[];state.shots=[];state.zones=[];state.weaponFx=[];
  state.spawnClock=balance.spawnInterval(state.station);state.fireClock=0;state.shieldReady=!!level("shield");
  syncSwarm();spawnWave();showToast(state.station===1?"稀疏尸群 · 先积累火力":state.activeEvent?.name||"模块在线");updateHud();
}
function rerollUpgrades(){if(state.rerollUsed||state.scrap<15||state.mode!=="station")return;state.scrap-=15;state.rerollUsed=true;ui.reroll.disabled=true;ui.upgrades.innerHTML="";renderUpgradeChoices();showToast("补给重新编排");updateHud()}
function pulse(){if(state.mode!=="combat"||state.paused||state.pulseClock>0)return;state.pulseClock=Math.max(3.8,7-level("overclock")*1.4);state.shake=12;state.enemies.forEach(e=>{if(!e.dead&&Math.hypot(e.x-state.train.x,e.y-state.train.y)<190){e.hp-=4.5;burst(e.x,e.y,"#5de1df",10,100);if(e.hp<=0)killEnemy(e)}});if(state.boss&&Math.hypot(state.boss.x-state.train.x,state.boss.y-state.train.y)<220){state.boss.hp-=8;state.boss.hit=1;if(state.boss.hp<=0)killBoss()}burst(state.train.x,state.train.y,"#5de1df",34,170);showToast("电磁脉冲")}
function finish(win){state.mode="result";state.outcome=win?"won":"lost";state.record=runRecord.mergeRecord(state.record,runRecord.buildRunSummary(state));runRecord.saveRecord(typeof localStorage!=="undefined"?localStorage:null,state.record);ui.result.hidden=false;$("resultBadge").textContent=win?"◆":"×";$("resultEyebrow").textContent=win?"护送完成":"列车失守";$("resultTitle").textContent=win?"列车穿过了黑夜":"铁轨被荒原吞没";$("resultCopy").textContent=win?"你让最后一班车抵达了安全区。":"再多一架无人机，也许就能撑过下一站。";$("resultKills").textContent=state.kills;$("resultStations").textContent=Math.min(state.station,5);$("resultScrap").textContent=state.scrap;ui.resultBuild.textContent="构筑："+Object.keys(state.modules).filter(id=>level(id)>0).join(" · ")+" / 核心："+Object.keys(state.coreStacks).filter(id=>state.coreStacks[id]>0).join(" · ");ui.resultRecord.textContent="最佳："+state.record.bestStations+" 站 · "+state.record.bestCombo+" 连杀"}
function updateHud(){syncJoystick();ui.station.textContent=String(Math.min(state.station,5)).padStart(2,"0")+" / 05";ui.scrap.textContent=String(state.scrap).padStart(3,"0");ui.health.textContent=Math.ceil(state.trainHp)+"/"+state.maxTrainHp;ui.healthFill.style.width=Math.min(100,Math.max(0,state.trainHp/state.maxTrainHp*100))+"%";ui.timer.textContent=Math.max(0,state.timer).toFixed(1);ui.phase.textContent=state.paused?"暂停中":state.mode==="combat"?"行驶中":state.mode==="levelup"?"战斗升级":state.mode==="routeChoice"?"路线选择":state.mode==="contractChoice"?"远征契约":state.mode==="docking"?"进站清场":state.mode==="station"?"安全停靠":"待命";$("moveSpeedValue").textContent=state.drone.moveSpeed+" px/s";ui.drone.textContent=(1+effects.swarmRoster(state.modules).length)+" 架";ui.pulseCooldown.style.height=state.pulseClock?state.pulseClock/7*100+"%":"0%";ui.pulse.classList.toggle("cooling",state.pulseClock>0);ui.objective.textContent=state.mode==="docking"?"防卫炮台清场 · 列车减速进站":state.mode==="station"?"安全区 · 列车已停稳":state.station===5?"击破感染巨兽，护送列车":"护送列车抵达下一站";ui.routeLabel.textContent=state.mode==="docking"||state.mode==="station"?"车站防区 · 安全停靠":"距下一站 "+Math.max(0,state.routeDistance).toFixed(1)+" s";ui.routeFill.style.width=Math.max(0,state.routeDistance/state.routeDistanceTotal*100)+"%";ui.xpLabel.textContent="Lv."+state.level+" · "+Math.floor(state.experience)+" / "+state.experienceToNext;ui.xpFill.style.width=Math.min(100,state.experience/state.experienceToNext*100)+"%";if(state.boss){ui.bossText.textContent=Math.max(0,Math.ceil(state.boss.hp/state.boss.maxHp*100))+"%";ui.bossFill.style.width=Math.max(0,state.boss.hp/state.boss.maxHp*100)+"%"}}
function showCombo(){if(state.combo<2||state.visualTime<(state.comboFxAt??-1))return;state.comboFxAt=state.visualTime+.15;ui.combo.textContent="连杀 ×"+state.combo;ui.combo.classList.remove("show");void ui.combo.offsetWidth;ui.combo.classList.add("show")}
function showToast(text){ui.toast.textContent=text;ui.toast.classList.remove("show");void ui.toast.offsetWidth;ui.toast.classList.add("show")}
function addText(text,x,y,color){if(state.texts.length>=24)return;state.texts.push({text,x,y,color,life:1})}function updateParticles(dt){for(const p of state.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.98;p.vy*=.98}state.particles=state.particles.filter(p=>p.life>0);for(const t of state.texts){t.life-=dt;t.y-=24*dt}state.texts=state.texts.filter(t=>t.life>0)}function burst(x,y,color,count,speed){const available=Math.min(count,420-state.particles.length);for(let i=0;i<available;i++){const a=Math.random()*TAU,v=speed*(.35+Math.random()*.65);state.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,size:2+Math.random()*4,life:.25+Math.random()*.45,color})}}
function draw(){ctx.save();if(state.shake&&!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)ctx.translate((Math.random()-.5)*state.shake,(Math.random()-.5)*state.shake);drawBackground();drawRails();drawStation();drawZones();drawTrain();drawDrops();drawEnemies();drawBoss();drawShots();drawDrone();drawWeaponEffects();drawCommandRing();drawParticles();ctx.restore();if(state.hurtFlash){ctx.fillStyle=`rgba(241,109,99,${state.hurtFlash*.18})`;ctx.fillRect(0,0,W,H)}}
function drawDrops(){for(const drop of state.drops){const pulse=1+Math.sin(performance.now()/140)*.14;ctx.save();ctx.translate(drop.x,drop.y);ctx.rotate(Math.PI/4);ctx.scale(pulse,pulse);ctx.fillStyle=drop.type==="overdrive"?"#ffb45f":drop.type==="scatter"?"#b6e36b":"#5de1df";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=14;ctx.fillRect(-8,-8,16,16);ctx.restore();ctx.strokeStyle="rgba(237,245,231,.55)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(drop.x,drop.y,14,0,TAU*(drop.life/8));ctx.stroke()}}

function drawParticles(){for(const p of state.particles){ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size)}ctx.globalAlpha=1;ctx.font="bold 12px ui-monospace,monospace";ctx.textAlign="center";for(const t of state.texts){ctx.globalAlpha=Math.min(1,t.life*2);ctx.fillStyle=t.color;ctx.fillText(t.text,t.x,t.y)}ctx.globalAlpha=1}

function carPosition(i){const {x:fx,y:fy}=motion.FORWARD;return{x:state.train.x-fx*i*balance.CAR_SPACING,y:state.train.y-fy*i*balance.CAR_SPACING}}
function droneBounds(){return{left:24,right:W-24,top:24,bottom:H-24}}
function setCommand(vector) {
  if (!canUseJoystick()) return;
  state.moveInput = { x: vector.x, y: vector.y };
  if (vector.strength) ui.hint.style.opacity = 0;
}
const joystickBase = $("joystickBase"), joystickThumb = $("joystickThumb");
const joystickState = { pointerId: null, center: null, radius: 0, keys: new Set() };
const joystickKeys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
function canUseJoystick() { return state.mode === "combat" && !state.paused; }
function resetJoystick() {
  const pointerId = joystickState.pointerId;
  joystickState.pointerId = null;
  joystickState.center = null;
  joystickState.keys.clear();
  state.moveInput = { x: 0, y: 0 };
  joystickBase.hidden = true;
  joystickThumb.style.transform = "translate(0px, 0px)";
  joystickBase.classList.remove("active");
  if (pointerId !== null && canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
}
function syncJoystick() {
  const enabled = canUseJoystick();
  canvas.setAttribute?.("aria-disabled", String(!enabled));
  ui.pulse.disabled = !enabled;
  if (!enabled) resetJoystick();
}
function showJoystickVector(vector, radius) {
  joystickThumb.style.transform = "translate(" + vector.x * radius + "px, " + vector.y * radius + "px)";
  joystickBase.classList.add("active");
  setCommand(vector);
}
function moveJoystick(event) {
  if (event.pointerId !== joystickState.pointerId) return;
  if (!canUseJoystick()) { resetJoystick(); return; }
  event.preventDefault();
  const vector = control.joystickVector({ x: event.clientX, y: event.clientY }, joystickState.center, joystickState.radius);
  showJoystickVector(vector, joystickState.radius);
}
canvas.addEventListener("pointerdown", event => {
  if (!canUseJoystick() || joystickState.pointerId !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
  event.preventDefault();
  joystickState.keys.clear();
  const rect = canvas.getBoundingClientRect();
  joystickState.center = { x: event.clientX, y: event.clientY };
  joystickState.radius = 36;
  joystickBase.style.left = (event.clientX - rect.left) + "px";
  joystickBase.style.top = (event.clientY - rect.top) + "px";
  joystickBase.hidden = false;
  canvas.focus?.({ preventScroll: true });
  joystickState.pointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  moveJoystick(event);
});
canvas.addEventListener("pointermove", moveJoystick);
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(type, event => {
  if (event.pointerId === joystickState.pointerId) resetJoystick();
});
function moveKeyboardJoystick() {
  let x = 0, y = 0;
  for (const key of joystickState.keys) { x += joystickKeys[key][0]; y += joystickKeys[key][1]; }
  const vector = control.joystickVector({ x, y }, { x: 0, y: 0 }, 1, 0);
  setCommand(vector);
}
window.addEventListener("keydown", event => {
  if (!joystickKeys[event.code] || !canUseJoystick() || joystickState.pointerId !== null) return;
  event.preventDefault();
  joystickState.keys.add(event.code);
  moveKeyboardJoystick();
});
window.addEventListener("keyup", event => {
  if (!joystickKeys[event.code] || !joystickState.keys.has(event.code)) return;
  event.preventDefault();
  joystickState.keys.delete(event.code);
  if (!canUseJoystick()) resetJoystick(); else moveKeyboardJoystick();
});
window.addEventListener("blur", resetJoystick);
window.addEventListener("resize", resetJoystick);
document.addEventListener?.("visibilitychange", () => { if (document.hidden) resetJoystick(); });
function drawCommandRing(){const ring=state.commandRing;if(!ring)return;const alpha=Math.min(1,ring.life/.45);ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle="#5de1df";ctx.lineWidth=2;ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(ring.target.x,ring.target.y,17+(1-alpha)*13,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(ring.target.x-6,ring.target.y);ctx.lineTo(ring.target.x+6,ring.target.y);ctx.moveTo(ring.target.x,ring.target.y-6);ctx.lineTo(ring.target.x,ring.target.y+6);ctx.stroke();ctx.restore()}
function togglePause(){if(state.mode!=="combat")return;state.paused=!state.paused;ui.pause.textContent=state.paused?"▶":"Ⅱ";ui.pause.setAttribute?.("aria-label",state.paused?"继续游戏":"暂停游戏");updateHud()}
ui.pulse.addEventListener("click",pulse);ui.pause.addEventListener("click",togglePause);ui.reroll.addEventListener("click",rerollUpgrades);$("startButton").addEventListener("click",resetRun);$("restartButton").addEventListener("click",resetRun);ui.continue.addEventListener("click",continueRun);window.addEventListener("keydown",e=>{if(e.code==="Space"){e.preventDefault();pulse()}if(e.code==="KeyP"){togglePause()}});let last=performance.now();function frame(now){const dt=Math.min(.033,(now-last)/1000);last=now;update(dt);draw();requestAnimationFrame(frame)}updateHud();requestAnimationFrame(frame);
