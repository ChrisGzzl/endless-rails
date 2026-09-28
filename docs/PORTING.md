# 小游戏移植方案（微信小游戏 / TapTap）

2026-09-28 评审会话产出。回答的核心问题：**"无 ESM 环境这块，能否只靠打包解决、不动业务代码？"——能，且已实测。** 但 ESM 只是移植障碍中最小的一个，本文同时给出真正的工作量分布与落地顺序。

## 一、ESM → 单文件：打包零改动解决（已实测）

```
npx esbuild src/main.js --bundle --format=iife --charset=utf8 --outfile=dist/game.js
```

- 22 个模块打成单文件 IIFE：**244.7 KB**（minify 后 147.5 KB），无残留 `import`/`export`。
- 代码对打包器友好的原因：全部相对导入、零第三方依赖、单一入口 `src/main.js`、core 层 UMD 本身就是 IIFE。
- core 十个 UMD 模块**不用改**：esbuild 将引用 `module.exports` 的模块包成 `__commonJS` 惰性闭包（定义提升到文件头），入口处按 `__require()` 调用点依序求值。已核对产物调用点顺序：cloud-config（内联）→ cloud-sync → audio → balance → motion → progression → combat-effects → control → route-events → run-record → longterm，与 `main.js` 加载契约完全一致。
- `window.EndlessRailsXxx` 挂载全部保留（audio.js 经 `root.` 挂载，同样在）；`requireModule` 的"未加载"报错守卫保留。注意 esbuild 默认 `charset=ascii` 会把中文转义成 `\uXXXX`（功能等价、不可读），加 `--charset=utf8` 保留原文。
- 现有测试不受影响：test-harness 读 `index.html` + 源码，不读 dist。

## 二、小游戏真正的门槛：DOM/BOM（打包解决不了）

微信小游戏运行时没有 `document`/`window`/`localStorage`/`Image`/`Audio`/`requestAnimationFrame`。按层盘点 DOM/BOM 接触面（grep 实测）：

| 层 | DOM/BOM 接触面 | 小游戏化成本 |
| --- | --- | --- |
| `sim/` | **零**（分层约定守住） | 原样进包 |
| `core/` | 仅 audio.js；`gameStorage(window)`、`createStore({storage})` 均注入式 | 换 wx storage / wx 音频，小改 |
| `view/` | atlas.js 的 `new Image` 图集加载 | 换 `wx.createImage()`，小改 |
| `app/` | 几乎全部（HUD、菜单、结算 = HTML+CSS，10 个样式表 220K） | **大头**：薄适配层或画进 canvas |

利好两点：战斗画面本来就是 canvas 2D 绘制（"前端要用 canvas"已满足一半）；DOM 操作已收口（dom.js 5 行、flows.js 与各面板集中）。写一个把 `document`/`window`/`localStorage`/rAF/touch shim 到 `wx.*` 的适配层即可覆盖 app 层大部分，模拟逻辑无需重写。

## 三、包体约束（比代码更早撞上）

`assets/` 共 **44 MB**（顶层图片 23.6 MB）。微信小游戏主包上限 4 MB（整包靠分包 + CDN 也有限制）。美术资源必须压缩瘦身或远程化（`wx.downloadFile`），建议单独立项。

## 四、落地顺序

1. **现在**：加 esbuild 构建脚本产 `dist/`（业务代码零改动，顺带作为"可打包性"冒烟）。
2. **小游戏化时**：sim/core 原样；写 wx 适配层（storage/音频/图片/rAF/touch）；app 层 DOM 走 shim。
3. **同步进行**：资源瘦身 / 远程化。

## 验证边界

打包产物只做了静态核验（无残留 ESM 语法、挂载齐全、求值顺序核对、守卫保留），**未在浏览器或微信开发者工具实跑**；实机与平台 SDK 集成均未验证。
