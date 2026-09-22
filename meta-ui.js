"use strict";
(() => {
  const metaApi = window.EndlessRailsLongterm;
  if (!metaApi) return;
  const $ = id => document.getElementById(id);
  const storage = typeof localStorage !== "undefined" ? localStorage : null;
  let meta = metaApi.loadMeta(storage);
  const screen = $("metaScreen"), regionList = $("metaRegionList"), carList = $("metaCarList"), researchList = $("metaResearchList");
  const resourceText = $("metaResources"), trainText = $("metaTrainLevel"), loadoutText = $("metaLoadoutSummary"), startButton = $("metaStartButton");
  if (!screen || !regionList || !carList || !researchList || !startButton) return;

  function save() { metaApi.saveMeta(storage, meta); }
  function statusFor(region) {
    const state = meta.regions[region.id];
    if (!state?.unlocked) return "未知";
    if (state.repaired) return "已修复";
    if (state.clears > 0) return "已完成";
    return "已侦察";
  }
  function renderRegions() {
    regionList.innerHTML = "";
    for (const region of metaApi.REGIONS) {
      const state = meta.regions[region.id], unlocked = !!state?.unlocked;
      const button = document.createElement("button");
      button.type = "button"; button.className = "meta-card meta-region" + (meta.selectedRegion === region.id ? " selected" : "");
      button.disabled = !unlocked;
      button.innerHTML = `<span class="meta-card__icon">${unlocked ? "⌖" : "?"}</span><span><b>${unlocked ? region.name : "未知区域"}</b><small>${unlocked ? statusFor(region) + " · " + region.statusText : "铁路情报不足"}</small><em>${unlocked ? region.description : "完成前置区域后解锁。"}</em></span>`;
      button.addEventListener("click", () => { meta = metaApi.setRegion(meta, region.id); save(); render(); });
      regionList.append(button);
    }
  }
  function renderCars() {
    const slots = metaApi.trainSlots(meta), selected = new Set(meta.loadout);
    carList.innerHTML = "";
    for (const car of metaApi.CAR_DEFS) {
      if (!meta.unlockedCars.includes(car.id)) continue;
      const button = document.createElement("button"); button.type = "button";
      const active = selected.has(car.id); button.className = "meta-card meta-car" + (active ? " selected" : ""); button.disabled = !!car.fixed;
      button.innerHTML = `<span class="meta-card__icon">${car.icon}</span><span><b>${car.name}${car.fixed ? " · 固定" : ""}</b><small>${active ? "已编组" : "未编组"}</small><em>${car.description}</em></span>`;
      if (!car.fixed) button.addEventListener("click", () => {
        const next = new Set(meta.loadout.filter(id => id !== "hangar"));
        if (next.has(car.id)) next.delete(car.id); else {
          const maxOptional = Math.max(0, slots - 2);
          if (next.size >= maxOptional) {
            const first = next.values().next().value; if (first) next.delete(first);
          }
          next.add(car.id);
        }
        meta = metaApi.setLoadout(meta, [...next]); save(); render();
      });
      carList.append(button);
    }
  }
  function renderResearch() {
    researchList.innerHTML = "";
    for (const id of metaApi.RESEARCH_IDS) {
      const level = meta.research[id] || 0, cost = metaApi.researchCost(meta, id), maxed = !Number.isFinite(cost);
      const row = document.createElement("div"); row.className = "meta-research-row";
      row.innerHTML = `<span><b>${metaApi.RESEARCH_NAMES[id]}</b><small>研究 Lv.${level}/${metaApi.MAX_RESEARCH_LEVEL}${level >= 3 ? " · 专精已解锁" : ""}</small></span><button type="button" ${maxed || meta.resources.data < cost ? "disabled" : ""}>${maxed ? "已完成" : cost + " 数据"}</button>`;
      row.querySelector("button").addEventListener("click", () => { const result = metaApi.buyResearch(meta, id); meta = result.meta; if (result.purchased) { save(); render(); } });
      researchList.append(row);
    }
  }
  function render() {
    meta = metaApi.normalizeMeta(meta);
    const nextXp = metaApi.xpToNext(meta.train.level);
    trainText.textContent = `列车 Lv.${meta.train.level} · ${meta.train.xp}/${nextXp} XP · ${metaApi.trainSlots(meta)} 节远征上限`;
    resourceText.textContent = `废料 ${meta.resources.scrap} · 技术组件 ${meta.resources.components} · 研究数据 ${meta.resources.data} · 蓝图 ${meta.blueprints.length}`;
    const plan = metaApi.planFor(meta);
    loadoutText.textContent = `当前编组 ${plan.trainLength}/${plan.slots} 节 · ${plan.cars.map(id => metaApi.CAR_DEFS.find(c => c.id === id)?.name || id).join(" / ")}`;
    renderRegions(); renderCars(); renderResearch();
  }
  function open() { meta = metaApi.loadMeta(storage); render(); screen.hidden = false; $("startScreen").hidden = true; }
  function close() { screen.hidden = true; $("startScreen").hidden = false; }
  function start() {
    meta = metaApi.loadMeta(storage); const plan = metaApi.planFor(meta); screen.hidden = true;
    if (window.EndlessRailsGame?.startRun) window.EndlessRailsGame.startRun(plan); else $("startButton")?.click();
  }
  function refresh() { meta = metaApi.loadMeta(storage); if (!screen.hidden) render(); }
  startButton.addEventListener("click", start);
  $("metaBackButton")?.addEventListener("click", close);
  window.EndlessRailsMetaUI = { open, close, refresh, render };
})();
