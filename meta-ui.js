"use strict";
(() => {
  const metaApi = window.EndlessRailsLongterm;
  if (!metaApi) return;
  const $ = id => document.getElementById(id);
  const storage = metaStorage;
  let meta = metaApi.loadMeta(storage);
  const screen = $("startScreen"), regionList = $("metaRegionList"), carList = $("metaCarList"), researchList = $("metaResearchList");
  const resourceText = $("metaResources"), trainText = $("metaTrainLevel"), loadoutText = $("metaLoadoutSummary"), startButton = $("metaStartButton"), trainUpgradeButton = $("metaTrainUpgradeButton");
  if (!screen || !regionList || !carList || !researchList || !startButton) return;
  // Decorative vectors remain separate from the game data and buying/selection rules.
  const iconPaths = {
    hangar:'<circle cx="12" cy="12" r="2"/><path d="m12 10-2-7 2-1 2 1-2 7m-2 2-7 2-1-2 1-2 7 2m4 2 2 7-2 1-2-1 2-7m2-2 7-2 1 2-1 2-7-2"/>',
    pointDefense:'<path d="M12 3 3 7v6c0 5 4 8 9 9 5-1 9-4 9-9V7zM12 7v10m-5-5h10"/>',
    storage:'<path d="m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 5 9-5m-9 5v10"/>',
    radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 6-7m-6 7 3 3"/>',
    repair:'<path d="M14 4a5 5 0 0 0-6 6L3 15a3 3 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-3-3z"/>',
    rapid:'<path d="m3 13 17-9-6 16-3-6-8-1zm8 1-2 6"/>',
    missile:'<path d="M5 15c1-5 6-10 14-11 0 8-5 13-10 14zM13 10l2 2M6 18l-2 3m5-2-1 3"/>',
    incendiary:'<path d="M12 22c-5 0-8-4-8-8 0-3 2-5 4-8 0 3 2 4 3 5 1-3 2-5 5-8 0 4 4 7 4 11 0 4-3 8-8 8zm0 0c-2 0-3-2-3-4 0-1 1-3 3-5 0 2 3 3 3 5 0 2-1 4-3 4z"/>',
    ricochet:'<circle cx="12" cy="12" r="3"/><path d="M4 10a8 8 0 0 1 8-7m0 18a9 9 0 0 0 9-9M3 14a9 9 0 0 0 9 7m0-18a9 9 0 0 1 9 9"/>',
    chain:'<path d="m13 2-9 11h7l-1 9 10-12h-7z"/>',
    piercing:'<path d="M4 20 20 4m-9 0h9v9M2 13l4-4m1 12 4-4"/>',
    scatter:'<path d="m12 4 8 7-8 9-8-9zM12 4v16M4 11h16"/>',
    blades:'<path d="M12 3v18M3 12h18M7 7l10 10M17 7 7 17"/>'
  };
  const icon = id => `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[id] || iconPaths.hangar}</svg>`;

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
      button.innerHTML = `<b>${region.name}</b><small>${unlocked ? statusFor(region) : "未解锁"}</small>`;
      button.setAttribute("aria-label",region.name+" · "+(unlocked?statusFor(region):"未解锁"));
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
      button.innerHTML = `<span class="meta-card__icon">${icon(car.id)}</span><span><b>${car.name}${car.fixed ? " · 固定" : ""}</b><small>${active ? "已编组" : "未编组"}</small><em>${car.description}</em></span>`;
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
  const weaponDescriptions={rapid:"近程高频点射，升级提高射速与单弹伤害。",missile:"远程追踪弹，高伤爆炸清理尸群。",incendiary:"投掷榴弹；北辰移动方向牵引落点，在地面留下火墙。",ricochet:"中程能量球，反弹并穿过尸群。",chain:"中程连锁电弧，密集目标之间伤害更高。",piercing:"远程磁轨弹；调整角度，让更多敌人排成一线。",scatter:"近程扇形霰弹，贴近尸群集中清扫。",blades:"近战持续切割，主动靠近尸群；升级扩大刀环。"};
  function renderResearch() {
    researchList.innerHTML = "";
    for (const id of metaApi.RESEARCH_IDS) {
      const level = meta.research[id] || 0, cost = metaApi.researchCost(meta, id), maxed = !Number.isFinite(cost);
      const row = document.createElement("div"); row.className = "meta-research-row";
      row.innerHTML = `<span class="research-icon" data-weapon="${id}">${icon(id)}</span><span><b>${metaApi.RESEARCH_NAMES[id]}</b><small>${weaponDescriptions[id]}</small><small>研究 Lv.${level}/${metaApi.MAX_RESEARCH_LEVEL} · 基础伤害 +${level*3}% · Lv.3：${specializations[id]}</small></span><button type="button" ${maxed || meta.resources.data < cost ? "disabled" : ""}>${maxed ? "已完成" : cost + " 数据"}</button>`;
      row.querySelector("button").addEventListener("click", () => { const result = metaApi.buyResearch(meta, id); meta = result.meta; if (result.purchased) { save(); render(); } });
      researchList.append(row);
    }
  }
  function render() {
    const compact=n=>n>=1000000?(n/1000000).toFixed(1)+"m":n>=10000?(n/1000).toFixed(1)+"k":String(n);
    $("homePlayerLevel").textContent="列车 Lv."+meta.train.level;
    for(const [id,key] of [["homeScrap","scrap"],["homeComponents","components"],["homeData","data"]]){$(id).textContent=compact(meta.resources[key]);$(id).setAttribute("aria-label",String(meta.resources[key]));}
    const selected=metaApi.regionById(meta.selectedRegion);
    $("homeRegionName").textContent=selected.name;$("homeRegionDescription").textContent=selected.description;$("homeRegionStatus").textContent=statusFor(selected)+" · "+selected.statusText;
    $("homeLoadout").textContent="当前编组 · "+metaApi.planFor(meta).trainLength+" 节车厢 · 列车 Lv."+meta.train.level;
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
  const tabs=[['shop','homeTabShop','homeShop'],['train','homeTabTrain','metaScreen'],['battle','homeTabBattle','homeBattle'],['research','homeTabResearch','homeResearch'],['settings','startSettingsButton','homeSettings']];
  let activeTab='battle';
  function selectTab(name,focus=false){
    if(!tabs.some(([key])=>key===name))name='battle';
    activeTab=name;
    for(const [key,buttonId,panelId] of tabs){
      const active=key===name,button=$(buttonId);button.setAttribute('aria-selected',String(active));button.setAttribute('tabindex',active?'0':'-1');$(panelId).hidden=!active;
      if(active&&focus)button.focus?.();
    }
    meta=metaApi.loadMeta(storage);render();
    window.EndlessRailsSettings?.refresh();
  }
  function open(tab='battle') { screen.hidden=false;selectTab(tab); }
  function close() { open('battle'); }
  function start() {
    if(window.EndlessRailsCloud&&!window.EndlessRailsCloud.canStart()){window.EndlessRailsCloud.open();return;}
    meta = metaApi.loadMeta(storage); const plan = metaApi.planFor(meta); screen.hidden = true;
    window.EndlessRailsGame?.startRun(plan);
  }
  function refresh() { meta = metaApi.loadMeta(storage); if (!screen.hidden) render(); }
  trainUpgradeButton?.addEventListener('click',()=>{const result=metaApi.upgradeTrain(meta);meta=result.meta;if(result.purchased){save();render();}});
  startButton.addEventListener('click',()=>selectTab('battle',true));
  $('shopToBattle').addEventListener('click',()=>selectTab('battle',true));
  tabs.forEach(([key,id],index)=>{
    $(id).addEventListener('click',()=>selectTab(key));
    $(id).addEventListener('keydown',event=>{
      let next;
      if(event.code==='ArrowRight')next=(index+1)%tabs.length;
      if(event.code==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
      if(event.code==='Home')next=0;if(event.code==='End')next=tabs.length-1;
      if(next!==undefined){event.preventDefault();event.stopPropagation?.();selectTab(tabs[next][0],true);}
    });
  });
  window.EndlessRailsMetaUI = { open, close, start, refresh, render, selectTab, getTab:()=>activeTab };
  selectTab('battle');
})();
