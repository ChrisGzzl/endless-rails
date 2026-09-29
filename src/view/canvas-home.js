"use strict";
// Canvas rendering of the expedition base, redrawn 1:1 against the DOM page
// (reference-ui.css theme). Geometry, colors and type sizes come from computed
// style dumps of the real page at the 420x800 reference frame; sprite chrome
// uses the same atlases the CSS consumes (ui-assets.js). Scrollable pages
// (train / research) receive host.scroll and report their content height so
// the host can clamp and drag-scroll like the DOM panes.

import { heroArtFor } from "./atlas.js";
import { paintUiIcon, paintRegionThumb, paintPrimarySkin } from "./ui-assets.js";

const HT = {
  paper: "#E9E1CE", card: "#F8EFDE", ink: "#102F3A", muted: "#596B6D",
  gold: "#FFC84C", slateBlue: "#47688B",
  line: "#D3C7AF", lineSoft: "#C5BAA3", track: "#C6C5B7",
  wallet: "#233E46", emblem: "#173A58",
  regionSel: "#163F49", tabBarA: "#1B434C", tabBarB: "#102E37",
  teal: "#218575", green: "#228271",
  rail: "#CFC4AD", railBg: "#F3EBDA",
};

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
function fill(c, color, x, y, w, h, r = 0) { rr(c, x, y, w, h, r); c.fillStyle = color; c.fill(); }
function grad(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  return g;
}
function text(c, str, x, y, size, color, { align = "left", weight = "", baseline = "middle", alpha = 1, italic = false, mono = false, ls = "" } = {}) {
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = color;
  const family = mono ? 'ui-monospace,monospace' : '"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';
  c.font = `${italic ? "italic " : ""}${weight ? weight + " " : ""}${size}px ${family}`;
  if (ls) c.letterSpacing = ls;
  c.textAlign = align; c.textBaseline = baseline;
  c.fillText(str, x, y);
  if (ls) c.letterSpacing = "0px";
  c.restore();
}
function measure(c, str, size, weight = "", mono = false) {
  const family = mono ? 'ui-monospace,monospace' : '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
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
function octagon(c, x, y, w, h, inset) {
  // clip-path:polygon(14% 0,86% 0,100% 15%,100% 85%,86% 100%,14% 100%,0 85%,0 15%)
  const l = x + inset, t = y + inset, r = x + w - inset, b = y + h - inset;
  const kx = (r - l) * 0.14, ky = (b - t) * 0.15;
  c.beginPath();
  c.moveTo(l + kx, t); c.lineTo(r - kx, t);
  c.lineTo(r, t + ky); c.lineTo(r, b - ky);
  c.lineTo(r - kx, b); c.lineTo(l + kx, b);
  c.lineTo(l, b - ky); c.lineTo(l, t + ky);
  c.closePath();
}
function shadowRect(c, x, y, w, h, r, color, blur, dy = 0) {
  c.save();
  if (c.shadowColor !== undefined) { c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetY = dy; }
  rr(c, x, y, w, h, r); c.fillStyle = HT.paper; c.fill();
  c.restore();
}

const REGIONS = [
  { id: "wasteland", name: "起始荒原", tag: "已侦察" },
  { id: "ruins", name: "废墟城市", tag: "未解锁" },
  { id: "industrial", name: "工业区", tag: "未解锁" },
  { id: "infection", name: "感染区", tag: "未解锁" },
];
const TABS = [
  { id: "shop", label: "商店", icon: "shop" },
  { id: "train", label: "列车", icon: "trainNav" },
  { id: "battle", label: "出发", icon: "battle" },
  { id: "research", label: "研究", icon: "research" },
  { id: "settings", label: "设置", icon: "settings" },
];
const CAR_ICONS = { hangar: "hangar", pointDefense: "pointDefense", storage: "storage", radar: "radar", repair: "repair" };
const RESEARCH_GRADIENTS = {
  rapid: ["#003b78", "#057cc7"], piercing: ["#003b78", "#057cc7"],
  missile: ["#b72121", "#f45c23"], incendiary: ["#b72121", "#f45c23"],
  chain: ["#572179", "#a03bd7"], ricochet: ["#572179", "#a03bd7"],
  blades: ["#00667f", "#09b8c9"], scatter: ["#00667f", "#09b8c9"],
};

function compactNum(n) { return n >= 1000000 ? (n / 1000000).toFixed(1) + "m" : n >= 10000 ? (n / 1000).toFixed(1) + "k" : String(n); }

// -- header (fixed above every page) ------------------------------------------

function drawHeader(u, host) {
  const { c, X, Y, F } = u;
  // Emblem: navy tile with a double frame.
  fill(c, HT.emblem, X(13), Y(15.5), X(35), Y(35), X(4));
  c.strokeStyle = "#507897"; c.lineWidth = X(2);
  rr(c, X(13), Y(15.5), X(35), Y(35), X(4)); c.stroke();
  c.strokeStyle = "#305A76"; c.lineWidth = X(2);
  rr(c, X(15), Y(17.5), X(31), Y(31), X(2.5)); c.stroke();
  text(c, "ER", X(30.5), Y(33.5), F(17), "#FFFCED", { align: "center", weight: "900", italic: true });
  text(c, "荒原轨道", X(55), Y(24.5), F(12), HT.ink, { weight: "850", ls: "0.04em" });
  text(c, `列车 Lv.${host.meta.train.level}`, X(55), Y(42.5), F(10), HT.muted);
  // Resource wallet: three dark pills on the right.
  const items = [
    { icon: "scrap", value: host.meta.resources.scrap, label: "废料" },
    { icon: "components", value: host.meta.resources.components, label: "组件" },
    { icon: "data", value: host.meta.resources.data, label: "数据" },
  ];
  items.forEach((item, i) => {
    const x = X(255 + i * 52);
    fill(c, HT.wallet, x, Y(17.1), X(48), Y(31.8), X(4));
    paintUiIcon(c, item.icon, x + X(4), Y(23.5), X(19), X(19));
    text(c, compactNum(item.value), x + X(27), Y(28.6), F(12), "#FFF8E9", { weight: "700", mono: true, baseline: "middle" });
    // The label centers under the value column, like the CSS grid cell.
    text(c, item.label, x + X(35), Y(40.5), F(8), "#EEEADD", { align: "center" });
  });
}

// -- battle tab ----------------------------------------------------------------

function drawBattleTab(u, host, registerRegion) {
  const { c, X, Y, F, vw } = u;
  const region = host.meta.selectedRegion || "wasteland";
  const regionInfo = REGIONS.find(r => r.id === region) || REGIONS[0];
  const regionMeta = host.regionMeta;
  // Watermark: faint region vista across the right 60% of the heading block.
  c.save();
  c.beginPath(); c.rect(X(171), Y(64), X(233), Y(128)); c.clip();
  paintRegionThumb(c, region, X(171), Y(64), X(233), Y(128), { alpha: 0.15 });
  c.fillStyle = grad(c, X(171), 0, X(320), 0, [[0, "#E9E1CE"], [1, "rgba(233,225,206,0)"]]);
  c.fillRect(X(171), Y(64), X(233), Y(128));
  c.restore();
  // Heading: eyebrow / display title with the tri-segment underline / copy.
  text(c, "RAILWAY EXPEDITION / 铁路远征", X(16), Y(86), F(9), "#657275", { weight: "750", mono: true, ls: "0.16em" });
  text(c, regionInfo.name, X(16), Y(120), F(44.1), HT.ink, { weight: "900", ls: "-0.045em" });
  const segs = [[0, 0.28], [0.38, 0.66], [0.76, 1]];
  for (const [a, b] of segs) fill(c, "#D49B46", X(16 + 43 * a), Y(154.7), X(43 * (b - a)), Y(4), 0);
  text(c, regionMeta ? regionMeta.description : "开阔荒原，适合验证列车与无人机编组。", X(16), Y(173.7), F(12), HT.muted, { weight: "600" });
  // Keyart card: bordered, shadowed, bottom-inked photo.
  const kx = X(13), ky = Y(195.7), kw = X(394), kh = Y(267.9);
  shadowRect(c, kx, ky, kw, kh, X(6), "rgba(32,61,61,0.125)", X(3), X(3));
  c.save();
  rr(c, kx, ky, kw, kh, X(6)); c.clip();
  fill(c, "#EFD8AE", kx, ky, kw, kh);
  const art = heroArtFor(region);
  if (art) {
    const scale = Math.max(kw / art.naturalWidth, kh / art.naturalHeight);
    const dw = art.naturalWidth * scale, dh = art.naturalHeight * scale;
    c.drawImage(art, kx + (kw - dw) / 2, ky + (kh - dh) / 2, dw, dh);
  } else if (host.regionGroundArt) {
    c.drawImage(host.regionGroundArt, kx, ky, kw, kh);
  }
  c.fillStyle = grad(c, 0, ky + kh * 0.52, 0, ky + kh, [[0, "rgba(16,47,58,0)"], [1, "#102F3AED"]]);
  c.fillRect(kx, ky + kh * 0.52, kw, kh * 0.48);
  c.restore();
  c.strokeStyle = "#FFF8E7"; c.lineWidth = X(2);
  rr(c, kx, ky, kw, kh, X(6)); c.stroke();
  // Route mark badge and mission stamp.
  const rmW = measure(c, "01 — 05", F(14), "700", true) + X(18);
  fill(c, "#163948EE", X(22), Y(204.7), rmW, Y(26), X(3));
  text(c, "01 — 05", X(22) + X(9), Y(217.7), F(14), "#FFFFFF", { weight: "700", mono: true, ls: "0.12em" });
  const stamp = regionMeta ? `${regionMeta.status} · ${regionMeta.statusText}` : "已侦察 · 低危铁路";
  const sbw = measure(c, stamp, F(10)) + X(14);
  fill(c, "rgba(36,89,113,0.93)", X(27), Y(397.6), sbw, Y(22), X(4));
  c.strokeStyle = "rgba(126,193,219,0.4)"; c.lineWidth = X(1);
  rr(c, X(27), Y(397.6), sbw, Y(22), X(4)); c.stroke();
  text(c, stamp, X(27) + X(7), Y(408.6), F(10), "#F9F6E8");
  text(c, "护送最后一班列车", X(27), Y(437.6), F(22.26), "#FFFFFF", { weight: "900" });
  // Region grid: thumbnail cards, selected one inverted with a gold pointer.
  const gridY = Y(473.6), cardW = X(92.8), cardH = Y(89.4), gap = X(7.07);
  REGIONS.forEach((r, i) => {
    const x = X(14) + i * (cardW + gap);
    const unlocked = r.id === "wasteland" || !!host.meta.regions[r.id]?.unlocked;
    const selected = region === r.id;
    if (selected) shadowRect(c, x, gridY, cardW, cardH, X(5), "rgba(20,46,59,0.25)", X(2), X(2));
    fill(c, selected ? HT.regionSel : unlocked ? "#F3ECDB" : "#E2DDCF", x, gridY, cardW, cardH, X(5));
    const pad = selected ? 2 : 1;
    c.strokeStyle = selected ? HT.gold : "#CFC3AA"; c.lineWidth = X(pad);
    rr(c, x, gridY, cardW, cardH, X(5)); c.stroke();
    c.save();
    rr(c, x + X(3), gridY + Y(4), cardW - X(6), Y(40), X(3)); c.clip();
    const painted = paintRegionThumb(c, r.id, x + X(3), gridY + Y(4), cardW - X(6), Y(40),
      unlocked ? {} : { alpha: 0.56, filter: "grayscale(0.85)" });
    if (!painted) fill(c, unlocked ? "#D9CFB6" : "#CFCABB", x + X(3), gridY + Y(4), cardW - X(6), Y(40), X(3));
    c.restore();
    text(c, r.name, x + cardW / 2, gridY + Y(58), F(11), selected ? "#FFF5D7" : unlocked ? "#243E47" : "#657173", { align: "center", weight: "800" });
    const tag = unlocked ? (host.regionTags?.[r.id] || r.tag) : "未解锁";
    text(c, tag, x + cardW / 2, gridY + Y(75), F(10), selected ? "#FFD053" : unlocked ? HT.teal : "#657173", { align: "center", weight: "700" });
    if (selected) {
      c.fillStyle = HT.gold;
      c.beginPath();
      c.moveTo(x + cardW / 2 - X(7), gridY + cardH - X(1));
      c.lineTo(x + cardW / 2 + X(7), gridY + cardH - X(1));
      c.lineTo(x + cardW / 2, gridY + cardH + X(6));
      c.closePath(); c.fill();
    }
    if (unlocked) registerRegion({ x, y: gridY, w: cardW, h: cardH + X(7), action: { selectRegion: r.id } });
  });
  // Loadout strip: sprite, split copy column, trailing car icons.
  const lx = X(14), ly = Y(575), lw = X(392), lh = Y(51);
  fill(c, HT.railBg, lx, ly, lw, lh, X(5));
  c.strokeStyle = HT.rail; c.lineWidth = X(1); rr(c, lx, ly, lw, lh, X(5)); c.stroke();
  paintUiIcon(c, "train", lx + X(9), ly + Y(10), X(31), X(31));
  c.strokeStyle = HT.lineSoft; c.beginPath(); c.moveTo(lx + X(52), ly + Y(7)); c.lineTo(lx + X(52), ly + lh - Y(7)); c.stroke();
  const departureParts = (host.departureSummary || "研究：未投资").split(" · ");
  text(c, `编组 ${host.trainLength} 节 · ${departureParts[0]}`, lx + X(61), ly + Y(19), F(13), HT.ink, { weight: "850" });
  text(c, `${departureParts.slice(1).join(" · ") || "前往列车调整"} · 调整 →`, lx + X(61), ly + Y(37), F(10), HT.muted, { weight: "500" });
  const carCount = Math.min(4, host.trainLength);
  let cx = lx + lw - X(9) - X(14);
  for (let i = 0; i < carCount; i++) {
    paintUiIcon(c, "train", cx - X(27), ly + Y(12), X(27), X(27));
    cx -= X(28);
  }
  if (host.trainLength > 4) text(c, `+${host.trainLength - 4}`, cx - X(4), ly + Y(26), F(9), HT.muted, { align: "right" });
  text(c, "›", lx + lw - X(11), ly + Y(25), F(24), HT.muted);
  registerRegion({ x: lx, y: ly, w: lw, h: lh, action: { homeTab: "train" } });
  // Launch button: textured octagon with sprite, italic display type, ».
  const bx = X(14), by = Y(634), bw = X(392), bh = Y(59);
  c.save();
  c.beginPath();
  c.moveTo(bx + bw * 0.04, by); c.lineTo(bx + bw * 0.96, by);
  c.lineTo(bx + bw, by + bh * 0.2); c.lineTo(bx + bw, by + bh * 0.8);
  c.lineTo(bx + bw * 0.96, by + bh); c.lineTo(bx + bw * 0.04, by + bh);
  c.lineTo(bx, by + bh * 0.8); c.lineTo(bx, by + bh * 0.2);
  c.closePath(); c.clip();
  c.fillStyle = "#21333A"; c.fillRect(bx, by, bw, bh);
  paintPrimarySkin(c, bx, by, bw, bh);
  c.restore();
  c.save();
  if (c.shadowColor !== undefined) { c.shadowColor = "rgba(27,43,53,0.16)"; c.shadowBlur = X(3.5); c.shadowOffsetY = X(2); }
  c.strokeStyle = "rgba(33,51,58,0.9)"; c.lineWidth = X(1);
  c.stroke();
  c.restore();
  const label = "开始远征";
  const tW = measure(c, label, F(26), "900");
  const total = X(35) + X(17) + tW + X(17) + measure(c, "»", F(32));
  let sx = bx + (bw - total) / 2;
  paintUiIcon(c, "trainNav", sx, by + bh / 2 - X(17.5), X(35), X(35));
  sx += X(35) + X(17);
  c.save();
  if (c.shadowColor !== undefined) { c.shadowColor = "#14252B"; c.shadowBlur = 0; c.shadowOffsetY = X(1); }
  text(c, label, sx, by + bh / 2, F(26), "#FFE7A6", { weight: "900", italic: true, ls: "0.03em" });
  c.restore();
  text(c, "»", sx + tW + X(17), by + bh / 2 + Y(1), F(32), "#FFE7A6");
  registerRegion({ x: bx, y: by, w: bw, h: bh, action: "start" });
  text(c, "5 段护送 · 每段 60 秒 · 到站可安全撤离", vw / 2, Y(709), F(10), HT.muted, { align: "center", weight: "650" });
}

// -- page scaffolding for the scrollable tabs -----------------------------------

function pageHeading(u, eyebrow, title, copy) {
  const { c, X, Y, F } = u;
  text(c, eyebrow, X(16), Y(86), F(9), "#657275", { weight: "750", mono: true, ls: "0.16em" });
  text(c, title, X(16), Y(120), F(32), HT.ink, { weight: "900", ls: "-0.045em" });
  text(c, copy, X(16), Y(146.5), F(12), HT.muted, { weight: "600" });
}
function sectionHead(u, y, b, span) {
  const { c, X, Y, F } = u;
  fill(c, "#EFB340", X(14), y, X(18), Y(18), X(4));
  text(c, "›", X(14) + X(9), y + Y(9), F(13), "#FFF8DC", { align: "center", weight: "700" });
  text(c, b, X(38), y + Y(10), F(15), "#25383B", { weight: "850", ls: "0.04em" });
  if (span) text(c, span, X(406), y + Y(10), F(10), HT.muted, { align: "right" });
  return y + Y(34);
}

// -- train tab -----------------------------------------------------------------

function drawTrainTab(u, host, registerRegion) {
  const { c, X, Y, F, vw } = u;
  pageHeading(u, "TRAIN WORKSHOP", "我的列车", "升级列车获得改装点，选择车厢决定远征方式。");
  // The fixed header already holds all three resources; the card shows the asset.
  let y = Y(177.8);
  fill(c, "#1C424C", X(14), y, X(382), Y(198), X(6));
  paintUiIcon(c, "trainNav", X(285), y + Y(13), X(90), Y(70));
  text(c, "远征列车", X(26), y + Y(18), F(10), "#B8D3D2", { weight: "700" });
  text(c, `列车 Lv.${host.meta.train.level}`, X(26), y + Y(42), F(22), "#FFF7E8", { weight: "850" });
  const affordable = host.trainUpgradeCost !== null && host.meta.resources.scrap >= host.trainUpgradeCost;
  const summary = host.talentSummary;
  text(c, `改装点 ${host.appliedPoints} / ${host.talentPoints} · 功能车厢 ${host.carSlots} 槽`, X(26), y + Y(64), F(10), "#E2C789");
  text(c, `无人机伤害 ×${host.trainStats.fire.toFixed(2)}   列车耐久 ×${host.trainStats.hull.toFixed(2)}`, X(26), y + Y(82), Math.max(11, F(11)), "#E2E9E0", { weight:"700" });
  fill(c, affordable ? "#EFBF69" : "#81999B", X(26), y + Y(101), X(358), Y(62), X(4));
  text(c, host.trainUpgradeCost === null ? "列车已满级" : `升级至 Lv.${host.meta.train.level + 1}`, X(205), y + Y(130), Math.max(12, F(13)), affordable ? "#25383B" : "#F2F0E4", { align: "center", weight: "800" });
  if (affordable) registerRegion({ x: X(26), y: y + Y(101), w: X(358), h: Y(62), action: { trainUpgrade: true } });
  const hint = host.trainUpgradeCost === null ? "当前等级上限" : "每级 +2 改装点 · 废料 ";
  text(c, hint, X(26), y + Y(177), Math.max(11, F(11)), "#D0DCD4");
  if (host.trainUpgradeCost !== null) {
    const font = Math.max(11, F(11)), costX = X(26) + measure(c, hint, font);
    text(c, String(host.trainUpgradeCost), costX, y + Y(177), Math.max(12, F(12)), affordable ? "#D0DCD4" : "#FF9E94", { weight:"800" });
    if (!affordable) text(c, `（差 ${Math.ceil(host.trainUpgradeCost - host.meta.resources.scrap)}）`, costX + measure(c, String(host.trainUpgradeCost), Math.max(12, F(12)), "800"), y + Y(177), font, "#D0DCD4");
  }
  y += Y(209);
  y = sectionHead(u, y, "当前编组", `${Math.max(0, host.meta.loadout.length - 1)} / ${host.carSlots} 功能车厢`);
  const appliedCars = host.meta.loadout.filter(id => id !== "hangar");
  appliedCars.forEach((id, i) => {
    const x = X(14) + (i % 2) * X(195), rowY = y + Math.floor(i / 2) * Y(53);
    fill(c, HT.card, x, rowY, X(187), Y(47), X(4));
    paintUiIcon(c, CAR_ICONS[id] || "train", x + X(5), rowY + Y(5), X(37), Y(37));
    text(c, host.carDefs.find(car => car.id === id)?.name || id, x + X(46), rowY + Y(24), F(11), HT.ink, { weight:"700" });
  });
  y += Y(Math.max(1, Math.ceil(appliedCars.length / 2)) * 53 + 8);
  fill(c, "#23515B", X(14), y, X(382), Y(46), X(5));
  text(c, host.trainWorkshopOpen ? "收起改装台 ↑" : "打开改装台 ›", X(205), y + Y(23), F(13), "#F6F0DF", { align:"center", weight:"800" });
  registerRegion({ x:X(14), y, w:X(382), h:Y(46), action:{ trainWorkshopToggle:true } });
  y += Y(57);
  if (!host.trainWorkshopOpen) return y + Y(18);
  y = sectionHead(u, y, "车厢与天赋", "草稿应用后生效");
  // Presets A/B/C.
  y = sectionHead(u, y, "改装方案", "点按载入 · 保存当前草稿");
  const chipW = X(120), gap = X(11);
  for (const preset of host.presetRows) {
    const x = X(14) + preset.index * (chipW + gap);
    fill(c, "#F8EFDE", x, y, chipW, Y(80), X(5));
    c.strokeStyle = HT.line; c.lineWidth = X(1); rr(c, x, y, chipW, Y(80), X(5)); c.stroke();
    text(c, preset.name, x + X(10), y + Y(13), F(12), HT.ink, { weight: "800" });
    text(c, `${preset.spent} 点 · ${preset.cars} 车厢`, x + X(10), y + Y(28), F(9), HT.muted);
    fill(c, "#F1E8D7", x + X(6), y + Y(40), X(50), Y(34), X(3));
    text(c, "改名", x + X(31), y + Y(57), F(10), HT.ink, { align: "center", weight: "800" });
    fill(c, "#EFB340", x + X(62), y + Y(40), X(52), Y(34), X(3));
    text(c, host.talent.confirmSave === preset.index ? "确认" : "保存", x + X(88), y + Y(57), F(10), "#3B2F0F", { align: "center", weight: "800" });
    registerRegion({ x, y, w: chipW, h: Y(36), action: { presetLoad: preset.index } });
    registerRegion({ x: x + X(6), y: y + Y(40), w: X(50), h: Y(34), action: { presetRename: preset.index } });
    registerRegion({ x: x + X(62), y: y + Y(40), w: X(52), h: Y(34), action: { presetSave: preset.index } });
  }
  y += Y(80) + Y(14);
  // Cars.
  y = sectionHead(u, y, "功能车厢", "点击调整编组");
  text(c, `已应用 ${Math.max(0, host.meta.loadout.length - 1)}/${host.carSlots} · ${host.meta.loadout.slice(1).map(id => host.carDefs.find(car => car.id === id)?.name || id).join("/") || "未选"}`, X(14), y + Y(9), F(11), "#586A65");
  if (host.talent.loadout) text(c, `草稿 ${Math.max(0, host.talent.loadout.length - 1)}/${host.carSlots} · ${host.talent.loadout.slice(1).map(id => host.carDefs.find(car => car.id === id)?.name || id).join("/") || "未选"}`, X(14), y + Y(27), F(11), "#2F6B5E", { weight: "700" });
  y += Y(host.talent.loadout ? 46 : 28);
  for (const car of host.carDefs) {
    const unlocked = host.unlockedCars.includes(car.id);
    const active = (host.talent?.loadout || host.meta.loadout).includes(car.id);
    const h = Y(70);
    fill(c, active ? "#FFF4DF" : HT.card, X(14), y, X(382), h, X(5));
    c.strokeStyle = HT.line; c.lineWidth = X(1); rr(c, X(14), y, X(382), h, X(5)); c.stroke();
    if (active) { fill(c, "#E5AF45", X(14), y + Y(6), X(3), h - Y(12), X(1)); }
    fill(c, "#FFF9ED", X(23), y + Y(10), X(62), Y(50), X(4));
    paintUiIcon(c, CAR_ICONS[car.id] || "train", X(26), y + Y(13), X(56), Y(44));
    text(c, car.name, X(97), y + Y(17), F(13), HT.ink, { weight: "700" });
    const changed = active !== host.meta.loadout.includes(car.id);
    text(c, unlocked ? changed ? (active ? "草稿加入 · 待应用" : "草稿移除 · 待应用") : (active ? "已应用 · 点击移除" : "未编组 · 点击加入") : active ? "天赋不足 · 点击移除" : "天赋未解锁", X(97), y + Y(31), F(10), unlocked ? HT.green : "#B3362D", { weight: "700" });
    text(c, car.description || "", X(97), y + Y(48), F(10), HT.muted);
    if (unlocked || active) registerRegion({ x: X(14), y, w: X(382), h, action: { toggleCar: car.id } });
    y += h + Y(7);
  }
  y += Y(6);
  // Talent branches and nodes.
  y = sectionHead(u, y, "列车天赋", "未装备车厢的分支不生效");
  const branchW = X(72.4), bgap = X(8);
  host.branchRows.forEach((branchRow, i) => {
    const x = X(14) + i * (branchW + bgap);
    fill(c, branchRow.active ? "#163F49" : "#F6EDDA", x, y, branchW, Y(40), X(5));
    c.strokeStyle = branchRow.active ? "#0E2B33" : "#CEC3AB"; c.lineWidth = X(1); rr(c, x, y, branchW, Y(40), X(5)); c.stroke();
    text(c, branchRow.name, x + branchW / 2, y + Y(11), F(11), branchRow.active ? "#FFF5D7" : "#3F5953", { align: "center", weight: "800" });
    text(c, `${branchRow.spent}/${branchRow.cap}`, x + branchW / 2, y + Y(24), F(10), branchRow.active ? "#FFD053" : "#8A6B1F", { align: "center", weight: "700" });
    if (!branchRow.equipped) text(c, "未装备", x + branchW / 2, y + Y(34), F(9), branchRow.active ? "#FFCCB9" : "#9D372D", { align: "center", weight: "700" });
    registerRegion({ x, y, w: branchW, h: Y(40), action: { talentBranch: branchRow.id } });
  });
  y += Y(40) + Y(10);
  for (const node of host.nodeRows) {
    const h = Y(64);
    fill(c, node.level > 0 ? "#FFF4DF" : HT.card, X(14), y, X(382), h, X(5));
    c.strokeStyle = HT.line; c.lineWidth = X(1); rr(c, X(14), y, X(382), h, X(5)); c.stroke();
    if (node.level > 0) { fill(c, "#E5AF45", X(14), y + Y(6), X(3), h - Y(12), X(1)); }
    text(c, node.name, X(26), y + Y(12), F(12), HT.ink, { weight: "750" });
    text(c, `Lv.${node.level}/${node.levels} · ${node.cost} 点/级${node.block ? " · 🔒 " + node.block : ""}`, X(26), y + Y(27), F(9), node.block ? "#B3362D" : "#8A6B1F", { weight: "700" });
    text(c, node.effect + (node.levels > 1 && node.level === 0 ? " / 级" : ""), X(26), y + Y(44), F(10), HT.muted);
    const minusX = X(300), plusX = X(346), by = y + Y(15), bw = X(38), bh = Y(34);
    fill(c, "#F1E8D7", minusX, by, bw, bh, X(4));
    c.strokeStyle = "#C9BBA2"; c.lineWidth = X(1); rr(c, minusX, by, bw, bh, X(4)); c.stroke();
    text(c, "−", minusX + bw / 2, by + bh / 2, F(17), node.level > 0 ? "#3F5953" : "#B9B2A0", { align: "center", weight: "800" });
    if (node.level > 0) registerRegion({ x: minusX, y: by, w: bw, h: bh, action: { talentMinus: node.id } });
    fill(c, grad(c, 0, by, 0, by + bh, [[0, "#F8D277"], [1, "#E5B350"]]), plusX, by, bw, bh, X(4));
    c.strokeStyle = "#C18E35"; c.lineWidth = X(1); rr(c, plusX, by, bw, bh, X(4)); c.stroke();
    text(c, "＋", plusX + bw / 2, by + bh / 2, F(17), node.block ? "#D8C9A4" : "#263B3E", { align: "center", weight: "800" });
    if (!node.block) registerRegion({ x: plusX, y: by, w: bw, h: bh, action: { talentPlus: node.id } });
    y += h + Y(7);
  }
  // Spec choices for the active branch.
  if (host.specRows.length) {
    const owned = host.specRows[0].owned;
    const h = Y(40) + host.specRows.length * Y(52);
    fill(c, "#F1E8D7", X(14), y, X(382), h, X(5));
    c.strokeStyle = "#C9BBA2"; c.lineWidth = X(1); rr(c, X(14), y, X(382), h, X(5)); c.stroke();
    text(c, owned ? "专精 · 二选一（切换已购选项需改装费）" : "专精 · 购买专精节点后开放", X(26), y + Y(14), F(11), owned ? HT.ink : "#8A8374", { weight: "750" });
    host.specRows.forEach((spec, i) => {
      const sy = y + Y(28) + i * Y(52);
      fill(c, spec.active ? "#FFF4DF" : "#F8EFDE", X(24), sy, X(362), Y(46), X(4));
      c.strokeStyle = spec.active ? "#B98730" : "#D3C7AF"; c.lineWidth = spec.active ? X(2) : X(1);
      rr(c, X(24), sy, X(362), Y(46), X(4)); c.stroke();
      text(c, spec.name + (spec.active ? " · 已选" : ""), X(36), sy + Y(12), F(12), spec.active ? "#8A6B1F" : HT.ink, { weight: "800" });
      text(c, spec.desc, X(36), sy + Y(30), F(10), HT.muted);
      if (owned) registerRegion({ x: X(24), y: sy, w: X(362), h: Y(46), action: { talentSpec: [spec.branch, spec.id] } });
    });
    y += h + Y(12);
  }
  // Preview and actions belong at the end of the workshop, not over its content.
  const sh = Y(30 + summary.rows.length * 19);
  fill(c, "#102F3A", X(14), y, X(382), sh, X(6));
  text(c, "改装属性预览", X(28), y + Y(14), F(11), "#FFD053", { weight: "800" });
  summary.rows.forEach((line, i) => text(c, line, X(28), y + Y(36) + i * Y(19), F(10), "#C9D5D1"));
  y += sh + Y(14);
  const notice = summary.problems.join("；") || host.talent.notice;
  text(c, `草稿可用 ${summary.points} 点 · ${summary.costText}`, X(22), y + Y(8), F(10), HT.ink, { weight:"750" });
  if (notice) text(c, notice.slice(0, 42), X(22), y + Y(26), F(10), summary.problems.length ? "#A4372D" : "#2F6B5E");
  const actionY = y + Y(37);
  fill(c, "#DAD1BC", X(14), actionY, X(183), Y(44), X(4));
  text(c, "重置草稿", X(105), actionY + Y(22), F(12), summary.dirty ? HT.ink : "#8D9692", { align:"center", weight:"750" });
  if (summary.dirty) registerRegion({ x:X(14), y:actionY, w:X(183), h:Y(44), action:{ talentReset:true } });
  fill(c, summary.canApply ? "#EFB340" : "#9E9787", X(205), actionY, X(191), Y(44), X(4));
  text(c, "应用改装", X(300), actionY + Y(22), F(12), summary.canApply ? "#263B3E" : "#F1EBDD", { align:"center", weight:"800" });
  if (summary.canApply) registerRegion({ x:X(205), y:actionY, w:X(191), h:Y(44), action:{ talentApply:true } });
  y = actionY + Y(54);
  // Secondary: back to departure.
  fill(c, "#F6EDDA", X(14), y, X(382), Y(44), X(4));
  c.strokeStyle = "#CEC3AB"; c.lineWidth = X(1); rr(c, X(14), y, X(382), Y(44), X(4)); c.stroke();
  text(c, "编组完成 · 前往出发 →", vw / 2, y + Y(22), F(13), HT.ink, { align: "center", weight: "700" });
  registerRegion({ x: X(14), y, w: X(382), h: Y(44), action: { homeTab: "battle" } });
  return y + Y(44) + Y(23);
}

// -- research tab ----------------------------------------------------------------

function drawResearchTab(u, host, registerRegion) {
  const { c, X, Y, F } = u;
  pageHeading(u, "RESEARCH LABORATORY", "永久研究", "资源足够即可升级；增益永久保留。");
  let y = Y(177.8);
  const groups = [["drone", "无人机战斗 · 主材料研究数据"], ["train", "列车工程 · 主材料技术组件"]];
  for (const [groupId, groupLabel] of groups) {
    y = sectionHead(u, y, groupLabel.split(" · ")[0], groupLabel.split(" · ")[1]);
    for (const row of host.researchRows.filter(row => row.group === groupId)) {
      const h = Y(123);
      fill(c, HT.card, X(14), y, X(382), h, X(5));
      c.strokeStyle = HT.line; c.lineWidth = X(1); rr(c, X(14), y, X(382), h, X(5)); c.stroke();
      const colors = groupId === "drone" ? ["#003b78", "#057cc7"] : ["#5c3a12", "#b9822c"];
      fill(c, grad(c, X(22), y + Y(10), X(68), y + Y(56), [[0, colors[0]], [1, colors[1]]]), X(22), y + Y(10), X(46), Y(46), X(4));
      c.save();
      rr(c, X(22), y + Y(10), X(46), Y(46), X(4)); c.clip();
      paintUiIcon(c, row.icon, X(23.5), y + Y(12), X(43), X(43));
      c.restore();
      text(c, row.name, X(77), y + Y(16), Math.max(12, F(14)), HT.ink, { weight: "800" });
      text(c, `Lv.${row.level}/${row.max}`, X(382), y + Y(16), Math.max(11, F(11)), "#586B6C", { align:"right", weight:"700" });
      text(c, row.focus, X(77), y + Y(39), Math.max(11, F(11)), "#586B6C");
      text(c, `当前 ${row.effect}${row.maxed ? "" : ` → 升级 ${row.nextEffect}`}`, X(26), y + Y(75), Math.max(11, F(12)), "#2F6B5E", { weight: "800" });
      if (!row.maxed) {
        const bits = [["scrap", "废料"], [groupId === "drone" ? "data" : "components", groupId === "drone" ? "数据" : "组件"]];
        if (row.cost.attack && row.cost.components > 0) bits.push(["components", "组件"]);
        if (!row.cost.attack && row.cost.data > 0) bits.push(["data", "数据"]);
        const font = Math.max(10.5, F(11));
        bits.forEach(([key, label], i) => {
          const x = X([26, 120, 214][i]), cy = y + Y(101);
          text(c, label, x, cy, font, "#68551F", { weight:"700" });
          text(c, String(row.cost[key]), x + measure(c, label, font, "700") + X(3), cy, font, row.shortKeys.includes(key) ? "#AD302A" : "#68551F", { weight:"800" });
        });
      }
      // The action remains a large target; only affordable upgrades receive a hitbox.
      const bxx = X(296), byy = y + Y(67), bw = X(92), bh = Y(48);
      if (row.maxed) {
        fill(c, "#E8DBC0", bxx, byy, bw, bh, X(4));
        c.strokeStyle = "#CBBD9F"; c.lineWidth = X(1); rr(c, bxx, byy, bw, bh, X(4)); c.stroke();
        text(c, "已满", bxx + bw / 2, byy + bh / 2, F(11), "#68716C", { align: "center", weight: "800" });
      } else {
        fill(c, row.affordable ? grad(c, 0, byy, 0, byy + bh, [[0, "#F8D277"], [1, "#E5B350"]]) : "#E8DBC0", bxx, byy, bw, bh, X(4));
        c.strokeStyle = row.affordable ? "#C18E35" : "#CBBD9F"; c.lineWidth = X(1); rr(c, bxx, byy, bw, bh, X(4)); c.stroke();
        text(c, "升级", bxx + bw / 2, byy + bh / 2, F(11), row.affordable ? "#263B3E" : "#A29878", { align: "center", weight: "800" });
        if (row.affordable) registerRegion({ x: bxx, y: byy, w: bw, h: bh, action: { research: row.id } });
      }
      y += h + Y(8);
    }
  }
  // Rules note.
  fill(c, HT.card, X(14), y, X(382), Y(58), X(5));
  c.strokeStyle = HT.line; c.lineWidth = X(1); rr(c, X(14), y, X(382), Y(58), X(5)); c.stroke();
  text(c, "研究规则说明", X(25), y + Y(14), F(11), HT.ink, { weight: "750" });
  text(c, "Lv1-10 基础 / Lv11-20 进阶 / Lv21-30 长期，单级收益分段递减。", X(25), y + Y(30), F(9.5), HT.muted);
  text(c, "无等待与限额，数据足够即可升级；装甲材料按乘法叠算。", X(25), y + Y(44), F(9.5), HT.muted);
  y += Y(58) + Y(12);
  // Bond color guide.
  fill(c, "#F1E8D7", X(14), y, X(382), Y(173.6), X(4));
  c.strokeStyle = "#C9BBA2"; c.lineWidth = X(1); rr(c, X(14), y, X(382), Y(173.6), X(4)); c.stroke();
  text(c, "编组配色", X(31), y + Y(22), F(15), HT.ink, { weight: "700" });
  const bonds = [
    ["#A76BE1", "紫 · 电弧 + 跳弹：北辰额外发射放电跳弹"],
    ["#3FACF5", "蓝 · 机枪 + 磁轨：北辰使用穿透激光"],
    ["#EF6965", "红 · 燃烧 + 导弹：北辰发射追踪燃烧弹"],
    ["#33C8C7", "青 · 旋刃 + 霰弹：同色编组"],
  ];
  bonds.forEach(([dot, line], i) => {
    const by2 = y + Y(44) + i * Y(22);
    fill(c, dot, X(31), by2 - X(4.5), X(9), X(9), X(4.5));
    text(c, line, X(48), by2, F(11), "#3F5953");
  });
  text(c, "前三组在两架无人机都达到 Lv.5 后激活。青色当前仅作为编组配色，不改变技能规则。",
    X(31), y + Y(140), F(10), "#3F5953", { alpha: 0.9 });
  y += Y(173.6) + Y(16);
  // Recovered blueprints.
  fill(c, HT.card, X(14), y, X(382), Y(73.8), X(5));
  c.strokeStyle = HT.line; c.lineWidth = X(1); rr(c, X(14), y, X(382), Y(73.8), X(5)); c.stroke();
  fill(c, "#EFB340", X(31), y + Y(12), X(18), Y(18), X(4));
  text(c, "›", X(31) + X(9), y + Y(21), F(13), "#FFF8DC", { align: "center", weight: "700" });
  text(c, "已回收蓝图", X(55), y + Y(22), F(15), "#25383B", { weight: "850" });
  text(c, "收藏记录", X(396), y + Y(22), F(10), HT.muted, { align: "right" });
  text(c, host.blueprintText || "暂无蓝图 · 击破精英或区域 Boss 后回收，到站锁定。", X(31), y + Y(47), F(11), "#3F5953");
  return y + Y(73.8) + Y(23);
}

// -- shop tab --------------------------------------------------------------------

function drawShopTab(u, host, registerRegion) {
  const { c, X, Y, F, vw } = u;
  pageHeading(u, "SUPPLY DEPOT", "荒原补给站", "远征之外的补给与支援。");
  let y = Y(177.8);
  fill(c, HT.card, X(14), y, X(392), Y(260.2), X(5));
  c.strokeStyle = HT.line; c.lineWidth = X(1); rr(c, X(14), y, X(392), Y(260.2), X(5)); c.stroke();
  paintUiIcon(c, "supply", X(152), y + Y(23), X(116), X(116));
  text(c, "补给线路尚未开通", vw / 2, y + Y(163), F(20), HT.ink, { align: "center", weight: "850" });
  text(c, "补给商店将在后续版本开放。", vw / 2, y + Y(196), F(12), HT.muted, { align: "center" });
  text(c, "现在可通过远征回收废料、组件与研究数据。", vw / 2, y + Y(218), F(12), HT.muted, { align: "center" });
  y += Y(260.2) + Y(8);
  fill(c, HT.card, X(14), y, X(392), Y(108), X(5));
  c.strokeStyle = HT.line; c.lineWidth = X(1); rr(c, X(14), y, X(392), Y(108), X(5)); c.stroke();
  text(c, "可回收资源", X(25), y + Y(15.5), F(13), HT.muted, { weight: "700" });
  const goods = [["scrap", "废料"], ["components", "组件"], ["data", "数据"]];
  goods.forEach(([icon, label], i) => {
    const gx = X(48) + i * X(126);
    fill(c, "#DED6C5", gx, y + Y(34), X(44), X(44), X(4));
    paintUiIcon(c, icon, gx, y + Y(34), X(44), X(44));
    text(c, label, gx + X(22), y + Y(90), F(10), HT.ink, { align: "center" });
  });
  y += Y(108) + Y(14);
  fill(c, "#F6EDDA", X(14), y, X(392), Y(44), X(4));
  c.strokeStyle = "#CEC3AB"; c.lineWidth = X(1); rr(c, X(14), y, X(392), Y(44), X(4)); c.stroke();
  text(c, "前往出发获取资源 →", vw / 2, y + Y(22), F(13), HT.ink, { align: "center", weight: "700" });
  registerRegion({ x: X(14), y, w: X(392), h: Y(44), action: { homeTab: "battle" } });
  return y + Y(44) + Y(23);
}

// -- settings tab ------------------------------------------------------------------

function drawSettingsTab(u, host, registerRegion) {
  const { c, X, Y, F, vw } = u;
  pageHeading(u, "TERMINAL PREFERENCES", "设置", "让每一次护送都保持舒适。");
  let y = Y(177.8);
  fill(c, HT.card, X(14), y, X(392), Y(174.6), X(5));
  c.strokeStyle = HT.line; c.lineWidth = X(1); rr(c, X(14), y, X(392), Y(174.6), X(5)); c.stroke();
  const toggles = [
    { key: "music", label: "背景音乐", desc: "低音量氛围配乐", on: host.audio.music },
    { key: "sfx", label: "游戏音效", desc: "武器与关键提示", on: host.audio.sfx },
  ];
  toggles.forEach((item, i) => {
    const ry = y + Y(4) + i * Y(91.3);
    text(c, item.label, X(28), ry + Y(32), F(16), HT.ink, { weight: "600" });
    text(c, item.desc, X(28), ry + Y(52), F(11), HT.muted);
    if (i === 0) { c.strokeStyle = "#D5C9B1"; c.lineWidth = X(1); c.beginPath(); c.moveTo(X(28), ry + Y(87.3)); c.lineTo(X(392), ry + Y(87.3)); c.stroke(); }
    // Switch: track + knob + value label stacked, centered in a 78px column.
    const tx = X(329), ty = ry + Y(24.5);
    fill(c, item.on ? "#D2AE6C" : "#BDC4B8", tx, ty, X(48), Y(26), Y(13));
    c.strokeStyle = item.on ? "#B88948" : "#89978C"; c.lineWidth = X(1);
    rr(c, tx, ty, X(48), Y(26), Y(13)); c.stroke();
    fill(c, "#FFFFFF", item.on ? tx + X(26) : tx + X(4), ty + Y(4), X(18), X(18), X(9));
    text(c, item.on ? "开启" : "关闭", tx + X(24), ry + Y(67.5), F(11), "#3C5650", { align: "center" });
    registerRegion({ x: X(300), y: ry + Y(10), w: X(106), h: Y(70), action: { audioToggle: item.key } });
  });
  y += Y(174.6) + Y(11);
  text(c, host.soundNote || "设置自动保存 · 切到后台时静音", X(14), y + Y(9), F(11), HT.muted);
  y += Y(34);
  text(c, "荒原轨道 · 无人机守卫", vw / 2, y + Y(16), F(11), "#819DA9", { align: "center" });
  text(c, host.version, vw / 2, y + Y(38), F(10), "#819DA9", { align: "center" });
  return y + Y(60);
}

// -- tab dock -----------------------------------------------------------------------

function drawTabsBar(u, host, registerRegion) {
  const { c, X, Y, F, vw, vh } = u;
  const barY = Y(730);
  fill(c, grad(c, 0, barY, 0, vh, [[0, HT.tabBarA], [1, HT.tabBarB]]), 0, barY, vw, vh - barY);
  c.fillStyle = "#628D91"; c.fillRect(0, barY, vw, Y(2));
  const colW = (vw - X(10)) / 5.18;
  TABS.forEach((t, i) => {
    const battle = t.id === "battle";
    const w = battle ? colW * 1.18 : colW;
    const xx = i < 2 ? X(5) + i * colW : i === 2 ? X(5) + 2 * colW : X(5) + 2 * colW + colW * 1.18 + (i - 3) * colW;
    const active = host.page === t.id;
    const by = barY + Y(2), bh = vh - by;
    if (battle) {
      // Raised octagon plate, gold when active, slate when idle.
      const py = by - Y(8), ph = bh + Y(8);
      octagon(c, xx - X(2), py, w, ph, 0);
      c.fillStyle = active ? grad(c, 0, py, 0, py + ph, [[0, "#FFE19A"], [1, "#EAB843"]]) : "#557379";
      c.fill();
      octagon(c, xx, by, w, bh, 0);
      c.save();
      const rg = c.createRadialGradient(xx + w / 2, by + bh, X(2), xx + w / 2, by + bh, bh);
      if (active) { rg.addColorStop(0, "#947326"); rg.addColorStop(0.85, "#173A43"); }
      else { rg.addColorStop(0, "#173A43"); rg.addColorStop(1, "#173A43"); }
      c.fillStyle = rg; c.fill();
      c.restore();
    } else if (active) {
      octagon(c, xx + X(2), by + Y(2), w - X(4), bh - Y(5), 0);
      c.fillStyle = "#FFCA4C"; c.fill();
      octagon(c, xx + X(4), by + Y(4), w - X(8), bh - Y(9), 0);
      c.save();
      const rg = c.createRadialGradient(xx + w / 2, by + bh, X(2), xx + w / 2, by + bh, bh * 1.2);
      rg.addColorStop(0, "#907532"); rg.addColorStop(0.78, "#24424A"); rg.addColorStop(1, "#24424A");
      c.fillStyle = rg; c.fill();
      c.restore();
    }
    const iconSize = battle ? X(39) : X(32);
    const iconY = by + (battle ? Y(12) : Y(16));
    const painted = paintUiIcon(c, t.icon, xx + (w - iconSize) / 2, iconY, iconSize, iconSize, {
      alpha: active ? 1 : 0.84,
      filter: battle ? (active ? "" : "grayscale(1) brightness(1.05)") : "grayscale(0.85) brightness(1.08)",
    });
    if (!painted) text(c, t.label[0], xx + w / 2, iconY + iconSize / 2, F(battle ? 20 : 16), active ? "#FFE7A6" : "#C7D5D1", { align: "center", weight: "700" });
    const labelColor = battle ? (active ? "#FFE289" : "#C7D5D1") : (active ? "#FFDC70" : "#C7D5D1");
    text(c, t.label, xx + w / 2, by + (battle ? Y(58) : Y(52)), F(battle ? 14 : 12), labelColor, { align: "center", weight: battle ? "700" : "750" });
    registerRegion({ x: xx, y: by - (battle ? Y(8) : 0), w, h: bh + (battle ? Y(8) : 0), action: { homeTab: t.id } });
  });
}

// -- entry ---------------------------------------------------------------------------

function drawHome(u, host, registerRegion) {
  const { c, vw, vh } = u;
  c.fillStyle = HT.paper;
  c.fillRect(0, 0, vw, vh);
  drawHeader(u, host);
  let contentH = vh;
  if (host.page === "battle") {
    drawBattleTab(u, host, registerRegion);
  } else {
    const scroll = Math.max(0, host.scroll || 0);
    c.save();
    const bottom = u.Y(730);
    c.beginPath(); c.rect(0, Y64(u), vw, bottom - Y64(u)); c.clip();
    c.translate(0, -scroll);
    const scrolledRegion = region => {
      const top = Math.max(Y64(u), region.y - scroll), end = Math.min(bottom, region.y + region.h - scroll);
      if (end > top) registerRegion({ ...region, y: top, h: end - top });
    };
    if (host.page === "train") contentH = drawTrainTab(u, host, scrolledRegion);
    else if (host.page === "research") contentH = drawResearchTab(u, host, scrolledRegion);
    else if (host.page === "shop") contentH = drawShopTab(u, host, scrolledRegion);
    else if (host.page === "settings") contentH = drawSettingsTab(u, host, scrolledRegion);
    c.restore();
    host.contentHeight = contentH;
    host.viewportHeight = bottom;
  }
  drawTabsBar(u, host, registerRegion);
}
function Y64(u) { return u.Y(64); }

export { drawHome, HT as homeTheme };
