"use strict";
// Pause terminal (fleet telemetry): summary, display actions, the unit
// picker, tabs, one page of stats and the resume rail. The select box shows
// the chosen unit like the closed native <select>; tapping it opens the
// option list layer built by `optionList`.

import { uiEl } from "../ui/kit.js";
import { uiSheet } from "./sheet.js";

const pauseScreen = (() => {
  const E = uiEl, S = uiSheet;
  const PORTRAIT = { gun: "inspectPortrait", missile: "inspectPortrait_v3", incendiary: "inspectPortrait_v4", blades: "inspectPortrait_v5", ricochet: "inspectPortrait_v6", chain: "inspectPortrait_v7", scatter: "inspectPortrait_v8", piercing: "inspectPortrait_v9", command: "inspectPortrait_v10" };
  const PORTRAIT_BREAK = { gun: "inspectPortrait_v11", missile: "inspectPortrait_v12", incendiary: "inspectPortrait_v13", blades: "inspectPortrait_v14", ricochet: "inspectPortrait_v15", chain: "inspectPortrait_v16", scatter: "inspectPortrait_v17", piercing: "inspectPortrait_v18" };
  const TABS = [["inspectWeapon", "weapon", "武器参数"], ["inspectStatus", "status", "作战状态"], ["inspectUpgrade", "upgrade", "下级变化"], ["inspectGlobal", "global", "全队构筑"]];

  function build(m) {
    const portrait = (m.portrait.breakthrough ? PORTRAIT_BREAK : PORTRAIT)[m.portrait.kind] || S.inspectPortrait;
    return E({ ...S.pauseScreen, key: "pauseScreen", ref: "", modal: true },
      E({ ...S.fleetTerminal, key: "fleetTerminal", ref: "/0" },
        E({ ...S.pauseHeading, ref: "/0/0" },
          E({ ...S.eyebrow_v5, ref: "/0/0/0" }, E({ ...S.eyebrow_before_v2, tag: "::before" }), "战斗暂停 / 机队遥测"),
          E({ ...S.cloudTitle, key: "pauseTitle", ref: "/0/0/1" }, "机队战术终端"),
          E({ ...S.pauseSummary, key: "pauseSummary", ref: "/0/0/2" }, m.summary)),
        E({ ...S.displayActions_pauseDisplay, ref: "/0/1" },
          E({ tag: "button", ...S.pauseFullscreenButton, key: "pauseFullscreenButton", ref: "/0/1/0", disabled: m.fullscreen.disabled, label: m.fullscreen.label, onTap: m.on.fullscreen }, m.fullscreen.text),
          m.installHidden ? null : E({ tag: "button", ...S.pauseInstallButton, key: "pauseInstallButton", ref: "/0/1/1", onTap: m.on.install }, "添加到主屏幕"),
          E({ tag: "button", ...S.pauseSettingsButton, key: "pauseSettingsButton", ref: "/0/1/2", onTap: m.on.settings }, "设置")),
        E({ ...S.inspectUnit, ref: "/0/2" },
          E({ ...(typeof portrait === "string" ? S[portrait] : portrait), key: "inspectPortrait", ref: "/0/2/0" }),
          E({ ...S.inspectUnit_div, ref: "/0/2/1" },
            E({ ...S.inspectUnit_label, ref: "/0/2/1/0" }, "查看飞机"),
            E({ ...S.inspectSelect, key: "inspectSelect", ref: "/0/2/1/1", onTap: m.on.openSelect, tapSound: false, role: "combobox", label: "查看飞机" },
              E({ display: "block", overflowX: "hidden", overflowY: "hidden", whiteSpace: "pre", pointerEvents: "none" }, m.selectText)),
            E({ ...S.inspectRole, key: "inspectRole", ref: "/0/2/1/2" }, m.role)),
          E({ ...S.inspectArrows, ref: "/0/2/2" },
            E({ tag: "button", ...S.inspectNext, key: "inspectPrev", ref: "/0/2/2/0", onTap: m.on.prevUnit, label: "上一架飞机" }, E({ ...S.inspectPrevPage_before, tag: "::before" }), "‹"),
            E({ tag: "button", ...S.inspectNext, key: "inspectNext", ref: "/0/2/2/1", onTap: m.on.nextUnit, label: "下一架飞机" }, E({ ...S.inspectNextPage_before, tag: "::before" }), "›"))),
        E({ ...S.telemetryDeck, ref: "/0/3" },
          E({ ...S.inspectTabs, ref: "/0/3/0" },
            TABS.map(([key, tab, text], i) => E({ tag: "button", ...(m.tab === tab ? S.inspectUpgrade_v2 : S.inspectWeapon_v2), key, ref: "/0/3/0/" + i, onTap: () => m.on.tab(tab), role: "button" }, text))),
          E({ ...S.inspectViewport, key: "inspectViewport", ref: "/0/3/1" },
            E({ ...S.inspectStats, key: "inspectStats", ref: "/0/3/1/0" },
              m.rows.map(([label, value], i) => E({ ...S.inspectStat, ref: "/0/3/1/0/" + i },
                E({ ...S.inspectStat_dt, ref: `/0/3/1/0/${i}/0` }, String(label)),
                E({ ...S.inspectStat_dd, ref: `/0/3/1/0/${i}/1` }, String(value)))))),
          E({ ...S.inspectPageNav, key: "inspectPageNav", ref: "/0/3/2" },
            E({ tag: "button", ...S.inspectNextPage, key: "inspectPrevPage", ref: "/0/3/2/0", disabled: m.prevDisabled, onTap: m.on.prevPage, label: "上一页数据" }, E({ ...S.inspectPrevPage_before, tag: "::before" }), "‹"),
            E({ ...S.inspectPage, key: "inspectPage", ref: "/0/3/2/1" }, m.pageText),
            E({ tag: "button", ...S.inspectNextPage, key: "inspectNextPage", ref: "/0/3/2/2", disabled: m.nextDisabled, onTap: m.on.nextPage, label: "下一页数据" }, E({ ...S.inspectNextPage_before, tag: "::before" }), "›")),
          E({ ...S.inspectNote, key: "inspectNote", ref: "/0/3/3" }, m.note)),
        E({ ...S.fleetActions, ref: "/0/4" },
          E({ tag: "button", ...S.resumeButton, key: "resumeButton", ref: "/0/4/0", onTap: m.on.resume }, m.resumeText))));
  }

  // The opened option list of the unit picker, anchored under the select
  // box (or above it when there is no room), in the select's own colours.
  function optionList(m, anchor, vw, vh) {
    const rowH = 30, pad = 4;
    const h = Math.min(vh - 16, m.options.length * rowH + pad * 2);
    const w = Math.max(anchor.w, 160);
    let top = anchor.y + anchor.h + 2;
    if (top + h > vh - 8) top = Math.max(8, anchor.y - h - 2);
    const left = Math.max(8, Math.min(vw - w - 8, anchor.x));
    return E({ position: "fixed", top: 0, left: 0, width: vw, height: vh, key: "inspectSelectLayer", modal: true, onTap: m.on.closeSelect, tapSound: false },
      E({ position: "absolute", left, top, width: w, maxHeight: h, overflowY: "auto", boxSizing: "border-box", paddingTop: pad, paddingBottom: pad,
        backgroundColor: "rgb(238, 228, 210)", border: "1px solid rgb(199, 185, 158)", borderRadius: 4, boxShadow: "0 8px 24px rgba(14, 39, 57, 0.3)",
        fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif', fontSize: 13, fontWeight: 600, color: "rgb(43, 65, 65)", key: "inspectSelectList", onTap: () => {}, focusable: false, tapSound: false },
        m.options.map((o, i) => E({ key: "inspectOption-" + i, display: "block", height: rowH, lineHeight: rowH + "px", paddingLeft: 8, paddingRight: 8, whiteSpace: "pre", overflowX: "hidden",
          backgroundColor: o.selected ? "rgb(169, 212, 217)" : "transparent", ":hover": { backgroundColor: "rgba(169, 212, 217, 0.55)" }, onTap: () => m.on.pick(o.value), tapSound: false, role: "option" }, o.label))));
  }

  return { build, optionList };
})();

export { pauseScreen };
