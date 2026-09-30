"use strict";
// Painting for the canvas UI kit: backgrounds (colours, linear/radial
// gradients, sprite and texture images with CSS size/position/repeat),
// rounded and per-side borders, outer and inset box shadows (blur, spread,
// offset), opacity, transforms, CSS filters, clip-path polygons, overflow
// clipping with scroll offsets, text lines and outlines. Paint order follows
// CSS stacking within each box: negative z, in-flow, positioned, positive z.
// While painting, every node records its absolute box (absX/absY) and the
// clip it is visible through; the kit hit-tests against that list.

import { uiCss } from "./css.js";
import { uiText } from "./text.js";

const uiPaint = (() => {
  let imageSource = () => null;
  function setImageSource(fn) { imageSource = fn; }
  let filterSupported = null;
  const FAR = 20000;

  // -- geometry -----------------------------------------------------------------------

  // Corner radii [tl, tr, br, bl] each {x, y}, resolved and scaled so that
  // adjacent radii never exceed the side (CSS overlap rule).
  function radii(n, cs, w, h) {
    const raw = cs.borderRadius;
    if (!raw) return null;
    let list;
    if (typeof raw === "number") list = [raw, raw, raw, raw];
    else if (Array.isArray(raw)) list = uiCss.box4(raw);
    else list = uiCss.box4(String(raw).split("/")[0].trim());
    const r = list.map(v => {
      if (typeof v === "string" && v.endsWith("%")) { const p = parseFloat(v) / 100; return { x: p * w, y: p * h }; }
      const px = uiCss.length(v, w, cs.lctx) || 0;
      return { x: px, y: px };
    });
    if (r.every(c => !c.x && !c.y)) return null;
    const f = Math.min(1,
      w / Math.max(1e-6, r[0].x + r[1].x), w / Math.max(1e-6, r[3].x + r[2].x),
      h / Math.max(1e-6, r[0].y + r[3].y), h / Math.max(1e-6, r[1].y + r[2].y));
    if (f < 1) for (const c of r) { c.x *= f; c.y *= f; }
    return r;
  }
  function shrinkRadii(r, t, rt, b, l) {
    if (!r) return null;
    return [
      { x: Math.max(0, r[0].x - l), y: Math.max(0, r[0].y - t) },
      { x: Math.max(0, r[1].x - rt), y: Math.max(0, r[1].y - t) },
      { x: Math.max(0, r[2].x - rt), y: Math.max(0, r[2].y - b) },
      { x: Math.max(0, r[3].x - l), y: Math.max(0, r[3].y - b) },
    ];
  }
  function growRadii(r, s) {
    if (!r) return s > 0 ? null : null;
    return r.map(c => ({ x: c.x > 0 ? Math.max(0, c.x + s) : 0, y: c.y > 0 ? Math.max(0, c.y + s) : 0 }));
  }
  function rrPath(ctx, x, y, w, h, r, newPath = true) {
    if (newPath) ctx.beginPath();
    if (w <= 0 || h <= 0) return;
    if (!r) { ctx.rect(x, y, w, h); return; }
    const [tl, tr, br, bl] = r;
    ctx.moveTo(x + tl.x, y);
    ctx.lineTo(x + w - tr.x, y);
    corner(ctx, x + w - tr.x, y + tr.y, tr.x, tr.y, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - br.y);
    corner(ctx, x + w - br.x, y + h - br.y, br.x, br.y, 0, Math.PI / 2);
    ctx.lineTo(x + bl.x, y + h);
    corner(ctx, x + bl.x, y + h - bl.y, bl.x, bl.y, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + tl.y);
    corner(ctx, x + tl.x, y + tl.y, tl.x, tl.y, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  }
  function corner(ctx, cx, cy, rx, ry, a0, a1) {
    if (rx <= 0 || ry <= 0) { ctx.lineTo(cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry); return; }
    if (typeof ctx.ellipse === "function") ctx.ellipse(cx, cy, rx, ry, 0, a0, a1);
    else ctx.arc(cx, cy, (rx + ry) / 2, a0, a1);
  }

  // -- backgrounds -----------------------------------------------------------------------

  function gradientFor(ctx, layer, x, y, w, h, lctx) {
    if (layer.type === "linear") {
      let a = layer.angle;
      if (typeof a === "string") {
        // corner keywords: the gradient line is perpendicular to the diagonal
        const t = Math.atan2(w, h);
        a = { tr: t, br: Math.PI - t, bl: Math.PI + t, tl: -t }[a];
      }
      const sin = Math.sin(a), cos = Math.cos(a);
      const len = Math.abs(w * sin) + Math.abs(h * cos);
      const cx = x + w / 2, cy = y + h / 2;
      const g = ctx.createLinearGradient(cx - sin * len / 2, cy + cos * len / 2, cx + sin * len / 2, cy - cos * len / 2);
      for (const s of uiCss.resolveStops(layer.stops, len, lctx)) g.addColorStop(Math.max(0, Math.min(1, s.at)), s.color);
      return { fill: g };
    }
    // radial
    const at = layer.at;
    const cx = x + (uiCss.length(at[0], w, lctx) ?? w / 2), cy = y + (uiCss.length(at[1], h, lctx) ?? h / 2);
    const dx = Math.max(cx - x, x + w - cx), dy = Math.max(cy - y, y + h - cy);
    const ndx = Math.min(cx - x, x + w - cx), ndy = Math.min(cy - y, y + h - cy);
    let rx, ry;
    const size = layer.size;
    if (Array.isArray(size)) {
      rx = uiCss.length(size[0], w, lctx) || 0; ry = size[1] !== undefined ? uiCss.length(size[1], h, lctx) || 0 : rx;
    } else if (layer.shape === "circle") {
      const r = size === "closest-side" ? Math.min(ndx, ndy) : size === "farthest-side" ? Math.max(dx, dy) : size === "closest-corner" ? Math.hypot(ndx, ndy) : Math.hypot(dx, dy);
      rx = ry = r;
    } else {
      if (size === "closest-side") { rx = ndx; ry = ndy; }
      else if (size === "farthest-side") { rx = dx; ry = dy; }
      else { rx = dx * Math.SQRT2; ry = dy * Math.SQRT2; if (size === "closest-corner") { rx = ndx * Math.SQRT2; ry = ndy * Math.SQRT2; } }
    }
    rx = Math.max(rx, 0.01); ry = Math.max(ry, 0.01);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    for (const s of uiCss.resolveStops(layer.stops, rx, lctx)) g.addColorStop(Math.max(0, Math.min(1, s.at)), s.color);
    return { fill: g, radial: { cx, cy, sy: ry / rx } };
  }

  function paintBackgrounds(ctx, n, cs, x, y, w, h, rOuter) {
    const color = cs.backgroundColor;
    const layers = uiCss.parseImageLayers(cs.backgroundImage);
    const hasColor = color && color !== "transparent" && color !== "none";
    if (!hasColor && !layers.length) return;
    // background-clip: border-box (default) or padding-box
    const clipPad = cs.backgroundClip === "padding-box";
    const bx = clipPad ? x + n.bl : x, by = clipPad ? y + n.bt : y;
    const bw = clipPad ? w - n.bl - n.br : w, bh = clipPad ? h - n.bt - n.bb : h;
    const rClip = clipPad ? shrinkRadii(rOuter, n.bt, n.br, n.bb, n.bl) : rOuter;
    ctx.save();
    rrPath(ctx, bx, by, bw, bh, rClip);
    ctx.clip();
    if (hasColor) { ctx.fillStyle = color; ctx.fillRect(bx, by, bw, bh); }
    // positioning area: padding box (background-origin default)
    const ox = cs.backgroundOrigin === "border-box" ? x : x + n.bl, oy = cs.backgroundOrigin === "border-box" ? y : y + n.bt;
    const ow = cs.backgroundOrigin === "border-box" ? w : w - n.bl - n.br, oh = cs.backgroundOrigin === "border-box" ? h : h - n.bt - n.bb;
    const sizes = uiCss.splitTop(String(cs.backgroundSize || "auto"));
    const positions = uiCss.splitTop(String(cs.backgroundPosition || "0% 0%"));
    const repeats = uiCss.splitTop(String(cs.backgroundRepeat || "repeat"));
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const sizeV = sizes[i % sizes.length], posV = positions[i % positions.length], repV = repeats[i % repeats.length];
      let img = null, iw = ow, ih = oh;
      if (layer.type === "url") {
        img = imageSource(layer.url);
        if (!img) continue;
        iw = img.naturalWidth || img.width; ih = img.naturalHeight || img.height;
        if (!iw || !ih) continue;
      }
      let [tw, th] = layer.type === "url" ? uiCss.backgroundSize(sizeV, ow, oh, iw, ih, cs.lctx) : gradientTile(sizeV, ow, oh, cs.lctx);
      if (tw <= 0 || th <= 0) continue;
      const [px, py] = uiCss.backgroundPosition(posV, ow, oh, tw, th, cs.lctx);
      const rep = (repV || "repeat").trim();
      const repX = rep === "repeat" || rep === "repeat-x", repY = rep === "repeat" || rep === "repeat-y";
      const x0 = ox + px, y0 = oy + py;
      const startX = repX ? x0 - Math.ceil((x0 - bx) / tw) * tw : x0;
      const startY = repY ? y0 - Math.ceil((y0 - by) / th) * th : y0;
      const endX = repX ? bx + bw : x0 + tw, endY = repY ? by + bh : y0 + th;
      let count = 0;
      for (let ty = startY; ty < endY - 0.001 && count < 400; ty += th) {
        for (let tx = startX; tx < endX - 0.001 && count < 400; tx += tw) {
          count++;
          if (img) drawImageClipped(ctx, img, tx, ty, tw, th, bx, by, bw, bh);
          else paintGradientTile(ctx, layer, tx, ty, tw, th, cs.lctx, bx, by, bw, bh, repX || repY);
          if (!repX) break;
        }
        if (!repY) break;
      }
    }
    ctx.restore();
  }
  function gradientTile(sizeV, ow, oh, lctx) {
    const v = (sizeV || "auto").trim();
    if (v === "auto" || v === "cover" || v === "contain" || v === "auto auto") return [ow, oh];
    const [a, b = "auto"] = uiCss.splitTop(v, " ");
    return [a === "auto" ? ow : uiCss.length(a, ow, lctx) ?? ow, b === "auto" ? oh : uiCss.length(b, oh, lctx) ?? oh];
  }
  function paintGradientTile(ctx, layer, x, y, w, h, lctx, cx, cy, cw, ch, tiled) {
    const g = gradientFor(ctx, layer, x, y, w, h, lctx);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (g.radial) {
      ctx.translate(g.radial.cx, g.radial.cy);
      ctx.scale(1, g.radial.sy);
      ctx.fillStyle = g.fill;
      const sy = g.radial.sy || 1;
      ctx.fillRect(x - g.radial.cx, (y - g.radial.cy) / sy, w, h / sy);
    } else {
      ctx.fillStyle = g.fill;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }
  // Draws the visible part of an image tile, clipped to the painting area.
  function drawImageClipped(ctx, img, dx, dy, dw, dh, cx, cy, cw, ch) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const x0 = Math.max(dx, cx), y0 = Math.max(dy, cy), x1 = Math.min(dx + dw, cx + cw), y1 = Math.min(dy + dh, cy + ch);
    if (x1 <= x0 || y1 <= y0) return;
    const sx = (x0 - dx) / dw * iw, sy = (y0 - dy) / dh * ih, sw = (x1 - x0) / dw * iw, sh = (y1 - y0) / dh * ih;
    if (sw <= 0 || sh <= 0) return;
    ctx.drawImage(img, sx, sy, sw, sh, x0, y0, x1 - x0, y1 - y0);
  }

  // -- borders -----------------------------------------------------------------------------

  function paintBorders(ctx, n, cs, x, y, w, h, rOuter) {
    const bw = [n.bt, n.br, n.bb, n.bl];
    if (!bw.some(v => v > 0)) return;
    const colors = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
    const styles = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle];
    const rInner = shrinkRadii(rOuter, n.bt, n.br, n.bb, n.bl);
    const uniform = colors.every(c => c === colors[0]) && styles.every(s => s === styles[0] || bw[styles.indexOf(s)] === 0) && styles[0] !== "dashed" && styles[0] !== "dotted";
    if (uniform || (styles.every(s => s === "solid" || !s || s === "none") && colors.every((c, i) => bw[i] === 0 || c === colors.find((_, j) => bw[j] > 0)))) {
      const color = colors[bw.findIndex(v => v > 0)];
      ctx.beginPath();
      rrPath(ctx, x, y, w, h, rOuter, false);
      rrPath(ctx, x + n.bl, y + n.bt, w - n.bl - n.br, h - n.bt - n.bb, rInner, false);
      ctx.fillStyle = color;
      ctx.fill("evenodd");
      return;
    }
    // per-side: clip to the ring, fill each side's trapezoid
    ctx.save();
    ctx.beginPath();
    rrPath(ctx, x, y, w, h, rOuter, false);
    rrPath(ctx, x + n.bl, y + n.bt, w - n.bl - n.br, h - n.bt - n.bb, rInner, false);
    ctx.clip("evenodd");
    const ix = x + n.bl, iy = y + n.bt, ix2 = x + w - n.br, iy2 = y + h - n.bb;
    const sides = [
      [[x, y], [x + w, y], [ix2, iy], [ix, iy]],
      [[x + w, y], [x + w, y + h], [ix2, iy2], [ix2, iy]],
      [[x + w, y + h], [x, y + h], [ix, iy2], [ix2, iy2]],
      [[x, y + h], [x, y], [ix, iy], [ix, iy2]],
    ];
    for (let i = 0; i < 4; i++) {
      if (!(bw[i] > 0) || styles[i] === "none") continue;
      if (styles[i] === "dashed" || styles[i] === "dotted") {
        ctx.save();
        ctx.strokeStyle = colors[i]; ctx.lineWidth = bw[i];
        const dash = styles[i] === "dotted" ? [bw[i], bw[i]] : [bw[i] * 3, bw[i] * 3];
        ctx.setLineDash?.(dash);
        ctx.beginPath();
        const half = bw[i] / 2;
        if (i === 0) { ctx.moveTo(x, y + half); ctx.lineTo(x + w, y + half); }
        if (i === 1) { ctx.moveTo(x + w - half, y); ctx.lineTo(x + w - half, y + h); }
        if (i === 2) { ctx.moveTo(x + w, y + h - half); ctx.lineTo(x, y + h - half); }
        if (i === 3) { ctx.moveTo(x + half, y + h); ctx.lineTo(x + half, y); }
        ctx.stroke();
        ctx.restore();
        continue;
      }
      ctx.beginPath();
      const pts = sides[i];
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < 4; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.closePath();
      ctx.fillStyle = colors[i];
      ctx.fill();
    }
    ctx.restore();
  }

  // -- shadows -------------------------------------------------------------------------------

  function paintOuterShadows(ctx, n, cs, x, y, w, h, rOuter, scale) {
    const list = uiCss.parseShadows(cs.boxShadow);
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.inset) continue;
      const c = uiCss.parseColor(s.color);
      if (c && c[3] === 0) continue;
      const m = Math.abs(s.x) + Math.abs(s.y) + s.blur * 2 + Math.abs(s.spread) + 4;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - m, y - m, w + 2 * m, h + 2 * m);
      rrPath(ctx, x, y, w, h, rOuter, false);
      ctx.clip("evenodd");
      const sp = s.spread;
      const r = rOuter ? growRadii(rOuter, sp) : null;
      rrPath(ctx, x - sp - FAR, y - sp, w + 2 * sp, h + 2 * sp, r);
      ctx.shadowColor = s.color;
      ctx.shadowBlur = s.blur * scale;
      ctx.shadowOffsetX = (s.x + FAR) * scale;
      ctx.shadowOffsetY = s.y * scale;
      ctx.fillStyle = "#000";
      if (s.blur === 0) {
        // unblurred shadows: paint the shape directly (exact edges)
        ctx.shadowColor = "transparent";
        rrPath(ctx, x - sp + s.x, y - sp + s.y, w + 2 * sp, h + 2 * sp, r);
        ctx.fillStyle = s.color;
      }
      ctx.fill();
      ctx.restore();
    }
  }
  function paintInsetShadows(ctx, n, cs, x, y, w, h, rOuter, scale) {
    const list = uiCss.parseShadows(cs.boxShadow);
    if (!list.some(s => s.inset)) return;
    const px = x + n.bl, py = y + n.bt, pw = w - n.bl - n.br, ph = h - n.bt - n.bb;
    const rPad = shrinkRadii(rOuter, n.bt, n.br, n.bb, n.bl);
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (!s.inset) continue;
      const c = uiCss.parseColor(s.color);
      if (c && c[3] === 0) continue;
      ctx.save();
      rrPath(ctx, px, py, pw, ph, rPad);
      ctx.clip();
      const m = Math.abs(s.x) + Math.abs(s.y) + s.blur * 2 + Math.abs(s.spread) + 10;
      const ix = px + s.spread + s.x, iy = py + s.spread + s.y, iw = pw - 2 * s.spread, ih = ph - 2 * s.spread;
      const rIn = rPad ? growRadii(rPad, -s.spread) : null;
      if (s.blur === 0) {
        ctx.beginPath();
        ctx.rect(px - m, py - m, pw + 2 * m, ph + 2 * m);
        if (iw > 0 && ih > 0) rrPath(ctx, ix, iy, iw, ih, rIn, false);
        ctx.fillStyle = s.color;
        ctx.fill("evenodd");
      } else {
        ctx.beginPath();
        ctx.rect(px - m - FAR, py - m, pw + 2 * m, ph + 2 * m);
        if (iw > 0 && ih > 0) rrPath(ctx, ix - FAR, iy, iw, ih, rIn, false);
        ctx.shadowColor = s.color;
        ctx.shadowBlur = s.blur * scale;
        ctx.shadowOffsetX = FAR * scale;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = "#000";
        ctx.fill("evenodd");
      }
      ctx.restore();
    }
  }

  // -- main paint ------------------------------------------------------------------------------

  function zGroups(n) {
    const neg = [], flow = [], pos = [], posZ = [];
    for (const k of n.kids || []) {
      const kc = k.cs;
      if (!kc || kc.display === "none") continue;
      const positioned = kc.position && kc.position !== "static";
      const z = kc.zIndex != null && kc.zIndex !== "auto" ? +kc.zIndex : null;
      if (positioned || (z != null && n.cs && /flex|grid/.test(n.cs.display))) {
        if (z != null && z < 0) neg.push(k);
        else if (z != null && z > 0) posZ.push(k);
        else pos.push(k);
      } else if (kc.opacity != null && kc.opacity < 1 || (kc.transform && kc.transform !== "none")) pos.push(k);
      else flow.push(k);
    }
    neg.sort((a, b) => a.cs.zIndex - b.cs.zIndex);
    posZ.sort((a, b) => a.cs.zIndex - b.cs.zIndex);
    return [...neg, ...flow, ...pos, ...posZ];
  }

  // paintNode: px/py = absolute origin of the parent's border box (already
  // including the parent's scroll offset). state = {scale, dpr, hits, clip}.
  function paintNode(ctx, n, px, py, state) {
    const cs = n.cs;
    if (!cs || cs.display === "none") return;
    // Non-atomic inline boxes (text runs, inline spans) are painted by their
    // block container's line boxes; only atomic descendants have boxes.
    if (n.w == null || n.x == null) { for (const k of n.kids || []) paintNode(ctx, k, px, py, state); return; }
    const x = px + n.x, y = py + n.y, w = n.w, h = n.h;
    n.absX = x; n.absY = y;
    if (cs.maskImage && cs.maskImage !== "none" && !state.inMask && state.makeScratch && w > 0 && h > 0) {
      const layer = uiCss.parseImageLayers(cs.maskImage)[0];
      if (layer && layer.type !== "url") {
        const scale = state.scale;
        const sw = Math.max(1, Math.ceil(w * scale)), sh = Math.max(1, Math.ceil(h * scale));
        const scratch = state.makeScratch(sw, sh);
        const sctx = scratch && scratch.getContext("2d");
        if (sctx) {
          sctx.setTransform(1, 0, 0, 1, 0, 0);
          sctx.clearRect(0, 0, sw, sh);
          sctx.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
          const saved = state.inMask; state.inMask = true;
          paintNode(sctx, n, px, py, state);
          state.inMask = saved;
          sctx.globalCompositeOperation = "destination-in";
          const g = gradientFor(sctx, layer, x, y, w, h, cs.lctx);
          sctx.fillStyle = g.fill;
          sctx.fillRect(x, y, w, h);
          sctx.globalCompositeOperation = "source-over";
          ctx.drawImage(scratch, 0, 0, sw, sh, x, y, w, h);
          return;
        }
      }
    }
    // CSS opacity composites the element and its descendants as one group:
    // paint them into an offscreen layer, then blend the layer once.
    const op = cs.opacity != null ? +cs.opacity : 1;
    if (op < 1 && op > 0 && !n._inGroup && state.makeLayer && ctx.getTransform && w > 0 && h > 0 &&
        ((n.kids && n.kids.length) || (n.lines && n.lines.length) || n.image)) {
      const t = ctx.getTransform(), M = 48;
      const pts = [[x - M, y - M], [x + w + M, y - M], [x - M, y + h + M], [x + w + M, y + h + M]].map(([a, b]) => [t.a * a + t.c * b + t.e, t.b * a + t.d * b + t.f]);
      const X0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0])))), Y0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1]))));
      const X1 = Math.min(ctx.canvas.width, Math.ceil(Math.max(...pts.map(p => p[0])))), Y1 = Math.min(ctx.canvas.height, Math.ceil(Math.max(...pts.map(p => p[1]))));
      const lw = X1 - X0, lh = Y1 - Y0;
      const depth = state.groupDepth || 0;
      const layer = lw > 0 && lh > 0 ? state.makeLayer(depth, lw, lh) : null;
      const lctx = layer && layer.getContext("2d");
      if (lctx) {
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.clearRect(0, 0, lw, lh);
        lctx.globalAlpha = 1;
        lctx.setTransform(t.a, t.b, t.c, t.d, t.e - X0, t.f - Y0);
        state.groupDepth = depth + 1; n._inGroup = true;
        paintNode(lctx, n, px, py, state);
        n._inGroup = false; state.groupDepth = depth;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha *= op;
        ctx.drawImage(layer, 0, 0, lw, lh, X0, Y0, lw, lh);
        ctx.restore();
        return;
      }
    }
    ctx.save();
    let scale = state.scale;
    if (op < 1 && !n._inGroup) ctx.globalAlpha *= op;
    let matrix = null;
    if (cs.transform && cs.transform !== "none") {
      matrix = uiCss.transformMatrix(cs.transform, w, h, cs.lctx);
      const [ox, oy] = transformOrigin(cs, w, h);
      ctx.translate(x + ox, y + oy);
      ctx.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
      ctx.translate(-(x + ox), -(y + oy));
      scale *= Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) || 1;
    }
    if (cs.filter && cs.filter !== "none") {
      if (filterSupported === null) filterSupported = typeof ctx.filter === "string";
      if (filterSupported) ctx.filter = cs.filter;
    }
    const clipPoly = uiCss.parseClipPath(cs.clipPath);
    if (clipPoly) {
      ctx.beginPath();
      clipPoly.forEach(([a, b], i) => {
        const cx = x + (uiCss.length(a, w, cs.lctx) || 0), cy = y + (uiCss.length(b, h, cs.lctx) || 0);
        if (i) ctx.lineTo(cx, cy); else ctx.moveTo(cx, cy);
      });
      ctx.closePath();
      ctx.clip();
    }
    const rOuter = radii(n, cs, w, h);
    const visible = cs.visibility !== "hidden";
    if (visible) {
      if (cs.backdropFilter && cs.backdropFilter !== "none" && state.backdrop) state.backdrop(ctx, n, x, y, w, h, rOuter);
      if (cs.boxShadow && cs.boxShadow !== "none") paintOuterShadows(ctx, n, cs, x, y, w, h, rOuter, scale);
      paintBackgrounds(ctx, n, cs, x, y, w, h, rOuter);
      if (n.image) paintImageNode(ctx, n, cs, x, y, w, h, rOuter);
      paintBorders(ctx, n, cs, x, y, w, h, rOuter);
      if (cs.boxShadow && cs.boxShadow !== "none") paintInsetShadows(ctx, n, cs, x, y, w, h, rOuter, scale);
    }
    if (n.paint) { ctx.save(); n.paint(ctx, { x, y, w, h, scale }, n); ctx.restore(); }
    // hit record (transforms: only translation is honoured for hit testing)
    // translations of transformed ancestors carry over to descendants' boxes
    const ox = state.offX || 0, oy = state.offY || 0;
    const hx = x + ox + (matrix ? matrix[4] : 0), hy = y + oy + (matrix ? matrix[5] : 0);
    n.boxX = hx; n.boxY = hy;
    state.hits.push({ node: n, x: hx, y: hy, w, h, clip: state.clip });
    const clipsContent = (cs.overflowX && cs.overflowX !== "visible") || (cs.overflowY && cs.overflowY !== "visible");
    const prevClip = state.clip;
    let scrollY = 0;
    ctx.save();
    if (clipsContent) {
      const cx = x + n.bl, cy = y + n.bt, cw = w - n.bl - n.br - (n._sb || 0), ch = h - n.bt - n.bb;
      rrPath(ctx, cx, cy, cw, ch, shrinkRadii(rOuter, n.bt, n.br, n.bb, n.bl));
      ctx.clip();
      state.clip = intersect(prevClip, { x: hx + n.bl, y: hy + n.bt, w: cw, h: ch });
      if (n.scrollH != null) {
        const max = Math.max(0, n.scrollH - ch);
        n.scrollMax = max;
        scrollY = Math.max(0, Math.min(max, state.scrollOf ? state.scrollOf(n) : 0));
        n.scrollY = scrollY;
      }
    }
    if (visible && n.lines) paintLines(ctx, n, x, y - scrollY, state);
    if (matrix) { state.offX = ox + matrix[4]; state.offY = oy + matrix[5]; }
    for (const k of zGroups(n)) paintNode(ctx, k, x, y - scrollY, state);
    state.offX = ox; state.offY = oy;
    ctx.restore();
    state.clip = prevClip;
    if (n._sb && n.scrollH != null && state.scrollbar) state.scrollbar(ctx, n, x, y, w, h);
    if (visible && cs.outlineStyle && cs.outlineStyle !== "none" && cs.outlineWidth > 0) {
      const off = uiCss.length(cs.outlineOffset, null, cs.lctx) || 0;
      const ow = cs.outlineWidth;
      const r = rOuter ? growRadii(rOuter, off + ow / 2) : null;
      ctx.lineWidth = ow;
      ctx.strokeStyle = cs.outlineColor;
      rrPath(ctx, x - off - ow / 2, y - off - ow / 2, w + 2 * (off + ow / 2), h + 2 * (off + ow / 2), r);
      ctx.stroke();
    }
    ctx.restore();
  }
  function transformOrigin(cs, w, h) {
    const v = cs.transformOrigin;
    if (!v) return [w / 2, h / 2];
    const parts = uiCss.splitTop(String(v), " ").map(p => ({ left: "0%", right: "100%", top: "0%", bottom: "100%", center: "50%" })[p] ?? p);
    return [uiCss.length(parts[0], w, cs.lctx) ?? w / 2, uiCss.length(parts[1] ?? "50%", h, cs.lctx) ?? h / 2];
  }
  function intersect(a, b) {
    if (!a) return b;
    const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
    const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  }
  function paintLines(ctx, n, x, y, state) {
    const cx = x + n.bl + n.pl, cy = y + n.bt + n.pt;
    for (const line of n.lines) {
      for (const it of line.items) {
        if (it.box || !it.text) continue;
        if (it.st.visibility === "hidden") continue;
        if (it.st !== n.cs && it.st.backgroundColor && it.st.backgroundColor !== "transparent") {
          ctx.fillStyle = it.st.backgroundColor;
          ctx.fillRect(cx + it.x, cy + line.y, it.w, line.h);
        }
        uiText.draw(ctx, it.text, cx + it.x, cy + line.baseline, it.st, state.scale);
      }
    }
  }
  function paintImageNode(ctx, n, cs, x, y, w, h, rOuter) {
    const img = typeof n.image === "string" ? imageSource(n.image) : n.image;
    if (!img) return;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const cx = x + n.bl + n.pl, cy = y + n.bt + n.pt, cw = w - n.bl - n.br - n.pl - n.pr, ch = h - n.bt - n.bb - n.pt - n.pb;
    const fit = cs.objectFit || "fill";
    let dw = cw, dh = ch;
    if (fit === "cover" || fit === "contain") {
      const s = fit === "cover" ? Math.max(cw / iw, ch / ih) : Math.min(cw / iw, ch / ih);
      dw = iw * s; dh = ih * s;
    }
    const [opx, opy] = uiCss.backgroundPosition(cs.objectPosition || "50% 50%", cw, ch, dw, dh, cs.lctx);
    ctx.save();
    rrPath(ctx, x, y, w, h, rOuter);
    ctx.clip();
    drawImageClipped(ctx, img, cx + opx, cy + opy, dw, dh, cx, cy, cw, ch);
    ctx.restore();
  }

  return { paintNode, rrPath, radii, setImageSource, intersect };
})();

export { uiPaint };
