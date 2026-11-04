# Progress

Update this file at the end of each milestone (brief §0, item 9).

| Milestone | Day | Status | Exit checks |
|---|---|---|---|
| M1 Foundation | 1 | Built and deployed. | 7 of 7 pass (Pages: deploy job passed; open the site once in a browser to confirm). |
| M2 Economy | 2 | Done (owner check definitions of 2026-10-27). Closed economy: carriers, K*, capacity from output and input prices. | 7 of 7 checks pass; 4 items are reports (gradient, route margins, raw-goods margins, chain shock). |
| M3 Trade and ships | 3 | Done (owner check definition of 2026-10-28, Q-36). | 6 of 6 pass; the count in day 60–120 is a report (11 of 20). |
| M4 Combat core | 4 | Done (owner accepted the combat data, Q-38). | 5 of 5 pass. |
| M5 Threat and encounters | 5 | Done (owner check definition of 2026-10-29, Q-46). | 5 of 5 pass; the TU calibration and the median battle length are reports. |
| M6 Fleet (feature freeze) | 6 | Done (owner decision of 2026-11-03, Q-51). Markets are twice as large (`volumeScale` 16). | 6 of 6 pass; check 5 (fleet trade value) is a report; the feature freeze is in force. |
| M7 Contracts, career, save | 7 | Done. Balance pass: monitors in the M7 section. | 7 of 7 pass. |
| M8 Polish and release | 8 | Built. Final deploy waits for the merge into `main`; the manual careers (M8-REL-03) wait for the owner. | 3 of 5 pass; check 1 passes with automated play only; check 4 needs the merge. Balance results are reports (owner, 2026-11-04). |

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

## M3 Trade and ships (2026-10-27)

### What works

- **Ships (§11, §12.2):** all hulls, all modules with tiers (weapons and point defense from Q-09), 18 default loadouts, slot rules, required-module rules, power and heat values, speed and maneuver, shields, armor, durability, fuel per jump. `npm run ship-report` prints all loadouts and the §11.4 rows.
- **Services (`src/services/`, one file each):** Market (unit-by-unit quotes, limits by credits, free tonnes, and stock; §11.9 loading order), Refuel (local Hydrogen price, removes Hydrogen from stock), Mechanic, Outfitter (tier ≤ tech; Pirate Havens tiers 1–3 at 130%; sell at 60%), Shipyard (trade-in at 60%, blocked with cargo, empty new hull), Wait (1–30 days), debt rule, Food loss (1% a day). A tow fee sells cargo at local prices.
- **Price information (§9.12):** live prices when docked; a Merchants' Guild gives live prices within 2 jumps, 14-day trend arrows, and chain alerts; other locations show the last known price and its day; else "Unknown". The player knows the locations of visited sectors and of sectors in Guild range.
- **Routes (`src/actor/paths.ts`, `routes.ts`):** fastest paths across sectors, trip days and fuel with cargo, route values (margin per tonne, profit, full-hold profit, fuel cost, days, profit per day, cargo- or capital-limited), best routes.
- **Screens:** Location screen with one tab for each service (Market first); Outfitter with portrait, module icons, shop, stat panel (old → new, green and red), red and yellow warnings; Shipyard with price after trade-in; Fleet and cargo; Trade Ledger (price table with tier, distance, and "sold here" filters, trend arrows, information age, route planner, 5 best routes, chain alerts); route view on the sector map (V); debug panel item 9 (flagship stats). Checked in Chromium: no page errors.
- **Trader bot:** `npm run sim-trader -- [seeds] [first] [days] [--verbose] [--override=json]`.

### What does not work yet

- Fleets of more than one ship (M6): select a flagship, move cargo, sell a ship.
- Combat (M4), encounters (M5), contracts (M7).

### Known issues

- The first hull upgrade day depends on the world: a good start earns 600–750 cr per day in the first 30 days, a poor start 20–100 (Q-36).
- The bot run takes about 18 s per seed (route search at each dock).
- Seeds 1 and 2 make the same world as seed 3 (the generator retries with seed + 1). The economy RNG differs, so the bot results differ.

### Exit checks

| # | Check | Result | Value |
|---|---|---|---|
| 1 | Light Freighter (owner definition, Q-36): median upgrade day in 60–120, and 15 of 20 seeds upgrade by day 150. | PASS | Median day 91; 18 of 20 seeds by day 150. Report: 13 of 20 in day 60–120. (Best routes from producers only, 2026-10-28; before: median 82, 19 of 20.) |
| 2 | `ship-report` gives the §11.4 values (±1). | PASS | 12 of 12 rows |
| 3 | All default loadouts are valid. | PASS | 18 of 18 (test and `ship-report`) |
| 4 | Starting ship range 4–6 jumps. | PASS | 5.00 jumps |
| 5 | Laden Heavy Freighter about 3× the fuel per jump of an empty Shuttle. | PASS | 18.00 / 6.00 = 3.00 |
| 6 | `PROGRESS.md` is updated. | PASS | This file |

Monitor (not a gate): Shuttle profit per day in the first 30 days, median 189 cr (20 seeds; §22 target 100–250 on a good raw-goods route). It was 295 cr before best routes had to start where the good is made. The bot trades raw goods in one sector and small lots of advanced goods; the early limit is mostly cargo, sometimes capital.

### Carrier margin and the first upgrade (20 seeds, 130 days)

The bot found that the M2 carrier margin (25% on all goods) left large gaps on goods of high value between near locations (`DECISIONS.md`, M3).

| Carrier setting | Upgrades by day 130 | Median day | In day 60–120 | Shuttle profit, days 0–30 (median) | M2 checks |
|---|---|---|---|---|---|
| minMargin 0.25 (M2) | 20 | 36 | 3 | 585 cr/day | pass (M2) |
| minMargin 0.15, capital cost 1%/day | 20 | 64 | 11 | 432 cr/day | not run |
| **minMargin 0.12, capital cost 1%/day (build)** | 18 | 82 | 11 | 295 cr/day | **pass, 20 of 20** |
| minMargin 0.10, capital cost 1%/day | 15 | 85 | 13 | 273 cr/day | not run |
| minMargin 0, 14 cr/t handling | 19 | 64 | 12 | 383 cr/day | **fail**: Water and Oxygen at the clamp, biolabs stop |

### Tool results

- `npm test`: 662 tests pass (19 service tests, 8 knowledge and route tests).
- `npm run sim-economy -- 1000 20` with the M3 carrier values: all 4 pass/fail checks pass (20 of 20). Reports: 9 commodity-seeds of 240 at the clamp on more than 20% of days (mostly Oxygen); busts on 4 of 20 seeds (Machine Works 73–294 days, a biolab 63 days); gradient 18 of 20; routes 20 of 20; raw-goods band 14 of 20; chain shock Alloys +0% to +14%, back in 2–3 days.
- `npm run ship-report`: all PASS.
- `npm run sim-trader -- 20 1 150`: PASS (see the exit checks). Run time 116 s.

### Owner feedback (2026-10-28)

- Click zones and arrow keys on all screens (tabs, rows, Ledger cells, key hints, sector and region map lists).
- Technical names: sector codes and location codes ("SEL-O2") on all trade screens; the Ledger groups its columns by sector.
- Best routes start only where the good is made, or at a Trade Hub.
- `npm test`: 666 tests pass.

## M4 Combat core (2026-10-28)

### What works

- **Combat simulation (`src/combat/`, headless):** 70 x 30 grid with asteroid and debris clusters (rot.js `Map.Cellular` with the combat RNG stream), multi-cell ships with footprints from the battle art (mirrored on the right), Chebyshev distance, lines of fire, movement with the full footprint, power toggles (supply rule; shields start at 0; engines OFF stop the ship), heat (Hot, Overheat), hit chance (track, range, heat, debris, clamp; engine shots x 0.85), the damage pipeline (shields, vs shield, vs hull, armor, armor pierce, minimum 1, Armor Plating HP), flak, shield regeneration, fuel per turn and per flee, morale, battle end (win, loss, flee at an edge, draw at 25 turns, surrender).
- **Resolver:** a pure function of the battle state and the player orders; it returns the new state and the effects, and uses only the battle's combat RNG state. The same seed and orders give the same result (test).
- **AI:** power use by loadout priority, Raider (most cargo, best range, retreat), Trader (to the edge, fires only if attacked), Attack (the player side in `sim-combat`, Q-25). The AI looks up to 4 turns ahead to go around asteroid fields.
- **Combat screen:** grid, right panel (hull, shields, armor, engine, move, fuel, heat bar from `style.json`, power list with number keys, module icons and states, hit chance per weapon), target brackets and line of fire, reachable cells, cursor, battle log. Keys and clicks: 1-0 power, arrows and Enter or a click to move, Tab or a click to target, F fire, A Hull/Engines, E end turn, U undo, Space skip effects. Effects from `effects.json` play after each turn (shots, flak, shields, hull, armor, engine, destroy, surrender).
- **Debug panel:** item 0 starts a test battle of the flagship against 1-3 ships of any loadout (Raider or Trader AI).
- **Tool:** `npm run sim-combat -- [battles]`.

### What does not work yet

- Guided weapons, point defense, reinforcements, Patrol and Evader AI, map templates, loot, encounters, the hail screen (M5).
- Fleet rules in combat (M6). Damage and heat display on the ship art (M8).
- Battles start only from the debug panel until M5.

### Known issues

- Q-38 (accepted): the brief's heat and damage values did not fit the §13.9 checks. The M4 tuning changes them.
- Heat has small effect in battles of 8-10 turns: with all weapons on, the Shuttle, the Raider, and most ballistic loadouts do not become Hot before turn 14. Only laser loadouts on Gunships and larger ships overheat (turn 8-12). The owner reviews a heat change before M5 tuning.
- The laser Wasp pairing passes with a small margin (52%; band 50-70%). M5 tunes all pairings again.
- `sim-combat` takes about 2 minutes for 500 battles of 5 pairings (the AI look-ahead).
- Patrol Cutter idle heat (5.5) is still above its cooling (4) after `heatScale`; M5 checks it with the patrol pairings.

### Exit checks

| # | Check | Result | Value |
|---|---|---|---|
| 1 | The player can win, lose, and flee against 1 to 3 Raiders. | PASS | Browser test battles: a win and losses against 1 Raider, a flee from 2 Raiders (the ship leaves at the map edge; fuel goes down). `sim-combat`: wins and losses against 1 and 2 Raiders; a Laser Gunship wins 18% against 3 Raiders. |
| 2 | Power and heat rules work. | PASS | `tests/combat.test.ts` (power supply, OFF weapons, shields, engines, heat states, overheat damage and reset, fuel). |
| 3 | Starting Shuttle vs 1 Pirate Raider: Shuttle wins 40%-60%. | PASS | 55% (500 battles), median 10 turns |
| 4 | Laser Wasp vs 2 Pirate Raiders: Wasp wins 50%-70%. | PASS | 52% (500 battles), median 8 turns |
| 5 | `PROGRESS.md` is updated with the `sim-combat.ts` results. | PASS | This file |

Monitor (not a gate): median battle length 4-10 turns: 10, 8, 5, 7, 3 for the five pairings.

### sim-combat (500 battles per pairing)

| Pairing | Win | Loss | Player fled | Draw | Wins by surrender / enemy fled | Median turns |
|---|---|---|---|---|---|---|
| Starting Shuttle vs 1 Pirate Raider | 55% | 45% | 0% | 0% | 62 / 178 | 10 |
| Laser Wasp vs 2 Pirate Raiders | 52% | 48% | 0% | 0% | 76 / 232 | 8 |
| Starting Shuttle vs 3 Raiders (report) | 0% | 100% | 0% | 0% | 0 / 0 | 5 |
| Laser Gunship vs 3 Raiders (report) | 18% | 82% | 0% | 0% | 31 / 32 | 7 |
| Laser Gunship vs Light Freighter trader (report) | 100% | 0% | 0% | 0% | 0 / 500 | 3 |

### Tuning steps (Q-38)

| Setting | Shuttle vs Raider | Wasp vs 2 Raiders |
|---|---|---|
| Brief values (after AI fixes) | 95% (the Raider burns from heat) | 32% |
| Heat fixed, damage x1 | 9% wins, 91% draws | 0% wins, 94% draws |
| Heat fixed, damage x3, Raider with 2 autocannons | 57% | 21% |
| + pulse laser heat 2 (now from heatScale 0.5) | 61% | 48% |
| + Wasp heat capacity 40, Raider with shield, retreat at 50%, no fire in retreat, damage x2.75 (build) | 55% | 52% |

### Tool results

- `npm test`: 688 tests pass (21 combat tests).
- `npm run ship-report`: all PASS (the heat column now shows heat x `heatScale`).
- `npm run sim-combat`: see above.

## After M4: owner changes (2026-10-28)

### Defeat and Clone Insurance (Q-39)

- **Works:**
  - A loss against pirates only disables the ship. The pirates take all cargo, the ship keeps 10% hull, and a tug tows the fleet. The combat screen shows "disabled", the ship's engines go dark, and there is no explosion.
  - Other losses destroy the ship. With a policy, the clone wakes at the insuring location with the insured ship; the player keeps the credits. Without a policy, the game ends.
  - Insurance tab at every dockable location: policy, quote, premium by security level (Secure 2% to Lawless 12%). The status bar shows "Insured" or "Not insured".
  - Debug test battle: the enemy AI can be Raider, Trader, or Patrol (a hostile patrol destroys).
- **Browser check:** insure at a Secure station (318 cr for the starting Shuttle), lose to 3 Raiders (disabled, towed, no game over), lose to a patrol (the clone wakes at the station). Owner confirmations of 2026-10-28 (credits do not change, insurance also at planets) are covered by tests. No page errors.
- **Tool results:** `npm test`: 697 tests pass (9 new in `tests/defeat.test.ts`). `npm run build`: passes.
- **Open:** Q-40 (heat and combat decisions) waits on the owner.

### Heat split, overheat offline, aimed shots (Q-40, part 1)

- **Works:**
  - Two heat scales: idle 0.3, shot 0.6. Idle heat is below cooling for all default loadouts.
  - Overheat takes the ship offline (no orders, no engines, no shields) until heat is at 70% of capacity. Only cooling acts.
  - Aimed shots at the Engines use weapon tracking: lasers aim well, heavy guns badly.
  - No AI fires a shot that would overheat it.
  - The heat bar shows the heat after the planned shots; a warning shows if the plan overheats the ship; an offline ship shows the turns left.
- **Exit checks again (500 battles):** Shuttle vs Raider 55% PASS (40-60%); Laser Wasp vs 2 Raiders 53% PASS (50-70%). Reports: Shuttle vs 3 Raiders 0%; Laser Gunship vs 3 Raiders 18%; Gunship vs trader 100%. Median lengths 10, 8, 5, 7, 3 turns.
- **Known issues:** the laser Wasp pairing limits the shot heat scale (1.0 gives 32%). Heat has small effect on ships with one weapon. Scope for more combat decisions: `docs/proposals/combat-v2.md`.
- **Tool results:** `npm test`: 700 tests pass. `npm run ship-report`: all PASS. `npm run build`: passes.

### Power as actions (Q-41)

- **Works:**
  - Combat power: "available (reserved) / max + capacitor". Shields, thrusters, and point defense reserve their draw. A move costs the engines' draw (one time a turn); a shot costs the weapon's draw.
  - An overdraw uses the capacitor, then reserved systems lose power at random until the end of the turn (a shield drops to 0). The player confirms an overdraw (Enter or F again).
  - Capacitor module (S/M/L: 3/6/12), full at the start of a battle, charged by unused power. Placeholder icon until Claude Design adds one.
  - The combat panel shows the power line and the cost of each module; the Outfitter and the fleet screen show the power line and "move + fire" power.
  - AI: never overdraws; stands and fires when it cannot pay for a move and all its shots.
- **Data:** reactor S 8 → 5; pulse laser power 2 → 1 (back to 2 with Q-42); an S reactor in 5 NPC loadouts.
- **Exit checks again (500 battles):** Shuttle vs Raider 55% PASS; Laser Wasp vs 2 Raiders 53% PASS. Reports: Shuttle vs 3 Raiders 0%; Laser Gunship vs 3 Raiders 78% (was 18%: the Gunship has a second reactor and fires all weapons when it stands); Gunship vs trader 100%.
- **Known issues:** the small ships of the two checks (Shuttle, laser Wasp, Raider) have exactly the power to move and fire all weapons, so power gives them no choice until an upgrade. TU (§10.5) does not count power; the M5 TU calibration must check it (the Laser Gunship result above).
- **Tool results:** `npm test`: 705 tests pass. `npm run ship-report`: all PASS (the power column is now available(reserved)/max). `npm run build`: passes. Browser: combat power line, module costs, Outfitter power rows; no page errors.

### Light fighter check and hitscan lasers (Q-42, Q-43)

- **Works:** lasers are hitscan (range penalty 0.1; others 0.4). New fighter checks in `sim-combat`. Pulse laser damage 4, power 2.
- **Exit checks (500 battles):** Shuttle vs Raider 51% PASS (40-60%); Laser Wasp vs Shuttle 100% PASS (70%+); Laser Wasp vs 1 Raider 98% PASS (71%+). Reports: Laser Wasp vs 2 Raiders 50%; Shuttle vs 3 Raiders 0%; Laser Gunship vs 3 Raiders 88%; Gunship vs trader 100%. Median lengths 10, 9, 7, 9, 5, 7, 3 turns.
- **Wasp loadouts (300 battles; vs 1 Raider / 2 Raiders / Shuttle):** lasers + engine, reactor, shield 99/70/98% (the default); 2 engines, no shield 77/21/81%; capacitor, no shield 71/12/66%; thrusters, no shield 74/15/68%; laser + autocannon 96/48/94%; 2 autocannons 66/7/50%; 2 shields, no reactor 16/0/7%.
- **Known issues:** the Laser Gunship is strong against 3 Raiders (88%); M5 TU calibration (§10.9) must check it. Point defense rules need a decision before M5 (interception during the munition move).

## M5 Threat and encounters (2026-10-28)

### What works

- **Threat:** TU from durability and firepower (Raider = 10); group TU with the group bonus; pirate, trader, escort, and patrol templates; pirate and patrol budgets; template selection; threat band on the region map and the hail screen.
- **Guided munitions:** missiles and torpedoes on the grid, around asteroids; hit roll next to the target; life and HP; ammunition on the module, refill at the Mechanic. Point defense fires during the move (Q-44); flak destroys munitions.
- **Encounters:** rolls on sector trips (one per trip), jump arrivals, and Hunt (H, 1 day, x3). Pirates judge the odds: attack, tribute, or avoid. Hail screen: Fight, Flee, Pay, Pursue, Ignore, Attack. A failed flee: the enemy acts first. Traders with cargo and escorts; patrols (hostile if Wanted).
- **Battles from encounters:** battle map templates by place (Open Space, Asteroid Field, Debris Field, Gas Giant Edge); cargo pods and surrender loot; reinforcements (patrol and pirate) from turn 3; Patrol and Evader AI.
- **Security and notoriety:** security changes after battles, daily drift, 30-day trend arrows; notoriety changes, levels, docking refusal, the tow skips refusing locations; Pirate Havens buy all cargo at 70%.
- **Debug:** E starts an encounter with any template; S sets the sector security level.

### Exit checks

| # | Check | Result |
|---|---|---|
| 1 | All §13.9 pairings pass | PASS. Shuttle vs Raider 52% PASS; Laser Wasp vs Shuttle 99% PASS; Laser Wasp vs Raider 98% PASS; lasers vs Wasps 90% vs ballistics 59% PASS; ballistic vs laser Corvette against a Frigate 25% vs 12% PASS; torpedo vs laser Frigate against a Battleship 27% vs 7% PASS. Median length 4-10 turns is a report (Q-46): Shuttle vs Raider 11, Cutter vs Raider Pack 12. |
| 2 | §10.9 | PASS. TU reference values within 10%: PASS (9/9). Generated encounter TU: PASS on the mean (15/15, Q-45). TU calibration is a report (Q-46): 1 of 5 in 35-65%. |
| 3 | Patrols fight against the aggressor | PASS (tests: a patrol joins against the pirates, or against a player who attacks a trader). |
| 4 | Pirate kills raise sector security | PASS (test: +3 per pirate destroyed, +2 per surrender). |
| 5 | `PROGRESS.md` is updated | PASS. |

### sim-combat (300 battles per pairing)

| Pairing | Win | Median turns |
|---|---|---|
| Shuttle vs 1 Raider | 52% | 11 |
| Laser Wasp vs Shuttle | 99% | 9 |
| Laser Wasp vs 1 Raider | 98% | 7 |
| Laser Wasp vs 2 Raiders (report) | 50% | 9 |
| Ballistic Gunship vs 3 Raiders | 59% | 7 |
| Laser Gunship vs 3 Raiders | 90% | 7 |
| Laser Corvette vs Pirate Frigate | 12% | 4 |
| Ballistic Corvette vs Pirate Frigate | 25% | 4 |
| Laser Frigate vs Battleship | 7% | 4 |
| Torpedo Frigate vs Battleship | 27% | 4 |
| TU: Pirate Gunship (35.6) vs Raider Pack (39.0) | 39% | 8 |
| TU: Patrol Cutter (36.0) vs Raider Pack (39.0) | 82% | 12 |
| TU: Pirate Corvette (54.0) vs Gunship + Raider (52.4) | 94% | 6 |
| TU: Pirate Frigate (71.2) vs Gunship Escort (72.3) | 82% | 9 |
| TU: Battleship (139.3) vs Frigate + Gunship + Raider (151.8) | 27% | 5 |

Why the TU calibration is out of band: TU is one number, but the combat model now has strong matchups. Heavy armor and big shields take little from many small autocannon hits (Pirate Corvette: its hits do 56 damage each, the group's 21). Torpedoes hit the slow Battleship (maneuver 11) about 65% of the time. `groupBonus` cannot fix both directions (0.15 and 0 tried: 2 of 7 pairs in band each). Owner decision (Q-46, 2026-10-29): TU does not account for loadout; the calibration and the battle length are reports.

### sim-trader (20 seeds, 150 days)

- Encounters OFF: median upgrade day 91, 18/20 by day 150: PASS (M3 check 1).
- Encounters ON (`--encounters`, careful-trader policy): median day 107, 12/20 by day 150. 1,100 encounters on 1,971 trips; pirates 1 per 17 trips (the bot trades mostly in Core sectors; §22 monitor: 1 per 3-4 trips at security 1-2). 64 flees, 51 battles (28 won, 23 disabled; no ship destroyed).

### Known issues

- The `reinforcement_arrival` effect of the art (a "row" frame) is not drawn; the log shows the arrival.
- `sim-combat` with 17 pairings takes about 13 minutes for 300 battles (large ships and munitions).

### Tool results

- `npm test`: 746 tests pass. `npm run ship-report`: all PASS (TU reference values 9/9). `npm run build`: passes. Browser: debug encounter, hail, battle with torpedoes, disabled loss and tow, region map threat bands; no page errors.

## Between M5 and M6: auto-battle (2026-10-29)

- **Works:** in battle, T plays one turn with the AI, Shift+T plays turns until a stop reason (hull below 50%, Hot, reinforcements, a munition at the player, or a key), and R twice resolves the battle at once with a summary in the log. The hail screen has R (Fight with auto-resolve). The AI uses the Balanced doctrine (`DECISIONS.md`, Q-47).
- **Not built:** the win estimate and the other doctrines (`docs/proposals/auto-battle.md`).
- **Tool results:** `npm test`: 753 tests pass (7 new in `tests/autoplay.test.ts`). `npm run build`: passes. `ship-report`: all PASS. Browser: auto turn, auto until, auto-resolve in battle and from the hail screen; no page errors. `sim-combat` does not change (its player side uses the Attack AI).

## Between M5 and M6: tutorial (2026-10-29)

- **Works:** title screen S: Settings with "Tutorial tips in new games" (kept in the browser). In a new game, 10 tips show one time each: welcome, first-trade plan, location, market, first buy, region map, first sale, first hail, first battle, first defeat. The sector map panel shows a goal line for the first trade. Enter closes a tip; X turns off the tutorial for the game.
- **To do in M8:** a text pass for the screens that M6 and M7 change (Market with fleet capacity, Fleet screen, contracts, save).
- **Known issues:** on the region map, a sector name near the right edge can run into the panel text (seen: "Ullo" + "Jumps from here", seed 11). This was there before the tutorial.
- **Tool results:** `npm test`: 763 tests pass (10 new in `tests/tutorial.test.ts`, with the check that the same seed and actions give the same state with the tutorial ON and OFF). `npm run build`: passes. Browser: settings (also after a page reload), welcome, first-trade plan, goal line, location, market, first buy, region map, X, hail, battle, auto-resolve, defeat; no page errors.

## M6 Fleet (2026-10-29)

### What works

- **Fleet rules:** up to 4 ships; buy a hull for the fleet (Shipyard, B); sell a non-flagship ship with no cargo (fleet screen, S, at a Shipyard); select the flagship at any location (F); the slowest ship sets the travel time; each ship uses its own fuel; refuel fills all ships; the tow takes the full fleet and charges each ship with 0 fuel; cargo uses the fleet capacity (flagship last).
- **Upkeep:** 20 cr per size point per day for each ship that is not the flagship; counted before each fleet change, paid at each dock, tow, and Wait. The Trade Ledger subtracts it from profit per day.
- **Encounters:** pirate chance x (1 + 0.1 x (fleet size - 1)).
- **Fleet in combat:** only the flagship fights; a flee from pirates costs 50% of the cargo of one random non-flagship ship; a destroyed flagship gives the next ship as flagship; the last ship lost gives Clone Insurance or a game-over screen.
- **Forced surrender (Q-50):** an NPC ship with engine value 0 and hull at 20% or less surrenders.
- **After-battle screen:** surrendered ships: take as prize (loadout, damage, cargo, 25% fuel; +10 notoriety from a non-pirate; no capital ships), take cargo, or leave; scuttle a fleet ship; the screen closes only when each ship passes the required-module rules.
- **Fleet management (Q-50):** the same screen at any location: move cargo and modules between ships (keys 1-8).
- **Game name:** POL@RIS (title screen, page title, documents).
- **Debug:** B opens the after-battle screen with a surrendered trader.

### Exit checks

| # | Check | Result |
|---|---|---|
| 1 | A fleet of 4 ships can travel, trade, and refuel. | PASS (test; `sim-trader --fleet` runs 4-ship fleets for 150 days). |
| 2 | Flagship loss gives a new flagship. | PASS (test; browser). |
| 3 | A prize ship joins the fleet. | PASS (test; browser, debug B). |
| 4 | Upkeep is paid. | PASS (test). |
| 5 | `sim-trader.ts` with a 2-ship fleet earns more per day than with 1 ship, after upkeep. | Report (Q-51): with `volumeScale` 16, median 618 vs 706 cr per day (-12%), 2 of 6 seeds better. |
| 6 | Feature freeze. | In force: after M6, only M7 and M8 items, balance, and bug fixes. |
| 7 | `PROGRESS.md` is updated. | PASS. |

### sim-trader --fleet (6 seeds, 150 days, 20,000 cr at the start)

| Seed | 1 ship | 2 ships | 4 ships |
|---|---|---|---|
| 1 | 384 | 287 | 87 |
| 2 | 311 | 271 | 82 |
| 3 | 314 | 298 | -92 |
| 4 | 222 | 125 | -197 |
| 5 | 511 | 367 | -182 |
| 6 | 275 | 171 | -185 |
| Median | 311 | 271 | -182 |

Profit per day after upkeep. With no upkeep (3 seeds), 2 ships are still not better than 1. With `volumeScale` 16, the medians are 581 (1 ship) and 573 (2 ships). Why: one Light Freighter already takes most of the profitable trade near it; most routes stop at the margin limit (each unit bought makes the next one dearer), not at the cargo space. Options are in Q-51.

### Other tool results

- `npm test`: 779 tests pass (16 new in `tests/fleet.test.ts`). `npm run build`: passes. `ship-report`: all PASS.
- `sim-trader` (M3 check 1, 20 seeds): median day 94, 19/20 by day 150: PASS (the bot now fills free cargo space).
- `sim-combat` (100 battles per pairing, with forced surrender): all pairing checks pass; Shuttle vs Raider 51%.
- Browser: Shipyard B, fleet screen (module move, flagship, sell), after-battle screen (cargo, prize, close blocked by an unfit ship), flagship loss, game over; no page errors.

### Recalibration after Q-51 (2026-11-03)

- `volumeScale` 16; carrier capacity follows the volume (6,000 t per sector a day).
- `sim-economy` (1,000 days, 20 seeds): all M2 checks pass (20/20). `gen-report` (100 seeds): 98 pass with 2 tries or fewer.
- `sim-trader` (20 seeds): Light Freighter by day 150 on 20/20 (PASS); median day 56 (report; target 60-120); Shuttle profit per day in the first 30 days 329 cr (Section 22 monitor: 100-250).
- `sim-trader --fleet` (6 seeds): profit per day after upkeep, median 1 ship 706, 2 ships 618, 4 ships 465 (per seed: 1 ship 430-1,230; 2 ships 392-1,160).
- The flagship can change on the fleet screen when docked and on the after-battle screen (F).

### Known issues

- With the larger markets, the Shuttle earns more than the Section 22 monitor (329 vs 100-250 cr per day). Look at it in the M7 balance pass.
- The `sim-trader --encounters` numbers in the M5 section are from `volumeScale` 8.
- A bought hull has no modules and no fuel. With the flagship set to it, the fleet cannot leave until the player fits it (by design: M6-FLEET-06).

## M7 Contracts, market events, career end, and save (2026-11-03)

### What works

- **Contract boards:** each Merchants' Guild and Bounty Guild posts 3-6 offers every 7 days from the real state of the world within 3 jumps: Supply (deficits, capital needs, input starvation), Freight (a surplus at A and a deficit at B), Sweep (security problems), and 2-4 named bounties (sectors with security level 2 or lower). Each offer shows its reason, route, jumps, lowest security level, threat band, tonnes, reward, deadline, and an estimate of profit per day.
- **Contract play:** accept at the board; Supply deliveries are paid at once and go into the market stock; Freight pickup (deposit) and delivery (fee and deposit back); standing (done - 2 x failed) and its Freight limits; at most 4 Merchants' Guild contracts, 3 named bounties, 1 Sweep; no contracts in debt; deadlines and expiry each day; lost Freight cargo fails the contract.
- **Bounties:** Sweep kills in the contract sector; named groups (tier 2 or 3 modules, names from `names.json`) meet the player on each arrival in their sector and on Hunt there; rewards, security changes, and notoriety; kill bounties for each pirate ship destroyed or captured, collected at a Bounty Guild (not for Wanted players).
- **Market events:** Shortage, Boom, Strike, Pirate Surge; at most 3 active; the log and the Merchants' Guild show them.
- **Career:** statistics from the start; the end at day 730 (`career.days`), at Retire (E twice at a location), or at a total loss; score and titles (Drifter to Sector Magnate, Dread Pirate, Pirate Hunter, Warden of a sector); career end screen with the summary, the title, and the seed.
- **Save and load:** autosave at each dock; Q twice on the sector map saves and quits; Continue on the title screen; another save version or a damaged save shows a message.
- **Screens:** contracts screen (G), guild boards, kill bounty (K), debug K spawns any contract. Location tabs use short names when they do not fit.
- **Supply contracts v2 (owner, 2026-11-03):** chain alerts make Supply offers first; Supply pays the goods at the market price plus a flat fee (tonnes, jumps from the nearest maker, urgency, risk pay for low security); Freight fee is flat.

### Exit checks

| # | Check | Result |
|---|---|---|
| 1 | 90% of boards have 3 or more offers. | PASS: 98.0% of 76,680 boards (Merchants' Guild 100%, Bounty Guild 96.9%), 1,000 days x 20 seeds. |
| 2 | 100% of Supply and Freight offers point to a real deficit at posting. | PASS: test, and 123,206/123,206 offers in `sim-economy`. |
| 3 | Median Supply contract gives 1.0x-1.5x the profit per day of the best known open-market route of similar length. | PASS: 1.14x with the flat fee of Supply contracts v2 (6 seeds, 1,009 offers valued; quartiles 0.37-2.93). |
| 4 | A completed Machinery Supply contract to a producer with low K increases its output. | PASS (test). |
| 5 | A full career to day 730 runs without errors. | PASS: `sim-career` 6/6 careers. |
| 6 | Save and load give the same state. | PASS (tests: deep-equal state and RNG streams; the next 30 days are the same). |
| 7 | `PROGRESS.md` is updated with all tool results. | PASS. |

### Balance pass (M7-BAL)

| Tool | Result |
|---|---|
| `sim-economy` (1,000 days, 20 seeds, with events) | All M2 checks pass (20/20); contract board checks pass. Busts (61-365 days) on 3/20 seeds. |
| `gen-report` (100 seeds) | 98 pass with 2 tries or fewer (need 95). |
| `sim-trader` (20 seeds) | Light Freighter by day 150 on 20/20 (PASS); median day 54 (report); Shuttle 331 cr per day in the first 30 days (monitor 100-250). |
| `sim-trader --contracts` (6 seeds, Supply v2) | Check 3 PASS (1.14x); 47 contracts accepted, 39 deliveries. |
| `sim-combat` (100 battles per pairing) | All pairing checks pass. |
| `ship-report` | All PASS. |
| `sim-career` (6 careers) | 6/6 with no errors. Net worth at day 730: 19,929; 2,694,878; 5,974,115; 881,801; 10,119; 1,355,241 cr (median 881,801). |

| Section 22 target | Result |
|---|---|
| Security: about 15 pirate kills raise a sector one level for a long time | Done: `destroyPirate` baseline +1.35 (test: 15 kills +1 level after 365 days; 10 kills no change). |
| Battle Group named bounty pays 75,000 cr or more | 90,449 cr (Low) to 103,370 cr (Lawless), tier 3 (TU 345). |
| Good trader net worth at day 730: 250,000-600,000 cr | Outside: median 881,801 cr; 2 of 6 bot careers stay poor after early pirate losses, 4 of 6 end with 0.9-6.0 million cr (large markets, Q-51, and Machinery Supply contracts). Q-52. |
| Shuttle profit 100-250 cr per day | Outside: 331 (larger markets, Q-51). |

### Guild contracts against open-market trade (`sim-contracts`, 2026-11-03)

Same seeds, three trader policies: **trade** (open market only), **best** (a Supply contract only when it pays more per day than the best known route of similar length), **first** (any profitable Supply contract first, chain alerts first). Score = career score (credits + 60% of ship value + cargo). Median of 10 seeds, 150 days; "fill" = a contract trip also carries trade goods for the same destination.

| Policy | Day 15 | Day 30 | Day 60 | Day 90 | Day 150 | vs trade at day 150 |
|---|---|---|---|---|---|---|
| trade | 16,259 | 23,828 | 28,117 | 38,243 | 63,724 | - |
| best | 16,108 | 23,295 | 32,321 | 34,794 | 72,348 | +14% |
| first | 16,108 | 20,675 | 32,321 | 33,858 | 61,560 | -3% |
| best, fill | 16,108 | 23,295 | 32,321 | 34,794 | 65,476 | +3% |
| first, fill | 16,108 | 20,675 | 34,047 | 38,174 | 76,189 | +20% |
| first, fill, fee x2 | 16,108 | 21,242 | 39,565 | 37,631 | 90,270 | +42% |

- 365 days (6 seeds, no fill): trade 226,569 cr; first 102,881 cr (-55%). Contract sizes stop at 80 t and the fee does not grow with capital; open-market trade grows with capital and capacity.
- First 15-30 days: no gain from contracts. A Small fee (10 t, about 350-700 cr) is small against a full 30 t hold of trade. (Correction: the start location has a Merchants' Guild on 100 of 100 seeds. The early limit is price information: the player knows only the prices near the start.)
- Chain alerts: 13% of Supply offers come from alerts (5 seeds, 300 days); alerts occur on 18-87% of days. 14 days after an offer, the alert is gone for 80-100% of the alerts that the bot served and for 77-100% of those that it did not serve: no measurable effect of the player's deliveries. The carriers fix most alerts; 10-80 t is small against markets at `volumeScale` 16.
- Fixes found by the traces: Supply contracts are done at 98% (Food spoils on the way); the bot checks the seller's stock and keeps a credit margin (failed contracts 33 -> 17 of about 75).

### Per-tonne Supply contracts (owner, 2026-11-03, Q-53)

- Supply pays per tonne delivered (goods price at posting + flat fee per tonne, risk pay, 1.5x for chain alerts). No size, no deadline: the contract lasts while the destination has the need, and cannot fail. An offer leaves the board when its need ends.
- The start location always has a Merchants' Guild. N on the fleet screen renames a fleet ship.
- Check 3 (`sim-trader --contracts`, 20 seeds, 150 days): PASS, 1.00x with `feePerTonne` 12 and `feePerTonneJump` 9 (quartiles 0.60-2.82). Light Freighter by day 150 on 17/20 seeds (median day 41). Shuttle profit in the first 30 days: median 638 cr per day (open market only: 331).
- `sim-economy` board checks: PASS (98.0% of boards with 3+ offers; 100% of offers point to a real deficit).
- `sim-contracts` (career score, median of 10 seeds; day 365: 6 seeds):

| Policy | Day 15 | Day 30 | Day 60 | Day 150 | Day 365 |
|---|---|---|---|---|---|
| trade | 16,259 | 23,828 | 28,117 | 63,724 | 226,569 |
| best | 19,658 | 29,807 | 68,231 | 187,037 | 450,448 |
| first | 14,663 | 22,521 | 34,451 | 176,171 | 394,810 |

- Contracts now give more early (day 15-60), as the owner expected, and they stay ahead to day 365. The cause: a deficit that does not end (example: Water at an Agri World with 102% output) keeps one contract open for the full run, and the player's deliveries take the place of the carriers. On seeds 2 and 8, one contract gives about 600,000 cr in 150 days. Q-53 lists options to limit it.

### Q-53 option (c), fleet hold, and outfitter fix (owner, 2026-11-03)

- A Supply contract ends when the need ends or 28 days after acceptance. The board can post the need again at new prices.
- Check 3: PASS, 1.41x (20 seeds, quartiles 0.73-3.15). Light Freighter by day 150 on 20/20 seeds (median day 35). Open-market only: unchanged (20/20, median day 54).
- `sim-contracts`, career score, median:

| Policy | Day 30 | Day 60 | Day 150 (10 seeds) | Day 365 (6 seeds) |
|---|---|---|---|---|
| trade | 23,828 | 28,117 | 63,724 | 226,569 |
| best | 28,800 | 52,339 | 148,447 | 319,165 |
| first | 26,743 | 31,172 | 106,743 | 282,404 |

- The gap is smaller than with open contracts (best at day 365: +41%, before +99%), but contracts still lead. Seed 2 (the Water deficit) gives 362,000 cr at day 150 (before 575,000): the board posts the same need again.
- Fleet screen: U uninstalls a module into the fleet hold; Enter installs it. The screen closes only with an empty hold and loadouts that pass; else R reverts all module changes, D discards the held modules (warning), S sells them at an Outfitter.
- Bugs fixed: a module moves into the smallest empty slot that takes it (a small module took the only large slot); the Outfitter shows `[` and `]` to select another ship (also clickable).
- Trader bot: it sells cargo that has no plan, at a loss if necessary (it waited forever with goods from an ended contract).

### Known issues

- Q-53: Supply contracts still give much more than open-market trade (see above). Report (owner, 2026-11-04).
- Q-52: done in M8 (the second chance; the stuck message offers Retire).
- Q-52: net worth spread at day 730 is wide and its median is above the Section 22 target. Report (owner, 2026-11-04).
- Tutorial text pass: done in M8. `sim-trader --encounters`: new numbers in the M8 section.

## M8 Polish and release (2026-11-04)

### What works

- **Second chance (M8-SC-01 to SC-06):** the first tow into debt shows a one-time offer. Security level 2-4: guild relief (free repair and refuel; deliver 10 t of free guild cargo in 8 + 4 x jumps days; done clears the debt). Level 0-1: pirate offer (the flagship is traded for a Raiding Wasp; capture a spawned trader and deliver it to a Pirate Haven in 25 days; done clears the debt and the Haven sells the old ship back, key Y). The stuck message offers Retire. The starting ship is "Fresh Start". Debug C and Shift+C show the offers.
- **Codex (M8-UI-01):** key X on the sector map; the chain by tier, and for each commodity who makes it and who buys it, from the data files.
- **Help (M8-UI-02):** the title-screen help explains the core loop and the main keys. Each screen has `?` help.
- **Animation (M8-ART-06, ART-07, ART-03):** the `@` moves along the trip path on the sector map (1.2 s or less, any key skips); the region map shows the route to the selected sector in the bright color, with its jump count; reinforcements arrive with speed streaks from `effects.json`.
- **Checked (M8-ART-01, 02, 04):** damaged and critical art, hot tint, overheat flash, the 1.2 s effect budget, and Space to skip (built in M4).
- **Tutorial:** new tips for the fleet screen and hold, the after-battle screen, the Merchants' Guild board, and the contracts screen; the welcome tip names the save rule and the Codex.
- **Tests:** 851 tests in 30 files pass; typecheck and build pass.

### Acceptance checks (M8-REL-02, 2026-11-04)

| Section | Tool | Result |
|---|---|---|
| §6.11 | `gen-report` (100 seeds) | PASS: 98 of 100 seeds pass with 2 tries or fewer (need 95). |
| §8.7, §9.13 | `sim-economy` (20 seeds) | PASS: no systemic clamp, no stock below 0, no permanent stop, capital responds. Reports: busts on 3/20 seeds, gradient 18/20, raw margins 15/20. |
| §8.7 (M3) | `sim-trader` (20 seeds) | PASS: Light Freighter by day 150 on 20/20 (median day 54, report). |
| §10.9, §13.9 | `sim-combat` | PASS: all 6 checks (Shuttle vs Raider 51%; Wasp vs Shuttle 100%; Wasp vs Raider 98%; lasers, ballistics, torpedoes win more often). Reports: Wasp vs 2 Raiders 50%; TU pairings 40%, 82%, 94%, 79%. |
| M5 | `sim-trader --encounters` | PASS: Light Freighter by day 150 on 19/20 (median day 63). Report: one pirate encounter per 21 trips; 60 battles (21 won, 39 disabled). |
| M6 | `sim-trader --fleet` (6 seeds, 300 days) | Report: 1 ship 758, 2 ships 686, 4 ships 464 cr per day after upkeep (check 5 is a report, Q-51). |
| §14.9 | `sim-economy` boards, `sim-trader --contracts` | PASS: 98.0% of boards with 3+ offers; 100% of offers point to a real deficit; check 3 = 1.41x. |
| M7 | `sim-career` (6 careers) | PASS: 6/6 careers end with no errors. Report: median net worth 1,138,604 cr (Section 22: 250,000-600,000). |
| §19 | tests, typecheck, build, browser smoke test | PASS: no console errors in a 20-step browser run (trade, travel, region map, encounter, auto-battle, contracts, Codex, save and continue, second-chance offer). |

### Exit checks (§23)

| # | Check | Result |
|---|---|---|
| 1 | New career, trade, loadout, fleet, fight, pirate or hunter, security change, career end. | PASS with automated play: the browser smoke test and the unit tests cover each step (the after-battle screen, prizes, the fleet hold, security +3 after a won battle, retire). M8-REL-03 (one trader and one pirate career played by hand) waits for the owner. |
| 2 | All acceptance checks pass. | PASS (see above; balance results are reports). |
| 3 | No known crash bugs. | PASS. |
| 4 | The game runs from GitHub Pages. | Waits for the owner: merge this branch into `main`; `deploy.yml` then deploys (the last deploy of `main` passed on 2026-11-04). |
| 5 | `PROGRESS.md` and `DECISIONS.md` are up to date. | PASS. |

### Owner changes (2026-11-04): Pirate Havens and hull fuel

- **Each world has a Pirate Haven.** If the normal fill places none, a frontier sector gets security baseline 25 and a Haven (a free station slot, or a new station "<sector> Haven"). 100 of 100 seeds have a Haven (27 with a new station); worlds that had one do not change.
- **Hull fuel.** Each hull holds fuel with no tank (`baseFuel`: Wasp 4, Shuttle and Courier 5, Light Freighter and Gunship 7, Corvette 11, Heavy Freighter 12, Frigate 18, Battleship 34): about 3 sector trips with docking, less than one median jump. A prize gets at least its hull fuel. The Starting Shuttle now holds 35.
- **Checks again:** generator 98 of 100 (PASS); `sim-economy` all PASS (20 seeds); `sim-trader` 20/20 (median day 57); `--contracts` 20/20, check 3 = 1.18x; `--encounters` 18/20 (median day 64); `sim-career` 6/6 (median net worth 1,557,635 cr, report); `sim-combat` all 6 PASS; 851 tests pass.
- **Effects v0.2 (Claude Design):** scope only, in `docs/proposals/effects-v2.md`.

### Play test (2026-11-04)

`tools/sim-playtest.ts` plays careers in 6 styles and checks the state after each turn (finite values, fuel and cargo in range, unique ids, positions, markets, contracts) and saves and loads every 40 turns. A browser fuzz test pressed about 17,000 random keys in 6 runs (with and without the debug panel): no script errors.

| Style | Careers | Ends | Median score | Problems found (final run) |
|---|---|---|---|---|
| trader (careful) | 30 | 30 to day 730 | 1,797,591 | none after the bot fixes |
| contractor | 30 | 30 to day 730 | 1,159,777 | 1 idle (bot) |
| reckless | 30 | 30 to day 730 | about 19,500 | idle after the second chance (see below) |
| pirate | 30 | 18 to day 730, 12 lost | 161,379 | 5 idle (a failed pirate job leaves a Wasp with no hold) |
| chaos (random actions) | 150 | 115 lost, 34 retire, 1 day 730 | 1,060 | none |
| calm (random, no attacks, insured) | 120 | all retire (stuck) or day 730 | 2,050 | none |

Bugs found and fixed:
- Duplicate ship ids (the first bought ship, prize, or Wasp got the start ship's id `ship-1`); the pirate job could remove the wrong ship.
- A player's ship played by an AI got the combat fuel reserve and kept fuel above its tank capacity.
- Soft-lock: the only ship with no engine (or too little power) and no money for one did not count as stuck; now the stuck message offers Retire. Cargo that the location does not buy does not count.
- Piracy could not work: in 2,400 test battles every attacked trader reached its map edge. Now an attack on traders starts as an intercept (`interceptGap` 10), and the AI aims at the engines of a ship that runs. Light Freighter captured: Raiding Wasp 48%, Laser Wasp 69%, Gunship 77% (before 0%). `sim-combat`: all 6 checks still pass.
- Trader bot (tools only): docking refusals, cargo the location does not buy, a tow into a sector below its minimum security, guild relief cargo (it sold it and never delivered it), debt with no weapon left, no fuel tank.

Findings for the owner (not changed):
- After the guild relief the player has 0 cr and no cargo. On 7 of 9 reckless careers that took the relief, the player stayed at about 19,000 cr net worth for the rest of the career (a Light Freighter with nothing to trade).
- A failed pirate job leaves the player with the Raiding Wasp (no cargo hold) and the debt. The player can refit (a cargo rack in place of the fuel tank, now that hulls hold fuel) or hunt bounties.
- A pirate with trade ships still takes few prizes (1 prize in 498 battles of the pirate style): most traders are Heavy Freighters, which only a Gunship-class ship can stop.

### Owner decisions after the play test (2026-11-04)

- Q-54: a done relief pays a start capital of 1,000 cr. Reckless bot careers: median net worth 19,516 -> 790,146 cr (22 of 30 take the relief).
- Laser range +50% (Pulse 8 -> 12, Beam 10 -> 15). `sim-combat`: all 6 checks pass (Shuttle vs Raider 58%, band 40-60%); battle length unchanged. Light Freighter capture: Laser Wasp 75%, Raiding Wasp 48%, Gunship 76%. `sim-trader --encounters`: 18/20 by day 150; `sim-career`: 6/6 end with no errors (median 1,377,844 cr, report).
- Two more soft-locks found by the pirate style and fixed: engines at 0 after a won battle, and a prize with its engines at 0 (every forced surrender) left the fleet unable to move in space. A tug now tows such a fleet.

### Bugs found and fixed in M8

- Guild relief with a full hold failed but gave the free repair; the offer box then blocked the location screen. Now the guild sells cargo to make room, and the repair comes only with a successful Accept.
- The region map route counted one jump too many (the path holds its start sector).

### Known issues

- Q-52 and Q-53 balance (reports): net worth at day 730 above the target; Supply contracts give more than open-market trade.
- The trader bots of the tools do not answer the second-chance offer (it stays open in their games).
- Codex: station use shows the scaled value (x `volumeScale`); population use shows the per-unit value.

<!--
Template for each milestone:

## M<n> <name> (<date>)

- **Works:**
- **Does not work:**
- **Known bugs:**
- **Exit checks:** <check>: PASS/FAIL (<value>)
- **Tool results:** <tool>: <summary>
-->
