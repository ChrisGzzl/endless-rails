"use strict";
(() => {

const STORAGE_KEY = "endless-rails-v09-meta";
const BACKUP_KEY = "endless-rails-v09-meta-backup-v1";
let qaStorage;
// Regression runs use disposable memory storage, without touching player progress.
function gameStorage(host) {
  if (host?.location?.search && new URLSearchParams(host.location.search).get("qa") === "1") {
    if(qaStorage)return qaStorage;
    const values = new Map();
    return qaStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  }
  try { const raw=host?.localStorage || (typeof localStorage !== "undefined" ? localStorage : null);
    if(!raw)return null;
    return {getItem:key=>(host?.EndlessRailsCloudStorage||raw).getItem(key),setItem:(key,value)=>(host?.EndlessRailsCloudStorage||raw).setItem(key,value)}; } catch { return null; }
}
const MAX_TRAIN_LEVEL = 30;
const MAX_RESEARCH_LEVEL = 30;
const SAVE_VERSION = 2;
const MAX_SETTLED_RUN_IDS = 256; // Bounded by the development save service's 32 KiB payload.

const CAR_DEFS = Object.freeze([
  { id: "hangar", name: "无人机机库", icon: "◇", fixed: true, description: "远征核心车厢；管理无人机与长期研究。" },
  { id: "pointDefense", name: "近防车厢", icon: "⌁", description: "自动拦截贴近列车的目标，提供最后一道防线。" },
  { id: "storage", name: "仓储车厢", icon: "▣", description: "远征失败时额外保留风险资源。" },
  { id: "radar", name: "雷达车厢", icon: "◎", description: "扩大拾取半径，并提高研究数据结算收益。" },
  { id: "repair", name: "维修车厢", icon: "+", description: "每次安全停靠时提供额外维修。" },
]);
const CAR_UNLOCK_NODE = Object.freeze({ pointDefense: "N0", repair: "R0", radar: "D0", storage: "C0" });

const REGIONS = Object.freeze([
  { id: "wasteland", name: "起始荒原", statusText: "低危铁路", description: "开阔荒原，适合验证列车与无人机编组。", enemyHp: .94, density: .92, elite: .85, reward: 1, next: ["ruins"], blueprintPool: ["radar-pulse", "rail-lens", "arc-resonator"] },
  { id: "ruins", name: "废墟城市", statusText: "中危城区", description: "街区尸潮开始从多个方向压迫列车。", enemyHp: 1.05, density: 1.08, elite: 1.08, reward: 1.16, next: ["industrial", "infection"], blueprintPool: ["rail-lens", "arc-resonator", "missile-guidance"] },
  { id: "industrial", name: "工业区", statusText: "高危工厂", description: "重型感染者与技术组件产出更高。", enemyHp: 1.14, density: 1.18, elite: 1.25, reward: 1.34, next: [], blueprintPool: ["missile-guidance", "incendiary-gel", "ricochet-prism"] },
  { id: "infection", name: "感染区", statusText: "高危巢域", description: "高密度尸潮与变异体，研究数据收益最高。", enemyHp: 1.22, density: 1.30, elite: 1.42, reward: 1.52, next: [], blueprintPool: ["ricochet-prism", "arc-resonator", "incendiary-gel"] },
]);

// v0.10.0 §21: stat-overlapping blueprints are retired into collection entries
// with a one-time research-resource compensation. Intel and Lv.10 breakthrough
// enhancers stay active. Compensation is a first-pass baseline, see worklog #12.
const BLUEPRINT_COMPENSATION = Object.freeze({ scrap: 90, components: 6, data: 30 });
const BLUEPRINTS = Object.freeze([
  { id: "pd-array", name: "近防阵列校准", kind: "car", description: "已并入近防天赋研究，转化为一次性研究资源补偿。", retired: true },
  { id: "swift-feed", name: "雨燕高速供弹", kind: "drone", description: "已并入火控算法研究，转化为一次性研究资源补偿。", retired: true },
  { id: "field-repair", name: "荒原抢修规程", kind: "car", description: "已并入维修车厢天赋，转化为一次性研究资源补偿。", retired: true },
  { id: "radar-pulse", name: "宽域雷达脉冲", kind: "car", description: "雷达可显示更完整的路线风险提示。" },
  { id: "rail-lens", name: "白虹聚束透镜", kind: "drone", description: "白虹 Lv.10 聚束磁轨额外 +1 贯穿。" },
  { id: "arc-resonator", name: "惊蛰共振器", kind: "drone", description: "惊蛰 Lv.10 后连锁目标额外 +1。" },
  { id: "cargo-lock", name: "抗冲击货柜锁", kind: "car", description: "已并入仓储车厢天赋，转化为一次性研究资源补偿。", retired: true },
  { id: "missile-guidance", name: "天隼终端制导", kind: "drone", description: "天隼 Lv.10 后爆炸范围额外提高。" },
  { id: "incendiary-gel", name: "烛龙凝胶燃料", kind: "drone", description: "烛龙 Lv.10 后燃烧区域额外扩大。" },
  { id: "bio-scan", name: "感染体谱系扫描", kind: "research", description: "已并入雷达车厢天赋，转化为一次性研究资源补偿。", retired: true },
  { id: "ricochet-prism", name: "回响折跃棱镜", kind: "drone", description: "回响 Lv.10 后额外 +1 次弹跳。" },
  { id: "chain-overload", name: "电弧过载协议", kind: "drone", description: "已并入火控算法研究，转化为一次性研究资源补偿。", retired: true },
]);

// ---------------------------------------------------------------------------
// v0.10 talent tree (需求 §7-§12). Node cost is per level; branch caps count
// every purchased level of every node in the branch, including the spec node.
// ---------------------------------------------------------------------------

const TALENT_BRANCHES = Object.freeze([
  { id: "hull", name: "车体", cap: 24, car: null },
  { id: "pointDefense", name: "近防", cap: 24, car: "pointDefense" },
  { id: "repair", name: "维修", cap: 22, car: "repair" },
  { id: "radar", name: "雷达", cap: 20, car: "radar" },
  { id: "storage", name: "仓储", cap: 20, car: "storage" },
]);

const TALENT_NODES = Object.freeze([
  { id: "H1", branch: "hull", name: "车架强化", levels: 3, cost: 1, trainLevel: 1, prereq: null, effect: lv => `最大耐久 +${lv * 4}%` },
  { id: "H2", branch: "hull", name: "冲击缓冲", levels: 3, cost: 2, trainLevel: 5, prereq: { id: "H1", level: 1 }, effect: lv => `列车受到的直接攻击伤害 -${lv * 3}%` },
  { id: "H3", branch: "hull", name: "结构加固", levels: 2, cost: 2, trainLevel: 8, prereq: { id: "H1", level: 3 }, effect: lv => `最大耐久 +${lv * 6}%` },
  { id: "H4", branch: "hull", name: "维修接口", levels: 2, cost: 3, trainLevel: 12, prereq: { id: "H3", level: 2 }, effect: lv => `基础到站维修量 +${lv * 5}%` },
  { id: "H5", branch: "hull", name: "车体专精", levels: 1, cost: 5, trainLevel: 20, prereq: { branchPoints: 19 }, spec: "hull", effect: () => `选择移动堡垒或应急储备` },
  { id: "N0", branch: "pointDefense", name: "解锁近防车", levels: 1, cost: 1, trainLevel: 1, prereq: null, effect: () => `可装备近防车；经验拾取无加成` },
  { id: "N1", branch: "pointDefense", name: "射界扩张", levels: 3, cost: 1, trainLevel: 3, prereq: { id: "N0", level: 1 }, effect: lv => `近防射程 +${lv * 8}%` },
  { id: "N2", branch: "pointDefense", name: "连续供弹", levels: 3, cost: 2, trainLevel: 5, prereq: { id: "N0", level: 1 }, effect: lv => `近防攻击间隔 -${lv * 5}%` },
  { id: "N3", branch: "pointDefense", name: "弹药强化", levels: 2, cost: 2, trainLevel: 8, prereq: { id: "N2", level: 1 }, effect: lv => `近防伤害 +${lv * 10}%` },
  { id: "N4", branch: "pointDefense", name: "近防专精", levels: 1, cost: 4, trainLevel: 12, prereq: { branchPoints: 14 }, spec: "pointDefense", effect: () => `选择拦截阵列或重型近防` },
  { id: "N5", branch: "pointDefense", name: "火力校准", levels: 3, cost: 2, trainLevel: 20, prereq: { id: "N4", level: 1 }, effect: lv => `近防伤害 +${lv * 5}%` },
  { id: "R0", branch: "repair", name: "解锁维修车", levels: 1, cost: 1, trainLevel: 3, prereq: null, effect: () => `可装备维修车；每次有效到站额外修复 12 点` },
  { id: "R1", branch: "repair", name: "高效维修", levels: 3, cost: 1, trainLevel: 3, prereq: { id: "R0", level: 1 }, effect: lv => `维修车恢复量 +${lv * 8}%` },
  { id: "R2", branch: "repair", name: "通用零件", levels: 3, cost: 2, trainLevel: 5, prereq: { id: "R0", level: 1 }, effect: lv => `基础到站维修量 +${lv * 5}%` },
  { id: "R3", branch: "repair", name: "备件扩容", levels: 2, cost: 2, trainLevel: 8, prereq: { id: "R1", level: 3 }, effect: lv => `维修车固定到站修复额外 +${lv * 2} 点` },
  { id: "R4", branch: "repair", name: "维修专精", levels: 1, cost: 4, trainLevel: 12, prereq: { branchPoints: 14 }, spec: "repair", effect: () => `选择到站大修或行进抢修` },
  { id: "R5", branch: "repair", name: "维修协议", levels: 2, cost: 2, trainLevel: 20, prereq: { id: "R4", level: 1 }, effect: lv => `维修车恢复量 +${lv * 8}%` },
  { id: "D0", branch: "radar", name: "解锁雷达车", levels: 1, cost: 1, trainLevel: 5, prereq: null, effect: () => `可装备雷达车；经验拾取半径 +15%` },
  { id: "D1", branch: "radar", name: "广域接收", levels: 3, cost: 1, trainLevel: 5, prereq: { id: "D0", level: 1 }, effect: lv => `经验拾取半径 +${lv * 5}%` },
  { id: "D2", branch: "radar", name: "数据回收", levels: 3, cost: 2, trainLevel: 8, prereq: { id: "D0", level: 1 }, effect: lv => `研究数据结算收益 +${lv * 3}%` },
  { id: "D3", branch: "radar", name: "雷达专精", levels: 1, cost: 4, trainLevel: 15, prereq: { branchPoints: 10 }, spec: "radar", effect: () => `选择战术标定或勘探分析` },
  { id: "D4", branch: "radar", name: "精密定位", levels: 3, cost: 2, trainLevel: 20, prereq: { id: "D3", level: 1 }, effect: lv => `经验拾取半径 +${lv * 4}%` },
  { id: "C0", branch: "storage", name: "解锁仓储车", levels: 1, cost: 1, trainLevel: 4, prereq: null, effect: () => `可装备仓储车；失败保留率 +20 个百分点` },
  { id: "C1", branch: "storage", name: "防震货柜", levels: 2, cost: 1, trainLevel: 4, prereq: { id: "C0", level: 1 }, effect: lv => `失败保留率 +${lv * 4} 个百分点` },
  { id: "C2", branch: "storage", name: "扩容回收", levels: 3, cost: 2, trainLevel: 5, prereq: { id: "C0", level: 1 }, effect: lv => `废料结算收益 +${lv * 3}%` },
  { id: "C3", branch: "storage", name: "仓储专精", levels: 1, cost: 5, trainLevel: 12, prereq: { branchPoints: 9 }, spec: "storage", effect: () => `选择装甲仓或回收货柜` },
  { id: "C4", branch: "storage", name: "组件分拣", levels: 3, cost: 2, trainLevel: 20, prereq: { id: "C3", level: 1 }, effect: lv => `技术组件结算收益 +${lv * 2}%` },
]);
const NODE_BY_ID = Object.freeze(Object.fromEntries(TALENT_NODES.map(node => [node.id, node])));

const SPEC_OPTIONS = Object.freeze({
  hull: [
    { id: "fortress", name: "移动堡垒", desc: "最大耐久额外 +16%" },
    { id: "reserve", name: "应急储备", desc: "每局首次因伤害耐久 ≤30% 时，立即恢复最大耐久的 18%" },
  ],
  pointDefense: [
    { id: "intercept", name: "拦截阵列", desc: "攻击间隔 ×0.85、伤害 ×0.90，优先攻击最接近列车的目标" },
    { id: "heavy", name: "重型近防", desc: "单发伤害 ×1.35、间隔 ×1.20，对精英额外 ×1.15" },
  ],
  repair: [
    { id: "overhaul", name: "到站大修", desc: "每次有效到站额外恢复最大耐久的 4%" },
    { id: "field", name: "行进抢修", desc: "每累计 10 秒有效行进战斗，恢复最大耐久的 0.5%" },
  ],
  radar: [
    { id: "tactical", name: "战术标定", desc: "无人机与列车近防对精英伤害 +6%" },
    { id: "survey", name: "勘探分析", desc: "研究数据结算收益额外 +6%" },
  ],
  storage: [
    { id: "armorBay", name: "装甲仓", desc: "失败保留率额外 +10 个百分点" },
    { id: "cargoBay", name: "回收货柜", desc: "废料结算收益额外 +6%，失败保留率 -8 个百分点" },
  ],
});
const SPEC_NODE = Object.freeze({ hull: "H5", pointDefense: "N4", repair: "R4", radar: "D3", storage: "C3" });

// ---------------------------------------------------------------------------
// v0.10 permanent research (需求 §15-§18). Seven tracks, Lv0-30, tiered
// per-level gains with diminishing returns after Lv10 and Lv20.
// ---------------------------------------------------------------------------

const RESEARCH_TRACKS = Object.freeze([
  { id: "fireControl", group: "drone", name: "火控算法", kind: "attack", scope: "北辰及所有无人机伤害", tiers: [[.015, 1], [.008, 1], [.005, 1]], unit: "+" },
  { id: "cycleControl", group: "drone", name: "循环控制", kind: "attack", scope: "无人机普通攻击基础间隔", tiers: [[.008, -1], [.004, -1], [.002, -1]], unit: "-" },
  { id: "rangeCalibration", group: "drone", name: "射程校准", kind: "attack", scope: "无人机索敌 / 攻击射程", tiers: [[.01, 1], [.003, 1], [.002, 1]], unit: "+" },
  { id: "hullEngineering", group: "train", name: "车体工程", kind: "train", scope: "列车最大耐久", tiers: [[.02, 1], [.01, 1], [.005, 1]], unit: "+" },
  { id: "armorMaterials", group: "train", name: "装甲材料", kind: "train", scope: "列车受到的直接攻击伤害（乘法叠算）", tiers: [[.01, 0], [.005, 0], [.0025, 0]], unit: "×", multiplicative: true },
  { id: "repairEngineering", group: "train", name: "维修工程", kind: "train", scope: "基础到站、维修车、应急储备维修量", tiers: [[.025, 1], [.0125, 1], [.0075, 1]], unit: "+" },
  { id: "trainFireControl", group: "train", name: "列车火控", kind: "train", scope: "列车自身近防伤害", tiers: [[.015, 1], [.008, 1], [.005, 1]], unit: "+" },
]);
const RESEARCH_IDS = Object.freeze(RESEARCH_TRACKS.map(track => track.id));
const RESEARCH_NAMES = Object.freeze(Object.fromEntries(RESEARCH_TRACKS.map(track => [track.id, track.name])));
const trackById = id => RESEARCH_TRACKS.find(track => track.id === id);

// Cost tables (需求 §18 / 两周成长计算表-成本曲线). Upgrade TO level L.
// The data column funds the three attack tracks, the components column funds
// the four train tracks; milestones charge the cross material on top.
const RESEARCH_COST_BASE = {
  scrap: [25, 30, 40, 50, 65, 85, 105, 130, 155, 185],
  data: [3, 4, 6, 8, 11, 15, 19, 24, 30, 36],
  components: [1, 1, 1, 1, 2, 2, 3, 3, 4, 5],
};
function researchCostFor(id, toLevel) {
  const L = Math.max(1, Math.min(MAX_RESEARCH_LEVEL, Math.floor(toLevel)));
  const scrap = L <= 10 ? RESEARCH_COST_BASE.scrap[L - 1] : 185 + 7 * (L - 10);
  const data = L <= 10 ? RESEARCH_COST_BASE.data[L - 1] : 36 + Math.ceil(1.75 * (L - 10));
  const components = L <= 10 ? RESEARCH_COST_BASE.components[L - 1] : 5 + Math.ceil(0.4 * (L - 10));
  const attack = trackById(id)?.kind === "attack";
  let extraComponents = 0, extraData = 0;
  if (L === 5) { if (attack) extraComponents = 1; else extraData = 5; }
  if (L % 5 === 0 && L >= 10) { if (attack) extraComponents = 3; else extraData = 15; }
  return { scrap, data: attack ? data : extraData, components: attack ? extraComponents : components, attack };
}

// Fixed-precision resource bookkeeping (需求 §19.2/§20.5): store thousandths.
const fix3 = value => Math.max(0, Math.round((Number(value) || 0) * 1000) / 1000);
function copyResources(value = {}) { return { scrap: fix3(value.scrap), components: fix3(value.components), data: fix3(value.data) }; }
const floorResources = value => ({ scrap: Math.floor(value.scrap), components: Math.floor(value.components), data: Math.floor(value.data) });

// ---------------------------------------------------------------------------
// Train level, XP curve and functional car slots (需求 §5-§6).
// ---------------------------------------------------------------------------

function xpToNext(level) { return 150 + 200 * (Math.max(1, Math.min(MAX_TRAIN_LEVEL, level)) - 1); }
function talentPoints(meta) { return 2 * Math.max(1, Math.min(MAX_TRAIN_LEVEL, Math.floor(Number(meta?.train?.level) || 1))); }
function carSlots(meta) { const level = Math.max(1, Math.floor(Number(meta?.train?.level) || 1)); return level >= 18 ? 4 : level >= 8 ? 3 : 2; }
function trainSlots(meta) { return carSlots(meta) + 1; }
function unlockedCars(meta) {
  const nodes = meta?.talents?.nodes || {};
  return ["hangar", ...TALENT_BRANCHES.map(branch => branch.car).filter(car => car && nodes[CAR_UNLOCK_NODE[car]] > 0)];
}
function carUnlocked(meta, carId) { return carId === "hangar" || (meta?.talents?.nodes?.[CAR_UNLOCK_NODE[carId]] || 0) > 0; }

// ---------------------------------------------------------------------------
// Talent validation (需求 §7 / §26.1).
// ---------------------------------------------------------------------------

function normalizeTalents(value) {
  const src = value && typeof value === "object" ? value : {};
  const nodes = {};
  for (const node of TALENT_NODES) nodes[node.id] = Math.max(0, Math.min(node.levels, Math.floor(Number(src.nodes?.[node.id]) || 0)));
  const specs = {};
  for (const branch of TALENT_BRANCHES) {
    const allowed = SPEC_OPTIONS[branch.id].map(option => option.id);
    const chosen = src.specs?.[branch.id];
    // A spec only counts while its spec node is owned.
    specs[branch.id] = nodes[SPEC_NODE[branch.id]] > 0 && allowed.includes(chosen) ? chosen : null;
  }
  return { nodes, specs };
}
function branchSpent(talents, branchId) {
  let spent = 0;
  for (const node of TALENT_NODES) if (node.branch === branchId) spent += (talents?.nodes?.[node.id] || 0) * node.cost;
  return spent;
}
function spentPoints(talents) { return TALENT_BRANCHES.reduce((sum, branch) => sum + branchSpent(talents, branch.id), 0); }
function availablePoints(meta) { return talentPoints(meta) - spentPoints(meta.talents); }
// Why a node level cannot be raised right now: null when it can.
function nodeBlockReason(meta, talents, nodeId) {
  const node = NODE_BY_ID[nodeId];
  if (!node) return "未知节点";
  const level = talents.nodes[nodeId] || 0;
  if (level >= node.levels) return "已满级";
  if ((meta?.train?.level || 1) < node.trainLevel) return `需要列车 Lv.${node.trainLevel}`;
  if (node.prereq?.id && (talents.nodes[node.prereq.id] || 0) < node.prereq.level) {
    const prereq = NODE_BY_ID[node.prereq.id];
    return `需要 ${prereq.name}${node.prereq.level >= prereq.levels ? " 满级" : ` ${node.prereq.level} 级`}`;
  }
  if (node.prereq?.branchPoints !== undefined && branchSpent(talents, node.branch) < node.prereq.branchPoints) {
    // Points already inside the node being checked do not count as "已投入".
    return `需要本分支已投入 ${node.prereq.branchPoints} 点`;
  }
  if (node.spec && !talents.specs[node.branch] && (talents.nodes[node.id] || 0) >= node.levels) return "已满级";
  if (spentPoints(talents) + node.cost > talentPoints(meta)) return "天赋点不足";
  if (branchSpent(talents, node.branch) + node.cost > TALENT_BRANCHES.find(branch => branch.id === node.branch).cap) return "超出分支上限";
  return null;
}
function branchFullReason(talents, branchId) {
  const branch = TALENT_BRANCHES.find(item => item.id === branchId);
  return branchSpent(talents, branchId) >= branch.cap ? `本分支已达 ${branch.cap} 点上限` : null;
}
// Full legality report for an allocation (used by apply + presets, 需求 §14/§26.1).
function talentProblems(meta, talents, options = {}) {
  const level = options.level ?? meta.train.level;
  const problems = [];
  let spent = 0;
  for (const node of TALENT_NODES) {
    const level2 = talents.nodes[node.id] || 0;
    if (level2 < 0 || level2 > node.levels) { problems.push(`${node.name}等级非法`); continue; }
    if (level2 > 0) {
      if (level < node.trainLevel) problems.push(`${node.name}需要列车 Lv.${node.trainLevel}`);
      if (node.prereq?.id && (talents.nodes[node.prereq.id] || 0) < node.prereq.level) problems.push(`${node.name}前置不满足`);
      if (node.prereq?.branchPoints !== undefined && branchSpent(talents, node.branch) - level2 * node.cost < node.prereq.branchPoints) problems.push(`${node.name}需要本分支已投入 ${node.prereq.branchPoints} 点`);
    }
    spent += level2 * node.cost;
  }
  if (spent > 2 * level) problems.push(`投入 ${spent} 点超过可用 ${2 * level} 点`);
  for (const branch of TALENT_BRANCHES) if (branchSpent(talents, branch.id) > branch.cap) problems.push(`${branch.name}分支超过 ${branch.cap} 点上限`);
  for (const branch of TALENT_BRANCHES) {
    const spec = talents.specs?.[branch.id];
    if (spec && !(talents.nodes[SPEC_NODE[branch.id]] > 0)) problems.push(`${branch.name}专精未解锁`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Derived attributes (需求 §17). buildStats is the single computation shared
// by the combat engine, the settlement and every UI preview - nobody else may
// re-derive these formulas.
// ---------------------------------------------------------------------------

function researchTiers(level) {
  const L = Math.max(0, Math.min(MAX_RESEARCH_LEVEL, Math.floor(Number(level) || 0)));
  return [Math.min(L, 10), Math.min(Math.max(L - 10, 0), 10), Math.min(Math.max(L - 20, 0), 10)];
}
function researchMultiplier(id, level) {
  const track = trackById(id);
  if (!track) return 1;
  const [a, b, c] = researchTiers(level);
  if (track.multiplicative) return Math.pow(1 - track.tiers[0][0], a) * Math.pow(1 - track.tiers[1][0], b) * Math.pow(1 - track.tiers[2][0], c);
  const sign = track.tiers[0][1];
  const sum = a * track.tiers[0][0] + b * track.tiers[1][0] + c * track.tiers[2][0];
  return 1 + sign * sum;
}

function buildStats(meta) {
  const talents = meta.talents, research = meta.research;
  const nl = id => talents.nodes[id] || 0;
  const equipped = new Set(meta.loadout || ["hangar"]);
  const pdOn = equipped.has("pointDefense") && nl("N0") > 0;
  const repairOn = equipped.has("repair") && nl("R0") > 0;
  const radarOn = equipped.has("radar") && nl("D0") > 0;
  const storageOn = equipped.has("storage") && nl("C0") > 0;

  const hullTalent = 1 + .04 * nl("H1") + .06 * nl("H3") + (talents.specs.hull === "fortress" ? .16 : 0);
  const hullResearch = researchMultiplier("hullEngineering", research.hullEngineering);
  const buffer = .03 * nl("H2");
  const armorMaterials = researchMultiplier("armorMaterials", research.armorMaterials);
  const repairEngineering = researchMultiplier("repairEngineering", research.repairEngineering);
  const maxHp = 100 * hullTalent * hullResearch;

  const stats = {
    maxHp,
    damageTakenMul: (1 - buffer) * armorMaterials,
    droneDamageMul: researchMultiplier("fireControl", research.fireControl),
    droneIntervalMul: researchMultiplier("cycleControl", research.cycleControl),
    droneRangeMul: researchMultiplier("rangeCalibration", research.rangeCalibration),
    repairMul: repairEngineering,
    eliteDamageMul: radarOn && talents.specs.radar === "tactical" ? 1.06 : 1,
    pickupRadiusMul: radarOn ? 1 + .15 + .05 * nl("D1") + .04 * nl("D4") : 1,
    dataYieldMul: radarOn ? 1 + .03 * nl("D2") + (talents.specs.radar === "survey" ? .06 : 0) : 1,
    scrapYieldMul: storageOn ? 1 + .03 * nl("C2") + (talents.specs.storage === "cargoBay" ? .06 : 0) : 1,
    componentYieldMul: storageOn ? 1 + .02 * nl("C4") : 1,
    failureKeep: Math.min(.90, .50 + (storageOn ? .20 + .04 * nl("C1") + (talents.specs.storage === "armorBay" ? .10 : talents.specs.storage === "cargoBay" ? -.08 : 0) : 0)),
    // 到站维修分层：基础(25+局内repair模块) ×(1+H4+R2)；维修车 (12+R3+大修%)×(1+R1+R5)；整体 ×维修工程。
    stationBaseMul: 1 + .05 * nl("H4") + (repairOn ? .05 * nl("R2") : 0),
    repairCar: repairOn ? {
      flat: 12 + 2 * nl("R3"),
      overhaulPct: talents.specs.repair === "overhaul" ? .04 : 0,
      mul: 1 + .08 * nl("R1") + .08 * nl("R5"),
    } : null,
    fieldRepairPer10s: repairOn && talents.specs.repair === "field" ? maxHp * .005 * (1 + .08 * nl("R1") + .08 * nl("R5")) * repairEngineering : 0,
    emergencyReserve: talents.specs.hull === "reserve" ? maxHp * .18 * repairEngineering : 0,
    pd: null,
    carFlags: { pointDefense: pdOn, repair: repairOn, radar: radarOn, storage: storageOn },
    // Lv.10 breakthrough enhancer blueprints fold into the snapshot (修订方案
    // §4-3)：战斗路径只读本快照，不再逐帧查询账号蓝图收藏。
    blueprints: {
      railLens: hasBlueprint(meta, "rail-lens"),
      arcResonator: hasBlueprint(meta, "arc-resonator"),
      missileGuidance: hasBlueprint(meta, "missile-guidance"),
      incendiaryGel: hasBlueprint(meta, "incendiary-gel"),
      ricochetPrism: hasBlueprint(meta, "ricochet-prism"),
    },
    // 奖励同样使用出发时快照 (需求 §20.1)：蓝图掉落按出发时的收藏 roll。
    ownedBlueprints: [...(meta.blueprints || [])],
  };
  if (pdOn) {
    const heavy = talents.specs.pointDefense === "heavy", intercept = talents.specs.pointDefense === "intercept";
    stats.pd = {
      rangeMul: 1 + .08 * nl("N1"),
      intervalMul: (1 - .05 * nl("N2")) * (intercept ? .85 : heavy ? 1.20 : 1),
      damageMul: (1 + .10 * nl("N3") + .05 * nl("N5")) * (intercept ? .90 : heavy ? 1.35 : 1) * researchMultiplier("trainFireControl", research.trainFireControl),
      eliteMul: heavy ? 1.15 : 1,
      intercept,
    };
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Meta shape v2, persistence and v0.9 -> v0.10 migration (需求 §23-§24).
// ---------------------------------------------------------------------------

function emptyTalents() { return normalizeTalents({}); }
function emptyPreset(name) { return { name, talents: emptyTalents(), loadout: ["hangar"] }; }

function emptyMeta() {
  const regions = {};
  for (const region of REGIONS) regions[region.id] = { unlocked: region.id === "wasteland", clears: 0, repaired: false };
  const research = {}; for (const id of RESEARCH_IDS) research[id] = 0;
  return {
    version: SAVE_VERSION,
    resources: { scrap: 0, components: 0, data: 0 },
    train: { level: 1, xp: 0, totalXp: 0 },
    talents: emptyTalents(),
    presets: [emptyPreset("方案 A"), emptyPreset("方案 B"), emptyPreset("方案 C")],
    freeRefits: 3,
    loadout: ["hangar"],
    selectedRegion: "wasteland",
    regions,
    blueprints: [],
    settledRunIds: [],
    research,
    totals: { expeditions: 0, extracts: 0, wins: 0, losses: 0 },
    migration: null,
  };
}

// Old research cost (v0.9): 8 + level*8 data per level, nothing else.
function legacyResearchRefund(levels) {
  let data = 0;
  for (let L = 0; L < levels; L++) data += 8 + L * 8;
  return data;
}

function migrateFromV1(src) {
  const meta = emptyMeta();
  const old = src && typeof src === "object" ? src : {};
  const level = Math.max(1, Math.min(MAX_TRAIN_LEVEL, Math.floor(Number(old.train?.level) || 1)));
  meta.train.level = level;
  // In-level XP maps by progress ratio between the two curves (§24.2).
  const oldXpToNext = 70 + (level - 1) * 35;
  const oldXp = Math.max(0, Math.floor(Number(old.train?.xp) || 0));
  meta.train.xp = Math.min(xpToNext(level) - 1, Math.floor((oldXp / oldXpToNext) * xpToNext(level)));
  meta.train.totalXp = 0;
  for (let L = 1; L < level; L++) meta.train.totalXp += xpToNext(L);
  meta.train.totalXp += meta.train.xp;

  meta.resources = copyResources({ ...old.resources });

  // Old research fully refunded in data (§24.3); the seven new tracks start at Lv0.
  let refundData = 0;
  const oldResearch = old.research && typeof old.research === "object" ? old.research : {};
  for (const value of Object.values(oldResearch)) refundData += legacyResearchRefund(Math.max(0, Math.floor(Number(value) || 0)));

  // Retired blueprints convert into a one-time resource compensation (§21).
  const ownedBlueprints = [...new Set(Array.isArray(old.blueprints) ? old.blueprints : [])].filter(id => BLUEPRINTS.some(bp => bp.id === id));
  let converted = [];
  for (const id of ownedBlueprints) {
    if (BLUEPRINTS.find(bp => bp.id === id)?.retired) {
      meta.resources.scrap += BLUEPRINT_COMPENSATION.scrap;
      meta.resources.components += BLUEPRINT_COMPENSATION.components;
      meta.resources.data += BLUEPRINT_COMPENSATION.data;
      converted.push(id);
    }
  }
  meta.resources.data += refundData;
  meta.blueprints = ownedBlueprints;

  // Map the old loadout onto unlock nodes within the new point budget (§24.4).
  const priority = ["pointDefense", "repair", "storage", "radar"];
  const oldFunctional = (Array.isArray(old.loadout) ? old.loadout : []).filter(id => id !== "hangar" && CAR_UNLOCK_NODE[id]);
  const wanted = priority.filter(id => oldFunctional.includes(id) || (Array.isArray(old.unlockedCars) ? old.unlockedCars.includes(id) : false));
  let budget = talentPoints(meta), loadout = ["hangar"];
  for (const car of wanted) {
    const node = NODE_BY_ID[CAR_UNLOCK_NODE[car]];
    if (budget < node.cost || level < node.trainLevel) continue;
    meta.talents.nodes[node.id] = 1; budget -= node.cost;
    if (oldFunctional.includes(car)) loadout.push(car);
  }
  loadout = loadout.slice(0, 1 + carSlots(meta));
  meta.loadout = loadout;
  meta.presets[0] = { name: "方案 A", talents: normalizeTalents(meta.talents), loadout };

  const oldTotals = old.totals && typeof old.totals === "object" ? old.totals : {};
  meta.totals = { expeditions: Math.max(0, Math.floor(Number(oldTotals.expeditions) || 0)), extracts: Math.max(0, Math.floor(Number(oldTotals.extracts) || 0)), wins: Math.max(0, Math.floor(Number(oldTotals.wins) || 0)), losses: Math.max(0, Math.floor(Number(oldTotals.losses) || 0)) };
  for (const region of REGIONS) {
    const saved = old.regions?.[region.id] || {};
    meta.regions[region.id] = { unlocked: region.id === "wasteland" || !!saved.unlocked, clears: Math.max(0, Math.floor(Number(saved.clears) || 0)), repaired: !!saved.repaired };
  }
  meta.selectedRegion = meta.regions[old.selectedRegion]?.unlocked ? old.selectedRegion : "wasteland";
  meta.migration = { from: 1, to: SAVE_VERSION, refundedData: fix3(refundData), convertedBlueprints: converted, legacyLoadout: oldFunctional.slice(0, 6) };
  return meta;
}

function normalizeMeta(value) {
  if (value && Number(value.version) !== SAVE_VERSION && !value.talents) return migrateFromV1(value);
  const base = emptyMeta(), src = value && typeof value === "object" ? value : {};
  const result = { ...base, ...src };
  result.version = SAVE_VERSION;
  result.resources = copyResources(src.resources || base.resources);
  result.train = {
    level: Math.max(1, Math.min(MAX_TRAIN_LEVEL, Math.floor(Number(src.train?.level) || 1))),
    xp: Math.max(0, Math.min(xpToNext(Math.max(1, Math.floor(Number(src.train?.level) || 1))) - 1, Math.floor(Number(src.train?.xp) || 0))),
    totalXp: Math.max(0, fix3(src.train?.totalXp) || 0),
  };
  result.talents = normalizeTalents(src.talents);
  // Illegal saved allocations (e.g. externally edited) fall back to a legal
  // subset rather than silently granting effects. Trimming runs from the
  // dependency tail backwards so a single bad late node never wipes the
  // branches that depend on nothing.
  if (talentProblems(result, result.talents).length) {
    for (let i = TALENT_NODES.length - 1; i >= 0; i--) {
      const node = TALENT_NODES[i];
      while ((result.talents.nodes[node.id] || 0) > 0 && talentProblems(result, result.talents).length) result.talents.nodes[node.id]--;
    }
    result.talents = normalizeTalents(result.talents);
  }
  result.presets = [0, 1, 2].map(index => {
    const saved = Array.isArray(src.presets) ? src.presets[index] : null;
    if (!saved || typeof saved !== "object") return emptyPreset(`方案 ${"ABC"[index]}`);
    return { name: String(saved.name || `方案 ${"ABC"[index]}`).slice(0, 12), talents: normalizeTalents(saved.talents), loadout: ["hangar", ...(Array.isArray(saved.loadout) ? saved.loadout : []).filter(id => id !== "hangar")] };
  });
  result.freeRefits = Math.max(0, Math.min(99, Math.floor(Number(src.freeRefits ?? base.freeRefits) || 0)));
  const allowed = new Set(unlockedCars(result));
  const requested = Array.isArray(src.loadout) ? src.loadout : base.loadout;
  const picked = [...new Set(["hangar", ...requested])].filter(id => allowed.has(id) && CAR_DEFS.some(car => car.id === id));
  result.loadout = picked.slice(0, Math.max(1, carSlots(result) + 1));
  if (!result.loadout.includes("hangar")) result.loadout.unshift("hangar");
  result.regions = {};
  for (const region of REGIONS) {
    const saved = src.regions?.[region.id] || {};
    result.regions[region.id] = { unlocked: region.id === "wasteland" || !!saved.unlocked, clears: Math.max(0, Math.floor(Number(saved.clears) || 0)), repaired: !!saved.repaired };
  }
  result.selectedRegion = result.regions[src.selectedRegion]?.unlocked ? src.selectedRegion : "wasteland";
  result.blueprints = [...new Set(Array.isArray(src.blueprints) ? src.blueprints : [])].filter(id => BLUEPRINTS.some(bp => bp.id === id));
  result.settledRunIds = [...new Set(Array.isArray(src.settledRunIds) ? src.settledRunIds : [])].filter(id => typeof id === "string" && id.length > 0 && id.length <= 80).slice(-MAX_SETTLED_RUN_IDS);
  result.research = {};
  for (const id of RESEARCH_IDS) result.research[id] = Math.max(0, Math.min(MAX_RESEARCH_LEVEL, Math.floor(Number(src.research?.[id]) || 0)));
  result.totals = { expeditions: Math.max(0, Number(src.totals?.expeditions) || 0), extracts: Math.max(0, Number(src.totals?.extracts) || 0), wins: Math.max(0, Number(src.totals?.wins) || 0), losses: Math.max(0, Number(src.totals?.losses) || 0) };
  result.migration = src.migration && typeof src.migration === "object" ? src.migration : null;
  return result;
}
function loadMeta(storage) {
  try {
    if (!storage?.getItem) return emptyMeta();
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return emptyMeta();
    const parsed = JSON.parse(raw);
    // §24.1: keep a one-time snapshot of the legacy save before migrating.
    if (parsed && Number(parsed.version) !== SAVE_VERSION && !parsed.talents) {
      try { storage.getItem(BACKUP_KEY) || storage.setItem(BACKUP_KEY, raw); } catch { /* snapshot best effort */ }
    }
    return normalizeMeta(parsed);
  } catch { return emptyMeta(); }
}
function saveMeta(storage, meta) { try { if (!storage?.setItem) return false; storage.setItem(STORAGE_KEY, JSON.stringify(normalizeMeta(meta))); return true; } catch { return false; } }
function regionById(id) { return REGIONS.find(region => region.id === id) || REGIONS[0]; }
function blueprintById(id) { return BLUEPRINTS.find(bp => bp.id === id); }
function hasBlueprint(meta, id) { return !!meta?.blueprints?.includes(id); }
function planFor(meta) {
  const normalized = normalizeMeta(meta), region = regionById(normalized.selectedRegion);
  return { regionId: region.id, region, cars: [...normalized.loadout], trainLength: 1 + normalized.loadout.length, slots: trainSlots(normalized) };
}
function setRegion(meta, regionId) { const next = normalizeMeta(meta); if (next.regions[regionId]?.unlocked) next.selectedRegion = regionId; return next; }
function setLoadout(meta, ids) {
  const next = normalizeMeta(meta), allowed = new Set(unlockedCars(next)), maxFunctional = carSlots(next);
  const selected = [...new Set((ids || []).filter(id => id !== "hangar" && allowed.has(id)))].slice(0, maxFunctional);
  next.loadout = ["hangar", ...selected]; return next;
}

// ---------------------------------------------------------------------------
// Refit: draft, presets, single paid application (需求 §14).
// ---------------------------------------------------------------------------

function refitCost(meta) { return 10 + Math.ceil(Math.max(1, Math.floor(Number(meta?.train?.level) || 1)) / 2); }
// A paid change withdraws points or swaps a purchased spec (§14.2); adding to
// untouched nodes, loadout edits and renames stay free.
function refitIsPaid(currentTalents, nextTalents) {
  const before = currentTalents.nodes, after = nextTalents.nodes;
  for (const node of TALENT_NODES) if ((after[node.id] || 0) < (before[node.id] || 0)) return true;
  for (const branch of TALENT_BRANCHES) if ((before[SPEC_NODE[branch.id]] || 0) > 0 && (after[SPEC_NODE[branch.id]] || 0) > 0 && currentTalents.specs[branch.id] !== nextTalents.specs[branch.id]) return true;
  return false;
}
function applyTalents(meta, draftTalents, options = {}) {
  const next = normalizeMeta(meta);
  const problems = talentProblems(next, draftTalents);
  if (problems.length) return { meta: next, applied: false, problems };
  const loadout = Array.isArray(options.loadout) ? options.loadout : next.loadout;
  const draft = { ...next, talents: normalizeTalents(draftTalents), loadout };
  const normalizedDraft = normalizeMeta(draft);
  const paid = refitIsPaid(next.talents, normalizedDraft.talents);
  let charged = 0, freeRefits = next.freeRefits;
  if (paid) {
    if (freeRefits > 0) freeRefits -= 1;
    else {
      const cost = refitCost(next);
      if (next.resources.scrap < cost) return { meta: next, applied: false, problems: [`废料不足，还需 ${Math.ceil(cost - next.resources.scrap)} 废料`], cost };
      normalizedDraft.resources.scrap = fix3(normalizedDraft.resources.scrap - cost);
      charged = cost;
    }
  }
  normalizedDraft.freeRefits = freeRefits;
  return { meta: normalizeMeta(normalizedDraft), applied: true, problems: [], paid, charged, freeRefits };
}
function savePreset(meta, index, talents, loadout) {
  const next = normalizeMeta(meta);
  const slot = next.presets[Math.max(0, Math.min(2, Math.floor(index)))];
  if (!slot) return next;
  slot.talents = normalizeTalents(talents);
  const cars = Array.isArray(loadout) ? loadout : next.loadout;
  slot.loadout = ["hangar", ...cars.filter(id => id !== "hangar")];
  return next;
}
function loadPreset(meta, index) {
  const next = normalizeMeta(meta);
  const slot = next.presets[Math.max(0, Math.min(2, Math.floor(index)))];
  if (!slot) return { meta: next, talents: next.talents, problems: ["方案不存在"] };
  const presetMeta = normalizeMeta({ ...next, talents: slot.talents, loadout: slot.loadout });
  const problems = talentProblems(presetMeta, slot.talents);
  return { meta: next, talents: slot.talents, loadout: slot.loadout, problems };
}
function renamePreset(meta, index, name) {
  const next = normalizeMeta(meta);
  const slot = next.presets[Math.max(0, Math.min(2, Math.floor(index)))];
  if (slot) slot.name = String(name || slot.name).slice(0, 12);
  return next;
}

// ---------------------------------------------------------------------------
// Research purchases (需求 §18/§22.2).
// ---------------------------------------------------------------------------

function researchCost(meta, id) {
  const level = Math.max(0, Math.min(MAX_RESEARCH_LEVEL, Number(meta?.research?.[id]) || 0));
  if (level >= MAX_RESEARCH_LEVEL || !trackById(id)) return null;
  return researchCostFor(id, level + 1);
}
function buyResearch(meta, id) {
  const next = normalizeMeta(meta);
  if (!RESEARCH_IDS.includes(id)) return { meta: next, purchased: false };
  const cost = researchCost(next, id);
  if (!cost) return { meta: next, purchased: false };
  const short = [];
  if (next.resources.scrap < cost.scrap) short.push(`废料 ${Math.ceil(cost.scrap - next.resources.scrap)}`);
  if (next.resources.data < cost.data) short.push(`数据 ${Math.ceil(cost.data - next.resources.data)}`);
  if (next.resources.components < cost.components) short.push(`组件 ${Math.ceil(cost.components - next.resources.components)}`);
  if (short.length) return { meta: next, purchased: false, cost, short };
  next.resources.scrap = fix3(next.resources.scrap - cost.scrap);
  next.resources.data = fix3(next.resources.data - cost.data);
  next.resources.components = fix3(next.resources.components - cost.components);
  next.research[id]++;
  return { meta: next, purchased: true, cost };
}
// Display strings for the research UI: cumulative total and next-level delta.
function researchEffectText(id, level) {
  const track = trackById(id);
  if (!track) return { total: "", next: "" };
  const fmt = value => {
    if (track.unit === "×") return `${(value * 100).toFixed(2)}%`;
    const sign = track.unit === "-" ? -1 : 1;
    return `${sign > 0 ? "+" : ""}${(Math.abs(1 - value) * 100).toFixed(1)}%`;
  };
  const total = researchMultiplier(id, level);
  const next = researchMultiplier(id, Math.min(MAX_RESEARCH_LEVEL, level + 1));
  return { total: fmt(total), next: level >= MAX_RESEARCH_LEVEL ? "" : fmt(next) };
}

// ---------------------------------------------------------------------------
// Run lifecycle: risk/banked resources, yields, settlement (需求 §19-§20).
// ---------------------------------------------------------------------------

function newRunId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
function createRun(meta, plan = planFor(meta)) {
  const normalized = normalizeMeta(meta);
  return { id: newRunId(), startExpeditions: normalized.totals.expeditions, plan: { ...plan, cars: [...plan.cars] }, stats: buildStats(normalized), banked: copyResources(), risk: copyResources(), bankedBlueprints: [], riskBlueprints: [], stationsBanked: 0, eliteKills: 0, specialKills: 0, regionReward: plan?.region?.reward || 1 };
}
// Yields apply exactly once, at award time, using the departure snapshot.
function awardRisk(run, type, amount) {
  if (!run?.risk || !Object.hasOwn(run.risk, type)) return run;
  const mul = { scrap: run.stats?.scrapYieldMul ?? 1, data: run.stats?.dataYieldMul ?? 1, components: run.stats?.componentYieldMul ?? 1 }[type] ?? 1;
  run.risk[type] = fix3(run.risk[type] + Math.max(0, Number(amount) || 0) * mul);
  return run;
}
function addBlueprintRisk(run, id) { if (run && blueprintById(id) && !blueprintById(id).retired && !run.riskBlueprints.includes(id) && !run.bankedBlueprints.includes(id)) run.riskBlueprints.push(id); return run; }
function bankRisk(run) {
  if (!run) return run;
  // Arrival pays before the station locks its process rewards.
  awardRisk(run, "data", 1);
  for (const key of Object.keys(run.risk)) { run.banked[key] = fix3(run.banked[key] + run.risk[key]); run.risk[key] = 0; }
  run.bankedBlueprints.push(...run.riskBlueprints.filter(id => !run.bankedBlueprints.includes(id)));
  run.riskBlueprints = [];
  run.stationsBanked += 1;
  return run;
}
function applyTrainXp(meta, amount) {
  const next = normalizeMeta(meta);
  const gain = Math.max(0, Math.floor(Number(amount) || 0));
  next.train.xp += gain; next.train.totalXp = fix3((next.train.totalXp || 0) + gain);
  while (next.train.level < MAX_TRAIN_LEVEL && next.train.xp >= xpToNext(next.train.level)) { next.train.xp -= xpToNext(next.train.level); next.train.level++; }
  if (next.train.level >= MAX_TRAIN_LEVEL) next.train.xp = Math.min(next.train.xp, xpToNext(MAX_TRAIN_LEVEL) - 1);
  return next;
}
// Accepts the account meta or a plain owned-id array; combat passes the
// departure snapshot's copy (修订方案 §4/需求 §20.1).
function rollBlueprint(metaOrOwned, regionId, random = Math.random) { const region = regionById(regionId), owned = new Set(Array.isArray(metaOrOwned) ? metaOrOwned : metaOrOwned?.blueprints || []), options = region.blueprintPool.filter(id => !owned.has(id) && blueprintById(id) && !blueprintById(id).retired); if (!options.length) return null; return options[Math.floor(random() * options.length)]; }

// XP per expedition (需求 §5.3): 40 per completed segment, +40 for the clear;
// a failed run keeps completed segments and converts current-segment progress
// into at most 39 XP.
function expeditionXp(run, outcome, options = {}) {
  if (outcome === "won") return (run.stationsBanked + 1) * 40 + 40;
  if (outcome === "lost") {
    const progress = Math.max(0, Math.min(1, Number(options.segmentProgress) || 0));
    return run.stationsBanked * 40 + Math.min(39, Math.floor(40 * progress));
  }
  return run.stationsBanked * 40;
}

function settleRun(meta, run, outcome, options = {}) {
  let next = normalizeMeta(meta);
  if (!run) return { meta: next, gained: copyResources(), blueprints: [] };
  if ((run.id && next.settledRunIds.includes(run.id)) || (Number.isSafeInteger(run.startExpeditions) && next.totals.expeditions > run.startExpeditions)) return { meta: next, gained: copyResources(), blueprints: [], trainXp: 0, alreadySettled: true };
  const gained = copyResources(run.banked);
  const blueprints = [...run.bankedBlueprints];
  if (outcome === "won" || outcome === "extracted") {
    for (const key of Object.keys(run.risk)) gained[key] = fix3(gained[key] + run.risk[key]);
    blueprints.push(...run.riskBlueprints);
  } else {
    const keep = run.stats?.failureKeep ?? .50;
    for (const key of Object.keys(run.risk)) gained[key] = fix3(gained[key] + run.risk[key] * keep);
  }
  // Clear bonus (需求 §19.1): scrap 30 / data 3 / components 1, scaled by the
  // region coefficient and the departure yield snapshot, awarded once.
  if (outcome === "won") {
    const regionReward = run.regionReward || 1, stats = run.stats || {};
    gained.scrap = fix3(gained.scrap + 30 * regionReward * (stats.scrapYieldMul ?? 1));
    gained.data = fix3(gained.data + 3 * regionReward * (stats.dataYieldMul ?? 1));
    gained.components = fix3(gained.components + 1 * regionReward * (stats.componentYieldMul ?? 1));
  }
  next.resources.scrap = fix3(next.resources.scrap + gained.scrap);
  next.resources.components = fix3(next.resources.components + gained.components);
  next.resources.data = fix3(next.resources.data + gained.data);
  const uniqueBlueprints = [...new Set(blueprints)].filter(id => blueprintById(id) && !next.blueprints.includes(id));
  next.blueprints.push(...uniqueBlueprints);
  next.totals.expeditions++; if (outcome === "won") next.totals.wins++; else if (outcome === "extracted") next.totals.extracts++; else next.totals.losses++;
  const regionId = run.plan?.regionId || next.selectedRegion, regionState = next.regions[regionId];
  if (outcome === "won" && regionState) {
    regionState.clears++; if (regionState.clears >= 2) regionState.repaired = true;
    for (const id of regionById(regionId).next) if (next.regions[id]) next.regions[id].unlocked = true;
  }
  const xp = expeditionXp(run, outcome, options);
  next = applyTrainXp(next, xp);
  if (run.id) next.settledRunIds = [...next.settledRunIds, run.id].slice(-MAX_SETTLED_RUN_IDS);
  return { meta: next, gained, blueprints: uniqueBlueprints, trainXp: xp };
}

const api = {
  STORAGE_KEY, BACKUP_KEY, gameStorage, MAX_TRAIN_LEVEL, MAX_RESEARCH_LEVEL, SAVE_VERSION,
  CAR_DEFS, CAR_UNLOCK_NODE, REGIONS, BLUEPRINTS, BLUEPRINT_COMPENSATION,
  TALENT_BRANCHES, TALENT_NODES, NODE_BY_ID, SPEC_OPTIONS, SPEC_NODE,
  RESEARCH_IDS, RESEARCH_NAMES, RESEARCH_TRACKS, RESEARCH_COST_BASE,
  emptyMeta, normalizeMeta, migrateFromV1, loadMeta, saveMeta,
  trainSlots, carSlots, unlockedCars, carUnlocked, talentPoints, spentPoints, availablePoints, branchSpent,
  nodeBlockReason, branchFullReason, talentProblems, normalizeTalents, emptyTalents,
  buildStats, researchMultiplier, researchTiers, researchCostFor, researchEffectText,
  refitCost, refitIsPaid, applyTalents, savePreset, loadPreset, renamePreset, emptyPreset,
  regionById, blueprintById, hasBlueprint, planFor, setRegion, setLoadout,
  createRun, awardRisk, addBlueprintRisk, bankRisk, expeditionXp,
  researchCost, buyResearch, xpToNext, applyTrainXp, rollBlueprint, settleRun, copyResources, floorResources, fix3,
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.EndlessRailsLongterm = api;
})();
