"use strict";
// Box layout for the canvas UI kit: a compact subset of CSS layout.
//   - box model: border-box sizing, margins (sibling collapsing in block flow,
//     auto margins for centring), padding, borders, min/max constraints
//   - display: block, flex (row/column, wrap, grow/shrink/basis, gap, justify,
//     align, auto margins), grid (px/%/fr/auto/minmax tracks, spans, auto
//     placement, place-items), inline formatting (styled text runs and
//     inline-block atoms on shared line boxes, half-leading model), none
//   - position: relative offsets, absolute against the parent's padding box
//   - overflow: hidden clips; auto/scroll become scroll containers
// Results are written onto the nodes: x/y (border box relative to the parent
// border box), w/h, and for text the laid-out lines.

import { uiCss } from "./css.js";
import { uiText } from "./text.js";

const uiLayout = (() => {
  const INHERITED = ["color", "fontSize", "fontWeight", "fontFamily", "fontStyle", "lineHeight", "letterSpacing", "textAlign", "textTransform", "whiteSpace", "textShadow", "visibility", "cursor", "overflowWrap", "wordBreak", "pointerEvents", "primaryLineHeight"];
  const DEFAULT_ROOT = {
    color: "#000", fontSize: 16, fontWeight: 400, fontFamily: "sans-serif", fontStyle: "normal",
    lineHeight: "normal", letterSpacing: 0, textAlign: "left", textTransform: "none", whiteSpace: "normal",
    textShadow: "none", visibility: "visible", cursor: "auto", overflowWrap: "normal", wordBreak: "normal", pointerEvents: "auto",
  };
  const INLINE_DISPLAYS = new Set(["inline", "inline-block", "inline-flex", "inline-grid"]);

  // -- style resolution ---------------------------------------------------------

  function mergeVariants(style, node, env, out) {
    for (const key in style) {
      const v = style[key];
      if (key[0] === "@") { if (uiCss.mediaMatches(key.split("#")[0], env)) mergeVariants(v, node, env, out); continue; }
      if (key[0] === ":") {
        const [spec] = key.split("#");
        const [name, up] = spec.split("^");
        // A pseudo-element's own state keys (".btn:hover::before") belong to
        // its originating element; "^N" counts from the pseudo node itself.
        let target = node;
        const depth = up !== undefined ? +up : (typeof node.tag === "string" && node.tag.startsWith("::") ? 1 : 0);
        for (let i = 0; i < depth && target; i++) target = target.parent;
        if (!target) continue;
        const s = (target === node ? node._state : (env.stateOf ? env.stateOf(target.key) : null)) || {};
        const on = name === ":hover" ? s.hover && env.hover : name === ":active" ? s.active : name === ":disabled" ? !!target.disabled : name === ":enabled" ? !target.disabled : name === ":focus-visible" ? s.focusVisible : name === ":focus" ? s.focus : false;
        if (on) mergeVariants(v, node, env, out);
        continue;
      }
      if (v === "") continue; // an unset custom-property substitution: no declaration
      if (v === null || v === undefined) { delete out[key]; continue; }
      expandOne(key, v, out);
    }
    return out;
  }

  // Expands one declaration into longhands, assigning in cascade order so the
  // last declaration of a property wins regardless of shorthand/longhand mix.
  function expandOne(k, v, out) {
    switch (k) {
        case "margin": case "padding": {
          const b = uiCss.box4(v);
          out[k + "Top"] = b[0]; out[k + "Right"] = b[1]; out[k + "Bottom"] = b[2]; out[k + "Left"] = b[3];
          break;
        }
        case "inset": {
          const b = uiCss.box4(v);
          out.top = b[0]; out.right = b[1]; out.bottom = b[2]; out.left = b[3];
          break;
        }
        case "border": case "borderTop": case "borderRight": case "borderBottom": case "borderLeft": {
          const sides = k === "border" ? ["Top", "Right", "Bottom", "Left"] : [k.slice(6)];
          let w = 0, st = "solid", c = "currentcolor";
          if (v === "none" || v === 0 || v === "0") { w = 0; st = "none"; }
          else for (const part of uiCss.splitTop(String(v), " ")) {
            if (/^[\d.]+(px)?$/.test(part)) w = parseFloat(part);
            else if (["solid", "dashed", "dotted", "double", "none"].includes(part)) st = part;
            else c = part;
          }
          for (const side of sides) { out["border" + side + "Width"] = w; out["border" + side + "Style"] = st; out["border" + side + "Color"] = c; }
          break;
        }
        case "borderWidth": { const b = uiCss.box4(v); ["Top", "Right", "Bottom", "Left"].forEach((side, i) => out["border" + side + "Width"] = parseFloat(b[i])); break; }
        case "borderColor": { const b = typeof v === "string" && !/\(/.test(v) ? uiCss.box4(v) : Array.isArray(v) ? uiCss.box4(v) : [v, v, v, v]; ["Top", "Right", "Bottom", "Left"].forEach((side, i) => out["border" + side + "Color"] = b[i]); break; }
        case "borderStyle": { const b = uiCss.box4(v); ["Top", "Right", "Bottom", "Left"].forEach((side, i) => out["border" + side + "Style"] = b[i]); break; }
        case "gap": {
          const b = typeof v === "number" ? [v, v] : uiCss.splitTop(String(v), " ");
          out.rowGap = b[0]; out.columnGap = b[1] ?? b[0];
          break;
        }
        case "flex": {
          if (v === "none") { out.flexGrow = 0; out.flexShrink = 0; out.flexBasis = "auto"; }
          else if (v === "auto") { out.flexGrow = 1; out.flexShrink = 1; out.flexBasis = "auto"; }
          else {
            const parts = typeof v === "number" ? [v] : uiCss.splitTop(String(v), " ");
            out.flexGrow = parseFloat(parts[0]);
            if (parts.length === 1) { out.flexShrink = 1; out.flexBasis = 0; }
            else if (parts.length === 2) { if (/^[\d.]+$/.test(parts[1])) { out.flexShrink = parseFloat(parts[1]); out.flexBasis = 0; } else { out.flexShrink = 1; out.flexBasis = parts[1]; } }
            else { out.flexShrink = parseFloat(parts[1]); out.flexBasis = parts[2]; }
          }
          break;
        }
        case "placeItems": { const b = uiCss.splitTop(String(v), " "); out.alignItems = b[0]; out.justifyItems = b[1] ?? b[0]; break; }
        case "placeSelf": { const b = uiCss.splitTop(String(v), " "); out.alignSelf = b[0]; out.justifySelf = b[1] ?? b[0]; break; }
        case "overflow": { const b = uiCss.splitTop(String(v), " "); out.overflowX = b[0]; out.overflowY = b[1] ?? b[0]; break; }
        case "background": parseBackground(v, out); break;
        case "borderRadius": {
          const b = typeof v === "number" ? [v, v, v, v] : Array.isArray(v) ? uiCss.box4(v) : uiCss.box4(String(v).split("/")[0].trim());
          out.borderTopLeftRadius = b[0]; out.borderTopRightRadius = b[1]; out.borderBottomRightRadius = b[2]; out.borderBottomLeftRadius = b[3];
          break;
        }
        case "backgroundPosition": {
          const xs = [], ys = [];
          for (const layer of uiCss.splitTop(String(v))) {
            let t = uiCss.splitTop(layer, " ");
            if (t.length === 1) t = /^(top|bottom)$/.test(t[0]) ? ["center", t[0]] : [t[0], "center"];
            if (/^(top|bottom)$/.test(t[0]) || /^(left|right)$/.test(t[1])) t = [t[1], t[0]];
            xs.push(t[0]); ys.push(t[1]);
          }
          out.backgroundPositionX = xs.join(", "); out.backgroundPositionY = ys.join(", ");
          break;
        }
        case "gridColumn": case "gridRow": {
          const [a, b] = String(v).split("/").map(x => x.trim());
          out[k + "Start"] = a; out[k + "End"] = b ?? "auto";
          break;
        }
        case "placeContent": { const b = uiCss.splitTop(String(v), " "); out.alignContent = b[0]; out.justifyContent = b[1] ?? b[0]; break; }
        case "outline": {
          let w = 0, st = "none", c = "currentcolor";
          if (v !== "none" && v !== 0) for (const part of uiCss.splitTop(String(v), " ")) {
            if (/^[\d.]+(px)?$/.test(part)) w = parseFloat(part);
            else if (["solid", "dashed", "dotted", "auto"].includes(part)) st = part;
            else c = part;
          }
          out.outlineWidth = w; out.outlineStyle = st; out.outlineColor = c;
          break;
        }
        case "font": {
          if (v === "inherit") { for (const f of ["fontStyle", "fontWeight", "fontSize", "lineHeight", "fontFamily"]) out[f] = "inherit"; break; }
          const parts = uiCss.splitTop(String(v), " ");
          let i = 0;
          out.fontStyle = "normal"; out.fontWeight = 400; out.lineHeight = "normal";
          for (; i < parts.length; i++) {
            const t = parts[i];
            if (t === "italic" || t === "oblique") out.fontStyle = "italic";
            else if (t === "bold") out.fontWeight = 700;
            else if (t === "bolder" || t === "lighter") out.fontWeight = t;
            else if (/^\d{3}$/.test(t)) out.fontWeight = +t;
            else if (t === "normal" || t === "small-caps") continue;
            else break;
          }
          const size = parts[i] || "16px";
          const [fs, lh] = size.split("/");
          out.fontSize = /^[\d.]+px$/.test(fs) ? parseFloat(fs) : fs;
          if (lh) out.lineHeight = /^[\d.]+$/.test(lh) ? lh : /^[\d.]+px$/.test(lh) ? parseFloat(lh) : lh;
          out.fontFamily = parts.slice(i + 1).join(" ") || "sans-serif";
          break;
        }
        default: out[k] = v;
    }
  }
  function parseBackground(v, out) {
    const layers = uiCss.splitTop(String(v));
    const images = [], positions = [], sizes = [], repeats = [];
    let color = "transparent";
    layers.forEach((layer, i) => {
      let img = "none", pos = [], size = null, rep = "repeat", afterSlash = false;
      const tokens = uiCss.splitTop(layer.replace(/\//g, " / "), " ");
      for (const t of tokens) {
        if (t === "/") { afterSlash = true; size = []; continue; }
        if (/gradient\(|url\(/.test(t)) img = t;
        else if (/^(repeat|no-repeat|repeat-x|repeat-y|space|round)$/.test(t)) rep = t;
        else if (/^(border-box|padding-box|content-box|fixed|scroll|local)$/.test(t)) continue;
        else if (afterSlash && (/^-?[\d.]/.test(t) || /^(auto|cover|contain)$/.test(t))) size.push(t);
        else if (/^(left|right|top|bottom|center)$/.test(t) || /^-?[\d.]/.test(t) || /^calc\(/.test(t)) pos.push(t);
        else if (i === layers.length - 1) color = t;
      }
      images.push(img);
      if (pos.length === 1) pos.push(/^(top|bottom)$/.test(pos[0]) ? pos[0] : "center");
      if (pos.length === 1 || /^(top|bottom)$/.test(pos[0])) pos.reverse();
      positions.push(pos.length ? pos.join(" ") : "0% 0%");
      sizes.push(size && size.length ? size.join(" ") : "auto");
      repeats.push(rep);
    });
    out.backgroundImage = images.every(x => x === "none") ? "none" : images.join(", ");
    out.backgroundPosition = positions.join(", ");
    out.backgroundSize = sizes.join(", ");
    out.backgroundRepeat = repeats.join(", ");
    out.backgroundColor = color;
    delete out.backgroundPositionX; delete out.backgroundPositionY;
  }
  function finalize(out) {
    for (const axis of ["Column", "Row"]) {
      const a = out["grid" + axis + "Start"], b = out["grid" + axis + "End"];
      if (a !== undefined || b !== undefined) {
        const start = a === undefined || a === "auto" ? "auto" : String(a), end = b === undefined || b === "auto" ? null : String(b);
        out["grid" + axis] = start === "auto" ? (end && /span/.test(end) ? end : "auto") : end ? start + " / " + end : start;
        delete out["grid" + axis + "Start"]; delete out["grid" + axis + "End"];
      }
    }
    // corner radii longhands -> borderRadius [tl, tr, br, bl]
    const corners = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"];
    if (corners.some(c => c in out)) {
      const base = [0, 0, 0, 0];
      out.borderRadius = corners.map((c, i) => {
        const v = c in out ? out[c] : base[i];
        return typeof v === "string" ? uiCss.splitTop(v, " ")[0] : v;
      });
      for (const c of corners) delete out[c];
    }
    if ("backgroundPositionX" in out || "backgroundPositionY" in out) {
      const kwx = x => ({ left: "0%", center: "50%", right: "100%" })[x] ?? x, kwy = y => ({ top: "0%", center: "50%", bottom: "100%" })[y] ?? y;
      const xs = uiCss.splitTop(String(out.backgroundPositionX ?? "0%")).map(kwx), ys = uiCss.splitTop(String(out.backgroundPositionY ?? "0%")).map(kwy);
      const n = Math.max(xs.length, ys.length);
      out.backgroundPosition = Array.from({ length: n }, (_, i) => (xs[i % xs.length] + " " + ys[i % ys.length])).join(", ");
      delete out.backgroundPositionX; delete out.backgroundPositionY;
    }
    return out;
  }

  // -- style cache ------------------------------------------------------------
  // Sheet entries are registered once and tagged with an id (an enumerable
  // symbol, so it survives the builders' object spreads). The merged,
  // expanded style of an entry depends only on the environment's media
  // features and the interaction states it references, so it is cached per
  // (entry, states) and only the builder's own overrides (inline styles such
  // as a fill width) are applied per node.
  const SID = Symbol.for("endlessRails.uiStyleId");
  const registry = [];
  function registerStyles(table) {
    for (const name in table) {
      const st = table[name];
      if (!st || typeof st !== "object" || st[SID] !== undefined) continue;
      const states = [];
      const scan = o => { for (const k in o) { if (k[0] === ":") { const [n, up] = k.split("#")[0].split("^"); states.push([n, up]); } if ((k[0] === ":" || k[0] === "@") && o[k] && typeof o[k] === "object") scan(o[k]); } };
      scan(st);
      Object.defineProperty(st, SID, { value: registry.length, enumerable: true });
      registry.push({ style: st, states });
    }
  }
  function stateOn(node, env, name, up) {
    const depth = up !== undefined ? +up : (typeof node.tag === "string" && node.tag.startsWith("::") ? 1 : 0);
    let target = node;
    for (let i = 0; i < depth && target; i++) target = target.parent;
    if (!target) return false;
    const s = (target === node ? node._state : (env.stateOf ? env.stateOf(target.key) : null)) || {};
    return name === ":hover" ? !!(s.hover && env.hover) : name === ":active" ? !!s.active : name === ":disabled" ? !!target.disabled : name === ":enabled" ? !target.disabled : name === ":focus-visible" ? !!s.focusVisible : name === ":focus" ? !!s.focus : false;
  }
  const rawCache = new Map();
  let cacheSig = "";
  // Returns { key, make } where key identifies the resolved own style (null
  // when it cannot be cached) and make() builds a fresh raw style object.
  let lastKey = null;
  function resolveRaw(node, env) {
    const style = node.style || {};
    const id = style[SID];
    if (id === undefined) {
      // ad-hoc styles (layer roots, small inline styles) key by content;
      // their state variants are keyed like a sheet entry's.
      let n = 0, json = true;
      for (const k in style) { n++; const v = style[k]; if (typeof v === "function") json = false; }
      if (!n) lastKey = "_";
      else if (json && n <= 40) {
        let states = "";
        for (const k in style) if (k[0] === ":") { const [nm, up] = k.split("#")[0].split("^"); states += stateOn(node, env, nm, up) ? "1" : "0"; }
        lastKey = "j" + JSON.stringify(style) + states + (typeof node.tag === "string" && node.tag.startsWith("::") ? "p" : "");
      } else lastKey = null;
      return finalize(mergeVariants(style, node, env, {}));
    }
    const info = registry[id];
    let key = "" + id;
    if (info.states.length) {
      key += (typeof node.tag === "string" && node.tag.startsWith("::") ? "p" : "") + "|";
      for (const [n, up] of info.states) key += stateOn(node, env, n, up) ? "1" : "0";
    }
    let entry = rawCache.get(key);
    if (!entry) {
      const merged = mergeVariants(info.style, node, env, {});
      entry = { merged, final: finalize({ ...merged }) };
      rawCache.set(key, entry);
    }
    let out = null, overrides = "";
    for (const k in style) {
      const v = style[k];
      if (v === info.style[k]) continue;
      if (!out) out = { ...entry.merged };
      if (k[0] === "@" || k[0] === ":") { mergeVariants({ [k]: v }, node, env, out); overrides = null; }
      else if (v === "") continue;
      else if (v === null || v === undefined) { delete out[k]; if (overrides !== null) overrides += "\u0001" + k + "=-"; }
      else { expandOne(k, v, out); if (overrides !== null) overrides += "\u0001" + k + "=" + (typeof v === "object" ? JSON.stringify(v) : v); }
    }
    lastKey = overrides === null ? null : key + overrides;
    if (!out) { const f = { ...entry.final }; if (Array.isArray(f.borderRadius)) f.borderRadius = [...f.borderRadius]; return f; }
    return finalize(out);
  }
  // Computed styles are shared between frames: a node whose parent style and
  // own resolved style are unchanged reuses the same (immutable) cs object.
  const csCache = new Map();
  let cidSeq = 0;

  // Computes node.cs from the node style, variants and the parent's inherited
  // values. Font-relative lengths resolve here.
  function computeStyle(node, parentCs, env) {
    const raw = resolveRaw(node, env);
    const ck = lastKey === null ? null : (parentCs ? parentCs._cid : "root") + "#" + lastKey + (node.inline ? "i" : "") + (node.isBr ? "b" : "");
    if (ck !== null) { const hit = csCache.get(ck); if (hit) { node.cs = hit; return hit; } }
    const cs0 = computeStyleRaw(node, parentCs, env, raw);
    cs0._cid = ck !== null ? "c" + (++cidSeq) : "u" + (++cidSeq);
    if (ck !== null) { if (csCache.size > 20000) csCache.clear(); csCache.set(ck, cs0); }
    return cs0;
  }
  function computeStyleRaw(node, parentCs, env, raw) {
    const cs = {};
    const p = parentCs || DEFAULT_ROOT;
    for (const k of INHERITED) cs[k] = p[k];
    for (const k in raw) if (raw[k] === "inherit") raw[k] = k === "lineHeight" && p._lhFactor ? String(p._lhFactor) : p[k];
    if (Array.isArray(raw.borderRadius)) raw.borderRadius = raw.borderRadius.map((v, i) => v === "inherit" ? (Array.isArray(p.borderRadius) ? p.borderRadius[i] : p.borderRadius) ?? 0 : v);
    const lctx = { vw: env.vw, vh: env.vh, em: p.fontSize, rem: 16, safe: env.safe, vars: env.vars };
    if (raw.fontSize !== undefined) {
      const f = raw.fontSize;
      cs.fontSize = f === "smaller" ? p.fontSize / 1.2 : f === "larger" ? p.fontSize * 1.2 : (uiCss.length(typeof f === "string" && f.endsWith("%") ? f : f, p.fontSize, lctx) ?? p.fontSize);
    }
    if (raw.fontWeight === "bolder") raw.fontWeight = p.fontWeight < 350 ? 400 : p.fontWeight < 550 ? 700 : 900;
    else if (raw.fontWeight === "lighter") raw.fontWeight = p.fontWeight < 550 ? 100 : p.fontWeight < 750 ? 400 : 700;
    else if (raw.fontWeight === "bold") raw.fontWeight = 700;
    else if (raw.fontWeight === "normal") raw.fontWeight = 400;
    lctx.em = cs.fontSize;
    for (const k in raw) {
      if (k === "fontSize") continue;
      cs[k] = raw[k];
    }
    if (cs.color === "inherit") cs.color = p.color;
    // line-height: number -> px, unitless string -> multiplier.
    if (raw.lineHeight !== undefined) {
      const lh = raw.lineHeight;
      if (lh === "normal") cs.lineHeight = "normal";
      else if (typeof lh === "string" && /^[\d.]+$/.test(lh)) cs.lineHeight = parseFloat(lh) * cs.fontSize;
      else cs.lineHeight = uiCss.length(lh, cs.fontSize, lctx) ?? "normal";
      cs._lhFactor = typeof lh === "string" && /^[\d.]+$/.test(lh) ? parseFloat(lh) : null;
    } else if (p._lhFactor) {
      // unitless line-height inherits as a factor
      cs._lhFactor = p._lhFactor;
      cs.lineHeight = p._lhFactor * cs.fontSize;
    }
    if (raw.letterSpacing !== undefined) cs.letterSpacing = raw.letterSpacing === "normal" ? 0 : uiCss.length(raw.letterSpacing, cs.fontSize, lctx) || 0;
    else if (p._lsEm !== undefined) { cs._lsEm = p._lsEm; }
    if (typeof raw.letterSpacing === "string" && /em$/.test(raw.letterSpacing)) cs._lsEm = parseFloat(raw.letterSpacing);
    if (raw.textShadow !== undefined || cs.textShadow !== p.textShadow) cs._textShadows = uiCss.parseShadows(cs.textShadow);
    else cs._textShadows = p._textShadows;
    cs.display = raw.display || (node.inline || node.isBr ? "inline" : "block");
    if (cs.display === "list-item" || cs.display === "flow-root") cs.display = "block";
    if (cs.display === "contents") cs.display = "block";
    cs.position = raw.position || "static";
    cs.lctx = lctx;
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const st = cs["border" + side + "Style"];
      if (!st || st === "none" || st === "hidden") cs["border" + side + "Width"] = 0;
      else if (st === "outset" || st === "inset" || st === "groove" || st === "ridge") cs["border" + side + "Style"] = "solid";
      if (cs["border" + side + "Color"] === "currentcolor" || cs["border" + side + "Color"] === undefined) cs["border" + side + "Color"] = cs.color;
    }
    if (cs.outlineColor === "currentcolor") cs.outlineColor = cs.color;
    node.cs = cs;
    return cs;
  }

  // -- helpers -------------------------------------------------------------------------

  const L = (v, basis, cs) => uiCss.length(v, basis, cs.lctx);
  function boxModel(node, cbW) {
    const cs = node.cs;
    const m = side => { const v = cs["margin" + side]; return v === "auto" ? "auto" : (L(v, cbW, cs) || 0); };
    node.mt = m("Top"); node.mr = m("Right"); node.mb = m("Bottom"); node.ml = m("Left");
    const pd = side => Math.max(0, L(cs["padding" + side], cbW, cs) || 0);
    node.pt = pd("Top"); node.pr = pd("Right"); node.pb = pd("Bottom"); node.pl = pd("Left");
    node.bt = cs.borderTopWidth || 0; node.br = cs.borderRightWidth || 0; node.bb = cs.borderBottomWidth || 0; node.bl = cs.borderLeftWidth || 0;
  }
  const num = v => (v === "auto" ? 0 : v);
  const hEdges = n => n.pl + n.pr + n.bl + n.br;
  const vEdges = n => n.pt + n.pb + n.bt + n.bb;
  function clampW(node, w, cbW) {
    const cs = node.cs;
    const cb = cs.boxSizing === "content-box" ? hEdges(node) : 0;
    const max = L(cs.maxWidth, cbW, cs), min = L(cs.minWidth, cbW, cs);
    if (max != null) w = Math.min(w, max + cb);
    if (min != null) w = Math.max(w, min + cb);
    return Math.max(w, hEdges(node));
  }
  function clampH(node, h, cbH) {
    const cs = node.cs;
    const cb = cs.boxSizing === "content-box" ? vEdges(node) : 0;
    const max = L(cs.maxHeight, cbH, cs), min = L(cs.minHeight, cbH, cs);
    if (max != null) h = Math.min(h, max + cb);
    if (min != null) h = Math.max(h, min + cb);
    return Math.max(h, vEdges(node));
  }
  function specW(node, cbW) { const v = L(node.cs.width, cbW, node.cs); return v != null && node.cs.boxSizing === "content-box" ? v + hEdges(node) : v; }
  function specH(node, cbH) { const v = L(node.cs.height, cbH, node.cs); return v != null && node.cs.boxSizing === "content-box" ? v + vEdges(node) : v; }
  const isFlow = n => n.cs.display !== "none" && n.cs.position !== "absolute" && n.cs.position !== "fixed";
  const isScroll = cs => cs.overflowY === "auto" || cs.overflowY === "scroll" || cs.overflowX === "auto" || cs.overflowX === "scroll";

  // -- tree preparation -----------------------------------------------------------------

  // Resolves styles for the subtree and normalises children: strings become
  // anonymous text nodes; runs of inline children inside a block that also
  // has block children are wrapped in anonymous blocks (CSS anonymous boxes).
  function prepare(node, parentCs, env, path = "r", parent = null) {
    if (node.key == null) node.key = path;
    node.parent = parent;
    node._state = env.stateOf ? env.stateOf(node.key) : null;
    computeStyle(node, parentCs, env);
    const cs = node.cs;
    const kids = [];
    for (const ch of flatten(node.children)) {
      if (ch == null || ch === false || ch === "") continue;
      if (typeof ch === "string" || typeof ch === "number") kids.push({ text: String(ch), anon: true, inline: true, style: {} });
      else kids.push(ch);
    }
    kids.forEach((k, i) => prepare(k, cs, env, node.key + "." + i, node));
    // collapsible whitespace between block-level siblings produces no boxes
    if (cs.whiteSpace !== "pre" && cs.whiteSpace !== "pre-wrap") {
      for (let i = kids.length - 1; i >= 0; i--) {
        const k = kids[i];
        if (!k.anon || k.text == null || /\S/.test(k.text)) continue;
        const prev = kids[i - 1], next = kids[i + 1];
        const inl = n => n && n.cs && INLINE_DISPLAYS.has(n.cs.display) && n.cs.position !== "absolute" && n.cs.position !== "fixed";
        const isFlexGrid = /flex|grid/.test(cs.display);
        if (isFlexGrid || !inl(prev) || !inl(next)) kids.splice(i, 1);
      }
    }
    const visible = kids.filter(k => k.cs.display !== "none");
    const isContainer = cs.display === "flex" || cs.display === "inline-flex" || cs.display === "grid" || cs.display === "inline-grid";
    if (isContainer) {
      // flex/grid items are blockified
      for (const k of visible) if (k.cs.display === "inline") k.cs = blockified(k.cs);
      node.kids = kids;
      node.inlineContent = false;
    } else {
      const flowKids = visible.filter(isFlow);
      const anyInline = flowKids.some(k => INLINE_DISPLAYS.has(k.cs.display)) || node.text != null;
      for (const k of flowKids) if (k.image && k.cs.display === "inline") k.atomic = true;
      const anyBlock = flowKids.some(k => !INLINE_DISPLAYS.has(k.cs.display));
      if (anyInline && !anyBlock) { node.kids = kids; node.inlineContent = true; }
      else if (anyInline && anyBlock) {
        const out = [];
        let run = null;
        for (const k of kids) {
          if (k.cs.display !== "none" && isFlow(k) && INLINE_DISPLAYS.has(k.cs.display)) {
            if (!run) { run = { anon: true, key: node.key + ".anon" + out.length, parent: node, style: {}, children: [], kids: [], inlineContent: true, cs: anonCs(cs) }; out.push(run); }
            run.kids.push(k);
          } else { run = null; out.push(k); }
        }
        node.kids = out;
        node.inlineContent = false;
      } else { node.kids = kids; node.inlineContent = false; }
    }
  }
  function anonCs(parent) {
    const cs = { display: "block", position: "static", lctx: parent.lctx, _textShadows: parent._textShadows, _lhFactor: parent._lhFactor };
    for (const k of INHERITED) cs[k] = parent[k];
    return cs;
  }
  function flatten(list) {
    if (!list) return [];
    const out = [];
    const walk = l => { for (const x of l) { if (Array.isArray(x)) walk(x); else out.push(x); } };
    walk(Array.isArray(list) ? list : [list]);
    return out;
  }

  // -- inline formatting ----------------------------------------------------------------

  // Collects the inline runs of a node (its own text plus inline descendants).
  function inlineRuns(node, out = []) {
    if (node.isBr) { out.push({ text: "\n", st: { ...node.cs, whiteSpace: "pre-line" }, ref: node }); return out; }
    if (node.text != null) out.push({ text: node.text, st: node.cs, ref: node });
    for (const k of node.kids || []) {
      if (k.cs.display === "none") continue;
      if (!isFlow(k)) continue;
      if ((k.cs.display === "inline" && !k.image) || k.isBr) inlineRuns(k, out);
      else out.push({ box: true, node: k, st: k.cs, ref: k, w: 0, h: 0 });
    }
    return out;
  }
  function inlineIntrinsic(node) {
    const runs = inlineRuns(node);
    // Atomic inlines contribute their max-content width to the max-content
    // line and their min-content width to the min-content breaks.
    for (const r of runs) if (r.box) { r.w = outerMax(r.node); }
    const max = uiText.intrinsic(runs, node.cs.whiteSpace).max;
    for (const r of runs) if (r.box) { r.w = outerMin(r.node); }
    const min = uiText.intrinsic(runs, node.cs.whiteSpace).min;
    return { max, min };
  }
  function outerMax(n) { boxModel(n, 0); return maxContent(n) + num(n.ml) + num(n.mr); }
  function outerMin(n) { boxModel(n, 0); return minContent(n) + num(n.ml) + num(n.mr); }

  function layoutInline(node, contentW, contentHDef = null) {
    const cs = node.cs;
    const runs = inlineRuns(node);
    for (const r of runs) {
      if (!r.box) continue;
      const k = r.node;
      boxModel(k, contentW);
      let w = specW(k, contentW);
      if (w == null) w = Math.min(Math.max(minContent(k), contentW - num(k.ml) - num(k.mr)), maxContent(k));
      w = clampW(k, w, contentW);
      layoutBox(k, w, specH(k, contentHDef), contentW, contentHDef);
      r.w = w + num(k.ml) + num(k.mr);
      r.h = k.h + num(k.mt) + num(k.mb);
    }
    const nowrap = cs.whiteSpace === "nowrap";
    const lines = uiText.breakLines(runs, contentW, cs.whiteSpace, cs.overflowWrap === "anywhere" || cs.overflowWrap === "break-word" || cs.wordBreak === "break-all" ? "anywhere" : "normal");
    // Vertical metrics per line: half-leading model with the block's strut.
    const strut = lineBoxPart(cs);
    let y = 0;
    const outLines = [];
    for (const line of lines) {
      let top = -strut.above, bottom = strut.below;
      const placed = [];
      for (const it of line.items) {
        if (it.box) {
          const k = it.box.node;
          const va = k.cs.verticalAlign || "baseline";
          let boxTop;
          const oh = it.box.h;
          if (va === "middle") boxTop = -(cs.fontSize * 0.26) - oh / 2;
          else if (va === "top" || va === "text-top") boxTop = -strut.above;
          else if (va === "bottom" || va === "text-bottom") boxTop = strut.below - oh;
          else boxTop = -oh + baselineOffset(k);
          top = Math.min(top, boxTop); bottom = Math.max(bottom, boxTop + oh);
          placed.push({ it, boxTop });
        } else {
          const part = lineBoxPart(it.st, it.text);
          const va = it.st.verticalAlign;
          const shift = va === "middle" ? 0 : 0;
          top = Math.min(top, -part.above + shift); bottom = Math.max(bottom, part.below + shift);
          placed.push({ it, part });
        }
      }
      const hasContent = placed.some(({ it }) => it.box || (it.text && it.text.length) || (it.space && cs.whiteSpace === "pre-wrap"));
      if (!hasContent && !/^pre/.test(cs.whiteSpace)) { top = 0; bottom = 0; }
      const lineH = bottom - top;
      const baseline = y - top;
      let offsetX = 0;
      const align = cs.textAlign;
      const free = contentW - line.w;
      if (!nowrap || free > 0) {
        if (align === "center") offsetX = free / 2;
        else if (align === "right" || align === "end") offsetX = free;
      }
      const items = placed.map(({ it, boxTop }) => {
        if (it.box) {
          const k = it.box.node;
          k.x = node.bl + node.pl + offsetX + it.x + num(k.ml);
          k.y = node.bt + node.pt + baseline + boxTop + num(k.mt);
          return { box: k };
        }
        return { text: it.text + (it.space && !it.trailingHidden && it.spaceText && cs.whiteSpace === "pre-wrap" ? it.spaceText : ""), x: offsetX + it.x, st: it.st, ref: it.ref, w: it.w, space: it.trailingHidden ? 0 : it.space };
      });
      outLines.push({ y, h: lineH, baseline, w: line.w, x: offsetX, items });
      y += lineH;
    }
    // text-overflow: ellipsis on a single clipped line
    if (cs.textOverflow === "ellipsis" && (cs.overflowX === "hidden" || cs.overflowX === "clip") && outLines.length) {
      const line = outLines[0];
      if (line.w > contentW + 0.5) {
        const textItems = line.items.filter(i => i.text != null);
        if (textItems.length === 1) {
          const it = textItems[0];
          it.text = uiText.ellipsize(it.st, it.text, contentW - (it.x - line.x));
          if (cs.textAlign === "center") it.x = (contentW - uiText.width(it.st, it.text)) / 2;
        }
      }
    }
    node.lines = outLines;
    return y;
  }
  function lineBoxPart(st, text) {
    const m = uiText.metrics(st);
    if ((st.lineHeight === "normal" || st.lineHeight == null) && text && !st.primaryLineHeight) {
      const b = uiText.normalBox(st, text);
      return { above: b.ascent, below: b.descent };
    }
    const lh = uiText.lineHeightOf(st);
    const half = (lh - (m.ascent + m.descent)) / 2;
    return { above: m.ascent + half, below: m.descent + half };
  }
  // Distance from an inline-block's bottom margin edge up to its baseline
  // (negative moves the box down). Boxes with text use their last line.
  function baselineOffset(k) {
    if (k.cs.overflowX && k.cs.overflowX !== "visible") return 0;
    const b = lastBaseline(k);
    if (b == null) return 0;
    return (k.h + num(k.mb)) - b;
  }
  function lastBaseline(k) {
    if (k.lines && k.lines.length) return k.bt + k.pt + k.lines[k.lines.length - 1].baseline;
    for (let i = (k.kids || []).length - 1; i >= 0; i--) {
      const c = k.kids[i];
      if (!c.cs || c.cs.display === "none" || !isFlow(c)) continue;
      const b = lastBaseline(c);
      if (b != null) return c.y + b;
    }
    return null;
  }
  function firstBaseline(k) {
    if (k.lines && k.lines.length) return k.bt + k.pt + k.lines[0].baseline;
    for (const c of k.kids || []) {
      if (!c.cs || c.cs.display === "none" || !isFlow(c)) continue;
      const b = firstBaseline(c);
      if (b != null) return c.y + b;
    }
    return null;
  }

  // -- intrinsic sizes (border-box widths) ------------------------------------------------

  function maxContent(node) {
    if (node._maxC !== undefined) return node._maxC;
    const cs = node.cs;
    const fixed = specW(node, null);
    let v;
    if (fixed != null) v = fixed;
    else if (node.image && node.intrinsicW) v = node.intrinsicW + hEdges(node);
    else v = contentIntrinsic(node, "max") + hEdges(node);
    v = clampW(node, v, null);
    node._maxC = v;
    return v;
  }
  function minContent(node) {
    if (node._minC !== undefined) return node._minC;
    const cs = node.cs;
    const fixed = specW(node, null);
    let v;
    if (fixed != null) v = fixed;
    // Replaced elements sized by a percentage are "compressible": their
    // min-content contribution is zero (CSS Sizing 3 §5.2.2).
    else if (node.image && node.intrinsicW) v = (/%/.test(String(cs.width ?? "")) || /%/.test(String(cs.maxWidth ?? ""))) ? hEdges(node) : node.intrinsicW + hEdges(node);
    else v = contentIntrinsic(node, "min") + hEdges(node);
    v = clampW(node, v, null);
    node._minC = v;
    return v;
  }
  function contentIntrinsic(node, which) {
    const cs = node.cs;
    if (node.inlineContent) { const r = inlineIntrinsic(node); return which === "max" ? r.max : r.min; }
    const kids = (node.kids || []).filter(k => k.cs.display !== "none" && isFlow(k));
    for (const k of kids) boxModel(k, 0);
    const contrib = k => (which === "max" ? maxContent(k) : minContent(k)) + num(k.ml) + num(k.mr);
    if (cs.display === "flex" || cs.display === "inline-flex") {
      const row = !(cs.flexDirection || "row").startsWith("column");
      if (row) {
        const gap = L(cs.columnGap, null, cs) || 0;
        const wrap = cs.flexWrap === "wrap";
        if (which === "min" && wrap) return Math.max(0, ...kids.map(contrib));
        return kids.reduce((s, k) => s + contrib(k), 0) + gap * Math.max(0, kids.length - 1);
      }
      return Math.max(0, ...kids.map(contrib));
    }
    if (cs.display === "grid" || cs.display === "inline-grid") {
      const cols = parseTracks(cs.gridTemplateColumns, cs);
      const gap = L(cs.columnGap, null, cs) || 0;
      if (!cols.length) return Math.max(0, ...kids.map(contrib));
      const placement = placeGrid(node, kids, cols.length, parseTracks(cs.gridTemplateRows, cs).length);
      let total = 0;
      cols.forEach((t, i) => {
        if (t.kind === "px") { total += t.v; return; }
        const items = placement.filter(p => p.c0 === i && p.c1 === i + 1);
        let size = Math.max(0, ...items.map(p => contrib(p.node)));
        if (t.kind === "minmax" && t.min.kind === "px") size = Math.max(size, t.min.v);
        total += size;
      });
      return total + gap * Math.max(0, cols.length - 1);
    }
    return Math.max(0, ...kids.map(contrib));
  }

  // -- main dispatcher --------------------------------------------------------------------

  // Lays out `node` with a final border-box width `w` and, when definite, a
  // border-box height `h`. cbW/cbH resolve percentages of its children.
  // Classic (space-taking) scrollbars of desktop browsers: a scroll
  // container whose content overflows gives up a gutter at its right edge.
  function scrollbarSize(cs) {
    if (!curEnv || !curEnv.classicScrollbars) return 0;
    return cs.scrollbarWidth === "none" ? 0 : cs.scrollbarWidth === "thin" ? 10 : 15;
  }
  function layoutBox(node, w, h, cbW, cbH, sb = 0) {
    const cs = node.cs;
    node.w = w;
    node.defH = h != null;
    node._sb = sb;
    const contentW = Math.max(0, w - hEdges(node) - sb);
    const contentHDef = h != null ? Math.max(0, h - vEdges(node)) : null;
    let contentH;
    if (node.image && !node.kids?.length) contentH = contentHDef ?? (node.intrinsicW ? contentW * node.intrinsicH / node.intrinsicW : 0);
    else if (node.inlineContent) contentH = layoutInline(node, contentW, contentHDef);
    else if (cs.display === "flex" || cs.display === "inline-flex") contentH = layoutFlex(node, contentW, contentHDef);
    else if (cs.display === "grid" || cs.display === "inline-grid") contentH = layoutGrid(node, contentW, contentHDef);
    else contentH = layoutBlock(node, contentW, contentHDef);
    node.contentH = contentH;
    node.h = h != null ? h : clampH(node, contentH + vEdges(node), cbH);
    // HTML <button> centers its content block vertically inside the box (UA
    // behavior the DOM interface relied on: the page CSS only set heights and
    // let the button do the centering). Screens tag such nodes tag:"button".
    if (node.tag === "button" && !isScroll(cs) && !/flex|grid/.test(cs.display)) {
      const inner = node.h - vEdges(node);
      if (contentH < inner - 0.01) {
        const dy = (inner - contentH) / 2;
        for (const line of node.lines || []) { line.y += dy; line.baseline += dy; }
        for (const k of node.kids || []) if (isFlow(k) && k.y != null) k.y += dy;
      }
    }
    if (isScroll(cs)) {
      // scrollable overflow: the content box extent or the lowest child margin edge
      let bottom = contentH + node.pt + node.pb;
      for (const k of node.kids || []) {
        if (!k.cs || k.cs.display === "none" || k.y == null || k.h == null) continue;
        bottom = Math.max(bottom, k.y + k.h + num(k.mb) - node.bt + node.pb);
      }
      node.scrollH = bottom;
      if (!sb && (cs.overflowY === "auto" || cs.overflowY === "scroll")) {
        const size = scrollbarSize(cs);
        if (size && (cs.overflowY === "scroll" || node.scrollH > node.h - node.bt - node.bb + 0.5)) return layoutBox(node, w, h, cbW, cbH, size);
      }
    }
    layoutAbsolute(node);
    applyRelative(node);
    return node;
  }

  function applyRelative(node) {
    for (const k of node.kids || []) {
      if (k.cs.position !== "relative" || k.cs.display === "none") continue;
      const cbW = node.w - hEdges(node), cbH = node.h - vEdges(node);
      const top = L(k.cs.top, cbH, k.cs), left = L(k.cs.left, cbW, k.cs), right = L(k.cs.right, cbW, k.cs), bottom = L(k.cs.bottom, cbH, k.cs);
      k.x += left != null ? left : right != null ? -right : 0;
      k.y += top != null ? top : bottom != null ? -bottom : 0;
    }
  }

  // -- block flow ---------------------------------------------------------------------------

  // A block box whose content forms part of its parent's block formatting
  // context lets its first/last child's margins collapse through it.
  const blockCache = new Map();
  function blockified(cs) {
    let b = blockCache.get(cs._cid);
    if (!b) { b = { ...cs, display: "block", _cid: cs._cid + "B" }; if (blockCache.size > 20000) blockCache.clear(); blockCache.set(cs._cid, b); }
    return b;
  }
  function establishesBFC(node) {
    const cs = node.cs, p = node.parent;
    if (!p || cs.display !== "block") return true;
    if (cs.position === "absolute" || cs.position === "fixed") return true;
    if ((cs.overflowX && cs.overflowX !== "visible") || (cs.overflowY && cs.overflowY !== "visible")) return true;
    const pd = p.cs && p.cs.display;
    return pd === "flex" || pd === "inline-flex" || pd === "grid" || pd === "inline-grid";
  }
  function layoutBlock(node, contentW, contentHDef) {
    let y = 0, prevMb = null;
    const kids = (node.kids || []).filter(k => k.cs.display !== "none" && isFlow(k));
    const originX = node.bl + node.pl, originY = node.bt + node.pt;
    const bfc = establishesBFC(node);
    const throughTop = !bfc && !node.bt && !node.pt;
    const throughBottom = !bfc && !node.bb && !node.pb && contentHDef == null && L(node.cs.minHeight, null, node.cs) == null;
    node._topThrough = null; node._botThrough = null;
    for (const k of kids) {
      boxModel(k, contentW);
      let w = specW(k, contentW);
      const autoW = w == null;
      if (autoW) w = contentW - num(k.ml) - num(k.mr);
      w = clampW(k, w, contentW);
      let ml = num(k.ml);
      if (!autoW || w < contentW - num(k.ml) - num(k.mr)) {
        const free = contentW - w - num(k.ml) - num(k.mr);
        if (k.ml === "auto" && k.mr === "auto") ml = free / 2 + 0;
        else if (k.ml === "auto") ml = free;
      }
      const hSpec = specH(k, contentHDef);
      layoutBox(k, w, hSpec != null ? clampH(k, hSpec, contentHDef) : null, contentW, contentHDef);
      const mt = k._topThrough != null ? collapse(num(k.mt), k._topThrough) : num(k.mt);
      const mb = k._botThrough != null ? collapse(num(k.mb), k._botThrough) : num(k.mb);
      let collapsed;
      if (prevMb == null) {
        if (throughTop) { node._topThrough = mt; collapsed = 0; } else collapsed = mt;
      } else collapsed = collapse(prevMb, mt);
      k.x = originX + ml;
      k.y = originY + y + collapsed;
      y = k.y - originY + k.h;
      prevMb = mb;
    }
    if (prevMb != null) { if (throughBottom) node._botThrough = prevMb; else y += prevMb; }
    return y;
  }
  function collapse(a, b) {
    if (a >= 0 && b >= 0) return Math.max(a, b);
    if (a <= 0 && b <= 0) return Math.min(a, b);
    return a + b;
  }

  // -- flexbox --------------------------------------------------------------------------------

  function layoutFlex(node, contentW, contentHDef) {
    const cs = node.cs;
    const dir = cs.flexDirection || "row";
    const row = !dir.startsWith("column");
    const reverse = dir.endsWith("reverse");
    const wrap = cs.flexWrap === "wrap" || cs.flexWrap === "wrap-reverse";
    const mainGap = L(row ? cs.columnGap : cs.rowGap, row ? contentW : contentHDef, cs) || 0;
    const crossGap = L(row ? cs.rowGap : cs.columnGap, row ? contentHDef : contentW, cs) || 0;
    const kids = (node.kids || []).filter(k => k.cs.display !== "none" && isFlow(k));
    const mainSize = row ? contentW : contentHDef;
    const items = [];
    for (const k of kids) {
      boxModel(k, contentW);
      const kc = k.cs;
      const it = { node: k };
      it.mMainStart = row ? k.ml : k.mt; it.mMainEnd = row ? k.mr : k.mb;
      it.mCrossStart = row ? k.mt : k.ml; it.mCrossEnd = row ? k.mb : k.mr;
      const marginMain = num(it.mMainStart) + num(it.mMainEnd);
      it.marginMain = marginMain;
      it.grow = kc.flexGrow != null ? +kc.flexGrow : 0;
      it.shrink = kc.flexShrink != null ? +kc.flexShrink : 1;
      // flex base size
      let basis = kc.flexBasis;
      let base = null;
      if (basis != null && basis !== "auto" && basis !== "content") base = L(basis, mainSize, kc);
      if (base == null) base = row ? specW(k, contentW) : specH(k, contentHDef);
      const crossSpec = row ? specH(k, contentHDef) : specW(k, contentW);
      if (base == null) {
        if (row) base = maxContent(k);
        else {
          const cw = crossSpec != null ? crossSpec : stretchCross(it, cs, kc) && contentW != null ? contentW - num(k.ml) - num(k.mr) : Math.min(maxContent(k), contentW - num(k.ml) - num(k.mr));
          layoutBox(k, clampW(k, cw, contentW), null, contentW, null);
          base = k.h;
        }
      }
      it.base = base;
      // min/max in the main axis; min auto = min-content unless scrollable
      const minRaw = row ? kc.minWidth : kc.minHeight, maxRaw = row ? kc.maxWidth : kc.maxHeight;
      let minMain = L(minRaw, mainSize, kc);
      if (minMain == null && (minRaw == null || minRaw === "auto")) {
        const scroll = (row ? kc.overflowX : kc.overflowY);
        if (scroll && scroll !== "visible") minMain = 0;
        else if (row) { const spec = specW(k, contentW); minMain = spec != null ? Math.min(spec, minContent(k)) : minContent(k); }
        else {
          // automatic minimum = min(specified size, content size)
          const spec = specH(k, contentHDef);
          const cw = crossSpec != null ? crossSpec : contentW - num(k.ml) - num(k.mr);
          layoutBox(k, clampW(k, cw, contentW), null, contentW, null);
          minMain = spec != null ? Math.min(spec, k.h) : k.h;
        }
      }
      const maxMain = L(maxRaw, mainSize, kc);
      it.minMain = Math.max(minMain || 0, row ? hEdges(k) : vEdges(k));
      it.maxMain = maxMain == null ? Infinity : maxMain;
      it.hypo = Math.max(it.minMain, Math.min(it.maxMain, base));
      items.push(it);
    }
    // lines
    const lines = [];
    if (!wrap || mainSize == null) lines.push(items);
    else {
      let cur = [], used = 0;
      for (const it of items) {
        const outer = it.hypo + it.marginMain;
        if (cur.length && used + mainGap + outer > mainSize + 0.01) { lines.push(cur); cur = []; used = 0; }
        used += (cur.length ? mainGap : 0) + outer;
        cur.push(it);
      }
      if (cur.length) lines.push(cur);
    }
    // resolve flexible lengths per line
    let containerMain = mainSize;
    if (containerMain == null) {
      // column with indefinite height: size to content
      containerMain = Math.max(0, ...lines.map(l => l.reduce((s, it) => s + it.hypo + it.marginMain, 0) + mainGap * Math.max(0, l.length - 1)));
      const minH = L(cs.minHeight, null, cs), maxH = L(cs.maxHeight, null, cs);
      if (!row) {
        let outerH = containerMain + vEdges(node);
        if (maxH != null) outerH = Math.min(outerH, maxH);
        if (minH != null) outerH = Math.max(outerH, minH);
        containerMain = Math.max(0, outerH - vEdges(node));
      }
    }
    for (const line of lines) resolveFlexible(line, containerMain, mainGap);
    // cross sizes
    const crossDef = row ? contentHDef : contentW;
    const lineInfo = [];
    for (const line of lines) {
      let lineCross = 0;
      for (const it of line) {
        const k = it.node;
        if (row) {
          const hSpec = specH(k, contentHDef);
          layoutBox(k, it.main, hSpec != null ? clampH(k, hSpec, contentHDef) : null, contentW, contentHDef);
          it.cross = k.h;
        } else {
          const wSpec = specW(k, contentW);
          let w;
          if (wSpec != null) w = wSpec;
          else if (stretchCross(it, cs, k.cs)) w = contentW - num(k.ml) - num(k.mr);
          else w = Math.min(maxContent(k), contentW - num(k.ml) - num(k.mr));
          w = clampW(k, w, contentW);
          layoutBox(k, w, it.main, contentW, contentHDef);
          it.cross = k.w;
        }
        it.baseline = row ? (firstBaseline(k) ?? k.h) + num(it.mCrossStart) : 0;
        lineCross = Math.max(lineCross, it.cross + num(it.mCrossStart) + num(it.mCrossEnd));
      }
      lineInfo.push({ line, cross: lineCross });
    }
    // baseline alignment raises the line cross size
    for (const li of lineInfo) {
      if (!row) continue;
      const base = li.line.filter(it => alignOf(cs, it.node.cs) === "baseline");
      if (base.length) {
        const maxB = Math.max(...base.map(it => it.baseline));
        for (const it of base) { it.baseShift = maxB - it.baseline; li.cross = Math.max(li.cross, it.baseShift + it.cross + num(it.mCrossStart) + num(it.mCrossEnd)); }
      }
    }
    if (lines.length === 1 && crossDef != null) lineInfo[0].cross = crossDef;
    else if (lines.length === 1 && row && lineInfo.length) {
      // single-line: the line is clamped by the container's min/max height
      const minH = L(cs.minHeight, null, cs), maxH = L(cs.maxHeight, null, cs);
      const cb = cs.boxSizing === "content-box" ? 0 : vEdges(node);
      if (maxH != null) lineInfo[0].cross = Math.min(lineInfo[0].cross, maxH - cb);
      if (minH != null) lineInfo[0].cross = Math.max(lineInfo[0].cross, minH - cb);
    }
    // align-content (stretch distributes spare space between lines)
    let crossTotal = lineInfo.reduce((s, l) => s + l.cross, 0) + crossGap * Math.max(0, lineInfo.length - 1);
    if (crossDef != null && lineInfo.length > 1) {
      const spare = crossDef - crossTotal;
      const ac = cs.alignContent || "normal";
      if (spare > 0 && (ac === "normal" || ac === "stretch")) { for (const l of lineInfo) l.cross += spare / lineInfo.length; crossTotal = crossDef; }
    }
    // stretch items and position
    const originX = node.bl + node.pl, originY = node.bt + node.pt;
    let crossPos = 0;
    if (crossDef != null && lineInfo.length > 1) {
      const spare = crossDef - crossTotal, ac = cs.alignContent;
      if (ac === "center") crossPos = spare / 2; else if (ac === "flex-end" || ac === "end") crossPos = spare;
    }
    const orderedLines = cs.flexWrap === "wrap-reverse" ? [...lineInfo].reverse() : lineInfo;
    for (const li of orderedLines) {
      const line = reverse ? [...li.line].reverse() : li.line;
      // stretch
      for (const it of line) {
        const k = it.node, kc = k.cs;
        const align = alignOf(cs, kc);
        const autoCross = it.mCrossStart === "auto" || it.mCrossEnd === "auto";
        const crossSpec = row ? kc.height : kc.width;
        if (align === "stretch" && !autoCross && (crossSpec == null || crossSpec === "auto")) {
          const target = li.cross - num(it.mCrossStart) - num(it.mCrossEnd);
          if (row) { const hh = clampH(k, target, contentHDef); if (Math.abs(hh - k.h) > 0.01 || !k.defH) layoutBox(k, k.w, hh, contentW, contentHDef); }
          else { const ww = clampW(k, target, contentW); if (Math.abs(ww - k.w) > 0.01) layoutBox(k, ww, k.h, contentW, contentHDef); }
          it.cross = row ? k.h : k.w;
        }
      }
      // main axis placement
      const used = line.reduce((s, it) => s + it.main + it.marginMain, 0) + mainGap * Math.max(0, line.length - 1);
      let free = containerMain - used;
      const autoMargins = line.reduce((s, it) => s + (it.mMainStart === "auto") + (it.mMainEnd === "auto"), 0);
      let pos = 0, between = 0;
      if (autoMargins && free > 0) {
        const each = free / autoMargins;
        for (const it of line) { if (it.mMainStart === "auto") it.autoStart = each; if (it.mMainEnd === "auto") it.autoEnd = each; }
        free = 0;
      } else {
        const jc = cs.justifyContent || "normal";
        const n = line.length;
        if (reverse && (jc === "normal" || jc === "flex-start" || jc === "start")) pos = free;
        else if (jc === "center") pos = free / 2;
        else if (jc === "flex-end" || jc === "end") pos = reverse ? 0 : free;
        else if (jc === "space-between" && n > 1 && free > 0) between = free / (n - 1);
        else if (jc === "space-between" && free < 0) pos = 0;
        else if (jc === "space-around" && n) { between = free / n; pos = between / 2; }
        else if (jc === "space-evenly" && n) { between = free / (n + 1); pos = between; }
      }
      for (const it of line) {
        const k = it.node;
        pos += it.autoStart || num(it.mMainStart);
        // cross placement
        const align = alignOf(cs, k.cs);
        const outerCross = it.cross + num(it.mCrossStart) + num(it.mCrossEnd);
        let c = num(it.mCrossStart);
        if (it.mCrossStart === "auto" && it.mCrossEnd === "auto") c = (li.cross - it.cross) / 2;
        else if (it.mCrossStart === "auto") c = li.cross - it.cross - num(it.mCrossEnd);
        else if (align === "center") c += (li.cross - outerCross) / 2;
        else if (align === "flex-end" || align === "end" || align === "self-end") c += li.cross - outerCross;
        else if (align === "baseline") c += it.baseShift || 0;
        if (row) { k.x = originX + pos; k.y = originY + crossPos + c; }
        else { k.y = originY + pos; k.x = originX + crossPos + c; }
        pos += it.main + (it.autoEnd || num(it.mMainEnd)) + mainGap + between;
      }
      crossPos += li.cross + crossGap;
    }
    if (row) return lineInfo.reduce((s, l) => s + l.cross, 0) + crossGap * Math.max(0, lineInfo.length - 1);
    return containerMain;
  }
  function alignOf(cs, kc) {
    const self = kc.alignSelf;
    let a = self && self !== "auto" ? self : (cs.alignItems || "normal");
    if (a === "normal") a = "stretch";
    if (a === "start" || a === "self-start") a = "flex-start";
    return a;
  }
  function stretchCross(it, cs, kc) {
    return alignOf(cs, kc) === "stretch" && it.mCrossStart !== "auto" && it.mCrossEnd !== "auto";
  }
  function resolveFlexible(line, containerMain, gap) {
    const outerHypo = line.reduce((s, it) => s + it.hypo + it.marginMain, 0) + gap * Math.max(0, line.length - 1);
    const growing = outerHypo < containerMain;
    for (const it of line) {
      it.frozen = (growing ? it.grow === 0 : it.shrink === 0) || (growing ? it.base > it.hypo : it.base < it.hypo);
      it.main = it.hypo;
      it.target = it.frozen ? it.hypo : it.base;
    }
    for (let guard = 0; guard < 10; guard++) {
      const unfrozen = line.filter(it => !it.frozen);
      if (!unfrozen.length) break;
      const used = line.reduce((s, it) => s + (it.frozen ? it.target : it.base) + it.marginMain, 0) + gap * Math.max(0, line.length - 1);
      let free = containerMain - used;
      const sumFactor = unfrozen.reduce((s, it) => s + (growing ? it.grow : it.shrink * it.base), 0);
      if (growing) {
        const sumGrow = unfrozen.reduce((s, it) => s + it.grow, 0);
        if (sumGrow < 1) free = Math.min(free, free * sumGrow + 0) ;
      }
      for (const it of unfrozen) {
        if (sumFactor <= 0) { it.target = it.base; continue; }
        if (growing) it.target = it.base + free * it.grow / sumFactor;
        else it.target = it.base + free * (it.shrink * it.base) / sumFactor;
      }
      let totalViolation = 0;
      for (const it of unfrozen) {
        const clamped = Math.max(it.minMain, Math.min(it.maxMain, it.target));
        it.violation = clamped - it.target;
        totalViolation += it.violation;
        it.clamped = clamped;
      }
      if (Math.abs(totalViolation) < 0.01) { for (const it of unfrozen) { it.target = it.clamped; it.frozen = true; } break; }
      for (const it of unfrozen) {
        if ((totalViolation > 0 && it.violation > 0) || (totalViolation < 0 && it.violation < 0)) { it.target = it.clamped; it.frozen = true; }
      }
    }
    for (const it of line) it.main = Math.max(it.minMain, Math.min(it.maxMain, it.target));
  }

  // -- grid ---------------------------------------------------------------------------------------

  const trackCache = new Map();
  // Track lists are cached by text; lengths other than plain px (em, vw,
  // calc...) are kept symbolic and resolved against the grid's own style.
  function parseTracks(value, cs) {
    if (!value || value === "none") return [];
    let out;
    if (Array.isArray(value)) out = value.map(parseTrack);
    else if (trackCache.has(value)) out = trackCache.get(value);
    else {
      out = [];
      for (const part of uiCss.splitTop(String(value), " ")) {
        const rep = part.match(/^repeat\((\d+),\s*(.*)\)$/);
        if (rep) { const inner = uiCss.splitTop(rep[2], " "); for (let i = 0; i < +rep[1]; i++) for (const t of inner) out.push(parseTrack(t)); }
        else out.push(parseTrack(part));
      }
      trackCache.set(value, out);
    }
    return out.some(hasLen) ? out.map(t => resolveTrack(t, cs)) : out;
  }
  const hasLen = t => t.kind === "len" || (t.kind === "minmax" && (hasLen(t.min) || hasLen(t.max)));
  function resolveTrack(t, cs) {
    if (t.kind === "len") return { kind: "px", v: (cs ? L(t.raw, null, cs) : uiCss.length(t.raw, null, { vw: 0, vh: 0 })) ?? 0 };
    if (t.kind === "minmax") return { kind: "minmax", min: resolveTrack(t.min, cs), max: resolveTrack(t.max, cs) };
    return t;
  }
  function parseTrack(t) {
    if (typeof t === "number") return { kind: "px", v: t };
    t = String(t).trim();
    if (/fr$/.test(t)) return { kind: "fr", v: parseFloat(t), min: { kind: "auto" } };
    if (t === "auto" || t === "min-content" || t === "max-content") return { kind: "auto" };
    const mm = t.match(/^minmax\((.*)\)$/);
    if (mm) {
      const [a, b] = uiCss.splitTop(mm[1]);
      return { kind: "minmax", min: parseTrack(a), max: parseTrack(b) };
    }
    if (/%$/.test(t)) return { kind: "pct", v: parseFloat(t) };
    if (/^-?[\d.]+(px)?$/.test(t)) return { kind: "px", v: parseFloat(t) };
    return { kind: "len", raw: t };
  }
  function parseLine(v) {
    if (v == null || v === "auto") return null;
    if (typeof v === "number") return { start: v, span: 1 };
    const [a, b] = String(v).split("/").map(s => s.trim());
    const spanA = a.match(/^span\s+(\d+)$/);
    if (spanA) return { start: null, span: +spanA[1] };
    const start = parseInt(a, 10);
    if (b == null) return { start, span: 1 };
    const spanB = b.match(/^span\s+(\d+)$/);
    if (spanB) return { start, span: +spanB[1] };
    const end = parseInt(b, 10);
    return { start, span: end < 0 ? null : Math.max(1, end - start), endNeg: end < 0 ? end : null };
  }
  function placeGrid(node, kids, nCols, nRowsExplicit = 0) {
    const occupied = new Set();
    const out = [];
    let cursorR = 0, cursorC = 0;
    for (const k of kids) {
      const col = parseLine(k.cs.gridColumn), rowL = parseLine(k.cs.gridRow);
      let c0, span = 1, r0, rspan = 1;
      if (col) {
        span = col.span ?? Math.max(1, nCols + 2 + (col.endNeg ?? 0) - (col.start || 1));
        c0 = col.start != null ? (col.start > 0 ? col.start - 1 : nCols + col.start) : null;
      }
      if (rowL) { rspan = rowL.span ?? Math.max(1, (nRowsExplicit || 0) + 2 + (rowL.endNeg ?? 0) - (rowL.start || 1)); r0 = rowL.start != null ? rowL.start - 1 : null; }
      if (c0 == null || r0 == null) {
        // auto placement (row-major, sparse)
        let r = r0 != null ? r0 : cursorR, c = c0 != null ? c0 : (r0 != null ? 0 : cursorC);
        for (let guard = 0; guard < 1000; guard++) {
          if (c + span > nCols) { if (c0 != null) { r++; continue; } c = 0; r++; continue; }
          let free = true;
          for (let rr = r; rr < r + rspan && free; rr++) for (let cc = c; cc < c + span; cc++) if (occupied.has(rr + ":" + cc)) { free = false; break; }
          if (free) break;
          if (c0 != null) r++; else c++;
        }
        c0 = c; r0 = r;
        if (rowL?.start == null) { cursorR = r; cursorC = c + span; }
      }
      for (let rr = r0; rr < r0 + rspan; rr++) for (let cc = c0; cc < c0 + span; cc++) occupied.add(rr + ":" + cc);
      out.push({ node: k, c0, c1: c0 + span, r0, r1: r0 + rspan });
    }
    return out;
  }
  function layoutGrid(node, contentW, contentHDef) {
    const cs = node.cs;
    const kids = (node.kids || []).filter(k => k.cs.display !== "none" && isFlow(k));
    let cols = parseTracks(cs.gridTemplateColumns, cs);
    if (!cols.length) cols = [{ kind: "fr", v: 1, min: { kind: "auto" } }];
    const colGap = L(cs.columnGap, contentW, cs) || 0, rowGap = L(cs.rowGap, contentHDef, cs) || 0;
    const placement = placeGrid(node, kids, cols.length, parseTracks(cs.gridTemplateRows, cs).length);
    for (const p of placement) boxModel(p.node, contentW);
    const nRows = Math.max(0, ...placement.map(p => p.r1));
    // column sizing
    const colSize = new Array(cols.length).fill(0);
    const contrib = (k, which) => (which === "max" ? maxContent(k) : minContent(k)) + num(k.ml) + num(k.mr);
    let fixedSum = 0, frSum = 0;
    const frCols = [];
    cols.forEach((t, i) => {
      if (t.kind === "px") colSize[i] = t.v;
      else if (t.kind === "pct") colSize[i] = t.v / 100 * contentW;
      else if (t.kind === "auto" || (t.kind === "minmax" && t.max.kind !== "fr")) {
        const items = placement.filter(p => p.c0 === i && p.c1 === i + 1);
        let s = Math.max(0, ...items.map(p => contrib(p.node, "max")));
        t._grow = null;
        if (t.kind === "minmax") {
          const mn = t.min.kind === "px" ? t.min.v : t.min.kind === "pct" ? t.min.v / 100 * contentW : 0;
          const mx = t.max.kind === "px" ? t.max.v : t.max.kind === "pct" ? t.max.v / 100 * contentW : Infinity;
          // both limits definite: base = min, grows toward max with free space
          if (t.min.kind !== "auto" && Number.isFinite(mx)) { s = mn; t._grow = Math.max(mn, mx); }
          else s = Math.max(mn, Math.min(mx, s));
        }
        colSize[i] = s;
        t._auto = t._grow == null;
      }
      if (t.kind === "fr" || (t.kind === "minmax" && t.max.kind === "fr")) { frCols.push(i); frSum += t.kind === "fr" ? t.v : t.max.v; }
    });
    for (let i = 0; i < cols.length; i++) if (!frCols.includes(i)) fixedSum += colSize[i];
    const gapsW = colGap * Math.max(0, cols.length - 1);
    // shrink auto tracks toward their min-content when they overflow
    if (!frCols.length && fixedSum + gapsW > contentW) {
      const autos = cols.map((t, i) => t._auto ? i : -1).filter(i => i >= 0);
      let over = fixedSum + gapsW - contentW;
      for (const i of autos) {
        const items = placement.filter(p => p.c0 === i && p.c1 === i + 1);
        const minS = Math.max(0, ...items.map(p => contrib(p.node, "min")));
        const give = Math.min(over, colSize[i] - minS);
        if (give > 0) { colSize[i] -= give; over -= give; }
      }
    }
    // fr minimums: plain Nfr = minmax(auto, Nfr) -> min-content floor
    const frMins = frCols.map(i => {
        const t = cols[i];
        const minT = t.min;
        if (minT.kind === "px") return minT.v;
        if (minT.kind === "pct") return minT.v / 100 * contentW;
        if (minT.kind === "auto") {
          const items = placement.filter(p => p.c0 === i && p.c1 === i + 1);
          return Math.max(0, ...items.map(p => contrib(p.node, "min")));
        }
        return 0;
      });
    // "maximize tracks": definite-limit tracks grow before flexible tracks expand
    {
      let spare = contentW - gapsW - fixedSum - frMins.reduce((a, b) => a + b, 0);
      cols.forEach((t, i) => {
        if (t._grow == null || spare <= 0) return;
        const add = Math.min(spare, t._grow - colSize[i]);
        if (add > 0) { colSize[i] += add; fixedSum += add; spare -= add; }
      });
    }
    if (frCols.length) {
      let free = Math.max(0, contentW - fixedSum - gapsW);
      const mins = frCols.map((i, j) => frMins[j]);
      let active = frCols.map((c, j) => j);
      let remaining = free, frLeft = frSum;
      for (let guard = 0; guard < 5; guard++) {
        const unit = frLeft > 0 ? remaining / frLeft : 0;
        const violators = active.filter(j => { const t = cols[frCols[j]]; return unit * (t.kind === "fr" ? t.v : t.max.v) < mins[j]; });
        if (!violators.length) {
          for (const j of active) { const t = cols[frCols[j]]; colSize[frCols[j]] = unit * (t.kind === "fr" ? t.v : t.max.v); }
          break;
        }
        for (const j of violators) { colSize[frCols[j]] = mins[j]; remaining -= mins[j]; const t = cols[frCols[j]]; frLeft -= t.kind === "fr" ? t.v : t.max.v; }
        active = active.filter(j => !violators.includes(j));
        if (!active.length) break;
      }
    }
    const colX = [];
    { let x = 0; for (let i = 0; i < cols.length; i++) { colX.push(x); x += colSize[i] + colGap; } }
    // rows
    let rowTracks = parseTracks(cs.gridTemplateRows, cs);
    const autoRows = parseTracks(cs.gridAutoRows || "auto", cs);
    const rowCount = Math.max(nRows, rowTracks.length);
    const rows = [];
    for (let r = 0; r < rowCount; r++) rows.push(rowTracks[r] || autoRows[0] || { kind: "auto" });
    const rowSize = new Array(rowCount).fill(0);
    // lay items out at their column widths to get heights
    for (const p of placement) {
      const k = p.node;
      const areaW = colX[p.c1 - 1] + colSize[p.c1 - 1] - colX[p.c0];
      const js = justifyOf(cs, k.cs);
      let w = specW(k, areaW);
      if (w == null) w = js === "stretch" ? areaW - num(k.ml) - num(k.mr) : Math.min(maxContent(k), areaW - num(k.ml) - num(k.mr));
      w = clampW(k, w, areaW);
      const hSpec = specH(k, null);
      layoutBox(k, w, hSpec, areaW, null);
      p.areaW = areaW;
    }
    let rowFixed = 0, rowFr = 0;
    rows.forEach((t, r) => {
      if (t.kind === "px") { rowSize[r] = t.v; rowFixed += t.v; }
      else if (t.kind === "pct") { rowSize[r] = contentHDef != null ? t.v / 100 * contentHDef : 0; rowFixed += rowSize[r]; }
      else if (t.kind === "fr" || (t.kind === "minmax" && t.max.kind === "fr")) rowFr += t.kind === "fr" ? t.v : t.max.v;
      else {
        const items = placement.filter(p => p.r0 === r && p.r1 === r + 1);
        let s = Math.max(0, ...items.map(p => p.node.h + num(p.node.mt) + num(p.node.mb)));
        if (t.kind === "minmax" && t.min.kind === "px") s = Math.max(s, t.min.v);
        if (t.kind === "minmax" && t.max.kind === "px") s = Math.min(s, t.max.v);
        rowSize[r] = s; rowFixed += s;
      }
    });
    // spanning items grow the last spanned auto row
    for (const p of placement) {
      if (p.r1 - p.r0 < 2) continue;
      let crossesFlex = false;
      for (let r = p.r0; r < p.r1; r++) if (rows[r].kind === "fr" || (rows[r].kind === "minmax" && rows[r].max.kind === "fr")) crossesFlex = true;
      if (crossesFlex) continue;
      const need = p.node.h + num(p.node.mt) + num(p.node.mb);
      let have = rowGap * (p.r1 - p.r0 - 1);
      for (let r = p.r0; r < p.r1; r++) have += rowSize[r];
      if (need > have) {
        const autoR = [];
        for (let r = p.r0; r < p.r1; r++) if (rows[r].kind === "auto") autoR.push(r);
        if (autoR.length) { const add = (need - have) / autoR.length; for (const r of autoR) { rowSize[r] += add; rowFixed += add; } }
      }
    }
    const rowGaps = rowGap * Math.max(0, rowCount - 1);
    if (rowFr > 0) {
      const free = contentHDef != null ? Math.max(0, contentHDef - rowFixed - rowGaps) : 0;
      rows.forEach((t, r) => {
        if (t.kind === "fr" || (t.kind === "minmax" && t.max.kind === "fr")) {
          let s = free * (t.kind === "fr" ? t.v : t.max.v) / rowFr;
          if (contentHDef == null || t.kind === "fr") {
            const items = placement.filter(p => p.r0 === r && p.r1 === r + 1);
            const content = Math.max(0, ...items.map(p => p.node.h + num(p.node.mt) + num(p.node.mb)));
            if (t.kind === "fr" && t.min.kind === "auto") s = Math.max(s, content);
            if (contentHDef == null) s = Math.max(s, content);
          }
          rowSize[r] = s;
        }
      });
    }
    // align-content stretch for auto rows when the grid has a definite height
    // (an indefinite height uses a definite min-height instead, CSS Grid §11.8)
    const totalRows = rowSize.reduce((a, b) => a + b, 0) + rowGaps;
    let stretchH = contentHDef;
    if (stretchH == null) {
      const minH = L(cs.minHeight, null, cs);
      if (minH != null) stretchH = cs.boxSizing === "content-box" ? minH : minH - vEdges(node);
    }
    if (stretchH != null && totalRows < stretchH && !rowFr) {
      const ac = cs.alignContent || "normal";
      if (ac === "normal" || ac === "stretch") {
        const autos = rows.map((t, r) => t.kind === "auto" ? r : -1).filter(r => r >= 0);
        if (autos.length) { const add = (stretchH - totalRows) / autos.length; for (const r of autos) rowSize[r] += add; }
      }
    }
    const rowY = [];
    { let y = 0; for (let r = 0; r < rowCount; r++) { rowY.push(y); y += rowSize[r] + rowGap; } }
    let offY = 0;
    const gridH = rowSize.reduce((a, b) => a + b, 0) + rowGaps;
    if (contentHDef != null) {
      const ac = cs.alignContent;
      if (ac === "center") offY = (contentHDef - gridH) / 2; else if (ac === "end" || ac === "flex-end") offY = contentHDef - gridH;
    }
    let offX = 0;
    const gridW = colSize.reduce((a, b) => a + b, 0) + gapsW;
    const jcont = cs.justifyContent;
    if (jcont === "center") offX = (contentW - gridW) / 2; else if (jcont === "end" || jcont === "flex-end") offX = contentW - gridW;
    const originX = node.bl + node.pl, originY = node.bt + node.pt;
    for (const p of placement) {
      const k = p.node;
      const areaH = rowY[p.r1 - 1] + rowSize[p.r1 - 1] - rowY[p.r0];
      const al = alignOf(cs, k.cs);
      const hSpec = specH(k, areaH);
      if (al === "stretch" && hSpec == null && k.mt !== "auto" && k.mb !== "auto") {
        const target = clampH(k, areaH - num(k.mt) - num(k.mb), areaH);
        if (Math.abs(target - k.h) > 0.01 || !k.defH) layoutBox(k, k.w, target, p.areaW, areaH);
      } else if (hSpec != null && Math.abs(hSpec - k.h) > 0.01) layoutBox(k, k.w, clampH(k, hSpec, areaH), p.areaW, areaH);
      else {
        // percentage min/max heights resolve against the grid area
        const clamped = clampH(k, k.h, areaH);
        if (Math.abs(clamped - k.h) > 0.01) layoutBox(k, k.w, clamped, p.areaW, areaH);
      }
      const js = justifyOf(cs, k.cs);
      let x = colX[p.c0] + num(k.ml);
      const freeX = p.areaW - k.w - num(k.ml) - num(k.mr);
      if (k.ml === "auto" && k.mr === "auto") x = colX[p.c0] + freeX / 2;
      else if (js === "center") x += freeX / 2;
      else if (js === "end" || js === "flex-end" || js === "right") x += freeX;
      let y = rowY[p.r0] + num(k.mt);
      const freeY = areaH - k.h - num(k.mt) - num(k.mb);
      if (al === "center") y += freeY / 2;
      else if (al === "end" || al === "flex-end") y += freeY;
      k.x = originX + offX + x;
      k.y = originY + offY + y;
    }
    return Math.max(gridH, 0);
  }
  function justifyOf(cs, kc) {
    const self = kc.justifySelf;
    let a = self && self !== "auto" ? self : (cs.justifyItems || "normal");
    if (a === "normal" || a === "legacy") a = "stretch";
    if (a === "start" || a === "left" || a === "self-start" || a === "flex-start") a = "start";
    return a;
  }

  // -- absolute positioning -----------------------------------------------------------------

  function layoutAbsolute(node) {
    const kids = (node.kids || []).filter(k => k.cs.display !== "none" && (k.cs.position === "absolute" || k.cs.position === "fixed"));
    if (!kids.length) return;
    const cbW = node.w - node.bl - node.br, cbH = node.h - node.bt - node.bb;
    for (const k of kids) {
      const kc = k.cs;
      boxModel(k, cbW);
      const top = L(kc.top, cbH, kc), bottom = L(kc.bottom, cbH, kc), left = L(kc.left, cbW, kc), right = L(kc.right, cbW, kc);
      const mh = num(k.ml) + num(k.mr), mv = num(k.mt) + num(k.mb);
      let w = specW(k, cbW);
      if (w == null) {
        if (left != null && right != null) w = cbW - left - right - mh;
        else {
          const avail = cbW - (left || 0) - (right || 0) - mh;
          w = Math.min(Math.max(minContent(k), avail), maxContent(k));
        }
      }
      w = clampW(k, w, cbW);
      let h = specH(k, cbH);
      if (h == null && top != null && bottom != null) h = cbH - top - bottom - mv;
      if (h != null) h = clampH(k, h, cbH);
      layoutBox(k, w, h, cbW, cbH);
      let x, y;
      if (left != null && right != null && k.ml === "auto" && k.mr === "auto") x = left + (cbW - left - right - w) / 2;
      else if (left != null) x = left + num(k.ml);
      else if (right != null) x = cbW - right - num(k.mr) - w;
      else x = node.pl + num(k.ml);
      if (top != null && bottom != null && k.mt === "auto" && k.mb === "auto") y = top + (cbH - top - bottom - k.h) / 2;
      else if (top != null) y = top + num(k.mt);
      else if (bottom != null) y = cbH - bottom - num(k.mb) - k.h;
      else y = node.pt + num(k.mt);
      k.x = node.bl + x;
      k.y = node.bt + y;
    }
  }

  // -- entry ------------------------------------------------------------------------------------

  // Lays out a root layer against the viewport. The root acts as the initial
  // containing block: absolute/fixed children resolve against it.
  let curEnv = null;
  function layoutRoot(root, env) {
    curEnv = env;
    const sig = [env.vw, env.vh, env.fine, env.hover, env.reducedMotion, env.standalone, env.immersive].join("|");
    const fullSig = sig + "|" + JSON.stringify(env.vars || null) + "|" + JSON.stringify(env.safe || null);
    if (fullSig !== cacheSig) { rawCache.clear(); csCache.clear(); blockCache.clear(); cacheSig = fullSig; }
    prepare(root, null, env);
    clearIntrinsic(root);
    boxModel(root, env.vw);
    const cs = root.cs;
    const w = specW(root, env.vw) ?? env.vw;
    const h = specH(root, env.vh) ?? env.vh;
    layoutBox(root, w, h, env.vw, env.vh);
    const left = L(cs.left, env.vw, cs), top = L(cs.top, env.vh, cs);
    root.x = left || 0; root.y = top || 0;
    return root;
  }
  function clearIntrinsic(n) {
    n._maxC = undefined; n._minC = undefined;
    for (const k of n.kids || []) clearIntrinsic(k);
  }

  return { layoutRoot, prepare, computeStyle, parseTracks, isScroll, INHERITED, registerStyles };
})();

export { uiLayout };
