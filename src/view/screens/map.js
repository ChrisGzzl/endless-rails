"use strict";
// v0.12 expedition route map (规划 §18.2, Slay-the-Spire-style): the whole
// graph - roads and circular node icons - is painted by one custom canvas
// node; transparent 56px hit buttons are absolutely positioned on top of each
// node. Pure view over the model from app/ui-map.js; interactive nodes carry
// tag:"button".

import { uiEl } from "../ui/kit.js";
import { uiSheet } from "./sheet.js";

const mapScreen = (() => {
  const E = uiEl, S = uiSheet;

  // Shared geometry (px): L1 sits at the bottom, L12 at the top; horizontal
  // slots are fractions of the map width so the layout reflows.
  const TOP_PAD = 52, ROW_SPAN = 96, BOTTOM_PAD = 52;
  const CONTENT_H = TOP_PAD + 11 * ROW_SPAN + BOTTOM_PAD;
  const HIT = 56;
  const nodeCY = layer => TOP_PAD + (12 - layer) * ROW_SPAN;
  const nodeCX = (slot, count) => (slot + 1) / (count + 1);
  const radiusOf = type => (type === "final" || type === "start" ? 25 : 21);

  const RAIL = {
    walked: { core: "rgba(126, 222, 170, 0.95)", width: 5 },
    next: { core: "rgba(255, 199, 95, 0.95)", width: 4, dash: [10, 8] },
    future: { core: "rgba(152, 188, 194, 0.5)", width: 2.5 },
  };
  const NODE_RING = {
    current: { color: "#7fdeaa", width: 4 },
    next: { color: "#ffc86c", width: 3.5 },
    cleared: { color: "rgba(127, 217, 168, 0.55)", width: 2.5 },
    future: { color: "rgba(150, 186, 192, 0.45)", width: 2 },
    locked: { color: "rgba(110, 132, 134, 0.22)", width: 1.5 },
  };
  const GLYPH_COLOR = { start: "#9fd9c8", combat: "#d8e8e2", risk: "#ffcf8e", final: "#ff9d7a" };

  // Flatten the model rows into positioned graph data for painter + buttons.
  // Nodes within a layer are re-ordered so roads read without crossings even
  // on maps generated before the monotone-edge generator (barycenter sweep:
  // each row is sorted by the average position of its roads, bottom-up then
  // top-down, which also keeps the walk order stable for identical graphs).
  function buildGraph(m) {
    const edges = m.edges || [];
    const inOf = new Map(), outOf = new Map();
    for (const edge of edges) {
      (inOf.get(edge.to) || inOf.set(edge.to, []).get(edge.to)).push(edge.from);
      (outOf.get(edge.from) || outOf.set(edge.from, []).get(edge.from)).push(edge.to);
    }
    const rowsData = m.rows.map(row => row.nodes.map(node => node.id));
    const slotOf = new Map();
    const seedRow = rowsData[rowsData.length - 1];
    seedRow.forEach((id, i) => slotOf.set(id, i));
    const reorder = (row, neighbourIdsOf) => {
      const scored = row.map((id, i) => {
        const anchors = neighbourIdsOf(id).map(nid => slotOf.get(nid)).filter(v => v != null);
        return { id, i, b: anchors.length ? anchors.reduce((a, c) => a + c, 0) / anchors.length : i };
      });
      scored.sort((a, b) => a.b - b.b || a.i - b.i);
      scored.forEach((item, slot) => { slotOf.set(item.id, slot); row[slot] = item.id; });
    };
    // rowsData is L12..L1 (top first): sweep upward from the start layer, then
    // back down, twice - enough for these near-monotone graphs.
    for (let round = 0; round < 2; round++) {
      for (let r = rowsData.length - 2; r >= 0; r--) reorder(rowsData[r], id => inOf.get(id) || []);
      for (let r = 1; r < rowsData.length; r++) reorder(rowsData[r], id => outOf.get(id) || []);
    }
    const nodes = [];
    const byLayer = new Map();
    m.rows.forEach((row, r) => {
      byLayer.set(row.layer, row.nodes.length);
      rowsData[r].forEach((id, slot) => {
        const node = row.nodes.find(n => n.id === id);
        nodes.push({ ...node, slot, cx: nodeCX(slot, row.nodes.length), cy: nodeCY(row.layer), layer: row.layer });
      });
    });
    return { nodes, byLayer, edges, selectedId: m.selectedId || null, currentLayer: m.currentLayer || 0 };
  }

  // The custom painter: roads first (casing under core), then node circles.
  function paintMap(ctx, box, wrapper, graph) {
    const W = box.w;
    const px = n => box.x + n.cx * W;
    const py = n => box.y + n.cy;
    const nodeById = new Map(graph.nodes.map(n => [n.id, n]));

    // Road casings (dark outline) for every edge, so cores never get
    // overpainted by a neighbouring edge's casing.
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(6, 18, 24, 0.92)";
    ctx.lineWidth = 9;
    ctx.beginPath();
    for (const edge of graph.edges) {
      const a = nodeById.get(edge.from), b = nodeById.get(edge.to);
      if (!a || !b) continue;
      strokeEdge(ctx, px(a), py(a), px(b), py(b), radiusOf(a.type), radiusOf(b.type));
    }
    ctx.stroke();
    // Cores by kind: dim future first, then the glowing choices on top.
    for (const order of ["future", "next", "walked"]) {
      const style = RAIL[order];
      ctx.strokeStyle = style.core;
      ctx.lineWidth = style.width;
      ctx.setLineDash(style.dash || []);
      ctx.beginPath();
      for (const edge of graph.edges) {
        if (edge.kind !== order) continue;
        const a = nodeById.get(edge.from), b = nodeById.get(edge.to);
        if (!a || !b) continue;
        strokeEdge(ctx, px(a), py(a), px(b), py(b), radiusOf(a.type), radiusOf(b.type));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Layer rail labels on the left.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [layer, count] of graph.byLayer) {
      ctx.font = "700 10px ui-monospace, monospace";
      ctx.fillStyle = layer === graph.currentLayer ? "rgba(127, 217, 168, 0.95)" : "rgba(129, 163, 168, 0.5)";
      ctx.fillText("L" + layer, box.x + 14, box.y + nodeCY(layer));
      void count;
    }

    // Node discs.
    for (const node of graph.nodes) {
      const x = px(node), y = py(node), r = radiusOf(node.type);
      if (node.state === "current") {
        ctx.fillStyle = "rgba(127, 217, 168, 0.13)";
        ctx.beginPath(); ctx.arc(x, y, r + 12, 0, Math.PI * 2); ctx.fill();
      }
      if (node.state === "next") {
        ctx.fillStyle = "rgba(255, 200, 108, 0.10)";
        ctx.beginPath(); ctx.arc(x, y, r + 10, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = node.state === "locked" ? "rgba(14, 30, 36, 0.55)" : "rgb(15, 41, 51)";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      const ring = NODE_RING[node.state] || NODE_RING.future;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.font = (node.type === "final" ? "900 20px" : "700 17px") + " \"PingFang SC\", \"Microsoft YaHei\", system-ui, sans-serif";
      ctx.fillStyle = node.state === "locked" ? "rgba(140, 160, 162, 0.4)" : GLYPH_COLOR[node.type] || "#d8e8e2";
      ctx.fillText(node.glyph, x, y + 1);
      if (node.state === "cleared") {
        ctx.fillStyle = "rgba(20, 46, 38, 0.95)";
        ctx.beginPath(); ctx.arc(x + r - 5, y + r - 5, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(127, 217, 168, 0.9)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x + r - 5, y + r - 5, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.font = "700 10px system-ui";
        ctx.fillStyle = "#9fe8c0";
        ctx.fillText("✓", x + r - 5, y + r - 4);
      }
    }
    // Selection halo on top of everything.
    if (graph.selectedId && nodeById.has(graph.selectedId)) {
      const node = nodeById.get(graph.selectedId);
      ctx.strokeStyle = "rgba(180, 236, 239, 0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(px(node), py(node), radiusOf(node.type) + 7, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function strokeEdge(ctx, x1, y1, x2, y2, r1, r2) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const ax = x1 + ux * (r1 + 4), ay = y1 + uy * (r1 + 4);
    const bx = x2 - ux * (r2 + 4), by = y2 - uy * (r2 + 4);
    ctx.moveTo(ax, ay);
    ctx.bezierCurveTo(ax, (ay + by) / 2, bx, (ay + by) / 2, bx, by);
  }

  function detail(m) {
    const d = m.detail;
    if (!d) return null;
    return E({ ...S.mapDetail, key: "mapDetail", ref: "/2" },
      E({ ...S.mapDetail_copy, ref: "/2/0" },
        E({ ...S.mapDetail_b, ref: "/2/0/0" }, d.name + " ", E({ ...S.mapDetail_small, ref: "/2/0/0/0" }, "L" + d.layer)),
        E({ ...S.mapDetail_p, ref: "/2/0/1" }, d.objective),
        E({ ...S.mapDetail_p_v2, ref: "/2/0/2" }, d.rewardHint),
        E({ ...S.mapDetail_p_v3, ref: "/2/0/3" }, d.statusHint)),
      E({ ...S.mapDetail_actions, ref: "/2/1" },
        E({ tag: "button", ...S.mapStartButton, key: "mapStartButton", ref: "/2/1/0", disabled: !d.startable, onTap: d.startable ? m.on.start : null, label: d.startable ? "开始" + d.name : d.name + "暂不可开始" },
          d.startText),
        E({ tag: "button", ...S.mapCloseDetail, key: "mapCloseDetail", ref: "/2/1/1", onTap: m.on.closeDetail }, "收起")));
  }

  function build(m) {
    const graph = buildGraph(m);
    return E({ ...S.mapScreen, key: "mapScreen", ref: "" },
      E({ ...S.mapHeader, ref: "/0" },
        E({ ...S.mapHeader_copy, ref: "/0/0" },
          E({ ...S.mapEyebrow, ref: "/0/0/0" }, "RAILWAY MAP / 远征路线"),
          E({ ...S.mapTitle, key: "mapTitle", ref: "/0/0/1" }, m.title),
          E({ ...S.mapLegend, key: "mapLegend", ref: "/0/0/2" }, "◈ 启程 · ⬤ 普通战斗 · ⚠ 高危战斗 · ★ 终点冲击"),
          m.result ? E({ ...S.mapResult, key: "mapResult", ref: "/0/0/3" }, m.result) : null),
        E({ ...S.mapHeader_side, ref: "/0/1" },
          E({ ...S.mapTokens, key: "mapTokens", ref: "/0/1/0" }, "远征券 ", E({ ...S.mapTokens_b, key: "mapTokensValue", ref: "/0/1/0/0" }, String(m.tokens))),
          m.resetConfirm ? E({ ...S.mapResetRow, ref: "/0/1/1" },
            E({ tag: "button", ...S.mapResetConfirm, key: "mapResetConfirm", ref: "/0/1/1/0", onTap: m.on.reset }, "确认重置"),
            E({ tag: "button", ...S.mapCloseDetail, key: "mapResetCancel", ref: "/0/1/1/1", onTap: m.on.cancelReset }, "取消"))
            : E({ tag: "button", ...S.mapResetButton, key: "mapResetButton", ref: "/0/1/1", onTap: m.on.reset, label: "重置远征" }, "重置远征"))),
      E({ ...S.mapColumn, key: "mapColumn", ref: "/1" },
        E({ ...S.mapArea, key: "mapArea", ref: "/1/0", height: CONTENT_H, paint: (ctx, box, node) => paintMap(ctx, box, node, graph) },
          graph.nodes.map(node => E({ tag: "button", ...S.mapHit, key: "mapNode-" + node.id, ref: "/1/0/" + node.layer + "/" + node.slot, left: (node.cx * 100) + "%", top: node.cy - HIT / 2, marginLeft: -HIT / 2, label: node.name + "·" + node.tag, onTap: () => m.on.select(node.id) })))),
      detail(m));
  }

  return { build, CONTENT_H };
})();

export { mapScreen };
