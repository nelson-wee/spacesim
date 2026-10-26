# Progress

Update this file at the end of each milestone (brief §0, item 9).

| Milestone | Day | Status | Exit checks |
|---|---|---|---|
| M1 Foundation | 1 | Built and deployed. | 7 of 7 pass (Pages: deploy job passed; open the site once in a browser to confirm). |
| M2 Economy | 2 | Not started | — |
| M3 Trade and ships | 3 | Not started | — |
| M4 Combat core | 4 | Not started | — |
| M5 Threat and encounters | 5 | Not started | — |
| M6 Fleet (feature freeze) | 6 | Not started | — |
| M7 Contracts, career, save | 7 | Not started | — |
| M8 Polish and release | 8 | Not started | — |

## M1 Foundation (2026-10-26)

### What works

- **Project:** Vite, TypeScript (`strict`), rot.js, Vitest. `npm run dev`, `build`, `test`, `typecheck`, `world-report`. GitHub Actions: `ci.yml` (branches and pull requests) and `deploy.yml` (push to `main`, deploys to GitHub Pages).
- **Core:** seeded RNG with named streams, `GameState` (one plain object, JSON round trip), event bus, clock with fractional days and one daily tick for each whole day.
- **Data:** all 17 data files of §4.1 and the 4 art files of §18, each with a schema and a load-time check, and checks of the links between files. Files for later milestones are empty objects.
- **World generator, steps 1–3:** 10 sectors, spanning tree plus extra lanes (no crossings, 1–4 lanes each), core sector, development levels, tech levels, security baselines, 3–6 bodies for each sector on orbit rings, planet types by development level, one jump point for each lane, names, start location in the core sector.
- **Ships:** hulls, all internal modules, Pulse Laser, tiers, the starting Shuttle loadout. Stats: mass, thrust, TWR, `move`, agility, maneuver, fuel rate, fuel and cargo capacity.
- **Travel:** sector travel, jumps, docking fuel (gravity), fleet rules (the slowest ship sets the time; each ship uses its own fuel), fuel warning before a trip, stop and tow at 0 fuel, recovery fee, cargo sale for the fee, debt.
- **Screens:** title (seed input, random seed), sector map, region map (security levels, lanes, jump keys), log, help (`?`), status bar, short log. Keyboard and mouse.
- **Debug panel** (development build only; F12 or `` ` ``): add credits, set fuel, teleport, skip days, show the seed.
- **Temporary Refuel** at the Hydrogen base price (M3 replaces it).

### What does not work yet

- Producers, population, markets, services, and prices (M2, M3).
- Station types (all station slots show as "Station" until M2).
- Map knowledge: the player sees all locations (M3).
- Threat band and security trend on the region map (M5).
- "Continue" on the title screen (M7).
- Map travel animation (M8).

### Known issues

- **Frontier sectors (M2 risk):** 122 of 200 seeds have only 1 Frontier sector. Rare Elements need producers in 2 sectors (§6.10). A retry cannot fix this. The Q-07 default now changes sectors in generator step 2. See `docs/requirements/README.md`, Q-07.
- The tow takes no time, and the fee uses base prices. M2 and M3 change the prices.

### Exit checks

| # | Check | Result | How |
|---|---|---|---|
| 1 | The same seed gives the same world. | PASS | `tests/generator.test.ts`, `tests/state.test.ts` |
| 2 | The player can travel in a sector and jump between sectors. | PASS | `tests/travel.test.ts`; manual check in Chromium (screenshots) |
| 3 | Fuel goes down. | PASS | `tests/travel.test.ts` |
| 4 | A tow happens at 0 fuel. | PASS | `tests/travel.test.ts`; manual check with the debug panel |
| 5 | The build runs on GitHub Pages. | PASS (deploy) | Pull request #1 merged to `main`; workflow run 40279979109: build and `deploy-pages` passed. This session cannot reach github.io, so open https://nelson-wee.github.io/spacesim/ once to confirm. |
| 6 | Each actor has a fleet (list of ships). | PASS | `src/core/types.ts`, `tests/state.test.ts` |
| 7 | `PROGRESS.md` is updated. | PASS | This file |

### Tool results

`npm test`: 8 test files, 785 tests, all pass (generator rules on 60 seeds).

`npm run world-report -- 200 1`:

```
Lanes per world: median 15, min 13, max 17
Lane length: mean 18.7, median 18.0, min 8.0, max 46.4
Topology resamples: max 0
core     sectors: median 5, min 3, max 5
middle   sectors: median 4, min 1, max 5
frontier sectors: median 1, min 1, max 5
Bodies per sector: min 3, max 6
Starting ship: mass 28 t, move 4, fuel 30, fuel per mean jump 5.98, jumps on a full tank 5.01
Mean jump time 3.11 days, 30-unit trip 0.94 days
```

The starting ship range is 5.0 jumps (§8.7 target: 4–6).

## Visual design import (2026-10-26)

Claude Design gave the ship art (`data/art/ships.yaml`) and the style (`data/art/style.json`).

- **Works:** `npm run import-art` converts and checks the ship art. All screens use the style colors, key caps, frames, the JetBrains Mono font, and 10 x 20 cells (canvas 1000 x 800). `render/shipArt.ts` draws ship art with role colors, mirror swaps, damage states, and the hot tint. Debug panel item 7 shows all art. 798 tests pass.
- **Not yet used:** battle art (M4), portraits (M3, Q-29), surrender marker (M5), threat band (M5), heat bar (M4), tier letters (M3).
- **Open:** Q-29 (portrait slot marks do not match hull slot counts), Q-30 (`◘` is not in JetBrains Mono). Icons and combat effects are still placeholders.
- **Check:** in Chromium, the canvas is 1000 x 800 and the font loads; screenshots of all screens and all art pages show no errors.

<!--
Template for each milestone:

## M<n> <name> (<date>)

- **Works:**
- **Does not work:**
- **Known bugs:**
- **Exit checks:** <check>: PASS/FAIL (<value>)
- **Tool results:** <tool>: <summary>
-->
