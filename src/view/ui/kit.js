"use strict";
// Canvas UI kit entry: node construction, per-frame layout + paint of the
// screen layers, and the interaction model the DOM used to provide -
// hit-testing with event bubbling, :hover/:active/:focus-visible states,
// tap-vs-drag, touch/wheel scrolling of overflow containers, keyboard focus
// traversal (Tab / Shift+Tab, Enter / Space), tooltips for `title`, image
// loading and simple property transitions. Screens build plain node trees:
//
//   uiEl({ key: "startButton", onTap, display: "flex", gap: 8, ... }, children)
//
// Known non-style props are pulled out of the object; everything else is
// style (CSS property names in camelCase, CSS value syntax). Style variants:
// keys starting with "@" are media queries, ":hover"/":active"/":disabled"/
// ":focus-visible" apply in that interaction state.

import { uiCss } from "./css.js";
import { uiText } from "./text.js";
import { uiLayout } from "./layout.js";
import { uiPaint } from "./paint.js";

const uiKit = (() => {
  const STYLE_ID = Symbol.for("endlessRails.uiStyleId"); // sheet entry tag (see layout.js)
  const PROPS = new Set(["key", "onTap", "onPress", "onDrag", "onRelease", "onWheel", "disabled", "title", "text", "image", "intrinsicW", "intrinsicH", "paint", "focusable", "modal", "scrollKey", "ref", "tag", "inline", "label", "role", "blockTap", "tapSound", "br"]);

  const env = {
    vw: 390, vh: 844, dpr: 1, fine: false, hover: false, reducedMotion: false, standalone: false, fullscreen: false,
    stateOf: key => stateOf(key),
  };
  let layers = [];
  let hits = [];
  const scroll = new Map();
  const hoverSet = new Set(), activeSet = new Set();
  let focusKey = null, focusVisible = false;
  let changed = true;
  const listeners = new Set();
  const images = new Map();
  let imageFactory = null;
  let tapHook = null;
  function setTapHook(fn) { tapHook = fn; }
  function fireTap(target, e) { tapHook?.(target, e); target.onTap(e, target); }

  // -- nodes -------------------------------------------------------------------------------

  function uiEl(props, ...children) {
    const node = { style: {}, children };
    if (props) for (const k in props) {
      if (k === "br") node.isBr = !!props[k]; // <br>; node.br is the border-right width after layout
      else if (PROPS.has(k)) node[k] = props[k];
      else node.style[k] = props[k];
    }
    if (props && props[STYLE_ID] !== undefined) node.style[STYLE_ID] = props[STYLE_ID];
    if (children.length === 1 && Array.isArray(children[0])) node.children = children[0];
    return node;
  }
  // Inline text span: uiSpan({color}, "text")
  function uiSpan(props, text) {
    const node = uiEl(props);
    node.inline = true;
    node.text = text == null ? "" : String(text);
    node.children = [];
    return node;
  }

  function stateOf(key) {
    if (!hoverSet.size && !activeSet.size && !focusKey) return null;
    return { hover: hoverSet.has(key), active: activeSet.has(key), focus: key === focusKey, focusVisible: key === focusKey && focusVisible };
  }

  // -- environment / invalidation ---------------------------------------------------------

  function setEnv(next) {
    let dirty = false;
    for (const k in next) if (env[k] !== next[k]) { env[k] = next[k]; dirty = true; }
    if (dirty) invalidate();
  }
  function invalidate() { changed = true; for (const fn of listeners) fn(); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function consumeChanged() { const c = changed; changed = false; return c; }

  // -- images ------------------------------------------------------------------------------

  function setImageFactory(fn) { imageFactory = fn; }
  function image(url) {
    if (!url) return null;
    let entry = images.get(url);
    if (!entry) {
      entry = { img: null, failed: false };
      images.set(url, entry);
      const factory = imageFactory || (typeof Image !== "undefined" ? () => new Image() : null);
      if (factory) {
        const picture = factory();
        picture.onload = () => { if ((picture.naturalWidth || picture.width) > 0) { entry.img = picture; invalidate(); } };
        picture.onerror = () => { entry.failed = true; };
        picture.src = url;
      }
    }
    return entry.img;
  }
  uiPaint.setImageSource(url => image(url));

  // -- transitions ---------------------------------------------------------------------------

  const tweens = new Map();
  let animating = false;
  // Returns the current value of a property that transitions toward `target`
  // over `ms` (linear or ease). Keeps the frame loop alive while running.
  function tween(key, target, ms, ease = "linear") {
    const now = clock();
    let t = tweens.get(key);
    if (!t) { t = { from: target, to: target, start: now, ms }; tweens.set(key, t); return target; }
    if (t.to !== target) {
      const cur = sample(t, now, ease);
      t.from = cur; t.to = target; t.start = now; t.ms = ms;
    }
    const v = sample(t, now, ease);
    if (now - t.start < t.ms) animating = true;
    return v;
  }
  function sample(t, now, ease) {
    if (!t.ms || env.reducedMotion) return t.to;
    let p = Math.max(0, Math.min(1, (now - t.start) / t.ms));
    if (ease === "ease") p = cubic(p, 0.25, 0.1, 0.25, 1);
    else if (ease === "ease-out") p = cubic(p, 0, 0, 0.58, 1);
    else if (ease === "ease-in-out") p = cubic(p, 0.42, 0, 0.58, 1);
    return t.from + (t.to - t.from) * p;
  }
  // CSS cubic-bezier timing function evaluated at x.
  function cubic(x, x1, y1, x2, y2) {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 20; i++) {
      t = (lo + hi) / 2;
      const bx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
      if (bx < x) lo = t; else hi = t;
    }
    return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  }
  // Keyframe animation progress (0..1) for a one-shot animation keyed by id,
  // restarted by bumping `serial`. Returns null when finished.
  const anims = new Map();
  function keyframe(key, serial, ms) {
    const now = clock();
    let a = anims.get(key);
    if (!a || a.serial !== serial) { a = { serial, start: now }; anims.set(key, a); }
    if (env.reducedMotion) return null;
    const p = (now - a.start) / ms;
    if (p >= 1) return null;
    animating = true;
    return Math.max(0, p);
  }
  let clockFn = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  function clock() { return clockFn(); }
  function setClock(fn) { clockFn = fn; }
  function isAnimating() { return animating; }

  // -- render -------------------------------------------------------------------------------

  let lastCtx = null;
  // Lays out and paints the layer roots (bottom first). hooks: {backdrop,
  // scrollbar} painting callbacks supplied by the host.
  function render(ctx, nextLayers, hooks = {}) {
    lastCtx = ctx;
    uiText.setMeasureContext(hooks.measureContext || ctx);
    animating = false;
    layers = nextLayers.filter(Boolean);
    for (const layer of layers) uiLayout.layoutRoot(layer, env);
    hits = [];
    const state = {
      scale: env.dpr, hits, clip: null,
      scrollOf: n => scroll.get(n.scrollKey || n.key) || 0,
      backdrop: hooks.backdrop, scrollbar: hooks.scrollbar, makeScratch: hooks.makeScratch, makeLayer: hooks.makeLayer,
    };
    ctx.save();
    ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    for (const layer of layers) {
      hooks.beforeLayer?.(ctx, layer);
      uiPaint.paintNode(ctx, layer, 0, 0, state);
    }
    paintTooltip(ctx);
    ctx.restore();
    changed = false;
    return layers;
  }
  // Layout only (no paint) - used by headless tests and the QA bridge.
  function layoutOnly(nextLayers, measureContext) {
    if (measureContext) uiText.setMeasureContext(measureContext);
    layers = nextLayers.filter(Boolean);
    for (const layer of layers) uiLayout.layoutRoot(layer, env);
    hits = [];
    const walk = (n, px, py, clip) => {
      if (!n.cs || n.cs.display === "none") return;
      const x = px + n.x, y = py + n.y;
      n.absX = x; n.absY = y;
      hits.push({ node: n, x, y, w: n.w, h: n.h, clip });
      let c = clip, sy = 0;
      if ((n.cs.overflowX && n.cs.overflowX !== "visible") || (n.cs.overflowY && n.cs.overflowY !== "visible")) {
        c = uiPaint.intersect(clip, { x: x + n.bl, y: y + n.bt, w: n.w - n.bl - n.br, h: n.h - n.bt - n.bb });
        if (n.scrollH != null) { n.scrollMax = Math.max(0, n.scrollH - (n.h - n.bt - n.bb)); sy = Math.max(0, Math.min(n.scrollMax, scroll.get(n.scrollKey || n.key) || 0)); n.scrollY = sy; }
      }
      const ordered = [...(n.kids || [])].sort((a, b) => zOf(a) - zOf(b));
      for (const k of ordered) walk(k, x, y - sy, c);
    };
    for (const layer of layers) walk(layer, 0, 0, null);
    return layers;
  }
  function zOf(n) { const z = n.cs && n.cs.position !== "static" && n.cs.zIndex != null && n.cs.zIndex !== "auto" ? +n.cs.zIndex : 0; return z; }

  // -- hit testing ---------------------------------------------------------------------------

  function hitPath(x, y) {
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      const n = h.node;
      if (n.cs.pointerEvents === "none" || n.cs.visibility === "hidden") continue;
      if (!(x >= h.x && y >= h.y && x <= h.x + h.w && y <= h.y + h.h)) continue;
      if (h.clip && (x < h.clip.x || y < h.clip.y || x > h.clip.x + h.clip.w || y > h.clip.y + h.clip.h)) continue;
      const path = [];
      for (let p = n; p; p = p.parent) path.push(p);
      return path;
    }
    return [];
  }
  const handlerOf = (path, name) => path.find(n => n[name] && !n.disabled) || null;
  const blockedBy = (path, name) => { const i = path.findIndex(n => n[name]); return i >= 0 && path[i].disabled; };
  function scrollerOf(path) { return path.find(n => n.scrollH != null && n.scrollMax > 0) || null; }
  function nodeByKey(key) {
    for (const h of hits) if (h.node.key === key) return h.node;
    return null;
  }

  // -- pointer interaction -------------------------------------------------------------------------

  const TAP_SLOP = 8;
  // One record per active pointer (touch fingers are independent, like DOM
  // pointer events): the joystick finger never blocks a button finger.
  const presses = new Map();

  function setHover(path) {
    const keys = new Set(path.map(n => n.key));
    let diff = keys.size !== hoverSet.size;
    if (!diff) for (const k of keys) if (!hoverSet.has(k)) { diff = true; break; }
    if (diff) { hoverSet.clear(); for (const k of keys) hoverSet.add(k); tooltip.key = null; tooltip.since = clock(); tooltip.node = path.find(n => n.title) || null; invalidate(); }
  }
  function refreshActive() {
    activeSet.clear();
    for (const p of presses.values()) if (!p.moved) for (const n of p.path) activeSet.add(n.key);
    invalidate();
  }
  // Returns the press record when a UI element was hit (the press is
  // consumed), otherwise null.
  function pointerDown(e) {
    const path = hitPath(e.x, e.y);
    if (!path.length) return null;
    const scroller = scrollerOf(path);
    const press = {
      id: e.id, x: e.x, y: e.y, path, moved: false, pointerType: e.pointerType,
      target: handlerOf(path, "onTap"), scroller,
      scrollBase: scroller ? scroll.get(scroller.scrollKey || scroller.key) || 0 : 0,
      drag: handlerOf(path, "onPress"),
    };
    // Pressing a classic scrollbar drags its thumb.
    if (scroller && scroller._sb) {
      const gx = (scroller.boxX ?? scroller.absX) + scroller.w - scroller.br - scroller._sb;
      if (e.x >= gx) {
        const clientH = scroller.h - scroller.bt - scroller.bb;
        press.thumb = { ratio: scroller.scrollH / Math.max(1, clientH - 2 * scroller._sb) };
        press.target = null; press.drag = null;
      }
    }
    presses.set(e.id, press);
    if (e.fine) setHover(path);
    focusVisible = false;
    const focusTarget = path.find(n => isFocusable(n));
    if (focusTarget) focusKey = focusTarget.key; else if (focusKey && !path.some(n => n.key === focusKey)) focusKey = null;
    tooltip.node = null;
    refreshActive();
    if (press.drag) press.drag.onPress(e, press.drag);
    return press;
  }
  function pointerMove(e) {
    const press = presses.get(e.id);
    if (press) {
      const dx = e.x - press.x, dy = e.y - press.y;
      if (press.thumb) {
        const s = press.scroller;
        setScroll(s.scrollKey || s.key, press.scrollBase + dy * press.thumb.ratio, s.scrollMax);
        return true;
      }
      // touch and pen pan scroll containers; a mouse scrolls with the wheel or the scrollbar
      if (!press.moved && Math.hypot(dx, dy) > TAP_SLOP && press.scroller && !press.drag && press.pointerType !== "mouse") {
        press.moved = true; refreshActive();
      }
      if (press.moved && press.scroller) {
        const s = press.scroller;
        setScroll(s.scrollKey || s.key, press.scrollBase - dy, s.scrollMax);
        return true;
      }
      if (press.drag?.onDrag) press.drag.onDrag(e, press.drag);
      return true;
    }
    if (e.fine) setHover(hitPath(e.x, e.y));
    return false;
  }
  function pointerUp(e) {
    const press = presses.get(e.id);
    if (!press) return false;
    presses.delete(e.id);
    refreshActive();
    const target = press.target;
    if (press.drag?.onRelease) press.drag.onRelease(e, press.drag);
    if (!press.moved && target && !target.disabled && !e.cancel) {
      const upPath = hitPath(e.x, e.y);
      if (upPath.some(n => n.key === target.key)) { fireTap(target, e); if (e.fine) setHover(hitPath(e.x, e.y)); return true; }
    }
    if (e.fine) setHover(hitPath(e.x, e.y));
    return true;
  }
  function pointerLeave() { if (hoverSet.size) { hoverSet.clear(); invalidate(); } tooltip.node = null; }
  function wheel(e) {
    const path = hitPath(e.x, e.y);
    const s = scrollerOf(path);
    if (!s) return false;
    const key = s.scrollKey || s.key;
    setScroll(key, (scroll.get(key) || 0) + e.dy, s.scrollMax);
    return true;
  }
  function setScroll(key, value, max = Infinity) {
    const v = Math.max(0, Math.min(max, value));
    if (scroll.get(key) !== v) { scroll.set(key, v); invalidate(); }
  }
  function getScroll(key) { return scroll.get(key) || 0; }
  function resetScroll(key) { if (scroll.has(key)) { scroll.delete(key); invalidate(); } }
  // Scrolls a container so that node `targetKey` starts at its top.
  function scrollIntoView(containerKey, targetKey) {
    const c = nodeByKey(containerKey), t = nodeByKey(targetKey);
    if (!c || !t) return;
    const cur = Math.min(scroll.get(c.scrollKey || c.key) || 0, c.scrollMax || 0);
    const y = t.absY - (c.absY + c.bt) + cur;
    setScroll(c.scrollKey || c.key, y, c.scrollMax);
  }
  function isPressing() { return presses.size > 0; }
  function cancelPress(id) {
    if (id === undefined) presses.clear(); else presses.delete(id);
    refreshActive();
  }

  // -- focus / keyboard -------------------------------------------------------------------------------

  function isFocusable(n) { return !!(n.onTap || n.focusable) && !n.disabled && n.focusable !== false; }
  function focusables() {
    // only within the top-most modal layer (like inert/aria-modal dialogs)
    let scope = null;
    for (let i = layers.length - 1; i >= 0; i--) if (layers[i].modal) { scope = layers[i]; break; }
    const out = [];
    for (const h of hits) {
      const n = h.node;
      if (!isFocusable(n) || n.cs.visibility === "hidden") continue;
      if (h.w <= 0 || h.h <= 0) continue;
      if (scope) { let p = n; while (p && p !== scope) p = p.parent; if (!p) continue; }
      out.push(n);
    }
    return out;
  }
  function focus(key, visible = focusVisible) { focusKey = key; focusVisible = visible; invalidate(); }
  function blur() { focusKey = null; invalidate(); }
  function focusedKey() { return focusKey; }
  // Tab traversal and activation. Returns true when consumed.
  function keyDown(e) {
    if (e.code === "Tab") {
      const list = focusables();
      if (!list.length) return false;
      let i = list.findIndex(n => n.key === focusKey);
      i = i < 0 ? (e.shiftKey ? list.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + list.length) % list.length;
      focusKey = list[i].key; focusVisible = true; invalidate();
      return true;
    }
    if ((e.code === "Enter" || e.code === "Space" || e.code === "NumpadEnter") && focusKey) {
      const n = nodeByKey(focusKey);
      if (n && n.onTap && !n.disabled) { focusVisible = true; fireTap(n, { keyboard: true, x: n.absX, y: n.absY }); return true; }
    }
    return false;
  }

  // -- tooltips (title attribute) --------------------------------------------------------------------

  const tooltip = { node: null, since: 0, key: null };
  function paintTooltip(ctx) {
    const n = tooltip.node;
    if (!n || !env.hover || !n.title) return;
    if (clock() - tooltip.since < 700) { animating = true; return; }
    const st = { fontSize: 12, fontFamily: '"Microsoft YaHei","PingFang SC",system-ui,sans-serif', fontWeight: 400, color: "#000", lineHeight: 16, letterSpacing: 0 };
    const lines = uiText.breakLines([{ text: n.title, st }], 300, "normal");
    const w = Math.max(...lines.map(l => l.w)) + 10, h = lines.length * 16 + 6;
    let x = Math.min(env.vw - w - 2, Math.max(2, n.absX + 8)), y = n.absY + n.h + 4;
    if (y + h > env.vh) y = Math.max(2, n.absY - h - 4);
    ctx.save();
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#767676"; ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    lines.forEach((l, i) => uiText.draw(ctx, l.items.map(it => it.text + (it.space ? " " : "")).join(""), x + 5, y + 3 + 12.5 + i * 16, st));
    ctx.restore();
  }

  // -- queries (QA bridge, tests) ------------------------------------------------------------------------

  // Flat list of laid-out nodes with absolute boxes, in paint order.
  function boxes() { return hits.map(h => ({ key: h.node.key, node: h.node, x: h.x, y: h.y, w: h.w, h: h.h, clip: h.clip })); }
  function find(key) { return nodeByKey(key); }
  function tapKey(key) {
    const n = nodeByKey(key);
    const handler = n && (n.onTap ? n : handlerOf([n, ...ancestors(n)], "onTap"));
    if (!handler || handler.disabled) return false;
    fireTap(handler, { synthetic: true, x: (n.boxX ?? n.absX) + n.w / 2, y: (n.boxY ?? n.absY) + n.h / 2 });
    return true;
  }
  function ancestors(n) { const out = []; for (let p = n.parent; p; p = p.parent) out.push(p); return out; }
  function textOf(n) {
    if (!n) return "";
    let s = n.text != null ? String(n.text) : "";
    for (const k of n.kids || []) s += textOf(k);
    return s;
  }

  return {
    env, setEnv, invalidate, onChange, consumeChanged,
    uiEl, uiSpan, image, setImageFactory, setTapHook, tween, keyframe, cubic, setClock, clock, isAnimating,
    render, layoutOnly, hitPath, pointerDown, pointerMove, pointerUp, pointerLeave, wheel,
    setScroll, getScroll, resetScroll, scrollIntoView, isPressing, cancelPress,
    focus, blur, focusedKey, keyDown, focusables,
    boxes, find, tapKey, textOf, get layers() { return layers; },
  };
})();

const uiEl = uiKit.uiEl;
const uiSpan = uiKit.uiSpan;

export { uiKit, uiEl, uiSpan };
