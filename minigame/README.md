# minigame/ — 微信小游戏 / TapTap Minigame 构建产物目录

本目录是可以直接用微信开发者工具（或 TapTap 小游戏工具链）打开的独立项目。
游戏本体不出现在这里——`tools/build-minigame.cjs` 把 `src/main.js`（与网页
index.html 同一个入口）起的模块图打包成单文件 CommonJS 产物：

```
node tools/build-minigame.cjs     # 输出 minigame/game-bundle.js
```

| 文件 | 说明 |
| --- | --- |
| `game.js` | 入口适配层：window 垫片、主画布、平台能力（视口/离屏画布/图片/文本输入）、触摸桥接、生命周期 |
| `game.json` | 微信小游戏配置（竖屏） |
| `project.config.json` | 开发者工具项目配置（appid 需替换为真实 appid） |
| `game-bundle.js` | 生成物，勿手改 |

## 架构对齐

- 网页与小游戏是**同一套代码**：战场、HUD、准备页、流程屏与弹窗全部由
  `src/view/ui` 的 canvas 界面引擎排版绘制在一块画布上，没有任何 DOM 依赖。
- 平台差异只在 `src/app/platform.js`；`game.js` 在加载 bundle 前设置
  `__endlessRailsCanvas`（主画布）与 `__endlessRailsPlatform`（视口、像素比、
  安全区、`wx.createCanvas` 离屏画布、`wx.createImage` 图片、`wx.showModal`
  文本输入）。宿主按 视口 × 像素比 设置主画布尺寸，界面按逻辑像素排版。
- 触摸通过 `EndlessRailsCanvasHost.pointerDown/Move/Up/Cancel` 注入，坐标即
  wx 的 `clientX/clientY`（逻辑像素）；每个触点独立转发，多指语义与网页一致。
- 核心模块（src/core）是 UMD：打包器把 `module.exports` 指向无用全局，强制走
  window 挂载分支；`game.js` 把 `window` 指回小游戏全局（GameGlobal）。
- `tests/minigame-bundle.test.js` 在模拟 wx 运行时中加载本目录的 `game.js`
  与新构建的 bundle，用触摸走完 菜单→契约→路线→战斗→切后台暂停。

## 已知限制（接入真实平台前必须处理）

- **存档未接**：`localStorage` 不存在，长期存档退化为内存态；应桥接
  微信 `wx.setStorageSync` 或 TapTap 云存档（`tap` 全局对象）。
- **音频未接**：`AudioContext` 不存在，静音运行；可桥接 `wx.createInnerAudioContext`。
- **包体**：assets/ 远超微信主包 4 MB，需资源瘦身或远程加载（见 docs/PORTING.md）。
- **字体**：界面使用系统字体栈；小游戏中文字度量来自 `wx.createCanvas` 的 2D 上下文，需在开发者工具中复核换行。
