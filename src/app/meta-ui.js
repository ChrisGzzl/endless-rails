"use strict";
import { metaStorage } from "./game.js";
(() => {
  const metaApi = window.EndlessRailsLongterm;
  if (!metaApi) return;
  const $ = id => document.getElementById(id);
  const storage = metaStorage;
  let meta = metaApi.loadMeta(storage);
  const screen = $("startScreen"), regionList = $("metaRegionList"), carList = $("metaCarList"), researchList = $("metaResearchList");
  const resourceText = $("metaResources"), trainText = $("metaTrainLevel"), loadoutText = $("metaLoadoutSummary"), startButton = $("metaStartButton");
  if (!screen || !regionList || !carList || !researchList || !startButton) return;
  const icon = id => `<i class="ui-icon ui-icon--${id}" aria-hidden="true"></i>`;
  const pct = value => `${value >= 1 ? "+" : ""}${((value - 1) * 100).toFixed(1)}%`;

  function save() { metaApi.saveMeta(storage, meta); }

  // -- talent draft (需求 §14.1): edits are free previews; the single apply
  // call validates, charges and commits atomically.
  let draft = null, branch = "hull", presetNotice = "";
  function draftFromMeta() { draft = { nodes: { ...meta.talents.nodes }, specs: { ...meta.talents.specs } }; presetNotice = ""; }
  function draftDirty() {
    for (const node of metaApi.TALENT_NODES) if ((draft.nodes[node.id] || 0) !== (meta.talents.nodes[node.id] || 0)) return true;
    for (const key in draft.specs) if (draft.specs[key] !== meta.talents.specs[key]) return true;
    return false;
  }
  // Withdrawing a prerequisite cascades to its dependents (需求 §26.1).
  function withdrawNode(nodeId) {
    const before = metaApi.spentPoints(draft);
    draft.nodes[nodeId] = Math.max(0, (draft.nodes[nodeId] || 0) - 1);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of metaApi.TALENT_NODES) {
        if (!(draft.nodes[node.id] > 0) || !node.prereq?.id) continue;
        if ((draft.nodes[node.prereq.id] || 0) < node.prereq.level) { draft.nodes[node.id] = 0; changed = true; }
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
      button.dataset.region = region.id;
      button.disabled = !unlocked;button.setAttribute("aria-pressed",String(meta.selectedRegion===region.id));
      button.innerHTML = `<b>${region.name}</b><small>${unlocked ? statusFor(region) : "未解锁"}</small>`;
      button.setAttribute("aria-label",region.name+" · "+(unlocked?statusFor(region):"未解锁"));
      button.addEventListener("click", () => { meta = metaApi.setRegion(meta, region.id); save(); render(); });
      regionList.append(button);
    }
  }
  function renderCars() {
    const slots = metaApi.carSlots(meta), selected = new Set(meta.loadout);
    carList.innerHTML = "";
    for (const car of metaApi.CAR_DEFS) {
      if (car.fixed) continue;
      const unlocked = metaApi.carUnlocked(meta, car.id);
      const button = document.createElement("button"); button.type = "button";
      const active = selected.has(car.id); button.className = "meta-card meta-car" + (active ? " selected" : "");
      button.disabled = !unlocked;button.setAttribute("aria-pressed",String(active));
      const stateText = !unlocked ? `需先购买${metaApi.NODE_BY_ID[metaApi.CAR_UNLOCK_NODE[car.id]].name}` : active ? "已编组" : "未编组";
      button.innerHTML = `<span class="meta-card__icon">${icon(car.id)}</span><span><b>${car.name}</b><small>${stateText}</small><em>${car.description}</em></span>`;
      if (unlocked) button.addEventListener("click", () => {
        const next = new Set(meta.loadout.filter(id => id !== "hangar"));
        if (next.has(car.id)) next.delete(car.id); else {
          if (next.size >= slots) {
            const first = next.values().next().value; if (first) next.delete(first);
          }
          next.add(car.id);
        }
        meta = metaApi.setLoadout(meta, [...next]); save(); render();
      });
      carList.append(button);
    }
  }

  // -- talent panels ---------------------------------------------------------
  const BRANCH_CARS = { hull: null, pointDefense: "pointDefense", repair: "repair", radar: "radar", storage: "storage" };
  function branchActive(branchId) { const car = BRANCH_CARS[branchId]; return !car || meta.loadout.includes(car); }

  function renderBranchTabs() {
    const bar = $("talentBranchTabs");
    bar.innerHTML = "";
    for (const item of metaApi.TALENT_BRANCHES) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "talent-branch-tab" + (branch === item.id ? " active" : "");
      button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(branch === item.id));
      const spent = metaApi.branchSpent(draft, item.id);
      const inactive = !branchActive(item.id) ? " <small>未装备</small>" : "";
      button.innerHTML = `${item.name} <b>${spent}/${item.cap}</b>${inactive}`;
      button.addEventListener("click", () => { branch = item.id; render(); });
      bar.append(button);
    }
  }
  function renderNodes() {
    const list = $("talentNodeList");
    list.innerHTML = "";
    for (const node of metaApi.TALENT_NODES) {
      if (node.branch !== branch) continue;
      const level = draft.nodes[node.id] || 0;
      const block = metaApi.nodeBlockReason(meta, draft, node.id);
      const effectText = level > 0 ? node.effect(level) : node.levels > 1 ? `${node.effect(1)} / 级` : node.effect(1);
      const row = document.createElement("div"); row.className = "talent-node" + (level > 0 ? " owned" : "");
      const copy = document.createElement("span"); copy.className = "talent-node__copy";
      const title = document.createElement("b"); title.textContent = node.name;
      const meta2 = document.createElement("small"); meta2.className = "talent-node__level"; meta2.textContent = `Lv.${level}/${node.levels} · ${node.cost} 点/级 · ${block ? `🔒 ${block}` : "可购买"}`;
      const effect = document.createElement("em"); effect.textContent = effectText;
      copy.append(title, meta2, effect);
      const controls = document.createElement("span"); controls.className = "talent-node__controls";
      const minus = document.createElement("button"); minus.type = "button"; minus.textContent = "−"; minus.disabled = level <= 0;
      minus.setAttribute("aria-label", `减少${node.name}`);
      minus.addEventListener("click", () => { withdrawNode(node.id); render(); });
      const value = document.createElement("b"); value.textContent = String(level);
      const plus = document.createElement("button"); plus.type = "button"; plus.textContent = "＋"; plus.disabled = !!block;
      plus.setAttribute("aria-label", `增加${node.name}`);
      plus.addEventListener("click", () => { raiseNode(node.id); render(); });
      controls.append(minus, value, plus);
      row.append(copy, controls);
      list.append(row);
    }
    const specOptions = metaApi.SPEC_OPTIONS[branch];
    if (specOptions) {
      const specNode = metaApi.SPEC_NODE[branch], owned = (draft.nodes[specNode] || 0) > 0;
      const specRow = document.createElement("div"); specRow.className = "talent-spec" + (owned ? "" : " locked");
      const specHead = document.createElement("span"); specHead.className = "talent-node__copy";
      const specTitle = document.createElement("b"); specTitle.textContent = metaApi.NODE_BY_ID[specNode].name;
      const specNote = document.createElement("small"); specNote.textContent = owned ? "已解锁 · 二选一（切换已购选项需改装费）" : `🔒 购买${metaApi.NODE_BY_ID[specNode].name}后开放`;
      specHead.append(specTitle, specNote);
      specRow.append(specHead);
      for (const option of specOptions) {
        const button = document.createElement("button");
        button.type = "button"; button.className = "talent-spec__option" + (draft.specs[branch] === option.id ? " active" : "");
        button.disabled = !owned;
        const name = document.createElement("b"); name.textContent = option.name;
        const desc = document.createElement("small"); desc.textContent = option.desc;
        button.append(name, desc);
        if (owned) button.addEventListener("click", () => { draft.specs[branch] = draft.specs[branch] === option.id ? null : option.id; presetNotice = ""; render(); });
        specRow.append(button);
      }
      list.append(specRow);
    }
  }
  function renderPresets() {
    const bar = $("talentPresetBar");
    bar.innerHTML = "";
    meta.presets.forEach((preset, index) => {
      const chip = document.createElement("div"); chip.className = "talent-preset";
      const load = document.createElement("button");
      load.type = "button"; load.className = "talent-preset__load";
      const spent = metaApi.spentPoints(preset.talents);
      load.innerHTML = `<b>${preset.name}</b><small>${spent} 点 · ${preset.loadout.length - 1} 车厢</small>`;
      load.addEventListener("click", () => {
        const result = metaApi.loadPreset(meta, index);
        draft = { nodes: { ...result.talents.nodes }, specs: { ...result.talents.specs } };
        presetNotice = result.problems.length ? `方案不可用：${result.problems[0]}` : "已载入方案到草稿";
        render();
      });
      load.addEventListener("dblclick", () => {
        const name = window.prompt?.("方案名称", preset.name);
        if (name && name.trim()) { meta = metaApi.renamePreset(meta, index, name.trim()); save(); render(); }
      });
      const keep = document.createElement("button");
      keep.type = "button"; keep.className = "talent-preset__save"; keep.textContent = "保存";
      keep.setAttribute("aria-label", `保存当前草稿到${preset.name}`);
      keep.addEventListener("click", () => { meta = metaApi.savePreset(meta, index, draft, meta.loadout); save(); presetNotice = `草稿已存入 ${preset.name}`; render(); });
      chip.append(load, keep);
      bar.append(chip);
    });
  }
  // Key stat diff for the fixed bottom strip (需求 §22.1).
  function summaryRows() {
    const current = metaApi.buildStats(meta);
    const next = metaApi.buildStats({ ...meta, talents: draft });
    const rows = [`最大耐久 ${Math.round(current.maxHp)} → ${Math.round(next.maxHp)}`];
    if (current.pd || next.pd) rows.push(`近防 ${current.pd ? `伤害${pct(current.pd.damageMul)}·间隔${(current.pd.intervalMul).toFixed(2)}` : "无"} → ${next.pd ? `伤害${pct(next.pd.damageMul)}·间隔${(next.pd.intervalMul).toFixed(2)}` : "无"}`);
    if (current.repairCar || next.repairCar) rows.push(`到站维修车 ${current.repairCar ? `+${Math.round(current.repairCar.flat * current.repairCar.mul)}固定` : "无"} → ${next.repairCar ? `+${Math.round(next.repairCar.flat * next.repairCar.mul)}固定` : "无"}`);
    if (current.scrapYieldMul !== next.scrapYieldMul || current.dataYieldMul !== next.dataYieldMul)
      rows.push(`资源收益 废料${pct(next.scrapYieldMul)}·数据${pct(next.dataYieldMul)}·组件${pct(next.componentYieldMul)}`);
    if (current.failureKeep !== next.failureKeep)
      rows.push(`失败保留率 ${(current.failureKeep * 100).toFixed(0)}% → ${(next.failureKeep * 100).toFixed(0)}%`);
    return { rows, current, next };
  }
  function renderSummary() {
    const available = metaApi.talentPoints(meta) - metaApi.spentPoints(draft);
    const problems = draftDirty() ? metaApi.talentProblems(meta, draft) : [];
    const paid = draftDirty() && metaApi.refitIsPaid(meta.talents, draft);
    const cost = metaApi.refitCost(meta);
    let costText = "仅追加新点 · 免费";
    if (paid) costText = meta.freeRefits > 0 ? `消耗 1 次免费重构（剩 ${meta.freeRefits} 次）` : `改装费 ${cost} 废料${meta.resources.scrap < cost ? ` · 还差 ${Math.ceil(cost - meta.resources.scrap)}` : ""}`;
    const { rows } = summaryRows();
    $("talentSummaryRows").innerHTML = rows.map(line => `<span>${line}</span>`).join("");
    const pointsLine = $("talentPointsLine");
    pointsLine.textContent = `可用点数 ${available}`;
    pointsLine.classList.toggle("bad", available < 0);
    $("talentCostLine").textContent = costText;
    $("talentReset").disabled = !draftDirty();
    $("talentApply").disabled = !draftDirty() || problems.length > 0;
    const problemsBox = $("talentProblems");
    const message = problems.length ? problems.join("；") : presetNotice;
    problemsBox.textContent = message || "";
    problemsBox.hidden = !message;
  }

  // -- research page -----------------------------------------------------------
  const RESEARCH_COPY = {
    fireControl: "提高北辰与所有无人机的伤害。",
    cycleControl: "缩短无人机普通攻击的基础间隔。",
    rangeCalibration: "扩大无人机索敌与攻击射程（不扩大爆炸/燃烧范围）。",
    hullEngineering: "提高列车最大耐久。",
    armorMaterials: "按乘法降低列车受到的直接攻击伤害。",
    repairEngineering: "提高所有到站维修与应急储备的维修量。",
    trainFireControl: "提高列车自身近防炮的伤害。",
  };
  function renderResearch() {
    researchList.innerHTML = "";
    for (const group of [["drone", "无人机战斗", "主材料：研究数据"], ["train", "列车工程", "主材料：技术组件"]]) {
      const head = document.createElement("div"); head.className = "meta-section__head talent-research-head";
      head.innerHTML = `<b>${group[1]}</b><span>${group[2]}</span>`;
      researchList.append(head);
      for (const track of metaApi.RESEARCH_TRACKS) {
        if (track.group !== group[0]) continue;
        const level = meta.research[track.id] || 0;
        const cost = metaApi.researchCost(meta, track.id);
        const maxed = !cost;
        const effect = metaApi.researchEffectText(track.id, level);
        const nextEffect = metaApi.researchEffectText(track.id, Math.min(metaApi.MAX_RESEARCH_LEVEL, level + 1));
        const row = document.createElement("div"); row.className = "meta-research-row";
        let costLine = "已达当前上限";
        if (!maxed) {
          const parts = [`${icon("scrap")}${cost.scrap}`, `${icon(cost.attack ? "data" : "components")}${cost.attack ? cost.data : cost.components}`];
          if (cost.attack && cost.components > 0) parts.push(`${icon("components")}${cost.components}`);
          if (!cost.attack && cost.data > 0) parts.push(`${icon("data")}${cost.data}`);
          costLine = parts.join(" ");
        }
        row.innerHTML = `<span class="research-icon" data-weapon="${track.id}">${icon(track.group === "drone" ? "rapid" : "pointDefense")}</span>
          <span class="research-copy"><b>${track.name}</b><small class="research-level">Lv.${level}/${metaApi.MAX_RESEARCH_LEVEL} · ${track.scope}</small>
          <small>${RESEARCH_COPY[track.id]}</small>
          <small class="research-effect">累计 ${effect.total}${maxed ? "" : ` → 下一级 ${nextEffect.total}`}</small></span>
          <button type="button" aria-label="升级${track.name}，${maxed ? "已满级" : `废料${cost.scrap}等`}" ${maxed ? "disabled" : ""}>${maxed ? "已满级" : `${costLine}<small>升级</small>`}</button>`;
        if (!maxed) row.querySelector("button").addEventListener("click", () => {
          const result = metaApi.buyResearch(meta, track.id);
          if (result.purchased) { meta = result.meta; save(); render(); }
          else { row.querySelector("button").classList.add("flash-short"); window.setTimeout(() => row.querySelector("button").classList.remove("flash-short"), 400); }
        });
        researchList.append(row);
      }
    }
    $("researchDetails").innerHTML = [
      "所有研究从 Lv1 起开放，无等待时间或每日限额；数据足够即可升级。",
      "Lv1-10 基础研究、Lv11-20 进阶研究、Lv21-30 长期研究：单级收益逐段递减。",
      "装甲材料按乘法叠算，界面显示实际受伤降低比例而非等级百分比。",
      "无人机战斗三项主消耗研究数据（里程碑需少量组件）；列车工程四项主消耗技术组件（里程碑需少量数据）。",
    ].map(line => `<p>${line}</p>`).join("");
  }

  function render() {
    const compact=n=>n>=1000000?(n/1000000).toFixed(1)+"m":n>=10000?(n/1000).toFixed(1)+"k":String(Math.floor(n));
    $("homePlayerLevel").textContent="列车 Lv."+meta.train.level;
    for(const [id,key] of [["homeScrap","scrap"],["homeComponents","components"],["homeData","data"]]){$(id).textContent=compact(meta.resources[key]);$(id).setAttribute("aria-label",String(Math.floor(meta.resources[key])));}
    const selected=metaApi.regionById(meta.selectedRegion);
    $("homeRegionName").textContent=selected.name;$("homeRegionDescription").textContent=selected.description;$("homeRegionStatus").textContent=statusFor(selected)+" · "+selected.statusText;
    screen.dataset.region=selected.id;
    const hero=$("homeHeroImage"), heroPath="assets/hero-"+selected.id+"-v3.webp";
    if(hero.getAttribute('src')!==heroPath)hero.setAttribute('src',heroPath);
    hero.setAttribute('alt',"四架无人机护送装甲列车穿越"+selected.name);
    const trainLength=metaApi.planFor(meta).trainLength;
    // 出发页摘要 (需求 §22.3)：编组 + 研究增益一行，编辑入口跳列车/研究页。
    const S = metaApi.buildStats(meta);
    const summary = `研究：伤害×${S.droneDamageMul.toFixed(2)} · 耐久×${(S.maxHp/100).toFixed(2)} · 维修×${S.repairMul.toFixed(2)}`;
    $("homeLoadout").innerHTML=icon('train')+`<span class="loadout-copy"><b>编组 ${trainLength} 节 · ${summary}</b><small>前往列车调整 · 研究入口在研究页 →</small></span><span class="loadout-cars" aria-hidden="true">${Array.from({length:Math.min(4,trainLength)},()=>icon('train')).join('')}${trainLength>4?'<small>+'+(trainLength-4)+'</small>':''}</span><span class="loadout-arrow" aria-hidden="true">›</span>`;
    $("homeLoadout").setAttribute('aria-label',`编组 ${trainLength} 节，前往列车调整`);
    meta = metaApi.normalizeMeta(meta);
    if (!draft) draftFromMeta();
    const nextXp = metaApi.xpToNext(meta.train.level);
    trainText.textContent = `列车 Lv.${meta.train.level} · ${meta.train.xp}/${nextXp} XP · 功能车厢 ${metaApi.carSlots(meta)} 槽`;
    resourceText.innerHTML = [['scrap','废料'],['components','组件'],['data','数据']].map(([key,label])=>`<span>${icon(key)}<b>${compact(meta.resources[key])}</b><small>${label}</small></span>`).join('');
    $("metaTrainProgressFill").style.width=Math.min(100,meta.train.xp/nextXp*100)+'%';
    $("metaTrainProgress").setAttribute('aria-valuemin','0');
    $("metaTrainProgress").setAttribute('aria-valuemax',String(nextXp));
    $("metaTrainProgress").setAttribute('aria-valuenow',String(meta.train.xp));
    const points = metaApi.talentPoints(meta) - metaApi.spentPoints(draft);
    const pointsEl = $("metaTalentPoints");
    pointsEl.textContent = `天赋点（草稿）${points} / ${metaApi.talentPoints(meta)} · 免费重构 ${meta.freeRefits} 次`;
    pointsEl.classList.toggle("bad", points < 0);
    const plan = metaApi.planFor(meta);
    loadoutText.textContent = `当前编组 ${plan.cars.length}/${plan.slots} 节车厢（另含车头） · ${plan.cars.map(id => metaApi.CAR_DEFS.find(c => c.id === id)?.name || id).join(" / ")}`;
    renderRegions(); renderCars(); renderBranchTabs(); renderNodes(); renderPresets(); renderSummary(); renderResearch();
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
    meta=metaApi.loadMeta(storage);draftFromMeta();render();
    window.EndlessRailsSettings?.refresh();
  }
  function open(tab='battle') { screen.hidden=false;selectTab(tab); }
  function close() { open('battle'); }
  function start() {
    if(window.EndlessRailsCloud&&!window.EndlessRailsCloud.canStart()){window.EndlessRailsCloud.open();return;}
    meta = metaApi.loadMeta(storage); const plan = metaApi.planFor(meta); screen.hidden = true;
    window.EndlessRailsGame?.startRun(plan);
  }
  function refresh() { meta = metaApi.loadMeta(storage); draftFromMeta(); if (!screen.hidden) render(); }
  startButton.addEventListener('click',()=>selectTab('battle',true));
  $("talentReset").addEventListener("click", () => { draftFromMeta(); render(); });
  $("talentApply").addEventListener("click", () => {
    const result = metaApi.applyTalents(meta, draft);
    if (!result.applied) { presetNotice = result.problems.join("；"); render(); return; }
    meta = result.meta;
    if (result.charged) presetNotice = `已支付改装费 ${result.charged} 废料`;
    else if (result.paid) presetNotice = `已消耗 1 次免费重构（剩 ${result.freeRefits} 次）`;
    else presetNotice = "";
    save(); draftFromMeta(); render();
  });
  $('homeLoadout').addEventListener('click',()=>selectTab('train',true));
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
