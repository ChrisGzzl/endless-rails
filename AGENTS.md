# Endless Rails repository rules

- Canonical repository: `ChrisGzzl/endless-rails`, with the game at the repository root. Use its current `main` as the baseline for future work. `ChrisGzzl/indie-trail` contains historical code and is not the target for this game.
- Before changing code, read `README.md` and `export/worklog.md`. After each completed change, append a numbered `### <编号>. [类型] <标题>` entry to `export/worklog.md` with the baseline, changes, verification, and remaining limits.
- When the worklog changes, update its SHA-256 in `export/manifest.yaml`.
- Keep the Web and Canvas paths aligned, rebuild `minigame/game-bundle.js` when its source graph changes, and advance the shared cache version for a release. Run relevant tests before updating `main`.
- The entry script's `?v=` does not propagate to its ES-module imports on GitHub Pages. When a runtime module changes, map its canonical `./src/...` URL to the release-versioned URL in the relevant `index.html` / `canvas.html` import map; keep that version equal to the entry query. Check the live Pages build with `qa.html` after deployment.
