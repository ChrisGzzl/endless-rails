"use strict";
// Fleet telemetry rows for the pause screen, extracted verbatim from the DOM
// armory module so the canvas host can render the same terminal without any
// document. All row content ([label, value] pairs) is computed from engine
// state; presentation stays with the caller.
import { state, level, effects, applyResearchProfile, upgradePool, experiencePool } from "./engine.js";

const numberText = value => Number.isFinite(value) ? Number(value.toFixed(2)).toString() : "—";
const withUnit = (value, unit) => numberText(value) + " " + unit;

function inspectFleet() {
  return [{ id: "command", ...effects.droneIdentity("command"), level: 1, owned: true }, ...effects.DRONE_TYPES.map(type => {
    const n = effects.droneLevel(state.modules, type.id);
    return { ...type, owned: n > 0, level: Math.max(1, n) };
  }), ...state.swarm.filter(d => d.id.startsWith("escort")).map(d => ({ ...d, owned: true }))];
}

function weaponRows(p) {
  const rows = [
    [p.kind === "incendiary" ? "每跳燃烧伤害" : "单次 / 单弹伤害", numberText(p.damage)],
    [p.kind === "blades" ? "切割半径" : "锁定射程", withUnit(p.range, "px")],
    ["攻击间隔", withUnit(p.interval, "s")],
    ["攻击频率", withUnit(p.frequency, "轮/s")],
    ["单目标理论秒伤", numberText(p.singleTargetDps)],
  ];
  if (p.speed) rows.push(["弹速", withUnit(p.speed, "px/s")], ["最长飞行时间", withUnit(p.life, "s")]);
  if (["gun", "escort", "scatter", "piercing"].includes(p.kind)) rows.push(["每轮弹数", p.projectileCount], ["单弹命中上限", p.pierce + 1], ["弹幕夹角", withUnit((p.projectileCount - 1) * p.spread * 180 / Math.PI, "°")]);
  if (p.kind === "missile") rows.push(["爆炸半径", withUnit(p.radius, "px")], ["爆炸目标数", "范围内全部"], ["追踪转速", withUnit(p.turnRate * 180 / Math.PI, "°/s")]);
  if (p.kind === "chain") rows.push(["连锁目标上限", p.targets], ["每跳距离", withUnit(p.chainRange, "px")], ["连锁伤害衰减", "无"]);
  if (p.kind === "incendiary") rows.push(["火区半径", withUnit(p.radius, "px")], ["燃烧持续", withUnit(p.duration, "s")], ["伤害跳频", withUnit(p.tick, "s")], ["榴弹落地时间", withUnit(p.flight, "s")], ["火区目标数", "范围内全部"]);
  if (p.kind === "ricochet") rows.push(["反弹上限", p.bounces], ["贯穿目标数", "路径内全部"], ["重复伤害条件", "反弹后可重击"]);
  if (p.kind === "blades") rows.push(["旋转刀刃数", p.blades], ["切割目标数", "范围内全部"], ["出击偏移上限", "70 px"], ["归队阈值", "115 px"]);
  if (p.kind === "gun") rows.push(["额外核心弹数", Math.max(0, p.projectileCount - 1)], ["核心跳电", p.coreArc ? "每 4 次弹击触发" : "未激活"], ["核心跳电倍率", p.coreArc ? "65%" : "—"]);
  if (!["command", "escort"].includes(p.kind)) rows.push(["Lv.10 突破", p.breakthrough ? "已突破 · 新机体与普攻皮肤" : "未突破"], ["突破加成", p.breakthrough ? "伤害 +35% · 范围 +25%（上方已计入）" : "达到 Lv.10 后生效"]);
  return rows;
}

function inspectBondRows() {
  return effects.bondStates(state.modules).flatMap(b => {
    const stats = state.bondStats[b.id] || { damage: 0, kills: 0, casts: 0 }, p = b.active ? effects.bondProfile(b.id, b.level) : null;
    const rows = [[b.name, b.active ? "Lv." + b.level : "未激活"], ["配对要求", b.pair.map((id, i) => effects.droneIdentity(id).name + " Lv." + b.levels[i] + "/5").join(" + ")]];
    if (p) {
      rows.push(["效果", b.description], ["触发频率", "北辰每次普攻"], ["单次伤害", numberText(p.damage)], ["射程", withUnit(p.range, "px")]);
      if (b.id === "red") rows.push(["燃烧半径", withUnit(p.radius, "px")], ["每跳燃烧", numberText(p.burnDamage)], ["燃烧持续/跳频", p.duration + " s / " + p.tick + " s"]);
      if (b.id === "purple") rows.push(["电弧半径", withUnit(p.arcRadius, "px")], ["电弧伤害/跳频", numberText(p.arcDamage) + " / " + p.arcInterval + " s"]);
    }
    rows.push(["羁绊有效伤害", numberText(stats.damage)], ["羁绊击杀/释放", stats.kills + " / " + stats.casts]);
    return rows;
  });
}

function levelInCores(id) { return state.coreStacks[id] || 0; }

function inspectRows(unit, tab) {
  const p = applyResearchProfile(unit.id, effects.weaponProfile(unit.id, unit.level, state.coreStacks));
  const drone = unit.id === "command" ? state.drone : state.swarm.find(d => d.id === unit.id);
  if (tab === "global") {
    const train = effects.trainWeaponProfile({ modules: state.modules });
    const rows = [["列车完整度", numberText(state.trainHp) + " / " + state.maxTrainHp], ["车厢", state.trainLength], ["本局击杀", state.kills], ["最高连杀", state.bestCombo], ["废料", state.scrap],
    ["车炮伤害", numberText(train.railgunDamage)], ["车炮间隔", withUnit(train.railgunInterval, "s")], ["脉冲冷却剩余", withUnit(state.pulseClock, "s")], ["脉冲间隔", withUnit(Math.max(3.8, 7 - level("overclock") * 1.4), "s")],
    ["怪物血量倍率", numberText(state.routeModifiers.enemyHp) + "×"], ["怪物移速倍率", numberText(state.routeModifiers.enemySpeed) + "×"], ["废料收益倍率", numberText(state.routeModifiers.scrapMultiplier) + "×"]];
    const names = Object.fromEntries([...upgradePool, ...experiencePool].map(u => [u.id, u.name]));
    for (const [id, n] of Object.entries(state.modules)) if (n > 0) rows.push([names[id] || id, "Lv." + n]);
    for (const [id, label] of [["overdrive", "过载核心"], ["scatter", "裂片核心"], ["arc", "电弧核心"]]) rows.push([label, levelInCores(id) + " 层"]);
    return rows;
  }
  if (tab === "status") {
    const stats = state.weaponStats[unit.id] || { damage: 0, kills: 0, volleys: 0 };
    const facing = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
    const rows = [["部署状态", unit.owned ? "已部署" : "未解锁"], ["武器等级", p ? "Lv." + unit.level : "无武器"],
    ["行动状态", !drone ? "未部署" : unit.id === "command" ? "玩家控制" : ({ patrol: "编队巡航", engage: "自主接敌", return: "返回编队" }[drone.behavior] || "编队集结")],
    ["冷却剩余", unit.owned && p ? withUnit(Math.max(0, state.weaponClocks[unit.id] || 0), "s") : "—"],
    ["累计有效伤害", numberText(stats.damage)], ["直接击杀", stats.kills], ["攻击轮数", stats.volleys],
    ["当前移速", drone ? withUnit(Math.hypot(drone.vx || 0, drone.vy || 0), "px/s") : "—"], ["最大移速", withUnit(unit.id === "command" ? state.drone.moveSpeed : 240, "px/s")],
    ["朝向", drone ? facing[drone.direction || 0] : "—"], ["战场位置", drone ? numberText(drone.x) + ", " + numberText(drone.y) : "—"], ["机体耐久", "敌人只攻击列车"]];
    return unit.id === "command" ? [...rows, ...inspectBondRows()] : rows;
  }
  if (tab === "upgrade") {
    if (!unit.owned) return weaponRows(p);
    if (unit.id === "command") return [["羁绊升级", "配对双方 Lv.5 激活，每升一级技能 +1"], ...inspectBondRows()];
    if (unit.id.startsWith("escort")) return [["僚机强化方式", "增加数量"], ["每架武器", "独立机枪"], ["数量上限", "3 架"], ["已部署", level("wingman") + " 架"]];
    const next = applyResearchProfile(unit.id, effects.weaponProfile(unit.id, unit.level + 1, state.coreStacks)), before = weaponRows(p), after = new Map(weaponRows(next));
    return before.filter(([label, value]) => String(value) !== String(after.get(label))).map(([label, value]) => [label, String(value) + " → " + after.get(label)]);
  }
  return unit.id === "command" ? [...weaponRows(p), ...inspectBondRows()] : weaponRows(p);
}

function tabNote(tab, unit) {
  const p = applyResearchProfile(unit.id, effects.weaponProfile(unit.id, unit.level, state.coreStacks));
  const notes = {
    weapon: "射程计至敌人边缘；秒伤按单目标持续命中估算，不含范围、连锁及核心额外收益。",
    status: "战斗已冻结。有效伤害不含溢出伤害；直接击杀不含列车、脉冲与连锁爆破协议的击杀。",
    upgrade: unit.owned ? "预览下一级实际变化，核心加成已计入。此处只查看，升级仍需获得经验。" : "未解锁机型显示 Lv.1 基础属性，可在战斗升级时选择部署。",
    global: "列车属性、已选模块和核心层数；数据较多时点击下方箭头翻页。",
  };
  return notes[tab] + (p?.kind === "missile" ? " 导弹会持续追踪目标。" : p?.kind === "ricochet" ? " 能量球受寿命和反弹次数限制。" : p?.kind === "incendiary" ? " 火区留在地面，不跟随飞机。" : "");
}

function pauseSummaryText() {
  return `第 ${state.station} 站 · Lv.${state.level} · ${state.swarm.length + 1} 架 · 列车 ${Math.ceil(state.trainHp)}/${state.maxTrainHp}`;
}

export { numberText, withUnit, inspectFleet, weaponRows, inspectBondRows, inspectRows, tabNote, pauseSummaryText };
