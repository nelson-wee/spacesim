# M1 (Day 1): Foundation, world topology, and travel

**Goal:** A player starts a new game from a seed. The player sees the region map and the sector map, travels in a sector, and jumps between sectors. Fuel goes down. At 0 fuel, the ship is towed. The build deploys to GitHub Pages.

**Brief sections:** §0, §4, §4.1–4.3, §5, §6.1–6.5, §8.1–8.4, §8.6, §11.3–11.4 (part), §11.8, §17.1 (1–3, 12), §17.2, §17.5, §17.7 (seed and `saveVersion` only).

**Depends on:** nothing.

See [README.md](README.md) for the requirement format and the global requirements (G-01 to G-19).

---

## 1. Project setup (SET)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M1-SET-01 | Make a Vite + TypeScript (`strict`) project with rot.js and Vitest. | §4 | I |
| M1-SET-02 | Use the folder layout in §4.1. Add a file only when a milestone needs it. | §4.1 | I |
| M1-SET-03 | Add these npm scripts: `dev`, `build`, `test`, `typecheck`, and one script for each tool in `/tools`. | §4.1 | S |
| M1-SET-04 | The tools in `/tools` must run in Node with no browser (for example, with `tsx`). They must import the simulation code from `/src`, not a copy. | §0.5 | S |
| M1-SET-05 | Add a GitHub Actions workflow. On a push to `main`, it runs `typecheck`, `test`, and `build`, then deploys `dist/` to GitHub Pages. | §4 | M |
| M1-SET-06 | Set the Vite `base` path for GitHub Pages (`/spacesim/`). | §4 | M |
| M1-SET-07 | Add a second workflow (or job) that runs `typecheck` and `test` on pull requests. | §0.8 | M |

## 2. Core systems (CORE)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M1-CORE-01 | `core/rng.ts` wraps one seeded RNG. It gives named streams made from the seed (world, economy, encounter, combat, contracts, UI). Each stream state is serializable. | §0.6, Q-08 | T |
| M1-CORE-02 | `core/types.ts` defines `GameState`, `Actor`, `Ship`, `Sector`, `Lane`, `Location`, and the clock. `GameState` contains `seed` and `saveVersion`. | §4.2, §17.7 | I |
| M1-CORE-03 | An `Actor` has `fleet: Ship[]`, `flagshipIndex`, `credits`, `notoriety`, and `position`. In M1, the fleet has 1 ship. | §4.2, App. B | I |
| M1-CORE-04 | A `Ship` has `hullId`, installed modules by slot, `cargo`, `fuel`, `hullHp`, `armorHp`, `engineValue`, and module power state. Cargo and fuel belong to the ship, not to the actor. | §4.2 | I |
| M1-CORE-05 | `core/clock.ts` keeps time in days, with fractions. When time passes, it calls the economy tick one time for each whole day that it crosses. In M1, the tick is a stub. | §8.1 | T |
| M1-CORE-06 | `core/eventBus.ts` sends simulation messages (for example, "arrived", "towed") to the UI and to the log. | §4.1 | T |
| M1-CORE-07 | `GameState` survives a JSON round trip with no change (deep-equal test). | §4.2 | T |

## 3. Data files (DATA)

All data schemas are a Day 1 item (§19). Each file has a TypeScript type and a load-time check (G-18).

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M1-DATA-01 | Make all data files in §4.1. Each file has a schema. Files that later milestones fill can be empty lists or objects now. | §4.1, §19 | T |
| M1-DATA-02 | `balance.json` contains: sector count range (8–12, default 10), map size (66 × 34), Poisson-disc minimum distance (8), lanes per sector (1–4), body counts (3–6, planets 1–4, stations 1–3), orbit ring data, `cruiseFactor`, `jumpFactor`, `k_sector`, `k_jump`, `k_dock`, `M_REF` (10), `engineStackFalloff` (1.0), `recoveryBase`, `recoveryPerDistance`, recovery fuel share (0.25), full-tank fee share (0.20), `maxFleetSize` (4), `fuelPerHydrogen`, and `fuelMassExponent` (Q-01). | §6, §8, §11 | T |
| M1-DATA-03 | `bodyTypes.json` contains the planet types with weights by development level, gravity, and atmosphere (§6.5), and the station types (§7.2). | §6.5, §7.2 | T |
| M1-DATA-04 | `names.json` contains syllable tables for sector and location names. | §6.3 | T |
| M1-DATA-05 | `commodities.json` contains the 12 commodities with tier, base price, and mass per unit (§9.1). | §9.1 | T |
| M1-DATA-06 | `recipes.json` and `population.json` contain the tables in §9.3, §9.4, and §9.5 (`machineryPerBatch`). | §9.3–9.5 | T |
| M1-DATA-07 | `hulls.json` contains all 8 hulls (§11.1), with art text blocks (§18.1). | §11.1, §18.1 | T |
| M1-DATA-08 | `modules.json` contains at least the modules of the starting ship (Engine S, Reactor S, Shield Generator S, Cargo Rack M, Fuel Tank M, Pulse Laser S). The full list is an M3 item. | §11.7, §11.8 | T |
| M1-DATA-09 | `security.json` contains the security levels (§10.1) and the baseline values (§6.4). The effects table (§10.2) can come in M2 and M5. | §6.4, §10.1 | T |

## 4. World generator, steps 1–3 (GEN)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M1-GEN-01 | Place N sectors (N from `balance.json`, range 8–12) on a 66 × 34 area with Poisson-disc sampling, minimum distance 8. | §6.3 | T |
| M1-GEN-02 | Make a minimum spanning tree of the sectors. All sectors must be connected. | §6.3 | T |
| M1-GEN-03 | For each sector, add a lane to its nearest sector that it does not connect to yet. Do not add a lane that crosses a lane. | §6.3 | T |
| M1-GEN-04 | Each sector has 1 to 4 lanes. If the tree gives more than 4, sample positions again in the same try. | §6.3, Q-27 | T |
| M1-GEN-05 | Make sector and location names from the syllable tables. Names in one world are unique. | §6.3 | T |
| M1-GEN-06 | The core is the sector nearest to the map center. Development level by jumps from the core: 0–1 Core, 2 Middle, 3+ Frontier. | §6.4 | T |
| M1-GEN-07 | If the region has no Middle or no Frontier sector, change the farthest sector to Frontier, then the next farthest to Middle. | §6.4 | T |
| M1-GEN-08 | Tech level of a location: Core 3, Middle 2, Frontier 1. (The +1 for Shipyard Stations and Trade Hubs is an M2 item.) | §6.4 | T |
| M1-GEN-09 | Security baseline: 90 at the core, −20 for each jump, ±10 random, minimum 5. The security value starts at the baseline. | §6.4 | T |
| M1-GEN-10 | Each sector map is 66 × 34. The star is at the center. Place 3 to 6 bodies on orbit rings: 1 to 4 planets and 1 to 3 station slots. | §6.5 | T |
| M1-GEN-11 | Select planet types with the weights for the sector development level. | §6.5 | T |
| M1-GEN-12 | Place one jump point for each lane on the outer ring. Its angle points to the connected sector on the region map. | §6.5 | T |
| M1-GEN-13 | Each body is a `Location` (§7.1) with `kind`, `bodyType`, `techLevel`, and `gravity`. In M1, it has no producer and no population. Station slots have no station type yet. | §7.1 | T |
| M1-GEN-14 | The same seed gives a deep-equal world. Two different seeds give different worlds. | §0.6, §6.2 | T |
| M1-GEN-15 | Select a start location in the core sector. (The Outfitter and Merchants' Guild rule is an M2 item.) | §11.8 | T |

## 5. Ship stats, part 1 (SHIP)

This is the part of `ship/stats.ts` that travel needs. M3 completes it.

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M1-SHIP-01 | Calculate `mass = hull.mass + sum(module.mass) + cargo mass`. | §11.3 | T |
| M1-SHIP-02 | Calculate total thrust of engines that are ON, TWR, `speedIdx`, and `move` with the formulas in §11.4. Apply `engineStackFalloff`. | §11.4 | T |
| M1-SHIP-03 | Calculate `engineFuelRate` as the thrust-weighted average of installed engines. | §8.2 | T |
| M1-SHIP-04 | Calculate fuel capacity (sum of Fuel Tanks) and cargo capacity in tonnes (sum of Cargo Racks). | §11.7, Q-10 | T |
| M1-SHIP-05 | Test: starting Shuttle, empty, gives mass 28 t, TWR 1.07, `move` 4. With 20 t cargo: mass 48 t, `move` 3. | §11.4 | T |
| M1-SHIP-06 | The new game creates the starting ship of §11.8 (Shuttle with its loadout), 2,000 credits, full fuel, docked at the start location. | §11.8 | T |

## 6. Travel, time, and fuel (TRV)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M1-TRV-01 | Travel in a sector: distance is the straight distance on the sector map. Time = `distance / (cruiseFactor × move)`. | §8.2 | T |
| M1-TRV-02 | Fuel for sector travel = `distance × mass^e × k_sector × engineFuelRate`, where `e` = `fuelMassExponent` (Q-01). | §8.2, Q-01 | T |
| M1-TRV-03 | For a fleet, the ship with the lowest `move` sets the time. Each ship uses its own fuel with its own mass. | §8.2 | T |
| M1-TRV-04 | A jump starts only at a jump point. Lane length = straight distance between the two sectors on the region map. Jump time = `laneLength / (jumpFactor × move)`. Jump fuel = `laneLength × mass^e × k_jump × engineFuelRate`. | §8.3 | T |
| M1-TRV-05 | After a jump, the fleet is at the matching jump point in the new sector. | §8.3 | T |
| M1-TRV-06 | Docking uses `gravity × mass^e × k_dock` fuel. Undocking is free. Stations and Gas Giants have gravity 0. | §8.4 | T |
| M1-TRV-07 | Before a trip, the UI shows the fuel of the ship with the lowest range. If the fuel is not sufficient, the UI shows a warning. The UI does not stop the trip. | §8.6 | M |
| M1-TRV-08 | If fuel goes to 0 during a trip, the ship stops at that point (Q-11). The full fleet is towed to the nearest location (Q-12). | §8.6 | T |
| M1-TRV-09 | Recovery fee for each ship with 0 fuel = `recoveryBase + recoveryPerDistance × distance + 0.20 × full-tank price`. In M1, the full-tank price uses the Hydrogen base price. Each towed ship then has 25% fuel. | §8.6 | T |
| M1-TRV-10 | If the credits are not sufficient for the fee, the location buys cargo at its sell price to pay. If this is not sufficient, the credits go below 0 (debt). In M1, use base prices for cargo. | §8.6 | T |
| M1-TRV-11 | Tune `k_jump` so that the starting ship, empty, with a full tank, can do 4 to 6 jumps on lanes of average length. | §8.7, §22 | T |

## 7. Display, maps, and screens (UI)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M1-UI-01 | `render/display.ts` makes a rot.js `Display` of 100 × 40 cells with a monospace font. | §4 | M |
| M1-UI-02 | `render/palette.ts` contains all colors. Location colors by tech level: 1 grey, 2 white, 3 cyan. | §17.2, §18.2 | I |
| M1-UI-03 | Title screen: New game (with seed input; a blank input gives a random seed), Continue (inactive until M7), Help. The screen shows the seed. | §17.1, §4.3 | M |
| M1-UI-04 | Region map: each sector is a `*` in its star color. Lanes are lines of `.`. A number shows the security level. The player position shows. (Threat band and trend arrow are M5 items.) | §17.1, §17.2 | M |
| M1-UI-05 | Sector map: star `*` at the center, orbit rings with `.`, planets `o` (size 1) or `O` (size 2–3), stations `#` or the first letter of the type, jump points `%`, player `@` in a bright color. | §17.2 | M |
| M1-UI-06 | The player selects a sector or a location with the keyboard or the mouse. The UI shows distance, time, and fuel for the trip before the player confirms. | §17.5 | M |
| M1-UI-07 | `Esc` goes back one screen. `?` shows help for the screen (help text can be short in M1). All actions show their key on screen. | §17.5 | M |
| M1-UI-08 | Log screen: the full message history from the event bus. | §17.1 | M |
| M1-UI-09 | A status bar shows the day, credits, fuel, and position. | §17.1 | M |

## 8. Debug tools (DBG)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M1-DBG-01 | `F12` or `~` opens the debug panel in development builds only. | §4.3 | M |
| M1-DBG-02 | Debug actions: add credits, set fuel, teleport to a location, skip N days, show the seed. | §4.3 | M |
| M1-DBG-03 | Later milestones add: show all prices (M2), set sector security (M5), start a test battle (M4, M5), spawn a contract (M7). | §4.3 | I |

## 9. Tests (minimum)

- RNG: the same seed gives the same sequence. Streams are independent.
- Generator steps 1–3: sector count, minimum distance, all sectors connected, 1–4 lanes, no lane crossings, development levels exist, baseline formula, body counts, one jump point per lane.
- Determinism: the same seed gives a deep-equal world.
- Ship stats part 1: mass, TWR, `move`, fuel rate.
- Travel: time and fuel for sector travel, jumps, and docking. A fleet uses the slowest ship.
- Tow: fee formula, 25% fuel, cargo sale, debt.
- Clock: one economy tick for each whole day crossed.
- `GameState` JSON round trip.
- All data files load and pass their checks.

## 10. Exit checks

| # | Check | Source | Verify |
|---|---|---|---|
| 1 | The same seed gives the same world. | §19 | T |
| 2 | The player can travel in a sector and jump between sectors. | §19 | M, T |
| 3 | Fuel goes down when the player travels. | §19 | T |
| 4 | A tow happens at 0 fuel. | §19 | T |
| 5 | The build runs on GitHub Pages. | §19 | M |
| 6 | The data model has a fleet (list of ships) for each actor. | §19 | I |
| 7 | `PROGRESS.md` is updated. | §0.9 | I |

## 11. Open questions for this milestone

Q-01 (fuel and mass), Q-08 (RNG streams), Q-10 (fuel and cargo capacity), Q-11 (stop point), Q-12 (tow destination), Q-27 (lane count). See [README.md](README.md#8-open-questions-conflicts-and-gaps-in-the-brief).

## 12. Not in this milestone

Producers, population, markets, services, prices (M2–M3). Map knowledge (M3). Encounters (M5). Save and load (M7).
