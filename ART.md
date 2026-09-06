# Science-fiction swarm art


## Hover revision — 2026-09-06

Generated using the built-in imagegen tool. Final project assets:
- `endless-rails/assets/hover-drones-v2.webp` — 1254 × 1254, transparent 3 × 3 aircraft atlas; replaces aircraft cells and upgrade icons.
- `endless-rails/assets/hover-poster-v2.webp` — 1024 × 1536 start-screen key art, edited from the original poster using the new atlas as a design reference.

Both outputs were encoded as WebP at quality 88 without resizing or modifying image content. The original atlas continues to supply train, turret and zombie sprites. `hoverFrames` contains alpha bounds for the new nine aircraft cells in the same command/gun/missile/incendiary/blades/ricochet/chain/scatter/piercing order. Eight flight headings and independent weapon aim remain; short lateral RCS puffs, lift wash, shadows and vertical bob replace rear jet flames. The command drone remains larger and marked by a halo and brackets.

### Final hover atlas prompt

Use case: stylized-concept. Asset type: production transparent sprite atlas for a top-down science-fiction hover drone swarm game.
Create one square PNG with exactly 3 columns and 3 rows of nine isolated drones, equal square cells, centered per cell, generous 16 percent clear margins. Genuine transparent alpha background, no drawn checkerboard, no shadows outside the hull. Strict orthographic overhead view, every drone's small sensor facing UP. Crisp premium hand-painted 3D game sprites, white ceramic and dark navy metal, broad readable silhouettes at 48px.
Design requirement: these are unmistakably stationary-hover-capable robotic drones which can instantly strafe in any direction, NOT fighter planes. Compact nearly circular / square / hexagonal hulls; obvious vertical lift systems viewed from above, circular ducted fans, antigravity rings, or evenly distributed levitation pods. No aerodynamic wings, pointed long noses, tails, cockpits, or rear jet exhaust. Diversity of hovering technology, not nine identical quadcopters.
Cell order left to right top to bottom:
1 command drone: white octagonal central body, bright cyan core, four large enclosed circular lift fans at diagonal corners, short cyan sensors.
2 machine gun drone: compact square body, two large lateral ducted fans, two small front gun barrels, cyan accents.
3 missile drone: chunky hexagonal body, four round lift pods, paired short orange missile racks.
4 incendiary drone: circular levitation chassis, amber glowing ring, two orange fuel tanks, small grenade port.
5 blade drone: silver round hub inside a split cyan antigravity ring, three short curved cutting blades around the rim.
6 ricochet drone: compact violet triangular hub with three big circular lift fans, purple energy ball chamber.
7 electric drone: round blue-white flying saucer, three small levitation pods, violet Tesla coils.
8 scatter drone: compact pink-accented disc with two circular lift fans, short radial gun ports.
9 piercing drone: compact white square anti-gravity platform, four round corner levitation pads, central short blue rail barrel.
No labels, no text, no border, no UI. Each object fully within its own cell. Consistent top-down camera and premium polished materials.

### Final hover poster edit prompt

Use case: precise-object-edit. Asset type: portrait start-screen poster for a science-fiction hover drone swarm train escort game.
Image 1 is the existing poster EDIT TARGET. Image 2 is the new production drone atlas DESIGN REFERENCE.
Replace all fighter planes in the poster with the corresponding compact hover-capable drone designs from image 2, matching the painted cinematic perspective of the scene. Main foreground craft is a white octagonal robotic hub with four large round enclosed lift fans at its corners and a bright cyan core, no cockpit, no wings, no pointed nose or tail. The smaller companions include orange missile hover-platforms, violet three-fan energy drones, and circular cyan blade drones. Show visible downward lift light and subtle downward airflow; no rear jet trails. They are hovering over and escorting the train, capable of stationary hover and lateral motion.
Preserve the train, tracks, ruined environment, zombies, distant cyan fortified station, dusk lighting, portrait composition and dark lower area for game menu copy. Maintain premium illustrated game-key-art polish and visual hierarchy. No text, no logos, no UI.


## Archived version 1

Generated with the built-in imagegen tool (not the API/CLI fallback), then encoded as WebP without resizing. The sprite atlas preserves real transparency. Gameplay samples individual atlas regions; heading, banking, exhaust, attack flashes and walking animation are applied at runtime.

## Project files

- `endless-rails/assets/sci-fi-atlas-v1.webp` — 1254 × 1254, sixteen aircraft / train / turret / zombie sprites, transparent alpha.
- `endless-rails/assets/slate-ground-v1.webp` — 1254 × 1254, repeating ground texture.
- `endless-rails/assets/swarm-poster-v1.webp` — 1024 × 1536, start-screen artwork.

Workspace root: `/workspace/scratch/e23c026bff5c/indie-trail/`.

The atlas uses a 4 × 4 order: command, gun, missile, incendiary / blades, ricochet, chain, scatter / piercing, locomotive, carriage, turret / zombie walk A, zombie walk B, elite, boss. `spriteFrames` in renderer.js removes transparent padding when drawing units. Artwork is sized to gameplay hit regions; the original generated PNGs are not required at runtime.

## Flight behavior

All aircraft use eight heading sectors, eased turns, banking and speed-responsive exhaust. The main craft retains its last facing on release. Specialist weapons aim independently of hull motion. Followers combine stable formation slots, small local patrol paths, bounded engagement offsets, short-range separation and return-to-formation behavior. Their acceleration and maximum speed are bounded; autonomy does not let them chase targets across the map.

## Final prompt set

### Sprite atlas

Use case: stylized-concept. Asset type: actual production sprite atlas for a top-down science fiction train escort swarm survival game.
Generate ONE square 2048x2048 transparent PNG sprite atlas: exactly 4 columns by 4 rows, sixteen equally spaced square cells, no grid lines, no labels, no text. Every sprite centered in its cell with generous transparent padding (at least 18% each side), isolated from neighboring cells. Truly transparent alpha background, no checkerboard drawn into art, no backdrop, no ground shadows outside sprites. All objects orthographic straight overhead view, all noses / heads point straight UP. Unified premium hand-painted 3D game sprite style: crisp broad silhouettes, beveled metal, restrained fine detail, high readability at 35-80px on screen. Near-future science fiction with white/blue allied machines, amber rescue train, lime/purple biological zombies. No quadcopters, no exposed helicopter propellers: vectored-thrust, antigravity, delta wings and ring drives.
Cell order left to right, top to bottom:
Row 1: (1) large elegant ivory/cyan COMMAND ship, swept manta wings, two bright blue rear thrusters, luminous central cockpit; (2) compact cyan GUN fighter, narrow angular fuselage and twin barrels; (3) orange MISSILE bomber, twin chunky missile pods and swept wings; (4) gold INCENDIARY craft with visible orange fuel capsules and triangular lifting body.
Row 2: (5) ice-blue BLADE craft, crescent-shaped wings with sharp blade tips; (6) violet RICOCHET craft, circular antigravity ring and spherical glowing energy core; (7) indigo LIGHTNING craft, forked twin-prong nose and electric coils; (8) pink SCATTER craft, wide fan-shaped five-nozzle forward battery.
Row 3: (9) pearl-white PIERCING craft, needle nose and long single rail barrel; (10) amber armored locomotive pointing up, elongated rectangular vehicle with black windshield and cyan accents, NO rails; (11) matching amber armored freight carriage, long rectangular ribbed roof, NO rails; (12) blue-gray station defense turret, square armored foundation and white twin long barrels pointing up.
Row 4: (13) SMALL lime-skin purple-clothing humanoid zombie WALK frame A, reaching arms, left leg forward; (14) exactly same small zombie WALK frame B, right leg forward; (15) larger lime mutant brute, purple torn clothing, asymmetrical glowing pustules; (16) massive magenta biological zombie boss, hunched muscular shoulders and lime growths, clearly organic not a tank.
Constraints: consistent camera / scale within related classes, intact unclipped silhouettes, every object stays in its own fixed cell. NO words, NO numbers, NO UI, NO border, NO extra objects. This image will be directly sampled as a sprite atlas by game code.

### Ground

Use case: stylized-concept. Asset type: seamless repeating ground texture for a top-down science fiction train escort survival game. One square 1024x1024 tile, opaque full-bleed.
Scene: abandoned off-world industrial wasteland at blue hour. Orthographic straight down camera, absolutely flat overhead, no horizon. Dark desaturated blue-slate compacted ground, subtle cracked concrete mixed with dust, a few small irregular stone plates and faint worn service markings. Hand-painted high-end 2D/3D game art, softly modeled surface detail, controlled contrast. Sparse composition with quiet playable ground; no large focal object. The tile must repeat seamlessly horizontally and vertically. Muted cool charcoal navy palette, medium-dark ground that lets ivory/cyan aircraft, amber trains and lime zombies stand out. Flat soft diffuse illumination; no baked directional large shadows.
Constraints: ground only. NO rail track, NO train, NO aircraft, NO zombies, NO buildings, NO glowing lines, NO words or symbols, NO visible grid, NO vignette, NO decorative border. No perspective. Low visual noise. Texture will scroll beneath separately rendered gameplay objects.

### Poster

Use case: stylized-concept. Asset type: portrait key art / start-screen background for a polished science-fiction train escort game called Endless Rails. No text in the image.
A sleek ivory-and-cyan manta-wing command aircraft leads a swarm of different small autonomous combat ships above a long amber armored train, traveling from bottom-left toward upper-right on a railway through an abandoned blue-slate industrial wasteland at twilight. One orange twin-pod missile craft, one violet ring-drive craft, one slender blue railgun craft and one crescent-wing blade craft clearly flank the flagship. These are sophisticated antigravity aircraft with vector thrusters, NOT quadcopters or helicopters. Small green-skinned purple-clothed zombies rush from the ground edges. A fortified blue-white station glows in the upper-right distance. Composition: dynamic elevated three-quarter camera, flagship and train occupy upper two-thirds; bottom third is quiet dark blue atmosphere suitable for overlaid title and a button. Refined hand-painted sci-fi game illustration, strong distinct silhouettes, beveled ivory metal, cyan engines, warm amber train lamps, restrained cinematic sparks, readable organized action. High quality detailed but not photorealistic. Portrait 2:3. No typography, no letters, no logos, no watermarks, no UI.
