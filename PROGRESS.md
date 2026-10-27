# Progress

Update this file at the end of each milestone (brief §0, item 9).

| Milestone | Day | Status | Exit checks |
|---|---|---|---|
| M1 Foundation | 1 | Built and deployed. | 7 of 7 pass (Pages: deploy job passed; open the site once in a browser to confirm). |
| M2 Economy | 2 | Done (owner check definitions of 2026-10-27). Closed economy: carriers, K*, capacity from output and input prices. | 7 of 7 checks pass; 4 items are reports (gradient, route margins, raw-goods margins, chain shock). |
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
- **Economy tick (§9):** population and station use, production (input factor, capital factor, security), Machinery install toward the capital target K* (marginal gain = cost of capital) and wear, production capacity that follows the output price and the input prices (no limits; inputs at replacement cost), background carriers (routes of up to 3 jumps, margin after cost and risk, break-even fill, transit days, capacity by security), noise, price history. No off-map supply or demand: the economy is closed. Prices with clamp, spread, and unit-by-unit quotes. The tick runs once each game day (about 3 ms for 44 locations).
- **Volumes:** `volumeScale` 8. The largest markets hold Electronics 96 t, Composites 144 t, Medicine 215 t, and raw goods 1,400–7,000 t. A 30 t hold of Electronics costs 1.16 × base on average.
- **Generator steps 4–9 (§6.6–§6.11):** blueprint, host planets, producer placement, supply paths (static: inputs and users within the carrier range), other station types, sizes, tech levels, services, start location, structure rules, repairs, and rejection with seed + 1, then a 100-day warm-up run. The 200-day economy check is on hold (owner). The log keeps the seed used, tries, repairs, and rule results.
- **Tools:** `npm run gen-report -- <seeds>` and `npm run sim-economy -- <days> <seeds>` (with `--csv=<dir>`, `--override=<json>`).
- **Debug panel:** item 8 "Show all prices". Item 7 has a page for module icons.
- **Art (2026-10-27):** new `style.json`, module icons (`modules.json`), and combat effects (`effects.yaml`, converted to `effects.json`) from Claude Design, with checks and tests.

### What does not work yet

- Market screen and services for the player (M3). The player cannot trade yet.
- NPC trade agents (stretch goal, not started).

### Known issues

- The economy moves in slow cycles (booms and busts; the owner wants them). In a bust, a Machine Works can stand below 30% output for 87–183 days (3 of 20 seeds).
- Prices sit above base on average (median Electronics 604–737 cr, Machinery 1,125–1,238 cr, Oxygen 64–66 cr): carriers take their margin on each link, and producers grow only when their output is dearer than base. The owner accepts this level; `capacity.growthPriceFactor` can lower it.
- `npm audit`: 0 problems.

### Exit checks (owner definitions, 2026-10-27)

| # | Check | Result | Value |
|---|---|---|---|
| 1 | 95 of 100 seeds pass with 2 tries or fewer. | PASS | 98 of 100 (structure rules only; economy check on hold). |
| 2 | No systemic price clamp. | PASS | 20 of 20 seeds. |
| 3 | No stock below 0. | PASS | 20 of 20 seeds, 1,000 days. Unit test too. |
| 4 | No permanent stop (no producer below 30% output for more than 365 days). | PASS | 20 of 20 seeds. |
| 9 | Capital responds. | PASS | 20 of 20 seeds against a control run: Machinery +7% to +24%, K* −18% to −31%, back within 20% of the control run in 1–105 days. |
| 10 | Recipe value and wear unit tests pass. | PASS | `tests/econ.test.ts` |
| 11 | `PROGRESS.md` is updated. | PASS | This file |

Reports (not checks, owner):

| # | Report | Value |
|---|---|---|
| 2 | Commodity-seeds at the clamp on more than 20% of market-days | 17 of 240 (mostly Oxygen) |
| 4 | Busts: producers below 30% output for 61–365 days | 3 of 20 seeds (Machine Works, 87–183 days) |
| 5 | Gradient (Q-34) | 18 of 20 seeds |
| 6 | Route of 1–3 jumps with margin 25% or more on 60% of days | 20 of 20 seeds |
| 7 | Raw-goods route of 1–2 jumps with margin 40%–80% on 50% of days | 17 of 20 seeds |
| 8 | Chain shock | Alloys next door +0% to +12%, back in 2–6 days |
| 9 | Player effect of 10 Machinery at a Frontier mine | short of capital (0.5 × K*): 15–59 days of higher output; at K*: 0 days |

### Capacity and prices over time (seed 1, final rule)

Capacity × capital factor (median per producer type) and median price factor:

| Day | Machine Works | Smelter | Ore Mine | Composite Works | Iron Ore price | Oxygen price | Electronics price | Machinery price |
|---|---|---|---|---|---|---|---|---|
| 0 | 1.03 | 0.89 | 0.98 | 0.92 | 0.97 | 1.18 | 1.14 | 1.13 |
| 600 | 0.84 | 0.76 | 0.40 | 1.07 | 0.96 | 2.37 | 2.30 | 1.93 |
| 1200 | 1.07 | 0.74 | 0.78 | 1.54 | 1.40 | 1.65 | 2.30 | 1.93 |
| 1500 | 1.28 | 0.84 | 0.76 | 1.84 | 1.29 | 1.29 | 0.97 | 1.86 |

### Diffusion against carriers (8 seeds, 300 days after 100 warm-up days)

| Value | Diffusion (old) | Carriers |
|---|---|---|
| Raw goods removed by export | 40%–44% | 7%–16% |
| Producer-days short of an input (top 10 causes) | 12,180 | 59 |
| Producer-input market-days at the high clamp | 21% | 0% |
| Population market-days at the high clamp | 7% | 1% |
| Producer types below 50% output on some days | 7 of 12 | 0 of 12 |
| Commodity-seeds at the clamp > 20% (1,000 days, 20 seeds) | 49 of 240 | 1 of 240 |

### Input target test (owner request, 2026-10-27; diffusion model, before carriers)

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

`npm test`: 11 test files, 605 tests, all pass. Economy tick: about 3.7 ms a day (44 locations).

`npm run gen-report -- 100`:

```
Generator report: seeds 1..100, 45231 ms (452 ms per seed)
Tries: 1: 77, 2: 21, 3: 2
Rule failures (all tries): supplyPath 16, supplyRatio 10, producersPlaced 6, twoSectors 7, chainSeparation 1
Repairs: move electronics_fab 2, add rare_element_mine 19, add smelter 1, start at 9, add ice_mine 18, add ore_mine 8, move smelter 2, remove rare_element_mine 1, add agri_world 1, add machine_works 3, move ore_mine 1
Stations: industrial_station 813, habitat 266, processing_station 309, military_outpost 155, trade_hub 235, mining_station 553, pirate_haven 35, shipyard_station 3
Supply/demand ratio (median, min, max): water 1.00 [0.92, 1.21]; hydrogen 1.10 [0.97, 1.26]; iron_ore 1.10 [0.90, 1.35]; silicates 1.13 [0.98, 1.33]; rare_elements 1.10 [0.90, 1.29]; oxygen 1.08 [0.92, 1.28]; alloys 1.11 [0.99, 1.32]; food 1.04 [0.95, 1.26]; composites 1.08 [0.92, 1.42]; electronics 1.03 [0.96, 1.22]; machinery 1.11 [1.00, 1.31]; medicine 1.10 [0.90, 1.49]
Check (Section 6.11): 98 of 100 seeds pass with 2 tries or fewer (need 95): PASS
```

`npm run sim-economy -- 1000 20`: 1,000 days × 20 seeds in 241 s. Median prices (Frontier / Middle / Core): Iron Ore 7 / 12 / 18, Rare Elements 86 / 116 / 141, Electronics 737 / 692 / 604, Composites 361 / 341 / 288, Machinery 1238 / 1129 / 1125, Medicine 463 / 369 / 355, Oxygen 66 / 64 / 66, Food 50 / 49 / 50.

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
