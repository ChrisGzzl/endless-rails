'use strict';
// Two-week expected-income model after replacing background XP with manual
// train purchases. These are planning averages, not observed live drops.
const assert = require('node:assert/strict');
const meta = require('../src/meta/longterm');
const near = (a, b, label) => assert.ok(Math.abs(a - b) < .05, `${label}: ${a} != ${b}`);
const rate = day => day <= 3 ? .65 : day <= 7 ? .75 : day <= 10 ? .80 : .85;

function researchTo(level) {
  const sum = { scrap: 0, data: 0, components: 0 };
  for (const id of meta.RESEARCH_IDS) for (let next = 1; next <= level; next++) {
    const cost = meta.researchCostFor(id, next);
    for (const key of Object.keys(sum)) sum[key] += cost[key];
  }
  return sum;
}
function trainTo(level) {
  let total = 0;
  for (let current = 1; current < level; current++) total += meta.trainUpgradeCost(current);
  return total;
}
assert.deepEqual(researchTo(30), { scrap: 21196, data: 4073, components: 908 });
assert.equal(trainTo(30), 21273);

function simulate(runsPerDay) {
  const wallet = { scrap: 0, data: 0, components: 0 };
  const days = [];
  for (let day = 1; day <= 14; day++) {
    const wins = runsPerDay * rate(day), losses = runsPerDay - wins;
    wallet.scrap += wins * 120 + losses * 48.6 - 25; // reserve 25 per day for refits
    wallet.data += wins * 13 + losses * 5.4;
    wallet.components += wins * 3 + losses * 1.08;
    days.push({ ...wallet });
  }
  return days;
}

const standard = simulate(30);
for (const [day, train, research] of [[1, 8, 7], [7, 21, 19], [14, 30, 30]]) {
  const budget = standard[day - 1], study = researchTo(research);
  assert.ok(budget.scrap >= study.scrap + trainTo(train), `day ${day}: train Lv${train} plus research Lv${research} fits scrap`);
  assert.ok(budget.data >= study.data, `day ${day}: research data fits`);
  assert.ok(budget.components >= study.components, `day ${day}: components fit`);
}
near(standard[13].scrap - researchTo(30).scrap - trainTo(30), 619.5, 'day-14 scrap margin');

const noAd = simulate(22)[13];
assert.ok(noAd.scrap < researchTo(30).scrap + trainTo(30), '22 daily departures do not finish both paths by day 14');
console.log('two-week manual train purchase and research budgets passed');
