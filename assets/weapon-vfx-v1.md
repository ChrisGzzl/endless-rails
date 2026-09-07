# Weapon VFX v1

Created with the built-in Imagegen tool for Endless Rails. Runtime asset: `weapon-vfx-v1.webp` (1254 × 1254), encoded from the generated PNG without cropping or repainting. The existing aircraft and station artwork is preserved.

The sheet is a 4 × 4 grid with equal cell dimensions. Rows contain looping violet plasma, violet ricochet impact, looping ground fire, and fire impact. Canvas additive compositing removes the black backdrop and preserves soft light. Adjacent frames crossfade; impact rows clamp at their last frame. Ground fire stays attached to its existing world position. Ricochet impact instances are capped at 24 and repeated hit flashes are limited per projectile.

## Fleet callsigns

| Role | Callsign |
| --- | --- |
| Command | 北辰 |
| Machine gun | 雨燕 |
| Missile | 天隼 |
| Incendiary | 烛龙 |
| Ricochet | 回响 |
| Cutter | 弦月 |
| Arc | 惊蛰 |
| Scatter | 繁星 |
| Rail projectile | 白虹 |
| Machine gun escort | 雨燕僚机 |

Names and weapon labels are centralized in `combat-effects.js` and used by upgrade cards, the inspector and the result build summary. Weapon IDs and combat parameters are unchanged.

## Imagegen prompt

Use case: stylized-concept. Asset type: ONE production game VFX sprite atlas for a top-down sci-fi drone survival game, square 1024x1024. EXACT 4 columns by 4 rows of evenly spaced cells, each 256x256, no grid lines. Pure solid BLACK (#000000) background for additive compositing. Each effect centered in its cell, fits inside 200x200 with 28px black padding, no overlaps between cells. Painterly high quality rendered luminous effects with volumetric texture and readable silhouettes, not line art, no UI, no letters or labels, no aircraft, no scenery. Camera top-down. Row 1 (4 sequential looping frames): a compact violet and icy lilac plasma orb with brilliant white central energy core, swirling thick wisps of plasma and small shard sparks; coherent spherical form, each frame different swirl. Row 2 (4 frames left to right of a ricochet contact burst): violet-white impact blooming outward from a tight star into a rich circular energy shockwave and dispersing violet fragments, black empty corners. Row 3 (4 sequential looping animation frames): circular pool of burning orange-gold napalm seen from above, irregular flame tongues flickering around a dark charred center, richly textured molten embers, licking yellow flames; broad circular footprint of same size each frame, realistic rendered stylization and strong amber edges, no smoke covering the whole cell. Row 4 (4 sequential frames): fiery grenade impact, first a compact bright molten orange fireball, then expanding yellow-orange fire bloom, then a wider ring of curling flame, finally scattered glowing embers and receding flames. Consistent centers, even exact cell sizes, saturated violet for top two rows and warm orange amber for bottom two. Bright detailed sprite cores with soft glow fading fully to black within each cell. The atlas must work cropped by exact equal quarter widths and heights.
