"use strict";
// v0.12 map controller: owns the route-map overlay state (selection, reset
// confirmation, the last node result banner) and turns the engine's active
// expedition into the model of screens/map.js. Starting a node goes through
// flow-logic's transaction (checkpoint persisted before combat starts), never
// directly into the engine.

import { state, longterm, expedition } from "./engine.js";
import { startExpeditionNode, resetExpedition } from "./flow-logic.js";

const mapCtl = (() => {
  let hub = null; // { invalidate, scrollIntoView, afterRender, openHome }
  let visible = false, selected = null, resetConfirm = false, lastResult = null, locateLayer = 0;
  const changed = () => hub?.invalidate();

  function attach(h) { hub = h; }

  function open(result) {
    visible = true; resetConfirm = false;
    if (result) lastResult = result;
    selected = null;
    const last = expedition.visitedNode(state.activeExpedition);
    locateLayer = expedition.currentLayer(state.activeExpedition) || 1;
    changed();
    if (last) hub?.afterRender?.(() => hub.scrollIntoView?.("mapColumn", "mapNode-" + last.id, true));
  }
  function close() { visible = false; selected = null; resetConfirm = false; changed(); }

  function nodeState(exp, node, reachableIds, visitedIds) {
    if (visitedIds.includes(node.id)) {
      const last = visitedIds[visitedIds.length - 1];
      return node.id === last && exp.status === "active" ? "current" : "cleared";
    }
    if (reachableIds.includes(node.id)) return "next";
    return node.layer <= (expedition.currentLayer(exp) || 1) ? "locked" : "future";
  }

  function model() {
    const exp = state.activeExpedition;
    const reachable = expedition.reachableNext(exp);
    const reachableIds = reachable.map(node => node.id);
    const visitedIds = exp?.visitedIds || [];
    const layer = expedition.currentLayer(exp) || 1;
    const lastId = visitedIds[visitedIds.length - 1] || null;
    // Edge list for the rail painting: the actually walked path lights up,
    // forward options of the current position glow amber, the rest stay dim.
    const edges = [];
    for (const node of exp?.nodes || []) {
      for (const to of node.nextIds) {
        const fromIndex = visitedIds.indexOf(node.id);
        const kind = fromIndex >= 0 && visitedIds[fromIndex + 1] === to ? "walked"
          : node.id === lastId && reachableIds.includes(to) ? "next"
          : "future";
        edges.push({ from: node.id, to, kind });
      }
    }
    const rows = [];
    for (let l = expedition.LAYER_COUNT; l >= 1; l--) {
      const nodes = (exp?.nodes || []).filter(node => node.layer === l);
      rows.push({
        layer: l, index: rows.length, emphasis: l === layer,
        on: actions,
        nodes: nodes.map((node, slot) => {
          const info = expedition.NODE_TYPES[node.type] || { label: node.type, glyph: "·", rewardHint: "" };
          const nodeStateText = { cleared: "已通过", current: "当前位置", next: "可选择", locked: "已偏离", future: "待抵达" }[nodeState(exp, node, reachableIds, visitedIds)] || "";
          return { id: node.id, slot, glyph: info.glyph, name: info.label, tag: nodeStateText, state: nodeState(exp, node, reachableIds, visitedIds), selected: selected === node.id };
        }),
      });
    }
    const detailNode = selected && exp ? expedition.nodeById(exp, selected) : null;
    let detail = null;
    if (detailNode) {
      const info = expedition.NODE_TYPES[detailNode.type] || { label: detailNode.type, glyph: "·", rewardHint: "" };
      const startable = reachableIds.includes(detailNode.id) && exp.status === "active";
      detail = {
        id: detailNode.id, layer: detailNode.layer, name: info.label, rewardHint: info.rewardHint,
        objective: detailNode.type === "final" ? "走完终点轨道，完成整图结算。" : "护送列车走完约 60 秒轨道；列车存活即通过。",
        statusHint: startable ? "预计时长约 1 分钟 · 失败可重试本节点" : "当前不可开始 · 浏览不影响路线",
        startable, startText: startable ? "开始节点 »" : detailNode.type === "final" ? "抵达后开放" : "不可开始",
      };
    }
    const region = exp ? longterm.regionById(exp.regionId) : null;
    const result = lastResult?.note ? lastResult.note
      : lastResult && !lastResult.expeditionFinal
        ? `上一节点带回：废料 +${fmt(lastResult.payout?.scrap)} · 组件 +${fmt(lastResult.payout?.components)} · 数据 +${fmt(lastResult.payout?.data)} · 券 +${lastResult.tokensGain ?? 0}`
        : lastResult?.expeditionFinal ? "远征完成 · 结算见报告" : null;
    return {
      title: exp ? `${region?.name || "远征"} · 第 ${layer}/${expedition.LAYER_COUNT} 层 · ${statusText(exp)}` : "远征路线",
      tokens: Math.floor(exp?.tokens || 0),
      rows, edges, detail, result, resetConfirm,
      selectedId: selected, currentLayer: layer,
      on: actions,
    };
  }
  const fmt = n => String(Math.floor((Number(n) || 0) * 10) / 10);
  const statusText = exp => exp.status === "active" ? `${exp.visitedIds.length} 节点已通过` : exp.status === "completed" ? "已通关" : "已重置";

  const actions = {
    select: id => { selected = selected === id ? null : id; changed(); },
    closeDetail: () => { selected = null; changed(); },
    start: () => {
      const outcome = startExpeditionNode(selected);
      if (outcome?.ok) { selected = null; lastResult = null; return; }
      const reasons = { save: "存档写入失败 · 请重试", unreachable: "该节点当前不可达", attempt: "已有进行中的节点", expedition: "远征已结束", ledger: "账本已满" };
      lastResult = { note: reasons[outcome?.error] || "无法开始节点" };
      changed();
    },
    reset: () => {
      if (!resetConfirm) { resetConfirm = true; changed(); return; }
      resetConfirm = false;
      if (resetExpedition()) { close(); state.activeExpedition = null; hub?.openHome?.(); }
    },
    cancelReset: () => { resetConfirm = false; changed(); },
  };

  function recordResult(result) { if (result) { lastResult = result; changed(); } }

  return { attach, open, close, model, recordResult, get visible() { return visible; } };
})();

export { mapCtl };
