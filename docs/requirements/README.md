# MVP Requirements: Space Trucking Sim

- **Source:** [Design Brief v2.3](../design-brief.md) (locked for MVP, 2026-10-23)
- **Status:** Scoped. No milestone has started.
- **Writing style:** ASD-STE100

This folder breaks the design brief into requirements for each milestone in Section 19 of the brief. The brief is the authority. If this folder and the brief do not agree, the brief is correct, except where an open question below records a different decision.

## 1. How to use these files

1. Start each milestone with its file. Do the requirements in the order of the file.
2. Do not start a milestone before the previous milestone passes all of its exit checks (brief Section 0, item 1).
3. When you make a decision that the brief does not give, write it in [`DECISIONS.md`](../../DECISIONS.md) with one line of reason.
4. At the end of each milestone, update [`PROGRESS.md`](../../PROGRESS.md).
5. If a milestone is late, use the Cut list (brief Section 20). Write each cut in `DECISIONS.md`.

## 2. Milestone files

| File | Day | Scope | Main exit checks |
|---|---|---|---|
| [M1-foundation.md](M1-foundation.md) | 1 | Project setup, deploy, display, RNG, data schemas, generator steps 1–3, maps, travel, fuel, tow | Same seed gives same world. Travel and jumps work. Tow at 0 fuel. Build runs on GitHub Pages. |
| [M2-economy.md](M2-economy.md) | 2 | Generator steps 4–9, economy tick, `gen-report.ts`, `sim-economy.ts` | Sections 6.11 and 9.13 pass. Recipe and wear tests pass. |
| [M3-trade-and-ships.md](M3-trade-and-ships.md) | 3 | Services, Trade Ledger, map knowledge, hulls, modules, loadouts, stats, Outfitter, Shipyard, `sim-trader.ts`, `ship-report.ts` | Trader bot buys a Light Freighter on day 60–120 on 15 of 20 seeds. Section 11.4 values (±1). All default loadouts are valid. |
| [M4-combat-core.md](M4-combat-core.md) | 4 | Grid, footprints, movement, power, heat, lasers, ballistics, flak, damage, engine targeting, Raider and Trader AI, `sim-combat.ts` | Win, lose, and flee against 1–3 Raiders. First two pairings in 13.9 pass. |
| [M5-threat-and-encounters.md](M5-threat-and-encounters.md) | 5 | Guided munitions, point defense, threat units, budget, templates, encounters, hail, reinforcements, Patrol and Evader AI, map templates, Hunt, loot, security, notoriety | All pairings in 13.9 pass. Section 10.9 passes. Patrols fight the aggressor. Pirate kills raise security. |
| [M6-fleet.md](M6-fleet.md) | 6 | Fleet of up to 4 ships, prize ships, upkeep, Fleet screen. **Feature freeze.** | 4-ship fleet travels, trades, refuels. Flagship loss works. Prize ship joins. 2-ship trader earns more than 1 ship. |
| [M7-contracts-career-save.md](M7-contracts-career-save.md) | 7 | Contract generator, bounties, standing, market events, career end, score, save and load, balance pass | Section 14.9 passes. Full career to day 730 runs. Save and load give the same state. |
| [M8-polish-and-release.md](M8-polish-and-release.md) | 8 | Codex, help, animation polish, damage and heat display, bug fixes, final deploy | No known crash bugs. All acceptance checks pass. |

## 3. Requirement format

Each requirement has an ID, a statement, a source, and a verification method.

- **ID:** `M<milestone>-<AREA>-<number>`, for example `M2-ECON-04`. Global requirements use `G-<number>`.
- **Statement:** "must" gives a requirement. "Should" gives a recommendation.
- **Source:** the section of the brief, for example `§9.7`. `Q-nn` refers to an open question in Section 8 of this file.
- **Verify:**

| Code | Method |
|---|---|
| T | Unit test in `/tests` (Vitest) |
| S | Headless tool in `/tools` (simulation or report) |
| M | Manual check in the browser |
| I | Inspection of code or data |

## 4. Global requirements (all milestones)

These rules come from brief Sections 0, 4, and 4.2. They apply from Day 1 to Day 8.

| ID | Requirement | Source | Verify |
|---|---|---|---|
| G-01 | Build the milestones in the order of Section 19. A milestone starts only after the previous milestone passes its exit checks. | §0.1 | I |
| G-02 | Do not add features from the Parked list (Section 21). | §0.2 | I |
| G-03 | When the brief does not give a detail, use the simplest option. Write each decision in `DECISIONS.md` with one line of reason. | §0.3 | I |
| G-04 | All numbers that need tuning must be in `/data/*.json`. Logic code must not contain tuning numbers. | §0.4 | I |
| G-05 | The simulation must run headless in Node, with no browser and no DOM. Only `/src/render` and `/src/ui` can use the browser. | §0.5, §4.2 | T, I |
| G-06 | All random results must come from the seeded RNG in `core/rng.ts`. Do not use `Math.random`. The same seed must give the same world and the same economy. | §0.6, Q-08 | T |
| G-07 | All services, travel, fuel, market, and ship rules must take an `Actor` as input, not "the player". Write them for "each ship in the fleet". | §0.7, §4.2 | I |
| G-08 | Write tests for economy formulas, generator constraints, ship stat formulas, loadout rules, and combat damage rules. | §0.8 | T |
| G-09 | Update `PROGRESS.md` at the end of each milestone: what works, what does not work, known bugs. | §0.9 | I |
| G-10 | The game state must be one plain serializable object (`GameState`). It must survive a JSON round trip with no change. | §4.2 | T |
| G-11 | The simulation changes `GameState`. The renderer only reads it. | §4.2 | I |
| G-12 | Do not store derived ship stats. `ship/stats.ts` calculates them from hull, modules, cargo, and module power state. | §4.2 | I |
| G-13 | The combat resolver resolves one full turn and returns a list of effects. The renderer plays the effects as animation. | §4.2 | T |
| G-14 | TypeScript must use `strict` mode. The project uses Vite, rot.js, and Vitest. | §4 | I |
| G-15 | The display is a rot.js `Display` of 100 × 40 cells, with a monospace font. Use standard ASCII and a small set of box-drawing characters. Do not use wide Unicode characters. | §4 | M |
| G-16 | The debug panel and its tools must be in development builds only. | §4.3 | I |
| G-17 | Extend the debug panel and the `/tools` scripts in each milestone (Section 4.3). | §4.3 | I |
| G-18 | Each data file must have a TypeScript type and a load-time check. A unit test must load and check all data files. | §0.4 | T |
| G-19 | `npm test` and `npm run build` must pass before each commit to the main branch. | §0.8 | S |

## 5. Items that Section 19 does not put on a day

The brief has some in-scope items that Section 19 does not list. This plan puts them here:

| Item | Brief section | Milestone | Reason |
|---|---|---|---|
| Title screen with seed input | §17.1 (1), §4.3 | M1 | The seed must show from Day 1. "Continue" works from M7. |
| Log screen (message history) | §17.1 (12) | M1 | Travel and tow messages need a log. |
| Debt rules for the tow fee | §8.6 | M1 | The tow is in M1. |
| Debt rules for purchases | §8.6 | M3 | Purchases start in M3. |
| Map knowledge and price information rules | §9.12 | M3 | They go with the Merchants' Guild and the Trade Ledger. |
| Route view on the maps | §17.2 | M3 | It goes with the Trade Ledger. |
| Wait action | §8.8 | M3 | It goes with the Location screen. Upkeep is added in M6. |
| Food loss in cargo (1% per day) | §9.1 | M3 | Cargo starts in M3. |
| Tech level limits on hulls and modules | §7.3 | M3 | Outfitter and Shipyard are in M3. |
| Daily security drift and 30-day trend arrow | §10.3 | M5 | Security changes are in M5. |
| Mechanic refills guided munitions | §7.4 | M5 | Munitions are in M5. |
| Pirate Haven buys cargo at 70% and accepts all notoriety | §7.4 | M5 | Notoriety is in M5. |
| Bounty Guild service | §7.4, §14.5 | M7 | Bounties are in M7. |
| Named pirate encounters | §10.4, §14.6 | M7 | Named bounties are in M7. |
| Retire action | §16 | M7 | Career end is in M7. |
| Basic combat effects (laser, ballistic, explosion, shield hit) | §18.4 | M4 | The combat screen needs them to be readable. |

## 6. Work that this plan moves to an earlier milestone

Some milestones need a part of a later system. Build only the part that is necessary.

| Need | Milestone | Part to build early | Full system |
|---|---|---|---|
| Travel needs `move`, mass, and fuel rate. | M1 | `ship/stats.ts`: mass, thrust, `move`, engine fuel rate, fuel capacity, cargo capacity. Hull and module data for the starting ship. | M3 |
| The recovery fee needs the local Hydrogen price. | M1 | Use the Hydrogen base price. | M2 (market price), M3 (Refuel) |
| A player in M1 needs fuel after a tow. | M1 | Optional: a simple Refuel at the Hydrogen base price, or the debug panel "set fuel". | M3 |
| Trend arrows need price history. | M2 | The economy keeps daily prices for at least 30 days. | M3 (display) |
| `sim-combat.ts` uses AI for both sides, also for the player ship. | M4 | A generic "attack" AI for the player side. | M5 (Patrol AI reuses it) |
| Battles must end when a ship gives up. | M4 | Morale checks and a "surrendered" ship state. | M5 (loot) |
| The Shipyard in M3 has a fleet of one ship. | M3 | Trade-in replaces the only ship. | M6 (a new hull joins the fleet) |

## 7. Acceptance check traceability

Section 23 of the brief says that all these checks must pass.

| Check | Brief section | First milestone | Tool or test |
|---|---|---|---|
| 95 of 100 seeds pass with 2 tries or fewer | §6.11 | M2 | `tools/gen-report.ts` |
| Starting ship does 4–6 jumps on a full tank, empty | §8.7, §22 | M1 (tune), M3 (confirm) | `tools/ship-report.ts`, test |
| Laden Heavy Freighter uses about 3× the fuel per jump of an empty Shuttle | §8.7 | M3 | `tools/ship-report.ts`, test (see Q-01) |
| Economy checks (clamp, stock, output, gradient, routes, raw gaps, chain shock, capital) | §9.13 | M2 | `tools/sim-economy.ts` |
| TU reference values (±10%) | §10.9 | M5 | `tools/ship-report.ts` |
| TU calibration: single ship vs equal-TU group wins 35%–65% | §10.9 | M5 | `tools/sim-combat.ts` |
| Median generated group TU is in the budget range | §10.9 | M5 | test or `tools/sim-combat.ts` |
| Speed and maneuver reference values (±1) | §11.4, §19 | M3 | `tools/ship-report.ts`, test |
| Combat pairings | §13.9 | M4 (first two), M5 (all) | `tools/sim-combat.ts` |
| Contract checks | §14.9 | M7 | `tools/sim-economy.ts`, test |
| Milestone checks | §19 | M1–M8 | See each milestone file |

## 8. Open questions (conflicts and gaps in the brief)

The scoping found these conflicts and gaps. Each has a **proposed default**. If the owner does not change a default, the build uses it, and the milestone that uses it writes it in `DECISIONS.md`.

### 8.1 Conflicts

| ID | Issue | Proposed default | Milestone |
|---|---|---|---|
| Q-01 | **Fuel check.** §8.2–8.3 make fuel linear in mass. A laden Heavy Freighter (156 t) then uses 5.6× the fuel of an empty Shuttle (28 t). §8.7 expects about 3×. | Add `fuelMassExponent` to `balance.json` and use `mass ^ fuelMassExponent` in all fuel formulas. A value near 0.64 gives 3×. The Outfitter example in §17.3 (5.8 → 6.0 for 48 t → 50 t) stays correct. Other option: keep linear fuel and change the check to "about 5×". | M1, M3 |
| Q-02 | **Fuel per Hydrogen.** §9.1 says "1 fuel unit uses `fuelPerHydrogen` units of Hydrogen" and "fuel price = Hydrogen price ÷ `fuelPerHydrogen`". These two rules do not agree. | 1 unit of Hydrogen gives `fuelPerHydrogen` units of fuel. Fuel price = Hydrogen buy price ÷ `fuelPerHydrogen`. Refuel removes `fuel ÷ fuelPerHydrogen` Hydrogen from the local stock. | M3 |
| Q-03 | **Commodities per location.** §7.4 puts Refuel at all locations, and Refuel uses the local Hydrogen stock. So all locations trade Hydrogen. A Smelter station with crew then trades 8 commodities (Iron Ore, Hydrogen, Alloys, Machinery, Food, Water, Oxygen, Medicine). §9.2 says 4 to 6. | All locations trade Hydrogen. Change the limit to 4 to 8 commodities. Keep the population table. | M2 |
| Q-04 | **Secure patrol group.** §10.8 gives "2 Cutters + 1 Corvette" for Secure. That group is 173 TU. The Secure patrol budget is 110 × (0.8 to 1.2) = 88 to 132 TU. | Keep the budget. Patrols use the same selection rule as pirates (§10.6). The typical Secure group is then 1 Corvette + 1 Cutter (109 TU). Other option: set `patrolBase` Secure to 145. | M5 |

### 8.2 Gaps

| ID | Issue | Proposed default | Milestone |
|---|---|---|---|
| Q-05 | Target stock for a commodity that a location trades but does not make or use (for example, Hydrogen for Refuel only). | `minTargetStock` per commodity in `balance.json`. | M2 |
| Q-06 | Definition of "region supply/demand ratio" (§6.8, §9.8). | §6.8 (generator): nominal daily output at full inputs and K = K_ref, divided by nominal daily demand. §9.8 (runtime): 30-day average of real output, divided by 30-day average of real use. | M2 |
| Q-07 | Rare Elements need producers in 2 sectors (§6.10). Rare Element Mines are Frontier only. §6.4 guarantees only 1 Frontier sector. | Generator step 2 makes sure that the region has at least 2 Frontier sectors. If it cannot, the try fails and the generator retries. | M2 |
| Q-08 | One RNG for all systems. A UI action that uses a random number changes all later economy results. | One RNG type in `core/rng.ts`. Each system (world, economy, encounters, combat, contracts) gets its own stream, made from the seed and a fixed name. All stream states are in `GameState`. | M1 |
| Q-09 | Weapons (§12.2) have no mass, price, or heat per turn. | Weapon mass S/M/L = 1 / 4 / 10 t. The S value comes from the reference masses in §11.4. Price S/M/L = 2,000 / 6,000 / 18,000. Heat per turn = 0 (weapons make heat per shot only). Tier multipliers apply to weapons; the main value is damage. Tune masses so that default loadouts give the masses in §11.4. | M3 |
| Q-10 | Hulls have no base fuel capacity and no base cargo capacity. | Fuel and cargo capacity come only from Fuel Tanks and Cargo Racks (this agrees with §11.8). | M1 |
| Q-11 | Where the ship stops when fuel goes to 0 during a trip. | The ship stops at the point where fuel reaches 0. Time passes up to that point. The tow distance starts at that point. | M1 |
| Q-12 | "Nearest location with Refuel" for the tow. | Nearest by travel distance in the current sector. During a jump, the nearest location in the destination sector. Skip locations that refuse docking (§15). A Pirate Haven always accepts. | M1, M5 |
| Q-13 | Module sell price at the Outfitter. No module storage, so a removed module must be sold. | 60% of the module price, the same as the Shipyard trade-in (§11.1). | M3 |
| Q-14 | Shipyard trade-in when the old ship has cargo or modules. | Trade-in sells all modules at 60%. The new hull has an empty loadout. The trade-in is blocked while the old ship has cargo. | M3 |
| Q-15 | How "Flee" on the hail screen resolves. | If the flagship `move` is more than the highest enemy `move`, Flee succeeds. If not, Flee succeeds with `fleeChance` (default 0.5, `balance.json`). On success, the flagship uses `mass × k_flee` fuel. On failure, combat starts and the enemy acts first. | M5 |
| Q-16 | Hail options for Trader and Patrol encounters. | Trader: Attack, Ignore. Patrol, player not Wanted: Attack, Ignore. Patrol, player Wanted: Fight, Flee. Attack makes the player the aggressor. | M5 |
| Q-17 | Tribute details: which ship, and in goods or credits. | The pirates select the fleet ship with the highest cargo value. "Pay" removes 50% (rounded down) of each commodity in that ship. If the fleet has no cargo, the pirates attack. | M5 |
| Q-18 | Threat band: how a TU range maps to 1–5 skulls. | Use the budget midpoint (`securityBase × devMult`). Limits in `security.json`: ≤ 15 = 1, ≤ 30 = 2, ≤ 50 = 3, ≤ 80 = 4, more = 5. | M5 |
| Q-19 | "−15% hit chance" for Engine shots: added or multiplied. | Multiply by 0.85. This agrees with the Hot rule (−10% is `heatFactor` 0.9). | M4 |
| Q-20 | Effect of engine damage above 0. | No effect until the engine value is 0 (the brief gives no other effect). | M4 |
| Q-21 | What counts as an "attack" on a non-pirate ship (notoriety +15, security −4). | The player selects Attack on the hail screen, or the player fires at a non-pirate ship that is not hostile. Apply the change once for each battle. | M5 |
| Q-22 | Bounty Guild rule "sectors with security 30+": value or baseline. | Baseline at world generation. Services do not change after generation. | M2 |
| Q-23 | Named bounty TU. Templates have tier-1 TU, but named groups use tier-2 or tier-3 modules. | Select the template with tier-1 TU. Calculate the reward and the threat band with the TU of the upgraded group. | M7 |
| Q-24 | Pirate Haven "buys cargo from piracy at 70%". The MVP has no contraband or stolen-goods flag. | Cargo has no origin flag. A Pirate Haven buys all cargo at 70% of its local sell price. It is useful when other locations refuse docking. | M5 |
| Q-25 | Sim-combat needs AI for the player ship (§13.9). The brief has no player AI. | A generic "Attack" AI: keep the best weapon range, fire at the nearest hostile ship, do not retreat. The Patrol AI in M5 reuses it. | M4 |
| Q-26 | "Encounters: 1 per 3–4 trips" (§22). "Trip" and "encounter" are not defined. | A trip is one dock-to-dock journey. Count pirate encounters only. | M5, M7 |
| Q-27 | The minimum spanning tree can give a sector more than 4 lanes (§6.3 says 1 to 4). | If a sector has more than 4 lanes after step 1, sample the sector positions again in the same try. | M1 |
| Q-28 | Order of moves and shots in the player phase (§13.3). | The player gives orders in any order: move steps and shots. The resolver checks the move budget and the one-shot-per-weapon rule. | M4 |

## 9. Risks

| Risk | Effect | Action |
|---|---|---|
| Days 2 and 3 are full (brief §19). | Later milestones start late. | Use the Cut list early. NPC agents are the first cut. |
| Core sectors may not have sufficient station slots. Composite Works and Electronics Fab need Industrial Stations in Core sectors. Trade Hubs, Habitats, Shipyard Stations, and Military Outposts also use station slots. | Many seeds fail validation. | Track station-slot use in `gen-report.ts` from M2. If needed, set more station slots for Core sectors in `balance.json`. |
| Validation runs the economy for 200 days, up to 20 tries per seed, for 100 seeds. | `gen-report.ts` is slow. | Keep the economy tick fast. Calculate flows only between locations that trade the commodity (§9.7). Measure the tick time in M2. |
| Economy route-margin targets (§9.13) depend on κ, spread, and the price exponent together. | Long tuning time on Day 2. | Use the CSV export (§4.3) from the first economy run. Tune only data. |
| Security target: "about 15 pirate kills raise a sector one level for a long time" (§22). Baseline +0.5 per kill gives +7.5 for 15 kills. One level is 20 points. | The target fails with the first values. | Tune `security.json` in the M7 balance pass. Bounty baseline changes (+1, +2) help. |
| TU calibration and combat pairings use the same data. A change for one check can break another check. | Combat tuning on Day 5 takes long. | Run all `sim-combat.ts` checks together after each change. Tune `groupBonus` and the firepower formula for TU (§10.9). Tune data for pairings (§13.9). |
| The trader bot check on Day 3 runs with no encounters. | Day 3 results can be too optimistic. | Run `sim-trader.ts` again with encounters in M5 and M7. |

## 10. Owner actions

These items need the repository owner. Claude Code cannot do them.

1. **GitHub Pages:** in the repository settings, set Pages "Source" to "GitHub Actions". The Day 1 exit check needs this.
2. **Default branch:** the repository has no `main` branch yet. The deploy workflow runs on pushes to `main`. Merge the first milestone into `main` to start the deploy.
3. **Open questions:** read Section 8. Change a proposed default if you do not agree with it. If you do not change a default, the build uses it.
