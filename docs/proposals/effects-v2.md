# Combat effects v0.2: scope (2026-11-04)

Status: done (2026-11-04); see PROGRESS.md, M8, "Combat effects v0.2". Scope as written before the work: The new brief is `docs/proposals/effects-v0.2.yaml` (from Claude Design, "Combat effects v0.2"). The game still uses `data/art/effects.yaml` v0.1. To start, copy the new file to `data/art/effects.yaml` and run `npm run import-art` (do not edit the YAML by hand).

## 1. What changes in the brief

| Item | v0.1 (now) | v0.2 (new) |
|---|---|---|
| Weapon effects | One version for each weapon. | Three versions: `tiers: {1, 2, 3}`. A tier changes size, count, and time, never the hue. From T2: the Core color. |
| Frame format | One key for each kind (`line`, `at`, `travel`, `foot`, `perim`, `row`). | A list of operations: `o: [{k: ...}, ...]`, 14 kinds: `at`, `line`, `ring`, `disc`, `blast`, `cells`, `exh`, `foot`, `mship`, `perim`, `proj`, `row`, `ship`, `text`. |
| Time | `total_ms_at_18_cells`. | `total_ms` (and `peak` marks the strongest frame). |
| Colors | A `colors` table. | `family_base` and `ramp_rule` (Dim, Hi, Core from the base). All other colors come from `style.json`. |
| New rules | — | `ellipse` (rings and discs on the 2:1 grid), `soft` (paint only empty cells), travel `lanes` (parallel projectiles) and `trail`. |
| New effects | — | `ship_move`, `ship_move_enemy` (ships slide with engine exhaust), `sector_travel`, `jump_out`, `jump_in`, `region_travel`, `move_preview`, `sector_route`, `region_route`, plus a `movement` table (combat and map speeds, trail, exhaust). |
| Removed | `burst3` pattern, the `colors` table. | — |

All colors that v0.2 uses are in `style.json`, except `laserCore`, `ballisticCore`, `defenseCore`, and `jumpDim`. The ramp rule gives them (Core = mix(base, white, 0.85); Dim = mix(base, void, 0.5)). All new glyphs (`► ° Φ █ ▓ ▒ ░ ═ ║ ┌ ┐ └ ┘ ▼`) are in Code Page 437.

## 2. Changes to the code

| # | Part | Change | Effort |
|---|---|---|---|
| A | Importer (`tools/lib/effectsArt.ts`, `src/data` schema) | Read the v0.2 shape: tiers, `o` lists, `scene`, `total_ms`, `peak`, `persist`, `movement`. Compute the ramp colors (Dim, Hi, Core for the 4 families; `jumpDim`). Check that each color name exists and each glyph is CP437. | 0.5 day |
| B | Effect renderer (`src/render/effects.ts`) | Replace the per-key frame code with an interpreter for the 14 operations. New geometry: ellipse rings and discs, `blast` phases, `perim` with `facing`/`all`, `frac`, and `seed` (seeded, so the same turn looks the same), `foot` with a role filter (`e` for engines) and `@glyph`/`@damage`, `at` with offsets (`[-2,-1]`), lines with `crawl`, `every`, `phase`, `dy`, and `i0`/`i1`. `soft` needs the background under each cell (space, star, lane dots), so the combat screen gives the renderer its map. | 1-1.5 days |
| C | Tiers | The resolver adds the module tier to each `shot`, `flak`, `munitionMove`, `munitionHit`, and `pd` effect (now it has only `moduleId`; two modules of the same kind can have different tiers). `effectId` picks `tiers[t]`. Enemy groups with tier 2-3 modules (named bounties) then show the stronger effects. | 0.25 day |
| D | Map animation | `sector_travel`, `jump_out`, `jump_in`, `region_travel`, `sector_route`, and `region_route` are examples in fixed preview coordinates. The game makes them from the `movement.map` rules along the real path: 3 cells for each 60 ms frame, a 5-cell trail (playerBright, player, playerDeep), engine glow `°` on every other frame, an arrival ring, Φ rings at a jump, and the region trace in thin lines. This replaces the simple trail of M8-ART-06. `sector_route` (dotted route ahead, brackets around the target, ETA) and `region_route` (thin bright route, brackets, "jumps · days · fuel") replace the M8-ART-07 highlight. Region travel gets an animation (now it has none). | 0.5-1 day |
| E | Ship movement in combat | The resolver already gives `move` effects with paths; the screen does not animate them (ships jump to the end cell). v0.2: the ship slides 45 ms for each cell (2 cells for each frame on long paths), with exhaust behind it and a puff at the stop. The screen must draw each ship at its start cell until its move plays, then hide the real ship while `mship` draws it. `move_preview` adds a reach disc (`moveBg`) and a ghost ship at the planned end cell. | 1 day |
| F | Tests and checks | Importer test; a test for each operation; one test for each weapon and tier (cells at the peak frame); the 1.2 s budget with three T3 shots; browser check of each effect (debug test battle with tier 1-3 loadouts). `sim-combat` does not change (effects are display only). | 0.5 day |

Total: about 4-5 days. Order: A, B, C first (all weapon effects then work by tier), then D, then E.

## 3. Points to decide

1. **Time budget.** T3 effects are longer (beam laser T3: 510 ms; T1: 300 ms). The rule "at most 1.2 s per turn; scale down if over" stays. A turn with many T3 shots and ship moves gets compressed. Proposal: ship moves play first and do not count toward the 1.2 s (they last at most about 0.7 s), or they count and all times scale. Owner or Claude Design to decide.
2. **Ship movement (E).** It is the largest item and changes how a turn feels (the player sees each ship move). It fits M8 polish, but it can come after the MVP if the time is short.
3. **Reference file.** The brief names `Combat Effects v2.dc.html`. It was not attached. It helps to match the timing and the look of the map effects (D).
4. **Feature freeze.** This is art polish (M8-ART-05: "load the remaining Claude Design output"), so it is allowed in M8.
