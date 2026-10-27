# Progress

Update this file at the end of each milestone (brief §0, item 9).

| Milestone | Day | Status | Exit checks |
|---|---|---|---|
| M1 Foundation | 1 | Built and deployed. | 7 of 7 pass (Pages: deploy job passed; open the site once in a browser to confirm). |
| M2 Economy | 2 | Built. Exit checks not all pass. | 7 of 11 pass; 4 fail (1, 6, 8, 9). Owner decisions needed (Q-32, Q-33, Q-35). |
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

## M2 Economy (2026-10-27)

### What works

- **Data:** economy, generator, population, recipe, and service values in `/data`, with schemas and link checks. Q-05, Q-06, Q-07, and Q-22 use their defaults (`DECISIONS.md`).
- **Economy tick (§9):** population and station use, production (input factor, capital factor, security), Machinery install and wear, background flow between locations in the same sector and one lane apart, off-map input trickle, off-map export, region balance, noise, price history. Prices with clamp, spread, and unit-by-unit quotes. The tick runs once each game day (about 1 ms for 43 locations).
- **Generator steps 4–9 (§6.6–§6.11):** blueprint, host planets, producer placement, supply paths with relays, other station types, sizes, tech levels, services, start location, validation (structure rules and a 200-day economy run), repairs, and rejection with seed + 1. The log keeps the seed used, tries, repairs, and rule results.
- **Tools:** `npm run gen-report -- <seeds>` and `npm run sim-economy -- <days> <seeds>` (with `--csv=<dir>`, `--override=<json>`).
- **Debug panel:** item 8 "Show all prices". Item 7 has a page for module icons.
- **Art (2026-10-27):** new `style.json`, module icons (`modules.json`), and combat effects (`effects.yaml`, converted to `effects.json`) from Claude Design, with checks and tests.

### What does not work yet

- Market screen and services for the player (M3). The player cannot trade yet.
- NPC trade agents (stretch goal, not started).

### Known issues

- Many consumers sit at the 3.0 price clamp for part of the time. The owner accepts this when it is not systemic (Q-31).
- The chain shock does not show in neighbor sectors (Q-32). Off-map supply at 5% did not change this.
- Machinery volumes are small (about 1 unit a day for the region; targets at the 3-unit minimum), so the Machinery price ratio between Core and Frontier is noisy in the 200-day generator check (Q-35).
- `npm audit`: 0 problems.

### Exit checks (after the owner decisions of 2026-10-27)

| # | Check | Result | Value |
|---|---|---|---|
| 1 | 95 of 100 seeds pass with 2 tries or fewer. | FAIL | 90 of 100 (seeds 1–100); 176 of 200 (seeds 1–200). Most failures: the advanced-goods gradient (Q-34 rule, Machinery only). See Q-35. |
| 2 | No systemic price clamp (soft check, Q-31). | PASS | 20 of 20 seeds. NOTE: 49 of 240 commodity-seeds are at the clamp on more than 20% of market-days (high clamp only). |
| 3 | No stock below 0. | PASS | 20 of 20 seeds, 1,000 days. Unit test too. |
| 4 | No producer below 30% output for more than 60 days in a row. | PASS | 20 of 20 seeds. |
| 5 | Gradient (Q-34: advanced goods per commodity). | PASS | 20 of 20 seeds. |
| 6 | Each commodity: a route of 1–3 jumps with margin 25% or more on 60% of days. | FAIL | 17 of 20 seeds (Composites 25%–52%, Electronics 22%). |
| 7 | Raw goods: a route of 1–2 jumps with margin 40%–80% on 50% of days. | PASS | 20 of 20 seeds. |
| 8 | Chain shock: Alloys next door +30%, back within 10% in 60 days. | FAIL | 0 of 20 seeds (rise 0%–20%). See Q-32. |
| 9 | Capital: output higher for 60 days after 10 Machinery. | FAIL | 15 of 20 seeds. See Q-33. |
| 10 | Recipe value and wear unit tests pass. | PASS | `tests/econ.test.ts` |
| 11 | `PROGRESS.md` is updated. | PASS | This file |

### Input target test (owner request, 2026-10-27)

`inputTargetDays` sets the target stock of recipe inputs. Off-map supply 5% in all runs. Generator: 50 seeds (100 for 3 and 10 days); economy: 10 seeds, 400 days.

| Input target | Generator pass (2 tries) | Producers that fail "low output" in generator tests | Commodity-seeds at the clamp > 20% | Routes | Capital |
|---|---|---|---|---|---|
| 3 days | 42 of 100 | 182 | 2 of 120 | 8 of 10 | 2 of 10 |
| 5 days | 32 of 50 | 44 | 7 of 120 | 7 of 10 | 2 of 10 |
| 7 days | 42 of 50 | 11 | 18 of 120 | 9 of 10 | 3 of 10 |
| 10 days (kept) | 90 of 100 | 1 | 19 of 120 | 9 of 10 | 5 of 10 |
| 3 days, flow share 1.0 | 18 of 50 | 107 | 1 of 120 | 8 of 10 | 2 of 10 |
| 3 days, κ × 2 | 28 of 50 | 55 | 4 of 120 | 8 of 10 | 3 of 10 |

Result: smaller input targets keep fewer markets at the clamp, but producers starve. Flow is proportional to the price gap, and a smaller target gives a lower price for the same stock, so a producer pulls fewer goods (Electronics Fabs and Agri Worlds starve first). The default stays at 10 days. Try a value with `--override='{"balance":{"economy":{"inputTargetDays":3}}}'`.

### Tool results

`npm test`: 11 test files, 610 tests, all pass.

`npm run gen-report -- 100`:

```
Generator report: seeds 1..100, 26579 ms (266 ms per seed)
Tries: 1: 64, 2: 26, 3: 8, 4: 2
Rule failures (all tries): gradient 30, supplyRatio 5, twoSectors 13, lowOutput 1
Repairs: add ice_mine 8, add electronics_fab 5, start at 2, add rare_element_mine 7, add electrolysis_plant 4, add smelter 4, add machine_works 5
Stations: trade_hub 346, industrial_station 757, habitat 291, mining_station 534, military_outpost 180, processing_station 219, pirate_haven 32, shipyard_station 4
Supply/demand ratio (median, min, max): water 1.04 [0.91, 1.15]; hydrogen 1.17 [1.02, 1.38]; iron_ore 1.09 [0.91, 1.43]; silicates 1.17 [0.98, 1.52]; rare_elements 1.14 [1.00, 1.32]; oxygen 1.14 [0.91, 1.39]; alloys 1.12 [1.00, 1.33]; food 1.06 [0.98, 1.33]; composites 1.18 [0.91, 1.83]; electronics 1.10 [1.01, 1.34]; machinery 1.12 [0.93, 1.35]; medicine 1.14 [0.92, 1.69]
Check (Section 6.11): 90 of 100 seeds pass with 2 tries or fewer (need 95): FAIL
```

`npm run sim-economy -- 1000 20`: 1,000 days × 20 seeds in 69 s. Median prices (Frontier / Middle / Core): Iron Ore 10 / 15 / 18, Rare Elements 78 / 129 / 175, Electronics – / 521 / 608, Machinery 1450 / 1136 / 1098.

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
