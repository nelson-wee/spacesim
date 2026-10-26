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

## Cuts

None.
