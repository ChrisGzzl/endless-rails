"use strict";
// CSS value parsing for the canvas UI kit. Screens describe their styles with
// the same value syntax the old stylesheets used (lengths with px/%/vw/vh/em,
// calc/min/max/clamp, gradients, shadow lists, transforms, clip-path polygons,
// media queries), so a rule can be carried over from CSS without translating
// it by hand. Everything here is pure string/number work: no DOM, no canvas.
//
// Module-graph note: tests and the mini-game packer evaluate every module in
// one shared scope, so this file keeps its internals inside one closure and
// only the uniquely named `uiCss` object reaches the top level.

const uiCss = (() => {
  // -- tokenising helpers ------------------------------------------------------

  // Splits on a separator that is not nested inside parentheses or quotes.
  function splitTop(str, sep = ",") {
    const out = [];
    let depth = 0, quote = "", start = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (quote) { if (ch === quote) quote = ""; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (depth === 0 && (sep === " " ? /\s/.test(ch) : ch === sep)) {
        const part = str.slice(start, i).trim();
        if (part || sep !== " ") out.push(part);
        start = i + 1;
      }
    }
    const last = str.slice(start).trim();
    if (last || sep !== " ") out.push(last);
    return sep === " " ? out.filter(Boolean) : out;
  }

  // -- colours -------------------------------------------------------------------

  const NAMED = {
    transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1],
    red: [255, 0, 0, 1], currentcolor: null,
  };
  const colorCache = new Map();
  function parseColor(str) {
    if (str == null) return null;
    const key = String(str).trim().toLowerCase();
    if (colorCache.has(key)) return colorCache.get(key);
    let out = null;
    if (key in NAMED) out = NAMED[key];
    else if (key[0] === "#") {
      const h = key.slice(1);
      const x = n => parseInt(n, 16);
      if (h.length === 3 || h.length === 4) out = [x(h[0] + h[0]), x(h[1] + h[1]), x(h[2] + h[2]), h.length === 4 ? x(h[3] + h[3]) / 255 : 1];
      else if (h.length === 6 || h.length === 8) out = [x(h.slice(0, 2)), x(h.slice(2, 4)), x(h.slice(4, 6)), h.length === 8 ? x(h.slice(6, 8)) / 255 : 1];
    } else {
      const m = key.match(/^rgba?\(([^)]*)\)$/);
      if (m) {
        const parts = m[1].split(/[\s,/]+/).filter(Boolean);
        const n = (p, i) => p.endsWith("%") ? (i < 3 ? parseFloat(p) * 2.55 : parseFloat(p) / 100) : parseFloat(p);
        out = [n(parts[0], 0), n(parts[1], 1), n(parts[2], 2), parts[3] !== undefined ? n(parts[3], 3) : 1];
      }
    }
    colorCache.set(key, out);
    return out;
  }
  function rgba(c) { return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+c[3].toFixed(4)})`; }
  function withAlpha(str, alpha) {
    const c = parseColor(str);
    if (!c) return str;
    return rgba([c[0], c[1], c[2], c[3] * alpha]);
  }

  // -- lengths and math functions ----------------------------------------------

  // Evaluates a CSS length expression. `basis` resolves percentages (null means
  // the percentage is not resolvable, which yields null like "auto" would).
  // ctx carries vw/vh (viewport CSS px), em (element font size) and rem.
  function length(value, basis, ctx) {
    if (value === undefined || value === null || value === "auto" || value === "none" || value === "") return null;
    if (typeof value === "number") return value;
    let str = String(value).trim();
    if (str.includes("var(")) str = substituteVars(str, ctx);
    if (str.includes("env(")) str = str.replace(/env\(\s*safe-area-inset-(top|right|bottom|left)\s*(?:,\s*([^)]*))?\)/g, (m, side, fb) => ((ctx && ctx.safe && ctx.safe[side]) || (fb ? parseFloat(fb) || 0 : 0)) + "px");
    if (/^-?[\d.]+(px)?$/.test(str)) return parseFloat(str);
    if (/^-?[\d.]+%$/.test(str)) return basis == null ? null : parseFloat(str) / 100 * basis;
    if (/^[a-z-]+$/.test(str)) return null; // keywords (max-content, fit-content...) are not lengths
    try {
      let tokens = tokenCache.get(str);
      if (tokens === undefined) {
        try { tokens = tokenize(str); } catch { tokens = null; }
        if (tokenCache.size > 5000) tokenCache.clear();
        tokenCache.set(str, tokens);
      }
      if (!tokens) return null;
      const state = { tokens, i: 0, basis, ctx, unresolved: false };
      const v = parseSum(state);
      return state.unresolved ? null : v;
    } catch (error) {
      return null;
    }
  }
  const tokenCache = new Map();
  function substituteVars(str, ctx) {
    let guard = 0;
    while (str.includes("var(") && guard++ < 8) {
      str = str.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/, (m, name, fb) => {
        const v = ctx && ctx.vars && ctx.vars[name];
        return v != null ? String(v) : fb != null ? fb.trim() : "0px";
      });
    }
    return str;
  }
  function tokenize(str) {
    const out = [];
    const re = /\s*(?:(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)(px|%|vw|vh|dvh|svh|lvh|vmin|vmax|em|rem)?|([a-z-]+)\(|([()+*/,-]))/gy;
    let m;
    re.lastIndex = 0;
    while (re.lastIndex < str.length) {
      const at = re.lastIndex;
      m = re.exec(str);
      if (!m) {
        if (/^\s*$/.test(str.slice(at))) break;
        throw new Error("bad css expr " + str);
      }
      if (m[1] !== undefined) out.push({ t: "num", v: parseFloat(m[1]), u: m[2] || "" });
      else if (m[3]) out.push({ t: "fn", v: m[3] });
      else out.push({ t: "op", v: m[4] });
    }
    return out;
  }
  function unitValue(tok, st) {
    const { ctx } = st;
    switch (tok.u) {
      case "": case "px": return tok.v;
      case "%": if (st.basis == null) { st.unresolved = true; return 0; } return tok.v / 100 * st.basis;
      case "vw": return tok.v / 100 * ctx.vw;
      case "vh": case "dvh": case "svh": case "lvh": return tok.v / 100 * ctx.vh;
      case "vmin": return tok.v / 100 * Math.min(ctx.vw, ctx.vh);
      case "vmax": return tok.v / 100 * Math.max(ctx.vw, ctx.vh);
      case "em": return tok.v * (ctx.em || 16);
      case "rem": return tok.v * (ctx.rem || 16);
    }
    return tok.v;
  }
  function parseSum(st) {
    let v = parseProduct(st);
    while (st.i < st.tokens.length) {
      const t = st.tokens[st.i];
      if (t.t === "op" && (t.v === "+" || t.v === "-")) { st.i++; const r = parseProduct(st); v = t.v === "+" ? v + r : v - r; }
      else if (t.t === "num" && t.v < 0 && st.tokens[st.i - 1]?.t !== "op") {
        // "a -b" tokenised as a negative literal.
        st.i++; v = v + unitValue(t, st);
      } else break;
    }
    return v;
  }
  function parseProduct(st) {
    let v = parseAtom(st);
    while (st.i < st.tokens.length) {
      const t = st.tokens[st.i];
      if (t.t === "op" && (t.v === "*" || t.v === "/")) { st.i++; const r = parseAtom(st); v = t.v === "*" ? v * r : v / r; }
      else break;
    }
    return v;
  }
  function parseAtom(st) {
    const t = st.tokens[st.i++];
    if (!t) throw new Error("eof");
    if (t.t === "num") return unitValue(t, st);
    if (t.t === "op" && t.v === "(") { const v = parseSum(st); expect(st, ")"); return v; }
    if (t.t === "op" && t.v === "-") return -parseAtom(st);
    if (t.t === "fn") {
      const args = [];
      if (st.tokens[st.i]?.v !== ")") {
        args.push(parseSum(st));
        while (st.tokens[st.i]?.v === ",") { st.i++; args.push(parseSum(st)); }
      }
      expect(st, ")");
      switch (t.v) {
        case "calc": return args[0];
        case "min": return Math.min(...args);
        case "max": return Math.max(...args);
        case "clamp": return Math.max(args[0], Math.min(args[1], args[2]));
      }
      throw new Error("fn " + t.v);
    }
    throw new Error("unexpected " + t.v);
  }
  function expect(st, v) { const t = st.tokens[st.i++]; if (!t || t.v !== v) throw new Error("expected " + v); }

  // Box shorthand: "4px 8px" -> [top, right, bottom, left] raw values.
  function box4(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === "number") return [value, value, value, value];
    if (Array.isArray(value)) {
      const a = value;
      if (a.length === 1) return [a[0], a[0], a[0], a[0]];
      if (a.length === 2) return [a[0], a[1], a[0], a[1]];
      if (a.length === 3) return [a[0], a[1], a[2], a[1]];
      return a;
    }
    return box4(splitTop(String(value), " "));
  }

  // -- gradients -----------------------------------------------------------------

  const gradientCache = new Map();
  function parseImageLayers(value) {
    if (!value || value === "none") return [];
    if (Array.isArray(value)) return value.flatMap(v => typeof v === "string" ? parseImageLayers(v) : [v]);
    if (gradientCache.has(value)) return gradientCache.get(value);
    const layers = splitTop(value).map(parseImage).filter(Boolean);
    gradientCache.set(value, layers);
    return layers;
  }
  function parseImage(str) {
    str = str.trim();
    let m = str.match(/^url\((['"]?)(.*?)\1\)$/);
    if (m) return { type: "url", url: m[2] };
    m = str.match(/^(repeating-)?(linear|radial)-gradient\((.*)\)$/s);
    if (!m) return null;
    const args = splitTop(m[3]);
    if (m[2] === "linear") {
      let angle = Math.PI; // "to bottom"
      let first = args[0].trim();
      if (/^-?[\d.]+(deg|rad|turn)$/.test(first)) {
        const v = parseFloat(first);
        angle = first.endsWith("rad") ? v : first.endsWith("turn") ? v * Math.PI * 2 : v * Math.PI / 180;
        args.shift();
      } else if (first.startsWith("to ")) {
        const dirs = first.slice(3).split(/\s+/);
        angle = { "top": 0, "right": Math.PI / 2, "bottom": Math.PI, "left": Math.PI * 1.5 }[dirs[0]];
        if (dirs.length === 2) angle = { "top right": "tr", "right top": "tr", "bottom right": "br", "right bottom": "br", "bottom left": "bl", "left bottom": "bl", "top left": "tl", "left top": "tl" }[dirs.join(" ")];
        args.shift();
      }
      return { type: "linear", angle, stops: parseStops(args) };
    }
    // radial: [shape] [size] [at position]
    let shape = "ellipse", size = "farthest-corner", at = ["50%", "50%"];
    const head = args[0].trim();
    if (!/^(#|rgb|hsl|transparent|[a-z]+\s*$)/.test(head) || /\bat\b|circle|ellipse|closest|farthest/.test(head)) {
      if (/\bat\b|circle|ellipse|closest|farthest|^\d/.test(head)) {
        args.shift();
        const [before, after] = head.split(/\bat\b/);
        const words = splitTop(before.trim(), " ");
        for (const w of words) {
          if (w === "circle" || w === "ellipse") shape = w;
          else if (/closest|farthest/.test(w)) size = w;
          else if (w) size = size === "farthest-corner" ? [w] : [...(Array.isArray(size) ? size : []), w];
        }
        if (after) {
          const p = splitTop(after.trim(), " ");
          at = [kw(p[0], "x"), kw(p[1] ?? "center", "y")];
        }
      }
    }
    return { type: "radial", shape, size, at, stops: parseStops(args) };
  }
  function kw(v, axis) {
    return { left: "0%", right: "100%", top: "0%", bottom: "100%", center: "50%" }[v] ?? v;
  }
  function parseStops(args) {
    const stops = [];
    for (const raw of args) {
      const parts = splitTop(raw.trim(), " ");
      const color = parts[0];
      const positions = parts.slice(1);
      if (!positions.length) stops.push({ color, pos: null });
      else for (const p of positions) stops.push({ color, pos: p });
    }
    return stops;
  }
  // Resolves stop positions (px or %) along a gradient line of `len` px and
  // fills in the implicit ones. CSS interpolates in premultiplied space, so a
  // transparent stop borrows its neighbour's hue to avoid the grey fringe the
  // canvas' straight-alpha interpolation would otherwise produce.
  function resolveStops(stops, len, ctx) {
    const out = stops.map(s => ({ color: s.color, at: s.pos == null ? null : length(s.pos, len, ctx) / (len || 1) }));
    if (out.length && out[0].at == null) out[0].at = 0;
    if (out.length && out[out.length - 1].at == null) out[out.length - 1].at = 1;
    let maxSoFar = 0;
    for (const s of out) { if (s.at != null) { s.at = Math.max(s.at, maxSoFar); maxSoFar = s.at; } }
    for (let i = 0; i < out.length; i++) {
      if (out[i].at != null) continue;
      let j = i; while (out[j].at == null) j++;
      const a = out[i - 1].at, b = out[j].at;
      for (let k = i; k < j; k++) out[k].at = a + (b - a) * (k - i + 1) / (j - i + 1);
      i = j;
    }
    for (let i = 0; i < out.length; i++) {
      const c = parseColor(out[i].color);
      if (c && c[3] === 0) {
        const n = parseColor(out[i + 1]?.color) || parseColor(out[i - 1]?.color);
        if (n) out[i].color = rgba([n[0], n[1], n[2], 0]);
      }
    }
    return out;
  }

  // -- shadows ---------------------------------------------------------------------

  const shadowCache = new Map();
  function parseShadows(value) {
    if (!value || value === "none") return [];
    if (shadowCache.has(value)) return shadowCache.get(value);
    const list = splitTop(value).map(part => {
      const words = splitTop(part, " ");
      const shadow = { inset: false, x: 0, y: 0, blur: 0, spread: 0, color: "rgba(0,0,0,1)" };
      const nums = [];
      for (const w of words) {
        if (w === "inset") shadow.inset = true;
        else if (/^-?[\d.]+(px)?$/.test(w)) nums.push(parseFloat(w));
        else shadow.color = w;
      }
      [shadow.x = 0, shadow.y = 0, shadow.blur = 0, shadow.spread = 0] = nums;
      return shadow;
    });
    shadowCache.set(value, list);
    return list;
  }

  // -- transforms ---------------------------------------------------------------------

  const transformCache = new Map();
  function parseTransform(value) {
    if (!value || value === "none") return [];
    if (transformCache.has(value)) return transformCache.get(value);
    const ops = [];
    const re = /([a-zA-Z0-9]+)\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(value))) ops.push({ fn: m[1], args: splitTop(m[2]).map(s => s.trim()) });
    transformCache.set(value, ops);
    return ops;
  }
  function angle(v) {
    const n = parseFloat(v);
    if (String(v).endsWith("rad")) return n;
    if (String(v).endsWith("turn")) return n * Math.PI * 2;
    return n * Math.PI / 180;
  }
  // Returns a 2D matrix [a,b,c,d,e,f] for the transform list on a w x h box.
  function transformMatrix(value, w, h, ctx) {
    const ops = parseTransform(value);
    let M = [1, 0, 0, 1, 0, 0];
    const mul = (A, B) => [
      A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
      A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
    ];
    for (const { fn, args } of ops) {
      let T = null;
      if (fn === "translate") T = [1, 0, 0, 1, length(args[0], w, ctx) || 0, length(args[1] ?? 0, h, ctx) || 0];
      else if (fn === "translateX") T = [1, 0, 0, 1, length(args[0], w, ctx) || 0, 0];
      else if (fn === "translateY") T = [1, 0, 0, 1, 0, length(args[0], h, ctx) || 0];
      else if (fn === "scale") { const sx = parseFloat(args[0]), sy = args[1] !== undefined ? parseFloat(args[1]) : sx; T = [sx, 0, 0, sy, 0, 0]; }
      else if (fn === "scaleX") T = [parseFloat(args[0]), 0, 0, 1, 0, 0];
      else if (fn === "scaleY") T = [1, 0, 0, parseFloat(args[0]), 0, 0];
      else if (fn === "rotate") { const a = angle(args[0]); T = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]; }
      else if (fn === "skewX") T = [1, 0, Math.tan(angle(args[0])), 1, 0, 0];
      else if (fn === "skewY") T = [1, Math.tan(angle(args[0])), 0, 1, 0, 0];
      else if (fn === "matrix") T = args.map(parseFloat);
      if (T) M = mul(M, T);
    }
    return M;
  }

  // -- clip-path polygons --------------------------------------------------------------

  const clipCache = new Map();
  function parseClipPath(value) {
    if (!value || value === "none") return null;
    if (clipCache.has(value)) return clipCache.get(value);
    const m = String(value).match(/^polygon\((.*)\)$/s);
    const out = m ? splitTop(m[1]).map(pair => splitTop(pair.trim(), " ")) : null;
    clipCache.set(value, out);
    return out;
  }

  // -- backgrounds ----------------------------------------------------------------------

  // background-size for one layer -> [w, h] in px given the painting area and
  // the image's intrinsic size.
  function backgroundSize(value, areaW, areaH, imgW, imgH, ctx) {
    const v = (value || "auto").trim();
    if (v === "cover" || v === "contain") {
      const s = v === "cover" ? Math.max(areaW / imgW, areaH / imgH) : Math.min(areaW / imgW, areaH / imgH);
      return [imgW * s, imgH * s];
    }
    const [a, b = "auto"] = splitTop(v, " ");
    let w = a === "auto" ? null : length(a, areaW, ctx);
    let h = b === "auto" ? null : length(b, areaH, ctx);
    if (w == null && h == null) { w = imgW; h = imgH; }
    else if (w == null) w = imgW * h / imgH;
    else if (h == null) h = imgH * w / imgW;
    return [w, h];
  }
  function backgroundPosition(value, areaW, areaH, w, h, ctx) {
    const parts = splitTop((value || "0% 0%").trim(), " ").map(p => kw(p));
    const [px, py = "50%"] = parts.length === 1 ? [parts[0], "50%"] : parts;
    const pos = (p, free) => /%$/.test(p) ? parseFloat(p) / 100 * free : length(p, free, ctx) || 0;
    return [pos(px, areaW - w), pos(py, areaH - h)];
  }

  // -- media queries ------------------------------------------------------------------------

  const mediaCache = new Map();
  function mediaMatches(query, env) {
    const key = query + "|" + env.vw + "|" + env.vh + "|" + env.fine + "|" + env.hover + "|" + env.reducedMotion + "|" + env.standalone + "|" + env.immersive;
    if (mediaCache.has(key)) return mediaCache.get(key);
    if (mediaCache.size > 4000) mediaCache.clear();
    const q = query.replace(/^@media\s*/, "").trim();
    if (q === "@all" || q === "all" || q === "") { mediaCache.set(key, true); return true; }
    const result = splitTop(q).some(alt => alt.split(/\)\s*and\s*\(/).every(raw => {
      const cond = raw.replace(/[()]/g, "").trim();
      const [name, rawValue] = cond.split(":").map(s => s && s.trim());
      const num = rawValue !== undefined ? parseFloat(rawValue) : 0;
      switch (name) {
        case "max-width": return env.vw <= num;
        case "min-width": return env.vw >= num;
        case "max-height": return env.vh <= num;
        case "min-height": return env.vh >= num;
        case "orientation": return rawValue === "landscape" ? env.vw > env.vh : env.vw <= env.vh;
        case "pointer": return rawValue === "fine" ? env.fine : !env.fine;
        case "hover": return rawValue === "hover" ? env.hover : !env.hover;
        case "prefers-reduced-motion": return rawValue === "reduce" ? env.reducedMotion : !env.reducedMotion;
        case "display-mode": return rawValue === "standalone" ? !!env.standalone : rawValue === "fullscreen" ? !!env.fullscreen : false;
        case "immersive": return !!env.immersive;
      }
      return false;
    }));
    mediaCache.set(key, result);
    return result;
  }

  return {
    splitTop, parseColor, rgba, withAlpha, length, box4, substituteVars,
    parseImageLayers, resolveStops, parseShadows, transformMatrix, parseClipPath,
    backgroundSize, backgroundPosition, mediaMatches,
  };
})();

export { uiCss };
