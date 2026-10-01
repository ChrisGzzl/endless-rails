"use strict";
import { uiKit } from "../../ui/kit.js";
// Presentation only: topology stays visible; undiscovered contents stay private.
// The existing controller supplies glyphs rather than types; keep that public
// projection intact and translate its four alpha.1 glyphs here.
const railMap = (() => {
  const TOP_PAD = 94, ROW_SPAN = 104, BOTTOM_PAD = 72, HIT = 56, LAYERS = 12;
  const CONTENT_H = TOP_PAD + (LAYERS - 1) * ROW_SPAN + BOTTOM_PAD;
  const TYPES = { "◈": "start", "⬤": "combat", "⚠": "risk", "★": "final" };
  const NAMES = { start: "启程车站", combat: "废弃站点", risk: "危险区域", elite: "危险区域", final: "污染核心", boss: "污染核心", shop: "补给站", supply: "补给站" };
  const typeOf = node => node.type || TYPES[node.glyph] || "combat";
  const nameOf = node => NAMES[typeOf(node)] || node.name;
  const sizeOf = type => ["final", "boss"].includes(type) ? 24 : ["risk", "elite"].includes(type) ? 21 : type ? 19 : 12;
  const dangerOf = node => ["final", "boss"].includes(typeOf(node)) ? 3 : ["risk", "elite"].includes(typeOf(node)) ? 2 : ["start", "shop", "supply"].includes(typeOf(node)) ? 0 : 1;
  // One lazy map-only sheet; it never joins the game's boot/battle art gates.
  // Alpha-trimmed sampling bounds retain every icon's original aspect ratio.
  const ATLAS = "assets/map-legends-v2.webp?v=v0.12.0.6";
  const FRAMES = {
    train: [28, 49, 211, 195], start: [263, 31, 229, 225], combat: [517, 64, 226, 186],
    supply: [25, 261, 224, 220], risk: [269, 261, 236, 217], final: [530, 265, 219, 216],
  };

  function sprite(ctx, image, type, size) {
    const frame = FRAMES[{ shop: "supply", elite: "risk", boss: "final" }[type] || type];
    if (!image || !frame) return false;
    const [x, y, w, h] = frame, scale = size / Math.max(w, h);
    ctx.drawImage(image, x, y, w, h, -w * scale / 2, -h * scale / 2, w * scale, h * scale);
    return true;
  }

  function graph(m, shortScreen = false) {
    const currentLayer = Math.max(1, Math.min(LAYERS, m.currentLayer || 1));
    const topPad = TOP_PAD, rowSpan = shortScreen ? 88 : ROW_SPAN;
    const edges = m.edges || [], inOf = new Map(), outOf = new Map();
    for (const edge of edges) {
      (inOf.get(edge.to) || inOf.set(edge.to, []).get(edge.to)).push(edge.from);
      (outOf.get(edge.from) || outOf.set(edge.from, []).get(edge.from)).push(edge.to);
    }
    // Keep the existing barycenter sweep for old saves with crossing tracks.
    const rows = m.rows.map(row => row.nodes.map(node => node.id));
    const slots = new Map();
    (rows[rows.length - 1] || []).forEach((id, i) => slots.set(id, i));
    const reorder = (row, neighbours) => {
      const scored = row.map((id, i) => {
        const anchors = neighbours(id).map(nid => slots.get(nid)).filter(v => v != null);
        return { id, i, b: anchors.length ? anchors.reduce((a, c) => a + c, 0) / anchors.length : i };
      });
      scored.sort((a, b) => a.b - b.b || a.i - b.i);
      scored.forEach((item, slot) => { slots.set(item.id, slot); row[slot] = item.id; });
    };
    for (let round = 0; round < 2; round++) {
      for (let r = rows.length - 2; r >= 0; r--) reorder(rows[r], id => inOf.get(id) || []);
      for (let r = 1; r < rows.length; r++) reorder(rows[r], id => outOf.get(id) || []);
    }
    // Reconstruct discovered junctions from the existing travelled path. This
    // also retains intelligence about branches the player passed over, without
    // adding discovery fields to the save or exposing two layers in advance.
    const visited = new Set(m.rows.flatMap(row => row.nodes)
      .filter(node => ["cleared", "current"].includes(node.state)).map(node => node.id));
    const knownIds = new Set(visited);
    for (const edge of edges) if (visited.has(edge.from)) knownIds.add(edge.to);
    const nodes = [];
    m.rows.forEach((row, r) => {
      rows[r].forEach((id, slot) => {
        const node = row.nodes.find(n => n.id === id);
        const known = knownIds.has(id) || node.state === "next";
        // Unknown markers have no type/name/reward projection, so their size,
        // label and hit target cannot accidentally disclose their contents.
        // Stable topographic placement: offset stations from the rigid grid,
        // with less lateral scatter in dense rows to preserve finger-sized gaps.
        let hash = 2166136261;
        for (const ch of id + ":" + row.layer) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
        const spread = [0, 0.08, 0.06, 0.025, 0.008][row.nodes.length] || 0;
        nodes.push({ ...(known ? { ...node, type: typeOf(node) } : { id, state: "unknown" }), known, layer: row.layer, slot,
          cx: (slot + 1) / (row.nodes.length + 1) + (hash % 1001 / 500 - 1) * spread,
          cy: topPad + (LAYERS - row.layer) * rowSpan + ((hash >>> 10) % 11 - 5) });
      });
    });
    const ids = new Set(nodes.map(n => n.id));
    const currentId = nodes.find(n => n.state === "current")?.id
      || nodes.find(n => n.layer === currentLayer && n.state === "cleared")?.id;
    return { nodes, currentLayer, currentId, topPad, rowSpan, selectedId: m.selectedId,
      edges: edges.filter(e => ids.has(e.from) && ids.has(e.to)),
      height: topPad + (LAYERS - 1) * rowSpan + BOTTOM_PAD };
  }

  function polygon(ctx, points, fill, stroke, width = 1.5) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function line(ctx, points, color, width = 2) {
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }

  const PAPER = "#eee6d5", INK = "#283840", MUTED = "#829398";

  // Conventional cartographic railway: dark casing with evenly alternating
  // white/black blocks. The same symbol is used throughout the complete map.
  function track(ctx, a, b, kind) {
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const start = sizeOf(a.type) + 4, end = sizeOf(b.type) + 4;
    const ax = a.x + dx / length * start, ay = a.y + dy / length * start;
    const bx = b.x - dx / length * end, by = b.y - dy / length * end;
    const middle = (ay + by) / 2;
    const path = () => {
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.bezierCurveTo(ax, middle, bx, middle, bx, by);
    };
    ctx.save(); ctx.lineCap = "butt";
    if (kind !== "future") {
      path(); ctx.strokeStyle = kind === "walked" ? "#7ca7b3" : "#d8b771";
      ctx.lineWidth = 10; ctx.stroke();
    }
    path(); ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
    ctx.setLineDash([7, 7]);
    path(); ctx.strokeStyle = "#f6f2e2"; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  // All icons share the same ink, paper, stroke weight and plan-view language.
  function station(ctx, start) {
    ctx.strokeRect(-14, -12, 28, 24);
    line(ctx, [[-18, 16], [18, 16]], INK, 2);
    line(ctx, [[-5, -12], [-5, 12]], INK, 2);
    ctx.fillRect(1, -7, 8, 5); ctx.fillRect(1, 2, 8, 5);
    if (start) {
      line(ctx, [[-14, -12], [-14, -23]], INK, 2);
      polygon(ctx, [[-14, -23], [0, -23], [-3, -18], [-14, -18]], INK);
    }
  }
  function supply(ctx) {
    ctx.strokeRect(-13, -11, 26, 24);
    line(ctx, [[-13, -11], [0, -17], [13, -11]], INK, 2);
    line(ctx, [[0, -11], [0, 13]], INK, 2);
    line(ctx, [[-7, 1], [7, 1]], INK, 2);
  }
  function danger(ctx) {
    polygon(ctx, [[0, -17], [17, 14], [-17, 14]], null, INK, 2);
    line(ctx, [[0, -7], [0, 4]], INK, 3);
    ctx.fillRect(-1.5, 8, 3, 3);
  }
  function core(ctx) {
    polygon(ctx, [[0, -24], [24, 0], [0, 24], [-24, 0]], null, INK, 2);
    polygon(ctx, [[0, -17], [17, 0], [0, 17], [-17, 0]], null, INK, 1.5);
    polygon(ctx, [[0, -11], [9, 6], [-9, 6]], INK);
    line(ctx, [[-7, 14], [7, 14]], INK, 2);
  }
  function train(ctx) {
    // Clear locomotive front if the illustrated sheet cannot be decoded.
    polygon(ctx, [[-17, 16], [-17, -13], [-11, -21], [11, -21], [17, -13], [17, 16]], "#f8f0df", INK, 2);
    ctx.fillStyle = "#315e73"; ctx.fillRect(-11, -12, 22, 10);
    line(ctx, [[0, -12], [0, -2]], "#d3e0e0", 2);
    ctx.fillStyle = "#d7a654"; ctx.fillRect(-12, 4, 5, 4); ctx.fillRect(7, 4, 5, 4);
    line(ctx, [[-11, 12], [11, 12]], INK, 2); line(ctx, [[-13, 20], [13, 20]], INK, 3);
  }

  // Terrain is decorative cartography, independent of node types and rewards.
  // It is deliberately quiet enough to keep crossings and ? markers readable.
  function terrain(ctx, box) {
    ctx.fillStyle = PAPER; ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.save(); ctx.translate(box.x, box.y);
    ctx.strokeStyle = "rgba(93, 112, 123, 0.10)"; ctx.lineWidth = 0.7;
    for (let x = 24; x < box.w; x += 72) line(ctx, [[x, 0], [x, box.h]], "rgba(93, 112, 123, 0.09)", 0.7);
    for (let y = 28; y < box.h; y += 72) line(ctx, [[0, y], [box.w, y]], "rgba(93, 112, 123, 0.09)", 0.7);
    for (let y = 145, cluster = 0; y < box.h; y += 270, cluster++) {
      const left = cluster % 2 === 0, x = left ? -28 : box.w + 28;
      ctx.save(); ctx.translate(x, y); if (!left) ctx.scale(-1, 1);
      for (let i = 0; i < 6; i++) {
        const r = 30 + i * 14;
        ctx.beginPath(); ctx.moveTo(-15, -r);
        ctx.bezierCurveTo(r * 1.6, -r * 1.3, r * 0.4, -16, r, 22);
        ctx.bezierCurveTo(r * 1.45, r * 0.8, r * 0.35, r * 1.5, -15, r * 1.8);
        ctx.strokeStyle = "rgba(122, 133, 139, 0.22)"; ctx.lineWidth = 0.8; ctx.stroke();
      }
      ctx.restore();
      // Disused factory blocks beside a surveyed access road.
      const bx = left ? box.w - 47 : 20;
      ctx.strokeStyle = "rgba(120, 124, 128, 0.23)"; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = "rgba(148, 151, 154, 0.10)";
        ctx.fillRect(bx, y + 32 + i * 19, 17 + (i % 2) * 7, 11);
        ctx.strokeRect(bx, y + 32 + i * 19, 17 + (i % 2) * 7, 11);
      }
      ctx.setLineDash([3, 3]);
      line(ctx, [[bx - 7, y + 26], [bx - 7, y + 100]], "rgba(120, 124, 128, 0.25)", 1);
      ctx.setLineDash([]);
    }
    // Map border ticks, north arrow and a survey title; no fictional distance.
    ctx.font = "10px \"PingFang SC\", \"Microsoft YaHei\", system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = MUTED; ctx.fillText("RAILWAY SURVEY / 铁路勘测图", 15, 24);
    ctx.fillText("全线已测绘 · 站点情报待探索", 15, 42);
    const nx = box.w - 26;
    ctx.textAlign = "center"; ctx.fillText("N", nx, 17);
    polygon(ctx, [[nx, 28], [nx - 6, 44], [nx, 40], [nx + 6, 44]], null, MUTED, 1);
    polygon(ctx, [[nx, 28], [nx - 6, 44], [nx, 40]], MUTED);
    ctx.restore();
  }
  function caption(ctx, text, y, current, selected, next) {
    ctx.font = "600 10px \"PingFang SC\", \"Microsoft YaHei\", system-ui, sans-serif";
    // Cartographic text halo masks a rail beneath the letters without a card.
    ctx.strokeStyle = PAPER; ctx.lineWidth = 3; ctx.strokeText(text, 0, y);
    ctx.fillStyle = current || selected ? "#245e77" : next ? "#8b6a35" : INK; ctx.fillText(text, 0, y);
    if (current || selected) line(ctx, [[-19, y + 7], [19, y + 7]], "#508697", 1.5);
  }
  function paint(ctx, box, wrapper, g) {
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.setLineDash([]);
    const atlas = uiKit.image(ATLAS);
    terrain(ctx, box);
    const positioned = new Map(g.nodes.map(n => [n.id, { ...n, x: box.x + n.cx * box.w, y: box.y + n.cy }]));
    // Draw the entire railway network first; travelled/available routes receive
    // only a subtle coloured underlay, preserving the black/white map symbol.
    for (const kind of ["future", "next", "walked"]) for (const edge of g.edges) {
      if (edge.kind === kind) track(ctx, positioned.get(edge.from), positioned.get(edge.to), kind);
    }
    ctx.font = "10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let layer = 1; layer <= LAYERS; layer++) {
      const y = box.y + g.topPad + (LAYERS - layer) * g.rowSpan;
      ctx.fillStyle = layer === g.currentLayer ? "#306d85" : MUTED;
      ctx.fillText("L" + layer, box.x + 14, y);
      line(ctx, [[box.x + box.w - 8, y], [box.x + box.w - 3, y]], MUTED, 1);
    }
    for (const node of positioned.values()) {
      ctx.save(); ctx.translate(node.x, node.y);
      const current = node.id === g.currentId, r = current ? 23 : sizeOf(node.type);
      ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      if (current) {
        if (!sprite(ctx, atlas, "train", 46)) train(ctx);
        polygon(ctx, [[0, -32], [4, -27], [-4, -27]], "#306d85");
      }
      else if (!node.known) {
        ctx.fillStyle = "#829398"; ctx.font = "600 20px ui-monospace, monospace"; ctx.fillText("?", 0, 1);
      } else {
        if (node.state === "locked") ctx.globalAlpha = 0.55;
        if (!sprite(ctx, atlas, node.type, r * 2)) {
          if (["risk", "elite"].includes(node.type)) danger(ctx);
          else if (["final", "boss"].includes(node.type)) core(ctx);
          else if (["shop", "supply"].includes(node.type)) supply(ctx);
          else station(ctx, node.type === "start");
        }
      }
      if (!current && (node.id === g.selectedId || node.state === "next")) {
        polygon(ctx, [[0, -r - 4], [3, -r - 9], [-3, -r - 9]], node.id === g.selectedId ? "#306d85" : "#c39445");
      }
      if (current || node.known) {
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        caption(ctx, current ? "当前列车" : nameOf(node), r + 14, current, node.id === g.selectedId, node.state === "next");
      }
      ctx.restore();
    }
    ctx.restore();
    void wrapper;
  }

  return { graph, paint, typeOf, nameOf, dangerOf, HIT, CONTENT_H, LAYERS };
})();

export { railMap };
