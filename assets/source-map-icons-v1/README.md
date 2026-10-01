# Endless Rails 地图图例 v1

由内置 ImageGen 生成并定向修正列车朝向。原始透明 PNG 为 `atlas.png`（1536×1024，3×2），游戏按需加载 `assets/map-legends-v1.webp`（768×512，约 120 KB）。仅等比缩小和 WebP 编码，保留 alpha 与六种主体；未改绘图内容。

顺序：当前列车、启程车站、废弃站点 / 补给站、高危隔离区、污染核心。补给仅为预留素材，没有新增节点玩法。未知节点沿用无类型的问号标记，绝不采样真实站点图标。

运行时按 alpha 边界采样，保留长宽比；未解码/加载失败时保留既有 Canvas 图例和点击功能。不参与主页或战斗美术加载门槛。

## 生成提示词

Use case: stylized-concept.
Asset type: ONE production transparent sprite atlas for the map legends of Endless Rails, a portrait mobile game about an armored expedition train reclaiming railways in a near-future industrial zombie apocalypse.
Primary request: create a cohesive, polished SIX-ICON map legend atlas. These icons will sit at 44–60 pixel sizes on a desaturated parchment topographic railway map with conventional black-and-white rail lines. They must look like actual small illustrated places and an armored train, not emoji, badges, skill-tree balls or unrelated UI clipart.
Composition: landscape 3:2 image, exactly THREE columns and TWO rows, six equal SQUARE cells in a precise regular grid. Each single icon centered in its cell, occupying about 68 percent of the cell, ample transparent margins on ALL sides. No grid lines, labels or extra objects between icons. Genuine transparent alpha background.
Unified style: premium stylized 2D game miniatures, simplified hand-painted forms with strong dark charcoal outlines and broad clear silhouettes; lightly modeled bevels, restrained shading, same elevated three-quarter map camera for every icon, same soft upper-left light, same visual weight. Mostly ivory metal, desaturated slate and olive, modest warm amber mechanical accents. NOT photorealistic, NOT pixel art, NOT flat geometric vector placeholders. Readable at tiny size, no micro-detail, no bright neon outline or strong glow, no ambient floor shadows outside the sprite, no ground diorama bases, no decorative circular/square/hex badge frames.
Exact cell order left-to-right, top-to-bottom:
1. CURRENT TRAIN: compact heavy near-future armored locomotive, ivory plated body with modest amber stripe, dark teal windows, sturdy dark undercarriage and paired tiny lamps. Vertical long axis, nose points UP toward the top of the image, compact width-to-height around 0.7. No tracks, no steam cloud. A train matching a sci-fi drone escort survival game.
2. START STATION: small intact industrial railway terminal, ivory/slate angular roof, clear short platform and upright signal mast, a modest pale-teal signal lamp. Entire terminal compact and iconic, no locomotive or track extending outside.
3. ORDINARY COMBAT STATION: small abandoned industrial rail station with a visibly broken roof and dark doorway, one short damaged canopy, olive-gray structure. Broad recognizable station silhouette, no gore and no characters.
4. SUPPLY DEPOT: compact rugged railway maintenance/supply hut, a simple large crate and a recognizable service gantry or wrench-shaped equipment element. Same architecture and paint style, restrained amber supplies.
5. ELITE / QUARANTINE SITE: armored industrial checkpoint, chunky slate bunker with one prominent red quarantine warning pennant bearing a SIMPLE dark skull pictogram, broken antenna, muted maroon hazard accents. Dangerous but unmistakably a location; do not make a separate emoji skull badge.
6. BOSS / CONTAMINATION CORE: large distinct infected industrial reactor/tower, ivory-gray steel wreckage overtaken by broad deep-purple and muted crimson organic growths surrounding a visible sickly green reactor core. More imposing and symmetric than the elite site, compact boss-location silhouette, no humanoid boss character, no magical fantasy tower.
Constraints: all six sprites individually isolated and unclipped, consistent camera/style/scale, no typography, letters, numbers, watermark, logo, railroad connector lines, UI panels or decorative frames. Alpha transparency must be real; do NOT draw a checkerboard. The image is an actual atlas sampled in game code, not a presentation or mockup.

## 定向修正提示词

Use case: precise-object-edit. Image 1 is the EDIT TARGET, a transparent SIX-ICON Endless Rails production atlas. Preserve the successful unified ivory/slate/amber hand-painted apocalypse industrial style, all six subjects and their details, lighting, charcoal contours, and the exact 3-column by 2-row equal-square-cell order (train, intact station, ruined station / supply depot, quarantine checkpoint, infected reactor).
Make TWO targeted corrections:
1. Redraw ONLY the locomotive in the top-left cell so its front nose, windscreen and two headlamps are clearly at the TOP/UPPER edge of that cell, facing UP the expedition map. Its long axis remains vertical, compact armored train, clean overhead/elevated plan view. It must face away/up, not toward the viewer at the bottom. Keep the ivory body, amber stripe, dark undercarriage and distinctive armored train design. Do not rotate the entire atlas or any other icon.
2. Scale and recenter each individual sprite within its own cell, so every object, antenna, pennant, platform edge, organic growth and antialiasing pixel stays at least 40 pixels inside every edge of its 512x512 cell on a 1536x1024 atlas. Occupancy at most 80% on either axis. STRICT transparent space between every cell. No sprite or antenna may cross a row or column boundary.
Maintain genuine alpha transparency everywhere outside the six icons. Remove ambient hazy halos or ground shadows. No background surface, no checkerboard, no text, labels, frames or grid lines. Preserve every other visual property. This is a production atlas, not a poster.
