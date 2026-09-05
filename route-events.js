"use strict";

const ROUTE_EVENTS = Object.freeze([
  { id: "dust", name: "沙尘暴", description: "精英与核心更活跃。", routeDistanceMultiplier: 1, enemySpeedMultiplier: 1.04, eliteChanceMultiplier: 1.35, coreChanceMultiplier: 1.15, weather: "dust" },
  { id: "sprint", name: "高速冲刺", description: "路程更短，敌人更快。", routeDistanceMultiplier: 0.78, enemySpeedMultiplier: 1.22, eliteChanceMultiplier: 1.1, coreChanceMultiplier: 1, weather: "speed" },
  { id: "freight", name: "废弃货运线", description: "敌群稀疏，核心更丰富。", routeDistanceMultiplier: 1.08, enemySpeedMultiplier: 0.9, eliteChanceMultiplier: 0.8, coreChanceMultiplier: 1.55, weather: "freight" },
]);

const CONTRACTS = Object.freeze([
  { id: "fragile", name: "脆弱护送", description: "列车更脆弱，废料更丰厚。", rewardMultiplier: 1.2, enemyHpMultiplier: 1, scrapMultiplier: 1.25 },
  { id: "pressure", name: "高压推进", description: "敌人更坚韧，路线奖励提升。", rewardMultiplier: 1.3, enemyHpMultiplier: 1.18, scrapMultiplier: 1.12 },
  { id: "scavenger", name: "拾荒协议", description: "核心机会增加，击破收益稳定。", rewardMultiplier: 1.1, enemyHpMultiplier: 1.06, scrapMultiplier: 1.18 },
]);

function createSeed(value = Date.now()) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value += 0x6d2b79f5; let result = value; result = Math.imul(result ^ (result >>> 15), result | 1); result ^= result + Math.imul(result ^ (result >>> 7), result | 61); return ((result ^ (result >>> 14)) >>> 0) / 4294967296; };
}

function pickUnique(pool, seed) {
  const choices = [...pool], random = seededRandom(seed);
  for (let index = choices.length - 1; index > 0; index--) { const swap = Math.floor(random() * (index + 1)); [choices[index], choices[swap]] = [choices[swap], choices[index]]; }
  return choices.slice(0, 3);
}

function pickRouteEvents(seed, station = 1) { return pickUnique(ROUTE_EVENTS, createSeed(String(seed) + ":event:" + station)); }
function pickContracts(seed) { return pickUnique(CONTRACTS, createSeed(String(seed) + ":contract")); }
function applyRouteModifiers(base, event, contract) {
  const route = event || ROUTE_EVENTS[0], pact = contract || CONTRACTS[0];
  return { ...base, routeDistance: base.routeDistance * route.routeDistanceMultiplier, enemySpeed: base.enemySpeed * route.enemySpeedMultiplier, enemyHp: (base.enemyHp ?? 1) * pact.enemyHpMultiplier, eliteChance: base.eliteChance * route.eliteChanceMultiplier, coreChance: base.coreChance * route.coreChanceMultiplier, rewardMultiplier: (base.rewardMultiplier ?? 1) * pact.rewardMultiplier, scrapMultiplier: (base.scrapMultiplier ?? 1) * pact.scrapMultiplier, weather: route.weather };
}

const routeEventsApi = { ROUTE_EVENTS, CONTRACTS, createSeed, pickRouteEvents, pickContracts, applyRouteModifiers };
if (typeof module !== "undefined" && module.exports) module.exports = routeEventsApi;
if (typeof window !== "undefined") window.EndlessRailsRouteEvents = routeEventsApi;
