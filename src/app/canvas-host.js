"use strict";
// Canvas host: the whole game - battlefield, HUD, expedition base, flow
// screens, pause terminal and dialogs - is drawn on one canvas. The page (or
// the mini-game adapter) hands its canvas over on globalThis.
// __endlessRailsCanvas before this module evaluates; nothing else of the
// document is touched. Interface layout and paint come from the canvas UI kit
// (src/view/ui) with the screens in src/view/screens; the controllers
// (ui-home / ui-run / ui-dialogs) own interface state and call the DOM-free
// engine exactly like the former DOM panels did.
//
// Frame pipeline: the battlefield renders into its own offscreen surface at
// the engine's logical resolution (the same bitmap size the DOM canvas had)
// and is composited into the arena box. During live combat with no overlay
// the interface is cached in two device-resolution layers (below / above the
// battlefield) that are only repainted when the interface changes, so a
// combat frame costs three drawImage calls on top of the simulation.

import { setSurface } from "../view/surface.js";
import { draw } from "../view/render.js";
import { artState, retryArt, onArtChange } from "../view/atlas.js";
import { state, presentation, frameStep, resizeBattlefield, pulse, gameAudio, update, beginRun, beginRoute, syncSwarm, cameraView, longterm, runRecord, metaStorage } from "./engine.js";
import { gamePlatform } from "./platform.js";
import { uiKit } from "../view/ui/kit.js";
import { uiLayout } from "../view/ui/layout.js";
import { uiText } from "../view/ui/text.js";
import { uiPaint } from "../view/ui/paint.js";
import { uiSheet } from "../view/screens/sheet.js";
import { homeScreen } from "../view/screens/home.js";
import { battleScreen } from "../view/screens/battle.js";
import { flowScreens } from "../view/screens/flows.js";
import { pauseScreen } from "../view/screens/pause.js";
import { dialogScreens } from "../view/screens/dialogs.js";
import { homeCtl } from "./ui-home.js";
import { runCtl } from "./ui-run.js";
import { dialogCtl } from "./ui-dialogs.js";

const GAME_VERSION = "v0.11.1.0";
const PAGE_BACKGROUND = "rgb(165, 163, 148)";

const canvasHost = (() => {
  const G = globalThis;
  const screenCanvas = G.__endlessRailsCanvas || gamePlatform.pageCanvas();
  if (!screenCanvas) throw new Error("canvas-host: no canvas was provided on globalThis.__endlessRailsCanvas");
  const screen = screenCanvas.getContext("2d");
  // The battlefield surface every renderer draws into (logical px, min side 390).
  const battlefield = gamePlatform.createCanvas(390, 680) || screenCanvas;
  setSurface(battlefield, battlefield.width, battlefield.height);
  const E = uiKit.uiEl;
  uiLayout.registerStyles(uiSheet);
  uiText.setMeasureContext(screen);
  uiKit.setImageFactory(() => gamePlatform.createImage());

  // -- environment ------------------------------------------------------------------------------

  let keyboardMode = false;
  const view = { w: 390, h: 844, dpr: 1 };
  function frameVars(vw, vh, fine, immersive) {
    let fw = "min(100vw, 480px)", fh = "100dvh";
    if (vw >= 600) { fh = "min(960px, calc(100dvh - 40px))"; fw = "min(480px, calc((100dvh - 40px) * .52))"; }
    if (vh <= 450 && vw >= 600) { fw = "min(100vw, 780px)"; fh = "100dvh"; }
    if (vw < 600 || !fine) { fw = "100vw"; fh = "100dvh"; }
    if (immersive) { fh = "100dvh"; fw = vw >= 800 && fine ? "min(640px,100vw)" : "100vw"; }
    return { "--frame-width": fw, "--frame-height": fh };
  }
  function updateEnv() {
    const vp = gamePlatform.viewport();
    view.w = vp.w; view.h = vp.h; view.dpr = vp.dpr;
    const pw = Math.max(1, Math.round(vp.w * vp.dpr)), ph = Math.max(1, Math.round(vp.h * vp.dpr));
    if (screenCanvas.width !== pw) screenCanvas.width = pw;
    if (screenCanvas.height !== ph) screenCanvas.height = ph;
    if (screenCanvas.style) { screenCanvas.style.width = vp.w + "px"; screenCanvas.style.height = vp.h + "px"; }
    const fine = gamePlatform.pointerFine(), disp = dialogCtl.display();
    uiKit.setEnv({
      vw: vp.w, vh: vp.h, dpr: vp.dpr, fine, hover: gamePlatform.hoverCapable(), reducedMotion: gamePlatform.reducedMotion(),
      standalone: disp.standalone, fullscreen: disp.full, immersive: disp.immersive,
      classicScrollbars: gamePlatform.classicScrollbars(),
      safe: vp.safe || { top: 0, right: 0, bottom: 0, left: 0 },
      vars: frameVars(vp.w, vp.h, fine, disp.immersive),
    });
    fullRedraw = true;
  }

  // -- layers ------------------------------------------------------------------------------------

  // Stacking of the former page: the app frame, then overlays by z-index and
  // document order (start / station / contract / event / level-up / result at
  // 20, pause 40, display help 60, settings 75, test save 95, GM 100).
  function layerRoot(key, node, modal) {
    return E({ key: "layer-" + key, position: "absolute", left: 0, top: 0, width: view.w, height: view.h, modal: !!modal }, node);
  }
  function appLayer(part, paint) {
    const m = runCtl.battleModel(paint, dialogCtl.display());
    return E({ key: "layer-app" + (part === "over" ? "Over" : ""), position: "absolute", left: 0, top: 0, width: view.w, height: view.h, display: "flex", alignItems: "center", justifyContent: "center" },
      battleScreen.build(m, part));
  }
  function overlayLayers() {
    const out = [];
    const flows = runCtl.flowModels();
    if (homeCtl.isOpen) out.push(["start", homeScreen.build(homeCtl.model()), false]);
    if (flows.station) out.push(["station", flowScreens.station(flows.station), true]);
    if (flows.contract) out.push(["contract", flowScreens.contract(flows.contract), true]);
    if (flows.route) out.push(["event", flowScreens.route(flows.route), true]);
    if (flows.levelUp) out.push(["levelUp", flowScreens.levelUp(flows.levelUp), true]);
    if (flows.result) out.push(["result", flowScreens.result(flows.result), true]);
    if (runCtl.pauseVisible) { const pm = runCtl.pauseModel(); if (pm) out.push(["pause", pauseScreen.build(pm), true]); }
    if (dialogCtl.helpOpen) out.push(["displayHelp", dialogScreens.displayHelp(dialogCtl.helpModel()), true]);
    if (dialogCtl.settingsOpen) out.push(["settings", dialogScreens.settings(dialogCtl.settingsModel()), true]);
    if (dialogCtl.cloudOpen) out.push(["cloud", dialogScreens.cloud(dialogCtl.cloudModel()), true]);
    if (dialogCtl.gmOpen) out.push(["gm", dialogScreens.gm(dialogCtl.gmModel()), true]);
    // Former page rules: an open pause terminal hides the other selection
    // screens, and the settings sheet hides the pause terminal (visibility).
    const SELECTION = new Set(["station", "contract", "event", "levelUp", "cloud"]);
    const pauseShown = runCtl.pauseVisible && !!runCtl.pauseModel();
    const visible = out.filter(([key]) => !(pauseShown && SELECTION.has(key)) && !(key === "pause" && dialogCtl.settingsOpen));
    const layers = visible.map(([key, node, modal]) => layerRoot(key, node, modal));
    if (runCtl.selectOpen) {
      const anchor = uiKit.find("inspectSelect");
      if (anchor) layers.push(layerRoot("select", pauseScreen.optionList({ ...runCtl.pauseModel(), on: runCtl.pauseActions }, { x: anchor.absX, y: anchor.absY, w: anchor.w, h: anchor.h }, view.w, view.h), true));
    }
    return layers;
  }

  // -- paint hooks -------------------------------------------------------------------------------

  const scratch = new Map();
  function scratchCanvas(name, w, h) {
    let c = scratch.get(name);
    if (!c) { c = gamePlatform.createCanvas(w, h); scratch.set(name, c); }
    if (!c) return null;
    if (c.width < w) c.width = w;
    if (c.height < h) c.height = h;
    return c;
  }
  let filterSupported = null;
  // backdrop-filter: blur(Npx) - blur what is already painted under the box.
  function backdrop(ctx, n, x, y, w, h, r) {
    const match = /blur\(\s*([\d.]+)px\s*\)/.exec(n.cs.backdropFilter || "");
    if (!match) return;
    const t = ctx.getTransform ? ctx.getTransform() : { a: view.dpr, d: view.dpr, e: 0, f: 0 };
    const blur = parseFloat(match[1]) * t.a;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const x0 = Math.floor(t.a * x + t.e), y0 = Math.floor(t.d * y + t.f), x1 = Math.ceil(t.a * (x + w) + t.e), y1 = Math.ceil(t.d * (y + h) + t.f);
    const M = Math.ceil(blur * 3);
    const sx0 = Math.max(0, x0 - M), sy0 = Math.max(0, y0 - M), sx1 = Math.min(cw, x1 + M), sy1 = Math.min(ch, y1 + M);
    if (sx1 <= sx0 || sy1 <= sy0) return;
    const bw = x1 - x0 + 2 * M, bh = y1 - y0 + 2 * M;
    const sc = scratchCanvas("backdrop", bw, bh), sctx = sc && sc.getContext("2d");
    if (!sctx) return;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, sc.width, sc.height);
    const ox = sx0 - (x0 - M), oy = sy0 - (y0 - M), sw = sx1 - sx0, sh = sy1 - sy0;
    sctx.drawImage(ctx.canvas, sx0, sy0, sw, sh, ox, oy, sw, sh);
    // Edge pixels are repeated outward so the blur does not fade at the canvas border.
    if (ox > 0) sctx.drawImage(sc, ox, oy, 1, sh, 0, oy, ox, sh);
    if (oy > 0) sctx.drawImage(sc, 0, oy, bw, 1, 0, 0, bw, oy);
    const right = bw - (ox + sw), bottom = bh - (oy + sh);
    if (right > 0) sctx.drawImage(sc, ox + sw - 1, 0, 1, bh, ox + sw, 0, right, bh);
    if (bottom > 0) sctx.drawImage(sc, 0, oy + sh - 1, bw, 1, 0, oy + sh, bw, bottom);
    ctx.save();
    uiPaint.rrPath(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (filterSupported === null) filterSupported = typeof ctx.filter === "string";
    if (filterSupported) {
      ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(sc, 0, 0, bw, bh, x0 - M, y0 - M, bw, bh);
      ctx.filter = "none";
    } else {
      // No canvas filters (older WebKit, mini-game runtimes): box-blur by resampling.
      const k = Math.max(2, Math.round(blur / 2)), tw = Math.max(1, Math.round(bw / k)), th = Math.max(1, Math.round(bh / k));
      const small = scratchCanvas("backdropSmall", tw, th), smctx = small.getContext("2d");
      smctx.clearRect(0, 0, small.width, small.height);
      smctx.imageSmoothingEnabled = true;
      smctx.drawImage(sc, 0, 0, bw, bh, 0, 0, tw, th);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(small, 0, 0, tw, th, x0 - M, y0 - M, bw, bh);
    }
    ctx.restore();
  }
  // Classic desktop scrollbar (Chromium style): track, arrow buttons and a
  // rounded thumb; scrollbar-color when the element sets one, otherwise the
  // light (base screens) or dark (color-scheme: dark overlays) palette.
  function scrollbar(ctx, n, x, y, w, h) {
    const sb = n._sb, clientH = h - n.bt - n.bb;
    if (!sb || clientH <= 0) return;
    let light = false;
    for (let p = n; p; p = p.parent) if (p.key === "startScreen") { light = true; break; }
    let thumb = light ? "#c1c1c1" : "#9f9f9f", track = light ? "#f1f1f1" : "#2c2c2c", arrow = light ? "#505050" : "#9f9f9f";
    const colors = String(n.cs.scrollbarColor || "auto");
    if (colors !== "auto") { const parts = colors.match(/(rgba?\([^)]*\)|#[0-9a-fA-F]+|[a-z]+)/g) || []; thumb = arrow = parts[0] || thumb; track = parts[1] || "transparent"; }
    const tx = x + w - n.br - sb, ty = y + n.bt;
    ctx.save();
    if (track !== "transparent") { ctx.fillStyle = track; ctx.fillRect(tx, ty, sb, clientH); }
    const tw = sb >= 15 ? 9 : 6, tri = sb >= 15 ? 4.5 : 3, mid = tx + sb / 2;
    ctx.fillStyle = arrow;
    ctx.beginPath(); ctx.moveTo(mid, ty + sb / 2 - tri / 2); ctx.lineTo(mid + tri, ty + sb / 2 + tri / 2); ctx.lineTo(mid - tri, ty + sb / 2 + tri / 2); ctx.fill();
    const by = ty + clientH - sb;
    ctx.beginPath(); ctx.moveTo(mid, by + sb / 2 + tri / 2); ctx.lineTo(mid + tri, by + sb / 2 - tri / 2); ctx.lineTo(mid - tri, by + sb / 2 - tri / 2); ctx.fill();
    const gap = (sb - tw) / 2, trackTop = ty + sb + gap, trackLen = clientH - 2 * sb - 2 * gap;
    if (trackLen > 8 && n.scrollMax > 0) {
      const len = Math.max(tw * 2, trackLen * clientH / n.scrollH), pos = trackTop + (trackLen - len) * ((n.scrollY || 0) / n.scrollMax);
      ctx.fillStyle = thumb;
      { const c = { x: tw / 2, y: tw / 2 }; uiPaint.rrPath(ctx, tx + gap, pos, tw, len, [c, c, c, c]); }
      ctx.fill();
    }
    ctx.restore();
  }
  const hooks = {
    measureContext: screen,
    backdrop, scrollbar,
    makeScratch: (w, h) => scratchCanvas("mask", w, h),
    makeLayer: (depth, w, h) => scratchCanvas("group" + depth, w, h),
  };

  // -- battlefield compositing ----------------------------------------------------------------------

  let arenaBox = null, lastResize = "";
  function paintBattlefield(ctx, box) {
    arenaBox = { x: box.x, y: box.y, w: box.w, h: box.h };
    if (battlefield !== screenCanvas) ctx.drawImage(battlefield, box.x, box.y, box.w, box.h);
  }
  function recordBattlefield(ctx, box) { arenaBox = { x: box.x, y: box.y, w: box.w, h: box.h }; }
  function syncBattlefieldSize() {
    if (!arenaBox) return;
    const key = Math.round(arenaBox.w * 100) + "x" + Math.round(arenaBox.h * 100);
    if (key === lastResize) return;
    lastResize = key;
    resizeBattlefield({ width: arenaBox.w, height: arenaBox.h });
  }

  // -- frame ---------------------------------------------------------------------------------------------

  let fullRedraw = true, cachedSplit = false, afterRender = [];
  let under = null, over = null;
  const liveBattle = () => ["combat", "docking"].includes(state.mode) && !state.paused;
  function clearScreen(ctx, fill) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fill) { ctx.fillStyle = PAGE_BACKGROUND; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
    else ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  function renderInterface() {
    const dirty = uiKit.consumeChanged() || uiKit.isAnimating() || fullRedraw;
    const live = liveBattle();
    const overlays = overlayLayers();
    const split = live && !overlays.length;
    if (split) {
      const W = screenCanvas.width, H = screenCanvas.height;
      if (dirty || !cachedSplit) {
        under = under || gamePlatform.createCanvas(W, H); over = over || gamePlatform.createCanvas(W, H);
        if (!under || !over) return renderFull(overlays);
        if (under.width !== W || under.height !== H) { under.width = W; under.height = H; }
        if (over.width !== W || over.height !== H) { over.width = W; over.height = H; }
        const uctx = under.getContext("2d"), octx = over.getContext("2d");
        clearScreen(uctx, true);
        uiKit.render(uctx, [appLayer("under", recordBattlefield)], hooks);
        clearScreen(octx, false);
        uiKit.render(octx, [appLayer("over", null)], hooks);
        cachedSplit = true; fullRedraw = false; stats.splitRenders = (stats.splitRenders || 0) + 1;
      }
      screen.setTransform(1, 0, 0, 1, 0, 0);
      screen.drawImage(under, 0, 0);
      if (arenaBox && battlefield !== screenCanvas) {
        const d = view.dpr;
        screen.drawImage(battlefield, arenaBox.x * d, arenaBox.y * d, arenaBox.w * d, arenaBox.h * d);
      }
      screen.drawImage(over, 0, 0);
    } else if (dirty || live || cachedSplit) {
      renderFull(overlays);
    }
    syncBattlefieldSize();
    if (afterRender.length) { const list = afterRender; afterRender = []; for (const fn of list) fn(); }
  }
  function renderFull(overlays) {
    cachedSplit = false; fullRedraw = false; stats.fullRenders = (stats.fullRenders || 0) + 1;
    clearScreen(screen, true);
    uiKit.render(screen, [appLayer("full", paintBattlefield), ...overlays], hooks);
  }
  const stats = { frames: 0, sim: 0, ui: 0 };
  function frame(now) {
    const t0 = G.performance ? G.performance.now() : 0;
    frameStep(now);
    const t1 = G.performance ? G.performance.now() : 0;
    renderInterface();
    const t2 = G.performance ? G.performance.now() : 0;
    stats.frames++; stats.sim += ((t1 - t0) - stats.sim) * 0.05; stats.ui += ((t2 - t1) - stats.ui) * 0.05;
    requestFrame();
  }
  function requestFrame() {
    const raf = G.requestAnimationFrame || (fn => setTimeout(() => fn(Date.now()), 16));
    raf(frame);
  }

  // -- input -------------------------------------------------------------------------------------------------

  const toPoint = ev => {
    let x = ev.clientX, y = ev.clientY;
    const rect = screenCanvas.getBoundingClientRect ? screenCanvas.getBoundingClientRect() : null;
    if (rect && ev.relative !== true) { x -= rect.left || 0; y -= rect.top || 0; }
    return { id: ev.pointerId ?? 0, x, y, pointerType: ev.pointerType || "touch", button: ev.button || 0, fine: ev.pointerType === "mouse" || ev.pointerType === "pen", cancel: false };
  };
  const captured = new Set();
  function pointerDown(ev) {
    gameAudio?.unlock();
    keyboardMode = false;
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    const press = uiKit.pointerDown(toPoint(ev));
    if (press) {
      ev.preventDefault?.();
      try { screenCanvas.setPointerCapture?.(ev.pointerId); captured.add(ev.pointerId); } catch {}
    }
  }
  function pointerMove(ev) {
    const p = toPoint(ev);
    const pressing = uiKit.pointerMove(p);
    if (pressing) ev.preventDefault?.();
    if (p.fine) updateCursor(p);
  }
  function pointerUp(ev, cancel = false) {
    const p = toPoint(ev); p.cancel = cancel;
    uiKit.pointerUp(p);
    if (captured.has(ev.pointerId)) { captured.delete(ev.pointerId); try { screenCanvas.releasePointerCapture?.(ev.pointerId); } catch {} }
    if (p.fine) updateCursor(p);
  }
  function releasePointer(id) {
    uiKit.cancelPress(id);
    if (captured.has(id)) { captured.delete(id); try { screenCanvas.releasePointerCapture?.(id); } catch {} }
  }
  function updateCursor(p) {
    const path = uiKit.hitPath(p.x, p.y);
    const c = path[0]?.cs?.cursor;
    gamePlatform.setCursor(screenCanvas, !c || c === "auto" ? "default" : c);
  }
  function wheel(ev) {
    const scale = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? view.h : 1;
    const p = toPoint(ev);
    if (uiKit.wheel({ x: p.x, y: p.y, dy: ev.deltaY * scale })) ev.preventDefault?.();
  }
  const HOME_TABS = [["shop", "homeTabShop"], ["train", "homeTabTrain"], ["battle", "homeTabBattle"], ["research", "homeTabResearch"], ["settings", "startSettingsButton"]];
  function focusInside(layer) {
    let n = uiKit.find(uiKit.focusedKey());
    for (; n; n = n.parent) if (n.key === "layer-" + layer || n.key === layer) return true;
    return false;
  }
  function activate(e) { return (e.code === "Tab" || e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") && uiKit.keyDown(e); }
  function keyDown(e) {
    keyboardMode = true;
    if (!e.repeat) gameAudio?.unlock();
    const done = () => { e.preventDefault?.(); return true; };
    if (runCtl.selectOpen) {
      if (e.code === "Escape" || e.code === "Enter" || e.code === "Space" || e.code === "Tab") { runCtl.pauseActions.closeSelect(); return done(); }
      if (runCtl.selectKey(e)) return done();
      return done();
    }
    if (dialogCtl.settingsOpen) {
      if (dialogCtl.settingsKey(e)) return done();
      if (activate(e)) return done();
      return false;
    }
    if (dialogCtl.gmOpen && focusInside("gmPanel")) {
      if (e.code === "Escape") { dialogCtl.closeGM(); return done(); }
      if (activate(e)) return done();
      return false;
    }
    if (dialogCtl.helpOpen && focusInside("displayHelp") && dialogCtl.helpKey(e)) return done();
    if (e.code === "Tab") { uiKit.keyDown(e); return done(); }
    if (e.code === "Space" && !state.paused && !dialogCtl.settingsOpen) { done(); pulse(); return true; }
    if ((e.code === "KeyP" || e.code === "Escape") && !e.repeat) { done(); runCtl.togglePause({ keyboard: true }); return true; }
    const focused = uiKit.focusedKey();
    if (focused === "inspectSelect" && runCtl.selectKey(e)) return done();
    const tabIndex = HOME_TABS.findIndex(([, key]) => key === focused);
    if (tabIndex >= 0 && homeCtl.isOpen) {
      let next;
      if (e.code === "ArrowRight") next = (tabIndex + 1) % HOME_TABS.length;
      if (e.code === "ArrowLeft") next = (tabIndex + HOME_TABS.length - 1) % HOME_TABS.length;
      if (e.code === "Home") next = 0;
      if (e.code === "End") next = HOME_TABS.length - 1;
      if (next !== undefined) { homeCtl.selectTab(HOME_TABS[next][0]); if (homeCtl.getTab() === HOME_TABS[next][0]) uiKit.focus(HOME_TABS[next][1], true); return done(); }
    }
    if (runCtl.keyDownSteer(e)) return done();
    if (activate(e)) return done();
    return false;
  }
  function keyUp(e) { if (runCtl.keyUpSteer(e)) e.preventDefault?.(); }

  // Tap feedback: buttons click like the page did (not switches, cards or the pulse).
  uiKit.setTapHook(target => {
    if (target.tapSound === false || target.role === "switch" || target.disabled) return;
    gameAudio?.play("ui");
  });

  // -- controller wiring ---------------------------------------------------------------------------------------

  const hub = {
    invalidate: () => uiKit.invalidate(),
    focus: (key, visible) => uiKit.focus(key, visible === undefined ? keyboardMode : !!visible),
    blur: () => uiKit.blur(),
    focusedKey: () => uiKit.focusedKey(),
    focusInside,
    keyboardMode: () => keyboardMode,
    viewport: () => ({ w: view.w, h: view.h }),
    resetScroll: key => uiKit.resetScroll(key),
    releasePointer,
    openHome: () => homeCtl.open(),
    closeHome: () => { homeCtl.isOpen = false; uiKit.invalidate(); },
    displayChanged: () => { updateEnv(); },
    measurePause,
    home: { refresh: () => homeCtl.refresh() },
    run: runCtl,
    dialogs: {
      settingsOpen: () => dialogCtl.settingsOpen, gmOpen: () => dialogCtl.gmOpen, displayHelpOpen: () => dialogCtl.helpOpen,
      closeGM: () => dialogCtl.closeGM(), toggleGM: () => dialogCtl.toggleGM(), resetGM: () => dialogCtl.resetGM(),
      display: () => dialogCtl.display(), toggleFullscreen: () => dialogCtl.toggleFullscreen(), installGame: () => dialogCtl.installGame(),
      openSettings: e => dialogCtl.openSettings(e),
    },
  };
  // Lays out one pause page off-screen and reports the data bay's client
  // height and the stats list's content height (the DOM scrollHeight check).
  function measurePause(model) {
    const d = dialogCtl.display();
    const tree = layerRoot("pauseProbe", pauseScreen.build({ ...model, fullscreen: d.pause, installHidden: d.installHidden, on: runCtl.pauseActions }), false);
    uiLayout.layoutRoot(tree, uiKit.env);
    const find = (n, key) => { if (n.key === key) return n; for (const k of n.kids || []) { const f = find(k, key); if (f) return f; } return null; };
    const vp = find(tree, "inspectViewport"), stats = find(tree, "inspectStats");
    if (!vp || !stats) return { viewportH: 0, statsH: 0 };
    let bottom = stats.h - stats.bb;
    for (const k of stats.kids || []) if (k.cs && k.cs.display !== "none") bottom = Math.max(bottom, k.y + k.h + (+k.mb || 0) + (+stats.pb || 0));
    return { viewportH: vp.h - vp.bt - vp.bb, statsH: bottom - stats.bt };
  }
  homeCtl.attach({
    invalidate: () => uiKit.invalidate(),
    resetScroll: key => uiKit.resetScroll(key),
    scrollIntoView: (container, target) => uiKit.scrollIntoView(container, target),
    afterRender: fn => { afterRender.push(fn); uiKit.invalidate(); },
    startRun: plan => beginRun(plan),
    cloudBlocksStart: () => dialogCtl.cloud.enabled && !dialogCtl.cloud.canStart(),
    openCloud: () => dialogCtl.cloud.open(),
    openCloudFromButton: () => dialogCtl.cloud.openFromButton(),
    art: () => artState(),
    retryArt: () => retryArt(),
    settingsModel: () => {
      const s = dialogCtl.soundState(), d = dialogCtl.display();
      return { music: s.music, sfx: s.sfx, disabled: s.disabled, note: s.note, fullscreen: d.start, installHidden: d.installHidden, cloudVisible: dialogCtl.cloud.enabled, version: GAME_VERSION };
    },
    refreshSound: () => uiKit.invalidate(),
    toggleSound: key => dialogCtl.toggleSound(key),
    toggleFullscreen: () => dialogCtl.toggleFullscreen(),
    installGame: () => dialogCtl.installGame(),
  });
  runCtl.attach(hub);
  dialogCtl.attach(hub);
  onArtChange(() => uiKit.invalidate());

  // -- page events (browser) -------------------------------------------------------------------------------------

  const win = gamePlatform.win, doc = gamePlatform.doc;
  if (screenCanvas.addEventListener) {
    screenCanvas.addEventListener("pointerdown", pointerDown);
    screenCanvas.addEventListener("pointermove", pointerMove);
    screenCanvas.addEventListener("pointerup", e => pointerUp(e));
    screenCanvas.addEventListener("pointercancel", e => pointerUp(e, true));
    screenCanvas.addEventListener("lostpointercapture", e => { if (captured.has(e.pointerId)) { captured.delete(e.pointerId); uiKit.pointerUp({ ...toPoint(e), cancel: true }); } });
    screenCanvas.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") uiKit.pointerLeave(); });
    screenCanvas.addEventListener("wheel", wheel, { passive: false });
    for (const type of ["contextmenu", "dragstart", "selectstart"]) screenCanvas.addEventListener(type, e => e.preventDefault());
  }
  if (win) {
    win.addEventListener("keydown", keyDown);
    win.addEventListener("keyup", keyUp);
    win.addEventListener("blur", () => runCtl.autoPause());
    win.addEventListener("pagehide", () => gameAudio?.setHidden(true));
    win.addEventListener("pageshow", () => gameAudio?.setHidden(!!doc?.hidden));
  }
  if (doc) doc.addEventListener("visibilitychange", () => { gameAudio?.setHidden(!!doc.hidden); if (doc.hidden) runCtl.autoPause(); });
  gamePlatform.onDisplayChange(() => { runCtl.resetJoystick(); updateEnv(); });

  // -- boot ---------------------------------------------------------------------------------------------------------

  updateEnv();
  dialogCtl.updateDisplay();
  runCtl.updateHud();
  homeCtl.open("battle");
  requestFrame();

  // -- bridges: tests, QA page, mini-game adapter ------------------------------------------------------------------

  function render() { fullRedraw = true; renderInterface(); }
  function tap(key) { render(); const ok = uiKit.tapKey(key); render(); return ok; }
  function node(key) { return uiKit.find(key); }
  function text(key) { return uiKit.textOf(uiKit.find(key)); }
  const bridge = {
    get state() { return state; },
    render, tap, node, text, boxes: () => uiKit.boxes(), layers: () => uiKit.layers.map(l => l.key),
    // Painted boxes of one screen's subtree by former DOM path (layout regression checks).
    refBoxes: rootKey => {
      const out = [], root = uiKit.find(rootKey) || (rootKey === "app" ? uiKit.find("appOver") : null);
      const walk = n => {
        if (!n.cs || n.cs.display === "none") return;
        if (n.w == null || n.absX == null) { if (n.ref != null) out.push({ ref: n.ref, tag: n.tag || "", inline: true }); for (const k of n.kids || []) walk(k); return; }
        if (n.ref != null) out.push({ ref: n.ref, tag: n.tag || "", x: n.boxX ?? n.absX, y: n.boxY ?? n.absY, w: n.w, h: n.h });
        for (const k of n.kids || []) walk(k);
      };
      if (root) walk(root);
      return out;
    },
    pointerDown, pointerMove, pointerUp: ev => pointerUp(ev, false), pointerCancel: ev => pointerUp(ev, true), wheel,
    keyDown, keyUp, pauseForHidden: () => runCtl.autoPause(),
    resize: () => { updateEnv(); dialogCtl.updateDisplay(); },
    kit: uiKit, home: homeCtl, run: runCtl, dialogs: dialogCtl, presentation,
    battlefield, version: GAME_VERSION, stats,
  };
  G.EndlessRailsCanvasHost = bridge;
  G.EndlessRailsGame = {
    startRun: beginRun, extractRun: () => runCtl.extractRun(), getState: () => state,
    reloadSave: () => { if (["menu", "result"].includes(state.mode)) { state.metaProfile = longterm.loadMeta(metaStorage); state.record = runRecord.loadRecord(metaStorage); } },
  };
  G.EndlessRailsMetaUI = { open: tab => homeCtl.open(tab), close: () => homeCtl.close(), start: () => homeCtl.start(), refresh: () => homeCtl.refresh(), render: () => homeCtl.render(), selectTab: name => homeCtl.selectTab(name), getTab: () => homeCtl.getTab() };
  G.EndlessRailsSettings = { refresh: () => uiKit.invalidate() };
  // QA surface: qa.js inspects the live game through the iframe window.
  Object.assign(G, { update, draw, beginRoute, updateHud: runCtl.updateHud, openLevelUp: runCtl.openLevelUp, chooseLevelUp: runCtl.chooseLevelUp, arriveStation: runCtl.arriveStation, extractRun: () => runCtl.extractRun(), syncSwarm, cameraView });
  return bridge;
})();

export { canvasHost };
