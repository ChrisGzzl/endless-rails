'use strict';
// 终局模拟（修订方案 §6 步骤 1/2 的终局项）：用当前实现的 XP 曲线、研究成本
// 与结算数值复算《两周成长计算表》的期望值模型，验证标准情景第 14 天到达
// 列车 Lv30 + 七项研究 Lv30 的终局，以及"不看广告"情景的 §31.2 结果。
// 模型口径与计算表一致：期望胜局（非随机），通关 240 XP、失败期望 120 XP；
// 通关均值废料/数据/组件 120/13/3，失败 48.6/5.4/1.08；初始 120/12/20；
// 每天预留 25 废料非研究消费。
const assert = require('node:assert/strict');
const meta = require('../src/meta/longterm');
const near = (a, b, msg, eps = .05) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} != ${b}`);

const RATE = day => day <= 3 ? .65 : day <= 7 ? .75 : day <= 10 ? .80 : .85;

// 七项升到 Lv L 的累计需求（用实现的研究成本函数逐级求和）。
const sevenTo = {};
for (const target of [5, 7, 10, 19, 25, 26, 30]) {
  const sums = { scrap: 0, data: 0, components: 0 };
  for (const id of meta.RESEARCH_IDS) for (let L = 1; L <= target; L++) {
    const cost = meta.researchCostFor(id, L);
    sums.scrap += cost.scrap; sums.data += cost.data; sums.components += cost.components;
  }
  sevenTo[target] = sums;
}
// 成本表与计算表的对账锚点（talents.test 已逐级覆盖，这里只留终局锚）。
assert.equal(sevenTo[30].scrap, 42280); assert.equal(sevenTo[30].data, 4073); assert.equal(sevenTo[30].components, 908);

function balancedLevel(scrapBudget, dataBudget, compBudget) {
  for (let L = meta.MAX_RESEARCH_LEVEL; L >= 1; L--) {
    const sums = { scrap: 0, data: 0, components: 0 };
    for (const id of meta.RESEARCH_IDS) for (let level = 1; level <= L; level++) {
      const cost = meta.researchCostFor(id, level);
      sums.scrap += cost.scrap; sums.data += cost.data; sums.components += cost.components;
    }
    if (sums.scrap <= scrapBudget && sums.data <= dataBudget && sums.components <= compBudget) return L;
  }
  return 0;
}

function simulate(runsPerDay) {
  let account = meta.emptyMeta();
  let totalXp = 0, scrapBudget = 0, dataBudget = 0, compBudget = 0;
  const days = [];
  for (let day = 1; day <= 14; day++) {
    const rate = RATE(day), wins = runsPerDay * rate, losses = runsPerDay - wins;
    totalXp += wins * 240 + losses * 120;
    scrapBudget += wins * 120 + losses * 48.6;
    dataBudget += wins * 13 + losses * 5.4;
    compBudget += wins * 3 + losses * 1.08;
    if (day === 1) { scrapBudget += 120; dataBudget += 12; compBudget += 20; }  // 新账号一次性初始资源
    scrapBudget -= 25;  // 非研究废料预留（改装等）
    account = meta.applyTrainXp(account, wins * 240 + losses * 120);
    days.push({ day, totalXp, level: account.train.level, points: meta.talentPoints(account),
      scrapBudget, dataBudget, compBudget, balanced: balancedLevel(scrapBudget, dataBudget, compBudget) });
  }
  return days;
}

// -- 标准情景：30 次/天 --------------------------------------------------------
const std = simulate(30);
// 与计算表「两周成长」页逐日锚点对账（XP/等级/均衡研究/三预算）。
const ANCHORS = {
  1: { xp: 5940, lv: 8, pts: 16, balanced: 7, scrap: 2945.3, data: 322.2, comp: 89.84 },
  7: { xp: 43020, lv: 21, pts: 42, balanced: 19, scrap: 20753.9, data: 2274.6, comp: 531.92 },
  14: { xp: 89100, lv: 30, pts: 60, balanced: 30, scrap: 43208.5, data: 4731, comp: 1092.8 },
};
for (const [day, expect] of Object.entries(ANCHORS)) {
  const row = std[day - 1];
  near(row.totalXp, expect.xp, `day ${day} cumulative XP`);
  assert.equal(row.level, expect.lv, `day ${day} train level`);
  assert.equal(row.points, expect.pts, `day ${day} talent points`);
  assert.equal(row.balanced, expect.balanced, `day ${day} balanced research level`);
  near(row.scrapBudget, expect.scrap, `day ${day} research scrap budget`);
  near(row.dataBudget, expect.data, `day ${day} data budget`);
  near(row.compBudget, expect.comp, `day ${day} component budget`);
}
// 终局：Lv30 封顶且累计 XP 超过 85,550 曲线需求；七项 Lv30 满级可支付且留有余量。
const finalRow = std[13];
assert.equal(finalRow.level, 30, 'the standard scenario reaches train Lv30 by day 14');
assert.ok(finalRow.totalXp >= 85550, `day-14 XP ${finalRow.totalXp} covers the 85,550 curve`);
assert.ok(finalRow.scrapBudget >= sevenTo[30].scrap, 'day-14 scrap budget covers all seven tracks to Lv30');
assert.ok(finalRow.dataBudget >= sevenTo[30].data, 'day-14 data budget covers the drone tracks');
assert.ok(finalRow.compBudget >= sevenTo[30].components, 'day-14 component budget covers the train tracks');
const margins = { scrap: finalRow.scrapBudget - sevenTo[30].scrap, data: finalRow.dataBudget - sevenTo[30].data, comp: finalRow.compBudget - sevenTo[30].components };
near(margins.scrap, 928.5, 'scrap margin matches the sheet');
near(margins.data, 658, 'data margin matches the sheet');
near(margins.comp, 184.8, 'component margin matches the sheet');

// 等级曲线中段抽查：模型累计 XP 经 applyTrainXp 得出的等级与表内逐日等级一致。
for (const [day, lv] of [[3, 14], [5, 18], [8, 23], [11, 27]]) assert.equal(std[day - 1].level, lv, `day ${day} level follows the model curve`);

// -- 不看广告情景：22 次/天（计算表 §31.2） -----------------------------------
const noAd = simulate(22);
const noAdFinal = noAd[13];
assert.equal(noAdFinal.level, 26, '22 runs/day lands at train Lv26 on day 14 (§31.2)');
assert.equal(noAdFinal.balanced, 25, '22 runs/day lands at balanced research Lv25 (§31.2)');
assert.ok(noAdFinal.balanced < 30, 'the no-ad path does not complete research by day 14 — the §32 guarantee is still needed (out of scope, see worklog)');

console.log('two-week growth endgame simulation passed: standard day-14 = Lv30 + 7×Lv30 (margins ' + JSON.stringify(margins) + '), no-ad = Lv26/Lv25');
