"use strict";
// Expedition base (the start screen): header wallet, the five tab panes
// (battle / train + workshop / research / shop / settings) and the tab dock.
// Pure view: takes the model assembled by the home controller and returns a
// canvas UI node tree. Node `ref`s follow the former DOM element paths so the
// layout can be regression-checked element by element.

import { uiEl } from "../ui/kit.js";
import { uiSheet } from "./sheet.js";
import { uiIcons } from "./icons.js";

const homeScreen = (() => {
  const E = uiEl, S = uiSheet, icon = uiIcons.icon;
  const TABS = [
    ["shop", "homeTabShop", "商店", "shop"],
    ["train", "homeTabTrain", "列车", "trainNav"],
    ["battle", "homeTabBattle", "出发", "battle"],
    ["research", "homeTabResearch", "研究", "research"],
    ["settings", "startSettingsButton", "设置", "settings"],
  ];
  // Region thumbnails and the heading watermark are cells of one strip.
  const REGION_POS = { wasteland: "0%", ruins: "33.333333%", industrial: "66.666667%", infection: "100%" };

  function header(m) {
    return E({ ...S.homeHeader, ref: "/0", tag: "header.home-header" },
      E({ ...S.homeProfile, ref: "/0/0" },
        E({ ...S.homeEmblem, ref: "/0/0/0" }, "ER"),
        E({ ...S.homeProfile_div, ref: "/0/0/1" },
          E({ ...S.homeProfile_b, ref: "/0/0/1/0" }, "荒原轨道"),
          E({ ...S.homePlayerLevel, key: "homePlayerLevel", ref: "/0/0/1/1" }, m.trainLevelText))),
      E({ ...S.homeWallet, ref: "/0/1" },
        m.wallet.map((w, i) => E({ ...S.homeWallet_span, ref: "/0/1/" + i, title: w.title },
          E({ ...S["uiIcon_uiIcon_" + w.iconStyle], ref: `/0/1/${i}/0` }),
          E({ ...S[w.valueStyle], key: w.valueKey, ref: `/0/1/${i}/1` }, w.value),
          E({ ...S.homeWallet_small, ref: `/0/1/${i}/2` }, w.label)))));
  }

  // -- battle ---------------------------------------------------------------------------------

  function regionCard(r, i, m) {
    const sel = r.selected;
    const card = sel ? S.metaCard_metaRegion_selected : S.metaCard_metaRegion;
    const before = { ...(sel ? S.metaCard_metaRegion_selected_before : S.metaCard_metaRegion_before), backgroundPosition: REGION_POS[r.id] + " 50%" };
    return E({ tag: "button", ...card, key: "region-" + r.id, ref: "/1/0/2/0/" + i, disabled: !r.unlocked, onTap: r.unlocked ? () => m.on.selectRegion(r.id) : null, focusable: r.unlocked },
      E({ ...before, tag: "::before" }),
      E({ ...(sel ? S.metaCard_b : S.metaCard_b_v2), ref: `/1/0/2/0/${i}/0` }, r.name),
      E({ ...(sel ? S.metaCard_small : S.metaCard_small_v2), ref: `/1/0/2/0/${i}/1` }, r.tag),
      sel ? E({ ...S.metaCard_metaRegion_selected_after, tag: "::after" }) : null);
  }
  function battlePane(m) {
    const L = m.loadout;
    return E({ ...S.homeBattle, key: "homeBattle", ref: "/1/0" },
      E({ ...S.missionHeading, ref: "/1/0/0" },
        E({ ...S.missionHeading_before, backgroundPosition: REGION_POS[m.region] + " 50%", tag: "::before" }),
        E({ ...S.eyebrow, ref: "/1/0/0/0" }, "RAILWAY EXPEDITION / 铁路远征"),
        E({ ...S.homeRegionName, key: "homeRegionName", ref: "/1/0/0/1" },
          m.regionName,
          E({ ...S.homeRegionName_after, tag: "::after" })),
        E({ ...S.homeRegionDescription, key: "homeRegionDescription", ref: "/1/0/0/2" }, m.regionDescription)),
        E({ ...S.homeKeyart, ref: "/1/0/1" },
          E({ ...S.homeHeroImage, key: "homeHeroImage", ref: "/1/0/1/0", image: m.heroPath, intrinsicW: 768, intrinsicH: 432, label: m.heroAlt }),
          E({ ...S.homeRouteMark, ref: "/1/0/1/1" }, m.routeMark || "01 — 05"),
        E({ ...S.missionStamp, ref: "/1/0/1/2" },
          E({ ...S.homeRegionStatus, key: "homeRegionStatus", ref: "/1/0/1/2/0" }, m.regionStatus),
          E({ ...S.missionStamp_b, ref: "/1/0/1/2/1" }, "护送最后一班列车")),
        E({ ...S.homeKeyart_after, tag: "::after" })),
      E({ ...S.missionLaunch, ref: "/1/0/2" },
        E({ ...S.metaRegionList, key: "metaRegionList", ref: "/1/0/2/0" }, m.regions.map((r, i) => regionCard(r, i, m))),
        E({ tag: "button", ...S.homeLoadout, key: "homeLoadout", ref: "/1/0/2/1", onTap: m.on.openTrain, label: L.label },
          E({ ...icon(S.uiIcon_uiIcon_Train, "train"), ref: "/1/0/2/1/0" }),
          E({ ...S.loadoutCopy, ref: "/1/0/2/1/1" },
            E({ ...S.loadoutCopy_b, ref: "/1/0/2/1/1/0" }, `编组 ${L.trainLength} 节 · ${L.damage}`),
            E({ ...S.loadoutCopy_small, ref: "/1/0/2/1/1/1" }, `${L.support} · 调整 →`)),
          E({ ...S.loadoutCars, ref: "/1/0/2/1/2" },
            Array.from({ length: Math.min(4, L.trainLength) }, (_, i) => E({ ...icon(S.uiIcon_uiIcon_Train_v2, "train"), ref: "/1/0/2/1/2/" + i })),
            L.trainLength > 4 ? E({ ...S.loadoutCars_small, ref: "/1/0/2/1/2/4" }, "+" + (L.trainLength - 4)) : null),
          E({ ...S.loadoutArrow, ref: "/1/0/2/1/3" }, "›")),
        E({ tag: "button", ...S.startButton, key: "startButton", ref: "/1/0/2/2", disabled: m.art.startDisabled, onTap: m.on.start },
          E({ ...S.startButton_before, tag: "::before" }),
          E({ ...S.startButton_span, ref: "/1/0/2/2/0" }, m.startButtonText || "开始远征"),
          E({ ...S.startButton_span_v2, ref: "/1/0/2/2/1" }, "»")),
        E({ ...S.missionNote, ref: "/1/0/2/3" }, m.missionNote || "5 段护送 · 每段 60 秒 · 到站可安全撤离"),
        m.art.statusHidden ? null : E({ ...S.artStatus, key: "artStatus", ref: "/1/0/2/4" }, m.art.statusText),
        m.art.retryHidden ? null : E({ tag: "button", ...S.retryArtButton, key: "retryArtButton", ref: "/1/0/2/5", onTap: m.on.retryArt }, "重新加载素材")));
  }

  // -- train ----------------------------------------------------------------------------------------

  function sectionHead(style, ref, title, span, spanKey) {
    return E({ ...style, ref },
      E({ ...S.metaSection__head_b, ref: ref + "/0" },
        E({ ...S.metaSection__head_b_before, tag: "::before" }, "›"),
        title),
      E({ ...(spanKey ? S[spanKey] : S.metaSection__head_span), key: spanKey || undefined, ref: ref + "/1" }, span));
  }
  function trainPane(m) {
    const T = m.train;
    const base = "/1/1";
    return E({ ...S.metaScreen, key: "metaScreen", ref: base },
      E({ ...S.homePageHeading, ref: base + "/0" },
        E({ ...S.eyebrow_v2, ref: base + "/0/0" }, "TRAIN WORKSHOP"),
        E({ ...S.homePageHeading_h2, ref: base + "/0/1" }, "我的列车"),
        E({ ...S.homePageHeading_p, ref: base + "/0/2" }, "升级列车获得改装点，选择车厢决定远征方式。")),
      E({ ...S.trainShowcase, ref: base + "/1" },
        E({ ...S.trainShowcase__art, ref: base + "/1/0" },
          E({ ...S.trainShowcase__route, ref: base + "/1/0/0" }, "ENDLESS RAILS / 01"),
          E({ ...S.trainShowcase__art_after, tag: "::after" })),
        E({ ...S.trainShowcase__body, ref: base + "/1/1" },
          E({ ...S.trainShowcase__body_div, ref: base + "/1/1/0" },
            E({ ...S.trainShowcase__body_small, ref: base + "/1/1/0/0" }, "远征列车"),
            E({ ...S.metaTrainLevel, key: "metaTrainLevel", ref: base + "/1/1/0/1" }, T.levelText),
            E({ ...S.metaTalentPoints, key: "metaTalentPoints", ref: base + "/1/1/0/2" }, T.pointsText)),
          E({ ...S.trainShowcase__stats, ref: base + "/1/1/1" },
            E({ ...S.trainFirepower, key: "trainFirepower", ref: base + "/1/1/1/0" }, T.fireText),
            E({ ...S.trainDurability, key: "trainDurability", ref: base + "/1/1/1/1" }, T.hullText)),
          E({ tag: "button", ...S.metaTrainUpgradeButton, key: "metaTrainUpgradeButton", ref: base + "/1/1/2", disabled: T.upgradeDisabled, onTap: m.on.trainUpgrade, label: T.upgradeLabel }, T.upgradeText),
          E({ ...S.trainUpgradeHint, key: "trainUpgradeHint", ref: base + "/1/1/3" },
            T.hint.short
              ? [`每级 +2 改装点 · 废料 `, E({ ...S.resourceShort, ref: base + "/1/1/3/0" }, String(T.hint.cost)), `（差 ${T.hint.gap}）`]
              : T.hint.text))),
      E({ ...S.trainBuildPreview, ref: base + "/2" },
        sectionHead(S.metaSection__head, base + "/2/0", "当前编组", T.buildCount, "trainBuildCount"),
        E({ ...S.trainBuildCars, key: "trainBuildCars", ref: base + "/2/1" },
          T.buildCars.map((car, i) => E({ ...S.trainBuildCars_span, ref: `${base}/2/1/${i}` },
            E({ ...icon(S.uiIcon_uiIcon_PointDefense, car.id), ref: `${base}/2/1/${i}/0` }),
            E({ ...S.trainBuildCars_b, ref: `${base}/2/1/${i}/1` }, car.name))),
          T.emptySlot ? E({ ...S.trainBuildPreview__empty, ref: `${base}/2/1/${T.buildCars.length}` },
            E({ ...S.trainBuildPreview__empty_b, ref: `${base}/2/1/${T.buildCars.length}/0` }, "＋ 空车位")) : null),
        E({ tag: "button", ...S.trainWorkshopOpen, key: "trainWorkshopOpen", ref: base + "/2/2", onTap: m.on.openWorkshop },
          "打开改装台 ",
          E({ ...S.trainWorkshopOpen_span, ref: base + "/2/2/0" }, "›"))),
      m.workshopOpen ? workshop(m, base + "/3") : null,
      E({ tag: "button", ...S.metaStartButton, key: "metaStartButton", ref: base + "/4", onTap: m.on.toBattle }, "编组完成 · 前往出发 →"));
  }
  function workshop(m, base) {
    const W = m.workshop;
    return E({ ...S.trainWorkshop, key: "trainWorkshop", ref: base },
      E({ ...S.trainWorkshop__head, ref: base + "/0" },
        E({ ...S.trainWorkshop__head_div, ref: base + "/0/0" },
          E({ ...S.trainWorkshop__head_small, ref: base + "/0/0/0" }, "WORKSHOP / 改装台"),
          E({ ...S.trainWorkshop__head_h3, ref: base + "/0/0/1" }, "车厢与天赋"),
          E({ ...S.trainWorkshop__head_p, ref: base + "/0/0/2" }, "选择车厢、分配改装点，最后应用草稿。")),
        E({ tag: "button", ...S.trainWorkshopClose, key: "trainWorkshopClose", ref: base + "/0/1", onTap: m.on.closeWorkshop, label: "收起改装台" }, "收起")),
      E({ ...S.talentPresetBar, key: "talentPresetBar", ref: base + "/1" },
        W.presets.map((p, i) => E({ ...S.talentPreset, ref: `${base}/1/${i}` },
          E({ tag: "button", ...S.talentPreset__load, key: "presetLoad" + i, ref: `${base}/1/${i}/0`, onTap: () => m.on.presetLoad(i) },
            E({ ...S.talentPreset__load_b, ref: `${base}/1/${i}/0/0` }, p.name),
            E({ ...S.talentPreset__load_small, ref: `${base}/1/${i}/0/1` }, p.detail)),
          E({ ...S.talentPreset__actions, ref: `${base}/1/${i}/1` },
            E({ tag: "button", ...S.talentPreset__rename, key: "presetRename" + i, ref: `${base}/1/${i}/1/0`, onTap: () => m.on.presetRename(i), label: "重命名" + p.name }, "改名"),
            E({ tag: "button", ...S.talentPreset__save, key: "presetSave" + i, ref: `${base}/1/${i}/1/1`, onTap: () => m.on.presetSave(i), label: "保存当前草稿到" + p.name }, p.confirm ? "确认" : "保存"))))),
      sectionHead(S.metaSection__head_v2, base + "/2", "功能车厢", "调整草稿 · 应用后生效"),
      E({ ...S.metaLoadoutSummary, key: "metaLoadoutSummary", ref: base + "/3" }, W.loadoutSummary),
      E({ ...S.metaCarList, key: "metaCarList", ref: base + "/4" },
        W.cars.map((car, i) => {
          const b = `${base}/4/${i}`;
          return E({ tag: "button", ...(car.active ? S.metaCard_metaCar_selected : S.metaCard_metaCar), key: "car-" + car.id, ref: b, disabled: car.disabled, onTap: car.disabled ? null : () => m.on.toggleCar(car.id) },
            E({ ...S.metaCard__icon, ref: b + "/0" }, E({ ...icon(S.uiIcon_uiIcon_Storage, car.id), ref: b + "/0/0" })),
            E({ ...S.metaCard_span, ref: b + "/1" },
              E({ ...S.metaCard_b_v3, ref: b + "/1/0" }, car.name),
              E({ ...S.metaCard_small_v3, ref: b + "/1/1" }, car.stateText),
              E({ ...S.metaCard_em, ref: b + "/1/2" }, car.description)));
        })),
      E({ ...S.metaSection__head_v2, ref: base + "/5" },
        E({ ...S.metaSection__head_b, ref: base + "/5/0" },
          E({ ...S.metaSection__head_b_before, tag: "::before" }, "›"),
          "列车改装"),
        E({ ...S.talentBranchNote, key: "talentBranchNote", ref: base + "/5/1" }, W.branchNote)),
      E({ ...S.talentBranchTabs, key: "talentBranchTabs", ref: base + "/6" },
        W.branches.map((br, i) => {
          const style = br.active ? (br.inactive ? S.talentBranchTab_active_unequipped : S.talentBranchTab_active) : (br.inactive ? S.talentBranchTab_unequipped : S.talentBranchTab);
          return E({ tag: "button", ...style, key: "branch-" + br.id, ref: `${base}/6/${i}`, onTap: () => m.on.branch(br.id), label: br.label },
            br.name + " ",
            E({ ...(br.active ? S.talentBranchTab_b : S.talentBranchTab_b_v2), ref: `${base}/6/${i}/0` }, `${br.spent}/${br.cap}`));
        })),
      E({ ...S.talentNodeList, key: "talentNodeList", ref: base + "/7" },
        W.nodes.map((n, i) => {
          const b = `${base}/7/${i}`;
          return E({ ...(n.owned ? S.talentNode_owned : S.talentNode), ref: b },
            E({ ...S.talentNode__copy, ref: b + "/0" },
              E({ ...S.talentNode__copy_b, ref: b + "/0/0" }, n.name),
              E({ ...S.talentNode__level, ref: b + "/0/1" }, n.levelText),
              E({ ...S.talentNode__copy_em, ref: b + "/0/2" }, n.effect)),
            E({ ...S.talentNode__controls, ref: b + "/1" },
              E({ tag: "button", ...S.talentNode__controls_button, key: "minus-" + n.id, ref: b + "/1/0", disabled: n.minusDisabled, onTap: () => m.on.minus(n.id), label: "减少" + n.name }, "−"),
              E({ ...S.talentNode__controls_b, ref: b + "/1/1" }, String(n.level)),
              E({ tag: "button", ...S.talentNode__controls_button_v2, key: "plus-" + n.id, ref: b + "/1/2", disabled: n.plusDisabled, onTap: () => m.on.plus(n.id), label: "增加" + n.name }, "＋")));
        }),
        W.spec ? specRow(m, W.spec, `${base}/7/${W.nodes.length}`) : null),
      summary(m, base + "/8"));
  }
  function specRow(m, spec, b) {
    return E({ ...(spec.owned ? S.talentSpec : S.talentSpec_locked), ref: b },
      E({ ...S.talentNode__copy, ref: b + "/0" },
        E({ ...S.talentNode__copy_b, ref: b + "/0/0" }, spec.title),
        E({ ...S.talentNode__copy_small, ref: b + "/0/1" }, spec.note)),
      spec.options.map((o, i) => E({ tag: "button", ...(!spec.owned ? S.talentSpec__option : o.active ? S.talentSpec__option_active : S.talentSpec__option_v2), key: "spec-" + o.id, ref: `${b}/${i + 1}`, disabled: !spec.owned, onTap: () => m.on.spec(o.id) },
        E({ ...(spec.owned && o.active ? S.talentSpec__option_b_v2 : S.talentSpec__option_b), ref: `${b}/${i + 1}/0` }, o.name),
        E({ ...S.talentSpec__option_small, ref: `${b}/${i + 1}/1` }, o.desc))));
  }
  function summary(m, b) {
    const s = m.workshop.summary;
    return E({ ...S.talentSummary, key: "talentSummary", ref: b },
      E({ ...S.talentSummary__title, ref: b + "/0" }, "改装预览"),
      E({ ...S.talentSummaryRows, key: "talentSummaryRows", ref: b + "/1" },
        s.rows.map((line, i) => E({ ...S.talentSummaryRows_span, ref: `${b}/1/${i}` }, line))),
      E({ ...S.talentSummary__foot, ref: b + "/2" },
        E({ ...(s.pointsBad ? S.talentPointsLine_v2 : S.talentPointsLine), key: "talentPointsLine", ref: b + "/2/0" }, s.pointsText),
        E({ ...S.talentCostLine, key: "talentCostLine", ref: b + "/2/1" }, s.costText),
        E({ tag: "button", ...S.talentReset, key: "talentReset", ref: b + "/2/2", disabled: s.resetDisabled, onTap: m.on.reset }, "重置"),
        E({ tag: "button", ...S.talentApply, key: "talentApply", ref: b + "/2/3", disabled: s.applyDisabled, onTap: m.on.apply }, "应用改装")),
      s.message ? E({ ...S.talentProblems, key: "talentProblems", ref: b + "/3" }, s.message) : null);
  }

  // -- research -------------------------------------------------------------------------------------

  function researchPane(m) {
    const R = m.research, base = "/1/2";
    let rowIndex = 0;
    const list = [];
    for (const g of R.groups) {
      list.push(sectionHead(S.metaSection__head_talentResearchHead, `${base}/1/${rowIndex++}`, g.title, g.sub));
      for (const r of g.rows) {
        const b = `${base}/1/${rowIndex++}`;
        list.push(E({ ...(g.id === "drone" ? S.metaResearchRow_metaResearchRow_Drone : S.metaResearchRow_metaResearchRow_Train), ref: b },
          E({ ...(g.id === "drone" ? S.researchIcon : S.researchIcon_v2), ref: b + "/0" },
            E({ ...icon(S.uiIcon_uiIcon_Rapid, r.icon), ref: b + "/0/0" })),
          E({ ...S.researchCopy, ref: b + "/1" },
            E({ ...S.researchCopy__heading, ref: b + "/1/0" },
              E({ ...S.researchCopy__heading_b, ref: b + "/1/0/0" }, r.name),
              E({ ...S.researchLevel, ref: b + "/1/0/1" }, r.levelText)),
            " ",
            E({ ...S.researchScope, ref: b + "/1/1" }, r.focus)),
          E({ ...S.researchStats, ref: b + "/2" },
            E({ ...S.researchEffect, ref: b + "/2/0" },
              E({ ...S.researchEffect__current, ref: b + "/2/0/0" },
                E({ ...S.researchEffect__current_small, ref: b + "/2/0/0/0" }, "当前"),
                E({ ...S.researchEffect__current_b, ref: b + "/2/0/0/1" }, r.effect)),
              r.maxed ? null : [
                E({ ...S.researchEffect__arrow, ref: b + "/2/0/1" }, "→"),
                E({ ...S.researchEffect__next, ref: b + "/2/0/2" },
                  E({ ...S.researchEffect__next_small, ref: b + "/2/0/2/0" }, "升级后"),
                  E({ ...S.researchEffect__next_b, ref: b + "/2/0/2/1" }, r.nextEffect)),
              ]),
            r.maxed ? null : " ",
            r.maxed ? null : E({ ...S.researchCost, ref: b + "/2/1" },
              r.costs.map((c, i) => E({ ...(c.short ? S.researchCost__item_isShort : S.researchCost__item), ref: `${b}/2/1/${i}` },
                E({ ...icon(S.uiIcon_uiIcon_Scrap_v2, c.key), ref: `${b}/2/1/${i}/0` }),
                c.label + " ",
                E({ ...(c.short ? S.researchCost__item_b : S.researchCost__item_b_v2), ref: `${b}/2/1/${i}/1` }, String(c.value)))))),
          E({ tag: "button", ...S.metaResearchRow_button, key: "research-" + r.id, ref: b + "/3", disabled: r.disabled, onTap: () => m.on.research(r.id), label: r.label }, r.buttonText)));
      }
    }
    return E({ ...S.homeResearch, key: "homeResearch", ref: base },
      E({ ...S.homePageHeading, ref: base + "/0" },
        E({ ...S.eyebrow_v2, ref: base + "/0/0" }, "RESEARCH LABORATORY"),
        E({ ...S.homePageHeading_h2, ref: base + "/0/1" }, "永久研究"),
        E({ ...S.homePageHeading_p, ref: base + "/0/2" }, "资源足够即可升级；增益永久保留。")),
      E({ ...S.metaResearchList, key: "metaResearchList", ref: base + "/1" }, list),
      E({ ...S.researchGuide, ref: base + "/2" },
        E({ ...S.researchGuide_summary, key: "researchGuideSummary", ref: base + "/2/0", onTap: m.on.toggleGuide, tapSound: false },
          disclosure(R.guideOpen), "研究规则说明"),
        R.guideOpen ? E({ ...S.researchDetails, key: "researchDetails", ref: base + "/2/1" },
          R.details.map((line, i) => E({ ...S.researchDetails_p, ref: `${base}/2/1/${i}` }, line))) : null),
      E({ ...S.researchExtra, ref: base + "/3" },
        E({ ...S.researchExtra_summary, key: "researchExtraSummary", ref: base + "/3/0", onTap: m.on.toggleExtra, tapSound: false },
          disclosure(R.extraOpen), "查看编组配色与蓝图收藏"),
        R.extraOpen ? [
          E({ ...S.bondGuide, ref: base + "/3/1" },
            E({ ...S.bondGuide_h3, ref: base + "/3/1/0" }, "编组配色"),
            [["Purple", "紫 · 电弧 + 电球：北辰额外发射电球攻击"], ["Blue", "蓝 · 机枪 + 磁轨：北辰使用穿透激光"], ["Red", "红 · 燃烧 + 导弹：北辰发射追踪燃烧弹"], ["Cyan", "青 · 旋刃 + 霰弹：同色编组"]].map(([c, text], i) =>
              E({ ...S.bondGuide_p, ref: `${base}/3/1/${i + 1}` }, E({ ...S["bondDot_bondDot_" + c], ref: `${base}/3/1/${i + 1}/0` }), text)),
            E({ ...S.bondGuide_small, ref: base + "/3/1/5" }, "前三组在两架无人机都达到 Lv.5 后激活。青色当前仅作为编组配色，不改变技能规则。")),
          E({ ...S.homeBlueprints, ref: base + "/3/2" },
            sectionHead(S.metaSection__head_v2, base + "/3/2/0", "已回收蓝图", "收藏记录"),
            E({ ...S.metaBlueprintList, key: "metaBlueprintList", ref: base + "/3/2/1" }, R.blueprintText)),
        ] : null));
  }
  // The <summary> disclosure marker (Chrome's ::marker triangle).
  function disclosure(open) {
    return E({ display: "inline-block", width: "0.55em", height: "0.55em", marginRight: "0.45em", verticalAlign: "0.08em", tag: "::marker",
      paint: (ctx, box) => {
        ctx.beginPath();
        const { x, y, w, h } = box;
        if (open) { ctx.moveTo(x, y + h * 0.2); ctx.lineTo(x + w, y + h * 0.2); ctx.lineTo(x + w / 2, y + h * 0.95); }
        else { ctx.moveTo(x + w * 0.15, y); ctx.lineTo(x + w * 0.95, y + h / 2); ctx.lineTo(x + w * 0.15, y + h); }
        ctx.closePath();
        ctx.fillStyle = box.color || "currentColor";
        ctx.fill();
      } });
  }

  // -- shop / settings --------------------------------------------------------------------------------

  function shopPane(m) {
    const base = "/1/3";
    return E({ ...S.homeShop, key: "homeShop", ref: base },
      E({ ...S.homePageHeading, ref: base + "/0" },
        E({ ...S.eyebrow_v2, ref: base + "/0/0" }, "SUPPLY DEPOT"),
        E({ ...S.homePageHeading_h2, ref: base + "/0/1" }, "荒原补给站"),
        E({ ...S.homePageHeading_p, ref: base + "/0/2" }, "远征之外的补给与支援。")),
      E({ ...S.shopComing, ref: base + "/1" },
        E({ ...S.uiIcon_uiIcon_Supply, ref: base + "/1/0" }),
        E({ ...S.shopComing_h3, ref: base + "/1/1" }, "补给线路尚未开通"),
        E({ ...S.shopComing_p, ref: base + "/1/2" }, "补给商店将在后续版本开放。", E({ br: true }), "现在可通过远征回收废料、组件与研究数据。")),
      E({ ...S.supplyPreview, ref: base + "/2" },
        E({ ...S.supplyPreview_h3, ref: base + "/2/0" }, "可回收资源"),
        E({ ...S.supplyPreview_div, ref: base + "/2/1" },
          [["scrap", "废料"], ["components", "组件"], ["data", "数据"]].map(([k, label], i) =>
            E({ ...S.supplyPreview_span, ref: `${base}/2/1/${i}` }, E({ ...icon(S.uiIcon_uiIcon_Scrap_v3, k), ref: `${base}/2/1/${i}/0` }), label)))),
      E({ tag: "button", ...S.shopToBattle, key: "shopToBattle", ref: base + "/3", onTap: m.on.toBattle }, "前往出发获取资源 →"));
  }
  function toggle(m, key, on, disabled, ref, labelKey) {
    return E({ tag: "button", ...(on ? S.homeMusicToggle : S.homeMusicToggle_v2), key, ref, disabled, onTap: () => m.on.sound(labelKey), role: "switch", label: (labelKey === "music" ? "背景音乐" : "游戏音效") + (on ? " 开启" : " 关闭") },
      E({ ...(on ? S.switchTrack : S.switchTrack_v2), ref: ref + "/0" }, E({ ...(on ? S.switchTrack_after : S.switchTrack_after_v2), tag: "::after" })),
      E({ ...S.switchValue, ref: ref + "/1" }, on ? "开启" : "关闭"));
  }
  function settingsPane(m) {
    const base = "/1/4", st = m.settings;
    return E({ ...S.homeSettings, key: "homeSettings", ref: base },
      E({ ...S.homePageHeading, ref: base + "/0" },
        E({ ...S.eyebrow_v2, ref: base + "/0/0" }, "TERMINAL PREFERENCES"),
        E({ ...S.homePageHeading_h2, ref: base + "/0/1" }, "设置"),
        E({ ...S.homePageHeading_p, ref: base + "/0/2" }, "让每一次护送都保持舒适。")),
      E({ ...S.soundOptions, ref: base + "/1" },
        E({ ...S.soundOption, ref: base + "/1/0" },
          E({ ...S.soundOption_div, ref: base + "/1/0/0" },
            E({ ...S.homeMusicLabel, key: "homeMusicLabel", ref: base + "/1/0/0/0" }, E({ ...S.homeMusicLabel_before, tag: "::before" }, "♫"), "背景音乐"),
            E({ ...S.soundOption_p, ref: base + "/1/0/0/1" }, "低音量氛围配乐")),
          toggle(m, "homeMusicToggle", st.music, st.disabled, base + "/1/0/1", "music")),
        E({ ...S.soundOption_v2, ref: base + "/1/1" },
          E({ ...S.soundOption_div, ref: base + "/1/1/0" },
            E({ ...S.homeSfxLabel, key: "homeSfxLabel", ref: base + "/1/1/0/0" }, E({ ...S.homeSfxLabel_before, tag: "::before" }, "◖))"), "游戏音效"),
            E({ ...S.soundOption_p, ref: base + "/1/1/0/1" }, "武器与关键提示")),
          toggle(m, "homeSfxToggle", st.sfx, st.disabled, base + "/1/1/1", "sfx"))),
      E({ ...S.homeSoundNote, key: "homeSoundNote", ref: base + "/2" }, st.note),
      E({ ...S.homeSettingsActions, ref: base + "/3" },
        E({ tag: "button", ...S.startFullscreenButton, key: "startFullscreenButton", ref: base + "/3/0", disabled: st.fullscreen.disabled, onTap: m.on.fullscreen, label: st.fullscreen.label },
          E({ ...S.startFullscreenButton_before, tag: "::before" }, "⛶"),
          st.fullscreen.text),
        st.installHidden ? null : E({ tag: "button", ...S.startInstallButton, key: "startInstallButton", ref: base + "/3/1", onTap: m.on.install },
          E({ ...S.startInstallButton_before, tag: "::before" }, "▣"),
          "添加到主屏幕 ",
          E({ ...S.startInstallButton_span, ref: base + "/3/1/0" }, "＋")),
        st.cloudVisible ? E({ tag: "button", ...S.cloudButton, key: "cloudButton", ref: base + "/3/2", onTap: m.on.cloud }, "测试存档") : null),
      E({ ...S.homeAbout, ref: base + "/4" },
        "荒原轨道 · 无人机守卫", E({ br: true }),
        E({ ...S.versionLabel, ref: base + "/4/1" }, st.version)));
  }

  // -- dock ----------------------------------------------------------------------------------------------

  function tabs(m) {
    return E({ ...S.homeTabs, ref: "/2", role: "tablist" },
      TABS.map(([id, key, label, ic], i) => {
        const active = m.tab === id;
        // the battle tab's resting state is its _v2 variant; the others' active state is _v2
        const v = id === "battle" ? (active ? "" : "_v2") : (active ? "_v2" : "");
        const iconName = { shop: "Shop", train: "TrainNav", battle: "Battle", research: "Research", settings: "Settings" }[id];
        return E({ tag: "button", ...S[key + v], key, ref: "/2/" + i, onTap: () => m.on.tab(id), role: "tab", label, focusable: active },
          E({ ...S[key + "_before" + v], tag: "::before" }),
          E({ ...S["uiIcon_uiIcon_" + iconName + v], ref: `/2/${i}/0` }),
          E({ ...S[key + "_span"], ref: `/2/${i}/1` }, label),
          E({ ...S[key + "_after" + v], tag: "::after" }));
      }));
  }

  function build(m) {
    const pane = m.tab === "train" ? trainPane(m) : m.tab === "research" ? researchPane(m) : m.tab === "shop" ? shopPane(m) : m.tab === "settings" ? settingsPane(m) : battlePane(m);
    return E({ ...S.startScreen, key: "startScreen", ref: "", modal: false },
      header(m),
      E({ ...S.homeContent, ref: "/1" }, pane),
      tabs(m));
  }

  return { build, REGION_POS };
})();

export { homeScreen };
