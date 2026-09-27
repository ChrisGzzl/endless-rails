# 手机端 UI 美术规范 · 2026-09-27

本轮沿用用户确认的商店、车厢、烧瓶、齿轮图标风格：象牙白 / 金黄 / 深青色，大块倒角、简化体积和清晰轮廓。后续图标按本规范延续，不回退为旧版写实锈蚀图标。

## 原图与封装

- `shop.png`、`train.png`、`research.png`、`settings.png` 为用户提供的原始透明 PNG，保留全部原始像素。
- `equipment.png`、`actions.png`、`regions.png` 为内置 ImageGen 生成原图。
- `scripts/pack-ui-v3.py` 负责裁切、缩小、压缩和拼图。源图不覆盖。需要 Pillow。
- 图标输出 `ui-mobile-v3.webp`，768×480，37 枚图标，96px 单格，四周至少 6px 真透明留边，约 110 KiB。
- 显示尺寸：资源 16–23px，底栏 28–39px，研究 37–43px，车厢约 54–62px，补给主插图 116px。按钮点击范围独立于图标，主要操作至少 44px。
- 四区主图每张 768×432，约 75–79 KiB；区域缩略图 1024×144 横向图集约 50 KiB。主图随选区更换，不加载全部原图。
- 面板、文字、进度、选中状态由实际 HTML/CSS 构建，避免整屏背景图，支持内容变化和手机尺寸。

## ImageGen 提示词（内置工具；参考用户原图）

### regions.png
Use case: stylized-concept. Production game art asset sheet, not UI screenshot. Use attached reference only for the exact bright sandy science-fiction apocalypse painting style and white graphite yellow modular armored train plus four small blue-thrust hovering drones. Create a clean 2 by 2 grid of FOUR full-bleed landscape illustrations, each equal rectangle, no margins/gutters, total landscape canvas. Each panel a cohesive wide cinematic environment composition with the entire long train travelling diagonally from lower left foreground to upper right distance, train is about 55% of panel, scenery readable. TOP LEFT: bright pale ochre desert canyon wilderness, sparse sandstone rocks. TOP RIGHT: destroyed sandy CITY, tall ruined tan buildings and broken viaducts, like reference. BOTTOM LEFT: abandoned industrial district with distant silos, cooling towers, chimneys, warm gray ground, clear light. BOTTOM RIGHT: infected zone, cold slate terrain with dark jagged crystals and muted purple infestation, still bright daylight readable. Consistent art, crisp broad painterly forms, moderate detail for mobile. Absolutely NO typography, UI, badges, borders, logos, frames, map markers, labels or letters. These panels will be cropped for region hero images and tiny thumbnails. Main hero scene needs visual fidelity to reference.

### equipment.png
Production transparent mobile game ICON ATLAS, square 4x4 uniform grid, exactly SIXTEEN separate isolated icons. Match the provided icons' chunky simplified clean cel-shaded beveled style, thick dark petrol contour, ivory and golden yellow accents, crisp geometric volumes. No gritty realism, no rivets/noise/tiny detail. Must read at 32 pixels. Transparent canvas, no tile backgrounds, no words, no frames. Each icon centered in its own equal square cell with generous 15% safety padding, no overlap. Order left to right, top to bottom: Row1 [bronze salvage gear, lime-green square electronic chip, single faceted cyan-blue data crystal, yellow-and-ivory armored supply chest]. Row2 [ivory yellow side-view small train carriage with roof twin gun turret, ivory yellow cargo train carriage, ivory yellow radar train carriage with compact dish, ivory yellow repair train carriage with simple wrench on roof]. Row3 [BLUE compact four-arm machine-gun drone silhouette with blue core, BLUE diagonal pointed railgun bolt, RED orange guided missile, RED orange flame]. Row4 [PURPLE lightning bolt, PURPLE glowing rebound orb with single orbit, CYAN three-blade rotating cutter, CYAN three spreading shotgun projectiles]. Row2 same side-view ivory yellow carriage style as provided reference, much simpler for tiny UI. Row3/4 should be recognizable bold skill icons, color families unmistakable. Real alpha background, no checkerboard. Consistent illumination from top left, limited detail, highly readable mobile game art.

### actions.png
Use case: stylized-concept. Mobile game UI production sprite atlas, exactly 16 isolated icons in uniform 4x4 square grid on actual transparent background. Match references' simple ivory-and-gold beveled forms with thick dark teal contour and cel shading. Bold readable at 28px, no weathering, no minute detail, no letters, no text or numerals, no tile background. Consistent size about 70% each equal cell and generous spacing. Row1 left to right: GOLD clipboard with 3 checklist lines (salvage contract), GOLD clipboard with upward bar chart (fragile train high reward), RED circular skull badge (high pressure), GOLD shield with steel ivory rim (armor). Row2: GOLD wrench, CYAN shield with ivory rim, RED horseshoe magnet, GOLD double upward chevron. Row3: ivory pause symbol two bars, ivory fullscreen four corner brackets, ivory left chevron, ivory circular reroll arrow. Row4: CYAN circular lightning badge (pulse), GOLD perspective railway track (departure navigation, wide nearer rails at bottom, narrow vanishing point at top), GOLD clustered three missiles, BLUE split twin laser bolt. Real alpha. Clean silhouettes, minimal cel shading, no glow haze outside icon. Separate isolated game icons for packing.
