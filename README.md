# 荒原轨道 · Endless Rails

零依赖、无构建的静态 PWA：编组远征列车，指挥无人机蜂群，在不断扩大的尸潮中重新打通末日铁路。

主仓库：`ChrisGzzl/endless-rails`。游戏位于本仓库根目录；`ChrisGzzl/indie-trail` 仅保留旧历史，不再作为本项目开发基线。继续开发前先读 `AGENTS.md` 和 `export/worklog.md`。

## 目录结构

```
.
  index.html             Web 页面入口：只有一块 <canvas id="gameCanvas"> 和一个模块脚本 src/main.js（界面全部画在画布上）
  manifest.webmanifest   PWA 清单（start_url 的 ?v= 与全站缓存版本共用一个值）
  qa.html / qa.js        浏览器诊断台：帧率、布局越界、脚本错误、场景快进
  assets/                美术资源（精灵图集、地面、UI 精灵、ImageGen 源图）
  docs/                  reviews.md（评审与整改记录）、ART.md、DESIGN.md、PORTING.md、minigame-adaptation.md
  export/                供稿目录（全局 agent.md 标准）：manifest.yaml + worklog.md（工作记录：继续工作前先读，改动后追加条目）
  minigame/              微信小游戏/TapTap 构建产物（node tools/build-minigame.cjs 生成 bundle；适配层 game.js）
  src/                   游戏运行时代码（原生 ES Module，见下）
  tests/                 34 个测试 + test-harness.cjs；根目录 node --test 递归执行
  tools/                 importmap.cjs（生成 index.html 的版本化 import map）、build-minigame.cjs、pacing-check.cjs、dev-server.cjs
  services/player-data/  开发用存档服务（node server.cjs；测试 node --test）
```

当前版本：`v0.11.1.0`（对应 index.html 版本标签与全站 `?v=` 缓存参数）。

局外列车等级由废料手动购买整级（Lv1→2 为 71 废料，Lv1→30 合计 21,273）；每级获得 2 个**改装点**用于车厢与分支构筑。永久研究消耗废料加研究数据/技术组件，七项全满的废料费用为 21,196。远征只带回废料、组件、数据与蓝图，不再产生局外 XP。旧 v1/v2 存档保留列车等级，级内 XP 按比例折为废料且只转换一次。局内武器经验仍用于当局升级，与列车无关。

局外可积累资源目前为废料、技术组件、研究数据；改装点是随列车等级派生的分配额度，蓝图是收藏解锁，免费重构为剩余次数。体力与每日出发限制尚未实现，商店也未开放；不预设新的“特殊物资”货币。

GitHub Pages 会缓存 ESM 子模块；发版时改 index.html 入口的 `?v=` 与 manifest 版本，再运行 `node tools/importmap.cjs` 重写整张 import map，详见 `AGENTS.md`。上线后用 `qa.html` 的 320×568 与 390×844 临时存档检查布局。

## 本地运行

原生 ESM 不能用 `file://` 直接打开，需要任意静态服务器：

```
cd endless-rails   # 本仓库根目录
python3 -m http.server 8123     # 或 npx serve 等价
```

- 游戏：http://127.0.0.1:8123/
- 诊断台：http://127.0.0.1:8123/qa.html

## 测试

```
node --test
```

34 个测试文件 + 12 项存档服务测试全绿为改动的验收线（`node --test` 共 47 项）。`test-harness.cjs` 的纪律是"测试环境跟随真实页面"：模块加载图解析自真实的 index.html，每条具名导入都会校验目标确实导出；沙箱里只有一块假画布（确定性文字度量的 2D 上下文），**没有 `document`**。测试通过宿主桥 `EndlessRailsCanvasHost` 驱动界面：`ui.tap(key)` 在排版后的节点中心做命中测试再按下/抬起（必要时先滚动到可见），和手指点击走同一条路径。canvas-purity 测试另外静态扫描 `src/`，除 `app/platform.js` 外禁止任何 DOM 构造/查询；minigame-bundle 测试构建小游戏 bundle，在模拟 wx 运行时里跑通整条流程。

## src/ 结构

```
src/
  main.js     组合根：唯一入口（云存档配置 → 云同步核心 → canvas 宿主）
  core/       与 UI 无关的规则模块（UMD，保留 window 挂载供测试以 CJS require 消费）
              balance 数值 · motion 运动 · progression 经验/掉落 · combat-effects 武器与羁绊
              control 操控 · route-events 路线/契约 · run-record 战绩
              audio 音频 · cloud-sync 云存档核心 · cloud-config 云开关
  meta/       longterm 长期养成存档（等级/五分支天赋/七项永久研究/方案槽/蓝图/区域/v0.9→v0.10 迁移）
  sim/        纯模拟逻辑
              world 世界与相机 · spawn 出怪 · fx 粒子与提示 · enemies 敌人行为
              combat 目标/伤害/击杀 · weapons 武器与弹道 · docking 进站清场
              station 升级池数据 · run 蜂群/路线/结算
  view/       surface 战场画布表面 · atlas 素材加载与精灵绘制 · render 战场绘制
    ui/       canvas 界面引擎（零依赖）：css 值解析 · text 文字排版 · layout 块/弹性/网格/行内排版
              （含外边距折叠、滚动容器、经典滚动条槽）· paint 背景/边框/阴影/变换/滤镜/裁剪/遮罩绘制
              · kit 节点树、状态样式（hover/active/disabled/focus-visible）、命中测试、多指按压、
              滚动、焦点与 Tab/Enter/Space、补间动画
    screens/  界面描述：sheet 样式表（由原 CSS 逐条转写的计算样式，含 media/状态变体）
              · icons 图标精灵 · home 准备页 · battle 战斗 HUD · flows 契约/路线/升级/进站/结算
              · pause 暂停与机体检视 · dialogs 设置/显示帮助/GM/测试存档
  app/        engine 核心状态机（state/update/frameStep + presentation 钩子）
              flow-logic 流程逻辑（契约/路线/升级/进站/结算，返回纯数据）
              canvas-host 宿主：图层叠放、帧管线（战场离屏 + 界面缓存层）、输入路由、桥接对象
              ui-home 准备页控制器 · ui-run 局内控制器（HUD/摇杆/暂停/流程屏）
              ui-dialogs 设置/全屏/安装/GM/测试存档控制器
              platform 平台服务（视口/像素比/安全区、离屏画布、图片、全屏、文本输入）
              telemetry 局内统计
```

分层约定：整个游戏只有一块画布，界面不使用任何 DOM 元素；依赖方向为 `core ← sim ← app`，`view/ui` 不依赖游戏代码。界面按"控制器产出模型 → screens 描述节点树 → ui 引擎排版绘制"单向流动；控制器状态变化时只标记失效，下一帧重排重绘。战斗中界面分为战场下方层与上方层两张缓存，只有模型签名变化时才重绘。平台差异全部收口在 `app/platform.js`：浏览器读 window/matchMedia，小游戏适配层通过 `globalThis.__endlessRailsPlatform` 覆盖。小游戏移植现状见 `docs/minigame-adaptation.md`。

## 约定与须知

- **缓存版本**：index.html、import map 与 manifest 共用一个 `?v=` 值，train-research-ui 测试断言强制一致；发布时改入口版本后运行 `node tools/importmap.cjs`。
- **加载顺序**：由 src/main.js 的 import 顺序保证；调整模块依赖时先看这张图。
- **QA 桥**：canvas-host.js 把 `update/draw/beginRoute/updateHud` 等以及 `EndlessRailsCanvasHost`（状态、节点、命中框、指针/按键注入）挂到全局，供 qa.js、测试与浏览器控制台诊断使用。
- **界面改动**：样式写在 `src/view/screens/sheet.js`（CSS 属性名的 camelCase，状态/媒体变体用 `":hover"`、`"@media (...)"` 键），结构写在对应 screens 模块；节点的 `key` 是测试与桥接的定位名。
- **工作记录**：`export/worklog.md`（继续工作前先读，改动后追加条目，`### <编号>. [类型] <标题>` 格式）；评审与整改状态：`docs/reviews.md`。
