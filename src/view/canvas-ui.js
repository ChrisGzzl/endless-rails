"use strict";
// Canvas HUD and flow screens, redrawn 1:1 against the DOM page. All geometry,
// colors and type come from computed-style dumps of the real overlays at the
// 420x800 reference frame (battle-ui / edge-ui / sand-ui / reference-ui theme
// cascade). Sprite chrome uses the same atlases as the CSS (ui-assets.js);
// every tappable element reports a hit region for the host's pointer router.

import { paintUiIcon, paintWeaponIcon, paintPrimarySkin } from "./ui-assets.js";
import { canvas } from "./surface.js";
import { upgradeFamily } from "../sim/station.js";

const T = {
  paper: "#E9E1CE", card: "#F8EFDE", ink: "#102F3A", muted: "#596B6D",
  terminal: "#ECE3D0", terminalEdge: "#FFF6DF", cardFace: "#FBF2E1", line: "#D3C7AF",
  slateBlue: "#47688B", gold: "#FFC84C", cream: "#FFEDB8",
  panel: "#173D49DF", panelEdge: "rgba(124,165,191,0.5)",
  hudWashA: "#153943F0", hudWashB: "#153943B5",
  track: "#0D2637", routeFill: "#D9BC74", xpFill: "#6AC8E5",
  hpFill: "#49CB62", bossFill: "#F17663",
  eyebrow: "#8B6538", eyebrowDot: "#BA7A42",
  families: { blue: "#48BDFF", purple: "#BB8AFF", red: "#FF786E", cyan: "#48E1DB", default: "#39BFFF" },
};

// Transient HUD messages, wired to the engine presentation hooks by the host.
const toastState = { text: "", life: 0 };
const comboState = { text: "", life: 0 };
function setToast(text) { toastState.text = text || ""; toastState.life = text ? 2.2 : 0; }
function setCombo(text) { comboState.text = text || ""; comboState.life = 1.1; }
function tickFx(dt) {
  if (toastState.life > 0) toastState.life -= dt;
  if (comboState.life > 0) comboState.life -= dt;
}

function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function box(c, color, x, y, w, h, r = 0) { rr(c, x, y, w, h, r); c.fillStyle = color; c.fill(); }
function strokeBox(c, color, lw, x, y, w, h, r = 0) { c.strokeStyle = color; c.lineWidth = lw; rr(c, x, y, w, h, r); c.stroke(); }
function text(c, str, x, y, size, color, { align = "left", weight = "", baseline = "middle", alpha = 1, italic = false, mono = false, ls = "" } = {}) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  const family = mono ? "ui-monospace,monospace" : '"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';
  c.font = `${italic ? "italic " : ""}${weight ? weight + " " : ""}${size}px ${family}`;
  if (ls) c.letterSpacing = ls;
  c.textAlign = align; c.textBaseline = baseline;
  c.fillText(str, x, y);
  if (ls) c.letterSpacing = "0px";
  c.restore();
}
function measure(c, str, size, weight = "", mono = false) {
  const family = mono ? "ui-monospace,monospace" : '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  c.font = `${weight ? weight + " " : ""}${size}px ${family}`;
  return c.measureText(str).width;
}
function wrap(c, str, maxW, size, weight = "") {
  c.font = `${weight ? weight + " " : ""}${size}px "PingFang SC","Microsoft YaHei",sans-serif`;
  const lines = []; let line = "";
  for (const ch of String(str)) {
    if (ch === "\n") { lines.push(line); line = ""; continue; }
    if (c.measureText(line + ch).width > maxW) { lines.push(line); line = ch; } else line += ch;
  }
  lines.push(line);
  return lines;
}
function gradV(c, x, y0, y1, stops) {
  const g = c.createLinearGradient(x, y0, x, y1);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  return g;
}
function panelShadow(c, x, y, w, h, r, color, blur, dy) {
  c.save();
  if (c.shadowColor !== undefined) { c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetY = dy; }
  rr(c, x, y, w, h, r); c.fillStyle = T.terminal; c.fill();
  c.restore();
}
// The shared launch button octagon clip lives in canvas-home; flow buttons
// keep the plain 3px-radius plate the DOM sheets use.// ---------------------------------------------------------------------------
// Overlay backdrop: the DOM sheets sit on backdrop-filter: blur(5px) over the
// frozen battlefield. A canvas cannot blur what it has already painted, so
// while an overlay is up we replay a pristine battlefield+HUD snapshot each
// frame (also fixing translucent-wash accumulation on the persisted frame),
// then optionally blur it by downsampling and scaling back with bilinear
// smoothing - a close visual match to a 5px gaussian at a fraction of the cost.
const backdrop = { snap: null, blur: null, key: "" };

function makeScratch(width, height) {
  let scratch = null;
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    scratch = document.createElement("canvas");
  } else if (typeof OffscreenCanvas !== "undefined") {
    scratch = new OffscreenCanvas(width, height);
  }
  if (scratch) { scratch.width = width; scratch.height = height; }
  return scratch;
}
function scratchContext(scratch) {
  try { return scratch.getContext("2d"); } catch { return null; }
}

function resetOverlayBackdrop() { backdrop.key = ""; }

function overlayBackdrop(u, key, blur) {
  const { c, vw, vh } = u;
  if (!canvas || typeof canvas.width !== "number" || !canvas.width) return;
  if (backdrop.key !== key || !backdrop.snap) {
    const snap = makeScratch(canvas.width, canvas.height);
    const sctx = snap && scratchContext(snap);
    if (!sctx || typeof sctx.drawImage !== "function") { backdrop.key = ""; backdrop.snap = null; return; }
    try { sctx.drawImage(canvas, 0, 0); } catch { backdrop.key = ""; backdrop.snap = null; return; }
    backdrop.snap = snap; backdrop.key = key;
  }
  // Replay the pristine frame in device pixels, then blur over it.
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(backdrop.snap, 0, 0);
  c.restore();
  if (!blur) return;
  const bw = Math.max(2, Math.round(vw / 6)), bh = Math.max(2, Math.round(vh / 6));
  if (!backdrop.blur || backdrop.blur.width !== bw || backdrop.blur.height !== bh) {
    const blurCanvas = makeScratch(bw, bh);
    if (!blurCanvas || !scratchContext(blurCanvas)) { backdrop.blur = null; return; }
    backdrop.blur = blurCanvas;
  }
  const bctx = scratchContext(backdrop.blur);
  bctx.clearRect(0, 0, bw, bh);
  bctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, bw, bh);
  c.save();
  c.imageSmoothingEnabled = true;
  c.drawImage(backdrop.blur, 0, 0, bw, bh, 0, 0, vw, vh);
  c.restore();
}

// ---------------------------------------------------------------------------
// Battle HUD (computed dump: pause 38x38 @10,8.5; timer box 76x38 @55,8.5;
// progress strip 207 wide @138,13; scrap 58x63 @352,8; ER 28x20 @15,51;
// station 76 @55,52.3; hull 310x46 @10,742; swarm chip @10,711; pulse 54 @354,732).

function swarmCount(state) { try { return state.swarm.length; } catch { return 0; } }

function drawHud(u, state, registerRegion) {
  const { c, X, Y, F, vw, vh } = u;
  const paused = state.paused;
  // Header wash: petrol gradient fading out over the battlefield.
  c.fillStyle = gradV(c, 0, 0, Y(88), [[0, T.hudWashA], [0.85, T.hudWashB], [1, "rgba(21,57,67,0)"]]);
  c.fillRect(0, 0, vw, Y(88));
  // Pause button.
  box(c, T.panel, X(10), Y(8.5), X(38), Y(38), X(4));
  strokeBox(c, T.panelEdge, Math.max(1, X(0.5)), X(10), Y(8.5), X(38), Y(38), X(4));
  text(c, paused ? "▶" : "Ⅱ", X(29), Y(27.5), F(20), "#E5F4F2", { align: "center", weight: "800" });
  registerRegion({ x: X(10), y: Y(8.5), w: X(38), h: Y(38), action: "pause" });
  // Timer box: monospace seconds with a unit suffix.
  box(c, T.panel, X(55), Y(8.5), X(76), Y(38), X(4));
  const timer = Math.max(0, state.timer).toFixed(1);
  const tw = measure(c, timer, F(22), "800", true);
  text(c, timer, X(93) - F(4), Y(27.5), F(22), "#FFFFFF", { align: "center", weight: "800", mono: true });
  text(c, "s", X(93) - F(4) + tw / 2 + F(5), Y(29), F(11), "#A8D1E8", { weight: "800", mono: true });
  // Route + experience instruments (labels above 7px tracks).
  const arrived = state.mode === "docking" || state.mode === "station";
  const total = Math.max(1, state.routeDistanceTotal || 0);
  const routePercent = arrived ? 100 : Math.min(100, Math.max(0, (total - state.routeDistance) / total * 100));
  const xpPercent = Math.min(100, Math.max(0, state.experience / Math.max(1, state.experienceToNext) * 100));
  text(c, arrived ? "行程 · 已抵达车站" : `行程 · 已完成 ${Math.floor(routePercent)}%`, X(138), Y(20), F(10), "#FFFFFF", { weight: "700" });
  box(c, T.track, X(138), Y(30), X(207), Y(7), Y(3.5));
  if (routePercent > 0) box(c, T.routeFill, X(138), Y(30), X(207) * routePercent / 100, Y(7), Y(3.5));
  text(c, `经验 Lv.${state.level} · ${Math.floor(state.experience)} / ${state.experienceToNext}`, X(138), Y(49), F(10), "#FFFFFF", { weight: "700" });
  box(c, T.track, X(138), Y(59), X(207), Y(7), Y(3.5));
  if (xpPercent > 0) box(c, T.xpFill, X(138), Y(59), X(207) * xpPercent / 100, Y(7), Y(3.5));
  // Scrap panel, top-right.
  box(c, T.panel, X(352), Y(8), X(58), Y(63), X(4));
  text(c, "废料", X(381), Y(24), F(10), "#B5CBD8", { align: "center" });
  text(c, String(state.scrap).padStart(3, "0"), X(381), Y(44), F(16), "#FFD46C", { align: "center", weight: "700", mono: true });
  // Second row: ER badge (GM entry on the web page) and station counter.
  box(c, "#315A72", X(15), Y(51), X(28), Y(20), X(4));
  text(c, "ER", X(29), Y(61), F(9), "#FFFFFF", { align: "center", weight: "700", mono: true });
  text(c, "站 ", X(93) - F(2), Y(59.8), F(10), "#A3C7D9", { align: "right" });
  text(c, String(Math.min(state.station, 5)).padStart(2, "0") + " / 05", X(93) + F(14), Y(61), F(12), "#D8E8F0", { align: "left", weight: "700", mono: true });
  // Fullscreen button (drawn for parity; fullscreen stays a web-page control).
  box(c, "#24465CDE", X(374), Y(83), X(36), Y(34), X(4));
  paintUiIcon(c, "fullscreen", X(380), Y(88), X(24), X(24));
  // Objective capsule below the header.
  const objective = state.mode === "docking" ? "防卫炮台清场 · 列车减速进站" : state.mode === "station" ? "安全区 · 列车已停稳" : state.station === 5 ? "守住列车，抵达终点防区" : "护送列车抵达下一站";
  const ow = measure(c, objective, F(12), "700") + X(37);
  box(c, T.panel, X(10), Y(83), ow, Y(31.6), X(4));
  strokeBox(c, "rgba(169,205,221,0.3)", Math.max(1, X(0.5)), X(10), Y(83), ow, Y(31.6), X(4));
  c.strokeStyle = "#5BDDFA"; c.lineWidth = X(2);
  c.beginPath(); c.arc(X(25), Y(98.8), X(4), 0, Math.PI * 2); c.stroke();
  text(c, objective, X(37), Y(98.8), F(12), "#FFFFFF", { weight: "700" });
  // Boss bar while a beast lives.
  if (state.boss && !state.boss.dead) {
    box(c, "#18334BDC", X(10), Y(126), X(245), Y(46), X(4));
    text(c, "感染巨兽", X(19), Y(141), F(11), "#E8F5FB");
    text(c, Math.ceil(state.boss.hp / state.boss.maxHp * 100) + "%", X(246), Y(141), F(11), "#FFFFFF", { align: "right", weight: "600", mono: true });
    box(c, "#0C2833", X(19), Y(153), X(225), Y(8), Y(4));
    box(c, T.bossFill, X(19), Y(153), X(225) * Math.max(0, state.boss.hp / state.boss.maxHp), Y(8), Y(4));
  }
  // Combo (right rail) and toast (centered strip).
  if (comboState.life > 0) {
    c.save();
    if (c.shadowColor !== undefined) { c.shadowColor = "#263342"; c.shadowBlur = X(2); c.shadowOffsetY = X(1); }
    text(c, comboState.text, vw - X(12), Y(146), F(20), "#FFFFFF", { align: "right", weight: "800", mono: true });
    c.restore();
  }
  if (toastState.life > 0) {
    c.save();
    c.globalAlpha = Math.min(1, toastState.life / 0.4);
    const tw2 = measure(c, toastState.text, F(17), "700") + X(36);
    box(c, "rgba(16,39,51,0.867)", vw / 2 - tw2 / 2, Y(184), tw2, Y(48), X(7));
    strokeBox(c, "rgba(140,181,187,0.2)", 1, vw / 2 - tw2 / 2, Y(184), tw2, Y(48), X(7));
    text(c, toastState.text, vw / 2, Y(208), F(17), "#E9E1CE", { align: "center", weight: "700" });
    c.restore();
  }
  // Touch hint.
  if (state.mode === "combat" && !paused && toastState.life <= 0 && state.visualTime < 8) {
    const hw = measure(c, "按住滑动 · 自动开火", F(12)) + X(20);
    box(c, "#173249B8", vw / 2 - hw / 2, Y(610), hw, Y(37.6), X(4));
    text(c, "按住滑动 · 自动开火", vw / 2, Y(629), F(12), "#E8F0E8", { align: "center" });
  }
  // Swarm chip and hull strip, bottom-left.
  box(c, T.panel, X(10), Y(711), X(58.4), Y(20), X(4));
  text(c, "蜂群", X(16), Y(721), F(10), "#BDcFD3".toUpperCase());
  text(c, (1 + swarmCount(state)) + " 架", X(40), Y(721), F(11), "#FFFFFF", { weight: "600", mono: true });
  box(c, T.panel, X(10), Y(742), X(310), Y(46), X(4));
  strokeBox(c, "rgba(168,203,209,0.48)", Math.max(1, X(0.5)), X(10), Y(742), X(310), Y(46), X(4));
  text(c, "列车完整度", X(21), Y(758.5), F(11), "#E8F5FB");
  const hpText = `${Math.ceil(state.trainHp)}/${state.maxTrainHp}`;
  text(c, hpText, X(299), Y(758.5), F(11), "#FFFFFF", { align: "right", weight: "600", mono: true });
  const hpRatio = Math.max(0, state.trainHp / state.maxTrainHp);
  box(c, "#0C2833", X(21), Y(771), X(288), Y(8), Y(4));
  if (hpRatio > 0) box(c, T.hpFill, X(21), Y(771), X(288) * hpRatio, Y(8), Y(4));
  // Pulse skill: ringed disc with sprite and bottom-fill cooldown.
  const px = X(354), py = Y(732), pd = X(54);
  c.save();
  if (c.shadowColor !== undefined) { c.shadowColor = "#193444BD"; c.shadowBlur = X(3); }
  c.beginPath(); c.arc(px + pd / 2, py + pd / 2, pd / 2 + X(1.5), 0, Math.PI * 2); c.fillStyle = "#193444BD"; c.fill();
  c.restore();
  const rg = c.createRadialGradient(px + pd * 0.4, py + pd * 0.3, pd * 0.1, px + pd / 2, py + pd / 2, pd * 0.75);
  rg.addColorStop(0, "#28677B"); rg.addColorStop(1, "#102D44");
  c.beginPath(); c.arc(px + pd / 2, py + pd / 2, pd / 2, 0, Math.PI * 2); c.fillStyle = rg; c.fill();
  c.strokeStyle = state.pulseClock > 0 ? "#8DA7B0" : "#75D8F0"; c.lineWidth = X(2);
  c.beginPath(); c.arc(px + pd / 2, py + pd / 2, pd / 2 - X(1), 0, Math.PI * 2); c.stroke();
  if (state.pulseClock > 0) {
    c.save();
    c.beginPath(); c.arc(px + pd / 2, py + pd / 2, pd / 2 - X(2), 0, Math.PI * 2); c.clip();
    const cool = Math.min(1, state.pulseClock / 7);
    c.fillStyle = "#081C2CCC";
    c.fillRect(px, py + pd * (1 - cool), pd, pd * cool);
    c.restore();
  }
  paintUiIcon(c, "pulse", px + X(13), py + Y(3), X(28), X(28));
  text(c, "脉冲", px + pd / 2, py + Y(44), F(9), "#E5FFFF", { align: "center", weight: "800" });
  registerRegion({ x: px, y: py, w: pd, h: pd, action: "pulse" });
  // Claim prompt ("强化 ×N") stacked above the pulse disc like the skill rail.
  const claimVisible = state.pendingLevelUps > 0 && state.mode === "combat" && !paused;
  if (claimVisible) {
    const cy = py - Y(64);
    c.save();
    if (c.shadowColor !== undefined) { c.shadowColor = "#193444BD"; c.shadowBlur = X(3); }
    c.beginPath(); c.arc(px + pd / 2, cy + Y(27), X(27), 0, Math.PI * 2); c.fillStyle = "#5C3E25"; c.fill();
    c.restore();
    c.strokeStyle = "#FFD36A"; c.lineWidth = X(3);
    c.beginPath(); c.arc(px + pd / 2, cy + Y(27), X(25.5), 0, Math.PI * 2); c.stroke();
    text(c, "✦", px + pd / 2, cy + Y(18), F(21), "#FFE07B", { align: "center", weight: "700" });
    text(c, "强化 ×" + state.pendingLevelUps, px + pd / 2, cy + Y(39), F(10), "#E5FFFF", { align: "center", weight: "800" });
    registerRegion({ x: px, y: cy, w: pd, h: Y(54), action: "claim" });
  }
  // Joystick visual while dragging.
  if (hostStick.visible) {
    c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = Math.max(1, X(2));
    c.beginPath(); c.arc(hostStick.cx, hostStick.cy, hostStick.radius, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "rgba(255,255,255,0.75)";
    c.beginPath(); c.arc(hostStick.cx + hostStick.dx, hostStick.cy + hostStick.dy, hostStick.radius * 0.42, 0, Math.PI * 2); c.fill();
  }
}
const hostStick = { visible: false, cx: 0, cy: 0, dx: 0, dy: 0, radius: 36 };
function setStickVisual(value) { Object.assign(hostStick, value); }

// ---------------------------------------------------------------------------
// Shared paper-terminal scaffolding for contract / route / station sheets.

function terminalHeading(u, x, y, w, { eyebrow, title, copy }) {
  const { c, X, Y, F } = u;
  fillEyebrow(u, x, y, eyebrow);
  text(c, title, x, y + Y(40), F(title.length > 6 ? 25 : 27), T.ink, { weight: "900" });
  if (copy) text(c, copy, x, y + Y(72), F(12), "#556761");
  return y + Y(92.3);
}
function fillEyebrow(u, x, y, eyebrow) {
  const { c, X, Y, F } = u;
  box(c, T.eyebrowDot, x, y + Y(4.5), X(5), Y(5), X(1));
  text(c, eyebrow, x + X(12), y + Y(7), F(10), T.eyebrow, { mono: true, ls: "0.1em" });
}
// A 352x78 selection card: 43px sprite icon, title, optional Lv chip, copy.
function drawChoiceCard(u, x, y, w, h, card, registerRegion) {
  const { c, X, Y, F } = u;
  box(c, T.cardFace, x, y, w, h, X(5));
  strokeBox(c, T.line, 1, x, y, w, h, X(5));
  if (card.selected) {
    box(c, "#E0AD3B", x + X(3), y + Y(8), X(3), h - Y(16), X(1));
    strokeBox(c, "#E0AD3B", 1, x, y, w, h, X(5));
  }
  const painted = card.iconWeapon
    ? paintWeaponIcon(c, card.iconWeapon, x + X(11), y + Y(17.5), X(43), X(43))
    : paintUiIcon(c, card.iconId || "supply", x + X(11), y + Y(17.5), X(43), X(43));
  if (!painted) text(c, card.icon || "◆", x + X(32.5), y + h / 2, F(18), "#805831", { align: "center", weight: "700" });
  if (card.counter != null) text(c, card.counter, x + X(32.5), y + h / 2, F(20), "#805831", { align: "center", weight: "750", mono: true });
  text(c, card.title, x + X(60), y + Y(26.3), F(15), T.ink, { weight: "700" });
  if (card.tag) text(c, card.tag, x + X(60) + measure(c, card.title, F(15), "700") + X(8), y + Y(26.3), F(11), "#805F3B", { weight: "700", mono: true });
  let sy = y + Y(51.3);
  for (const line of wrap(c, card.sub || "", w - X(74), F(11))) {
    text(c, line, x + X(60), sy, F(11), T.muted); sy += Y(16.5);
  }
  registerRegion({ x, y, w, h, action: card.action });
}
function drawPrimaryButton(u, x, y, w, h, label, { size = 12, disabled = false } = {}, registerRegion, action) {
  const { c, X, Y, F } = u;
  box(c, "#21333A", x, y, w, h, X(3));
  paintPrimarySkin(c, x, y, w, h);
  text(c, label, x + w / 2, y + h / 2, F(size), disabled ? "rgba(255,237,184,0.55)" : "#FFEDB8", { align: "center", weight: "650" });
  if (!disabled) registerRegion({ x, y, w, h, action });
}
function drawGhostButton(u, x, y, w, h, label, registerRegion, action, { size = 12 } = {}) {
  const { c, X, Y, F } = u;
  box(c, "#FCF2DD", x, y, w, h, X(4));
  strokeBox(c, "#C8BAA0", 1, x, y, w, h, X(4));
  text(c, label, x + w / 2, y + h / 2, F(size), T.ink, { align: "center" });
  registerRegion({ x, y, w, h, action });
}

// Contract / route sheets: centered paper terminal with three stacked cards.
function drawCardListScreen(u, state, spec, registerRegion) {
  const { c, X, Y, F, vw, vh } = u;
  c.fillStyle = "rgba(14,39,57,0.36)";
  c.fillRect(0, 0, vw, vh);
  const px = X(16), py = Y(193.9), pw = vw - X(32), ph = Y(422.3);
  panelShadow(c, px, py, pw, ph, X(6), "rgba(14,38,61,0.27)", X(12), X(12) * 4);
  strokeBox(c, T.terminalEdge, 1, px, py, pw, ph, X(6));
  let y = terminalHeading(u, X(34), Y(211.9), pw - X(34), spec);
  const cardW = pw - X(36), cardH = Y(78), gap = Y(6);
  (spec.cards || []).forEach((card, i) => {
    drawChoiceCard(u, X(34), y + i * (cardH + gap), cardW, cardH, card, registerRegion);
  });
  // Footer: status dot left, count label right, hairline on top.
  const fy = py + ph - Y(48.1);
  c.strokeStyle = "#C8BBA4"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(X(34), fy); c.lineTo(X(34) + cardW, fy); c.stroke();
  c.fillStyle = "#9DDFCF";
  c.beginPath(); c.arc(X(38), fy + Y(14), X(2), 0, Math.PI * 2); c.fill();
  text(c, spec.footer || "", X(46), fy + Y(14), F(10), "#546661");
  text(c, spec.footerRight || "三选一", X(34) + cardW, fy + Y(14), F(10), "#788078", { align: "right" });
}

// ---------------------------------------------------------------------------
// Level-up: bottom sheet with the hull readout tabbed above it.
function drawLevelUpScreen(u, state, host, registerRegion) {
  const { c, X, Y, F, vw, vh } = u;
  c.fillStyle = "rgba(16,46,59,0.25)";
  c.fillRect(0, 0, vw, vh);
  const px = X(10), py = Y(610), pw = vw - X(20), ph = Y(178);
  box(c, "rgba(233,225,206,0.875)", px, py, pw, ph, X(6));
  strokeBox(c, "#FFF4DB", 1, px, py, pw, ph, X(6));
  // Hull readout rides above the sheet (dark chip, centered).
  const hx = X(55), hy = Y(569), hw = X(310), hh = Y(34);
  box(c, "#1C3A4FEF", hx, hy, hw, hh, X(4));
  strokeBox(c, "rgba(170,201,206,0.6)", 1, hx, hy, hw, hh, X(4));
  paintUiIcon(c, "train", hx + X(11), hy + Y(5), X(24), X(24));
  text(c, "列车耐久", hx + X(43), hy + Y(9.5), F(11), "#F1FAFC", { weight: "700" });
  box(c, "#0B2835", hx + X(95), hy + Y(12.5), X(149.6), Y(9), Y(4.5));
  box(c, "#4DCB65", hx + X(95), hy + Y(12.5), X(149.6) * Math.max(0, state.trainHp / state.maxTrainHp), Y(9), Y(4.5));
  text(c, `${Math.ceil(state.trainHp)} / ${state.maxTrainHp}`, hx + hw - X(12), hy + Y(11.5), F(10), "#F1FAFC", { align: "right", weight: "700", mono: true });
  // Heading row: centered h2 + fleet-data entry at the right edge.
  const breakthrough = !!host.breakthrough;
  text(c, breakthrough ? "Lv10 突破路线" : "选择升级", px + pw / 2 - X(38), py + Y(13.5), F(20), T.ink, { weight: "850" });
  drawGhostButton(u, px + pw - X(87), py + Y(2), X(76), Y(28), "查看机队数据", registerRegion, "pause", { size: 10 });
  // Cards: three across (two for breakthrough), vertical icon-then-text cells.
  const picks = breakthrough ? host.breakthrough.options : (host.levelPicks || []);
  const count = picks.length || 1;
  const gap = X(7), listX = px + X(11), listW = pw - X(22);
  const cw = (listW - gap * (count - 1)) / count;
  picks.forEach((pick, i) => {
    const x = listX + i * (cw + gap), y = py + Y(45), ch = Y(122);
    const family = breakthrough ? upgradeFamily[host.breakthrough.weapon] : upgradeFamily[pick.id];
    const glow = T.families[family] || T.families.default;
    box(c, T.cardFace, x, y, cw, ch, X(4));
    c.strokeStyle = glow; c.lineWidth = 1; rr(c, x, y, cw, ch, X(4)); c.stroke();
    c.fillStyle = glow; c.fillRect(x + X(1), y, cw - X(2), Y(4));
    const iconW = X(46), iconH = Y(42);
    const painted = breakthrough
      ? paintUiIcon(c, pick.id, x + (cw - iconW) / 2, y + Y(12), iconW, iconH)
      : paintWeaponIcon(c, pick.id, x + (cw - iconW) / 2, y + Y(12), iconW, iconH);
    if (!painted) text(c, pick.icon || "◉", x + cw / 2, y + Y(33), F(24), glow, { align: "center", weight: "700" });
    const scope = pick.scope || null;
    if (scope) text(c, scope, x + cw - X(5), y + Y(8), F(8), "#E1EDF2", { align: "right" });
    const title = pick.name;
    text(c, title, x + cw / 2, y + Y(67), F(12), T.ink, { align: "center", weight: "800" });
    if (!breakthrough) {
      const lv = "Lv." + (pick.level || 1);
      const lw = measure(c, lv, F(10), "500", true) + X(12);
      box(c, "#E6DDCB", x + (cw - lw) / 2, y + Y(77), lw, Y(15), X(2));
      text(c, lv, x + cw / 2, y + Y(84.5), F(10), "#37535A", { align: "center", mono: true });
    }
    const briefLines = wrap(c, pick.desc || pick.brief || "", cw - X(10), F(10));
    let by2 = breakthrough ? y + Y(88) : y + Y(98);
    for (const line of briefLines.slice(0, breakthrough ? 3 : 2)) {
      text(c, line, x + cw / 2, by2, F(10), "#526568", { align: "center" }); by2 += Y(14);
    }
    registerRegion({ x, y, w: cw, h: ch, action: breakthrough ? { breakthrough: pick } : { upgrade: pick } });
  });
}

// ---------------------------------------------------------------------------
// Station: taller paper terminal with reroll, salvage and the decision row.
function drawStationScreen(u, state, host, registerRegion) {
  const { c, X, Y, F, vw, vh } = u;
  c.fillStyle = "rgba(14,39,57,0.36)";
  c.fillRect(0, 0, vw, vh);
  const px = X(12), py = Y(155), pw = vw - X(24), ph = Y(490);
  panelShadow(c, px, py, pw, ph, X(6), "rgba(14,38,61,0.27)", X(12), X(12) * 4);
  strokeBox(c, T.terminalEdge, 1, px, py, pw, ph, X(6));
  fillEyebrow(u, X(30), Y(173), `安全停靠 · ${String(state.station).padStart(2, "0")} / 04`);
  text(c, "车站大升级", X(30), Y(213.9), F(25), T.ink, { weight: "900" });
  text(c, "免费选择一项 · 列车完整度已修复", X(30), Y(242.5), F(12), "#556761");
  drawGhostButton(u, X(294), Y(198), X(96), Y(32), "查看机队数据", registerRegion, "pause", { size: 12 });
  const cardW = pw - X(36), cardH = Y(78), gap = Y(6);
  (host.stationData?.picks || []).forEach((pick, i) => {
    drawChoiceCard(u, X(30), Y(270.2) + i * (cardH + gap), cardW, cardH, {
      iconId: pick.id, icon: pick.icon,
      title: pick.name, tag: "Lv." + ((pick.level ?? 1)),
      sub: pick.desc, selected: state.selectedUpgrade?.id === pick.id,
      action: { stationUpgrade: pick },
    }, registerRegion);
  });
  // Reroll + salvage + decision row, matching the measured footer rows.
  const ry = Y(524.2);
  const rerollDisabled = state.rerollUsed || state.scrap < 15;
  if (rerollDisabled) {
    box(c, "#E9E2D3", X(30), ry, cardW, Y(33.8), X(4));
    strokeBox(c, "#CFC4AE", 1, X(30), ry, cardW, Y(33.8), X(4));
    text(c, state.rerollUsed ? "已重新编排" : "重新抽取 · 15 废料", X(30) + cardW / 2, ry + Y(16.9), F(12), "#778073", { align: "center" });
  } else {
    box(c, "#FCF2DD", X(30), ry, cardW, Y(33.8), X(4));
    strokeBox(c, "#C8BAA0", 1, X(30), ry, cardW, Y(33.8), X(4));
    paintUiIcon(c, "reroll", X(30) + X(150) - X(9), ry + Y(8), X(18), X(18));
    text(c, "重新抽取 · 15 废料", X(30) + cardW / 2 - X(9), ry + Y(16.9), F(12), T.ink, { align: "center" });
    registerRegion({ x: X(30), y: ry, w: cardW, h: Y(33.8), action: "reroll" });
  }
  const secured = host.stationData?.secured;
  if (secured) text(c, `已锁定：废料 ${secured.scrap} · 组件 ${secured.components} · 数据 ${secured.data}。继续失败也保留。`, X(30), Y(570.5), F(10), "#5A6A61");
  drawGhostButton(u, X(30), Y(583), X(127), Y(44), "安全撤离", registerRegion, "extract");
  const continueLabel = state.selectedUpgrade ? "装配并发车 →" : "选择一项免费大升级";
  drawPrimaryButton(u, X(164), Y(583), vw - X(194), Y(44), continueLabel, { disabled: !state.selectedUpgrade }, registerRegion, "depart");
}

// ---------------------------------------------------------------------------
// Result: full-paper sheet, scrolls on small viewports like the DOM page.
function drawResultScreen(u, state, host, registerRegion) {
  const { c, X, Y, F, vw, vh } = u;
  c.fillStyle = T.paper;
  c.fillRect(0, 0, vw, vh);
  const scroll = Math.max(0, host.resultScroll || 0);
  c.save();
  c.beginPath(); c.rect(0, 0, vw, vh); c.clip();
  c.translate(0, -scroll);
  const outcome = state.outcome, won = outcome === "won", extracted = outcome === "extracted";
  const data = host.resultData || {};
  // Badge, eyebrow, display title, copy.
  box(c, "#173E47", vw / 2 - X(29), Y(56), X(58), Y(56), X(6));
  strokeBox(c, "#E6B74D", 2, vw / 2 - X(29), Y(56), X(58), Y(56), X(6));
  paintUiIcon(c, "research", vw / 2 - X(29), Y(56), X(58), Y(56));
  text(c, won ? "远征完成" : extracted ? "安全撤离" : "列车失守", vw / 2, Y(81), F(12), "#91620D", { align: "center", weight: "600", mono: true });
  text(c, won ? "列车穿过了黑夜" : extracted ? "资源已经锁定" : "铁轨被荒原吞没", vw / 2, Y(116), F(25.2), T.ink, { align: "center", weight: "900" });
  const copy = won ? "你完成了区域远征，并将成果带回列车。" : extracted ? "你选择在风险继续扩大前返回基地。" : "已锁定资源被带回，未保护的风险资源发生损失。";
  text(c, copy, vw / 2, Y(153), F(14), T.slateBlue, { align: "center" });
  // Stat trio.
  box(c, T.card, X(21), Y(180), X(363), Y(82), X(5));
  strokeBox(c, "#D2C7AE", 1, X(21), Y(180), X(363), Y(82), X(5));
  const stats = [
    ["击破", String(state.kills)],
    ["抵达", String(won ? 5 : state.longtermRun?.stationsBanked || 0)],
    ["废料", String(state.scrap)],
  ];
  stats.forEach(([label, value], i) => {
    const sx = X(21) + X(60) + i * X(121);
    text(c, label, sx, Y(206), F(11), T.muted, { align: "center" });
    text(c, value, sx, Y(234), F(22), "#246478", { align: "center", weight: "650" });
  });
  // Damage ledger.
  let y = Y(276);
  const dmg = host.resultDamage || { drones: [], bonds: [], train: "0" };
  const rows = [];
  rows.push(["h", "伤害统计"]);
  rows.push(["n", "只计实际扣血；突破后的攻击仍计普攻。蓝色激光单独归入蓝色穿透。"]);
  rows.push(["s", "飞机编队"]);
  if (!dmg.drones.length) rows.push(["r", ["暂无记录", ""]]);
  for (const row of dmg.drones) rows.push(["r", [row.label + " · 普攻", row.damage]]);
  const bonds = (dmg.bonds || []).filter(b => b.casts || b.active);
  if (bonds.length) {
    rows.push(["s", "北辰 · 羁绊攻击"]);
    for (const bond of bonds) rows.push(["r", [bond.name + " · " + bond.stage, "伤害 " + bond.damage]]);
  }
  rows.push(["r", ["车炮　" + dmg.train, ""]]);
  rows.push(["r", ["列车近防　" + (dmg.pointDefense || "0"), ""]]);
  rows.push(["r", ["有效维修　" + (dmg.effectiveRepair || "0"), ""]]);
  let cardH = Y(36);
  for (const [kind] of rows) cardH += kind === "r" ? Y(26) : kind === "s" ? Y(42) : Y(24);
  box(c, T.card, X(21), y, X(363), cardH, X(5));
  strokeBox(c, "#D2C7AE", 1, X(21), y, X(363), cardH, X(5));
  y += Y(28);
  for (const [kind, content] of rows) {
    if (kind === "h") { text(c, content, X(35), y, F(15), T.ink, { weight: "700" }); y += Y(24); }
    else if (kind === "n") { text(c, content, X(35), y, F(11), T.muted); y += Y(24); }
    else if (kind === "s") { text(c, content, X(35), y, F(13), T.ink, { weight: "700" }); y += Y(42); }
    else { text(c, content[0], X(35), y, F(13), "#293B3D"); if (content[1]) text(c, content[1], X(363) - X(14), y, F(13), "#246478", { align: "right", weight: "700" }); y += Y(26); }
  }
  y = Y(276) + cardH + Y(14);
  // Build / meta / record / return.
  text(c, host.resultBuild || "构筑：—", X(21), y + Y(12), F(14), T.slateBlue); y += Y(39);
  const gained = data.settlement?.gained;
  if (gained) {
    const metaLines = [`长期带回：废料 ${gained.scrap} · 技术组件 ${gained.components} · 研究数据 ${gained.data} · 列车 XP +${data.settlement?.trainXp || 0}`];
    const bps = data.settlement?.blueprints || [];
    if (bps.length) metaLines.push("新蓝图：" + bps.map(id => host.blueprintNames?.[id] || id).join(" / "));
    box(c, T.card, X(21), y, X(363), Y(30) + Y(25.2) * metaLines.length, X(5));
    strokeBox(c, "#D2C7AE", 1, X(21), y, X(363), Y(30) + Y(25.2) * metaLines.length, X(5));
    metaLines.forEach((line, i) => text(c, line, X(32), y + Y(22) + i * Y(25.2), F(14), T.slateBlue));
    y += Y(30) + Y(25.2) * metaLines.length + Y(9);
  }
  text(c, `最佳：${state.record.bestStations} 站 · ${state.record.bestCombo} 连杀`, X(21), y + Y(12), F(14), T.slateBlue); y += Y(39);
  drawPrimaryButton(u, X(21), y, X(363), Y(44), "返回出发主页", { size: 15 }, registerRegion, "menu");
  host.resultContentHeight = y + Y(44) + Y(22);
  c.restore();
}

// ---------------------------------------------------------------------------
// Pause: fleet terminal with unit selector, tabs and the paged stat bay.
function drawPauseScreen(u, state, host, registerRegion) {
  const { c, X, Y, F, vw, vh } = u;
  c.fillStyle = "rgba(18,50,60,0.467)";
  c.fillRect(0, 0, vw, vh);
  const px = X(16), py = Y(18), pw = vw - X(32), ph = Y(764);
  panelShadow(c, px, py, pw, ph, X(6), "rgba(14,39,57,0.3)", X(7), X(14) * 3);
  strokeBox(c, "#FFF4D9", 1, px, py, pw, ph, X(6));
  const pause = host.pause || (host.pause = { unitIndex: 1, tab: "weapon", page: 0 });
  const fleet = host.pauseFleet || [];
  const unit = fleet[Math.min(pause.unitIndex, Math.max(0, fleet.length - 1))] || fleet[0];
  // Heading + summary.
  fillEyebrow(u, X(38), Y(40), "战斗暂停 / 机队遥测");
  text(c, "机队战术终端", X(38), Y(79.5), F(27), T.ink, { weight: "900" });
  text(c, host.pauseSummary || "", X(38), Y(113.7), F(12), "#536761");
  // Display quick actions (web-page controls, drawn for parity).
  const acts = [["全屏游玩", X(38), X(135)], ["添加到主屏幕", X(181), X(135)], ["设置", X(324), X(58)]];
  for (const [label, ax, aw] of acts) {
    box(c, "#EEE3D0", ax, Y(149), aw, Y(30), X(4));
    strokeBox(c, "#C7B99E", 1, ax, Y(149), aw, Y(30), X(4));
    text(c, label, ax + aw / 2, Y(164), F(11), "#344D4B", { align: "center" });
  }
  // Unit inspector card: portrait, label, select box, cycling arrows.
  box(c, T.card, X(38), Y(190.3), pw - X(76), Y(97.6), X(5));
  strokeBox(c, T.line, 1, X(38), Y(190.3), pw - X(76), Y(97.6), X(5));
  c.fillStyle = "#DED6C5"; c.fillRect(X(50), Y(217.1), X(44), Y(44));
  text(c, unit ? (unit.name || unit.id).slice(0, 2) : "机", X(72), Y(239), F(16), "#425953", { align: "center", weight: "700" });
  text(c, "查看飞机", X(104), Y(209.3), F(10), "#536761");
  box(c, "#EEE4D2", X(104), Y(221.3), X(226), Y(34.2), X(4));
  strokeBox(c, "#C7B99E", 1, X(104), Y(221.3), X(226), Y(34.2), X(4));
  const unitLabel = unit ? `${unit.name} · ${unit.weapon}${unit.id === "command" ? "" : " · Lv." + unit.level}${unit.owned ? "" : " · 未解锁"}` : "";
  text(c, unitLabel, X(112), Y(238.4), F(13), "#2B4141", { weight: "600" });
  c.fillStyle = "#2B4141";
  c.beginPath(); c.moveTo(X(312), Y(232)); c.lineTo(X(320), Y(232)); c.lineTo(X(316), Y(239)); c.closePath(); c.fill();
  for (const [label, ax, action] of [["‹", X(340), "pausePrevUnit"], ["›", X(352), "pauseNextUnit"]]) {
    box(c, "#EEE3D0", ax, Y(211), X(13), Y(26), X(3));
    text(c, label, ax + X(6.5), Y(224), F(14), "#344D4B", { align: "center" });
    registerRegion({ x: ax, y: Y(211), w: X(13), h: Y(26), action });
  }
  registerRegion({ x: X(340), y: Y(211), w: X(26), h: Y(26), action: "pauseNextUnit" });
  // Tabs row.
  const tabs = [["武器参数", "weapon"], ["作战状态", "status"], ["下级变化", "upgrade"], ["全队构筑", "global"]];
  tabs.forEach(([label, tab], i) => {
    const tx = X(38) + i * ((pw - X(76)) / 4), active = pause.tab === tab;
    text(c, label, tx + (pw - X(76)) / 8, Y(317), F(11), active ? "#273B3C" : "#536862", { align: "center", weight: active ? "700" : "" });
    if (active) {
      box(c, "#F1D48D", tx + X(4), Y(322), (pw - X(76)) / 4 - X(8), Y(4), 0);
      c.fillStyle = "#D5A441"; c.fillRect(tx + X(4), Y(323), (pw - X(76)) / 4 - X(8), Y(3));
    }
    registerRegion({ x: tx, y: Y(298), w: (pw - X(76)) / 4, h: Y(38), action: { pauseTab: tab } });
  });
  c.strokeStyle = "#C8BBA4"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(X(38), Y(336)); c.lineTo(px + pw - X(38), Y(336)); c.stroke();
  // Paged stat bay: 3 columns of label/value cells.
  const rows = host.pauseRows || [];
  const pageSize = 12;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  pause.page = Math.min(pause.page, pages - 1);
  const pageRows = rows.slice(pause.page * pageSize, pause.page * pageSize + pageSize);
  const colW = (pw - X(76) - X(2)) / 3;
  box(c, "#D5C9B3", X(38), Y(345.9), pw - X(76), Y(2 + Math.ceil(pageRows.length / 3) * 66), X(4));
  pageRows.forEach(([label, value], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const sx = X(38) + X(1) + col * colW, sy = Y(345.9) + Y(1) + row * Y(66);
    box(c, T.card, sx, sy, colW - X(1), Y(65), 0);
    text(c, String(label), sx + X(9), sy + Y(18), F(11), "#536761");
    text(c, String(value), sx + X(9), sy + Y(44), F(14), "#263A3B", { weight: "650" });
  });
  // Page nav + note.
  text(c, `‹  ${pause.page + 1} / ${pages}  ›`, X(38) + (pw - X(76)) / 2, Y(614.2), F(12), "#3E5852", { align: "center", mono: true });
  if (pause.page > 0) registerRegion({ x: X(38) + (pw - X(76)) / 2 - X(50), y: Y(597), w: X(40), h: Y(34), action: "pausePrevPage" });
  if (pause.page < pages - 1) registerRegion({ x: X(38) + (pw - X(76)) / 2 + X(10), y: Y(597), w: X(40), h: Y(34), action: "pauseNextPage" });
  let ny = Y(648.8);
  for (const line of wrap(c, host.pauseNote || "", pw - X(76), F(11))) {
    text(c, line, X(38), ny, F(11), "#536761"); ny += Y(17.6);
  }
  // Resume rail.
  c.strokeStyle = "#C8BBA4"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(X(38), Y(704.2)); c.lineTo(px + pw - X(38), Y(704.2)); c.stroke();
  const resumeLabel = ["levelup", "station"].includes(state.mode) ? "返回选择界面" : "继续护送";
  drawPrimaryButton(u, X(38), Y(715), pw - X(76), Y(45), resumeLabel, { size: 15 }, registerRegion, "pause");
}

export { drawHud, drawCardListScreen, drawLevelUpScreen, drawStationScreen, drawResultScreen, drawPauseScreen, tickFx, setToast, setCombo, setStickVisual, overlayBackdrop, resetOverlayBackdrop, T };
