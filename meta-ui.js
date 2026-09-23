"use strict";
(() => {
  const metaApi = window.EndlessRailsLongterm;
  if (!metaApi) return;
  const $ = id => document.getElementById(id);
  const storage = metaStorage;
  let meta = metaApi.loadMeta(storage);
  const screen = $("metaScreen"), regionList = $("metaRegionList"), carList = $("metaCarList"), researchList = $("metaResearchList");
  const resourceText = $("metaResources"), trainText = $("metaTrainLevel"), loadoutText = $("metaLoadoutSummary"), startButton = $("metaStartButton"), trainUpgradeButton = $("metaTrainUpgradeButton");
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
      button.disabled = !unlocked;button.setAttribute("aria-pressed",String(meta.selectedRegion===region.id));
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
      const active = selected.has(car.id); button.className = "meta-card meta-car" + (active ? " selected" : ""); button.disabled = !!car.fixed;button.setAttribute("aria-pressed",String(active));
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
  const specializations={rapid:"射速 +8%",missile:"爆炸半径 +15%，Lv.10 可选集束 / 重型",incendiary:"燃烧半径 +15%",ricochet:"反弹次数 +1",chain:"连锁目标 +1",piercing:"贯穿 +1，Lv.10 可选聚束 / 双轨",scatter:"每轮弹数 +1",blades:"切割范围 +12%"};
  function renderResearch() {
    researchList.innerHTML = "";
    for (const id of metaApi.RESEARCH_IDS) {
      const level = meta.research[id] || 0, cost = metaApi.researchCost(meta, id), maxed = !Number.isFinite(cost);
      const row = document.createElement("div"); row.className = "meta-research-row";
      row.innerHTML = `<span><b>${metaApi.RESEARCH_NAMES[id]}</b><small>研究 Lv.${level}/${metaApi.MAX_RESEARCH_LEVEL}${level >= 3 ? " · 专精已解锁" : ""}</small><small>基础伤害 +${level*3}% · Lv.3：${specializations[id]}</small></span><button type="button" ${maxed || meta.resources.data < cost ? "disabled" : ""}>${maxed ? "已完成" : cost + " 数据"}</button>`;
      row.querySelector("button").addEventListener("click", () => { const result = metaApi.buyResearch(meta, id); meta = result.meta; if (result.purchased) { save(); render(); } });
      researchList.append(row);
    }
  }
  function render() {
    meta = metaApi.normalizeMeta(meta);
    const nextXp = metaApi.xpToNext(meta.train.level);
    trainText.textContent = `列车 Lv.${meta.train.level} · ${meta.train.xp}/${nextXp} XP · ${metaApi.trainSlots(meta)} 节远征上限`;
    resourceText.textContent = `废料 ${meta.resources.scrap} · 技术组件 ${meta.resources.components} · 研究数据 ${meta.resources.data} · 蓝图 ${meta.blueprints.length}`;
    if(trainUpgradeButton){const cost=metaApi.trainUpgradeCost(meta),maxed=!Number.isFinite(cost.scrap);trainUpgradeButton.disabled=maxed||meta.resources.scrap<cost.scrap||meta.resources.components<cost.components;trainUpgradeButton.textContent=maxed?"列车等级已满":`强化列车 · 废料 ${cost.scrap} + 组件 ${cost.components}`;}
    const plan = metaApi.planFor(meta);
    loadoutText.textContent = `当前编组 ${plan.trainLength}/${plan.slots} 节 · ${plan.cars.map(id => metaApi.CAR_DEFS.find(c => c.id === id)?.name || id).join(" / ")}`;
    renderRegions(); renderCars(); renderResearch();
    const blueprints=$("metaBlueprintList");
    if(blueprints)blueprints.textContent=meta.blueprints.length?meta.blueprints.map(id=>{const bp=metaApi.blueprintById(id);return bp.name+"："+bp.description;}).join("\n"):"暂无蓝图 · 击破精英或区域 Boss 后回收，到站锁定。";
  }
  function open() { meta = metaApi.loadMeta(storage); render(); screen.hidden = false; $("startScreen").hidden = true; }
  function close() { screen.hidden = true; $("startScreen").hidden = false; }
  function start() {
    if(window.EndlessRailsCloud&&!window.EndlessRailsCloud.canStart()){window.EndlessRailsCloud.open();return;}
    meta = metaApi.loadMeta(storage); const plan = metaApi.planFor(meta); screen.hidden = true;
    if (window.EndlessRailsGame?.startRun) window.EndlessRailsGame.startRun(plan); else $("startButton")?.click();
  }
  function refresh() { meta = metaApi.loadMeta(storage); if (!screen.hidden) render(); }
  trainUpgradeButton?.addEventListener("click",()=>{const result=metaApi.upgradeTrain(meta);meta=result.meta;if(result.purchased){save();render();}});
  startButton.addEventListener("click", start);
  $("metaBackButton")?.addEventListener("click", close);
  window.EndlessRailsMetaUI = { open, close, refresh, render };
})();
