# minigame/ — 微信小游戏 / TapTap Minigame 构建产物目录

本目录是可以直接用微信开发者工具（或 TapTap 小游戏工具链）打开的独立项目。
游戏本体不出现在这里——`tools/build-minigame.cjs` 把 `src/entry/canvas-main.js`
起的 canvas 模块图打包成单文件 CommonJS 产物：

```
node tools/build-minigame.cjs     # 输出 minigame/game-bundle.js
```

| 文件 | 说明 |
| --- | --- |
| `game.js` | 入口适配层：window 垫片、wx.createCanvas、触摸桥接、生命周期 |
| `game.json` | 微信小游戏配置（竖屏） |
| `project.config.json` | 开发者工具项目配置（appid 需替换为真实 appid） |
| `game-bundle.js` | 生成物，勿手改 |

## 架构对齐

- 游戏逻辑与呈现共用 `src/app/engine.js`（无 DOM 状态机）：Web 页走
  `src/app/game.js` + DOM 面板，小游戏走 `src/app/canvas-host.js` +
  `src/view/canvas-ui.js` 全 canvas 绘制。
- 触摸输入通过 `window.EndlessRailsCanvasHost.pointerDown/Move/Up` 注入，
  坐标须换算到画布逻辑分辨率（390×680），换算代码在 `game.js`。
- 核心模块（src/core）是 UMD：打包器不提供 `module`，强制走 window 挂载
  分支；`game.js` 把 `window` 指回小游戏全局（GameGlobal）。

## 已知限制（接入真实平台前必须处理）

- **美术未接**：小游戏环境没有 `Image`，图集加载被跳过，战场以程序化
  地形绘制。需要把 `src/view/atlas.js` 的加载替换为 `wx.createImage()`
  （或在适配层提供 Image 垫片）。
- **存档未接**：`localStorage` 不存在，长期存档退化为内存态；应桥接
  微信 `wx.setStorageSync` 或 TapTap 云存档（`tap` 全局对象）。
- **音频未接**：`AudioContext` 不存在，静音运行；可桥接 `wx.createInnerAudioContext`。
- **触摸多点**：适配层只转发第一触点（与摇杆语义一致）。
