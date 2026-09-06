# Survival pacing and stations

The run uses five routes (48 / 54 / 60 / 66 / 72 seconds before route modifiers). Experience stays across stations. The first two levels require 4 and 6 kills' worth of experience. Difficulty is controlled by `balance.difficultyAt(station, elapsed, duration)`, independently of the player's level.

| Route | Opening / ending live cap | Spawn batch | Opening / ending interval | Regular base HP |
| --- | --- | --- | --- | --- |
| 1 | 5 / 10 | 1 | 2.40 / 1.55 s | 1.10 → 1.45 |
| 2 | 13 / 19 | 1 | 2.00 / 1.15 s | 1.75 → 2.10 |
| 3 | 21 / 28 | 2 | 1.60 / 0.75 s | 2.40 → 2.75 |
| 4 | 29 / 37 | 2 | 1.20 / 0.62 s | 3.05 → 3.40 |
| 5 | 37 / 46 | 3 | 0.80 / 0.62 s | 3.70 → 4.05 |

Route one has no elites. Later routes gradually raise elite probability and movement speed. Contract and route modifiers apply after the base curve. The final mutant appears after 22 seconds; victory requires defeating it and reaching the protected terminal.

## Weapon roles

- Basic gun: nearest-target direct fire; rapid / spread / piercing remain upgrades.
- Orbiting blades: move with the drone and rotate, cutting nearby enemies on a capped tick.
- Incendiary grenade: arcing flight followed by a stationary burning area.
- Ricochet energy ball: wall reflections, piercing targets; can hit again after bouncing.
- Homing missile: limited turn rate, explodes on impact and damages a cluster.
- Chain arc: visible link to a second nearby enemy.
- Station volatile protocol: kills trigger local explosions; secondary explosions do not recurse.

Each level offers three choices and includes an unlearned trajectory weapon while one is available. Drone movement remains the floating, analog, speed-based joystick (180 logical px/s).

## Station flow

The station approaches in the final seven seconds. Entering its defense zone stops spawning and disables player input. Four visible turrets fire beams and destroy pursuers over time while the train slows to a halt. Only after the 3.4-second sequence ends and no pursuers remain does the station selection open. Station kills do not award experience, preventing a string of combat upgrade overlays interrupting arrival.

Every intermediate station repairs the train and offers three free major upgrades. Scrap can reroll the offers once; zero scrap never blocks departure. Reroll clears any previous selection. The choice overlays use viewport-sized grids and three cards with compact short-screen styling.

## Visual language

- Train: amber/yellow armor, angular linked cars.
- Drone: ivory body, cyan lamps and rotor silhouette.
- Zombies: lime skin, purple torn clothing, reaching humanoid limbs; elites carry bright mutations.
- Station: blue-gray platforms, hazard edges, cyan defensive beams.

## Validation and inspiration

Run `node --test endless-rails/*.test.js`. Regression coverage includes opening pacing over 12 deterministic seeds, distinct weapon damage/paths, queued upgrades, turret clearing before selection, free departure, final arrival, and joystick behavior.

Genre inspiration: [Vampire Survivors developer page](https://poncle.itch.io/vampire-survivors), [Survivor.io weapon roles](https://www.bluestacks.com/blog/game-guides/survivor-io/sio-skills-evolution-guide-en.html). Values above are designed for this short train-escort game, not copied from either title. Opening simulations are an initial balance check, not a substitute for player feedback.
