# 荒原轨道 · Endless Rails

零依赖、无构建的静态 PWA：编组远征列车，指挥无人机蜂群，在不断扩大的尸潮中重新打通末日铁路。

## 目录结构

```
.
  index.html             Web 页面入口；只含一个脚本标签 <script type="module" src="src/main.js">
  canvas.html            canvas-only 入口（无 DOM 运行路径，小游戏同款）；入口 src/entry/canvas-main.js
  manifest.webmanifest   PWA 清单（start_url 的 ?v= 与全站缓存版本共用一个值）
  qa.html / qa.js        浏览器诊断台：帧率、布局越界、脚本错误、场景快进
  assets/                美术资源（精灵图集、地面、UI 精灵、ImageGen 源图）
  css/                   10 个样式表；内部 url() 相对样式表目录解析，引用资源写 ../assets/
  docs/                  reviews.md（评审与整改记录）、ART.md、DESIGN.md、PORTING.md、minigame-adaptation.md
  export/                供稿目录（全局 agent.md 标准）：manifest.yaml + worklog.md（工作记录：继续工作前先读，改动后追加条目）
  minigame/              微信小游戏/TapTap 构建产物（node tools/build-minigame.cjs 生成 bundle；适配骨架 game.js）
  src/                   游戏运行时代码（原生 ES Module，见下）
  tests/                 29 个测试 + test-harness.cjs；根目录 node --test 递归执行
  tools/                 图集打包脚本（pack-ui-v3~v7.py）、pacing-check.cjs、dev-server.cjs、build-minigame.cjs
  services/player-data/  开发用存档服务（node server.cjs；测试 node --test）
```

当前版本：`v0.9.0-rc.5`（对应 index.html 版本标签与全站 `?v=` 缓存参数）。

## 本地运行

原生 ESM 不能用 `file://` 直接打开，需要任意静态服务器：

```
cd endless-rails   # 本仓库根目录
python3 -m http.server 8123     # 或 npx serve 等价
```

- 游戏：http://127.0.0.1:8123/
- 诊断台：http://127.0.0.1:8123/qa.html
- canvas-only 入口（无 DOM，小游戏同款）：http://127.0.0.1:8123/canvas.html

## 测试

```
node --test
```

26 个测试文件全绿为改动的验收线（29 个测试 = 26 游戏 + canvas 启动/纯度 + 小游戏 bundle 冒烟）。`test-harness.cjs` 的纪律是"测试环境跟随真实页面"：假 DOM 的元素集合与模块加载图都解析自真实的 index.html（`entry` 可换 canvas.html），模块图中每条具名导入都会校验目标确实导出——"测试里有、页面上没有"或反向的脱节会直接测试失败。canvas-purity 测试在完全不提供 `document` 的沙箱里跑通整条 canvas 路径，守住"共享模块不得直引 DOM"的红线。

## src/ 结构

```
src/
  main.js     Web 组合根：唯一入口，import 顺序即加载顺序契约（替代旧 18 个 script 标签）
  core/       与 UI 无关的规则模块（UMD，保留 window 挂载供测试以 CJS require 消费）
              balance 数值 · motion 运动 · progression 经验/掉落 · combat-effects 武器与羁绊
              control 操控 · route-events 路线/契约 · run-record 战绩
              audio 音频 · cloud-sync 云存档核心 · cloud-config 云开关
  meta/       longterm 长期养成存档（等级/研究/蓝图/区域）
  sim/        纯模拟逻辑，不触碰 DOM
              world 世界与相机 · spawn 出怪 · fx 粒子与提示 · enemies 敌人行为
              combat 目标/伤害/击杀 · weapons 武器与弹道 · docking 进站清场
              station 升级池数据 · run 蜂群/路线/结算
  view/       surface 唯一 canvas 表面 · atlas 素材加载与精灵绘制 · render 场景绘制
              hud 脏值比较 DOM HUD（Web 用） · canvas-ui canvas HUD 与流程屏（canvas/小游戏用）
  app/        engine 无 DOM 核心状态机（state/update/frameStep + presentation 钩子）
              game.js Web 组合壳（DOM HUD + 覆盖层面板 + 输入） · flows DOM 流程薄层
              flow-logic 无 DOM 流程逻辑（契约/路线/升级/进站/结算，两种呈现共用）
              canvas-host canvas-only 宿主（输入/区域命中/流程接线/帧循环）
              input 摇杆与键盘 · gm 调试面板 · dom/hooks 叶子模块
              meta-ui/armory/display/settings/cloud-ui 界面面板
  entry/      canvas-main.js canvas-only 入口（安装画布后引 canvas-host）
```

分层约定：`sim/` 不写 DOM；依赖方向为 `core ← sim ← app`，view 可读 game 状态；屏幕流程的逻辑集中在 `app/flow-logic.js`（返回纯数据），Web 的 DOM 渲染在 `app/flows.js`、canvas 的绘制在 `view/canvas-ui.js`。引擎与 sim 层对界面的全部写操作走 `engine.js` 的 `presentation` 钩子，由各宿主填充实现。小游戏移植现状见 `docs/minigame-adaptation.md`。

## 约定与须知

- **缓存版本**：index.html 所有资源共用一个 `?v=` 值，test-harness 有断言强制一致；发布改动时整体更新这一个值。
- **加载顺序**：由 src/main.js 的 import 顺序保证；调整模块依赖时先看这张图。
- **QA 桥**：game.js 把 `update/draw/beginRoute/updateHud` 等显式挂到 window，供 qa.js 与浏览器控制台诊断使用。
- **工作记录**：`export/worklog.md`（继续工作前先读，改动后追加条目，`### <编号>. [类型] <标题>` 格式）；评审与整改状态：`docs/reviews.md`。
