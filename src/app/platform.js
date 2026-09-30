"use strict";
// Platform services for the canvas presentation. The browser shell and the
// mini-game adapter differ only here: viewport metrics, offscreen canvases,
// images, fullscreen / install, text prompts, lifecycle events and the
// cursor. Browser APIs are always feature-checked so the module evaluates in
// a document-less runtime (tests, WeChat/TapTap mini-games); an adapter may
// install overrides on globalThis.__endlessRailsPlatform before boot.

const gamePlatform = (() => {
  const G = typeof globalThis !== "undefined" ? globalThis : {};
  const win = typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null;
  const doc = typeof document !== "undefined" && document && typeof document.addEventListener === "function" ? document : null;
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const override = () => G.__endlessRailsPlatform || {};
  let installOffer = null;
  const listeners = { display: new Set() };

  function media(query) {
    try { return !!(win && win.matchMedia && win.matchMedia(query).matches); } catch { return false; }
  }
  // Viewport in CSS pixels, device pixel ratio and safe-area insets.
  function viewport() {
    if (override().viewport) return override().viewport();
    const vv = win && win.visualViewport;
    const w = (win && win.innerWidth) || 390, h = (win && win.innerHeight) || 844;
    const safe = G.__endlessRailsSafeArea ? G.__endlessRailsSafeArea() : { top: 0, right: 0, bottom: 0, left: 0 };
    return { w, h, dpr: Math.min(3, (win && win.devicePixelRatio) || 1), safe, zoom: vv ? vv.scale : 1 };
  }
  function pointerFine() { return override().pointerFine !== undefined ? override().pointerFine : media("(pointer: fine)"); }
  function hoverCapable() { return override().hover !== undefined ? override().hover : media("(hover: hover)"); }
  function reducedMotion() { return media("(prefers-reduced-motion: reduce)"); }
  function standalone() {
    if (override().standalone !== undefined) return !!override().standalone;
    return !!(media("(display-mode: standalone)") || media("(display-mode: fullscreen)") || (nav && nav.standalone));
  }
  function isFullscreen() { if (override().isFullscreen) return !!override().isFullscreen(); return !!(doc && (doc.fullscreenElement || doc.webkitFullscreenElement)); }
  async function requestFullscreen() {
    if (override().requestFullscreen) return override().requestFullscreen();
    const root = doc && doc.documentElement;
    const request = root && (root.requestFullscreen || root.webkitRequestFullscreen);
    if (!request) throw new Error("fullscreen_unavailable");
    await request.call(root);
  }
  async function exitFullscreen() {
    if (override().exitFullscreen) return override().exitFullscreen();
    const exit = doc && (doc.exitFullscreen || doc.webkitExitFullscreen);
    if (exit) await exit.call(doc);
  }
  function fullscreenSupported() { if (override().requestFullscreen) return true; const root = doc && doc.documentElement; return !!(root && (root.requestFullscreen || root.webkitRequestFullscreen)); }
  function hasInstallOffer() { return override().installOffer ? !!override().installOffer() : !!installOffer; }
  async function install() {
    const offer = installOffer; installOffer = null;
    if (!offer) throw new Error("no_offer");
    await offer.prompt(); await offer.userChoice;
  }
  // Desktop browsers with a mouse draw space-taking scrollbars; touch
  // devices and macOS use overlay scrollbars that take no layout space.
  function classicScrollbars() {
    if (override().overlayScrollbars !== undefined) return !override().overlayScrollbars;
    const mac = !!nav && /Mac/.test(nav.platform || nav.userAgent || "");
    return pointerFine() && !mac && !!doc;
  }
  function isApple() {
    if (override().apple !== undefined) return !!override().apple;
    return !!nav && (/iPhone|iPad|iPod/.test(nav.userAgent || "") || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1));
  }
  // Offscreen drawing surfaces (battlefield, cached layers, blur scratch).
  function createCanvas(w, h) {
    if (override().createCanvas) return override().createCanvas(w, h);
    if (typeof OffscreenCanvas !== "undefined") { try { return new OffscreenCanvas(Math.max(1, w), Math.max(1, h)); } catch {} }
    if (doc && doc.createElement) { const c = doc.createElement("canvas"); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
    return null;
  }
  function createImage() {
    if (override().createImage) return override().createImage();
    return typeof Image !== "undefined" ? new Image() : null;
  }
  // Text entry without DOM inputs: the browser prompt / the mini-game modal.
  function promptText(title, value, done) {
    if (override().promptText) { override().promptText(title, value, done); return; }
    if (typeof G.wx !== "undefined" && G.wx.showModal) {
      G.wx.showModal({ title, editable: true, placeholderText: value, content: value, success: r => done(r.confirm ? r.content : null) });
      return;
    }
    const p = win && win.prompt;
    done(typeof p === "function" ? p.call(win, title, value) : null);
  }
  function confirmAction(message) {
    if (override().confirm) return override().confirm(message);
    const c = win && win.confirm;
    return typeof c === "function" ? c.call(win, message) : null;
  }
  function hasConfirm() { return !!(override().confirm || (win && typeof win.confirm === "function")); }
  function setCursor(canvas, cursor) {
    if (canvas && canvas.style && canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  }
  function onDisplayChange(fn) { listeners.display.add(fn); }
  function emitDisplay() { for (const fn of listeners.display) fn(); }
  if (win) {
    win.addEventListener("beforeinstallprompt", event => { event.preventDefault?.(); installOffer = event; });
    win.addEventListener("appinstalled", () => { installOffer = null; emitDisplay(); });
    win.addEventListener("resize", emitDisplay);
    win.visualViewport?.addEventListener?.("resize", emitDisplay);
  }
  if (doc) {
    doc.addEventListener("fullscreenchange", emitDisplay);
    doc.addEventListener("webkitfullscreenchange", emitDisplay);
  }
  // the page's own canvas (index.html also hands it over as __endlessRailsCanvas)
  function pageCanvas() { return doc && doc.getElementById ? doc.getElementById("gameCanvas") : null; }

  return {
    win, doc, media, viewport, pointerFine, hoverCapable, reducedMotion, standalone,
    isFullscreen, requestFullscreen, exitFullscreen, fullscreenSupported, hasInstallOffer, install, isApple, classicScrollbars,
    createCanvas, createImage, promptText, confirmAction, hasConfirm, setCursor, onDisplayChange, pageCanvas,
  };
})();

export { gamePlatform };
