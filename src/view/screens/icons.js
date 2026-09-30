"use strict";
// Sprite cell positions shared by the interface. ui-mobile-v7.webp is an
// 8 x 5 grid; each icon name maps to its background-position (the former
// .ui-icon--* rules). Card icon atlases (icons-choices / icons-weapons /
// hover drones) have their own tables next to the screens that use them.

const uiIcons = (() => {
  const P = (x, y) => `${x}% ${y}%`;
  const MOBILE = {
    shop: P(0, 0), train: P(14.285714, 0), research: P(28.571429, 0), settings: P(42.857143, 0),
    scrap: P(57.142857, 0), components: P(71.428571, 0), data: P(85.714286, 0), supply: P(100, 0),
    pointDefense: P(0, 25), storage: P(14.285714, 25), radar: P(28.571429, 25), repair: P(42.857143, 25),
    rapid: P(57.142857, 25), piercing: P(71.428571, 25), missile: P(85.714286, 25), incendiary: P(100, 25),
    chain: P(0, 50), ricochet: P(14.285714, 50), blades: P(28.571429, 50), scatter: P(42.857143, 50),
    scavenger: P(57.142857, 50), fragile: P(71.428571, 50), pressure: P(85.714286, 50), armor: P(100, 50),
    wrench: P(0, 75), shield: P(14.285714, 75), magnet: P(28.571429, 75), upgrade: P(42.857143, 75),
    pause: P(57.142857, 75), fullscreen: P(71.428571, 75), back: P(85.714286, 75), reroll: P(100, 75),
    pulse: P(0, 100), battle: P(14.285714, 100), cluster: P(28.571429, 100), split: P(42.857143, 100),
    hangar: P(57.142857, 100), trainNav: P(71.428571, 100),
  };
  // An icon node style: the contextual icon style with this icon's cell.
  function icon(base, name) {
    const pos = MOBILE[name] || MOBILE.train;
    return { ...base, backgroundPosition: pos };
  }
  return { MOBILE, icon };
})();

export { uiIcons };
