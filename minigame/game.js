// 微信小游戏入口（适配骨架）。TapTap Minigame 运行时同构，仅需按其文档
// 调整全局对象与触摸 API 名称。
//
// 运行时契约（与 src/app/canvas-host.js 对齐）：
//   1. 在加载 game-bundle.js 之前，把主画布放到 __endlessRailsCanvas；
//   2. 游戏完全不需要 DOM —— 界面全部绘制在画布上；
//   3. 触摸通过 window.EndlessRailsCanvasHost.pointerDown/Move/Up 注入，
//      坐标必须换算到游戏逻辑分辨率（画布 width/height 即逻辑分辨率）。
//
// 发布前先生成打包产物：
//   node tools/build-minigame.cjs   （输出 minigame/game-bundle.js）

/* eslint-disable no-undef */
const root = typeof GameGlobal !== "undefined" ? GameGlobal : globalThis;
// 核心模块是 UMD：在打包环境中取 window 挂载分支，这里把 window 指回全局。
root.window = root;

const system = wx.getSystemInfoSync();
const pixelRatio = system.pixelRatio || 1;

// 第一个 createCanvas 是主屏画布；逻辑分辨率固定为 390x680，由画布
// width/height 直接声明，微信会自动拉伸铺满屏幕。
const canvas = wx.createCanvas();
canvas.width = 390;
canvas.height = 680;
root.__endlessRailsCanvas = canvas;

require("./game-bundle.js");

// 触摸桥接：微信的触摸坐标是屏幕物理像素，需要换算到画布逻辑坐标。
// The host is resolved lazily so this adapter stays order-safe.
const host = () => root.EndlessRailsCanvasHost;
const scaleX = () => canvas.width / (system.windowWidth * pixelRatio);
const scaleY = () => canvas.height / (system.windowHeight * pixelRatio);
const toPoint = touch => ({
  pointerId: touch.identifier || 0,
  clientX: touch.clientX * scaleX(),
  clientY: touch.clientY * scaleY(),
  pointerType: "touch",
  button: 0,
  preventDefault() {},
});
wx.onTouchStart(event => host().pointerDown(toPoint(event.touches[0])));
wx.onTouchMove(event => host().pointerMove(toPoint(event.touches[0])));
wx.onTouchEnd(event => host().pointerUp(toPoint(event.changedTouches[0])));
wx.onTouchCancel(event => host().pointerUp(toPoint(event.changedTouches[0])));

// 生命周期：退到后台自动暂停（与 Web 版行为一致），回前台保持暂停待玩家恢复。
wx.onHide(() => host.pauseForHidden());
