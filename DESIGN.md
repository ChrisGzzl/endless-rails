# Survival pacing and stations

The run uses five routes of exactly 60 seconds of combat travel each. Experience stays across stations. The first two levels require 4 and 6 kills' worth of experience. Difficulty is controlled by `balance.difficultyAt(station, elapsed, duration)`, independently of the player's level.

| Route | Opening / ending live cap | Spawn batch | Opening / ending interval | Regular base HP |
| --- | --- | --- | --- | --- |
| 1 | 5 / 14 | 1 → 2 | 2.30 / 1.50 s | 0.90 → 1.04 |
| 2 | 35 / 53 | 4 → 6 | 1.95 / 1.15 s | 1.06 → 1.20 |
| 3 | 73 / 100 | 7 → 10 | 1.60 / 0.80 s | 1.22 → 1.36 |
| 4 | 119 / 155 | 10 → 14 | 1.25 / 0.48 s | 1.38 → 1.52 |
| 5 | 173 / 218 | 13 → 18 | 0.90 / 0.48 s | 1.54 → 1.68 |

Route one has no elites. Later routes gradually raise elite probability and movement speed. Contract and route modifiers apply after the base curve. The final mutant appears after 22 seconds; the final route also lasts the full 60 seconds. Defeating it early reduces pressure; terminal turrets finish any surviving pursuer during the arrival sequence.

## Weapon roles

- Basic gun: short-range, low-damage, high-frequency point fire. Scatter and piercing are separate specialist aircraft.
- Cutter: a continuous circular cutting field (72 px radius at level 1, +8 per level up to 112), hits all targets every 0.25 s for 0.75 + 0.3 × level damage. Three to six visible blades show the swept area. No gaps at the hub or between blade tips. A density grid selects nearby crowds every 0.3 s; the cutter may move 70 px from its patrol goal and returns when more than 115 px from its formation slot.
- Incendiary grenade: arcing flight followed by a stationary burning area.
- Ricochet energy ball: wall reflections, piercing targets; can hit again after bouncing.
- Homing missile: limited turn rate, explodes on impact and damages a cluster.
- Chain arc: visible link to a second nearby enemy.
- Station volatile protocol: kills trigger local explosions; secondary explosions do not recurse.

Each level offers three choices and includes an unlearned aircraft type while one is available. Drone movement remains the floating, analog, speed-based joystick (180 logical px/s).

## Station flow

The station approaches in the final seven seconds. Entering its defense zone stops spawning and disables player input. Four visible turrets fire beams and destroy pursuers over time while the train slows to a halt. Only after braking finishes and no pursuers remain does the station selection open. Station kills do not award experience, preventing a string of combat upgrade overlays interrupting arrival.

Every intermediate station repairs the train and offers three free major upgrades. Scrap can reroll the offers once; zero scrap never blocks departure. Reroll clears any previous selection. The choice overlays use viewport-sized grids and three cards with compact short-screen styling.

## Visual language

- Train: amber/yellow armor, angular linked cars.
- Drone: ivory body, cyan lamps and rotor silhouette.
- Zombies: lime skin, purple torn clothing, reaching humanoid limbs; elites carry bright mutations.
- Station: blue-gray platforms, hazard edges, cyan defensive beams.

## Validation and inspiration

Run `node --test endless-rails/*.test.js`. Regression coverage includes opening pacing over 12 deterministic seeds, distinct weapon damage/paths, queued upgrades, turret clearing before selection, free departure, final arrival, and joystick behavior.

Genre inspiration: [Vampire Survivors developer page](https://poncle.itch.io/vampire-survivors), [Survivor.io weapon roles](https://www.bluestacks.com/blog/game-guides/survivor-io/sio-skills-evolution-guide-en.html). Values above are designed for this short train-escort game, not copied from either title. Opening simulations are an initial balance check, not a substitute for player feedback.

## Specialist swarm and ground movement

The player controls a large, white/cyan command drone. A machine-gun aircraft starts in formation; missiles, incendiary grenades, ricochet balls, orbiting blades, chain lightning, scatter fire and piercing fire each unlock their own specialist. Weapon origins and rendering use the same persistent aircraft positions. Upgrading an existing type increases its weapon level and hull tier marks instead of duplicating its damage on the command craft. Up to three extra machine-gun escorts can join. Formation slots remain distinct near edges and followers have bounded movement speed.

Ground features, railway sleepers, ground fire, core drops and station braking use a single integrated world-distance value. Burning areas stay attached to their landing site and leave the screen with the ground; moving the command drone cannot move them. The final station has a longer braking approach because it starts farther away. Combat animations use a separate clock. Small zombies have alternating jointed steps, shoulder sway and reaching hands; aircraft use hover bob, downward lift wash, short lateral RCS puffs and type-specific firing flashes.


## Horde revision checks

Ordinary enemy health grows by only 0.22 per route and 0.20 within each route. Elite probability ends at 8.2% on route five, so most enemies stay easy to kill. Boss HP remains a separate encounter value. Live caps are ceilings, not promised simultaneous enemy counts: a strong build can clear waves before they accumulate.

Nearest-target selection is linear. Cosmetic particles are capped at 420 and floating labels at 24; combo animation restarts at most once every 0.15 s. Kill rewards and damage are never dropped by these visual budgets.

`horde.test.js` covers 360-degree cutter coverage, inner and outer range, damage cadence, crowd seeking and leash, 166 simultaneous kill rewards under VFX budgets, and complete station clearing of the larger horde. All 12 regression files pass. Twelve seeded opening simulations still reach the first station with full repaired health and level 4. A sampled route-four build killed 398 enemies in about 60 s while retaining 170 train HP; this is a smoke check, not a guarantee for other builds. Native Canvas rendering of 160 zombies plus the specialist fleet measured 2.6 ms median / 4.1 ms p95 in the development environment, not a mobile browser benchmark.


## Weapon roles and tactical pause — 2026-09-07

`combat-effects.weaponProfile(id, level, cores)` now supplies both the combat simulation and the inspector. All specialist acquisition respects distance from its own hull to the target edge. Straight bullets expire at their maximum travel range. Missiles continue homing after a valid launch until their lifetime expires; ricochet balls can continue beyond acquisition range until lifetime or bounce count is exhausted. Swept projectile collision avoids skipping small enemies at high speed.

| Lv.1 aircraft | Single hit damage | Interval | Lock range | Distinct effect |
| --- | --- | --- | --- | --- |
| Gun | 0.65 | 0.15 s | 155 px | Single target, 6.67 rounds/s |
| Gun escort | 0.50 | 0.22 s | 145 px | Separate auxiliary gun, up to 3 escorts |
| Missile | 5.00 | 4.20 s | 340 px | Homing; 68 px blast; 4 s lifetime |
| Arc | 1.65 | 1.05 s | 205 px | Up to 3 targets; 100 px jumps |
| Scatter | 0.65 / pellet | 0.80 s | 135 px | 5 pellets in a fan |
| Piercing | 2.80 | 1.25 s | 300 px | Up to 3 targets along the shot |
| Incendiary | 0.50 / tick | 3.60 s | 250 px | 55 px ground fire; ticks every 0.4 s for 3.8 s |
| Ricochet | 1.30 | 1.90 s | 230 px | 3 wall rebounds; 4.8 s lifetime; piercing |
| Cutter | 1.05 / tick | 0.25 s | 72 px | Continuous cutting disc and autonomous crowd seeking |

Upgrades increase damage and, where appropriate, improve intervals, radii, pellet counts, chain counts or penetration. Gun core effects are explicit: scatter adds bullets, overdrive speeds up the gun by 8% per layer (up to five layers), arc triggers a 65%-damage jump every fourth gun hit. Cores never give other specialist weapon families to the command craft.

The pause button and P/Escape open `armory.js`. Combat, projectiles, route motion, cooldowns and docking freeze, while joystick state is cleared. Losing window focus automatically pauses combat/docking. Inspection from upgrade or station selection returns to the same pending choice. Four tabs show weapon parameters, live movement/cooldown and credited damage/kills, actual next-level changes, and the team's train/modules/core modifiers. Unowned aircraft can be previewed at their level-one values. Theoretical DPS is explicitly one target and one projectile, without splash/chain/core bonuses. Damage totals exclude overkill; direct kill counts exclude train/pulse/volatile-protocol kills.

The terminal uses 12 items per page on tall screens, 9 below 700 px and 6 below 450 px. CSS and interaction handlers disable text selection, image dragging, long-press menus and page overscroll on game surfaces; the canvas keeps its own pointer capture and touch-action:none, while menu buttons and the native aircraft selector keep normal interaction.

Validation: 14 Node regression files pass, including range gating for all eight weapon families, actual cooldown enforcement, short bullet travel, swept high-speed collision, blast/chain limits, core profiles, non-overkill attribution, pause freeze/resume, docking freeze, pending-upgrade preservation, short-screen pagination and gesture cancellation. Twelve deterministic opening runs still reach station one with repaired 100 HP and level 4.


## Mobile display and flow revision — 2026-09-07

The fullscreen buttons request fullscreen on the document root so that all sibling overlays remain visible. Unsupported or rejected calls present add-to-home-screen instructions. The manifest provides standalone/fullscreen launch, portrait preference, scoped URLs, and 192/512 px mask-safe PNG icons rendered from the existing ER monogram's SVG. iOS web-app metadata and safe-area padding are included. No service worker or offline capability is claimed: the game still loads current resources online, avoiding stale script caches during rapid iteration.

Phone HUD/footer shrink to 72/58 px plus safe areas. The canvas logical dimensions follow the available battle area's aspect ratio with its shorter edge at 390 units, so circles and aircraft never become flattened. Resize shifts all entities and both ends of effects together, preserves relative world positions, and resets the joystick. Desktop fullscreen retains a readable maximum width; touch devices use the viewport.

Kill XP, not the XP threshold, is reduced. Before level 3, ordinary kills still give 1 XP to establish the fleet. Afterwards ordinary kills give 0.65 / (1 + 0.15 × (route − 1)), rounded to hundredths. Runners/crawlers give 80% of that; elites start from 2 instead of the old 4. Thresholds remain 4, 6, 8, … . After the first two upgrades, automatic prompts are at least 15 combat seconds apart. Pending upgrades are grouped into the same visit, with a manual claim button for earlier use. The last five seconds defer automatic prompts until the safe station. Arrival preserves pending upgrades and returns to the major station choice after they are claimed.

Six infection variants share the game's animated sprite language: ordinary walkers; fragile fast runners (introduced after 28 s in route one); low crawling zigzag enemies; acid spitters that hold medium distance and launch slow visible projectiles; bloated spore carriers whose deaths damage nearby enemies; and slow elite brutes. Acid projectiles are capped at 32 and clear on arrival. Crowd caps increase to 218, while ordinary base HP tops out at 1.68 before type and contract modifiers.

`mobile-flow.test.js` checks all 15 route/event combinations for 60-second travel, lower XP, six variants, upgrade cadence and station preservation, portrait/landscape aspect matching, relative-coordinate preservation, terminal cleanup of a surviving boss, acid attacks, and fullscreen success/exit/fallback paths. Fifteen Node regression files pass; the 12 seeded opening runs reach station one at level 4 with repaired 100 HP and 26–33 kills (previously 18–25).

Platform references: [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen), [Apple's home-screen web-app instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios), [Chrome install criteria](https://web.dev/articles/install-criteria).

Three seeded full-run smoke simulations, with a balanced specialist build and automatic pulse use, reached the terminal with 2,453–2,466 kills and 18–19 grouped upgrade visits. These runs validate feasibility and cadence, not difficulty for every player/build.

## Standalone art and command weapon revision — 2026-09-08

iOS home-screen mode can keep a separate WebKit image cache from the Safari tab. In standalone mode, the five required art sheets are now fetched with `cache: "reload"`, versioned nonces and Blob URLs before image decoding. Direct image requests remain the fallback, followed by the existing bounded retries and manual retry control. Blob URLs live for the page session and are released on `pagehide`. The manifest start URL and all entry script/style URLs carry the same release version.

北辰 now carries the fixed 星脉炮: 0.9 damage, 0.72-second interval, 220 px range and 480 px/s projectile speed. It targets independently, records its own volleys/damage/kills and appears as a weapon in the tactical terminal.

The Imagegen-produced `missile-arc-vfx-v1.webp` is a 4 × 4 atlas for 天隼 missile flight/explosions and 惊蛰 electrical links/impacts. Additive frame crossfades replace the simple projectile and arc lines, with the original geometry retained as a loading fallback. Eighteen regression files pass, including standalone Blob loading, command fire ownership, atlas row selection and the existing full-route survival checks.
