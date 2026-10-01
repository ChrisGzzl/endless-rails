"use strict";
// v0.12 persistent expedition map (规划 §3-§7/§19.1): the 12-layer route graph,
// its seeded generator, the per-node reward ledger math and the whitelist
// normalizer. Pure data and pure functions - no engine, no DOM, no imports -
// so the browser graph (window mount), the CJS tests and the save service all
// share one validator. The serialized shape is deliberately FLAT: one nodes
// array with a layer field and nextIds edges, a bounded nodeLedger, and
// checkpoint/pendingOp objects that never nest the account meta or the engine
// state (§19.1 byte/depth budget).
(() => {

const CONTENT_VERSION = 1;
const LAYER_COUNT = 12;
const LAYER_SIZES = Object.freeze([1, 2, 3, 2, 3, 3, 2, 3, 3, 3, 3, 1]);
const REGION_IDS = Object.freeze(["wasteland", "ruins", "industrial", "infection"]);
const STATUS_VALUES = Object.freeze(["active", "completed", "reset"]);

// alpha.1 only generates implemented node types; later slices add
// supply/shop/event/elite/miniboss without changing the stored shape.
const NODE_TYPES = Object.freeze({
  start: { label: "启程", glyph: "◈", rewardHint: "签订契约 · 建立检查点", budget: { scrap: 0, data: 0, components: 0 }, tokens: 0 },
  combat: { label: "普通战斗", glyph: "⬤", rewardHint: "稳定经验 · 券与永久资源", budget: { scrap: 28, data: 3, components: 0.4 }, tokens: 25 },
  risk: { label: "高危战斗", glyph: "⚠", rewardHint: "更强敌群 · 更高收益", budget: { scrap: 42, data: 4.5, components: 0.9 }, tokens: 40 },
  final: { label: "终点冲击", glyph: "★", rewardHint: "整图结算 · 通关奖励", budget: { scrap: 60, data: 6, components: 1.5 }, tokens: 60 },
});
// Route modifiers applied on top of the neutral segment (alpha.1 词条).
const ROUTE_OVERRIDES = Object.freeze({
  combat: Object.freeze({}),
  risk: Object.freeze({ enemyHp: 1.18, eliteChance: 1.4 }),
  final: Object.freeze({ enemyHp: 1.08, eliteChance: 1.2 }),
  start: Object.freeze({}),
});
const NEUTRAL_EVENT = Object.freeze({ id: "clear", name: "开阔轨道", routeDistanceMultiplier: 1, enemySpeedMultiplier: 1, eliteChanceMultiplier: 1, coreChanceMultiplier: 1, weather: "clear" });
// Alpha.1 expeditions run contract-less (the L1 choice was removed); the
// neutral pact keeps beginRoute's legacy contract defaults from leaking a
// hidden fragile-style modifier into every node.
const NEUTRAL_CONTRACT = Object.freeze({ id: "none", name: "无契约", rewardMultiplier: 1, enemyHpMultiplier: 1, scrapMultiplier: 1, trainDamageMultiplier: 1 });

// In-run module/breakthrough ids that may persist on an expedition build.
const MODULE_IDS = Object.freeze(["rapid", "wingman", "piercing", "missile", "incendiary", "chain", "ricochet", "blades", "scatter", "armor", "repair", "shield", "volatile", "railgun", "cargo", "magnet", "overclock", "tesla"]);
const CORE_IDS = Object.freeze(["overdrive", "scatter", "arc"]);
const BREAKTHROUGHS = Object.freeze({ missile: Object.freeze(["cluster", "heavy"]), piercing: Object.freeze(["focus", "split"]) });
const CONTRACT_FIELDS = Object.freeze(["id", "name", "description", "rewardMultiplier", "enemyHpMultiplier", "scrapMultiplier", "trainDamageMultiplier"]);
const RESOURCE_KEYS = Object.freeze(["scrap", "data", "components"]);
const MAX_NODES = 32, MAX_LEDGER = 16, MAX_VISITED = 12, MAX_BLUEPRINTS = 12;

const fix3 = value => Math.max(0, Math.round((Number(value) || 0) * 1000) / 1000);
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const clampNum = (value, min, max) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; };
const uint = (value, max) => { const n = Math.floor(Number(value)); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };
const isId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,16}$/.test(value);

// Deterministic RNG so the same seed always regenerates the same candidate
// graph (§4.1) during retries; the accepted result is then persisted whole.
function seededRandom(seed) {
  let value = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
function newExpeditionId(rng = Math.random) {
  return Math.floor(rng() * 2176782336).toString(36).padStart(6, "0") + Math.floor(rng() * 2176782336).toString(36).slice(0, 2);
}

// -- graph generation (§3/§4.1) ----------------------------------------------------------

const LAYER_TYPE_POOL = Object.freeze([
  Object.freeze(["start"]),
  Object.freeze(["combat", "combat"]),
  Object.freeze(["combat", "risk", "combat"]),
  Object.freeze(["risk", "combat"]),
  Object.freeze(["combat", "combat", "risk"]),
  Object.freeze(["combat", "risk", "combat"]),
  Object.freeze(["risk", "combat"]),
  Object.freeze(["combat", "combat", "risk"]),
  Object.freeze(["risk", "combat", "combat"]),
  Object.freeze(["risk", "combat", "risk"]),
  Object.freeze(["combat", "risk", "combat"]),
  Object.freeze(["final"]),
]);

// Staircase roads: each source owns a contiguous run of target slots and the
// runs advance monotonically (max(run_i) <= min(run_k) for i < k), which makes
// the drawn graph planar by construction - zero crossings. Edge nodes keep a
// single road where geometry leaves no room (规划 §3.1's required >=1 rule;
// the >=2 recommendation is kept wherever the layout allows).
function connectLayers(fromNodes, toNodes, layer) {
  const m = fromNodes.length, n = toNodes.length;
  const j0 = i => Math.min(n - 1, Math.floor(i * n / m));
  for (let i = 0; i < m; i++) {
    const a = j0(i);
    let b = Math.min(a + 1, n - 1);
    if (i + 1 < m) b = Math.min(b, j0(i + 1)); // stay laminar against the next slot
    fromNodes[i].nextIds = [toNodes[a].id];
    if (b !== a) fromNodes[i].nextIds.push(toNodes[b].id);
  }
  // Coverage: any target without an incoming road takes its nearest source.
  const covered = new Set(fromNodes.flatMap(node => node.nextIds));
  for (let j = 0; j < n; j++) {
    if (covered.has(toNodes[j].id)) continue;
    const i = Math.min(m - 1, Math.floor(j * m / n));
    fromNodes[i].nextIds.push(toNodes[j].id);
    covered.add(toNodes[j].id);
  }
}

function buildCandidate(seed) {
  const rng = seededRandom(seed);
  const byLayer = [];
  let index = 0;
  for (let layer = 1; layer <= LAYER_COUNT; layer++) {
    const types = layer === 1 || layer === LAYER_COUNT ? [...LAYER_TYPE_POOL[layer - 1]] : shuffle(LAYER_TYPE_POOL[layer - 1], rng);
    byLayer.push(types.map(type => ({ id: "n" + index++, layer, type, nextIds: [] })));
  }
  for (let layer = 1; layer < LAYER_COUNT; layer++) connectLayers(byLayer[layer - 1], byLayer[layer], layer);
  return byLayer.flat();
}

function validateNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length < LAYER_SIZES.reduce((a, b) => a + b, 0) || nodes.length > MAX_NODES) return false;
  const byId = new Map();
  for (const node of nodes) {
    if (!node || !isId(node.id) || byId.has(node.id)) return false;
    const layer = uint(node.layer, LAYER_COUNT);
    const type = NODE_TYPES[node.type];
    if (!layer || layer < 1 || !type) return false;
    if (!Array.isArray(node.nextIds) || node.nextIds.length > 3) return false;
    byId.set(node.id, node);
  }
  for (let layer = 1; layer <= LAYER_COUNT; layer++) {
    const count = nodes.filter(n => n.layer === layer).length;
    if (count !== LAYER_SIZES[layer - 1]) return false;
  }
  const start = nodes.filter(n => n.layer === 1), finish = nodes.filter(n => n.layer === LAYER_COUNT);
  if (start.length !== 1 || start[0].type !== "start" || finish.length !== 1 || finish[0].type !== "final") return false;
  if (finish[0].nextIds.length) return false;
  const incoming = new Map(nodes.map(n => [n.id, 0]));
  for (const node of nodes) {
    const seen = new Set();
    for (const id of node.nextIds) {
      const target = byId.get(id);
      if (!target || target.layer !== node.layer + 1 || seen.has(id)) return false;
      seen.add(id);
      incoming.set(id, incoming.get(id) + 1);
    }
    if (node.layer < LAYER_COUNT && node.nextIds.length < 1) return false;
  }
  for (const node of nodes) if (node.layer > 1 && incoming.get(node.id) < 1) return false;
  // The start must reach every node: no dead branches on a fresh map.
  const reach = new Set([start[0].id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of nodes) {
      if (reach.has(node.id) && node.nextIds.some(id => !reach.has(id))) { for (const id of node.nextIds) reach.add(id); grew = true; }
    }
  }
  return nodes.every(node => reach.has(node.id));
}

function generateExpedition({ regionId, seed, id, startExpeditions = 0 } = {}) {
  const region = REGION_IDS.includes(regionId) ? regionId : "wasteland";
  let nodes = null, usedSeed = uint(seed, 4294967295);
  for (let attempt = 0; attempt < 8 && !nodes; attempt++) {
    const candidateSeed = usedSeed === null ? Math.floor(Math.random() * 4294967296) : (usedSeed + attempt * 7919) % 4294967296;
    const candidate = buildCandidate(candidateSeed);
    if (validateNodes(candidate)) { nodes = candidate; usedSeed = candidateSeed; }
  }
  if (!nodes) { usedSeed = 1; nodes = buildCandidate(1); }
  return {
    id: isId(id) ? id : newExpeditionId(),
    regionId: region,
    seed: usedSeed,
    contentVersion: CONTENT_VERSION,
    status: "active",
    startExpeditions: Math.max(0, Math.floor(Number(startExpeditions) || 0)),
    nodes,
    visitedIds: [],
    lockedNodeId: null,
    contract: null,
    build: { modules: {}, coreStacks: {}, breakthroughs: {} },
    growth: { experience: 0, experienceToNext: 4, level: 1, pendingLevelUps: 0 },
    trainHpPct: 1,
    emergencyReserveUsed: false,
    tokens: 0,
    riskBlueprints: [],
    nodeLedger: [],
    checkpoint: null,
    pendingOp: null,
    summary: { attempts: 0, failures: 0, kills: 0 },
  };
}

// -- queries ----------------------------------------------------------------------------------

function nodeById(expedition, id) { return expedition?.nodes?.find(node => node.id === id) || null; }
function visitedNode(expedition) { return expedition?.visitedIds?.length ? nodeById(expedition, expedition.visitedIds[expedition.visitedIds.length - 1]) : null; }
function currentLayer(expedition) {
  if (!expedition || expedition.status !== "active") return 0;
  return visitedNode(expedition)?.layer || 1;
}
function reachableNext(expedition) {
  if (!expedition || expedition.status !== "active") return [];
  if (expedition.pendingOp || expedition.checkpoint) return [];
  // A failed node keeps its layer locked: retry the same node or reset (§2.2).
  if (expedition.lockedNodeId) {
    const locked = nodeById(expedition, expedition.lockedNodeId);
    return locked ? [locked] : [];
  }
  const last = visitedNode(expedition);
  if (!last || last.layer >= LAYER_COUNT) return [];
  return last.nextIds.map(id => nodeById(expedition, id)).filter(Boolean);
}

// -- reward ledger (§7.1) ----------------------------------------------------------------------

// B is fixed at the node's first start: base × region reward × buildStats
// yields, fix3 per resource. Contract reward multipliers never enter B (§12.1).
function budgetFor(node, regionReward, stats) {
  const base = NODE_TYPES[node?.type]?.budget || { scrap: 0, data: 0, components: 0 };
  const region = Math.max(0, Number(regionReward) || 1);
  const yields = { scrap: stats?.scrapYieldMul ?? 1, data: stats?.dataYieldMul ?? 1, components: stats?.componentYieldMul ?? 1 };
  const out = {};
  for (const key of RESOURCE_KEYS) out[key] = fix3(base[key] * region * yields[key]);
  return out;
}
function makeLedgerEntry(nodeId, budget, keep) {
  return { nodeId, B: { ...budget }, keep: clamp(keep, 0, 1), p: 0, paid: { scrap: 0, data: 0, components: 0 }, done: false };
}
// Failure pays, per resource, the unpaid part of min(B, fix3(B × p × keep)).
function failurePayout(entry, progress) {
  const payout = {};
  entry.p = clamp(Math.max(entry.p, progress), 0, 1);
  for (const key of RESOURCE_KEYS) {
    const cap = fix3(Math.min(entry.B[key] || 0, fix3((entry.B[key] || 0) * entry.p * entry.keep)));
    payout[key] = fix3(Math.max(0, cap - (entry.paid[key] || 0)));
    entry.paid[key] = fix3((entry.paid[key] || 0) + payout[key]);
  }
  return payout;
}
function victoryPayout(entry) {
  const payout = {};
  for (const key of RESOURCE_KEYS) {
    payout[key] = fix3(Math.max(0, (entry.B[key] || 0) - (entry.paid[key] || 0)));
    entry.paid[key] = fix3((entry.paid[key] || 0) + payout[key]);
  }
  entry.p = 1;
  entry.done = true;
  return payout;
}

// -- checkpoints (§6.3) ------------------------------------------------------------------------

function snapshotBuild(build, growth) {
  return {
    build: { modules: { ...(build?.modules || {}) }, coreStacks: { ...(build?.coreStacks || {}) }, breakthroughs: { ...(build?.breakthroughs || {}) } },
    growth: { experience: clamp(growth?.experience, 0, 1e6), experienceToNext: clamp(growth?.experienceToNext, 1, 1e4) || 4, level: clamp(growth?.level, 1, 99) || 1, pendingLevelUps: clamp(growth?.pendingLevelUps, 0, 32) },
  };
}
function checkpointFor(expedition, nodeId) {
  const snap = snapshotBuild(expedition.build, expedition.growth);
  return { nodeId, trainHpPct: clamp(expedition.trainHpPct, 0, 1), tokens: clamp(expedition.tokens, 0, 1e6), emergencyReserveUsed: !!expedition.emergencyReserveUsed, riskBlueprints: [...expedition.riskBlueprints].slice(0, MAX_BLUEPRINTS), ...snap };
}
function applyCheckpoint(expedition, checkpoint) {
  expedition.trainHpPct = clamp(checkpoint.trainHpPct, 0.05, 1);
  expedition.tokens = clamp(checkpoint.tokens, 0, 1e6);
  expedition.emergencyReserveUsed = !!checkpoint.emergencyReserveUsed;
  expedition.riskBlueprints = [...(checkpoint.riskBlueprints || [])].slice(0, MAX_BLUEPRINTS);
  expedition.build = { modules: { ...(checkpoint.build?.modules || {}) }, coreStacks: { ...(checkpoint.build?.coreStacks || {}) }, breakthroughs: { ...(checkpoint.build?.breakthroughs || {}) } };
  expedition.growth = { experience: clamp(checkpoint.growth?.experience, 0, 1e6), experienceToNext: clamp(checkpoint.growth?.experienceToNext, 1, 1e4) || 4, level: clamp(checkpoint.growth?.level, 1, 99) || 1, pendingLevelUps: clamp(checkpoint.growth?.pendingLevelUps, 0, 32) };
}

// -- whitelist normalizer (§6.2/§19.1) ---------------------------------------------------------
// Rebuilds every field from scratch; any structural violation (broken graph,
// dangling ids, out-of-range progress, NaN, over-deep nesting) rejects the
// whole expedition to null so the caller keeps the permanent account intact.

function rebuildModules(value) {
  const src = value && typeof value === "object" ? value : {};
  const out = {};
  for (const id of MODULE_IDS) { const lv = uint(src[id], 12); if (lv) out[id] = lv; }
  return out;
}
function rebuildCores(value) {
  const src = value && typeof value === "object" ? value : {};
  const out = {};
  for (const id of CORE_IDS) { const n = uint(src[id], 3); if (n) out[id] = n; }
  return out;
}
function rebuildBreakthroughs(value) {
  const src = value && typeof value === "object" ? value : {};
  const out = {};
  for (const weapon of Object.keys(BREAKTHROUGHS)) if (BREAKTHROUGHS[weapon].includes(src[weapon])) out[weapon] = src[weapon];
  return out;
}
function rebuildResources3(value, max) {
  const src = value && typeof value === "object" ? value : {};
  const out = {};
  for (const key of RESOURCE_KEYS) { const n = Number(src[key]); out[key] = Number.isFinite(n) && n >= 0 && n <= max ? fix3(n) : 0; }
  return out;
}
function rebuildIdList(value, byId, max) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const id of value) {
    if (isId(id) && byId.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}
function rebuildBlueprintIds(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const id of value) {
    if (typeof id === "string" && id.length > 0 && id.length <= 24 && !out.includes(id)) out.push(id);
    if (out.length >= MAX_BLUEPRINTS) break;
  }
  return out;
}
function rebuildContract(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const field of CONTRACT_FIELDS) {
    if (field === "id" || field === "name" || field === "description") {
      if (typeof value[field] !== "string" || !value[field] || value[field].length > 40) return null;
      out[field] = value[field];
    } else {
      // Contracts legitimately omit neutral fields (pressure has no
      // trainDamageMultiplier); an absent multiplier means ×1.
      const n = Number(value[field]);
      out[field] = Number.isFinite(n) ? Math.min(2, Math.max(1, n)) : 1;
    }
  }
  return out;
}
function rebuildLedger(value, byId) {
  if (!Array.isArray(value) || value.length > MAX_LEDGER) return null;
  const out = [], seen = new Set();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || !byId.has(entry.nodeId) || seen.has(entry.nodeId)) return null;
    const p = Number(entry.p), keep = Number(entry.keep);
    if (!Number.isFinite(p) || p < 0 || p > 1 || !Number.isFinite(keep) || keep < 0 || keep > 1) return null;
    seen.add(entry.nodeId);
    out.push({ nodeId: entry.nodeId, B: rebuildResources3(entry.B, 1e5), keep: Math.max(0.5, Math.min(0.9, keep)), p, paid: rebuildResources3(entry.paid, 1e5), done: !!entry.done });
  }
  return out;
}
function rebuildCheckpoint(value, byId) {
  if (!value || typeof value !== "object" || !byId.has(value.nodeId)) return null;
  const snap = snapshotBuild(value.build, value.growth);
  return { nodeId: value.nodeId, trainHpPct: clamp(value.trainHpPct, 0, 1), tokens: clamp(value.tokens, 0, 1e6), emergencyReserveUsed: !!value.emergencyReserveUsed, riskBlueprints: rebuildBlueprintIds(value.riskBlueprints), ...snap };
}
function rebuildPendingOp(value, byId) {
  if (!value || typeof value !== "object") return null;
  if (value.kind === "failure") {
    if (!byId.has(value.nodeId)) return null;
    return { kind: "failure", nodeId: value.nodeId, payout: rebuildResources3(value.payout, 1e5) };
  }
  if (value.kind !== "victory" || !byId.has(value.nodeId)) return null;
  const settle = value.finalSettle && typeof value.finalSettle === "object"
    ? { regionReward: clamp(value.finalSettle.regionReward, 0, 10) || 1, startExpeditions: uint(value.finalSettle.startExpeditions, 1e9) ?? 0, scrapYieldMul: clampNum(value.finalSettle.scrapYieldMul, 1, 100), dataYieldMul: clampNum(value.finalSettle.dataYieldMul, 1, 100), componentYieldMul: clampNum(value.finalSettle.componentYieldMul, 1, 100), riskBlueprints: rebuildBlueprintIds(value.finalSettle.riskBlueprints) }
    : null;
  if (value.final && !settle) return null;
  return { kind: "victory", nodeId: value.nodeId, payout: rebuildResources3(value.payout, 1e5), tokens: clamp(value.tokens, 0, 1e6), hpPct: clamp(value.hpPct, 0.05, 1), final: !!value.final, finalSettle: settle };
}

function normalizeExpedition(value, options = {}) {
  if (!value || typeof value !== "object") return null;
  const regionIds = options.regionIds || REGION_IDS;
  if (!isId(value.id) || typeof value.regionId !== "string" || !regionIds.includes(value.regionId)) return null;
  const seed = uint(value.seed, 4294967295);
  const contentVersion = uint(value.contentVersion, 99);
  if (!seed || !contentVersion || !STATUS_VALUES.includes(value.status)) return null;
  const nodes = [];
  const byId = new Map();
  if (Array.isArray(value.nodes) && value.nodes.length <= MAX_NODES) {
    for (const node of value.nodes) {
      if (!node || typeof node !== "object" || !isId(node.id) || byId.has(node.id)) return null;
      const layer = uint(node.layer, LAYER_COUNT), type = NODE_TYPES[node.type];
      if (!layer || !type || !Array.isArray(node.nextIds) || node.nextIds.length > 3) return null;
      const nextIds = [];
      for (const id of node.nextIds) { if (!isId(id) || nextIds.includes(id)) return null; nextIds.push(id); }
      byId.set(node.id, 1);
      nodes.push({ id: node.id, layer, type: node.type, nextIds });
    }
  } else return null;
  if (!validateNodes(nodes)) return null;
  for (const node of nodes) byId.set(node.id, node);
  const visitedIds = rebuildIdList(value.visitedIds, byId, MAX_VISITED);
  let lockedNodeId = value.lockedNodeId == null ? null : (byId.has(value.lockedNodeId) ? value.lockedNodeId : null);
  if (lockedNodeId && value.status === "active") {
    // A locked node must be a legal forward choice of the current position.
    const last = visitedIds.length ? byId.get(visitedIds[visitedIds.length - 1]) : null;
    if (!last || !last.nextIds.includes(lockedNodeId)) return null;
  }
  const nodeLedger = rebuildLedger(value.nodeLedger, byId);
  if (!nodeLedger) return null;
  const checkpoint = value.checkpoint == null ? null : rebuildCheckpoint(value.checkpoint, byId);
  if (value.checkpoint != null && !checkpoint) return null;
  const pendingOp = value.pendingOp == null ? null : rebuildPendingOp(value.pendingOp, byId);
  if (value.pendingOp != null && !pendingOp) return null;
  const growthSrc = value.growth && typeof value.growth === "object" ? value.growth : {};
  const contract = value.contract == null ? null : rebuildContract(value.contract);
  if (value.contract != null && !contract) return null;
  // Self-heal: a signed contract implies the L1 departure is cleared.
  if (contract && !visitedIds.length) {
    const start = nodes.find(node => node.layer === 1);
    if (start) visitedIds.push(start.id);
  }
  return {
    id: value.id,
    regionId: value.regionId,
    seed,
    contentVersion,
    status: value.status,
    startExpeditions: uint(value.startExpeditions, 1e9) ?? 0,
    nodes,
    visitedIds,
    lockedNodeId,
    contract,
    build: { modules: rebuildModules(value.build?.modules), coreStacks: rebuildCores(value.build?.coreStacks), breakthroughs: rebuildBreakthroughs(value.build?.breakthroughs) },
    growth: { experience: clamp(growthSrc.experience, 0, 1e6), experienceToNext: clamp(growthSrc.experienceToNext, 1, 1e4) || 4, level: clamp(growthSrc.level, 1, 99) || 1, pendingLevelUps: clamp(growthSrc.pendingLevelUps, 0, 32) },
    trainHpPct: clamp(value.trainHpPct, 0, 1),
    emergencyReserveUsed: !!value.emergencyReserveUsed,
    tokens: clamp(value.tokens, 0, 1e6),
    riskBlueprints: rebuildBlueprintIds(value.riskBlueprints),
    nodeLedger,
    checkpoint,
    pendingOp,
    summary: { attempts: uint(value.summary?.attempts, 1e9) ?? 0, failures: uint(value.summary?.failures, 1e9) ?? 0, kills: uint(value.summary?.kills, 1e9) ?? 0 },
  };
}

const api = {
  CONTENT_VERSION, LAYER_COUNT, LAYER_SIZES, REGION_IDS, NODE_TYPES, ROUTE_OVERRIDES, NEUTRAL_EVENT, NEUTRAL_CONTRACT,
  MODULE_IDS, CORE_IDS, BREAKTHROUGHS, RESOURCE_KEYS, MAX_NODES, MAX_LEDGER, MAX_VISITED, MAX_BLUEPRINTS,
  fix3, seededRandom, newExpeditionId, generateExpedition, validateNodes,
  nodeById, visitedNode, currentLayer, reachableNext,
  budgetFor, makeLedgerEntry, failurePayout, victoryPayout, checkpointFor, applyCheckpoint, normalizeExpedition,
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.EndlessRailsExpedition = api;
})();
