"use strict";

const STORAGE_KEY = "endless-rails-v09-meta";
const MAX_TRAIN_LEVEL = 30;
const MAX_RESEARCH_LEVEL = 3;

const CAR_DEFS = Object.freeze([
  { id: "hangar", name: "无人机机库", icon: "◇", fixed: true, description: "远征核心车厢；管理无人机与长期研究。" },
  { id: "pointDefense", name: "近防车厢", icon: "⌁", description: "自动拦截贴近列车的目标，提供最后一道防线。" },
  { id: "storage", name: "仓储车厢", icon: "▣", description: "远征失败时额外保留风险资源。" },
  { id: "radar", name: "雷达车厢", icon: "◎", description: "提前显示路线威胁、Elite 与潜在收益信息。" },
  { id: "repair", name: "维修车厢", icon: "+", description: "每次安全停靠时提供额外维修。" },
]);

const REGIONS = Object.freeze([
  { id: "wasteland", name: "起始荒原", statusText: "低危铁路", description: "开阔荒原，适合验证列车与无人机编组。", enemyHp: .94, density: .92, elite: .85, reward: 1, next: ["ruins"], blueprintPool: ["pd-array", "swift-feed", "field-repair"] },
  { id: "ruins", name: "废墟城市", statusText: "中危城区", description: "街区尸潮开始从多个方向压迫列车。", enemyHp: 1.05, density: 1.08, elite: 1.08, reward: 1.16, next: ["industrial", "infection"], blueprintPool: ["radar-pulse", "rail-lens", "arc-resonator"] },
  { id: "industrial", name: "工业区", statusText: "高危工厂", description: "重型感染者与技术组件产出更高。", enemyHp: 1.14, density: 1.18, elite: 1.25, reward: 1.34, next: [], blueprintPool: ["cargo-lock", "missile-guidance", "incendiary-gel"] },
  { id: "infection", name: "感染区", statusText: "高危巢域", description: "高密度尸潮与变异体，研究数据收益最高。", enemyHp: 1.22, density: 1.30, elite: 1.42, reward: 1.52, next: [], blueprintPool: ["bio-scan", "ricochet-prism", "chain-overload"] },
]);

const BLUEPRINTS = Object.freeze([
  { id: "pd-array", name: "近防阵列校准", kind: "car", description: "近防车厢伤害小幅提高。" },
  { id: "swift-feed", name: "雨燕高速供弹", kind: "drone", description: "雨燕长期研究伤害额外提高。" },
  { id: "field-repair", name: "荒原抢修规程", kind: "car", description: "维修车厢到站修复提高。" },
  { id: "radar-pulse", name: "宽域雷达脉冲", kind: "car", description: "雷达可显示更完整的路线风险提示。" },
  { id: "rail-lens", name: "白虹聚束透镜", kind: "drone", description: "白虹专精后额外获得贯穿。" },
  { id: "arc-resonator", name: "惊蛰共振器", kind: "drone", description: "惊蛰专精后额外增加一个连锁目标。" },
  { id: "cargo-lock", name: "抗冲击货柜锁", kind: "car", description: "仓储车进一步降低失败损失。" },
  { id: "missile-guidance", name: "天隼终端制导", kind: "drone", description: "天隼专精后爆炸范围提高。" },
  { id: "incendiary-gel", name: "烛龙凝胶燃料", kind: "drone", description: "烛龙专精后燃烧区域扩大。" },
  { id: "bio-scan", name: "感染体谱系扫描", kind: "research", description: "Elite 研究数据产出提高。" },
  { id: "ricochet-prism", name: "回响折跃棱镜", kind: "drone", description: "回响专精后增加一次弹跳。" },
  { id: "chain-overload", name: "电弧过载协议", kind: "drone", description: "惊蛰在密集目标间输出进一步提高。" },
]);

const RESEARCH_IDS = Object.freeze(["rapid", "missile", "incendiary", "ricochet", "chain", "piercing", "scatter", "blades"]);
const RESEARCH_NAMES = Object.freeze({ rapid: "雨燕", missile: "天隼", incendiary: "烛龙", ricochet: "回响", chain: "惊蛰", piercing: "白虹", scatter: "繁星", blades: "弦月" });

function emptyMeta() {
  const regions = {};
  for (const region of REGIONS) regions[region.id] = { unlocked: region.id === "wasteland", clears: 0, repaired: false };
  const research = {}; for (const id of RESEARCH_IDS) research[id] = 0;
  return {
    version: 1,
    resources: { scrap: 0, components: 0, data: 0 },
    train: { level: 1, xp: 0 },
    unlockedCars: ["hangar", "pointDefense", "storage", "radar", "repair"],
    loadout: ["hangar", "pointDefense", "storage"],
    selectedRegion: "wasteland",
    regions,
    blueprints: [],
    research,
    totals: { expeditions: 0, extracts: 0, wins: 0, losses: 0 },
  };
}
function copyResources(value = {}) { return { scrap: Math.max(0, Math.floor(Number(value.scrap) || 0)), components: Math.max(0, Math.floor(Number(value.components) || 0)), data: Math.max(0, Math.floor(Number(value.data) || 0)) }; }
function trainSlots(meta) { return Math.min(7, 4 + Math.floor((Math.max(1, meta?.train?.level || 1) - 1) / 5)); }
function normalizeMeta(value) {
  const base = emptyMeta(), src = value && typeof value === "object" ? value : {};
  const result = { ...base, ...src };
  result.resources = copyResources(src.resources || base.resources);
  result.train = { level: Math.max(1, Math.min(MAX_TRAIN_LEVEL, Math.floor(Number(src.train?.level) || 1))), xp: Math.max(0, Math.floor(Number(src.train?.xp) || 0)) };
  result.unlockedCars = [...new Set(["hangar", ...(Array.isArray(src.unlockedCars) ? src.unlockedCars : base.unlockedCars)])].filter(id => CAR_DEFS.some(car => car.id === id));
  result.regions = {};
  for (const region of REGIONS) {
    const saved = src.regions?.[region.id] || {};
    result.regions[region.id] = { unlocked: region.id === "wasteland" || !!saved.unlocked, clears: Math.max(0, Math.floor(Number(saved.clears) || 0)), repaired: !!saved.repaired };
  }
  result.selectedRegion = result.regions[src.selectedRegion]?.unlocked ? src.selectedRegion : "wasteland";
  result.blueprints = [...new Set(Array.isArray(src.blueprints) ? src.blueprints : [])].filter(id => BLUEPRINTS.some(bp => bp.id === id));
  result.research = {};
  for (const id of RESEARCH_IDS) result.research[id] = Math.max(0, Math.min(MAX_RESEARCH_LEVEL, Math.floor(Number(src.research?.[id]) || 0)));
  const allowed = new Set(result.unlockedCars);
  const requested = Array.isArray(src.loadout) ? src.loadout : base.loadout;
  const picked = [...new Set(["hangar", ...requested])].filter(id => allowed.has(id));
  result.loadout = picked.slice(0, Math.max(1, trainSlots(result) - 1));
  if (!result.loadout.includes("hangar")) result.loadout.unshift("hangar");
  result.totals = { expeditions: Math.max(0, Number(src.totals?.expeditions) || 0), extracts: Math.max(0, Number(src.totals?.extracts) || 0), wins: Math.max(0, Number(src.totals?.wins) || 0), losses: Math.max(0, Number(src.totals?.losses) || 0) };
  return result;
}
function loadMeta(storage) { try { return normalizeMeta(storage?.getItem ? JSON.parse(storage.getItem(STORAGE_KEY) || "null") : null); } catch { return emptyMeta(); } }
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
  const next = normalizeMeta(meta), allowed = new Set(next.unlockedCars), maxFunctional = Math.max(0, trainSlots(next) - 2);
  const selected = [...new Set((ids || []).filter(id => id !== "hangar" && allowed.has(id)))].slice(0, maxFunctional);
  next.loadout = ["hangar", ...selected]; return next;
}
function createRun(meta, plan = planFor(meta)) { return { plan: { ...plan, cars: [...plan.cars] }, banked: copyResources(), risk: copyResources(), bankedBlueprints: [], riskBlueprints: [], stationsBanked: 0, eliteKills: 0, specialKills: 0 }; }
function awardRisk(run, type, amount) { if (!run?.risk || !Object.hasOwn(run.risk, type)) return run; run.risk[type] += Math.max(0, Math.floor(Number(amount) || 0)); return run; }
function addBlueprintRisk(run, id) { if (run && blueprintById(id) && !run.riskBlueprints.includes(id) && !run.bankedBlueprints.includes(id)) run.riskBlueprints.push(id); return run; }
function bankRisk(run) { if (!run) return run; for (const key of Object.keys(run.risk)) { run.banked[key] += run.risk[key]; run.risk[key] = 0; } run.bankedBlueprints.push(...run.riskBlueprints.filter(id => !run.bankedBlueprints.includes(id))); run.riskBlueprints = []; run.stationsBanked += 1; return run; }
function trainUpgradeCost(meta) {
  const level=Math.max(1,Number(meta?.train?.level)||1);
  return level>=MAX_TRAIN_LEVEL?{scrap:Infinity,components:Infinity}:{scrap:35+level*25,components:1+Math.floor((level-1)/4)};
}
function upgradeTrain(meta) {
  const next=normalizeMeta(meta),cost=trainUpgradeCost(next);
  if(!Number.isFinite(cost.scrap)||next.resources.scrap<cost.scrap||next.resources.components<cost.components)return {meta:next,purchased:false,cost};
  next.resources.scrap-=cost.scrap;next.resources.components-=cost.components;next.train.level=Math.min(MAX_TRAIN_LEVEL,next.train.level+1);
  return {meta:next,purchased:true,cost};
}
function researchCost(meta, id) { const level = Math.max(0, Math.min(MAX_RESEARCH_LEVEL, Number(meta?.research?.[id]) || 0)); return level >= MAX_RESEARCH_LEVEL ? Infinity : 8 + level * 8; }
function buyResearch(meta, id) { const next = normalizeMeta(meta); if (!RESEARCH_IDS.includes(id)) return { meta: next, purchased: false }; const cost = researchCost(next, id); if (!Number.isFinite(cost) || next.resources.data < cost) return { meta: next, purchased: false }; next.resources.data -= cost; next.research[id]++; return { meta: next, purchased: true, cost }; }
function researchProfile(meta, id) {
  const key = id === "gun" ? "rapid" : id, level = Math.max(0, Math.min(MAX_RESEARCH_LEVEL, Number(meta?.research?.[key]) || 0));
  return { id: key, level, damageMultiplier: 1 + level * .03, specialized: level >= 3 };
}
function trainBonuses(meta) { const level = Math.max(1, Number(meta?.train?.level) || 1); return { hpMultiplier: 1 + Math.min(20, level - 1) * .018, droneDamageMultiplier: 1 + Math.min(20, level - 1) * .012, repairMultiplier: 1 + Math.min(15, level - 1) * .02 }; }
function xpToNext(level) { return 70 + Math.max(0, level - 1) * 35; }
function applyTrainXp(meta, amount) { const next = normalizeMeta(meta); next.train.xp += Math.max(0, Math.floor(Number(amount) || 0)); while (next.train.level < MAX_TRAIN_LEVEL && next.train.xp >= xpToNext(next.train.level)) { next.train.xp -= xpToNext(next.train.level); next.train.level++; } return next; }
function rollBlueprint(meta, regionId, random = Math.random) { const region = regionById(regionId), owned = new Set(meta?.blueprints || []), options = region.blueprintPool.filter(id => !owned.has(id)); if (!options.length) return null; return options[Math.floor(random() * options.length)]; }
function settleRun(meta, run, outcome, options = {}) {
  let next = normalizeMeta(meta); if (!run) return { meta: next, gained: copyResources(), blueprints: [] };
  const gained = copyResources(run.banked); const blueprints = [...run.bankedBlueprints];
  if (outcome === "won" || outcome === "extracted") {
    for (const key of Object.keys(run.risk)) gained[key] += run.risk[key];
    blueprints.push(...run.riskBlueprints);
  } else {
    let keep = options.storageActive ? .70 : .50;
    if (options.storageActive && hasBlueprint(next, "cargo-lock")) keep = .78;
    for (const key of Object.keys(run.risk)) gained[key] += Math.floor(run.risk[key] * keep);
  }
  next.resources.scrap += gained.scrap; next.resources.components += gained.components; next.resources.data += gained.data;
  const uniqueBlueprints = [...new Set(blueprints)].filter(id => blueprintById(id) && !next.blueprints.includes(id));
  next.blueprints.push(...uniqueBlueprints);
  next.totals.expeditions++; if (outcome === "won") next.totals.wins++; else if (outcome === "extracted") next.totals.extracts++; else next.totals.losses++;
  const regionId = run.plan?.regionId || next.selectedRegion, regionState = next.regions[regionId];
  if (outcome === "won" && regionState) {
    regionState.clears++; if (regionState.clears >= 2) regionState.repaired = true;
    for (const id of regionById(regionId).next) if (next.regions[id]) next.regions[id].unlocked = true;
  }
  const xp = 18 + run.stationsBanked * 10 + (outcome === "won" ? 40 : outcome === "extracted" ? 15 : 0);
  next = applyTrainXp(next, xp);
  return { meta: next, gained, blueprints: uniqueBlueprints, trainXp: xp };
}

const api = { STORAGE_KEY, CAR_DEFS, REGIONS, BLUEPRINTS, RESEARCH_IDS, RESEARCH_NAMES, MAX_RESEARCH_LEVEL, emptyMeta, normalizeMeta, loadMeta, saveMeta, trainSlots, regionById, blueprintById, hasBlueprint, planFor, setRegion, setLoadout, createRun, awardRisk, addBlueprintRisk, bankRisk, trainUpgradeCost, upgradeTrain, researchCost, buyResearch, researchProfile, trainBonuses, xpToNext, rollBlueprint, settleRun };
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.EndlessRailsLongterm = api;
