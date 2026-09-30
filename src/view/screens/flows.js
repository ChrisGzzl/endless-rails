"use strict";
// Run flow overlays: contract and route choice, the level-up / breakthrough
// terminal, the station upgrade stop and the result report. Pure views over
// the models assembled by the flow controller (app/ui-flows.js); node refs
// follow the former DOM element paths for the layout regression checks.
// Elements the stylesheet always hid (train strip, level-up eyebrow and
// footer) are not built at all.

import { uiEl } from "../ui/kit.js";
import { uiSheet } from "./sheet.js";

const flowScreens = (() => {
  const E = uiEl, S = uiSheet;
  // Card and icon styles per data attribute (the former icon-ui / battle-ui rules).
  const LEVEL_CARD = { blue: "upgradeCard_x1", red: "upgradeCard", purple: "upgradeCard_v6", cyan: "upgradeCard_v2" };
  const LEVEL_ICON = { rapid: "upgradeIcon_v15", wingman: "upgradeIcon_v16", piercing: "upgradeIcon_v17", missile: "upgradeIcon_v7", incendiary: "upgradeIcon_v9", chain: "upgradeIcon_v18", ricochet: "upgradeIcon_v19", blades: "upgradeIcon_v8", scatter: "upgradeIcon_v20" };
  const BREAK_ICON = { cluster: "upgradeIcon_v10", heavy: "upgradeIcon_v11", focus: "upgradeIcon_v21", split: "upgradeIcon_v22" };
  const STATION_ICON = { volatile: "upgradeIcon_v13", armor: "upgradeIcon_v14", repair: "upgradeIcon_v23", shield: "upgradeIcon_v12", railgun: "upgradeIcon_v24", cargo: "upgradeIcon_v25", magnet: "upgradeIcon_v26", overclock: "upgradeIcon_v27" };
  const ROUTE_ICON = { dust: "upgradeIcon_v5", sprint: "upgradeIcon_v6", freight: "upgradeIcon_v4" };
  const CONTRACT_ICON = { fragile: "upgradeIcon", pressure: "upgradeIcon_v3", scavenger: "upgradeIcon_v2" };
  const RESULT_BADGE = { won: "resultBadge_v3", extracted: "resultBadge", lost: "resultBadge_v2" };

  // -- contract / route ------------------------------------------------------------------------

  function choiceScreen(key, listKey, head, footer, cards, icons, onPick) {
    return E({ ...S.eventScreen, key, ref: "", modal: true },
      E({ ...S.selectionTerminal, ref: "/0" },
        E({ ...S.stationHeading, ref: "/0/0" },
          E({ ...S.eyebrow_v3, ref: "/0/0/0" }, E({ ...S.eyebrow_before, tag: "::before" }), head[0]),
          E({ ...S.cloudTitle, ref: "/0/0/1" }, head[1]),
          E({ ...S.stationHeading_p, ref: "/0/0/2" }, head[2])),
        E({ ...S.upgradeList, key: listKey, ref: "/0/1" },
          cards.map((c, i) => E({ tag: "button", ...S.upgradeCard_v3, key: `${listKey}-${i}`, ref: "/0/1/" + i, onTap: () => onPick(i), tapSound: false, role: "button" },
            E({ ...(S[icons[c.icon]] || S.upgradeIcon), ref: `/0/1/${i}/0` }, c.glyph),
            E({ ...S.upgradeCard_span, ref: `/0/1/${i}/1` },
              E({ ...S.upgradeCard_h3, ref: `/0/1/${i}/1/0` }, c.name),
              E({ ...S.upgradeCard_p, ref: `/0/1/${i}/1/1` }, c.text))))),
        E({ ...S.terminalFooter, ref: "/0/2" },
          E({ ...S.inspectPage, ref: "/0/2/0" }, E({ ...S.terminalStatus_before, tag: "::before" }), footer),
          E({ ...S.terminalFooter_span, ref: "/0/2/1" }, "三选一"))));
  }
  function contract(m) {
    return choiceScreen("contractScreen", "contractList", ["远征指挥部 / 契约授权", "签订远征契约", "更高风险，换取更高回报。"],
      "选择一份契约 · 本次远征生效", m.cards.map(c => ({ icon: c.id, glyph: "◆", name: c.name, text: c.description })), CONTRACT_ICON, m.pick);
  }
  function route(m) {
    return choiceScreen("eventScreen", "eventList", ["轨道导航 / 路线规划", "选择前方路线", "路线会改变地面、敌群和掉落。"],
      "选择一条路线 · 即刻发车", m.cards.map(c => ({ icon: c.id, glyph: c.weather === "dust" ? "≈" : c.weather === "speed" ? "»" : "▣", name: c.name, text: c.text })), ROUTE_ICON, m.pick);
  }

  // -- level up / breakthrough -------------------------------------------------------------------

  function levelUp(m) {
    const breakthrough = m.kind === "breakthrough";
    return E({ ...S.levelUpScreen, key: "levelUpScreen", ref: "", modal: true },
      E({ ...S.selectionTerminal_v2, ref: "/0" },
        E({ ...S.levelHealth, ref: "/0/0" },
          E({ ...S.levelHealth_span, ref: "/0/0/0" }, "▣"),
          E({ ...S.levelHealth_b, ref: "/0/0/1" }, "列车耐久"),
          E({ ...S.levelHealth_i, ref: "/0/0/2" },
            E({ ...S.levelTrainHealthFill, width: m.healthPercent + "%", key: "levelTrainHealthFill", ref: "/0/0/2/0" })),
          E({ ...S.levelTrainHealthText, key: "levelTrainHealthText", ref: "/0/0/3" }, m.healthText)),
        E({ ...S.levelupHeading, ref: "/0/1" },
          E({ ...S.levelupHeading_h2, ref: "/0/1/1" }, m.title),
          E({ tag: "button", ...S.levelInspectButton, key: "levelInspectButton", ref: "/0/1/3", onTap: m.inspect }, "查看机队数据")),
        E({ ...(breakthrough ? S.levelUpList_v2 : S.levelUpList), key: "levelUpList", ref: "/0/2" },
          m.cards.map((c, i) => E({ tag: "button", ...(S[LEVEL_CARD[c.family]] || S.upgradeCard_x1), key: "levelCard-" + i, ref: "/0/2/" + i, onTap: () => m.pick(i), tapSound: false, title: c.title || null, role: "button" },
            E({ ...(S[breakthrough ? BREAK_ICON[c.icon] : LEVEL_ICON[c.icon]] || S[LEVEL_ICON[c.weapon]] || S.upgradeIcon_v15), ref: `/0/2/${i}/0` }, c.glyph),
            E({ ...S.upgradeCard_span_v2, ref: `/0/2/${i}/1` },
              E({ ...S.upgradeCard_h3_v2, ref: `/0/2/${i}/1/0` },
                c.small ? c.name + " " : c.name,
                c.small ? E({ ...S.upgradeCard_small, ref: `/0/2/${i}/1/0/0` }, c.small) : null),
              E({ ...S.upgradeCard_p_v2, ref: `/0/2/${i}/1/1` }, c.text)),
            c.scope ? E({ ...S.upgradeCard_after, tag: "::after" }, c.scope) : null)))));
  }

  // -- station -------------------------------------------------------------------------------------

  function station(m) {
    return E({ ...S.stationScreen, key: "stationScreen", ref: "", modal: true },
      E({ ...S.selectionTerminal_v3, ref: "/0" },
        E({ ...S.stationHeading_v2, ref: "/0/0" },
          E({ ...S.eyebrow_v4, ref: "/0/0/0" },
            E({ ...S.eyebrow_before, tag: "::before" }),
            "安全停靠 · ",
            E({ ...S.inspectPage, key: "stationTitle", ref: "/0/0/0/0" }, m.stationTitle),
            " / 04"),
          E({ ...S.stationHeading_h2_v2, ref: "/0/0/1" }, "车站大升级"),
          E({ ...S.stationHeading_p_v2, ref: "/0/0/2" }, "免费选择一项 · 列车完整度已修复"),
          E({ tag: "button", ...S.stationInspectButton, key: "stationInspectButton", ref: "/0/0/3", onTap: m.inspect }, "查看机队数据")),
        E({ ...S.upgradeList, key: "upgradeList", ref: "/0/1" },
          m.cards.map((c, i) => E({ tag: "button", ...(c.selected ? S.upgradeCard_selected : S.upgradeCard_v3), key: "stationCard-" + i, ref: "/0/1/" + i, onTap: () => m.select(i), tapSound: false, role: "button" },
            E({ ...(S[STATION_ICON[c.id]] || S.upgradeIcon_v13), ref: `/0/1/${i}/0` }, c.glyph),
            E({ ...S.upgradeCard_span, ref: `/0/1/${i}/1` },
              E({ ...S.upgradeCard_h3, ref: `/0/1/${i}/1/0` }, c.name + " ", E({ ...S.upgradeCard_small_v2, ref: `/0/1/${i}/1/0/0` }, c.small)),
              E({ ...S.upgradeCard_p, ref: `/0/1/${i}/1/1` }, c.text))))),
        E({ ...S.stationActions, ref: "/0/2" },
          E({ tag: "button", ...S.rerollButton, key: "rerollButton", ref: "/0/2/0", disabled: m.rerollDisabled, onTap: m.reroll },
            E({ ...S.rerollButton_before, tag: "::before" }),
            "重新抽取 · 15 废料"),
          E({ ...S.stationSalvage, key: "stationSalvage", ref: "/0/2/2" }, m.salvage),
          E({ ...S.stationDecisionRow, ref: "/0/2/3" },
            m.extractHidden ? null : E({ tag: "button", ...S.extractButton, key: "extractButton", ref: "/0/2/3/0", disabled: m.extractDisabled, onTap: m.extract }, "安全撤离"),
            E({ tag: "button", ...S.continueButton, key: "continueButton", ref: "/0/2/3/1", disabled: m.continueDisabled, onTap: m.depart }, m.continueText)))));
  }

  // -- result ---------------------------------------------------------------------------------------

  function result(m) {
    const d = m.damage;
    const row = (text, value, ref) => E({ ...S.resultTrainDamage_span, ref }, text, E({ ...S.resultTrainDamage_em, ref: ref + "/0" }, String(value)));
    return E({ ...S.resultScreen, key: "resultScreen", ref: "", modal: true, scrollKey: "resultScreen" },
      E({ ...(S[RESULT_BADGE[m.outcome]] || S.resultBadge), key: "resultBadge", ref: "/0" }),
      E({ ...S.resultEyebrow, key: "resultEyebrow", ref: "/1" }, m.eyebrow),
      E({ ...S.resultTitle, key: "resultTitle", ref: "/2" }, m.title),
      E({ ...S.resultCopy, key: "resultCopy", ref: "/3" }, m.copy),
      E({ ...S.resultStats, ref: "/4" },
        E({ ...S.resultStats_div, ref: "/4/0" }, E({ ...S.resultStats_span, ref: "/4/0/0" }, "击破"), E({ ...S.resultScrap, key: "resultKills", ref: "/4/0/1" }, String(m.kills))),
        E({ ...S.resultStats_div_v2, ref: "/4/1" }, E({ ...S.resultStats_span, ref: "/4/1/0" }, "抵达"), E({ ...S.resultScrap, key: "resultStations", ref: "/4/1/1" }, String(m.stations))),
        E({ ...S.resultStats_div_v2, ref: "/4/2" }, E({ ...S.resultStats_span, ref: "/4/2/0" }, "废料"), E({ ...S.resultScrap, key: "resultScrap", ref: "/4/2/1" }, String(m.scrap)))),
      E({ ...S.resultDamage, ref: "/5" },
        E({ ...S.resultDamage_h3, ref: "/5/0" }, "伤害统计"),
        E({ ...S.damageNote, ref: "/5/1" }, "只计实际扣血；突破后的攻击仍计普攻。蓝色激光单独归入蓝色穿透。"),
        E({ ...S.damageColumns, ref: "/5/2" },
          E({ ...S.resultTrainDamage, ref: "/5/2/0" },
            E({ ...S.bondDamageColumn_b, ref: "/5/2/0/0" }, "飞机编队"),
            E({ ...S.resultTrainDamage, key: "resultDroneDamage", ref: "/5/2/0/1" },
              d.drones.length ? d.drones.map((r, i) => row(`${r.label} · 普攻`, r.damage, "/5/2/0/1/" + i))
                : E({ ...S.resultTrainDamage_span, ref: "/5/2/0/1/0" }, "暂无记录"))),
          E({ ...S.bondDamageColumn, ref: "/5/2/1" },
            E({ ...S.bondDamageColumn_b, ref: "/5/2/1/0" }, "北辰 · 羁绊攻击"),
            E({ ...S.resultTrainDamage, key: "resultBondDamage", ref: "/5/2/1/1" },
              d.bonds.map((b, i) => E({ ...S.resultTrainDamage, ref: "/5/2/1/1/" + i },
                row(`${b.name} · ${b.stage}`, b.damage, `/5/2/1/1/${i}/0`),
                E({ ...S.bondResult_small, ref: `/5/2/1/1/${i}/1` }, `北辰释放 ${b.casts} 次 · 击杀 ${b.kills}`))))),
          E({ ...S.resultTrainDamage, ref: "/5/2/2" },
            E({ ...S.bondDamageColumn_b, ref: "/5/2/2/0" }, "列车系统"),
            E({ ...S.resultTrainDamage, key: "resultTrainDamage", ref: "/5/2/2/1" },
              row("车炮　", d.train, "/5/2/2/1/0"),
              row("近防　", d.pointDefense, "/5/2/2/1/1"),
              row("有效维修　", d.effectiveRepair, "/5/2/2/1/2"))))),
      E({ ...S.resultRecord, key: "resultBuild", ref: "/6" }, m.build),
      E({ ...S.resultMeta, key: "resultMeta", ref: "/7" }, m.meta),
      E({ ...S.resultRecord, key: "resultRecord", ref: "/8" }, m.record),
      E({ tag: "button", ...S.restartButton, key: "restartButton", ref: "/9", onTap: m.restart }, "返回出发主页"));
  }

  return { contract, route, levelUp, station, result };
})();

export { flowScreens };
