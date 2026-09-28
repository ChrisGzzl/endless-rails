"use strict";
// UI sprite atlases for the canvas presentation. The DOM version consumes the
// same files through CSS background rules (mobile-icons.css / icon-ui.css /
// reference-ui.css); this module mirrors those grids so the canvas host can
// draw pixel-identical chrome. Loading is skipped entirely when no Image
// constructor exists (mini-game runtimes wire wx.createImage separately).

const uiArt = { icons: null, weapons: null, regions: null, primary: null };
if (typeof Image !== "undefined") {
  const assets = [
    { key: "icons", path: "assets/ui-mobile-v7.webp" },       // 8 x 5 grid
    { key: "weapons", path: "assets/icons-weapons-v1.webp" }, // 4 x 2 grid
    { key: "regions", path: "assets/regions-mobile-v3.webp" },// 4 x 1 grid
    { key: "primary", path: "assets/primary-button-v2.webp" },// button texture
  ];
  for (const asset of assets) {
    const picture = new Image();
    picture.onload = () => { if (picture.naturalWidth > 0) uiArt[asset.key] = picture; };
    picture.onerror = () => {};
    picture.src = asset.path + "?v=20260912-bonds-v3";
  }
}

// Cell lookup for ui-mobile-v7.webp, keyed by the CSS modifier names from
// mobile-icons.css (grid coordinates: 8 columns x 5 rows).
const ICON_CELLS = {
  shop: [0, 0], train: [1, 0], research: [2, 0], settings: [3, 0],
  scrap: [4, 0], components: [5, 0], data: [6, 0], supply: [7, 0],
  pointDefense: [0, 1], storage: [1, 1], radar: [2, 1], repair: [3, 1],
  rapid: [4, 1], piercing: [5, 1], missile: [6, 1], incendiary: [7, 1],
  chain: [0, 2], ricochet: [1, 2], blades: [2, 2], scatter: [3, 2],
  scavenger: [4, 2], fragile: [5, 2], pressure: [6, 2], armor: [7, 2],
  wrench: [0, 3], shield: [1, 3], magnet: [2, 3], upgrade: [3, 3],
  pause: [4, 3], fullscreen: [5, 3], back: [6, 3], reroll: [7, 3],
  pulse: [0, 4], battle: [1, 4], cluster: [2, 4], split: [3, 4],
  hangar: [5, 4], trainNav: [6, 4],
  // Route/event cards reuse cells via the [data-icon] aliases in mobile-icons.css.
  volatile: [7, 1], railgun: [5, 1], cargo: [1, 1], overclock: [3, 3],
  dust: [4, 2], sprint: [1, 4], freight: [1, 1], heavy: [6, 1], focus: [5, 1],
};
// icons-weapons-v1.webp grid (4 x 2), keyed like icon-ui.css.
const WEAPON_CELLS = {
  rapid: [0, 0], piercing: [1, 0], missile: [2, 0], incendiary: [3, 0],
  chain: [0, 1], ricochet: [1, 1], blades: [2, 1], scatter: [3, 1],
};
const REGION_CELLS = { wasteland: 0, ruins: 1, industrial: 2, infection: 3 };

function supportsFilter(c) { return typeof c.filter === "string"; }

function paintCell(c, img, cols, rows, col, row, x, y, w, h, { alpha = 1, filter = "" } = {}) {
  if (!img) return false;
  const sw = img.naturalWidth / cols, sh = img.naturalHeight / rows;
  c.save();
  c.globalAlpha = alpha;
  if (filter && supportsFilter(c)) c.filter = filter;
  c.drawImage(img, col * sw, row * sh, sw, sh, x, y, w, h);
  c.restore();
  return true;
}

// Draws one ui-mobile-v7 icon cell (name per mobile-icons.css) into the rect.
function paintUiIcon(c, name, x, y, w, h, options) {
  const cell = ICON_CELLS[name];
  if (!cell) return false;
  return paintCell(c, uiArt.icons, 8, 5, cell[0], cell[1], x, y, w, h, options);
}
// Draws one icons-weapons-v1 cell (level-up cards).
function paintWeaponIcon(c, id, x, y, w, h, options) {
  const cell = WEAPON_CELLS[id];
  if (!cell) return false;
  const hueRotate = id === "missile" || id === "incendiary";
  const scatter = id === "scatter";
  const filter = hueRotate ? "hue-rotate(-36deg) saturate(1.12)"
    : scatter ? "grayscale(1) sepia(1) saturate(6) hue-rotate(140deg) brightness(1.14)" : "";
  return paintCell(c, uiArt.weapons, 4, 2, cell[0], cell[1], x, y, w, h, { filter, ...options });
}
// Region thumbnail strip cell (regions-mobile-v3.webp), as used by the region
// grid cards and the faint mission-heading watermark.
function paintRegionThumb(c, regionId, x, y, w, h, options) {
  const col = REGION_CELLS[regionId] ?? 0;
  return paintCell(c, uiArt.regions, 4, 1, col, 0, x, y, w, h, options);
}
// The shared launch/continue button texture (primary-button-v2.webp), drawn
// stretched exactly like background-size:100% 100%. When the texture has not
// loaded (mini-game runtimes without an image bridge), falls back to a dark
// petrol plate with a soft gold keyline matching the texture's palette.
function paintPrimarySkin(c, x, y, w, h) {
  const img = uiArt.primary;
  if (img) { c.drawImage(img, x, y, w, h); return true; }
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#3B5866");
  g.addColorStop(0.5, "#27424D");
  g.addColorStop(1, "#1B3038");
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  if (typeof c.strokeRect === "function") {
    c.strokeStyle = "rgba(255,212,108,0.4)";
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  return false;
}

export { uiArt, paintUiIcon, paintWeaponIcon, paintRegionThumb, paintPrimarySkin };
