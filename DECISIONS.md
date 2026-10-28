# Decisions

Write each decision that the brief does not give, with one line of reason (brief §0, item 3). Write each cut from the Cut list here (brief §20).

Format: `- YYYY-MM-DD [ID] Decision. Reason.`

Open questions with proposed defaults are in `docs/requirements/README.md`, Section 8. When a milestone uses a default, copy it here with its Q-number.

## Scoping

- 2026-10-26 [DOC] Keep the brief in `docs/design-brief.md` and the requirements in `docs/requirements/`, one file for each milestone. Reason: each milestone can start from one file.
- 2026-10-26 [DOC] Requirement IDs use `M<milestone>-<AREA>-<number>`, global rules use `G-<number>`. Reason: tests and commits can refer to one requirement.
- 2026-10-26 [DOC] Update the brief to v2.4 (Code Page 437, art from `/data/art/*.json`, upkeep by hull size class). Reason: owner change.

## Owner decisions on open questions

These decisions replace the brief text where they do not agree.

- 2026-10-26 [Q-01] Add `fuelMassExponent` (default 0.64) to `balance.json`. All fuel formulas use `mass ^ fuelMassExponent` (sector travel, jump, dock, combat, flee). Reason: linear mass gives 5.6× fuel for a laden Heavy Freighter; §8.7 expects about 3×. Owner approved.
- 2026-10-26 [Q-03] All locations trade Hydrogen (Refuel). Each location trades 4 to 8 commodities (Trade Hubs excepted), not 4 to 6 (§9.2). Reason: producers with crew population need up to 8. Owner approved.
- 2026-10-26 [Q-04] Deferred. The owner will rework security patrols later. Interim rule for M5: keep the §10.8 budget; patrols use the §10.6 selection rule; all patrol values stay in data. Reason: the Secure group in §10.8 (173 TU) is larger than its budget (max 132 TU).

## M1

### Open-question defaults used

- 2026-10-26 [Q-02] One Hydrogen unit gives `fuelPerHydrogen` (2) fuel units. Fuel price = Hydrogen price ÷ 2. Reason: proposed default; M1 uses it for the tow fee and the temporary Refuel.
- 2026-10-26 [Q-08] One RNG type with named streams (world, economy, encounter, combat, contracts, ui), made from the seed and the stream name. Stream state is in `GameState.rng`. Reason: proposed default; a UI action cannot change economy results.
- 2026-10-26 [Q-10] Hulls have no base fuel or cargo capacity. Fuel Tanks and Cargo Racks give all capacity. Reason: proposed default; agrees with §11.8.
- 2026-10-26 [Q-11] When fuel goes to 0 in a trip, the fleet stops at that point. Time passes up to that point. Reason: proposed default.
- 2026-10-26 [Q-12] The tow goes to the nearest location in the current sector. In a jump, it goes to the nearest location in the destination sector; the fee distance includes the rest of the lane. Reason: proposed default. (Docking refusal comes in M5.)
- 2026-10-26 [Q-27] If the spanning tree gives a sector more than 4 lanes, place the sectors again in the same try. Reason: proposed default. In 200 test seeds this never happened.

### Other decisions

- 2026-10-26 [M1-CORE-01] The RNG is sfc32 (in `core/rng.ts`), not the rot.js RNG. Reason: the rot.js RNG keeps hidden global state; sfc32 keeps its state as a plain array in `GameState`. rot.js still gives the display, and later pathfinding and cellular maps (seeded from a stream).
- 2026-10-26 [M1-GEN] All map distances multiply the vertical difference by `cellAspect` (2): sector spacing, lanes, sector travel, and tow distance. Reason: map cells are about twice as tall as they are wide; without this, vertical trips look short but cost the same as long horizontal trips.
- 2026-10-26 [M1-GEN-01] The sector count is the fixed value `sectorCount` (10). The data check keeps it in 8–12. Reason: simplest option; the brief gives 10 with a range for tuning.
- 2026-10-26 [M1-GEN-01] Sector placement uses dart throwing with the Poisson-disc minimum distance. Reason: simplest way to get exactly N points.
- 2026-10-26 [M1-GEN-07] The Middle fix in §6.4 step 3 never changes the last Frontier sector. Reason: without this, the fix could remove the only Frontier sector.
- 2026-10-26 [M1-GEN-10] Body rings have vertical radius 5, 8, 11, and 14 rows; the jump ring has 16. Bodies keep at least 6 units from each other and 4 from jump points. Reason: fits the 66 × 34 sector map with readable spacing.
- 2026-10-26 [M1-GEN-10] Body count: 3–6; the planet count is then random inside the planet and station limits. Reason: simplest way to meet all three limits.
- 2026-10-26 [M1-GEN-13] Station slots have the body type `station_slot` until M2 gives them a station type. Reason: §6.7 gives station types in the assign step.
- 2026-10-26 [M1-TRV] The tow takes no time. Reason: the brief gives no tow time; simplest option.
- 2026-10-26 [M1-TRV] If a ship cannot pay the dock fuel, its fuel goes to 0 and the fleet is towed to that location (distance 0). Reason: dock fuel is part of the trip (§8.4, §8.6).
- 2026-10-26 [M1-TRV-10] To pay a fee, the location buys only the cargo units that it needs, in fleet and cargo order. M1 uses base prices. Reason: §8.6 says the location buys cargo "to pay the fee", not all cargo.
- 2026-10-26 [M1-TRV-11] First tuning values: `cruiseFactor` 8, `jumpFactor` 1.5, `kSector` 0.0035, `kJump` 0.038, `kDock` 0.06, recovery base 300 cr, 10 cr per distance unit. Reason: the starting ship does 5.0 jumps on a full tank on the mean lane (18.7); a jump takes about 3 days; a sector trip takes about 1 day.
- 2026-10-26 [M1] A temporary Refuel service at the Hydrogen base price. It buys as much as the credits allow and nothing when credits are 0 or less. Reason: M1 needs fuel after a tow; M3 replaces it with the local Hydrogen price.
- 2026-10-26 [Q-09] Pulse Laser S: mass 1 t, price 2,000 cr. Reason: the §11.4 reference masses need 1 t; the other weapons come in M3.
- 2026-10-26 [M1-SHIP-02] `move` is limited to 6. Reason: the formula is below 7 in theory, but floating point gives 7 at very high thrust.
- 2026-10-26 [M1-CORE] The clock starts at day 0.0; the UI shows "Day 1". Reason: §16 counts a career of 730 days from day 1.
- 2026-10-26 [M1-UI] Map glyphs come from `data/art/icons.json`. Reason: the final visual design then needs only a data change.
- 2026-10-26 [M1-UI] The debug panel opens with F12 or the backquote key (`` ` ``; Shift gives `~`). Reason: §4.3; browsers often keep F12 for their own tools.
- 2026-10-26 [M1-UI] A new-game seed with no input comes from `crypto.getRandomValues` in UI code. Reason: this is not a simulation result, so it does not use the seeded RNG.
- 2026-10-26 [M1-UI] The message log keeps the last 2,000 entries. Reason: limits the save size.
- 2026-10-26 [M1-SET] Libraries: TypeScript 5.9, Vite 7, Vitest 5, Zod 4 (data checks), tsx (tools). Fixed versions. Reason: Vitest 3 and Zod 3 had known security problems (`npm audit`); Zod gives both types and checks.
- 2026-10-26 [M1-SET] Files that §4.1 does not list: `src/data/` (data loader and schemas), `src/core/game.ts` (runtime context), `src/core/newGame.ts`, `src/world/geometry.ts`, `src/world/names.ts`, `src/render/cp437.ts`, `src/ui/layout.ts`, and `tools/world-report.ts` (until `gen-report.ts` in M2). Reason: each has one job and keeps the other files small.

## Visual design import (Claude Design, 2026-10-26)

- 2026-10-26 [G-20] Keep the Claude Design files unchanged in `data/art/`: `ships.yaml` (source of truth for ship art) and `style.json`. `tools/import-art.ts` converts `ships.yaml` to `ships.json`; a test checks that they match. Reason: the game loads JSON in the browser and in Node with no YAML parser at runtime; the designer's file stays the source.
- 2026-10-26 [G-20] `style.json` replaces the placeholder `palette.json`. `render/palette.ts` gives each named color a use on screen (text `base`, dim `dim`, bright and titles `hi`, warning `hot`, danger `bad`, frames `frame`, selection `select`, keys `hi` on `keybg`). Reason: the style has names, not screen uses.
- 2026-10-26 [§18.2] All stars and suns use the `sun` color. The world keeps its star type (no visual use now). Reason: the style has one sun color and no colors for star types.
- 2026-10-26 [§17.2] Development level colors use the tech colors (Frontier `tech1`, Middle `tech2`, Core `tech3`). Reason: the style has no development colors, and development sets the tech level (§6.4).
- 2026-10-26 [§11.1, §18.1] Battle footprints come from `ships.yaml`, not from the §11.1 "Art" column or the §18.1 placeholder. Reason: brief v2.4 §18 ("read each ship's footprint from its art").
- 2026-10-26 [§13.2] Mirror swaps come from `ships.yaml` (14 pairs). Reason: the final art uses glyphs that the 4 pairs of §13.2 do not cover.
- 2026-10-26 [§18.3] Damage display uses the damaged and critical art of `ships.yaml` and the `damage_rule` dim factors, not the `%` and `.` rule. The hull limits (66%, 33%) stay. Reason: the design gives finished art for each state.
- 2026-10-26 [M1-UI-01] Font: JetBrains Mono 2.242 Regular, bundled from the npm package `jetbrains-mono` (SIL Open Font License). Not the Google Fonts / Fontsource "latin" files. Reason: those subsets have no box-drawing, block, or shade glyphs; the full file has all art glyphs except `◘` (Q-30).
- 2026-10-26 [M1-UI-01] A small rot.js backend (`FixedCellRect` in `render/display.ts`) gives 10 x 20 cells. Reason: rot.js makes cells `spacing x fontSize` high (17 px at 16.667 px) and has no option for different horizontal and vertical spacing.
- 2026-10-26 [M1-UI] Overlays (help, debug, new-game box, title) use the modal frame; other boxes use the single frame. Reason: `style.json` gives both frames.
- 2026-10-26 [M1-DBG] Debug panel item 7 shows all ship art: battle art in each state and side, and portraits with slot marks. Reason: a visual check of each art import.
- 2026-10-26 [M1-SET] `js-yaml` 4.3.2 (development only, for `import-art` and tests). Reason: 4.1.0 has known security problems.

## M2 Economy (2026-10-27)

### Defaults from the open questions

- 2026-10-27 [Q-05] `balance.economy.minTargetStock` per commodity (3 to 20 units). Reason: the default of Q-05.
- 2026-10-27 [Q-06] Generator ratio = nominal daily output (full inputs, K = K_ref, security multiplier) divided by nominal daily demand. Runtime ratio = 30-day supply divided by 30-day use. Reason: the default of Q-06.
- 2026-10-27 [Q-07] Generator step 2 changes the farthest non-core sectors to Frontier until there are `minFrontierSectors` (2). Reason: the default of Q-07; a retry cannot fix it.
- 2026-10-27 [Q-22] The Bounty Guild rule uses the security baseline at generation. Reason: the default of Q-22.

### Population and recipes

- 2026-10-27 [§9.4] `population.useScale` 0.12 multiplies all population use. Reason: with the brief values, 44 bodies need about 109 producers.
- 2026-10-27 [§9.4] Who uses what: medicine only resident populations (0.15); electronics and composites only resident populations in Core sectors (0.3); Hydrogen 0.5 for all (crew too). Crew (stations and airless planets) use food, water, oxygen, and Hydrogen. Reason: crews of mining stations do not buy consumer goods; Hydrogen gives each location a use for Refuel.
- 2026-10-27 [§9.4] Station use (`population.stationUse`): Shipyard Stations use Alloys, Composites, Electronics, and Machinery; Pirate Havens use food, medicine, and oxygen. Reason: these stations have no recipe, but the brief says that they buy these goods.
- 2026-10-27 [§9.5] `machineryWear` 0.004 (brief 0.0025). Reason: with 0.0025, Machinery demand is too small to keep two Machine Works busy. The wear rule (§9.5) still passes for each producer.
- 2026-10-27 [§9.1] `batchesPerSize`: ore, silicate, and rare element mines 3 (brief 5); Machine Works 0.25 (brief 2). Reason: the minimum of 2 producers per type gives too much supply at size 1 with the brief values.

### Generator (steps 4 to 9)

- 2026-10-27 [§6.8] Sizing band 1.0 to 1.35 (`ratioLow`, `ratioHigh`); accept band 0.9 to 1.35 (`ratioAcceptLow`, `ratioAcceptHigh`). Brief: 0.9 to 1.1. Reason: with integer sizes 1 to 3 and at least 2 producers, one size step changes a ratio by 30% to 50%, so 0.9 to 1.1 is often not possible.
- 2026-10-27 [§6.8] The size loop undoes a step that moves an accepted ratio out of the accept band, or that makes a ratio too low. Reason: two producers at sizes {2, 1} give 1.40 and {1, 1} give 0.93; without the undo the loop goes back and forth and stops at 1.40.
- 2026-10-27 [§6.10] Floor exemption: a ratio above the accept band passes when the main makers of the commodity are at the minimum size and at the minimum count. Reason: the minimum producer count wins over the ratio; by-products and off-map export remove the rest.
- 2026-10-27 [§6.7] `sectorMap.stationsMin` 2 (brief 1). Reason: each Middle and Core sector needs a slot for a relay Trade Hub. (Replaced 2026-10-27: see "Economy model change".)
- 2026-10-27 [§6.7] Producer placement keeps the last free station slot of a Middle or Core sector for a Trade Hub (score −20), and avoids Frontier sectors that touch no Middle or Core sector (score −6). Reason: goods leave such sectors only through other Frontier sectors, which cannot have Trade Hubs. (Replaced 2026-10-27: see "Economy model change".)
- 2026-10-27 [§6.7] Host planets: a producer that can stand only on planets (Gas Skimmer, Agri World) gets enough host planets. If the blueprint needs more, the generator changes "donor" planets (no resident population, and each producer they can host can also use a station) to the host type. Reason: Gas Giants are rare; 26 of the first 100 seeds failed on "no body for Gas Skimmer".
- 2026-10-27 [§6.10] New rule "supply path": each producer must reach a maker of each input, and a user of each output, through a chain of relay sectors. Reason: background flow moves goods only one lane a day; without a chain a producer starves for ever. (Replaced 2026-10-27: see "Economy model change".)
- 2026-10-27 [§6.10] A relay sector has a Trade Hub, a maker or user of the commodity, or a location with a relay commodity. The generator adds a Trade Hub in a free slot or a Habitat, else a relay commodity at a location with fewer than `maxCommodities` (8). A relay commodity has the target `relayTargetDays` (10) × the daily flow of the paths through it. Reason: full sectors blocked many paths; a relay passes on only its stock above half target, so it needs a stock of some days. (Replaced 2026-10-27: see "Economy model change".)
- 2026-10-27 [§6.10] New rule "commodity count": each location (not a Trade Hub) trades `minCommodities` to `maxCommodities` (4 to 8) commodities. Reason: Q-03.
- 2026-10-27 [§6.11] Repairs: supply path (add a maker near the location, move the cut-off producer, or move a station producer out of a full Middle or Core sector so that a Trade Hub can go there); gradient (add a maker of the dearest advanced good in a Core sector); producer count (place the missing producer, free a Habitat if necessary). Reason: each repair acts on the failed rule; repairs that add random producers did not help. (Replaced 2026-10-27: see "Economy model change".)
- 2026-10-27 [§6.10] The producer count rule checks the world after each repair, not only the first try. Reason: a repair hid a missing producer, and a world with one Gas Skimmer passed.
- 2026-10-27 [§6.11] The world keeps the market state of its validation run (200 days). Reason: a warm start; prices on day 1 are not all at base.

### Economy tick

- 2026-10-27 [§9.7] `flowTwoLanes` 0: no background flow between sectors two lanes apart (brief: "farther 0"). Tested 0.1 and 0.25: the chain shock did not improve and the route check got worse. Reason: keep the brief. (Replaced 2026-10-27: see "Economy model change".)
- 2026-10-27 [§9.7] `flowScale` per commodity (water and Hydrogen 0.4, oxygen 0.6, food and medicine 0.5, others 1). Reason: cheap bulk goods otherwise flatten all price differences, and no route has a margin. (Replaced 2026-10-27: see "Economy model change".)
- 2026-10-27 [§9.2] Trade Hub target: 3 days of region use (`tradeHubTargetDays`). Reason: larger hubs carry more goods but hide each shock (the chain shock check).
- 2026-10-27 [§9.8] Off-map export: each day, 50% (`exportShare`) of the stock above 2 × target (`exportStockRatio`) leaves the region. Reason: the brief has no sink for a small surplus, so stock grows for ever at producers.
- 2026-10-27 [§9.13] Clamp check: a market-day counts when the raw price factor is at or outside the clamp (0.3 or 3.0). The limit is 20% of all market-days of the commodity, for each seed. Reason: "for more than 20% of days" has no unit.
- 2026-10-27 [§9.13] Chain shock test: stop the ore mines of the sector with the most ore output for 30 days; measure the Alloys price at locations in neighbor sectors. Capital test: set K = K_ref and machinery stock 0 at a Frontier mine, add 10 Machinery, compare with a run without it; skip the first day. Reason: the brief does not give the test setup.

### Tools

- 2026-10-27 [M2-TOOL] `gen-report` and `sim-economy` take `--override=<json>`: a deep merge into the data, for tuning sweeps without file changes. Reason: faster tuning.
- 2026-10-27 [M2-TOOL-08] Debug panel item 8 "Show all prices": mid price of each commodity at each location, colored by the price against base. Reason: §4.3.

## Owner decisions on M2 and design update (2026-10-27)

- 2026-10-27 [Q-03] No limit on the number of commodities per location (owner). The `commodityCount` rule and `minCommodities`/`maxCommodities` are gone; a relay commodity can go to any location in the sector. Reason: there are only 12 commodities; a long list is a UI matter (M3).
- 2026-10-27 [Q-31] The clamp check is soft (owner: price gaps are good for trade). `sim-economy` reports each commodity at the clamp on more than 20% of its market-days as a NOTE, and fails only on a systemic problem: more than 50% of the market-days of one commodity in one seed. Reason: at 50% most markets of the commodity are empty or full, which is a fault, not a trade chance.
- 2026-10-27 [Q-34] Gradient for advanced goods: for each advanced commodity that Core and Frontier markets both trade, divide the Core median price factor by the Frontier median; the median of these ratios must be below 1. If no advanced commodity is in both, the advanced part passes. The raw part is unchanged. Used by world validation and by `sim-economy` (`src/econ/gradient.ts`). Reason: owner accepted the proposal.
- 2026-10-27 [Q-35] Generator margin: accept the M2 result; measure again after the Q-31 and Q-34 changes (owner).
- 2026-10-27 [§9.8] `offMapInputShare` 0.05 (was 0.15). Reason: owner wants the economy to work without off-map supply; 0.05 is the first step.
- 2026-10-27 [Q-31] New value `inputTargetDays` (target stock of recipe inputs, hard and Machinery wear), default 10, the same as `targetDays`. Tested 3, 5, and 7 days (`PROGRESS.md`): fewer markets at the clamp, but producers starve and the generator passes 18–42 of 50. Reason: flow follows the price gap; a smaller target lowers the price of a short market, so it pulls fewer goods.
- 2026-10-27 [Q-34] The gradient repair adds, in a Core sector, a maker of the advanced commodity with the highest Core/Frontier price ratio (only commodities that both trade), else of the dearest advanced commodity in the Core. Reason: repair the rule as Q-34 now measures it.

### Art (Claude Design, 2026-10-27)

- 2026-10-27 [G-20] New `style.json` (18 more colors for weapons and effects), new `modules.json` (module icons), new `effects.yaml` (combat effects v0.1). `ships.yaml` did not change. Reason: the designer's new files.
- 2026-10-27 [G-20] `npm run import-art` also converts `effects.yaml` to `effects.json`; a test checks that they match. `modules.json` loads as is. Reason: the same rule as `ships.yaml` (YAML is the source; the game loads JSON).
- 2026-10-27 [G-20] Checks: each game module has an icon; icon glyphs are 2 cells; families and colors exist; the colors that `modules.json` (`family_colors`) and `effects.yaml` (`colors`) repeat must equal `style.json`; effect frames use only known line sets, patterns, and colors. Icons for modules that are not in `data/modules.json` yet (M3 weapons) are allowed. Reason: catch errors in a new design file at load time.
- 2026-10-27 [M4-UI-04] Combat effects follow `effects.json` (frames, times scaled to path length, queue with stagger and 1.2 s budget), not the §18.4 table. Reason: brief §18 (Claude Design gives the final effects).
- 2026-10-27 [M1-DBG] Debug panel item 7, last page: module icons with family mark, size, tier, and the four module states. Reason: a visual check of the import.

## Economy model change (owner, 2026-10-27)

### Record correction

- 2026-10-27 [§9.7] Missing record: from M2 until this change, the build used `flowSameSector` 1.0, `flowOneLane` 0.5, and `flowDeficitShare` 0.5 (brief: 0.05, 0.02, 0.1). Reason at the time: with the brief values and no player, the chains stopped (Smelters at 16% output). This entry was not written then. The carrier model below replaces these values.

### Background carriers (solution 1)

- 2026-10-27 [§9.7] Background carriers replace the price-diffusion flow (`src/econ/carriers.ts`). Reason: diffusion moves goods one hop at a time and needs a price step at each hop; on chains of 2 to 4 hops both ends hit the price clamp. Sources piled up (export removed about 40% of raw goods) while Smelters and Electronics Fabs starved.
- 2026-10-27 [§9.7] Carrier rules (`balance.economy.carriers`): routes of up to 3 jumps; a route must give a margin of 25% (`minMargin`) after transport cost; cost = mass x (1 + 3 x jumps) cr per tonne + buy price x 5% x jumps (`riskPerJump`); best profit per tonne first; `dailyShare` 0.5 of the open amount per day; capacity 3,000 t per sector per day x (0.2 + 0.2 x security level); transit 1 + 2 x jumps days. Reason: the brief's NPC agent rules (§9.9: routes within reach, live prices, a minimum margin) at a region level. Gaps below the margin stay for the player; pirates (low security) lower the capacity.
- 2026-10-27 [§9.7] Carriers fill a sink until its price falls to the route's break-even price (source buy price x (1 + minMargin) + cost), at most `exportStockRatio` x target. The fill counts goods in transit less the sink's use during transit. Reason: with a fill to target, all sinks sat at the base price at any distance, so there was no Core-Frontier gradient for advanced goods. Without the use during transit, far Smelters starved (their goods in transit filled the limit).
- 2026-10-27 [§9.7] Goods in transit are part of `EconomyState` (`shipments`) and so of the save. Reason: the state must stay one serializable object.
- 2026-10-27 [M2] Removed because carriers replace them: relays and relay targets, the relay supply paths and Trade Hubs placed as relays, the relay repair, `flowScale`, `flowTwoLanes`, the slot reservation for relay hubs (score −20), and the penalty for Frontier sectors that touch no Middle or Core sector (score −6). Reason: a carrier reaches 3 jumps without a relay.
- 2026-10-27 [§6.10] The "supply path" rule is now static: each producer has a maker of each hard input, and a user of each output that populations do not use, within `carriers.maxJumps` jumps. Reason: this is what carriers need.
- 2026-10-27 [§6.7] `sectorMap.stationsMin` stays 2 (brief 1). New reason: with 1, the region has too few bodies for the producers (26 of 100 seeds failed "producers placed").

### Volumes (solution 2)

- 2026-10-27 [§9.3, §9.4] `balance.economy.volumeScale` 8 multiplies recipe batches, population use, and station use at data load. Prices and supply/demand ratios do not change. Reason: owner wants larger volumes; with the old volumes the largest Electronics market held 12 t and Machinery 1 t, less than one starting hold (30 t). Now Electronics 96 t, Composites 144 t, Medicine 215 t; a 30 t hold of Electronics costs 1.16 x base on average.

### Manufactured goods outside the Core (solution 3)

- 2026-10-27 [§9.4] New population rule `outsideCore`: all populations and crews in Middle and Frontier sectors use Electronics 0.02, Composites 0.02, and Machinery 0.01 per unit per day. Reason: owner wants a small Frontier demand for goods made in the Core, at higher prices; post-MVP this demand goes to station building, upgrades, and research.

### Generator and economy (solution 5)

- 2026-10-27 [§6.10] `generator.economyCheck` false: the generator checks structure only while the economy is tuned (owner). `sim-economy` checks the economy. The generator runs the economy for `warmupDays` (100) after a world passes, so the game starts with warm markets. Reason: owner decision; the generator pass rate no longer moves with economy tuning.

### Off-map supply removed (owner, 2026-10-27)

- 2026-10-27 [§9.8] `offMapInputShare` 0 and `offMapBalance` 0: no input trickle and no region balance. The code stays, so a value above 0 turns them on again. Off-map export stayed until production responded to prices (removed later on 2026-10-27). Reason: owner wants an economy with no off-map supply; with carriers, the checks pass without it.

### Capital as a price signal (owner, 2026-10-27)

- 2026-10-27 [§9.5] Producers install Machinery up to a target K*, not to 1.5 x K_ref. K* is where the daily gain of one more unit of K (`batches x valueAdded x 0.6 x K_ref / (K + K_ref)^2`, value added at local prices) equals its daily cost (`machineryPrice x (wear + requiredReturn)`). `recipes.capital.requiredReturn` 0.0088 a day: an Ore Mine at base prices then targets 1.5 x K_ref, the brief's value. Reason: owner wants capital formation to follow prices inside the existing capital rule. With the fixed target, Machinery cost 1.9-2.0 x base for ever; with K*, about 0.9-1.0 x base, and producers with cheap outputs hold less capital (they make less).
- 2026-10-27 [§9.5] No upper limit on K (the brief's 1.5 x K_ref is removed, owner). Reason: diminishing returns already limit K*; `capitalFactor` stays below 1.2. The install rate (10% of K_ref a day) stays: it sets how fast capital changes.
- 2026-10-27 [§9.5] Output can change only between 0.6 and 1.2 x nominal through K. (Replaced 2026-10-27: capacity now follows the output price, with no limit.)
- 2026-10-27 [§9.13] Chain shock: report only, not a check (owner, Q-32). Reason: swings and boom/bust cycles are a feature.
- 2026-10-27 [§9.13] Capital check replaced (owner, Q-33): "capital responds" (stop all Machine Works 60 days; Machinery price up, total K* down, price back within 20% in 180 days after the restart). The player effect (10 Machinery to a Frontier mine at 0.5 x K* and at K*) is a report. Reason: with K*, Machinery that a mine does not need is not installed, so the old test measured only how short Machinery was.
- 2026-10-27 [§16] After the MVP, the owner wants no career limit (day 730). Keep the day-730 end as one value. See `docs/requirements/README.md`, Section 11.

### Closed economy: no export, capacity follows output price (owner, 2026-10-27)

- 2026-10-27 [§9.8] Off-map export removed (owner). No goods leave or enter the region: the off-map rules are all 0 or removed. Carriers fill a sink to its break-even stock with no other cap; the minimum margin keeps the break-even price above the low clamp. Reason: the economy corrects itself with prices.
- 2026-10-27 [§6.8, §9.3] Production capacity (`Location.capacity`, start 1, no upper or lower limit) multiplies the batches. Each day it changes by `capacity.changeRate` (0.3%) x clamp(min(demand signal, profit signal), -1, 1) (see the input-price entry below). Growth is also multiplied by the input factor of the last production day, so a producer that is short of inputs does not grow. Growth uses at least `restartCapacity` (0.1) as its base, so a producer that shrank to almost nothing can grow again. The generator sizes (1 to 3) are only the start values. Reason: owner: "shrink and grow according to prices of their output".
- 2026-10-27 [§6.8] First try, rejected: capacity by profit at local prices against profit at base prices. Every link pays the carrier margin, so processors buy above base and sell below base even in balance; Machine Works, Smelters, and Composite Works shrank to almost 0 in 1,500 days.
- 2026-10-27 [§9.2] Targets update each day: input and population targets follow capacity; output targets keep the size at generation (capacity 1). Reason: if a producer's own capacity changed its output target, a smaller producer would see a lower price for the same stock and shrink more (and a larger one grow more).
- 2026-10-27 [§9.13] "Capital responds" compares the stopped run with a control run (same world and random numbers, no stop): the Machinery price must be within 20% of the control run within 180 days. Reason: prices now move in cycles, so the level before the stop is not a fixed reference.

### Input prices and the M2 checks (owner, 2026-10-27)

- 2026-10-27 [§6.8] Capacity uses input prices too (owner). Two signals; the smaller one rules: demand = output price at the producer / (`growthPriceFactor` x base) - 1; profit = output value / unit cost - 1, where unit cost = hard inputs + machineryPerBatch x Machinery price x (wear + requiredReturn). A producer grows only when its output is dear and it covers its costs; it shrinks when its output is cheap or its costs are above its output value. `growthPriceFactor` 1 (owner: price level above base is fine; a lower value gives a lower price level).
- 2026-10-27 [§6.8, §9.5] Producers value inputs and Machinery at replacement cost (`src/econ/costs.ts`): the cheapest source buy price plus transport cost and risk within the carrier range; the local price if no source has goods. Used by K* and by capacity. Reason: a producer uses its inputs each day, so its own input market is nearly empty and its local input price sits near the high clamp; with local prices, Machine Works and Smelters saw losses while their outputs were dear, and shrank in a spiral.
- 2026-10-27 [§9.13] Only faults fail (owner): no systemic clamp, no stock below 0, no permanent stop (no producer below 30% output for more than 365 days in a row; was 60 days), and capital responds. The gradient, route margins, raw-goods margins, busts of 61-365 days, and the chain shock are reports. Reason: booms and busts are a feature; the shape of prices changes with the cycle.

## M3 Trade and ships (2026-10-27)

### Ships

- 2026-10-27 [Q-09] Weapon and point defense mass and price by size: S 1 t, 2,000 cr; M 4 t, 6,000 cr; L 10 t, 18,000 cr. Heat per shot from the Q-09 default. Reason: Q-09 default; the §11.4 masses need a 1 t S weapon.
- 2026-10-27 [§11.1, Q-37] Light Freighter internal slots S2 M2 L1 (owner accepted, 2026-10-28) (the brief has S3 M2 L0). Reason: with no L slot, an LF with an M engine and an M fuel tank has no slot for more than 30 t of cargo, so it carries no more than the Shuttle. With S2 M2 L1 the trader loadout fits Engine M, Fuel Tank M and S, Reactor S, and Cargo Rack L (80 t).
- 2026-10-27 [§11.4] The §11.4 reference rows test the formulas at the masses in the table (`ship-report`), not the masses of the default loadouts. Reason: the brief says the rows test the formulas; the default loadouts have extra modules (for example the Shuttle's shield) and differ by 1–2 t.
- 2026-10-27 [§12.2] Point defense is size S in all loadouts. Reason: §12.2 gives one size.
- 2026-10-27 [§11.9] Loading order: the non-flagship ships with the most thrust first, the flagship last; a sale takes cargo from the flagship first. Reason: §11.9 (heavy goods to the ship with the most thrust; keep the flagship free for combat).

### Services

- 2026-10-27 [§7.4] Service rules in `services.json` (`rules`): Mechanic 20 cr per hull point, 25 per engine point, 15 per armor point; Outfitter sell share 0.6 (Q-13); trade-in share 0.6; Pirate Havens sell tiers 1–3 at 130%; Guild range 2 jumps; trend 14 days; Wait 1–30 days. Reason: the brief gives no Mechanic prices; a full Shuttle hull repair costs 800 cr, about 3–5 days of early profit.
- 2026-10-27 [§17.4] Market roles: "Sells" if the location's producer makes the commodity; else "Buys"; Trade Hubs show "Hub". Reason: §17.4 marks Sells or Buys; a Trade Hub does both.
- 2026-10-27 [Q-02] Refuel buys Hydrogen unit by unit at the local buy price; part units pay their share of the next unit price. Quotes now take part units (fuel, Food after loss).
- 2026-10-27 [M3-SVC-15] A tow fee sells cargo at the local sell price, unit by unit, and only the commodities that the location trades. If that is not sufficient, credits go below 0. Reason: a location with no market for a commodity has no local price.
- 2026-10-27 [Q-14] A new hull comes with full HP and no fuel; it needs a fuel tank before it can refuel. A new Armor Plating comes at full HP; a new Fuel Tank comes empty. Removing a Cargo Rack is blocked while the cargo would not fit. Reason: no module storage, and cargo cannot float.
- 2026-10-27 [§8.6] In debt, an actor cannot buy hulls or modules. Market buys and Refuel also stop, because they need credits above 0. Each sale adds to credits, so it pays the debt first.

### Price information

- 2026-10-27 [§9.12] Known prices keep the stock and target of each market (not only the price), so the route planner can quote unit by unit. Trend arrows come only from a Merchants' Guild. Reason: §9.12 gives trends to the Guild.
- 2026-10-27 [§9.12] Knowledge updates on departure, arrival, jumps, tows, and each day of Wait. The Guild information updates when the player docks there. Save version 2 (the actor has `knowledge`).
- 2026-10-27 [§14.4] Chain alerts: a producer below 60% output (cause: the hard input with the lowest stock against its need, "no" below 5% input, else Machinery, else capacity, else security), and a population whose stock is below 1 day of use. Values in `services.json` (`alerts`).

### Routes and the trader bot

- 2026-10-27 [§17.6] Route values: the planner buys unit by unit while the next unit makes a profit, up to free tonnes, credits (less the fuel cost), and known stock. Trip days and fuel come from the fastest path (sector distance / cruiseFactor + lane length / jumpFactor), with the cargo mass. A route that starts elsewhere adds the trip to its start. Profit per day = (profit − fuel cost) / days. The code is in `src/actor/paths.ts` and `src/actor/routes.ts` (M3-UI-13).
- 2026-10-27 [M3-TOOL-02] The bot (`tools/lib/traderBot.ts`): sells where the plan says or at a profit; buys a second S engine for the free slot when it keeps 2,000 cr (§11.8); buys the Light Freighter and its trader loadout when it can pay and keep 2,000 cr; refuels; takes the best known route by expected profit per day; explores when it knows no route. Expected profit: on a long trip the margin moves toward the carrier cost of the route (weight 1 − exp(−trip days / carrier transit days)). Reason: without this rule the bot took 1-jump trips to small Machinery markets that carriers filled before it arrived, and lost money.
- 2026-10-27 [UI] Sector map keys: O opens the Location screen (Enter with no target too), I the fleet screen, T the Trade Ledger, V the route view. Reason: D and F are location keys on the sector map.

### Carriers (economy change found by the trader bot)

- 2026-10-27 [§9.7, §22] Carrier `minMargin` 0.25 → 0.12, and a new capital cost in transit `capitalCostPerDay` 0.01 (share of the buy price per transit day, in `transportCost`). Reason: with a 25% margin on all goods, a gap of 25–30% stayed between near locations for goods of high value (Electronics 2,000 cr/t). The bot earned 25% on its capital in each 0.6-day trip in one sector, and bought the Light Freighter on day 36 (median, 20 seeds; target day 60–120, §22). A per-tonne handling cost was tested and rejected: at 14 cr/t, Water and Oxygen sat at the high clamp on more than 50% of days, and biolabs stopped. With 0.12 and the capital cost, all M2 pass/fail checks pass (20 of 20 seeds) and the median upgrade day is 82.

### Owner decisions on M3 (2026-10-28)

- 2026-10-28 [Q-36] M3 exit check 1 is now: median upgrade day in day 60–120, and 15 of 20 seeds upgrade by day 150. A seed with no upgrade counts as later than all others for the median. The count in day 60–120 is a report. Reason: the worlds differ (a good start earns 600–750 cr per day, a poor start 20–100), so no economy value puts 75% of seeds in a window of 2×.
- 2026-10-28 [Q-37] Keep the Light Freighter internal slots S2 M2 L1 (owner).
- 2026-10-28 [§9.9] NPC trade agents are parked until after the MVP (owner). The carriers do all background trade. The trader bot stays a test tool.

### Navigation (owner feedback, 2026-10-28)

- 2026-10-28 [§17.5] Click zones: each screen adds a zone for each item that it draws (tabs, list rows, Ledger cells and heads, sector map list lines, key hints). A click on a key hint does the same as its key (`src/ui/widgets/clicks.ts`). Arrow keys: Left/Right switch Location tabs (in the Outfitter, at the edge of the slot list or shop), Left/Right select the ship on the Fleet screen, Up/Down step through targets on the sector map and lane exits on the region map. A click on a best route in the Ledger opens it in the route planner. Reason: owner asked for mouse and arrow navigation.

### Technical names and best routes (owner, 2026-10-28)

- 2026-10-28 [§17.1, §17.6] Technical names (owner): each sector has a unique 3-letter code (first 3 letters; on a clash, the first letter and two consonants). A location's code is sector code + type code + number: planets one capital letter (T Terran, O Ocean, D Desert, I Ice, V Volcanic, G Gas Giant), stations two small letters (mn Mining, pr Processing, in Industrial, hb Habitat, th Trade Hub, sy Shipyard, mo Military Outpost, ph Pirate Haven, st other station). The number counts from the star outward, only when the sector has more than one location of that type ("SEL-O2", "SEL-pr"). Type codes are in `bodyTypes.json`. Flavour names stay on the sector map; the Location header and the status bar show both. Reason: owner feedback; in 200 sectors, names are up to 8 letters, 117 sectors have repeated types, and 13 have a clash of the first 3 letters.
- 2026-10-28 [§17.6] The Trade Ledger groups its columns by sector (nearest first; in a sector, from the star outward), with the sector code and jumps in a band above, and the short code in each column head.
- 2026-10-28 [§17.6] Best routes (Ledger and trader bot) start only where the location makes the good or at a Trade Hub ("Sells" or "Hub" on the Market tab) (owner). A manual route in the planner can start anywhere; the planner shows a warning when the start does not make the good. `bestRoutes(..., { anyStart: true })` gives the old list. Reason: a market that only uses a good has little stock to sell, so those routes were not practical. Result: the bot's median upgrade day moves from 82 to 91, and its Shuttle profit in the first 30 days from 295 to 189 cr per day (inside the §22 band).
- 2026-10-28 Save version 3 (sectors have `code`).

## Cuts

None.
