// 微信小游戏入口（适配层）。TapTap Minigame 运行时同构，仅需按其文档
// 调整全局对象与触摸 API 名称。
//
// 运行时契约（与 src/app/canvas-host.js、src/app/platform.js 对齐）：
//   1. 在加载 game-bundle.js 之前，把主画布放到 __endlessRailsCanvas，
//      并在 __endlessRailsPlatform 上提供平台能力（视口、离屏画布、图片、
//      文本输入）；
//   2. 游戏完全不需要 DOM —— 战场、HUD、准备页、弹窗全部绘制在这一块画布上；
//   3. 触摸通过 EndlessRailsCanvasHost.pointerDown/Move/Up 注入，坐标为
//      逻辑像素（与网页的 CSS 像素相同，即 wx 的 clientX/clientY）。
//
// 发布前先生成打包产物：
//   node tools/build-minigame.cjs   （输出 minigame/game-bundle.js）

/* eslint-disable no-undef */
const root = typeof GameGlobal !== "undefined" ? GameGlobal : globalThis;
// 核心模块是 UMD：在打包环境中取 window 挂载分支，这里把 window 指回全局。
root.window = root;

const system = wx.getSystemInfoSync();
const pixelRatio = Math.min(3, system.pixelRatio || 1);
const safeArea = () => {
  const s = system.safeArea;
  if (!s) return { top: 0, right: 0, bottom: 0, left: 0 };
  return { top: s.top, left: s.left, right: Math.max(0, system.windowWidth - s.right), bottom: Math.max(0, system.windowHeight - s.bottom) };
};

// 第一个 createCanvas 是上屏画布：宿主按 视口 × 像素比 设置它的 width/height，
// 界面按逻辑像素排版后整体缩放绘制；之后的 createCanvas 都是离屏画布。
const canvas = wx.createCanvas();
root.__endlessRailsCanvas = canvas;

// 图集与界面图标都用 Image 加载；小游戏没有 Image 构造器，用 wx.createImage 垫上。
if (typeof root.Image === "undefined") root.Image = function Image() { return wx.createImage(); };

root.__endlessRailsPlatform = {
  viewport: () => ({ w: system.windowWidth, h: system.windowHeight, dpr: pixelRatio, safe: safeArea() }),
  createCanvas: (w, h) => { const c = wx.createCanvas(); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; },
  createImage: () => wx.createImage(),
  promptText: (title, value, done) => wx.showModal({ title, editable: true, placeholderText: value, content: value, success: r => done(r.confirm ? r.content : null), fail: () => done(null) }),
  pointerFine: false, hover: false, overlayScrollbars: true,
  // 小游戏本身就是全屏独立运行：不提供“全屏游玩 / 安装”入口。
  standalone: true,
};

require("./game-bundle.js");

// 触摸桥接：wx 的 clientX/clientY 已是逻辑像素，直接转发；每个触点独立
// 转发，摇杆、按钮与滚动的多指语义与网页一致。
// The host is resolved lazily so this adapter stays order-safe.
const host = () => root.EndlessRailsCanvasHost;
const toPoint = touch => ({
  pointerId: touch.identifier || 0,
  clientX: touch.clientX,
  clientY: touch.clientY,
  pointerType: "touch",
  button: 0,
  relative: true,
  preventDefault() {},
});
const each = (event, fn) => { for (const touch of event.changedTouches || event.touches || []) fn(toPoint(touch)); };
wx.onTouchStart(event => each(event, p => host().pointerDown(p)));
wx.onTouchMove(event => each(event, p => host().pointerMove(p)));
wx.onTouchEnd(event => each(event, p => host().pointerUp(p)));
wx.onTouchCancel(event => each(event, p => host().pointerCancel(p)));

// 生命周期：退到后台自动暂停（与 Web 版行为一致），回前台保持暂停待玩家恢复。
wx.onHide(() => host().pauseForHidden());
if (wx.onWindowResize) wx.onWindowResize(size => {
  system.windowWidth = size.windowWidth; system.windowHeight = size.windowHeight;
  host().resize();
});
