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

## M4 Combat core (2026-10-28)

### Open-question defaults used

- 2026-10-28 [Q-19] An engine shot multiplies the hit chance by 0.85 (`engineShotFactor`). Replaced by Q-40 (aimed shots use tracking).
- 2026-10-28 [Q-20] Engine damage has no effect until the engine value is 0; then move and maneuver are 0, and the ship cannot flee.
- 2026-10-28 [Q-25] Attack AI for the player side in `sim-combat`: the nearest hostile target, the wanted distance, no retreat.
- 2026-10-28 [Q-28] The player gives toggles, moves, and shots in any order; the resolver checks the move budget and one shot per weapon.

### Combat data (Q-38, accepted by the owner 2026-10-28)

- 2026-10-28 [§11.6, §11.7] (Replaced by Q-40: `idleHeatScale` and `shotHeatScale`.) `combat.heatScale` 0.5 on all heat per turn and per shot. Reason: with the §11.7 values, every default loadout except the Light Freighter makes more heat at idle than it cools (Shuttle 5 against 3), so all ships overheated and burned even when they did not fire. With 0.5, idle heat is below cooling for the M4 ships; shots still build heat.
- 2026-10-28 [§12.2, §13.9] `combat.damageScale` 2.75 on weapon damage against ships (not point defense). Reason: with the §12.2 values, two autocannons could not break a Shield S (regen 4 per turn), and battles went to 25 turns. A uniform scale does not change threat units (the formula is a ratio to the Raider). Median battle length is now 8-10 turns.
- 2026-10-28 [§11.1] Wasp heat capacity 25 → 40. Reason: a laser Wasp (2 lasers) overheated by turn 3; this was the lever that moved the laser Wasp pairing without moving the Shuttle pairing.
- 2026-10-28 [§10.5] Pirate Raider loadout: 2 autocannons, engine, reactor, shield (was 2 engines, no shield). Reason: the threat formula then gives Raider/Shuttle 1.07 (§10.5 reference 10/9 = 1.11; the old loadout gave 0.83).
- 2026-10-28 [§13.8] Raider retreat below 50% hull (`retreatHull`; the brief says 30%), and a retreating Raider does not fire. Reason: needed for the laser Wasp pairing; the brief does not say whether a retreating Raider fires (the Evader rule says so, the Raider rule does not).
- 2026-10-28 [§13.8] AI ships start with at least 5 fuel (`npcFuelReserve`). Reason: a Wasp has no fuel tank, and a ship with 0 fuel cannot move.
- 2026-10-28 [§8.5] `kCombat` 0.01 and `kFlee` 0.1 (times mass^0.64): a Shuttle uses about 0.09 fuel per turn and 0.9 for a flee.

### Rules where the brief is not complete

- 2026-10-28 [§12.5] Armor Plating HP takes hull damage after armor and before hull HP. An engine shot goes to the engine value only.
- 2026-10-28 [§11.6] Overheat at the heat step blocks fire on the next turn (the turn after the step), then clears at the next step.
- 2026-10-28 [§13.8] Morale: one surrender roll per ship, when hull first falls below 25% or the engine value is 0.
- 2026-10-28 [§12.2] Flak hits only hostile ships in its 3 x 3 area around the nearest target cell; it always aims at the hull.
- 2026-10-28 [§12.3, §13.1] The line of fire goes from the nearest attacker cell to the nearest target cell (Bresenham). Asteroids on the line block it; debris on the line gives `debrisFactor`; ships do not block it.
- 2026-10-28 [§13.2, §13.8] Movement: breadth-first search over anchor cells with the full footprint (the same paths as A* inside the move budget). The AI looks up to 4 turns ahead for a cell with a clear line of fire at its wanted distance (`bestRangeShare` 0.5 of its shortest weapon range), and moves along that path. In the UI, Enter or a click moves the ship as far as it can toward the cursor.
- 2026-10-28 [§13.8] Power priority: the loadout list; for a ship with no list (the player's), engines, shields, weapons, thrusters, then the rest. AI ships set their power at the start; the player keeps the ship's setting if it is valid. Shields start full.
- 2026-10-28 [§13.8, Q-25] The Attack AI switches OFF its hottest weapon only when firing all weapons would overheat it this turn; Raider and Trader use the brief rule (switch OFF at Hot).
- 2026-10-28 [§13.1] Map: rot.js `Map.Cellular` with the random fill from the combat RNG stream (fill 0.42, 3 steps; about 11% obstacles); 35% of clusters are debris clouds. Each side starts at column 18 from its edge; bands of 6 cells around the start columns and the map edges are open.
- 2026-10-28 [§13.7, §16] M4: a lost battle is game over and goes back to the title screen (the fleet rule is M6). A ship with 0 fuel after a battle is towed. Replaced by "Defeat and Clone Insurance" below.
- 2026-10-28 [§12.4] Guided weapons and point defense do not fire in M4 (M5).
- 2026-10-28 [§18.4, G-20] Effects use the frame types line, at, travel, perim, and foot from `effects.json`; the example `cells` lists in the file are not used. A damage effect starts when the shot before it ends. "frac" cells are a fixed pattern (render only, no game randomness).

## Defeat and Clone Insurance (owner, 2026-10-28, Q-39)

The owner changed brief §13.7 and §16 and moved brief §21 item 10 (insurance) into the MVP.

- 2026-10-28 [owner] Pirates do not fight to kill. If every hostile ship in the battle is a pirate (`faction` 'pirate'), a loss disables the ship: the pirates take all cargo of the fleet, the ship keeps `disabledHullShare` (0.1) of its max hull, and a tug tows the fleet to the nearest location (the §8.6 recovery fee). Reason: owner decision; an early loss to Raiders must not end the career.
- 2026-10-28 [owner] Any other loss (a patrol, a trader, an escort, or a group with one non-pirate) destroys the ship. Reason: owner decision; death stays a risk for piracy and for a Wanted player.
- 2026-10-28 Each combat ship has a `faction` (player, pirate, trader, patrol). Default: Raider AI → pirate, Trader AI → trader, other AI → the side (player or patrol). Reason: in M5, escorts use Patrol AI with pirate loadouts and pursued pirates use Evader AI, so the AI kind cannot tell who is a pirate.
- 2026-10-28 [owner] Clone Insurance at every dockable location, planets and stations (`services.json`, service `insurance`). The premium is `premiumShare[security level] × (hull price + module prices)` of the flagship, with the security level of the sector now. Shares: Lawless 12%, Low 8%, Medium 5%, High 3%, Secure 2%. Reason: the owner asked for cheap insurance in safe sectors and expensive insurance in Lawless sectors. With 5% in Secure, the starting Shuttle (15,900 cr) cost 795 cr of the 2,000 start credits; 2% gives 318 cr.
- 2026-10-28 [owner] The policy stores the location, the day, the premium, and the flagship (hull and loadout, no cargo). If the last ship is destroyed, the player wakes at that location with a new copy of the ship (full hull, armor, engine value, and fuel). The policy covers only the ship: the player keeps the credits (and any debt) of the moment of the loss. The world and the day continue. Reason: owner decision (confirmed 2026-10-28).
- 2026-10-28 One policy at a time. A new policy replaces the old one with no refund. A claim uses the policy. A disable by pirates does not use the policy. The service is refused in debt. Reason: simple rules; the brief has no insurance rules.
- 2026-10-28 A new career starts with no policy; the player can buy one at the start location. The status bar shows "Insured" or "Not insured". Reason: the premium is a real choice from day 1 (318 cr for the starting Shuttle in a Secure sector).

## Heat and aimed shots (owner, 2026-10-28, Q-40)

- 2026-10-28 [owner, §11.6] Two heat scales: `idleHeatScale` 0.3 (heat per turn of modules ON) and `shotHeatScale` 0.6 (heat per shot). Reason: the owner asked for the split. Idle heat is now below cooling for all 18 default loadouts (the Patrol Cutter was above). Shot heat: the laser Wasp pairing (§13.9, 50-70%) sets the limit (1.0: 32%; 0.75: 48-52%; 0.6: 53% at 500 battles). Laser builds on Gunships and larger ships overheat in 7-11 turns of full fire; ballistic builds do not (`docs/proposals/combat-v2.md`).
- 2026-10-28 [owner, §11.6] Overheat takes the ship offline: hull damage = heat above capacity, then no orders, and active modules (power draw > 0: engines, shields, weapons, thrusters) do not work, so move, maneuver, and shields are 0. Passive modules (armor, heat sinks, radiators, cargo, fuel, reactors) work. While offline, only cooling acts (no idle heat). The ship is back online when heat is at or below `overheatRecoverShare` (0.7) of capacity. Reason: owner decision ("no actions unless it cools down; engines do not move; shields fail"). 0.7 is the Hot line, so "back online" = "back to Normal". A Shuttle that overheats is offline for 3 turns.
- 2026-10-28 [owner, §13.6] An aimed shot (at the Engines now; at other modules when module damage comes) has hit x tracking / (tracking + `moduleAimTracking`), with `moduleAimTracking` 25. Pulse laser 0.86 (Q-19 was a flat 0.85), autocannon 0.62, mass driver 0.50, heavy cannon 0.32. Reason: owner decision (tracking carries over into module aim).
- 2026-10-28 [§13.8] No AI fires a shot that would overheat its ship (heat at the end of the turn at or above capacity). The Attack AI no longer switches weapons OFF for heat; Raider and Trader still switch OFF the hottest weapon at Hot. Reason: an overheat is now close to a loss; the AI must respect it as a player does.
- 2026-10-28 [§17] The combat heat bar shows the heat at the end of this turn with the planned shots ("now>after%"). A plan that overheats the ship shows a warning. An offline ship shows "OFF n t" (turns left). Reason: the forecast makes the heat choice visible (owner wants heat to be fun, not hidden).

## Power as actions (owner, 2026-10-28, Q-41)

- 2026-10-28 [owner, §11.5] Power is an action budget in combat. Each turn the reactors give `powerSupply` (max). Modules ON in `reserveCategories` (shields, thrusters, point defense) reserve their draw. The rest is available: the first move of a turn costs the draw of the engines that are ON; each shot costs the weapon's draw. Display: "available (reserved) / max + capacitor" (the "+" part only with a Capacitor). Reason: owner decision; it makes "move or fire, shields or one more gun" a choice each turn.
- 2026-10-28 [owner] An order over the available power uses the capacitor first, then the reserve: reserving modules lose power at random (combat RNG) until the reserve covers the rest. A shield that loses power drops to 0. Modules get power back at the end of the turn (before the shield step, so a shield regenerates from 0). Reason: owner decision ("my shields will be down until my next turn"; "a random system loses power").
- 2026-10-28 The player confirms an overdraw: the UI shows the cost and the system that loses power, and the same order again (Enter for a move, F for fire) confirms it. F alone fires only the shots that free power pays for. Reason: an overdraw drops the shields; the player must not do it by accident.
- 2026-10-28 Toggles stay free. A reserving module that goes ON is refused if its draw is above the available power this turn. Engines and weapons ON cost nothing until they act. Reason: the brief's power toggles stay (§20 do-not-cut list); the reserve is the toggle decision now.
- 2026-10-28 [owner] Capacitor (new internal module, S/M/L: 3/6/12 stored power; mass 1/3/6; price 1,000/2,500/6,000). It starts each battle full. Unused available power at the end of a turn charges it, up to its capacity. Reason: owner decision (stored power, "+1"). Its icon is a placeholder in `modules.json` (`placeholderIcon`) until Claude Design adds one to `data/art/modules.json`.
- 2026-10-28 [§11.7] Reactor S output 8 → 5. Reason: with 8, every small ship could move and fire all weapons with shields up (Shuttle 4 of 7 available), so power gave no decisions. With 5, the Shuttle is 4 (2) / 6, as in the owner's example; a second engine or more weapons make a choice. M and L reactors do not change (larger ships are already above their power when they move and fire all).
- 2026-10-28 [§12.2] Pulse Laser power 2 → 1. Reason: with 2, the laser Wasp (4 available; move 2 + 2 lasers 4) won 49% against 2 Raiders (band 50-70%, 500 battles); with 1, 53%. A larger Wasp base power did not help (47%). Reverted by Q-42 (power 2 again): the new fighter checks pass with 2, and the Wasp gets a power choice each turn.
- 2026-10-28 Loadouts with only an S reactor that could not move under the new rule get a second S reactor: Laser and Ballistic Gunship (free S slot), Pirate Gunship and Patrol Cutter (in place of the S engine), Heavy Freighter trader (in place of the S fuel tank). Reason: with reactor S 5, their reserve plus engines was above max.
- 2026-10-28 [§13.8] AI power: engines, weapons, and passive modules ON; reserving modules ON in priority order while the reserve leaves power for the engines. The AI never overdraws; it stands and fires when it cannot pay for a move and all its ready shots (clear line of fire, target in range of all). Retreating ships and traders still move (they may overdraw). Reason: simple greedy rules; an overdraw is a player decision.
- 2026-10-28 [§17.3] Fit rule: the error "power below engine draw" stays. The warning is now "reserved + a move is above max" (a move in combat takes power from the shields). The old "all ON" warning is gone: more weapons than one turn can fire is now a normal build.

## Light fighter check and hitscan lasers (owner, 2026-10-28, Q-42, Q-43)

- 2026-10-28 [owner, §13.9] The laser Wasp check now shows that a dedicated light fighter beats the multipurpose Shuttle: Laser Wasp vs Starting Shuttle (both AI; the Shuttle uses the Attack AI) wins 70% or more, and Laser Wasp vs 1 Raider wins at least 20 points more than Shuttle vs 1 Raider. Laser Wasp vs 2 Raiders (brief 50-70%) is a report. Reason: owner intent for the check; the old band forced cheap lasers under power as actions.
- 2026-10-28 The laser Wasp loadout does not change (2 pulse lasers; engine, reactor, shield). Reason: of 7 Wasp loadouts (300 battles each, vs 1 Raider / 2 Raiders / Shuttle), it is the best: 99/70/98%. Two engines and no shield: 77/21/81%. Capacitor in place of the shield: 71/12/66%. Thrusters: 74/15/68%. Laser + autocannon: 96/48/94%. Two autocannons (the Raider): 66/7/50%. Two shields and no reactor: 16/0/7%. A poor loadout loses.
- 2026-10-28 [owner, §12.1, §12.3] Lasers are hitscan: each laser has its own `rangePenalty` 0.1 (other weapons use `combat.rangePenalty` 0.4). Reason: owner decision; brief §12.1 calls lasers hitscan. Lasers are now the accurate weapon at range.
- 2026-10-28 [§12.2] Pulse Laser power back to 2 (the brief value; Q-41 had 1). Reason: with the Q-42 checks, power 2 passes (Shuttle vs Raider 52%, Wasp vs Shuttle 99%, Wasp vs Raider 98%, Wasp vs 2 Raiders 51%; 300 battles). Lasers cost more power than ballistics again (brief §12.2 design note), and a laser Wasp must choose each turn: move and fire one laser, stand and fire two, or move and fire two with the shield down.
- 2026-10-28 [§12.2] Pulse Laser damage 5 → 4. Reason: hitscan raised Shuttle vs Raider to 70% (band 40-60%). Damage 4.5: 63%; laser range penalty 0.2: 66%; damage 4: 52% (300 battles).
- 2026-10-28 `sim-combat` and other tools: `--override` patches items in id lists by id (for example one hull or one module size). Reason: tuning sweeps of one module without a data edit.

## Point defense and the debug flag (owner, 2026-10-28, Q-44)

- 2026-10-28 [owner, §12.2, §13.3] Point defense fires during the munition move (M5): when a munition comes within range 3 of a ship with point defense, the point defense fires (up to 2 shots per turn per module) before the hit roll. It fires only at munitions, not at ships. Reason: with the §13.3 order (munitions move and hit, then point defense), a missile at speed 6 usually hits before point defense can fire. Flak keeps the close anti-ship role.
- 2026-10-28 [owner, §4.3] The debug panel also opens in a production build when the URL has `?debug` (for example the GitHub Pages site with `?debug`). Reason: owner playtests on the deployed site. Without the flag, the deployed game has no debug panel (§4.3).

## M5: Threat and encounters

### Threat units and templates (M5-A)

- 2026-10-28 [§10.5, M5-THREAT-01] TU code is in `src/ship/threat.ts`, not `ship/stats.ts`. Reason: TU needs the Raider reference ship from `loadouts.json`; `stats.ts` stays free of loadout lookups. Values in `balance.json` `threat`.
- 2026-10-28 [§10.5] TU uses the installed loadout with all modules ON and full repair (power settings do not change TU). Guided weapons use `munitionAgility / (agility + 40)` as their trackFactor (the brief gives trackFactor only for tracking). Point defense has no firepower against ships. Reason: TU rates the ship, not one battle state.
- 2026-10-28 [§10.5, §10.9] Six NPC loadouts change so that TU is within 10% of the §10.5 reference values (the check failed for 6 of 9 after Q-38 and Q-41): Light Freighter trader + Flak Cannon (13.1); Heavy Freighter trader Flak + Mass Driver, Shield M in place of the M fuel tank (27.5; it had 0 TU with only point defense); Pirate Gunship + Armor Plating M (35.6); Patrol Cutter Autocannon in place of point defense (36.0); Pirate Corvette Autocannon in place of point defense, tier-3 Mass Drivers, Armor Plating S in place of the Radiator, tier-2 Shield M (54.0); Battleship Mass Driver in place of the Flak Cannon, tier-2 Heavy Cannons (139.3). Reason: §10.9 TU reference check; loadouts are data, the templates do not change. Template TU values are all within 10% of §10.6.
- 2026-10-28 [§10.5-§10.8] Budget, boldness, odds limits, patrol budget, threat band limits (Q-18), reinforcement, security changes, and daily drift are in `security.json`. Templates (pirate, trader, escort, patrol) are in `templates.json`; encounter chances, Hunt multiplier, flee chance (Q-15), and tribute share (Q-17) are in `encounters.json` (Q-15 said `balance.json`; one file for encounter values is clearer).
- 2026-10-28 [Q-04 interim] Patrol templates: Patrol Cutter (36 TU), Cutter Pair (83), Corvette and Cutter (91; the corvette is the Ballistic Corvette), Corvette Group (150; the §10.8 Secure group). With the §10.6 selection on the patrol budget: Low and Medium get a Cutter, High and Secure get a Cutter Pair or a Corvette and Cutter.
- 2026-10-28 [§10.6] Escort templates: the pirate templates allowed in the sector, on 0.5 x the pirate budget, with Raiders swapped for Escort Wasps (`templates.json` `escort.loadoutSwap`).
- 2026-10-28 [Q-45, default] The §10.9 check "median group TU of 10,000 generated encounters is in the §10.5 range" fails for 3 of 15 security and development levels, also with the brief's own values: the template ladder has steps (10, 23, 36, 39...), so in Medium Core (budget 13-31) the Lone Raider (10) is the median. The gate is now the mean group TU (15 of 15 in range); the median is a report. Reason: the mean shows that encounters fit the budget; the median shows only the ladder step. Owner may prefer new filler templates instead (they need new loadouts: a Wasp cannot reach 15 TU with upgrades).

### Guided munitions and point defense (M5-B)

- 2026-10-28 [§12.4] A munition does not move in the turn of its launch; it moves from the next munition step. Reason: §12.4 "it does not hit in the same turn"; this also gives point defense and flak a turn to act.
- 2026-10-28 [§12.4] A launch needs the target within the weapon range (Chebyshev distance between nearest cells), not a line of fire. The munition starts on the first open cell next to the launcher on the line to the target. Reason: guided weapons fly around asteroids (§12.1 "can follow targets").
- 2026-10-28 [§12.4] Munition path: shortest 8-direction path to a cell next to the target footprint, around asteroids; ships do not block munitions. If the target is destroyed or flees, the munition is removed. Life goes down by 1 after each move. Reason: §12.4 says "around asteroids with A*"; a breadth-first search gives the same shortest path on this grid.
- 2026-10-28 [Q-44] Point defense checks at the munition's start cell and at each cell of its move: each point defense module of a ship hostile to the munition's owner, within range 3, with shots left this turn (2), fires one shot (50%, 10 damage, heat 1 per shot). A munition at 0 HP is destroyed. Point defense does not need line of fire, and it defends any ship near it (not only the target).
- 2026-10-28 [§12.2] Flak destroys the munitions of hostile ships in its 3 x 3 area when it fires at a ship; it cannot aim at a munition. Reason: §12.2; flak has no munition target order in the brief.
- 2026-10-28 [§7.4, M5-GUIDE-05] Ammunition is on the installed module (`ammo`; missing = full). Price per round in `modules.json` (`ammoPrice`): missile 40 cr, torpedo 300 cr. The Mechanic refills whole rounds after hull, engine, and armor, as far as credits allow. Reason: the brief gives no ammunition price.

### Encounters, hail, loot, reinforcements, security, notoriety (M5-C, M5-D, M5-E)

- 2026-10-28 [§10.4] A sector trip rolls one encounter at a random point between 20% and 80% of the trip; the fleet stops there (time and fuel for that share) and is in space. The target stays selected, so Enter goes on with the trip. A jump rolls on arrival at the jump point. Rolls use the `encounter` RNG stream. Tools (`sim-trader`) travel with encounters OFF unless they ask for them. Reason: §10.4 gives chances "per sector trip" and "on sector arrival", not the place.
- 2026-10-28 [§8.8] Hunt (key H on the sector map, in space or at a jump point): 1 day, the fuel of 1 day of cruise (cruise distance = cruiseFactor x move), pirate chance per trip x 3. Refused when docked.
- 2026-10-28 [§10.7] Pirate odds use the flagship TU, at least 1 (a ship with no weapons has 0 firepower).
- 2026-10-28 [§10.8, M5-ENC-03] Trader cargo: the two goods with the highest stock against target at the nearest location, at its sell price, filling the hold (the first 50%-80%). Escort ships have the trader faction (a loss against them destroys; they are not pirates).
- 2026-10-28 [Q-15] A failed flee: the battle starts and the enemy acts first (one turn in which the player gives no orders). A successful flee uses mass^exp x kFlee fuel for each ship.
- 2026-10-28 [§13.1] Battle map templates (`battleMaps.json`): the nearest location within 6 sector cells selects the template by body type (Desert, Volcanic, Ice planets and Mining Stations: Asteroid Field; other stations: Debris Field; Gas Giants: Gas Giant Edge); else Open Space (jump points, open space). Fill values: Open Space 0.35 (about 3% obstacles), Debris Field 0.44 (13%, all debris), Asteroid Field 0.47 (19%, all asteroids), Gas Giant Edge 0.35 plus a 4-8 cell debris band on the top or bottom edge. Reason: §13.1 obstacle shares; measured over 40 maps.
- 2026-10-28 [§13.7] A destroyed ship drops one pod with 30%-60% (floor) of each commodity on its first footprint cell. A ship collects a pod when its footprint covers the pod's cell at any step of a move, as far as its hold allows. After a win, the player also takes the cargo of the pods left on the map and of ships that surrendered, as far as it fits. Reason: the battle ends when the other side is gone, so the player could not reach pods after the last kill.
- 2026-10-28 [Q-24] A Pirate Haven buys all cargo at 70% (`pirateHaven.cargoBuyShare`) of its local sell price; a commodity that it does not trade sells at 70% of the base price.
- 2026-10-28 [§13.5] Reinforcements roll after the other ships and munitions, from turn 3, once per type. A patrol joins the side against the pirates if pirates are in the battle; else against the aggressor. Reason: a player who pursues pirates is the aggressor (§13.4), but a patrol must not attack the player for hunting pirates. Ships arrive at a random map edge (the nearest free anchor). The art's `reinforcement_arrival` effect (a "row" frame) is not drawn yet; the log shows the arrival.
- 2026-10-28 [§13.8] Patrol AI: like the Attack AI (nearest hostile ship, best range, no retreat); an escort does not move to a cell more than 6 cells from its trader. Evader AI: moves to the nearest edge and flees there; it fires when in range; morale 60% (engine value 0 or hull below 25%).
- 2026-10-28 [§10.3] Security changes apply to the battle's sector for every pirate ship destroyed or surrendered in the battle (also by a patrol on the player's side). The daily drift and a 30-day history (trend arrow) are part of the daily tick.
- 2026-10-28 [§15, Q-21] Notoriety: Attack on the hail screen (trader or patrol) +15 and security -4/-0.5; each non-pirate ship destroyed on the other side +10; each pirate destroyed or surrendered -3; a patrol reinforcement after the player attacked +10; -0.3 per day. Docking refusal: Suspect in Secure sectors, Wanted in High and Secure sectors; Pirate Havens accept all. A trip to a refusing location is refused. The tow skips refusing locations; if all refuse, the tug goes to the nearest one (an emergency tow).
- 2026-10-28 [§17.2, Q-18] The region map shows each sector's threat band (1-5 `!` under the name, color `sec[5-n]` of `style.json`: the color of security level 5 - n) and a trend arrow; the sector panel shows the band and the TU range. The hail screen shows the group's band (the same limits on the group TU).
- 2026-10-28 [§4.3, M5-ENC-12] Debug panel: E starts an encounter with any pirate or patrol template, or a trader (through the hail screen); S sets the sector's security level (value = level minimum + 10).

### Tools and checks (M5-F)

- 2026-10-28 [§13.9] `sim-combat` pairings for the family roles: Ballistic and Laser Gunship each against 3 Raiders (the "Wasp-heavy enemy"; lasers must win more often); Laser and Ballistic Corvette each against a Pirate Frigate (ballistics must win more often); Laser and Torpedo Frigate each against a Battleship (torpedoes must win more often). "More often" = at least 1 point more. Reason: §13.9 names the builds and the enemy, not the setup.
- 2026-10-28 [§10.9] TU calibration pairs (single ship vs a pirate group within 10% TU; both sides use the Attack AI so that the Raider retreat rule does not bias the group): Pirate Gunship vs Raider Pack; Patrol Cutter vs Raider Pack; Pirate Corvette vs Gunship + Raider; Pirate Frigate vs Gunship Escort; Battleship vs Frigate + Gunship + Raider.
- 2026-10-28 [§10.4, Q-26] One encounter roll per sector trip: a trip that goes on after an encounter to the same destination does not roll again (`Actor.tripRolled`). Reason: without this, each restart rolled again (2,901 encounters on 3,113 trips in `sim-trader`).
- 2026-10-28 [M5-TOOL-04] `sim-trader --encounters`: the bot is a careful trader (ignore traders, friendly patrols, and pirates that avoid; flee from pirates that demand tribute or attack and from hostile patrols; fight with the Attack AI if the flee fails; `tools/lib/encounterBot.ts`). Reason: paying tribute (half the cargo) loses more on average than a 50% flee and an even fight.
- 2026-10-28 [M3 exit check 1] The bot's target loadout is `light_freighter_starter` (the old trader loadout: pulse laser, reactor, fuel tanks, engine M, Cargo Rack L). Reason: the NPC trader loadout has a Flak Cannon now (for TU, M5-A); with it, the upgrade cost more and the median day went from 91 to 114.
- 2026-10-28 The end of a battle (loot, consequences, defeat, tow) is in `src/career/battleEnd.ts`, headless, for the UI and the tools.

## Cuts

None.
