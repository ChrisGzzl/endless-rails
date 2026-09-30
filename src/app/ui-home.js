"use strict";
// Expedition base controller (port of the former DOM meta-ui.js): owns the
// active tab, the talent/loadout draft, preset confirmations and notices,
// and turns the saved meta profile into the view model of screens/home.js.
// Every save rule, draft rule and text is unchanged from the DOM version.

import { longterm, metaStorage, state, gameAudio } from "./engine.js";
import { gamePlatform } from "./platform.js";

const homeCtl = (() => {
  const metaApi = longterm;
  const storage = metaStorage;
  let meta = metaApi.loadMeta(storage);
  let draft = null, draftLoadout = null, branch = "hull", presetNotice = "", presetConfirm = null;
  let activeTab = "battle", open = true, workshopOpen = false;
  const disclosure = { guide: false, extra: false };
  let host = null; // { invalidate, scrollIntoView, resetScroll, startRun, openCloud, cloudCanStart, display, sound, art }

  function attach(h) { host = h; }
  function save() { metaApi.saveMeta(storage, meta); }
  function changed() { host?.invalidate(); }

  function draftFromMeta() { draft = { nodes: { ...meta.talents.nodes }, specs: { ...meta.talents.specs } }; draftLoadout = null; presetNotice = ""; presetConfirm = null; }
  const sameCars = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);
  function draftDirty() {
    if (!draft) return false;
    for (const node of metaApi.TALENT_NODES) if ((draft.nodes[node.id] || 0) !== (meta.talents.nodes[node.id] || 0)) return true;
    for (const key in draft.specs) if (draft.specs[key] !== meta.talents.specs[key]) return true;
    return !!draftLoadout && !sameCars(draftLoadout, meta.loadout);
  }
  // Withdrawing a prerequisite cascades to its dependents (需求 §26.1).
  function withdrawNode(nodeId) {
    const before = metaApi.spentPoints(draft);
    draft.nodes[nodeId] = Math.max(0, (draft.nodes[nodeId] || 0) - 1);
    let again = true;
    while (again) {
      again = false;
      for (const node of metaApi.TALENT_NODES) {
        if (!(draft.nodes[node.id] > 0) || !node.prereq?.id) continue;
        if ((draft.nodes[node.prereq.id] || 0) < node.prereq.level) { draft.nodes[node.id] = 0; again = true; }
      }
      for (const specBranch of Object.keys(metaApi.SPEC_NODE)) {
        if (draft.specs[specBranch] && !(draft.nodes[metaApi.SPEC_NODE[specBranch]] > 0)) draft.specs[specBranch] = null;
      }
    }
    const returned = before - metaApi.spentPoints(draft);
    if (returned > 0) presetNotice = `已撤回 ${returned} 点`;
  }
  function raiseNode(nodeId) {
    const node = metaApi.NODE_BY_ID[nodeId];
    if (!node || (draft.nodes[nodeId] || 0) >= node.levels) return;
    draft.nodes[nodeId] = (draft.nodes[nodeId] || 0) + 1;
    presetNotice = "";
  }
  function statusFor(region) {
    const st = meta.regions[region.id];
    if (!st?.unlocked) return "未知";
    if (st.repaired) return "已修复";
    if (st.clears > 0) return "已完成";
    return "已侦察";
  }
  const BRANCH_CARS = { hull: null, pointDefense: "pointDefense", repair: "repair", radar: "radar", storage: "storage" };
  function branchActive(branchId) { const car = BRANCH_CARS[branchId]; return !car || (draftLoadout || meta.loadout).includes(car); }
  const compact = n => n >= 1000000 ? (n / 1000000).toFixed(1) + "m" : n >= 10000 ? (n / 1000).toFixed(1) + "k" : String(Math.floor(n));

  // -- view model ------------------------------------------------------------------------

  function model() {
    meta = metaApi.normalizeMeta(meta);
    if (!draft) draftFromMeta();
    const selected = metaApi.regionById(meta.selectedRegion);
    const trainLength = metaApi.planFor(meta).trainLength;
    const S = metaApi.buildStats(meta);
    const damage = `伤害×${S.droneDamageMul.toFixed(2)}`, support = `耐久×${(S.maxHp / 100).toFixed(2)} · 维修×${S.repairMul.toFixed(2)}`;
    const upgradeCost = meta.train.level < metaApi.MAX_TRAIN_LEVEL ? metaApi.trainUpgradeCost(meta.train.level) : null;
    const slots = metaApi.carSlots(meta);
    const carNames = cars => cars.filter(id => id !== "hangar").map(id => metaApi.CAR_DEFS.find(c => c.id === id)?.name || id).join(" / ") || "未选功能车厢";
    const art = host?.art ? host.art() : { startDisabled: false, statusHidden: true, retryHidden: true, statusText: "" };
    const m = {
      tab: activeTab, region: selected.id, workshopOpen,
      trainLevelText: "列车 Lv." + meta.train.level,
      wallet: [
        { key: "scrap", iconStyle: "Scrap", valueStyle: "homeScrap", valueKey: "homeScrap", label: "废料", title: "废料" },
        { key: "components", iconStyle: "Components", valueStyle: "homeComponents", valueKey: "homeComponents", label: "组件", title: "技术组件" },
        { key: "data", iconStyle: "Data", valueStyle: "homeData", valueKey: "homeData", label: "数据", title: "研究数据" },
      ].map(w => ({ ...w, value: compact(meta.resources[w.key]) })),
      regionName: selected.name, regionDescription: selected.description,
      regionStatus: statusFor(selected) + " · " + selected.statusText,
      heroPath: "assets/hero-" + selected.id + "-v3.webp", heroAlt: "四架无人机护送装甲列车穿越" + selected.name,
      regions: metaApi.REGIONS.map(region => {
        const unlocked = !!meta.regions[region.id]?.unlocked;
        return { id: region.id, name: region.name, unlocked, selected: meta.selectedRegion === region.id, tag: unlocked ? statusFor(region) : "未解锁" };
      }),
      loadout: { trainLength, damage, support, label: `编组 ${trainLength} 节，${damage}，${support}，前往列车调整` },
      art,
      train: (() => {
        const points = metaApi.talentPoints(meta) - metaApi.spentPoints(draft);
        return {
          levelText: `列车 Lv.${meta.train.level}`,
          pointsText: `可用改装点 ${metaApi.talentPoints(meta) - metaApi.spentPoints(meta.talents)}`, pointsBad: points < 0,
          fireText: `无人机伤害 ×${S.droneDamageMul.toFixed(2)}`, hullText: `列车耐久 ×${(S.maxHp / 100).toFixed(2)}`,
          upgradeText: upgradeCost === null ? "列车已满级" : `升级至 Lv.${meta.train.level + 1}`,
          upgradeDisabled: upgradeCost === null || meta.resources.scrap < upgradeCost,
          upgradeLabel: upgradeCost === null ? "列车已满级" : `升级列车需要 ${upgradeCost} 废料，当前 ${Math.floor(meta.resources.scrap)} 废料`,
          hint: upgradeCost === null ? { text: "已达等级上限" } : meta.resources.scrap < upgradeCost
            ? { short: true, cost: upgradeCost, gap: Math.ceil(upgradeCost - meta.resources.scrap) }
            : { text: `每级 +2 改装点 · 废料 ${upgradeCost}` },
          buildCount: `${Math.max(0, meta.loadout.length - 1)} / ${slots} 功能车厢`,
          buildCars: meta.loadout.filter(id => id !== "hangar").map(id => ({ id, name: metaApi.CAR_DEFS.find(item => item.id === id)?.name || id })),
          emptySlot: meta.loadout.length - 1 < slots,
        };
      })(),
      workshop: workshopOpen ? workshopModel(slots, carNames) : null,
      research: researchModel(),
      settings: host?.settingsModel ? host.settingsModel() : { music: true, sfx: true, disabled: false, note: "", fullscreen: { text: "全屏游玩", disabled: false }, installHidden: false, cloudVisible: false, version: "" },
      on: actions,
    };
    return m;
  }
  function workshopModel(slots, carNames) {
    const cars = draftLoadout || meta.loadout, unlockMeta = { ...meta, talents: draft };
    const selectedCars = new Set(cars);
    const available = metaApi.talentPoints(meta) - metaApi.spentPoints(draft);
    const dirty = draftDirty();
    const problems = dirty ? metaApi.talentProblems(meta, draft) : [];
    const paid = dirty && metaApi.refitIsPaid(meta.talents, draft);
    const cost = metaApi.refitCost(meta);
    let costText = "仅追加新点 · 免费";
    if (paid) costText = meta.freeRefits > 0 ? `消耗 1 次免费重构（剩 ${meta.freeRefits} 次）` : `改装费 ${cost} 废料${meta.resources.scrap < cost ? ` · 还差 ${Math.ceil(cost - meta.resources.scrap)}` : ""}`;
    const rows = metaApi.buildChangeRows(metaApi.buildStats(meta), metaApi.buildStats({ ...meta, talents: draft, loadout: draftLoadout || meta.loadout }));
    if (!rows.length) rows.push(dirty ? "仅调整编组或未装备分支；当前属性无变化" : "当前属性无改动");
    const message = problems.length ? problems.join("；") : presetNotice;
    const specOptions = metaApi.SPEC_OPTIONS[branch];
    let spec = null;
    if (specOptions) {
      const specNode = metaApi.SPEC_NODE[branch], owned = (draft.nodes[specNode] || 0) > 0;
      spec = {
        owned, title: metaApi.NODE_BY_ID[specNode].name,
        note: owned ? "已解锁 · 二选一（切换已购选项需改装费）" : `🔒 购买${metaApi.NODE_BY_ID[specNode].name}后开放`,
        options: specOptions.map(option => ({ id: option.id, name: option.name, desc: option.desc, active: draft.specs[branch] === option.id })),
      };
    }
    return {
      presets: meta.presets.map((preset, index) => ({ index, name: preset.name, detail: `${metaApi.spentPoints(preset.talents)} 点 · ${preset.loadout.length - 1} 车厢`, confirm: presetConfirm === index })),
      loadoutSummary: `已应用 ${meta.loadout.length - 1}/${slots} · ${carNames(meta.loadout)}${draftLoadout && !sameCars(draftLoadout, meta.loadout) ? `\n草稿 ${draftLoadout.length - 1}/${slots} · ${carNames(draftLoadout)}（待应用）` : ""}`,
      cars: metaApi.CAR_DEFS.filter(car => !car.fixed).map(car => {
        const unlocked = metaApi.carUnlocked(unlockMeta, car.id);
        const active = selectedCars.has(car.id);
        const diff = active !== meta.loadout.includes(car.id);
        const stateText = !unlocked ? active ? "天赋不足 · 点击从草稿移除" : `需先购买${metaApi.NODE_BY_ID[metaApi.CAR_UNLOCK_NODE[car.id]].name}` : diff ? (active ? "草稿加入 · 待应用" : "草稿移除 · 待应用") : active ? "已应用 · 点击移除" : "未编组 · 点击加入";
        return { id: car.id, name: car.name, description: car.description, active, disabled: !unlocked && !active, stateText };
      }),
      branchNote: branchActive(branch) ? "未装备车厢的分支不生效" : "当前分支未装备，天赋效果暂不生效",
      branches: metaApi.TALENT_BRANCHES.map(item => {
        const spent = metaApi.branchSpent(draft, item.id), inactive = !branchActive(item.id);
        return { id: item.id, name: item.name, cap: item.cap, spent, active: branch === item.id, inactive, label: `${item.name} ${spent}/${item.cap}${inactive ? "，未装备，分支效果不生效" : ""}` };
      }),
      nodes: metaApi.TALENT_NODES.filter(node => node.branch === branch).map(node => {
        const level = draft.nodes[node.id] || 0;
        const block = metaApi.nodeBlockReason(meta, draft, node.id);
        return {
          id: node.id, name: node.name, level, owned: level > 0,
          levelText: `Lv.${level}/${node.levels} · ${node.cost} 点/级 · ${block ? `🔒 ${block}` : "可购买"}`,
          effect: level > 0 ? node.effect(level) : node.levels > 1 ? `${node.effect(1)} / 级` : node.effect(1),
          minusDisabled: level <= 0, plusDisabled: !!block,
        };
      }),
      spec,
      summary: {
        rows, pointsText: `可用改装点 ${available}`, pointsBad: available < 0, costText,
        resetDisabled: !dirty, applyDisabled: !dirty || problems.length > 0, message,
      },
    };
  }
  function researchModel() {
    const icon = id => metaApi.RESEARCH_ICONS[id];
    return {
      groups: [["drone", "无人机战斗", "主材料：研究数据"], ["train", "列车工程", "主材料：技术组件"]].map(([id, title, sub]) => ({
        id, title, sub,
        rows: metaApi.RESEARCH_TRACKS.filter(t => t.group === id).map(track => {
          const level = meta.research[track.id] || 0;
          const cost = metaApi.researchCost(meta, track.id);
          const maxed = !cost;
          const effect = metaApi.researchEffectText(track.id, level);
          const nextEffect = metaApi.researchEffectText(track.id, Math.min(metaApi.MAX_RESEARCH_LEVEL, level + 1));
          let costs = [], missing = [];
          if (!maxed) {
            const parts = [["scrap", "废料"], [cost.attack ? "data" : "components", cost.attack ? "数据" : "组件"]];
            if (cost.attack && cost.components > 0) parts.push(["components", "组件"]);
            if (!cost.attack && cost.data > 0) parts.push(["data", "数据"]);
            costs = parts.map(([key, label]) => ({ key, label, value: cost[key], short: meta.resources[key] < cost[key] }));
            missing = [["scrap", "废料"], ["components", "组件"], ["data", "数据"]].filter(([key]) => meta.resources[key] < cost[key]).map(([key, name]) => `${name}还差 ${Math.ceil(cost[key] - meta.resources[key])}`);
          }
          return {
            id: track.id, icon: icon(track.id), name: track.name, focus: track.focus, maxed,
            levelText: `Lv.${level}/${metaApi.MAX_RESEARCH_LEVEL}`, effect: effect.total, nextEffect: nextEffect.total, costs,
            disabled: maxed || missing.length > 0,
            buttonText: maxed ? "已满级" : missing.length ? "资源不足" : "升级",
            label: maxed ? track.name + "已满级" : missing.length ? `升级${track.name}，${missing.join("，")}` : `升级${track.name}`,
          };
        }),
      })),
      details: [
        "所有研究从 Lv1 起开放，无等待时间或每日限额；所列资源足够即可升级。",
        "Lv1-10 基础研究、Lv11-20 进阶研究、Lv21-30 长期研究：单级收益逐段递减。",
        "装甲材料按乘法叠算，界面显示实际受伤降低比例而非等级百分比。",
        "无人机战斗三项主消耗研究数据（里程碑需少量组件）；列车工程四项主消耗技术组件（里程碑需少量数据）。",
      ],
      guideOpen: disclosure.guide, extraOpen: disclosure.extra,
      blueprintText: meta.blueprints.length ? meta.blueprints.map(id => { const bp = metaApi.blueprintById(id); return bp.name + "：" + bp.description; }).join("\n") : "暂无蓝图 · 击破精英或区域 Boss 后回收，到站锁定。",
    };
  }

  // -- actions ----------------------------------------------------------------------------------

  function selectTab(name) {
    if (!["shop", "train", "battle", "research", "settings"].includes(name)) name = "battle";
    if (activeTab === "train" && name !== "train" && draftDirty()) {
      const ok = gamePlatform.hasConfirm() ? gamePlatform.confirmAction("列车改装草稿尚未应用，离开后将丢弃。继续离开？") : false;
      if (!ok) { presetNotice = "请先应用或重置草稿，再切换页面"; changed(); return; }
    }
    const previous = activeTab;
    activeTab = name;
    meta = metaApi.loadMeta(storage); draftFromMeta();
    if (name !== "train") workshopOpen = false;
    if (previous !== name) host?.resetScroll(paneKey(name));
    host?.refreshSound?.();
    changed();
  }
  const paneKey = tab => ({ battle: "homeBattle", train: "metaScreen", research: "homeResearch", shop: "homeShop", settings: "homeSettings" })[tab];
  function openBase(tab = "battle") { open = true; selectTab(tab); }
  function start() {
    if (host?.cloudBlocksStart?.()) { host.openCloud(); return; }
    meta = metaApi.loadMeta(storage);
    const plan = metaApi.planFor(meta);
    open = false; changed();
    host?.startRun(plan);
  }
  function refresh() { meta = metaApi.loadMeta(storage); draftFromMeta(); changed(); }

  const actions = {
    tab: name => selectTab(name),
    selectRegion: id => { meta = metaApi.setRegion(meta, id); save(); host?.regionChanged?.(id); changed(); },
    openTrain: () => selectTab("train"),
    toBattle: () => selectTab("battle"),
    start,
    retryArt: () => host?.retryArt?.(),
    trainUpgrade: () => {
      const result = metaApi.buyTrainUpgrade(meta);
      if (!result.purchased) return;
      meta = result.meta; save(); changed();
    },
    openWorkshop: () => { workshopOpen = true; changed(); host?.afterRender?.(() => host.scrollIntoView("metaScreen", "trainWorkshop")); },
    closeWorkshop: () => {
      if (draftDirty()) {
        const ok = gamePlatform.hasConfirm() ? gamePlatform.confirmAction("改装草稿尚未应用，收起后仍会保留。确认收起？") : null;
        if (!ok) return;
      }
      workshopOpen = false; changed();
    },
    presetLoad: index => {
      const result = metaApi.loadPreset(meta, index);
      draft = { nodes: { ...result.talents.nodes }, specs: { ...result.talents.specs } };
      draftLoadout = [...result.loadout];
      presetConfirm = null;
      presetNotice = result.problems.length ? `方案不可用：${result.problems[0]}` : "已载入方案到草稿";
      changed();
    },
    presetRename: index => {
      const preset = meta.presets[index];
      gamePlatform.promptText("方案名称", preset.name, name => {
        if (name && name.trim()) { meta = metaApi.renamePreset(meta, index, name.trim()); save(); changed(); }
      });
    },
    presetSave: index => {
      const preset = meta.presets[index];
      if (gamePlatform.hasConfirm()) { if (!gamePlatform.confirmAction(`用当前草稿覆盖「${preset.name}」？`)) return; }
      else if (presetConfirm !== index) { presetConfirm = index; presetNotice = `再点确认覆盖「${preset.name}」`; changed(); return; }
      meta = metaApi.savePreset(meta, index, draft, draftLoadout || meta.loadout); save(); presetNotice = `草稿已存入 ${preset.name}`; changed();
    },
    toggleCar: id => {
      const cars = draftLoadout || meta.loadout;
      const next = new Set(cars.filter(c => c !== "hangar"));
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= metaApi.carSlots(meta)) { presetNotice = "编组已满：先点一节已选车厢移除，再加入新车厢。"; changed(); return; }
        next.add(id);
      }
      draftLoadout = ["hangar", ...next]; presetNotice = "编组已写入草稿，点击应用改装后生效"; changed();
    },
    branch: id => { branch = id; changed(); },
    minus: id => { withdrawNode(id); changed(); },
    plus: id => { raiseNode(id); changed(); },
    spec: id => { draft.specs[branch] = draft.specs[branch] === id ? null : id; presetNotice = ""; changed(); },
    reset: () => { draftFromMeta(); changed(); },
    apply: () => {
      const result = metaApi.applyTalents(meta, draft, { loadout: draftLoadout || meta.loadout });
      if (!result.applied) { presetNotice = result.problems.join("；"); changed(); return; }
      meta = result.meta;
      save(); draftFromMeta();
      if (result.charged) presetNotice = `已支付改装费 ${result.charged} 废料`;
      else if (result.paid) presetNotice = `已消耗 1 次免费重构（剩 ${result.freeRefits} 次）`;
      changed();
    },
    research: id => {
      const result = metaApi.buyResearch(meta, id);
      if (result.purchased) { meta = result.meta; save(); changed(); }
      else { presetNotice = "研究资源不足，请核对卡片所列缺口"; changed(); }
    },
    toggleGuide: () => { disclosure.guide = !disclosure.guide; changed(); },
    toggleExtra: () => { disclosure.extra = !disclosure.extra; changed(); },
    sound: key => host?.toggleSound?.(key),
    fullscreen: () => host?.toggleFullscreen?.(),
    install: () => host?.installGame?.(),
    cloud: () => host?.openCloudFromButton?.(),
  };

  return {
    attach, model, refresh, start,
    open: tab => openBase(tab), close: () => openBase("battle"), selectTab,
    render: changed, getTab: () => activeTab,
    get isOpen() { return open; }, set isOpen(v) { open = v; },
    get meta() { return meta; },
  };
})();

export { homeCtl };
