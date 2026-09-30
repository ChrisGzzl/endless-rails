"use strict";
// Text measurement, line breaking and drawing for the canvas UI kit.
// Line breaking follows the parts of CSS/UAX#14 the interface copy relies on:
// CJK breaks between ideographs with kinsoku (no line may start with closing
// punctuation or end with opening punctuation), Latin words break at spaces
// and after hyphens, white-space normal/nowrap/pre-line/pre-wrap, and
// overflow-wrap:anywhere for long unbreakable runs.

const uiText = (() => {
  let measureCtx = null;
  const widthCache = new Map();
  const metricCache = new Map();
  let letterSpacingSupported = null;

  function setMeasureContext(ctx) { measureCtx = ctx; }

  function fontString(st) {
    const size = Math.max(0, st.fontSize || 16);
    return `${st.fontStyle === "italic" ? "italic " : ""}${st.fontWeight || 400} ${size}px ${st.fontFamily || "sans-serif"}`;
  }

  function rawWidth(font, str) {
    if (!str) return 0;
    const key = font + "\u0000" + str;
    let w = widthCache.get(key);
    if (w === undefined) {
      if (!measureCtx) return str.length * (parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1]) || 16) * 0.6;
      if (measureCtx.font !== font) measureCtx.font = font;
      if (measureCtx.letterSpacing && measureCtx.letterSpacing !== "0px") measureCtx.letterSpacing = "0px";
      w = measureCtx.measureText(str).width || 0;
      if (widthCache.size > 20000) widthCache.clear();
      widthCache.set(key, w);
    }
    return w;
  }
  function countChars(str) { let n = 0; for (const _ of str) n++; return n; }
  function width(st, str) {
    if (st.fontSize === 0) return 0; // "font-size: 0" hides text (canvas would keep the previous font)
    const ls = st.letterSpacing || 0;
    return rawWidth(fontString(st), str) + (ls ? ls * countChars(str) : 0);
  }

  // Ascent/descent of the first available font, i.e. what CSS uses for the
  // half-leading model and for line-height: normal.
  function metrics(st) {
    if (st.fontSize === 0) return { ascent: 0, descent: 0 };
    const font = fontString(st);
    let m = metricCache.get(font);
    if (!m) {
      const size = st.fontSize || 16;
      let ascent = size * 0.88, descent = size * 0.24;
      if (measureCtx) {
        if (measureCtx.font !== font) measureCtx.font = font;
        const tm = measureCtx.measureText("中Hg");
        if (tm && tm.fontBoundingBoxAscent !== undefined) { ascent = tm.fontBoundingBoxAscent; descent = tm.fontBoundingBoxDescent; }
      }
      m = { ascent, descent };
      metricCache.set(font, m);
    }
    return m;
  }
  function lineHeightOf(st) {
    if (st.lineHeight === "normal" || st.lineHeight == null) { const m = metrics(st); return m.ascent + m.descent; }
    return st.lineHeight;
  }

  // CSS line-height:normal grows an inline box to fit every font actually
  // used by its glyphs. When the primary font of the stack has no CJK glyphs
  // (Android / Linux: system-ui resolves to a Latin face), Chinese text falls
  // back to a CJK face with taller metrics. Canvas only reports the primary
  // font's metrics, so probe for the fallback face once per font string.
  const CJK_FAMILIES = ["Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Source Han Sans CN", "Hiragino Sans GB", "Heiti SC", "WenQuanYi Micro Hei", "Droid Sans Fallback", "Noto Sans CJK JP", "SimHei", "SimSun"];
  const fallbackCache = new Map();
  const HAS_CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/;
  function cjkFallbackMetrics(st) {
    const font = fontString(st);
    if (fallbackCache.has(font)) return fallbackCache.get(font);
    let result = null;
    if (measureCtx && measureCtx.measureText("中").fontBoundingBoxAscent !== undefined) {
      const size = st.fontSize || 16;
      const prefix = `${st.fontStyle === "italic" ? "italic " : ""}${st.fontWeight || 400} ${size}px `;
      const w = f => { measureCtx.font = f; return measureCtx.measureText("中国永").width; };
      const wl = f => { measureCtx.font = f; return measureCtx.measureText("Hgix01").width; };
      const full = w(font);
      const primary = metrics(st);
      const mono = wl(prefix + "monospace"), serif = wl(prefix + "serif");
      for (const fam of CJK_FAMILIES) {
        const probe = prefix + `"${fam}", monospace`, probe2 = prefix + `"${fam}", serif`;
        // unavailable families fall straight through to the generic face
        if (Math.abs(wl(probe) - mono) < 0.01 && Math.abs(wl(probe2) - serif) < 0.01) continue;
        if (Math.abs(w(probe) - full) > full * 0.04) continue;
        measureCtx.font = probe;
        const tm = measureCtx.measureText("中Hg");
        const m = { ascent: tm.fontBoundingBoxAscent, descent: tm.fontBoundingBoxDescent };
        if (Math.abs(m.ascent - primary.ascent) > 0.3 || Math.abs(m.descent - primary.descent) > 0.3) result = m;
        break;
      }
    }
    fallbackCache.set(font, result);
    return result;
  }
  // Ascent/descent of an inline text box with line-height: normal.
  function normalBox(st, text) {
    const m = metrics(st);
    if (!text || !HAS_CJK.test(text)) return m;
    const f = cjkFallbackMetrics(st);
    if (!f) return m;
    return { ascent: Math.max(m.ascent, f.ascent), descent: Math.max(m.descent, f.descent) };
  }

  // -- break classes --------------------------------------------------------------
  const CLOSE = new Set("，。、；：！？）」』】》〉〕”’…‥·．，,.!?;:)]}%％‰‐–—ー々〻ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ〜~・".split(""));
  const OPEN = new Set("（「『【《〈〔“‘([{¥$￥＄#＃".split(""));
  function isCJK(cp) {
    return (cp >= 0x2E80 && cp <= 0x9FFF) || (cp >= 0xAC00 && cp <= 0xD7AF) || (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE30 && cp <= 0xFE4F) || (cp >= 0xFF00 && cp <= 0xFFEF) || (cp >= 0x20000 && cp <= 0x2FA1F) ||
      (cp >= 0x3000 && cp <= 0x303F);
  }
  const SPACE = /[ \t\n\f\r]/;

  // Splits a string into unbreakable pieces. Each piece: {text, space} where
  // space is trailing collapsible whitespace (a break opportunity follows).
  // `hardBreak` pieces force a new line (pre-line / pre-wrap newlines).
  function pieces(str, whiteSpace) {
    const preserveNewlines = whiteSpace === "pre-line" || whiteSpace === "pre-wrap" || whiteSpace === "pre";
    const preserveSpaces = whiteSpace === "pre-wrap" || whiteSpace === "pre";
    let s = String(str);
    if (!preserveSpaces) s = preserveNewlines ? s.replace(/[ \t\f\r]+/g, " ").replace(/ ?\n ?/g, "\n") : s.replace(/[ \t\n\f\r]+/g, " ");
    const out = [];
    let cur = "";
    const chars = [...s];
    const push = (space = "") => { if (cur || space) out.push({ text: cur, space }); cur = ""; };
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === "\n" && preserveNewlines) { push(); out.push({ text: "", space: "", hard: true }); continue; }
      if (SPACE.test(ch)) {
        if (preserveSpaces) { cur += ch; push(); continue; }
        // collapse into the current piece's trailing space
        if (out.length && !cur && out[out.length - 1].space && !out[out.length - 1].hard) continue;
        push(" ");
        continue;
      }
      const cp = ch.codePointAt(0);
      const next = chars[i + 1];
      const nextCp = next ? next.codePointAt(0) : 0;
      cur += ch;
      if (!next) break;
      if (SPACE.test(next)) continue;
      // Opening punctuation glues to what follows.
      if (OPEN.has(ch)) continue;
      // Closing punctuation never starts a line.
      if (CLOSE.has(next)) continue;
      const cjkHere = isCJK(cp) && !OPEN.has(ch);
      const cjkNext = isCJK(nextCp) && !CLOSE.has(next);
      if (cjkHere || cjkNext) { push(); continue; }
      // Latin: break after a hyphen that precedes a letter or digit.
      if (ch === "-" && /[A-Za-z0-9]/.test(next) && cur.length > 1) { push(); continue; }
    }
    push();
    return out;
  }

  // Lays one run list out into lines. runs: [{text, st, ref}] where st is the
  // computed inline style. atoms (inline boxes): [{box:true, w, h, st, ref}].
  // Returns {lines:[{w, items:[{x, w, text, st, ref, box}]}], maxW, minW}.
  function breakLines(runs, maxWidth, whiteSpace, overflowWrap) {
    const items = [];
    for (const run of runs) {
      if (run.box) { items.push({ box: run, w: run.w, space: 0, spaceText: "", ref: run.ref, st: run.st, breakAfter: true }); continue; }
      const st = run.st;
      const ws = st.whiteSpace || whiteSpace;
      const txt = st.textTransform === "uppercase" ? String(run.text).toUpperCase() : String(run.text);
      for (const p of pieces(txt, ws)) {
        if (p.hard) { items.push({ hard: true, w: 0, space: 0, text: "", st, ref: run.ref }); continue; }
        items.push({ text: p.text, w: width(st, p.text), space: p.space ? width(st, p.space) : 0, spaceText: p.space, st, ref: run.ref, breakAfter: !!p.space });
      }
    }
    // Pieces from different runs without whitespace between them do not
    // create a break opportunity unless the characters allow it (CJK).
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i], b = items[i + 1];
      if (a.hard || b.hard || a.box || b.box) { a.breakAfter = true; continue; }
      if (a.space) continue;
      if (!a.text || !b.text) { a.breakAfter = true; continue; }
      const last = [...a.text].pop(), first = [...b.text][0];
      const lcp = last.codePointAt(0), fcp = first.codePointAt(0);
      a.breakAfter = !OPEN.has(last) && !CLOSE.has(first) && ((isCJK(lcp) && !OPEN.has(last)) || (isCJK(fcp) && !CLOSE.has(first)));
    }
    const nowrap = whiteSpace === "nowrap" || whiteSpace === "pre";
    const lines = [];
    let line = { items: [], w: 0 };
    // group items into unbreakable clusters
    const clusters = [];
    let cl = [];
    for (const it of items) {
      cl.push(it);
      if (it.hard || it.breakAfter || it === items[items.length - 1]) { clusters.push(cl); cl = []; }
    }
    if (cl.length) clusters.push(cl);
    const clusterW = c => c.reduce((s, it, i) => s + it.w + (i < c.length - 1 ? it.space : 0), 0);
    const finishLine = () => {
      // trailing collapsible space hangs
      const lastItem = line.items[line.items.length - 1];
      if (lastItem && lastItem.space && whiteSpace !== "pre-wrap") { line.w -= lastItem.space; lastItem.trailingHidden = true; }
      lines.push(line); line = { items: [], w: 0 };
    };
    for (const c of clusters) {
      if (c.length === 1 && c[0].hard) { finishLine(); continue; }
      const cw = clusterW(c);
      if (!nowrap && line.items.length && line.w + cw > maxWidth + 0.01) finishLine();
      if (!nowrap && !line.items.length && cw > maxWidth + 0.01 && (overflowWrap === "anywhere" || overflowWrap === "break-word")) {
        // split the cluster by characters
        for (const it of c) {
          if (it.box) { placeItem(line, it); continue; }
          for (const ch of it.text) {
            const w = width(it.st, ch);
            if (line.items.length && line.w + w > maxWidth + 0.01) finishLine();
            placeItem(line, { ...it, text: ch, w, space: 0 });
          }
          if (it.space) { const last = line.items[line.items.length - 1]; last.space = it.space; last.spaceText = it.spaceText; line.w += it.space; }
        }
        continue;
      }
      for (const it of c) placeItem(line, it);
    }
    if (line.items.length || !lines.length) finishLine();
    return lines;
  }
  function placeItem(line, it) {
    const x = line.w;
    line.items.push({ ...it, x });
    line.w += it.w + it.space;
  }

  // Intrinsic widths of a run list: max-content (no wrapping except forced
  // breaks) and min-content (widest unbreakable cluster).
  function intrinsic(runs, whiteSpace) {
    const maxLines = breakLines(runs, Infinity, whiteSpace);
    const maxW = Math.max(0, ...maxLines.map(l => l.w));
    if (whiteSpace === "nowrap" || whiteSpace === "pre") return { max: maxW, min: maxW };
    const minLines = breakLines(runs, 0, whiteSpace);
    const minW = Math.max(0, ...minLines.map(l => l.w));
    return { max: maxW, min: minW };
  }

  function supportsLetterSpacing(ctx) {
    if (letterSpacingSupported === null) letterSpacingSupported = ctx && typeof ctx.letterSpacing === "string";
    return letterSpacingSupported;
  }

  // Draws text with the style's font, color, letter-spacing and shadow. The
  // caller has already applied the device transform; shadows use device px.
  function draw(ctx, str, x, baseline, st, dpr = 1) {
    if (!str || st.fontSize === 0) return;
    const font = fontString(st);
    if (ctx.font !== font) ctx.font = font;
    ctx.fillStyle = st.color || "#000";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const ls = st.letterSpacing || 0;
    const text = st.textTransform === "uppercase" ? str.toUpperCase() : str;
    const shadows = st._textShadows;
    const paint = () => {
      if (!ls) { ctx.fillText(text, x, baseline); return; }
      if (supportsLetterSpacing(ctx)) {
        ctx.letterSpacing = ls + "px";
        ctx.fillText(text, x, baseline);
        ctx.letterSpacing = "0px";
        return;
      }
      let cx = x;
      for (const ch of text) { ctx.fillText(ch, cx, baseline); cx += rawWidth(font, ch) + ls; }
    };
    if (shadows && shadows.length) {
      for (let i = shadows.length - 1; i >= 0; i--) {
        const s = shadows[i];
        ctx.save();
        ctx.shadowColor = s.color; ctx.shadowBlur = s.blur * dpr; ctx.shadowOffsetX = s.x * dpr; ctx.shadowOffsetY = s.y * dpr;
        paint();
        ctx.restore();
      }
      // the last shadow pass already painted the glyphs on top
      return;
    }
    paint();
  }

  // Truncates a single line to fit with an ellipsis.
  function ellipsize(st, str, maxW) {
    if (width(st, str) <= maxW) return str;
    const chars = [...str];
    const dots = "…", dw = width(st, dots);
    let lo = 0, hi = chars.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (width(st, chars.slice(0, mid).join("")) + dw <= maxW) lo = mid; else hi = mid - 1;
    }
    return chars.slice(0, lo).join("").replace(/\s+$/, "") + dots;
  }

  return { setMeasureContext, fontString, width, metrics, lineHeightOf, normalBox, breakLines, intrinsic, draw, ellipsize, pieces };
})();

export { uiText };
