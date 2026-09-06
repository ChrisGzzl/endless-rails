# Survival pacing and stations

The run uses five routes (48 / 54 / 60 / 66 / 72 seconds before route modifiers). Experience stays across stations. The first two levels require 4 and 6 kills' worth of experience. Difficulty is controlled by `balance.difficultyAt(station, elapsed, duration)`, independently of the player's level.

| Route | Opening / ending live cap | Spawn batch | Opening / ending interval | Regular base HP |
| --- | --- | --- | --- | --- |
| 1 | 5 / 10 | 1 | 2.40 / 1.55 s | 1.10 → 1.30 |
| 2 | 28 / 40 | 3 → 4 | 2.05 / 1.20 s | 1.32 → 1.52 |
| 3 | 57 / 76 | 5 → 7 | 1.70 / 0.85 s | 1.54 → 1.74 |
| 4 | 92 / 118 | 7 → 10 | 1.35 / 0.60 s | 1.76 → 1.96 |
| 5 | 133 / 166 | 9 → 13 | 1.00 / 0.60 s | 1.98 → 2.18 |

Route one has no elites. Later routes gradually raise elite probability and movement speed. Contract and route modifiers apply after the base curve. The final mutant appears after 22 seconds; victory requires defeating it and reaching the protected terminal.

## Weapon roles

- Basic gun: nearest-target direct fire; rapid / spread / piercing remain upgrades.
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
