# 铁路地图图例 v2（v0.12.0.6）

使用内置 ImageGen 编辑 v1 图集，统一末日工业背景与 45° 微缩视角，减少手机尺度下无法辨认的纹理。列车改为车头与侧面同时可见的机车，保留大块驾驶窗、灯和车轮。

- 编辑目标：`../source-map-icons-v1/atlas.png`
- 输出：`atlas.png`，1536×1024 RGBA，透明背景。
- 图集顺序：第一行列车、启程站、废弃站；第二行补给站、隔离区、污染核心。
- 运行时：`../map-legends-v2.webp`，768×512，WebP q88，保留 alpha；只做等比缩小与编码，不修改图像内容。
- 地图显示：普通站 38px、危险站 42px、列车 46px、核心 48px；按 alpha 边界取样并保持比例。没有节点底板或框。补给仅预留图例，不新增商店玩法。

## 完整编辑提示词

```text
Use case: precise-object-edit. Image 1 is the EDIT TARGET: a SIX-ICON transparent production atlas for Endless Rails, a portrait mobile armored-train survival game set in infected industrial ruins.
Redesign the SAME six subjects for SMALL MOBILE MAP LEGENDS that will display at only 36–46 pixels. The current image is much too detailed, and the current train viewed from above is unrecognizable.
Preserve the exact 3 columns by 2 rows, equal square cell order: locomotive, starting station, ruined station / supply depot, quarantine outpost, infected industrial reactor. Preserve genuine alpha transparency and the cohesive ivory-metal, slate-blue, restrained amber palette.
CHANGE THE STYLE TO simpler clean stylized painted game icons: chunky broad shapes, thick readable charcoal contours, only two or three large shading regions per surface, no cracks/scratches, no exposed tiny pipes, cables, rivets, rubble chunks, roof tile patterns or rust noise. Clean near-future industrial silhouettes. Medium contrast suited to a light ivory cartographic background. Absolutely no floor diorama tiles or ornamental frames. These are tiny map legends, not detailed concept illustrations.
TRAIN: completely REDRAW cell 1 as a clearly recognizable COMPACT ARMORED DIESEL LOCOMOTIVE in the SAME ISOMETRIC 45-degree front-and-side view as the other buildings. Long axis diagonal bottom-left to top-right, front nose faces upper-right, camera sees a large locomotive windscreen, two headlamps, a broad ivory and amber nose, chunky black wheels or bogie, and a short visible side body. Width-to-height silhouette roughly 1.1 to 1.3, not an elongated top-down cigar. This must instantly read as a TRAIN at 44 pixels. NOT overhead, NOT a car, NOT a tank, NOT a rocket. A short locomotive front with a recognisable train undercarriage is more important than detail.
STATIONS: simplified large arched roof, single large doorway and short canopy; ruined station has just one obvious broken-roof section, starting station has one chunky signal mast. No brick or tile texture. No tiny window patterns.
SUPPLY: single small workshop and one clearly oversized supply crate, no clutter.
QUARANTINE: simple chunky bunker and one large muted-red warning pennant with a simple skull silhouette, no antenna forest, no weapons clutter.
BOSS: single broad cylindrical infected reactor, strong sickly-green center, a few large purple organic growths, no intricate wires/tendrils or many surrounding towers. Keep distinct from the red quarantine outpost.
Composition: 1536x1024 transparent atlas, every icon centered and compact within its own 512x512 cell, at least 48px EMPTY alpha margins on ALL sides. No icon crosses a grid boundary, no backdrop, gradients, cast shadow outside objects, checkerboard, text, labels, UI or borders. All six share one consistent 45-degree map miniature camera, outline weight and simplified finish.
```

