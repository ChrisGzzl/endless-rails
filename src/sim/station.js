"use strict";

import "../core/combat-effects.js";

// Station tables are built while this module evaluates, before game.js runs,
// so the combat-effects API is read from window (core modules load first).
const effectsApi = window.EndlessRailsCombatEffects;

function scopeLabel(scope){return scope==="main-only"?"主机":scope==="escort-only"?"伴飞":scope==="train-only"?"列车":scope==="team-utility"?"全队":"主机"}
const upgradeBrief={blades:"近战持续切割",incendiary:"燃烧区域封锁",ricochet:"弹跳贯穿尸潮",rapid:"机枪射速提升",scatter:"近程扇形霰弹",piercing:"远程直线贯穿",chain:"连锁电弧",missile:"远程追踪爆破",wingman:"增派机枪僚机"};
const upgradeFamily={rapid:"blue",wingman:"blue",piercing:"blue",missile:"red",incendiary:"red",chain:"purple",ricochet:"purple",blades:"cyan",scatter:"cyan"};
const upgradePool=[
 {id:"volatile",type:"train",icon:"✹",name:"连锁爆破协议",desc:"击破敌人引发范围爆炸，适合清理尸群。",cost:0},
 {id:"rapid",type:"drone",icon:"ϟ",name:"脉冲机枪",desc:"射速提升 28%。",cost:28},{id:"missile",type:"drone",icon:"➤",name:"追踪导弹",desc:"每轮发射一枚高伤导弹。",cost:38},{id:"scatter",type:"drone",icon:"✣",name:"裂片散射",desc:"每次射击额外释放两枚碎弹。",cost:44},{id:"tesla",type:"drone",icon:"∿",name:"电弧线圈",desc:"命中后跳电附近目标。",cost:52},{id:"wingman",type:"drone",icon:"◇",name:"伴飞无人机",desc:"增加一架伴飞机，火力 +45%。",cost:64},{id:"overclock",type:"drone",icon:"◎",name:"过载核心",desc:"脉冲冷却时间缩短 30%。",cost:58},
 {id:"armor",type:"train",icon:"⬢",name:"装甲铆接",desc:"最大完整度 +35，撞击伤害降低。",cost:42},{id:"railgun",type:"train",icon:"⌁",name:"车头磁轨炮",desc:"列车向前方周期性发射穿透弹。",cost:46},{id:"cargo",type:"train",icon:"▣",name:"货运舱",desc:"车厢 +1，击破废料收益 +30%。",cost:48},{id:"repair",type:"train",icon:"+",name:"维修车",desc:"每到站额外修复 18 点完整度。",cost:50},{id:"shield",type:"train",icon:"◈",name:"偏转护盾",desc:"每轮抵挡第一次撞击。",cost:55},{id:"magnet",type:"train",icon:"⊕",name:"废料磁吸",desc:"废料收益 +50%，并吸引远处掉落。",cost:60}];
const experiencePool=[
 {id:"blades",icon:"✺",name:effectsApi.droneLabel("blades"),desc:"大范围持续切割，主动靠近尸群；升级扩大刀环。"},
 {id:"incendiary",icon:"♨",name:effectsApi.droneLabel("incendiary"),desc:"专机投掷榴弹；北辰移动方向会牵引落点，主动铺设火墙。"},
 {id:"ricochet",icon:"◉",name:effectsApi.droneLabel("ricochet"),desc:"中程低频能量球，反弹并贯穿尸群。"},
 {id:"rapid",icon:"ϟ",name:effectsApi.droneLabel("rapid"),desc:"升级雨燕的近程机枪，提高射速与单弹伤害。"},{id:"scatter",icon:"✣",name:effectsApi.droneLabel("scatter"),desc:"近程扇形霰弹，贴近尸群集中清扫。"},{id:"piercing",icon:"↠",name:effectsApi.droneLabel("piercing"),desc:"远程低频磁轨弹；主动调整角度让更多敌人排成一线可提高伤害。"},{id:"chain",icon:"∿",name:effectsApi.droneLabel("chain"),desc:"中程中频电弧；靠近密集尸潮时连锁伤害提高。"},{id:"missile",icon:"➤",name:effectsApi.droneLabel("missile"),desc:"远程低频追踪弹，高伤爆炸清理尸群。"},{id:"wingman",icon:"◇",name:effectsApi.droneLabel("wingman"),desc:"增派一架雨燕僚机，独立机枪支援，最多三架。"}];
const stationUpgradePool=upgradePool.filter(u=>u.type==="train"&&!["cargo","railgun","magnet"].includes(u.id));

export { upgradePool, experiencePool, stationUpgradePool, scopeLabel, upgradeBrief, upgradeFamily };
