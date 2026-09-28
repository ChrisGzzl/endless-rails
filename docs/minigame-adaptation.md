# Canvas 化改造与小游戏适配（实施记录）

2026-09-28 实施。本文是 `PORTING.md`（移植方案）的后续：该文的结论是"ESM 打包零改动可解，app 层 DOM 是真正大头，走 shim 或 canvas 化"。本轮把其中"canvas 化"路线**正式落地**：运行时核心已完全无 DOM，微信小游戏与 TapTap Minigame 只差平台 SDK 桥接。

## 一、架构：一套引擎，两种呈现

```
                    ┌─ Web 页（index.html）
                    │  game.js（DOM 壳：HUD DOM + 覆盖层面板 + 输入）
  engine.js ────────┤
  （无 DOM 状态机）  │
                    └─ canvas.html / 小游戏
                       canvas-host.js（输入/循环/流程接线）
                       canvas-ui.js（HUD + 流程屏全 canvas 绘制）
```

| 新模块 | 职责 |
| --- | --- |
| `src/view/surface.js` | 唯一 canvas 表面（canvas/ctx/W/H），宿主经 `setSurface()` 安装；渲染层不再自己找画布 |
| `src/app/engine.js` | 从 game.js 抽出的无 DOM 核心：state 构造、update、frameStep、resetRun；对外暴露 `presentation` 钩子对象 |
| `src/app/flow-logic.js` | 从 flows.js 抽出的无 DOM 流程逻辑：契约/路线/升级/进站/结算全部返回纯数据 |
| `src/app/canvas-host.js` | canvas-only 宿主：指针/键盘输入、区域命中、流程动作接线、rAF 循环（带单帧异常防护） |
| `src/view/canvas-ui.js` | canvas HUD（血条/行程/经验/BOSS/toast/脉冲）与全部流程屏（菜单/契约/路线/升级/进站/结算）绘制 |
| `src/entry/canvas-main.js` | canvas-only 模块入口 |
| `minigame/` + `tools/build-minigame.cjs` | 微信小游戏适配骨架与打包器（详见下） |

`presentation` 钩子（`updateHud/toast/combo/showBoss/renderLevelUp/renderStation/renderResult/...`）是接缝：引擎与 sim 层只调用钩子，Web 壳（game.js/flows.js）和 canvas 宿主（canvas-host.js）各自填充实现。`sim/` 不再触碰 DOM——此前 `sim/run.js`、`sim/docking.js` 直接 import DOM 版 `updateHud`，`sim/spawn.js` 直接写 `ui.bossWrap`，本轮全部改道。

## 二、验收：三条门，全部自动化

1. **原有 38 项测试全绿**——Web 路径行为不变（test-harness 从 index.html 解析真实模块图，新模块的 import/export 自动被校验）。
2. **`tests/canvas-boot.test.js`**——canvas-only 路径用纯指针区域点击走完 菜单→契约→路线→战斗→脉冲→升级。
3. **`tests/canvas-purity.test.js`**——沙箱中**根本不提供 `document`** 跑完整 canvas 模块图与战斗帧；未来任何共享模块新增 `document` 直引会立刻 ReferenceError。
4. **`tests/minigame-bundle.test.js`**——构建小游戏 bundle 后，在模拟小游戏运行时（GameGlobal + wx + 画布，无 document/window/Image/localStorage）加载 `minigame/game.js`，用缩放后的 wx 触摸事件走完流程并验证帧循环推进。

浏览器实测（本机 127.0.0.1，分辨率 420×800）：index.html 全流程（含升级三选一、伤害统计）与 canvas.html 全流程（触摸驱动）均零脚本错误。

## 三、小游戏产物（minigame/）

```
node tools/build-minigame.cjs     # 生成 minigame/game-bundle.js（26 模块）
```

- 打包器与 test-harness 同一执行模型：按浏览器深度优先顺序拼接 strip 后的模块，顶层声明共享作用域（不做函数包裹，这正是 core UMD 的 `typeof module` 检测仍走 window 挂载分支的原因）。
- `minigame/game.js`：window→GameGlobal 垫片、`wx.createCanvas()` 主屏（逻辑 390×680）、wx 触摸→`EndlessRailsCanvasHost.pointerDown/Move/Up` 坐标换算桥接、`wx.onHide` 自动暂停。
- `game.json` / `project.config.json`：竖屏配置骨架，appid 需替换。

**接入微信前必办**（骨架已留位，见 minigame/README.md）：

| 事项 | 现状 | 接入方式 |
| --- | --- | --- |
| 美术图集 | 无 `Image`，图集加载跳过，程序化地形兜底 | `atlas.js` 的 `new Image` 换 `wx.createImage()` 或适配层提供 Image 垫片 |
| 存档 | `localStorage` 缺失，长期存档退化为内存态 | 桥接 `wx.setStorageSync` / TapTap 云存档（`tap` 全局） |
| 音频 | `AudioContext` 缺失，静音 | `wx.createInnerAudioContext`（audio.js 是注入式，改动集中） |
| 包体 | assets/ 44 MB vs 微信主包 4 MB | 资源瘦身/远程化（PORTING.md 第三节，单独立项） |

## 四、与 PORTING.md shim 路线的关系

PORTING.md 第二节的备选"写 shim 把 document/window 伪装出来"**已被本方案取代**：shim 方案要永久维护假 DOM（10 个样式表 220K 的 CSS 无法 shim），而分层方案让平台差异收缩到 surface 安装 + presentation 钩子 + 输入桥接三处。esbuild 打包结论仍有效且更简单——小游戏产物不再需要 esbuild（自带打包器），Web 部署如需单文件仍可用该命令。

## 五、顺手修复

- `manifest.webmanifest` 的 `start_url` 原为 `./?source=homescreen?v=v0.9.0-rc.5`（双 `?`，第二个参数不生效），改为 `&v=`。
- canvas-host 帧循环加单帧异常防护：渲染帧抛错不再静默杀死整个循环（本次实测中正是它把一个漏 import 从"游戏静默冻结"变成"立即报错"）。

## 验证边界

微信开发者工具与 TapTap 工具链**未实跑**（本机无该环境）；模拟运行时覆盖了全局垫片、模块求值、触摸缩放与帧循环，但 wx SDK 的真实行为（触摸坐标精度、onHide 时机、createCanvas 尺寸策略）需在开发者工具中复核。实机性能未验证。
