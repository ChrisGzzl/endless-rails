"use strict";
import { uiKit } from "../../ui/kit.js";
// Presentation only: topology stays visible; undiscovered contents stay private.
// The existing controller supplies glyphs rather than types; keep that public
// projection intact and translate its four alpha.1 glyphs here.
const railMap = (() => {
  const TOP_PAD = 94, ROW_SPAN = 104, BOTTOM_PAD = 72, HIT = 64, LAYERS = 12;
  const CONTENT_H = TOP_PAD + (LAYERS - 1) * ROW_SPAN + BOTTOM_PAD;
  const TYPES = { "◈": "start", "⬤": "combat", "⚠": "risk", "★": "final" };
  const NAMES = { start: "启程车站", combat: "废弃站点", risk: "危险区域", elite: "危险区域", final: "污染核心", boss: "污染核心", shop: "补给站", supply: "补给站" };
  const typeOf = node => node.type || TYPES[node.glyph] || "combat";
  const nameOf = node => NAMES[typeOf(node)] || node.name;
  const sizeOf = type => ["final", "boss"].includes(type) ? 32 : ["risk", "elite"].includes(type) ? 28 : type ? 26 : 20;
  const dangerOf = node => ["final", "boss"].includes(typeOf(node)) ? 3 : ["risk", "elite"].includes(typeOf(node)) ? 2 : ["start", "shop", "supply"].includes(typeOf(node)) ? 0 : 1;
  // One lazy map-only sheet; it never joins the game's boot/battle art gates.
  // Alpha-trimmed sampling bounds retain every icon's original aspect ratio.
  const ATLAS = "assets/map-legends-v1.webp?v=v0.12.0.5";
  const FRAMES = {
    train: [87, 24, 91, 226], start: [266, 20, 216, 228], combat: [512, 45, 235, 197],
    supply: [20, 271, 229, 203], risk: [269, 260, 234, 230], final: [525, 266, 225, 223],
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
        nodes.push({ ...(known ? { ...node, type: typeOf(node) } : { id, state: "unknown" }), known, layer: row.layer, slot,
          cx: (slot + 1) / (row.nodes.length + 1), cy: topPad + (LAYERS - row.layer) * rowSpan });
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

  const PAPER = "#ddd8bf", INK = "#343d36", MUTED = "#7e8371";

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
      path(); ctx.strokeStyle = kind === "walked" ? "#80a995" : "#c7ae69";
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
    // A larger locomotive symbol and a position pennant make the train legible
    // without introducing a different illustration style or glowing ring.
    polygon(ctx, [[-12, 19], [-12, -16], [-7, -23], [7, -23], [12, -16], [12, 19]], "#f4eed6", INK, 2.5);
    ctx.fillRect(-7, -14, 14, 8);
    ctx.strokeRect(-7, -1, 14, 11);
    for (const y of [-10, 5, 15]) {
      line(ctx, [[-15, y], [-12, y]], INK, 2.5); line(ctx, [[12, y], [15, y]], INK, 2.5);
    }
    line(ctx, [[-8, 23], [8, 23]], INK, 2.5);
    polygon(ctx, [[0, -34], [5, -28], [-5, -28]], "#315e4d");
  }

  // Terrain is decorative cartography, independent of node types and rewards.
  // It is deliberately quiet enough to keep crossings and ? markers readable.
  function terrain(ctx, box) {
    ctx.fillStyle = PAPER; ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.save(); ctx.translate(box.x, box.y);
    ctx.strokeStyle = "rgba(89, 101, 76, 0.10)"; ctx.lineWidth = 0.7;
    for (let x = 24; x < box.w; x += 72) line(ctx, [[x, 0], [x, box.h]], "rgba(89, 101, 76, 0.09)", 0.7);
    for (let y = 28; y < box.h; y += 72) line(ctx, [[0, y], [box.w, y]], "rgba(89, 101, 76, 0.09)", 0.7);
    for (let y = 145, cluster = 0; y < box.h; y += 270, cluster++) {
      const left = cluster % 2 === 0, x = left ? -28 : box.w + 28;
      ctx.save(); ctx.translate(x, y); if (!left) ctx.scale(-1, 1);
      for (let i = 0; i < 6; i++) {
        const r = 30 + i * 14;
        ctx.beginPath(); ctx.moveTo(-15, -r);
        ctx.bezierCurveTo(r * 1.6, -r * 1.3, r * 0.4, -16, r, 22);
        ctx.bezierCurveTo(r * 1.45, r * 0.8, r * 0.35, r * 1.5, -15, r * 1.8);
        ctx.strokeStyle = "rgba(115, 122, 83, 0.22)"; ctx.lineWidth = 0.8; ctx.stroke();
      }
      ctx.restore();
      // Disused factory blocks beside a surveyed access road.
      const bx = left ? box.w - 47 : 20;
      ctx.strokeStyle = "rgba(102, 104, 81, 0.23)"; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = "rgba(141, 137, 105, 0.10)";
        ctx.fillRect(bx, y + 32 + i * 19, 17 + (i % 2) * 7, 11);
        ctx.strokeRect(bx, y + 32 + i * 19, 17 + (i % 2) * 7, 11);
      }
      ctx.setLineDash([3, 3]);
      line(ctx, [[bx - 7, y + 26], [bx - 7, y + 100]], "rgba(102, 104, 81, 0.25)", 1);
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
  function caption(ctx, text, y, current) {
    ctx.font = "600 10px \"PingFang SC\", \"Microsoft YaHei\", system-ui, sans-serif";
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = current ? "#315e4d" : "#e8e2cc"; ctx.fillRect(-w / 2, y - 8, w, 16);
    ctx.fillStyle = current ? "#f5f0dc" : INK; ctx.fillText(text, 0, y);
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
      ctx.fillStyle = layer === g.currentLayer ? "#315e4d" : MUTED;
      ctx.fillText("L" + layer, box.x + 14, y);
      line(ctx, [[box.x + box.w - 8, y], [box.x + box.w - 3, y]], MUTED, 1);
    }
    for (const node of positioned.values()) {
      ctx.save(); ctx.translate(node.x, node.y);
      const current = node.id === g.currentId, r = current ? 30 : sizeOf(node.type);
      ctx.fillStyle = current ? "#c6d3b5" : node.state === "next" ? "#e9d7a3" : PAPER;
      ctx.fillRect(-r - 2, -r - 2, (r + 2) * 2, (r + 2) * 2);
      ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      if (current) {
        if (!sprite(ctx, atlas, "train", 60)) train(ctx);
        polygon(ctx, [[0, -39], [5, -33], [-5, -33]], "#315e4d");
      }
      else if (!node.known) {
        ctx.setLineDash([3, 3]); ctx.strokeStyle = "#929580"; ctx.lineWidth = 1.2;
        ctx.strokeRect(-16, -16, 32, 32); ctx.setLineDash([]);
        ctx.fillStyle = "#747b68"; ctx.font = "600 23px ui-monospace, monospace"; ctx.fillText("?", 0, 1);
      } else {
        if (node.state === "locked") ctx.globalAlpha = 0.55;
        if (!sprite(ctx, atlas, node.type, r * 2)) {
          if (["risk", "elite"].includes(node.type)) danger(ctx);
          else if (["final", "boss"].includes(node.type)) core(ctx);
          else if (["shop", "supply"].includes(node.type)) supply(ctx);
          else station(ctx, node.type === "start");
        }
      }
      if (node.id === g.selectedId || node.state === "next") {
        ctx.strokeStyle = node.id === g.selectedId ? "#315e4d" : "#9e8137";
        ctx.lineWidth = node.id === g.selectedId ? 2 : 1; ctx.strokeRect(-r - 3, -r - 3, (r + 3) * 2, (r + 3) * 2);
      }
      if (current || node.known) {
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        caption(ctx, current ? "列车当前位置" : (node.state === "cleared" ? "✓ " : "") + nameOf(node), r + 14, current);
      }
      ctx.restore();
    }
    ctx.restore();
    void wrapper;
  }

  return { graph, paint, typeOf, nameOf, dangerOf, HIT, CONTENT_H, LAYERS };
})();

export { railMap };
