"use strict";
// Presentation only: never writes the expedition or reveals hidden hit targets.
// The existing controller supplies glyphs rather than types; keep that public
// projection intact and translate its four alpha.1 glyphs here.
const railMap = (() => {
  const TOP_PAD = 82, ROW_SPAN = 100, BOTTOM_PAD = 66, HIT = 64, LAYERS = 12;
  const CONTENT_H = TOP_PAD + (LAYERS - 1) * ROW_SPAN + BOTTOM_PAD;
  const TYPES = { "◈": "start", "⬤": "combat", "⚠": "risk", "★": "final" };
  const NAMES = { start: "启程车站", combat: "废弃站点", risk: "危险区域", elite: "危险区域", final: "污染核心", boss: "污染核心", shop: "补给站", supply: "补给站" };
  const typeOf = node => node.type || TYPES[node.glyph] || "combat";
  const nameOf = node => NAMES[typeOf(node)] || node.name;
  const sizeOf = type => type === "final" || type === "boss" ? 34 : type === "risk" || type === "elite" ? 27 : 22;
  const dangerOf = node => ["final", "boss"].includes(typeOf(node)) ? 3 : ["risk", "elite"].includes(typeOf(node)) ? 2 : ["start", "shop", "supply"].includes(typeOf(node)) ? 0 : 1;

  function graph(m, shortScreen = false) {
    const currentLayer = Math.max(1, Math.min(LAYERS, m.currentLayer || 1));
    const horizon = Math.min(LAYERS, currentLayer + 2);
    const topPad = shortScreen ? 56 : TOP_PAD, rowSpan = shortScreen ? 74 : ROW_SPAN;
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
    const nodes = [];
    m.rows.forEach((row, r) => {
      if (row.layer > horizon) return;
      rows[r].forEach((id, slot) => {
        const node = row.nodes.find(n => n.id === id);
        // Retain the travelled history, never the discarded branches behind it.
        if (row.layer < currentLayer && !["cleared", "current"].includes(node.state)) return;
        nodes.push({ ...node, type: typeOf(node), layer: row.layer, slot,
          cx: (slot + 1) / (row.nodes.length + 1), cy: topPad + (horizon - row.layer) * rowSpan });
      });
    });
    const ids = new Set(nodes.map(n => n.id));
    const currentId = nodes.find(n => n.state === "current")?.id
      || nodes.find(n => n.layer === currentLayer && n.state === "cleared")?.id;
    return { nodes, currentLayer, currentId, horizon, topPad, rowSpan, selectedId: m.selectedId,
      edges: edges.filter(e => e.kind !== "future" && ids.has(e.from) && ids.has(e.to)),
      height: topPad + (horizon - 1) * rowSpan + BOTTOM_PAD };
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

  // Two offset rails and regularly spaced sleepers follow the same smooth
  // centerline. Offset from its tangent instead of shifting the whole curve.
  function track(ctx, a, b, kind) {
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const start = sizeOf(a.type) + 7, end = sizeOf(b.type) + 7;
    const ax = a.x + dx / length * start, ay = a.y + dy / length * start;
    const bx = b.x - dx / length * end, by = b.y - dy / length * end;
    const middle = (ay + by) / 2;
    const steps = Math.max(16, Math.ceil(length / 3)), samples = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, q = 1 - t;
      const x = q * q * q * ax + 3 * q * q * t * ax + 3 * q * t * t * bx + t * t * t * bx;
      const y = q * q * q * ay + 3 * q * q * t * middle + 3 * q * t * t * middle + t * t * t * by;
      const tx = 6 * q * t * (bx - ax);
      const ty = 3 * q * q * (middle - ay) + 3 * t * t * (by - middle);
      const norm = Math.hypot(tx, ty) || 1;
      samples.push({ x, y, nx: -ty / norm, ny: tx / norm });
    }
    const color = kind === "walked" ? "#7de4bd" : "#ffd47a";
    line(ctx, samples.map(p => [p.x, p.y]), "#0b1c22", 18);
    let distance = 0;
    for (let i = 1; i < samples.length; i++) {
      const p = samples[i], prev = samples[i - 1];
      distance += Math.hypot(p.x - prev.x, p.y - prev.y);
      if (distance < 10) continue;
      distance %= 10;
      line(ctx, [[p.x - p.nx * 8, p.y - p.ny * 8], [p.x + p.nx * 8, p.y + p.ny * 8]], kind === "walked" ? "#3b6a61" : "#746548", 3);
    }
    ctx.shadowColor = color; ctx.shadowBlur = kind === "walked" ? 7 : 3;
    for (const side of [-1, 1]) line(ctx, samples.map(p => [p.x + p.nx * 4 * side, p.y + p.ny * 4 * side]), color, 2);
    ctx.shadowBlur = 0;
    if (kind === "next") {
      const p = samples[Math.floor(samples.length * 0.5)];
      polygon(ctx, [[p.x - 4, p.y + 3], [p.x, p.y - 3], [p.x + 4, p.y + 3]], color);
    }
  }

  function station(ctx, type, color) {
    // Low industrial building with a platform, broken roof and dark openings.
    polygon(ctx, [[-25, 20], [19, 20], [27, 13], [-17, 13]], "#233b43", color);
    polygon(ctx, [[-17, -5], [15, -5], [15, 13], [-17, 13]], "#718587", "#c2d7cf");
    polygon(ctx, [[-23, -5], [-8, -19], [5, -19], [23, -5]], type === "start" ? "#67a7a0" : "#9ca69c", color, 2);
    ctx.fillStyle = "#18333e"; ctx.fillRect(-11, 2, 7, 11); ctx.fillRect(4, 1, 6, 6);
    if (type === "start") {
      line(ctx, [[-3, -18], [-3, -31]], color);
      polygon(ctx, [[-3, -31], [11, -31], [8, -26], [-3, -26]], color);
    } else {
      polygon(ctx, [[1, -19], [8, -12], [4, -7], [13, -5], [23, -5]], "#10252d");
      line(ctx, [[-19, 8], [-23, 12]], "#bac3ad", 3);
    }
  }
  function supply(ctx, color) {
    polygon(ctx, [[-21, -9], [4, -17], [22, -7], [-3, 2]], "#aeb291", color);
    polygon(ctx, [[-21, -9], [-3, 2], [-3, 22], [-21, 11]], "#697d71", color);
    polygon(ctx, [[-3, 2], [22, -7], [22, 12], [-3, 22]], "#819486", color);
    line(ctx, [[-9, -13], [10, -3], [10, 16]], "#e6d3a0", 4);
    line(ctx, [[-10, 4], [-10, 13]], "#d9e3ca", 3);
  }
  function skull(ctx, color) {
    polygon(ctx, [[-24, -20], [16, -20], [24, -12], [24, 20], [-16, 20], [-24, 12]], "#492b2c", color, 2);
    line(ctx, [[-20, -16], [-15, -16]], "#ffcd9e", 3);
    line(ctx, [[16, 16], [20, 16]], "#ffcd9e", 3);
    polygon(ctx, [[-13, -8], [-7, -14], [7, -14], [13, -8], [12, 2], [6, 7], [6, 13], [-6, 13], [-6, 7], [-12, 2]], "#ffe0bd");
    ctx.fillStyle = "#532c33"; ctx.fillRect(-8, -6, 5, 5); ctx.fillRect(3, -6, 5, 5);
    polygon(ctx, [[0, -1], [-3, 4], [3, 4]], "#532c33");
    line(ctx, [[-2, 9], [-2, 13]], "#532c33", 1); line(ctx, [[2, 9], [2, 13]], "#532c33", 1);
  }
  function core(ctx, color) {
    ctx.shadowColor = color; ctx.shadowBlur = 16;
    polygon(ctx, [[0, -34], [24, -23], [33, 4], [19, 29], [-16, 30], [-34, 7], [-24, -23]], "#382838", "#df7279", 2.5);
    ctx.shadowBlur = 0;
    polygon(ctx, [[-22, 18], [-14, -8], [-3, -19], [6, -6], [14, -22], [24, 19]], "#653b55", "#d988a0", 2);
    polygon(ctx, [[0, -17], [12, -2], [5, 18], [-7, 12], [-11, -2]], "#ffb899", "#fff0ca", 2);
    line(ctx, [[0, -9], [3, 1], [0, 11]], "#fff5d6", 3);
  }
  function train(ctx) {
    ctx.shadowColor = "#94f5d3"; ctx.shadowBlur = 12;
    polygon(ctx, [[-14, 17], [-14, -14], [-8, -24], [8, -24], [14, -14], [14, 17], [9, 23], [-9, 23]], "#b6d8cf", "#b4ffe1", 2);
    ctx.shadowBlur = 0;
    polygon(ctx, [[-10, -5], [-7, -16], [7, -16], [10, -5]], "#284651", "#77c8cb");
    ctx.fillStyle = "#4b777a"; ctx.fillRect(-9, 1, 18, 12);
    line(ctx, [[-7, 5], [7, 5]], "#8ab6ae", 2); line(ctx, [[-7, 9], [7, 9]], "#8ab6ae", 2);
    ctx.fillStyle = "#fff0b0"; ctx.fillRect(-11, -5, 4, 3); ctx.fillRect(7, -5, 4, 3);
    polygon(ctx, [[-10, -26], [0, -35], [10, -26]], "rgba(189, 255, 225, 0.2)");
    line(ctx, [[-18, 22], [18, 22]], "#72b4a4", 3);
  }

  function paint(ctx, box, wrapper, g) {
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.setLineDash([]);
    // A quiet cartographic ground texture, independent of hidden nodes.
    ctx.fillStyle = "rgba(82, 118, 118, 0.08)";
    for (let y = 24; y < box.h; y += 46) for (let x = 18; x < box.w; x += 46) ctx.fillRect(box.x + x, box.y + y, 2, 2);
    const fog = ctx.createLinearGradient(0, box.y, 0, box.y + 66);
    fog.addColorStop(0, "#233b43"); fog.addColorStop(1, "rgba(35, 59, 67, 0)");
    ctx.fillStyle = fog; ctx.fillRect(box.x, box.y, box.w, 66);
    ctx.font = "600 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#a0b7b8";
    ctx.fillText(g.horizon < LAYERS ? "?  未知区域 · 前方 2 层已侦察" : "终点已进入侦察范围", box.x + box.w / 2, box.y + (g.topPad < TOP_PAD ? 12 : 24));
    const positioned = new Map(g.nodes.map(n => [n.id, { ...n, x: box.x + n.cx * box.w, y: box.y + n.cy }]));
    for (const kind of ["next", "walked"]) for (const edge of g.edges) {
      if (edge.kind === kind) track(ctx, positioned.get(edge.from), positioned.get(edge.to), kind);
    }
    const layers = new Set(g.nodes.map(n => n.layer));
    ctx.font = "700 10px ui-monospace, monospace";
    for (const layer of layers) {
      ctx.fillStyle = layer === g.currentLayer ? "#9ce6c6" : "#708c94";
      ctx.fillText("L" + layer, box.x + 10, box.y + g.topPad + (g.horizon - layer) * g.rowSpan);
    }
    for (const node of positioned.values()) {
      ctx.save(); ctx.translate(node.x, node.y);
      const color = ["risk", "elite", "final", "boss"].includes(node.type) ? "#ff9390" : node.state === "next" ? "#ffd47a" : "#9bbab5";
      if (node.state === "locked") ctx.globalAlpha *= 0.35;
      else if (node.state === "cleared") ctx.globalAlpha *= 0.7;
      if (node.id === g.currentId) {
        // The actual train replaces the current-node ring and occupies its hit box.
        train(ctx);
      } else if (["risk", "elite"].includes(node.type)) skull(ctx, color);
      else if (["final", "boss"].includes(node.type)) core(ctx, color);
      else if (["shop", "supply"].includes(node.type)) supply(ctx, color);
      else station(ctx, node.type, color);
      if (node.id === g.selectedId || node.state === "next") {
        const r = sizeOf(node.type) + 7, c = node.id === g.selectedId ? "#b9f3eb" : "#e7bf74";
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) line(ctx, [[sx * (r - 6), sy * r], [sx * r, sy * r], [sx * r, sy * (r - 6)]], c, 2);
      }
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "600 11px \"PingFang SC\", \"Microsoft YaHei\", system-ui, sans-serif";
      ctx.fillStyle = node.id === g.currentId ? "#b4ffe1" : node.state === "next" ? "#ffdf9a" : "#b2c8c3";
      ctx.fillText(node.id === g.currentId ? "当前列车" : (node.state === "cleared" ? "✓ " : "") + nameOf(node), 0, sizeOf(node.type) + 17);
      ctx.restore();
    }
    ctx.restore();
    void wrapper;
  }

  return { graph, paint, typeOf, nameOf, dangerOf, HIT, CONTENT_H, LAYERS };
})();

export { railMap };
