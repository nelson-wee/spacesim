# Design Brief: POL@RIS

(The working title was "Space Trucking Sim". The owner named the game POL@RIS on 2026-10-29.)

- **Version:** 2.4 (replaces 2.3)
- **Date:** 2026-10-23
- **Status:** Locked for MVP
- **Timeline:** 8 days (target; not a strict deadline)
- **Writing style:** ASD-STE100 (short sentences, active voice, one meaning per word)

### Changes from version 2.3

- Character set is Code Page 437 (Section 4). This matches the visual brief.
- Art, effects, icons, and palette come from `space-sim-visual-brief.md` (Claude Design output). Load them from data files (Section 18).
- Ship footprints come from the art data. Fleet upkeep uses the hull **size class**, not the footprint size (Section 11.9).

### Changes from version 2.2

- **Threat budget** for encounters (Section 10.5). Sector security and development level set enemy strength. Player strength does not. A stronger player selects more dangerous places and larger targets.
- **Pirates judge the odds** (Section 10.7). Weak pirate groups avoid a strong flagship. The player can pursue them.
- **Contract generator** (Section 14). Contracts come from real economy deficits, surpluses, and security problems: Supply, Freight, Sweep, and Named Bounty.
- **Hunt** and **Wait** actions (Section 8.8).
- Defaults for battle map templates (Section 13.1), map knowledge (Section 9.12), and debug tools (Section 4.3).

### Changes from version 2.1

- **Fleets (flagship only)** are in the MVP. The player can own up to 4 ships. Only the flagship fights. The other ships carry cargo and are backups (Section 11.9).
- Surrendered ships can join the fleet as **prize ships**.
- The plan has 8 days. The fleet work is on Day 6 (Section 19).

### Changes from version 2.0

- 12 commodities in 4 tiers, with **production chains** (recipes) on the backend (Section 9).
- **Hydrogen is ship fuel.** The Refuel price follows the local Hydrogen price.
- **Machinery is capital.** Producers install it. It increases output and wears out slowly (Section 9.5).
- **Background trade flow** moves goods between locations, so the economy runs without NPC agents (Section 9.7).
- NPC trade agents are a **stretch goal** (Section 9.9).
- **Cargo is in tonnes.** Each commodity has a mass per unit.
- The world generator uses a **blueprint pipeline** (constructive, then repair, then reject) (Section 6).
- Sectors have a **development level** (Frontier, Middle, Core). It sets location types and tech level.
- No information decay. Merchants' Guilds give live prices. New **Trade Ledger** screen (Section 17).
- The data model is **fleet-ready**: an actor has a list of ships (one ship in the MVP) (Section 4.2, Appendix B).

### Changes from version 1.0

- Planets and stations are one system: **Locations**. Each location has a market, services, and a tech level.
- The world has **sectors** with locations inside. Security is per sector. Player actions change security.
- Patrols can arrive during combat. They fight against the aggressor.
- Ships are **hull + modules**. Mass, thrust, power, and heat come from the loadout.
- Speed and maneuverability come from non-linear formulas (Section 11).
- Weapons are in three families: lasers, ballistics, guided.
- Fuel is for all travel. If fuel goes to 0, the ship is towed and the player pays a fee.
- Missions come from the Merchants' Guild and the Bounty Guild.
- Removed from MVP: contraband and scans, escort missions, derelicts, bounty hunters.

---

## 0. Instructions for Claude Code

1. Build the milestones in the order of Section 19. Do not start a milestone before the previous milestone passes its acceptance checks.
2. Do not add features from the Parked list (Section 21).
3. If this brief does not give a detail, use the simplest option. Write each decision in `DECISIONS.md` with one line of reason.
4. Put all numbers that need tuning in `/data/*.json`. Do not put tuning numbers in logic code.
5. Keep the simulation separate from the rendering. The simulation must run headless in Node, with no browser.
6. Use one seeded random number generator for all random results. The same seed must give the same world and the same economy.
7. All services and ship rules must work for any **Actor**, not only the player. Later, NPC agents will use the same code (Section 4.2).
8. Write tests for the economy formulas, the generator constraints, the ship stat formulas, the loadout rules, and the combat damage rules.
9. At the end of each milestone, update `PROGRESS.md` with what works, what does not work, and known bugs.
10. If a milestone is late, remove features in the order of the Cut list (Section 20). Do not move the feature freeze.

---

## 1. Pitch

The player is an independent privateer. The player starts with a small ship and a little money. The player can buy cargo cheaply and sell it for more money. The player can hunt pirates for bounties, or become a pirate.

The main decisions are:

- **Where to trade.** Prices are different at each location.
- **How to build the ship.** The player selects a hull and installs modules. Each module adds mass, uses power, and makes heat. A good loadout fits the player's plan.
- **Where to fight.** Pirate kills make a sector safer. Piracy makes a sector more dangerous.

A career has a fixed length of 730 days (2 game years). At the end, the game shows a score and a title.

The feel is *Sid Meier's Pirates!*: short sessions, clear choices, a separate battle screen, and a final score. The visuals are ASCII with animation, similar to *Cogmind*. The ship loadout is a simple version of *Elite Dangerous* outfitting.

---

## 2. Design pillars

1. **Readable trade.** The player can see why a route gives profit.
2. **Loadout is strategy.** There is no best ship. Each module choice has a cost in mass, power, or heat.
3. **Short tactical battles.** Each battle has clear choices and ends in 3 to 15 turns.
4. **A world that reacts.** Prices change when the player trades. Security changes when the player fights.
5. **Finished in about 8 days.** Depth in few systems is better than many shallow systems.

---

## 3. Scope

### 3.1 In scope (MVP)

- World generator: sectors, lanes, locations (planets and stations), names
- Two map views: region map (sectors) and sector map (locations)
- Travel in a sector and between sectors, with time and fuel
- Tow and recovery fee when fuel goes to 0
- Locations with tech level and services: Refuel, Market, Mechanic, Outfitter, Shipyard, Merchants' Guild, Bounty Guild
- Economy simulation: 12 commodities, recipes, population demand, installed machinery, background trade flow, off-map supply
- Trade Ledger screen and live price information from Merchants' Guilds
- Market events
- Sector security that changes with player actions
- Ships: hulls and modules, mass, thrust, power, heat
- Outfitter and Shipyard screens with loadout validation
- Encounters on sector arrival, on travel in a sector, and from the Hunt action
- Threat budget and encounter templates; pirates that judge the odds
- Tactical turn-based combat with power toggles and heat
- Weapons: lasers, ballistics, guided munitions, point defense
- Patrol reinforcements during combat
- Piracy (attack, disable, surrender, loot, prize ships) and notoriety
- Fleet of up to 4 ships: flagship-only combat, shared cargo, backup ships, upkeep
- Contract generator: Supply, Freight, Sweep, Named Bounty; kill bounties
- Career end, score, and titles
- Save and load
- ASCII animation effects

### 3.2 Out of scope (MVP)

- Factions, faction reputation, faction territory
- Player faction and owned locations
- Development and terraforming
- NPC trade agents (stretch goal only, Section 9.9; the code must allow them)
- Fleet combat (all ships on the battle map), wingmen, crew
- Escort missions
- Contraband and scans
- Module storage (modules that are not installed)
- Module damage (only the engine value can take damage)
- Planet surfaces
- Sound

---

## 4. Technology

| Item | Choice |
|---|---|
| Language | TypeScript, `strict` mode |
| Build | Vite |
| Display, RNG, pathfinding | rot.js |
| Tests | Vitest |
| Hosting | GitHub Pages, deploy with GitHub Actions |
| Save | `localStorage`, JSON, with a `saveVersion` number |

**Display:** rot.js `Display`, 100 × 40 cells, monospace font. Use only Code Page 437 characters (ASCII, box drawing, shades, half blocks). All characters are single width. Do not use emoji or wide Unicode characters.

### 4.1 Project layout

```
/src
  main.ts
  core/      rng.ts, clock.ts, eventBus.ts, save.ts, types.ts
  world/     generator.ts, topology.ts, bodies.ts, blueprint.ts,
             assign.ts, validate.ts, repair.ts, location.ts, security.ts
  econ/      economy.ts, recipes.ts, population.ts, capital.ts,
             flow.ts, offmap.ts, prices.ts, info.ts, events.ts
  actor/     actor.ts, fleet.ts, travel.ts, fuel.ts, notoriety.ts,
             agents.ts (stretch)
  ship/      hull.ts, modules.ts, loadout.ts, stats.ts
  services/  refuel.ts, market.ts, mechanic.ts, outfitter.ts,
             shipyard.ts, merchantsGuild.ts, bountyGuild.ts
  encounter/ encounters.ts, threat.ts, templates.ts, hail.ts
  combat/    grid.ts, turn.ts, weapons.ts, munitions.ts, heat.ts,
             power.ts, hit.ts, ai.ts, reinforcements.ts, loot.ts
  career/    contracts.ts, contractGen.ts, standing.ts, score.ts
  debug/     debugPanel.ts
  render/    display.ts, palette.ts, effects.ts, shipArt.ts
  ui/        screens/*.ts, widgets/*.ts, input.ts
/data
  balance.json, commodities.json, recipes.json, population.json,
  bodyTypes.json, producerTypes.json, services.json,
  hulls.json, modules.json, loadouts.json, events.json,
  encounters.json, templates.json, contracts.json, battleMaps.json,
  security.json, names.json
/tools
  gen-report.ts      generates 100 seeds and prints blueprint ratios and rule results
  sim-economy.ts     headless economy test
  sim-trader.ts      headless greedy trader bot
  sim-combat.ts      headless auto-battle test
  ship-report.ts     prints derived stats and threat units for all hulls, loadouts, and templates
/tests
```

### 4.2 Architecture rules

- The game state is one plain serializable object (`GameState`). Save and load write and read this object.
- The simulation changes `GameState`. The renderer only reads it.
- **Actor model.** The player is one `Actor`. An actor has a **fleet** (a list of ships), a flagship index, credits, notoriety, and a position. In the MVP, the fleet has 1 to 4 ships (Section 11.9). Cargo and fuel belong to each ship, not to the actor. Write all travel, fuel, market, and service code for "each ship in the fleet". Services take an actor as input, not "the player". Combat ships are actors or actor-like records with the same ship model.
- **Derived stats.** `ship/stats.ts` calculates all ship stats from hull + modules + cargo + module power state. Do not store derived stats. Calculate them again when the loadout, cargo, or power state changes.
- Combat resolves a full turn at once. The resolver returns a list of effects. The renderer then plays the effects as animation.

### 4.3 Debug and tuning tools

Build these on Day 1 and extend them each day. They save more time than any other tool.

- **Debug panel** (key `F12` or `~`, only in development builds): add credits, set fuel, teleport to a location, skip N days, show all prices, set sector security, start a test battle with any template, spawn any contract.
- **CSV export:** `sim-economy.ts` writes one CSV file per run, with one row per day, location, and commodity: stock, target, price, production, consumption, flow in, flow out, installed machinery. Use it to check balance in a notebook or a spreadsheet.
- **Seed display:** the seed shows on the title screen, the career end screen, and in the debug panel.

---

## 5. Core loop

```
Region map (sectors)
  -> select a sector -> jump (days pass, fuel used)
       -> arrival encounter roll
Sector map (locations)
  -> select a location -> travel in sector (time, fuel)
       -> travel encounter roll
       -> encounter -> hail screen -> combat or other result
  -> arrive and dock
       -> services at this location
  -> select the next destination
```

At day 730, or when the player selects "Retire", the career ends.

---

## 6. World generator

### 6.1 Structure

```
Region (the full map)
  Sector  x 10 (range 8–12)
    Development level: Frontier, Middle, or Core
    Star (appearance only)
    Location x 3–6 (planets and stations)
    Jump point x 1 per lane
```

### 6.2 Method

The generator is **constructive first**. It calculates what the economy needs, then places it. After that, it **repairs** small problems. It **rejects** a seed only as a last step.

| Step | Name | Output |
|---|---|---|
| 1 | Topology | Sectors, lanes |
| 2 | Development and security | Development level, security baseline |
| 3 | Bodies | Planets and station slots in each sector |
| 4 | Blueprint | Number of producers and population needed in the region |
| 5 | Assign | A producer and population for each location |
| 6 | Sizes | Location sizes (1 to 3) that balance supply and demand |
| 7 | Services | Services by location type and tech level |
| 8 | Validate | Rule results (Section 6.10) and a short economy run |
| 9 | Repair or reject | Fixed world, or a new try with `seed + 1` |

All steps use the seeded RNG. The same seed always gives the same world, also after repairs and retries.

### 6.3 Step 1: Topology

1. Place 10 sectors (range 8 to 12, in `balance.json`) on a 2D area of 66 × 34 cells. Use Poisson-disc sampling with a minimum distance of 8 cells.
2. Make a minimum spanning tree. This makes sure that all sectors are connected.
3. For each sector, add a lane to its nearest sector that is not connected yet. Do not add a lane that crosses an existing lane.
4. Each sector has 1 to 4 lanes.
5. Make sector and location names from syllable tables in `names.json`.

### 6.4 Step 2: Development and security

1. Select the sector nearest to the center of the map as the **core**.
2. Development level by jumps from the core:

| Jumps from core | Development | Tech level of locations |
|---|---|---|
| 0–1 | Core | 3 |
| 2 | Middle | 2 |
| 3 or more | Frontier | 1 |

3. If the region has no Middle or no Frontier sector, change the sector farthest from the core to Frontier, then the next to Middle.
4. Security baseline: 90 at the core. −20 for each jump from the core, ±10 random. Minimum 5.
5. Shipyard Stations and Trade Hubs have tech level +1 (maximum 3).

### 6.5 Step 3: Bodies

1. Place the star at the center of each 66 × 34 sector map.
2. Place 3 to 6 bodies on orbit rings around the star. 1 to 4 are planets. 1 to 3 are station slots.
3. Select planet types with weights by development level (`bodyTypes.json`):

| Planet type | Frontier | Middle | Core | Gravity | Atmosphere |
|---|---|---|---|---|---|
| Terran | 0.5 | 1 | 3 | 1.0 | Yes |
| Ocean | 0.5 | 1 | 2 | 1.0 | Yes |
| Desert | 2 | 1.5 | 0.5 | 0.6 | No |
| Ice | 2 | 1.5 | 0.5 | 0.4 | No |
| Volcanic | 2 | 1 | 0.5 | 1.2 | No |
| Gas Giant | 1.5 | 1.5 | 1 | 0 (orbital dock) | — |

4. Place one jump point for each lane on the outer ring. Its angle points to the connected sector on the region map.

### 6.6 Step 4: Blueprint

The blueprint calculates how many producers of each type the region needs. It works like a bill-of-materials explosion.

1. **Final demand.** Estimate the region population from the planet types (Section 9.4). Calculate population demand per commodity per day.
2. **Back through the recipes.** For each commodity with demand, calculate how many batches of its recipe the region needs. Add that recipe's inputs to demand. Repeat until only raw goods are left. Process the tiers from top to bottom: Consumer, Advanced, Processed, Raw.
3. **Machinery upkeep.** Add Machinery demand for wear (Section 9.5) for all producers.
4. **Producer counts.** For each producer type: `count = ceil(batchesNeeded / (batchesPerSize × 2))`. The value 2 is the average size.
5. **Minimum counts.** Each producer type has a minimum of 2. This gives redundancy.

### 6.7 Step 5: Assign

1. Sort producer types from the rarest to the most common.
2. For each producer in the blueprint, select a free body that can host it (Section 7.2), in a sector with an allowed development level. Prefer a sector that has no producer of this type yet.
3. **Chain separation:** where possible, put a producer in a different sector from the producers of its inputs.
4. Give population to planets with atmosphere and to Habitat stations (Section 9.4).
5. Fill the remaining free bodies with population, Trade Hubs, Shipyard Stations, Military Outposts, or Pirate Havens, by the placement rules in Section 7.2.

### 6.8 Step 6: Sizes

1. Start all sizes at 2.
2. For each commodity, calculate `ratio = regionSupply / regionDemand`.
3. If `ratio < 0.9`, increase the size of a producer of that commodity (maximum 3). If `ratio > 1.1`, decrease the size of one (minimum 1).
4. Repeat until all ratios are between 0.9 and 1.1, or 20 passes are complete.

### 6.9 Step 7: Services

Add services by the rules in Section 7.4.

### 6.10 Step 8: Validate

**Rules:**

- Each commodity: supply/demand ratio 0.9 to 1.1.
- Each commodity has producers in at least 2 different sectors.
- Each chain step has at least one producer in a different sector from a producer of its input.
- Rare Element Mines are only in Frontier sectors.
- The region has at least 2 Shipyards (1 with tech level 3), at least 3 Outfitters, at least 2 Merchants' Guilds, and at least 2 Bounty Guilds.
- Military Outposts are only in sectors with baseline security 50 or more. Pirate Havens are only in sectors with baseline security 30 or less.
- The start location is in the core sector, with an Outfitter and a Merchants' Guild.

**Short economy run:** run the economy for 200 days with no player.

- No producer is below 30% output for 60 days in a row.
- The core-frontier gradient exists: the median price of raw goods is higher in Core sectors than in Frontier sectors. The median price of advanced goods is lower in Core sectors.

### 6.11 Step 9: Repair or reject

1. If a rule fails, try a repair for that rule. Repairs: change a size, change the producer at one location, or add a service.
2. Maximum 5 repairs. After each repair, validate again.
3. If the world still fails, start again from step 1 with `seed + 1`. Maximum 20 tries, then report an error.
4. Write the number of repairs and retries to the generator log. `tools/gen-report.ts` prints these values for 100 seeds.

**Acceptance check:** at least 95 of 100 seeds pass with 2 tries or fewer.

---

## 7. Locations

Planets and stations use the same `Location` model. Ships dock at both with the same rules. The differences are data: market size, producer, population, gravity, and services.

### 7.1 Location model

| Field | Description |
|---|---|
| `kind` | `planet` or `station` |
| `bodyType` | Planet type (Section 6.5) or station type |
| `producer` | One producer type from Section 9.3, or none |
| `population` | Population units (Section 9.4), or 0 |
| `size` | 1 to 3. Multiplies producer batches and population |
| `techLevel` | 1 to 3. From the sector development level (Section 6.4) |
| `gravity` | Fuel multiplier for docking. Stations: 0 |
| `installedMachinery` | Capital stock K (Section 9.5) |
| `market` | Per commodity: stock and target (Section 9.2) |
| `services` | List of services (Section 7.4) |

### 7.2 Which body can host which producer

| Producer | Hosts | Development |
|---|---|---|
| Ice Mine | Ice planet, Mining Station | Frontier, Middle |
| Ore Mine | Volcanic or Desert planet, Mining Station | Frontier, Middle |
| Silicate Mine | Desert planet, Mining Station | Frontier, Middle |
| Rare Element Mine | Volcanic planet, Mining Station | Frontier only |
| Gas Skimmer | Gas Giant | All |
| Agri World | Terran or Ocean planet | All |
| Electrolysis Plant | Processing Station, Ice planet | Middle, Core |
| Smelter | Processing Station, Volcanic planet | Middle, Core |
| Composite Works | Industrial Station | Core |
| Electronics Fab | Industrial Station | Core |
| Machine Works | Industrial Station | Middle, Core |
| Biolab | Industrial Station, Terran planet | Core |

**Planets** have larger markets (target stock × 2) and trade more commodities. Planets with atmosphere (Terran, Ocean) can have a large population. Docking at a planet costs fuel (gravity).

**Stations** have smaller markets, no gravity cost, and more fixed services.

| Station type | Function | Placement rule |
|---|---|---|
| Mining Station | Hosts a mine | Frontier, Middle |
| Processing Station | Hosts Electrolysis or a Smelter | Middle, Core |
| Industrial Station | Hosts an advanced producer | Middle, Core |
| Habitat | Population only | All |
| Trade Hub | No producer. Large target stock for all commodities. | Middle, Core |
| Shipyard Station | No producer. Buys Alloys, Composites, Electronics, Machinery. | Any |
| Military Outpost | No producer. Small crew population. | Baseline security 50+ |
| Pirate Haven | No producer. Buys Food, Medicine, Oxygen. | Baseline security 30 or less |

### 7.3 Tech level

- Tech level comes from the sector development level (Section 6.4).
- Tech level sets the highest **tier** of hulls and modules that the Shipyard and Outfitter sell (tier ≤ tech level).
- Pirate Havens sell tier 1 to 3, at 130% price.

### 7.4 Services

| Service | Function | Where |
|---|---|---|
| Refuel | Buy fuel. Fuel uses the local Hydrogen stock and price (Section 9.1). | All locations |
| Market | Buy and sell commodities. | All locations |
| Mechanic | Repair hull HP, engine value, and armor. Refill guided munitions. | All stations. Planets with tech level 2+. |
| Outfitter | Buy, sell, and install modules. Change the loadout. | Tech level 2+ locations, Shipyard Stations, Pirate Havens |
| Shipyard | Buy hulls. Trade in the old hull. | Shipyard Stations. Tech level 3 Terran planets. |
| Merchants' Guild | Live prices within 2 jumps, chain alerts, Supply and Freight contracts (Section 14.4). | Trade Hubs. Tech level 2+ planets with population. |
| Bounty Guild | Sweep contracts, named bounties, and bounty payment (Sections 14.5 and 14.6). | Military Outposts. Tech level 2+ planets in sectors with security 30+. |

- A Pirate Haven buys cargo from piracy at 70% of the local price. It lets the player dock at all notoriety levels.
- Store the service rules in `services.json`, so a new service needs only data and one service file.

---

## 8. Travel and fuel

### 8.1 Time

- The economy updates once per day.
- Travel time can be a fraction of a day. The clock keeps fractions. The economy runs one tick for each whole day that passes.

### 8.2 Travel in a sector

- Distance = straight distance on the sector map.
- Time (days) = `distance / (cruiseFactor × move)`. `move` comes from Section 11.4.
- Fuel = `distance × mass × k_sector × engineFuelRate`.
- `engineFuelRate` is the thrust-weighted average of the installed engines.
- **Fleets:** the slowest ship (lowest `move`) sets the travel time. Each ship uses its own fuel, with its own mass.

### 8.3 Jumps between sectors

- The ship must go to a jump point first (sector travel).
- Jump time (days) = `laneLength / (jumpFactor × move)`.
- Jump fuel = `laneLength × mass × k_jump × engineFuelRate`.

### 8.4 Docking

- Dock fuel = `gravity × mass × k_dock`. The ship pays it when it docks. Undock is free.
- Stations and Gas Giants have gravity 0.

### 8.5 Fuel in combat

- Each combat turn with at least one engine ON uses `mass × k_combat` fuel.
- A successful flee uses `mass × k_flee` fuel.

### 8.6 Out of fuel

- The UI shows a warning before a trip if the fuel is not sufficient. The UI does not stop the trip.
- If fuel goes to 0 during travel or combat, the ship is towed to the nearest location with Refuel. If one ship in a fleet has 0 fuel, the full fleet is towed. The fee is paid for each ship with 0 fuel.
- Before a trip, the UI shows the fuel of the ship with the lowest range.
- In combat, the tow happens after the battle ends. A ship with 0 fuel cannot move.
- **Recovery fee** = `recoveryBase + recoveryPerDistance × distance + 20% of the local price for a full tank`. The ship then gets 25% fuel.
- If the player does not have sufficient credits, the location buys the cargo at its sell price to pay the fee. If this is not sufficient, credits go below 0 (debt).
- While credits are below 0, the player cannot buy hulls, modules, or contracts. Each sale pays the debt first.

### 8.7 Fuel acceptance checks

- A starting ship with a full tank can do 4 to 6 jumps with no cargo.
- A laden Heavy Freighter uses about 3 times more fuel per jump than an empty Shuttle.

### 8.8 Wait and Hunt

| Action | Where | Effect |
|---|---|---|
| Wait | Docked at a location | Pass 1 to 30 days. The economy runs. Upkeep is paid. No encounters. |
| Hunt | In space in a sector (sector map) | Pass 1 day. Roll for a pirate encounter with chance × `huntMultiplier` (default 3). Uses fuel for 1 day of cruise. |

- Hunt is the main tool for bounty hunters and Sweep contracts (Section 14.5).

---

## 9. Economy

The economy is one of the two main engines of the game. It has 12 commodities in 4 tiers. Recipes connect them in production chains. Raw goods flow toward the core. Manufactured goods flow toward the frontier.

### 9.1 Commodities

| Tier | Commodity | Base price | Mass per unit (t) | Notes |
|---|---|---|---|---|
| Raw | Water | 10 | 1.0 | |
| Raw | Hydrogen | 25 | 1.0 | Also ship fuel |
| Raw | Iron Ore | 15 | 1.0 | |
| Raw | Silicates | 20 | 1.0 | |
| Raw | Rare Elements | 120 | 1.0 | Frontier only |
| Processed | Oxygen | 30 | 0.5 | |
| Processed | Alloys | 75 | 0.5 | |
| Processed | Food | 30 | 0.5 | Perishable: 1% quantity loss per day in cargo |
| Advanced | Composites | 180 | 0.2 | |
| Advanced | Electronics | 400 | 0.2 | |
| Advanced | Machinery | 750 | 0.2 | Capital good (Section 9.5) |
| Consumer | Medicine | 250 | 0.2 | |

- **Cargo is in tonnes.** A cargo hold has a capacity in tonnes. Cargo mass counts in ship mass.
- **Value per tonne** is a design tool. Iron Ore is 15 cr/t. Electronics are 2,000 cr/t. Freighters carry raw goods. Fast ships carry advanced goods.
- **Fuel.** 1 fuel unit uses `fuelPerHydrogen` units of Hydrogen from the local market. The fuel price = local Hydrogen buy price ÷ `fuelPerHydrogen`. Fuel is cheap near gas giants and expensive in the core.
- **Rule (unit test):** for each recipe, the base value of its outputs is 1.3× or more the base value of its inputs.

### 9.2 Market state

Each location has these values for each commodity that it trades:

- `stock` (current units)
- `target` (normal stock = 10 days of the location's daily use or output)

A location trades a commodity if its producer makes it or uses it, or if its population uses it. Trade Hubs trade all commodities. Each location trades 4 to 6 commodities (Trade Hubs excepted).

### 9.3 Recipes

Each producer runs `batchesPerSize × size` batches per day. Values are in `recipes.json`.

| Producer | Hard inputs (per batch) | Soft input | Outputs (per batch) | Batches per size |
|---|---|---|---|---|
| Ice Mine | — | Machinery | 4 Water | 5 |
| Ore Mine | — | Machinery | 4 Iron Ore | 5 |
| Silicate Mine | — | Machinery | 4 Silicates | 5 |
| Rare Element Mine | — | Machinery | 1 Rare Elements | 5 |
| Gas Skimmer | — | Machinery | 3 Hydrogen | 5 |
| Agri World | 2 Water | Machinery | 2 Food | 5 |
| Electrolysis Plant | 2 Water | Machinery | 1 Hydrogen + 1 Oxygen | 5 |
| Smelter | 2 Iron Ore + 1 Hydrogen | Machinery | 1 Alloys | 4 |
| Composite Works | 1 Alloys + 1 Silicates | Machinery | 1 Composites | 3 |
| Electronics Fab | 2 Silicates + 1 Rare Elements | Machinery | 1 Electronics | 2 |
| Machine Works | 2 Alloys + 1 Electronics | Machinery | 1 Machinery | 2 |
| Biolab | 2 Food + 1 Water | Machinery | 1 Medicine | 3 |

```
output = batches × inputFactor × capitalFactor × securityMult × eventMult
```

- `inputFactor` = minimum over hard inputs of `stock / required`, maximum 1.0. Without a hard input, there is no output.
- `capitalFactor` comes from installed Machinery (Section 9.5). Machinery is the soft input for all producers.
- `securityMult` = the economy multiplier of the sector security level (Section 10.2).
- The producer removes the inputs that it uses from its stock, and adds its outputs to its stock.

### 9.4 Population

Population is the final demand. Values per population unit per day are in `population.json`.

| Commodity | Per unit per day | Who |
|---|---|---|
| Food | 1.0 | All populations |
| Water | 1.0 | All populations |
| Oxygen | 0.5 | Stations, and planets with no atmosphere |
| Medicine | 0.1 | All populations |
| Electronics | 0.1 | Core populations only |
| Composites | 0.05 | Core populations only |

| Location | Population units per size |
|---|---|
| Terran planet | 20 |
| Ocean planet | 15 |
| Habitat station | 10 |
| All other locations (crew) | 2 |

- If a population cannot get a commodity, nothing breaks in the MVP. The price of that commodity goes up. The Merchants' Guild shows a chain alert.

### 9.5 Installed machinery (capital)

Each producer has installed machinery **K**. This is separate from Machinery in its market stock.

```
K_ref         = machineryPerBatch × batches
capitalFactor = 0.6 + 0.6 × K / (K + K_ref)
```

- K = 0: 60% output. K = K_ref: 90% output. Very high K: up to 120%, with diminishing returns.
- **Install:** each day, the producer moves Machinery from its market stock into K, up to 10% of `K_ref` per day, until K = `1.5 × K_ref`.
- **Wear:** each day, K goes down by `machineryWear` (default 0.25% per day).
- **Start value:** K = K_ref at world generation.
- `machineryPerBatch` = 0.6 for mines, skimmers, and agri worlds. 1.0 for processors. 1.6 for advanced producers. Values are in `recipes.json`.
- **Rule (unit test):** for each producer, daily wear cost (`machineryWear × K_ref × Machinery base price`) is less than 20% of its daily output base value.

When the player delivers Machinery to a frontier mine, its output goes up for months. This is a small "development" effect.

### 9.6 Daily tick order

1. Population uses goods.
2. Producers use inputs and make outputs (Section 9.3).
3. Producers install Machinery. Installed machinery wears (Section 9.5).
4. Background trade flow (Section 9.7).
5. Off-map supply and demand (Section 9.8).
6. Noise: ±3% of `target`, random.
7. `stock = max(stock, 0)`.
8. Events update (Section 9.11).

### 9.7 Background trade flow

This system moves goods between locations without NPC agents. Without it, only the player moves goods, and the chains stop when the player is far away.

For each commodity, for each pair of locations A and B where `price_B > price_A`:

```
surplus_A = max(0, stock_A − 0.5 × target_A)
deficit_B = max(0, target_B − stock_B)
flow      = min( κ × surplus_A × (price_B − price_A) / price_B × securityFactor,
                 0.1 × deficit_B )
```

| Pair | κ |
|---|---|
| Same sector | `flowSameSector` = 0.05 |
| Sectors connected by one lane | `flowOneLane` = 0.02 |
| Farther | 0 |

- `securityFactor` = `0.2 + 0.2 × min(security level of the two sectors)`. Lawless: 0.2. Secure: 1.0.
- κ is small. The flow closes only part of each price gap. The rest of the gap is the player's profit.
- Pirates slow the flow. Price gaps stay larger in dangerous sectors.
- To keep this fast, calculate flows only between locations that trade the commodity.

### 9.8 Off-map supply and demand

These rules prevent a deadlock that never recovers.

- **Input trickle:** each producer receives `offMapInputShare` (default 15%) of its hard input needs each day, from outside the region.
- **Region balance:** if the region supply/demand ratio of a commodity stays outside 0.8 to 1.2 for 30 days, add or remove `offMapBalance` (default 5%) of region demand each day, split between Trade Hubs. Stop when the ratio is back between 0.9 and 1.1.

### 9.9 NPC trade agents (stretch goal)

Build this only if Day 2 ends early. If not, it is the first item after the MVP.

- An agent is an Actor with a fleet of 1 ship (a hull and default loadout), a home sector, and a fixed budget per trip.
- At a location, it calculates each route within 2 jumps: `(sellPrice − buyPrice) × quantity − fuelCost`, divided by trip days. It uses live prices.
- It selects at random from its top 3 routes. It trades only if the margin is 20% or more.
- **Reservation:** a planned sale reduces the demand that other agents see at that destination.
- Travel is abstract. The agent arrives after the trip time.
- Each trip rolls for pirates by sector security. If it fails, the agent loses the ship and cargo. It comes back after 10 to 20 days.
- A "Trader" encounter uses a real agent when one is on that route. Piracy then removes real goods.
- **Hybrid:** agents do a share of the trade (`agentTradeShare`, default 0.3). Reduce κ in Section 9.7 by the same share.
- `tools/sim-trader.ts` uses the same agent code.
- Start with 15 to 25 agents.

### 9.10 Price

```
price     = base × clamp((target / max(stock, 1)) ^ k, 0.3, 3.0)
buyPrice  = price × (1 + spread / 2)      // actor pays
sellPrice = price × (1 − spread / 2)      // actor receives
```

- `k` = 0.6, `spread` = 0.08.
- Each unit that an actor sells increases `stock` by 1. Each unit that an actor buys decreases `stock` by 1. Calculate the total price unit by unit, so large trades get worse prices.

### 9.11 Market events

| Event | Effect | Duration (days) |
|---|---|---|
| Shortage | Population use × 2 for one commodity at one location | 20–40 |
| Boom | Batches × 1.5 at one producer | 20–40 |
| Strike | Batches × 0 at one producer | 10–20 |
| Pirate Surge | Security value −20 in one sector (Section 10) | Instant |

- Maximum 3 active events. Roll for a new event each day.

### 9.12 Price information

There is no information decay. The rules are simple:

| Source | What the player gets |
|---|---|
| Docked location | Live prices |
| Location with a Merchants' Guild | Live prices for all locations within 2 jumps, a 14-day trend arrow for each price, and chain alerts. Free. |
| Other locations | Last known price, with the day that the player got it |
| Locations with no information | "Unknown" |

**Map knowledge:**

- At the start, the player knows the full region map: all sectors, lanes, and their security levels and threat bands (Section 10.6).
- The player knows the locations in a sector after the first visit to that sector, or from a Merchants' Guild within 2 jumps.
- Prices follow the table above.

### 9.13 Economy acceptance checks (`tools/sim-economy.ts`)

Run 1000 days on 20 seeds, with no player. Use fixed security. Write a report with minimum, median, and maximum price per commodity, per development level.

- No commodity is at the price clamp (0.3 or 3.0) for more than 20% of days.
- No stock is below 0.
- No producer is below 30% output for more than 60 days in a row.
- **Gradient:** raw goods cost more in Core sectors than in Frontier sectors. Advanced goods cost less in Core sectors.
- **Routes:** each commodity has at least one route (1 to 3 jumps) with a margin of 25% or more, on at least 60% of days.
- **Raw goods gaps:** raw goods have routes of 1 to 2 jumps with margins of 40% to 80%, on at least 50% of days.
- **Chain shock:** stop all Iron Ore output in one sector for 30 days. Alloys prices in its neighbor sectors rise by 30% or more. They return to within 10% of normal within 60 days after the stop ends.
- **Capital:** deliver 10 Machinery to a frontier mine with K = K_ref. Its output rises, and stays higher than normal for 60 days or more.

---

## 10. Sector security and encounters

### 10.1 Value and levels

Each sector has a **security value** (0 to 100) and a **baseline** (0 to 100).

| Level | Value | Name |
|---|---|---|
| 0 | 0–19 | Lawless |
| 1 | 20–39 | Low |
| 2 | 40–59 | Medium |
| 3 | 60–79 | High |
| 4 | 80–100 | Secure |

### 10.2 Effects

Store all values in `security.json`.

| Level | Pirate chance on sector arrival | Pirate chance per sector trip | Patrol arrival per combat turn (from turn 3) | Pirate arrival per combat turn (from turn 3) | Economy multiplier |
|---|---|---|---|---|---|
| 0 | 35% | 20% | 0% | 8% | 0.80 |
| 1 | 25% | 14% | 3% | 4% | 0.90 |
| 2 | 15% | 9% | 8% | 0% | 1.00 |
| 3 | 8% | 5% | 15% | 0% | 1.10 |
| 4 | 3% | 2% | 25% | 0% | 1.20 |

- The economy multiplier changes production and consumption. Safe sectors trade more goods. This is the main long-term effect of player actions.

### 10.3 Changes

| Cause | Value change | Baseline change |
|---|---|---|
| Player destroys a pirate ship in the sector | +3 | +0.5 |
| A pirate ship surrenders to the player in the sector | +2 | +0.3 |
| Player completes a bounty in the sector | +5 | +1.0 |
| Player attacks a non-pirate ship in the sector | −4 | −0.5 |
| Pirate Surge event | −20 | 0 |
| Each day | Move 2% of the gap toward baseline | 0 |

- Value and baseline stay between 0 and 100.
- Short actions change the value. Long campaigns change the baseline. A player who hunts pirates in one sector for a long time makes it permanently safer.
- The region map shows each sector's security level and an arrow (up, down, or flat) for the last 30 days.

### 10.4 Encounter types

| Type | When | Source of strength |
|---|---|---|
| Pirates | Pirate chance (Section 10.2) on sector arrival, on travel in a sector, and on Hunt | Pirate threat budget (Section 10.5) |
| Trader | 30% of the time when no pirate encounter happens, on travel in a sector | Trader templates by development level, escort from the pirate budget (Section 10.8) |
| Patrol | 20% of the time when no pirate encounter happens, in sectors with security level 2+ | Patrol budget (Section 10.8) |
| Named pirate | First arrival or Hunt in its sector while the player has its bounty (Section 14.6) | Named bounty threat (Section 14.6) |

- Encounter chances use the fleet size factor in Section 11.9.
- Notoriety Wanted: patrol encounters are hostile (Section 15).

### 10.5 Threat budget

**Design rule:** the world sets enemy strength, not the player. Sector security and development level set the threat budget. The flagship's strength does not change the budget. When the player gets stronger, the player selects more dangerous sectors and larger bounties. Stronger enemies do not follow the player.

**Threat units (TU).** Each ship has a threat value. One Pirate Raider (Wasp) = 10 TU.

```
durability = hullHP + armorPlatingHP + shieldCapacity + 10 × armor
firepower  = sum over weapons of
               damage × (vsShield + vsHull) / 2 × trackFactor(maneuver 40) × ammoFactor
             (flak: trackFactor = 0.6; torpedo: ammoFactor = 0.6)
rawThreat  = sqrt(durability × firepower)
TU         = 10 × rawThreat / rawThreat(Pirate Raider)
groupTU    = sum(ship TU) × (1 + groupBonus × (shipCount − 1))      // groupBonus = 0.15
```

- `ship/stats.ts` calculates TU with the other derived stats. `tools/ship-report.ts` prints TU for all loadouts and templates.

**Reference values (first values):**

| Ship | TU |
|---|---|
| Starting Shuttle | 9 |
| Pirate Raider (Wasp) | 10 |
| Light Freighter (trader) | 13 |
| Heavy Freighter (trader) | 28 |
| Pirate Gunship | 37 |
| Patrol Cutter | 38 |
| Pirate Corvette | 57 |
| Pirate Frigate | 76 |
| Battleship | 154 |

**Budget formula:**

```
pirateBudget = securityBase[level] × devMult[development] × random(0.6, 1.4)
pirateBudget = max(pirateBudget, 10)
```

| Security level | `securityBase` |
|---|---|
| 0 Lawless | 70 |
| 1 Low | 45 |
| 2 Medium | 28 |
| 3 High | 16 |
| 4 Secure | 10 |

| Development | `devMult` |
|---|---|
| Frontier | 1.3 |
| Middle | 1.0 |
| Core | 0.8 |

Resulting ranges (examples): Lawless Frontier 55–127 TU. Low Middle 27–63 TU. Medium Core 13–31 TU. Secure Core 10 TU.

- The only player-related factor is the fleet size factor on encounter **chance** (Section 11.9). It does not change the budget.
- A Pirate Surge lowers security. This raises the budget through the formula. There is no other modifier.

### 10.6 Pirate templates and selection

Templates are in `templates.json`. Each template has a list of ships with loadouts, a TU cost (calculated, not typed), and placement rules.

| Template | Ships | TU | Rule |
|---|---|---|---|
| Lone Raider | 1 Raider | 10 | All |
| Raider Pair | 2 Raiders | 23 | All |
| Gunship | 1 Pirate Gunship | 37 | Security level ≤ 3 |
| Raider Pack | 3 Raiders | 39 | Security level ≤ 2 |
| Gunship Escort | 1 Gunship + 2 Raiders | 74 | Security level ≤ 1 |
| Frigate | 1 Pirate Frigate | 76 | Security level ≤ 1, not Core |
| Corvette Pack | 1 Corvette + 2 Raiders | 100 | Security level ≤ 1, not Core |
| Frigate Group | 1 Frigate + 1 Gunship + 2 Raiders | 194 | Named bounties only |
| Battle Group | 1 Battleship + 2 Gunships | 298 | Named bounties only, Lawless or Low Frontier |

**Selection:**

1. List the templates that are allowed in this sector, with `TU ≤ budget`.
2. From these, keep the templates with `TU ≥ 0.5 × budget`. If none, keep the most expensive allowed template.
3. Select one at random, with weight = TU (larger templates are more likely).

**Threat band on the region map:** each sector shows its expected range (budget at random 0.6 and 1.4) as a band from 1 to 5 skulls (`!` to `!!!!!`), and as a number range in the sector panel.

### 10.7 Pirates judge the odds

Pirates compare their group TU with the TU of the player's **flagship** (only the flagship fights).

```
ratio = pirateGroupTU / flagshipTU × boldness[level]
```

| Security level | `boldness` |
|---|---|
| 0 Lawless | 1.25 |
| 1 Low | 1.1 |
| 2+ | 1.0 |

| Ratio | Pirate behavior | Hail options |
|---|---|---|
| ≥ 1.5 | Attack | Fight, Flee |
| 0.75 to 1.49 | Demand tribute (50% of the cargo value of one ship) | Fight, Flee, Pay |
| < 0.75 | Avoid. "The pirates turn away." | Pursue, Ignore |

- **Pursue:** combat starts. The player acts first. The pirates use the Evader AI (Section 13.8). Engine targeting (Section 13.6) is the way to catch them.
- A strong player is not stopped by weak pirates on every trip. A bounty hunter must pursue or use Hunt.

### 10.8 Traders and patrols

**Trader templates:**

| Development | Template |
|---|---|
| Frontier | 1 Light Freighter |
| Middle | 1 Light Freighter (60%) or 1 Heavy Freighter (40%) |
| Core | 1 Heavy Freighter |

- **Escort:** if the sector security level ≤ 2, the trader has an escort. Escort budget = 0.5 × pirate budget of the sector. Select the escort from pirate-style templates with Patrol AI and trader colors (Raiders become "Escort Wasps").
- Piracy pays more in dangerous sectors, because traders there carry more valuable goods (higher prices). It is also harder, because the escorts are stronger.

**Patrol budget:**

```
patrolBudget = patrolBase[level] × random(0.8, 1.2)
```

| Security level | `patrolBase` | Typical group |
|---|---|---|
| 0 Lawless | 0 | None |
| 1 Low | 40 | 1 Patrol Cutter |
| 2 Medium | 50 | 1 Cutter |
| 3 High | 85 | 2 Cutters |
| 4 Secure | 110 | 2 Cutters + 1 Corvette |

- Patrol templates are in `templates.json`. Patrol encounters and patrol reinforcements (Section 13.5) use this budget.

### 10.9 Threat acceptance checks

- `ship-report.ts` gives the TU reference values in Section 10.5 (±10%).
- **TU calibration** (`sim-combat.ts`): a single ship against a group with the same TU (±10%) wins 35% to 65% of 500 battles. Check with 5 pairs. If a check fails, tune `groupBonus` and the firepower formula, not the templates.
- Over 10,000 generated pirate encounters per security level and development level, the median group TU is within the range in Section 10.5.

---

## 11. Ships

### 11.1 Hulls

A hull has only base values. Modules give all other abilities. First values; tune them in `hulls.json`.

| Hull | Role | HP | Armor | Base power | Mass (t) | Heat capacity | Base cooling | Hardpoints S/M/L | Internal S/M/L | Art | Tech | Price |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Shuttle | Start | 40 | 0 | 1 | 14 | 30 | 3 | 1/0/0 | 4/2/0 | 1×1 | 1 | 6,000 |
| Wasp | Fighter | 30 | 0 | 1 | 8 | 25 | 3 | 2/0/0 | 3/0/0 | 1×1 | 1 | 9,000 |
| Courier | Fast trade | 50 | 0 | 1 | 16 | 30 | 3 | 1/0/0 | 4/1/0 | 3×1 | 1 | 14,000 |
| Light Freighter | Trade | 80 | 1 | 2 | 30 | 40 | 4 | 1/1/0 | 3/2/0 | 6×3 | 1 | 20,000 |
| Gunship | Combat | 90 | 2 | 2 | 28 | 50 | 4 | 1/2/0 | 3/2/0 | 3×1 | 2 | 38,000 |
| Heavy Freighter | Trade | 140 | 2 | 2 | 70 | 60 | 5 | 0/2/0 | 2/2/2 | 6×3 | 2 | 75,000 |
| Corvette | Combat | 160 | 3 | 3 | 60 | 80 | 6 | 2/2/0 | 2/2/1 | 7×3 | 2 | 110,000 |
| Frigate | Combat | 260 | 4 | 4 | 140 | 120 | 8 | 2/2/1 | 2/3/2 | 7×3 | 3 | 240,000 |
| Battleship | Enemy only | 600 | 6 | 6 | 450 | 250 | 14 | 0/3/3 | 2/4/4 | 15×5 | — | — |

- **Hardpoints** hold weapons and point defense.
- **Internal slots** hold all other modules.
- A module fits a slot of the same size or a larger size.
- **Engine value** = 20% of hull HP. Engine shots damage it (Section 13.6).
- **Trade-in:** the Shipyard pays 60% of the hull price and 60% of each module price.
- Enemy ships use the same hulls with fixed loadouts from `loadouts.json`. Example: a Pirate Raider is a Wasp. A Patrol Cutter is a Gunship. A Pirate Frigate is a Frigate.

### 11.2 Required modules

A ship can leave a location only if:

- It has at least 1 Engine.
- Power supply (hull base power + reactors) ≥ power draw of all engines.
- Total cargo mass ≤ cargo capacity (tonnes).

The Outfitter shows a red warning when the loadout fails a rule. It shows a yellow warning when the total power draw of all modules is more than the power supply ("You must switch modules OFF in combat").

### 11.3 Mass

```
mass = hull.mass + sum(module.mass) + cargo mass (tonnes)
```

### 11.4 Speed and maneuverability

Engines give **thrust**. Speed and maneuverability come from thrust and mass, with two different curves.

```
TWR       = totalThrust(engines ON) / mass
speedIdx  = TWR × (M_REF / mass) ^ (1/6)
agility   = TWR × (M_REF / mass) ^ (1/3) × thrusterMult
move      = floor(1 + 6 × (1 − exp(−speedIdx)))          // cells per combat turn
maneuver  = 100 × agility² / (agility² + 1)               // 0 to 100
```

- `M_REF` = 10.
- `thrusterMult` = 1 + sum of Maneuvering Thruster bonuses.
- If no engine is ON: `move` = 0 and `maneuver` = 0.
- If the engine value is 0: `move` = 0 and `maneuver` = 0.

**Why these curves:**

- **Agility uses mass to the power 1/3.** A larger ship has more rotational inertia. If length grows with mass^(1/3), turn rate falls with mass^(1/3) at the same thrust-to-weight ratio. So a large ship with very large engines is still less agile than a fighter.
- **Speed uses mass to the power 1/6.** Large engines can move a large ship fast, but they cannot make it turn fast. Speed and maneuverability can be different.
- **The maneuver curve is an S-curve (Hill function).** Low agility gives a very low value. High agility gives diminishing returns near 100. A second engine on a fighter gives a smaller gain than the first engine.
- **Cargo is mass.** A laden freighter is slower and easier to hit than an empty freighter.

**Reference values** (`tools/ship-report.ts` must print a table like this one for all hulls and default loadouts). These rows test the formulas at the masses shown:

| Ship and loadout | Mass (t) | TWR | Agility | Maneuver | Move |
|---|---|---|---|---|---|
| Wasp, 1 × S engine | 15 | 2.00 | 1.75 | 75 | 6 |
| Wasp, 2 × S engine | 17 | 3.53 | 2.96 | 90 | 6 |
| Starting Shuttle, empty | 28 | 1.07 | 0.76 | 37 | 4 |
| Starting Shuttle, 20 t cargo | 48 | 0.62 | 0.37 | 12 | 3 |
| Shuttle, 2 × S engine, 20 t cargo | 50 | 1.20 | 0.70 | 33 | 4 |
| Gunship, 1 × M | 48 | 1.67 | 0.99 | 49 | 5 |
| Gunship, 1 × M + 1 × S | 50 | 2.20 | 1.29 | 62 | 5 |
| Light Freighter, 1 × M, laden | 68 | 1.18 | 0.62 | 28 | 4 |
| Corvette, 1 × L | 104 | 1.92 | 0.88 | 44 | 5 |
| Heavy Freighter, 1 × L, laden | 156 | 1.28 | 0.51 | 21 | 4 |
| Frigate, 2 × L | 232 | 1.72 | 0.60 | 27 | 4 |
| Battleship, 4 × L | 654 | 1.22 | 0.30 | 8 | 3 |

- `engineStackFalloff` in `balance.json` (default 1.0) multiplies the thrust of each extra engine by `falloff^(n−1)`. Use it only if multi-engine builds are too strong.

### 11.5 Power

- **Power supply** = hull base power + sum of reactor output.
- Each active module has a **power draw** while it is ON. Passive modules (cargo racks, fuel tanks, armor, heat sinks, radiators) draw 0.
- **Rule:** the sum of power draw of all modules that are ON must be ≤ power supply.
- In combat, the player can switch modules ON and OFF at the start of each turn. This is a free action.
  - Weapons that are OFF cannot fire.
  - A shield generator that goes ON starts at 0 shield points.
  - Engines that are OFF give no thrust. Speed and maneuverability change immediately.
- Outside combat, all engines are ON. The other modules use the last combat setting, or a default "travel" setting.

### 11.6 Heat

- **Heat capacity** = hull heat capacity + Heat Sinks.
- **Cooling** = hull base cooling + Radiators.
- Each turn: `heat = heat + sum(heatPerTurn of modules ON) + sum(heatPerShot of shots fired) − cooling`. Minimum 0.

| Heat state | Heat | Effect |
|---|---|---|
| Normal | Below 70% of capacity | None |
| Hot | 70% to 99% | −10% hit chance. Shield regeneration × 0.5. |
| Overheat | 100% or more | Weapons cannot fire this turn. Hull takes damage = heat above capacity (armor does not apply). Heat then goes back to capacity. |

- Heat goes to 0 after combat.

### 11.7 Modules

**Tiers.** Each module has a size (S, M, L) and a tier (1, 2, 3). Store base values per size for tier 1. Tiers multiply the main value:

| Tier | Main value | Power draw | Heat | Mass | Price |
|---|---|---|---|---|---|
| 1 | × 1.0 | × 1.0 | × 1.0 | × 1.0 | × 1 |
| 2 | × 1.25 | × 1.0 | × 0.9 | × 0.95 | × 2.5 |
| 3 | × 1.5 | × 1.0 | × 0.8 | × 0.9 | × 6 |

**Internal modules (tier 1 values):**

| Module | Size | Main value | Power | Heat/turn | Mass (t) | Price |
|---|---|---|---|---|---|---|
| Engine | S / M / L | Thrust 30 / 80 / 200. Fuel rate 1.0 | 2 / 4 / 7 | 2 / 3 / 5 | 2 / 6 / 16 | 1,500 / 5,000 / 16,000 |
| Reactor | S / M / L | Power +8 / +18 / +40 | 0 | 1 / 2 / 4 | 3 / 8 / 20 | 1,200 / 4,500 / 14,000 |
| Shield Generator | S / M / L | Capacity 20 / 50 / 120. Regen 4 / 8 / 15 per turn | 2 / 4 / 8 | 2 / 3 / 5 | 2 / 5 / 12 | 2,000 / 7,000 / 22,000 |
| Cargo Rack | S / M / L | 10 / 30 / 80 t | 0 | 0 | 1 / 3 / 8 | 500 / 1,800 / 6,000 |
| Fuel Tank | S / M / L | 10 / 30 / 80 fuel | 0 | 0 | 1 / 3 / 8 | 400 / 1,400 / 4,500 |
| Armor Plating | S / M / L | +1 / +2 / +3 armor and +15 / +40 / +100 HP | 0 | 0 | 4 / 10 / 25 | 1,000 / 4,000 / 12,000 |
| Heat Sink | S / M | +20 / +50 capacity | 0 | 0 | 2 / 5 | 800 / 2,800 |
| Radiator | S / M | +2 / +5 cooling | 0 | 0 | 2 / 5 | 900 / 3,000 |
| Maneuvering Thrusters | S / M | +15% / +25% agility | 1 / 2 | 1 / 2 | 1 / 3 | 1,500 / 5,000 |

- Engine tier 2 and 3 can also have a better fuel rate (0.9 and 0.8). Put this in `modules.json`.

### 11.8 Starting ship

Shuttle with: Engine S, Reactor S, Shield Generator S (internal S slots), Cargo Rack M (30 t) and Fuel Tank M (internal M slots), Pulse Laser S. One internal S slot stays free for the player's first module (a second engine is a good choice). Credits: 2,000. Start at the start location (Section 6.10), docked, with full fuel.

A full hold makes the starting ship slow and easy to hit (Section 11.4). This is the main early decision: carry more cargo, or carry less and stay safe.

### 11.9 Fleet

The player can own a fleet of up to `maxFleetSize` ships (default 4). This works like *Sid Meier's Pirates!*: only the flagship fights.

| Rule | Description |
|---|---|
| Get ships | Buy a hull at a Shipyard (it joins the fleet with an empty loadout), or take a prize ship (Section 13.7). |
| Flagship | One ship is the flagship. The player can select a different flagship at any docked location. |
| Travel | The fleet moves together. The slowest ship sets the travel time (Section 8). |
| Fuel | Each ship has its own tank and uses its own fuel. Refuel fills all ships. |
| Cargo | The Market and Trade Ledger use the total free capacity of the fleet. Bought cargo goes to ships in this order: the flagship last; heavy goods first to the ship with the most thrust. The player can also move cargo between ships at a location. |
| Outfitting | The Outfitter and Mechanic work on one selected ship at a time. |
| Combat | Only the flagship goes on the battle map. The other ships stay off the map and cannot be targeted. |
| Flagship flees | If the flagship flees from pirates, the pirates take 50% of the cargo of one random non-flagship ship. |
| Flagship destroyed | The next ship in the list becomes the flagship. The career continues. The destroyed ship and its cargo are lost. The battle ends. |
| Last ship destroyed | Game over (Section 16). |
| Upkeep | Each ship that is not the flagship costs `upkeepPerShip × size points` per day. Size points by hull size class: Small = 1, Medium = 2, Large = 3, Capital = 6. The cost is paid at each dock for the days since the last dock. If credits are below 0, the debt rules apply (Section 8.6). |
| Encounters | Pirate chance × `(1 + 0.1 × (fleet size − 1))`. A larger fleet is a larger target. |
| Sell a ship | At a Shipyard, at the trade-in value (Section 11.1). |

**Design intent:**

- A trader can run a slow, heavy freighter with a fast armed flagship as its guard.
- A pirate can build a fleet from prize ships.
- A backup ship protects a long career from one bad battle. The upkeep cost makes this a real choice.

---

## 12. Weapons

### 12.1 Weapon families

| Family | Role | Strength | Weakness |
|---|---|---|---|
| Lasers | Hitscan, high tracking | Hits agile ships. Strong against shields. | Weak against armor. Much heat. |
| Ballistics | Fast projectiles, low tracking | High damage. Strong against hull and armor. Low power and heat. | Misses agile ships. |
| Guided | Missiles and torpedoes that move on the grid | Long range. Can follow targets. | Ammunition. Point defense and flak can destroy them. |

### 12.2 Weapon list (tier 1 values)

| Weapon | Family | Size | Damage | Range | Tracking | Vs shield | Vs hull | Armor pierce | Power | Heat/shot | Other |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Pulse Laser | Laser | S | 5 | 8 | 150 | × 1.5 | × 0.6 | 0 | 2 | 4 | |
| Beam Laser | Laser | M | 12 | 10 | 130 | × 1.5 | × 0.6 | 0 | 4 | 6 | |
| Autocannon | Ballistic | S | 6 | 7 | 40 | × 0.6 | × 1.3 | 1 | 1 | 2 | |
| Mass Driver | Ballistic | M | 20 | 12 | 25 | × 0.5 | × 1.6 | 2 | 2 | 4 | |
| Heavy Cannon | Ballistic | L | 45 | 14 | 12 | × 0.5 | × 1.8 | 4 | 4 | 8 | |
| Flak Cannon | Ballistic | M | 4 per target | 6 | — | × 0.8 | × 1.0 | 0 | 1 | 3 | 3 × 3 area. Hit chance 0.6 flat on each ship in the area. Destroys all munitions in the area. |
| Missile Rack | Guided | S | 14 | 16 | — | × 1.0 | × 1.0 | 1 | 1 | 1 | Ammo 8. Munition: speed 6, agility 120, life 4 turns, 1 HP. |
| Torpedo Tube | Guided | L | 60 | 20 | — | × 0.7 | × 2.0 | 6 | 2 | 2 | Ammo 3. Munition: speed 3, agility 20, life 8 turns, 10 HP. |
| Point Defense | Defense | S | — | 3 | — | — | — | — | 1 | 1 per shot | Automatic. Up to 2 shots per turn at munitions in range. Each shot: 50% chance, 10 damage. |

**Design notes for tuning:**

- Lasers use more power and heat. A laser build needs reactors, heat sinks, or radiators.
- Ballistics use little power. A ballistic build can run more shields and engines.
- A fighter has little power. It must select between weapons, shields, and a second engine. Switching modules ON and OFF is part of its play.

### 12.3 Hit chance (lasers and ballistics)

```
trackFactor = tracking / (tracking + target.maneuver)
rangeFactor = 1 − 0.4 × (distance / range)
hit = clamp(BASE_ACC × trackFactor × rangeFactor × heatFactor × debrisFactor, 0.05, 0.95)
```

- `BASE_ACC` = 1.0.
- `heatFactor` = 0.9 if the attacker is Hot, else 1.0.
- `debrisFactor` = 0.8 if the line of fire goes through a debris cell, else 1.0.

**Reference track factors** (from Section 11.4 reference ships):

| Target | Maneuver | Laser (150) | Mass Driver (25–30) | Missile (120) | Torpedo (20) |
|---|---|---|---|---|---|
| Wasp, 2 engines | 90 | 0.63 | 0.25 | 0.57 | 0.18 |
| Starting Shuttle, empty | 37 | 0.80 | 0.40 | 0.76 | 0.35 |
| Light Freighter, laden | 28 | 0.84 | 0.52 | 0.81 | 0.42 |
| Frigate | 27 | 0.85 | 0.53 | 0.82 | 0.43 |
| Battleship | 8 | 0.95 | 0.78 | 0.93 | 0.70 |

### 12.4 Guided munitions

- A guided weapon launches a munition entity on the grid. It does not hit in the same turn.
- Each turn, the munition moves up to `speed` cells toward its target (straight line, around asteroids with A*).
- When it reaches a cell next to the target footprint, roll: `hit = agility / (agility + target.maneuver)`.
- Hit or miss, the munition is then removed.
- Point defense and flak can destroy munitions before they arrive.
- When `life` reaches 0, the munition is removed.

### 12.5 Damage

1. Multiply weapon damage by the "vs shield" value. Shields take this damage first.
2. Convert the remaining damage back to base damage: `remaining = leftover / vsShield`.
3. Multiply the remaining damage by the "vs hull" value.
4. Subtract `max(0, target.armor − armorPierce)`. Minimum 1 damage per hit.
5. Subtract the result from hull HP (or engine value, Section 13.6).

---

## 13. Tactical combat

### 13.1 Battle map

- The battle grid is 70 × 30 cells. The right panel (30 × 40) shows ship status, power, and heat. The bottom 5 rows show the battle log.
- Obstacles: asteroids (`#`, stop movement, fire, and munitions) and debris clouds (`:`, Section 12.3).
- The player starts on the left side. The other side starts on the right side. Reinforcements arrive at a random edge cell.
- The map uses a **template** from the place of the encounter (`battleMaps.json`):

| Template | Where | Layout |
|---|---|---|
| Open Space | Jump points, sector travel far from bodies | 0%–5% obstacles. Long-range weapons are strong. |
| Asteroid Field | Near mines and Desert, Volcanic, or Ice planets | 15%–25% asteroids in clusters. Short range. Agile ships are strong. |
| Debris Field | Near stations | 10%–20% debris clouds. Lower hit chance. Guided weapons are strong. |
| Gas Giant Edge | Near gas giants | One edge has a band of debris cloud cells 4–8 cells deep. Ships in it are harder to hit. |

- Generate obstacles with cellular automata (rot.js `Map.Cellular`) for clusters, then remove obstacles from the start areas.

### 13.2 Multi-cell ships

- Each ship has an anchor cell (top-left) and a footprint mask from its art.
- All footprint cells block movement.
- A hit on any footprint cell is a hit on the ship.
- Distance = Chebyshev distance from the nearest attacker cell to the nearest target cell.
- Ships do not rotate. Ships on the player's left start side face right. Ships on the right side face left (use a mirrored copy with glyph swaps: `<`↔`>`, `/`↔`\`, `(`↔`)`, `[`↔`]`).

### 13.3 Turn order

1. **Player phase:** switch modules ON and OFF. Move up to `move` cells. Fire each weapon that is ON one time, in any order.
2. **Other ships:** each ship switches modules, moves, and fires.
3. **Munitions** move and resolve.
4. **Point defense** fires.
5. **Heat** updates (Section 11.6).
6. **Shields** regenerate.
7. **Fuel** is used (Section 8.5).
8. **Reinforcement** roll (Section 13.5).
9. **Morale** checks (Section 13.8).

### 13.4 Sides and the aggressor

- Each ship is in one side: Player side, Other side, or Neutral.
- The **aggressor** is the side that started the fight:
  - Pirate encounter: the pirates are the aggressor.
  - The player attacks a trader: the player is the aggressor.
- Store the aggressor in the battle state.

### 13.5 Reinforcements

- From turn 3, roll each turn with the chances in Section 10.2 for the battle's sector.
- **Patrol:** a group from the patrol budget (Section 10.8) arrives. It is hostile to the aggressor and allied to the victim.
  - If the player is the aggressor, notoriety increases (Section 15).
- **Pirate:** a group from 0.3 × the pirate budget arrives on the pirate side (minimum 1 Raider). Only in Lawless and Low sectors, only if pirates are in the battle.
- Maximum one reinforcement group per battle per type.

### 13.6 Target selection

- The player can target the **Hull** or the **Engines** of a ship.
- An Engines shot has −15% hit chance. Its hull damage goes to the engine value.
- If the engine value is 0, the ship has `move` 0 and `maneuver` 0. It cannot flee.
- This is the main piracy tool: disable a freighter, then take its cargo when it surrenders.

### 13.7 Battle end

- All ships on the other side are destroyed, have surrendered, or have fled.
- The player flees: the player ship moves onto any map edge cell, with engines ON.
- The flagship hull HP is 0: the next ship becomes the flagship and the battle ends (Section 11.9). If there is no other ship: game over (Section 16).
- The battle reaches 25 turns: it ends as a draw. The sides separate.

**Loot:**
- A destroyed ship drops 30% to 60% of its cargo as cargo pods (`$`). A ship collects a pod when it moves onto it.
- A ship that surrenders gives all its cargo. The player can take as much as fits in the fleet.
- **Prize ship:** if the fleet has fewer than `maxFleetSize` ships, the player can take a surrendered ship into the fleet, with its loadout, its damage, its cargo, and 25% fuel. A prize ship from a non-pirate adds +10 notoriety.
- Battleships cannot be taken as prizes.
- No module salvage in the MVP.

### 13.8 AI

| Behavior | Used by | Rules |
|---|---|---|
| Raider | Pirates | Move to the best range for its weapons and attack the target with most cargo. Retreat to the edge when hull < 30%. |
| Trader | Traders | Move to the nearest edge. Fire only if attacked. |
| Patrol | Patrols, trader escorts | Attack the aggressor side. Keep at best weapon range. Do not retreat. Escorts stay within 6 cells of their trader. |
| Evader | Pirates that are pursued (Section 10.7) | Move to the nearest edge. Fire at the player when in range. Surrender when engine value = 0. |

- **AI power use:** each loadout in `loadouts.json` has a list of modules in priority order. The AI switches ON modules in this order until no power is left. If heat is Hot, it switches OFF its weapon with the highest heat per shot.
- **Morale:** when hull < 25% or engine value = 0, roll for surrender. Chance: Trader 70%, Evader 60%, Raider 40%, Patrol 0%.
- Use rot.js A* for movement. Large ships use the full footprint for path checks.

### 13.9 Combat acceptance checks (`tools/sim-combat.ts`)

Run 500 auto-battles for each pairing. Use the AI for both sides. Use default loadouts.

| Pairing | Expected result |
|---|---|
| Starting Shuttle vs 1 Pirate Raider | Shuttle wins 40%–60% |
| Laser Wasp vs 2 Pirate Raiders | Wasp wins 50%–70% |
| Ballistic Gunship vs laser Gunship, with a Wasp-heavy enemy | Laser build wins more often |
| Ballistic Corvette vs Pirate Frigate | Ballistic build wins more often than a laser Corvette |
| Torpedo Frigate vs Battleship | Torpedo build wins more often than a laser Frigate |
| Single ship vs group of equal TU (5 pairs) | Single ship wins 35%–65% (Section 10.9) |
| Any pairing | Median battle length 4–10 turns |

The last three checks confirm that each weapon family has a role. If a check fails, tune the data, not the formulas.

---

## 14. Contracts and guilds

### 14.1 Principles

- Contracts come from the **real state of the world**: economy deficits, surpluses, and security problems. They do not come from random pairs of locations.
- Each contract shows its **reason** (for example, "Vashti Ice Mine: output 65%, needs Machinery").
- A completed contract **changes the world**: goods go into real market stock, and pirate kills change real security.
- Contract size and danger do not scale with the player. The player selects contracts that fit the fleet. A larger fleet can take larger contracts. This is how goals become more ambitious.

### 14.2 Contract types

| Type | Board | Source in the world | Player task |
|---|---|---|---|
| Supply | Merchants' Guild | A location with a deficit | Find and deliver N tonnes of a commodity. The player buys the goods. |
| Freight | Merchants' Guild | A surplus at A and a deficit at B | Carry supplied cargo from A to B. |
| Sweep | Bounty Guild | A sector with falling security | Destroy or capture N pirate ships in a sector. |
| Named Bounty | Bounty Guild | A low-security sector | Destroy or capture one named pirate group. |

Kill bounties (Section 14.6) also apply to all pirate ships, with no contract.

### 14.3 Generation

Each board makes new offers every 7 days. Offers that the player did not accept are removed. Each board has 3 to 6 offers.

**Step 1: find candidates** within 3 jumps of the board's location.

| Candidate | Condition | Severity |
|---|---|---|
| Deficit | A location needs a commodity (recipe input or population use) and `stock < 0.6 × target` | `1 − stock / target` |
| Capital need | A producer has `K < 0.75 × K_ref` | `1 − K / K_ref` |
| Input starvation | A producer has `inputFactor < 0.7` for its hard input | `1 − inputFactor` (added to the deficit severity of that input) |
| Surplus | A location has `stock > 1.4 × target` of a commodity that it makes | `stock / target − 1` |
| Security problem | A sector with `securityValue ≤ baseline − 10`, or security level ≤ 1 | `(baseline − value) / 50`, minimum 0.2 |

**Step 2: score.** `score = severity × dailyNeed × basePrice × location size`. For security problems: `score = severity × 1000`.

**Step 3: select.** Select candidates at random, with weight = score. Rules:

- Maximum 1 offer for each pair of location and commodity.
- If possible, each Merchants' Guild board has at least 1 Raw or Processed offer and at least 1 Advanced offer.
- If possible, each Merchants' Guild board has at least 1 Small offer (Section 14.4).

**Step 4: build the offer** (Section 14.4 and 14.5).

### 14.4 Merchants' Guild contracts

**Market information (free):** live prices for all locations within 2 jumps, 14-day trend arrows, and chain alerts (for example, "Kaveri smelter: no Iron Ore, output 40%"). This updates the Trade Ledger (Section 17.6).

**Size classes:**

| Class | Tonnes | Standing needed (Freight only) |
|---|---|---|
| Small | 10 | 0 |
| Medium | 30 | 3 |
| Large | 80 | 8 |

- Quantity = the largest class that is ≤ the deficit (or surplus) in tonnes. Minimum: Small.
- **Merchants' Guild standing** = completed contracts − 2 × failed contracts. Minimum 0. Standing applies at all Merchants' Guilds.

**Supply contract:**

| Field | Rule |
|---|---|
| Destination | The deficit location |
| Commodity and quantity | From the candidate and size class |
| Price per unit | Destination sell price at posting × (1 + 0.10 + 0.20 × severity). Fixed at posting. |
| Deadline | Day of posting + 8 + 4 × jumps from the board to the destination |
| Delivery | Partial deliveries are allowed. Each delivery is paid at once. |
| Deposit | None |
| Fail | Standing −2. No credit penalty. |
| Effect | Delivered units go into the destination market stock. Machinery then goes into installed machinery (Section 9.5). |

- The contract price is fixed, and has no price slope (Section 9.10). For large quantities, it pays more than the open market.

**Freight contract:**

| Field | Rule |
|---|---|
| Pickup | The surplus location A (within 2 jumps of the board) |
| Destination | A location B with a deficit of the same commodity, 1 to 3 jumps from A |
| Cargo | Supplied at A. It is removed from A's stock at pickup. |
| Deposit | 25% of cargo value at posting, paid at pickup |
| Fee | `tonnes × jumps × feePerTonneJump × riskMult + 0.05 × cargo value`. `feePerTonneJump` = 4 cr. `riskMult` = 1 + 0.3 × (4 − lowest security level on the shortest path). |
| Deadline | Day of pickup + 5 + 3 × jumps from A to B |
| Fail | Deposit lost. Standing −2. Cargo lost to pirates also counts as a fail. |
| Effect | Cargo goes into B's market stock. |

### 14.5 Bounty Guild contracts

**Sweep contract:**

| Field | Rule |
|---|---|
| Sector | The security problem sector (within 3 jumps of the board) |
| Task | Destroy or capture N pirate ships in the sector. N = 3 to 6. |
| Deadline | Day of acceptance + 25 |
| Reward | `N × averageShipTU(sector templates) × 40 cr × (1 + 0.25 × (4 − security level))` |
| Effect | Normal security changes for each kill, plus baseline +2 on completion |
| Fail | No penalty |

- Hunt (Section 8.8) helps the player find pirates in the sector.
- Maximum 1 active Sweep.

### 14.6 Named bounties and kill bounties

**Named bounty:**

| Field | Rule |
|---|---|
| Sector | A sector within 3 jumps with security level ≤ 2 |
| Threat | Budget = the sector's maximum pirate budget × random(1.5, 3.0). Select from all pirate templates, also Frigate Group and Battle Group (Section 10.6). |
| Loadouts | Tier 2 modules. Tier 3 if TU ≥ 150. |
| Name | From the name generator: a captain name, an epithet, and a ship name ("Oriel the Saltless, aboard the *Low Tide*") |
| Encounter | Guaranteed on the next arrival in the sector, or on the first Hunt in the sector |
| Reward | `TU × 150 cr × (1 + 0.25 × (4 − security level))` |
| Expiry | 28 days after the board posts it |
| Effect | Security +5 and baseline +1 (Section 10.3). Notoriety −10. |

- Each Bounty Guild keeps 2 to 4 named bounties. The board shows each threat band, so the player can see which targets are too strong.
- The most valuable named bounties (Frigate Group, Battle Group) are only in Lawless and Low sectors. They are the late-game goals for a combat player.

**Kill bounty:** each pirate ship that the player destroys or captures gives `shipTU × 25 cr × (1 + 0.25 × (4 − security level))`. The player collects the total at any Bounty Guild. Wanted players are not paid (Section 15).

### 14.7 Limits

- Maximum 4 active Merchants' Guild contracts, 3 named bounties, and 1 Sweep.

### 14.8 Board display

Each offer shows: type, reason, route (with jumps), lowest security level and threat band on the route, tonnes, reward, deadline, and an estimate of profit per day for the current fleet.

### 14.9 Contract acceptance checks (`sim-economy.ts`)

Generate boards every 7 days for 1000 days on 20 seeds.

- 90% of boards have 3 or more offers.
- 100% of Supply and Freight offers point to a real deficit at posting (unit test).
- For the greedy trader bot, the median Supply contract gives 1.0× to 1.5× the profit per day of the best known open-market route of similar length. Contracts are good, but they do not replace trade.
- A completed Machinery Supply contract to a producer with low K increases its output.

---

## 15. Notoriety

Notoriety is one value from 0 to 100.

| Action | Change |
|---|---|
| Attack a non-pirate ship | +15 |
| Destroy a non-pirate ship | +10 more |
| Take a non-pirate ship as a prize | +10 more |
| Be the aggressor when a patrol arrives | +10 |
| Destroy or capture a pirate | −3 |
| Complete a named bounty | −10 |
| Each day | −0.3 |

| Level | Range | Effect |
|---|---|---|
| Clean | 0–24 | Normal |
| Suspect | 25–49 | Locations in Secure sectors refuse docking |
| Wanted | 50–100 | Patrols attack the player in all encounters. Locations in High and Secure sectors refuse docking. Bounty Guilds do not pay. |

Pirate Havens let the player dock at all levels.

---

## 16. Career, score, and failure

- **End:** day 730, or "Retire" at any location, or ship destroyed.
- **Last ship destroyed:** game over. The score uses only credits (ships and cargo are lost). If other ships are left, the career continues (Section 11.9).
- **Score:** net worth = credits + 60% of hull and module value of all fleet ships + cargo value at local prices.
- **Titles:**

| Condition | Title |
|---|---|
| Net worth < 20,000 | Drifter |
| 20,000–99,999 | Hauler |
| 100,000–499,999 | Merchant Captain |
| 500,000 or more | Sector Magnate |
| Notoriety 50 or more at the end (replaces the title above) | Dread Pirate |
| 10 or more named bounties (second title) | Pirate Hunter |
| A sector raised from Lawless or Low to High or Secure (second title) | Warden of [sector name] |

- Show a career summary: days, net worth, jumps, cargo traded, battles won, ships captured, bounties, security change per sector, title.

---

## 17. User interface

### 17.1 Screens

1. **Title:** New game (with seed input), Continue, Help.
2. **Region map:** sectors, lanes, security level and trend, threat band (Section 10.6), player position.
3. **Sector map:** star, orbit rings, locations, jump points, player ship.
4. **Location:** one tab for each service at this location.
5. **Outfitter:** slot list on the left, module shop on the right, stat panel at the bottom (Section 17.3).
6. **Shipyard:** hulls for sale with base values and price after trade-in.
7. **Fleet and cargo:** list of fleet ships (flagship first). For each ship: loadout, derived stats, fuel, cargo with purchase price per unit. Actions at a location: select flagship, move cargo, sell ship.
8. **Trade Ledger:** Section 17.6.
9. **Codex:** the production chain diagram, and each commodity's tier, sources, and buyers.
10. **Hail:** encounter text and options.
11. **Combat:** Section 13.
12. **Log:** full message history.
13. **Career end:** Section 16.

### 17.2 Map glyphs

- **Region map:** each sector is a `*` in its star color. A number shows the security level. A row of `!` (1 to 5) shows the threat band. Lanes are lines of `.`.
- **Sector map:** star `*` at the center. Orbit rings with `·` (or `.`). Planets: `o` (size 1), `O` (size 2–3). Stations: `#` (or the first letter of the type). Jump points: `%`. Player: bright `@`.
- **Location color** by tech level: 1 = grey, 2 = white, 3 = cyan.
- **Route view:** the player selects one commodity. Each known location shows its price and a color for the margin. Locations that make the commodity have a `+` mark. Locations that need it have a `-` mark.

### 17.3 Outfitter stat panel

The Outfitter is the most important screen for loadout planning. When the player selects a module, the panel shows the old value and the new value for each stat:

```
Mass        48 t  ->  50 t
TWR         1.67  ->  2.20
Move        5     ->  5
Maneuver    49    ->  62   (+13)
Power       15/19 ->  17/19
Heat/turn   +9    ->  +10   Cooling 4
Fuel/jump   5.8   ->  6.0
Cargo       30 t  ->  30 t
```

- Green for better values. Red for worse values.
- Also show "Combat power if all ON: 23/19 — switch modules OFF in combat" when the draw is more than the supply.

### 17.4 Market tab

- Show only the commodities that this location trades (4 to 6).
- Mark each commodity **Sells** (the location makes it) or **Buys** (the location needs it).
- Group by tier. Use one color for each tier.
- Show price per unit and price per tonne.
- Show the best known sell price for each commodity and where it is.

### 17.5 Input

- Keyboard first. All actions have a key. Show keys on screen.
- Mouse: click to select map targets, menu items, and combat target cells.
- In combat, number keys switch modules ON and OFF.
- `Esc` goes back one screen. `?` shows help for the current screen.

### 17.6 Trade Ledger

The Trade Ledger is the main trade planning screen. It uses only information that the player has (Section 9.12).

| Part | Content |
|---|---|
| Price table | Rows: commodities, grouped by tier. Columns: known locations, sorted by jumps from the player. Each cell: buy or sell price, a color for its difference from the region average, and a trend arrow if known. |
| Filters | Tier. Distance (1, 2, or 3 jumps). "Goods sold here". |
| Route planner | Select a start and a destination, or "best from here". It shows: margin per tonne, profit for a full hold, fuel cost, trip days, and **profit per day**. It shows if the route is **cargo-limited** or **capital-limited**. |
| Best routes | The 5 best known routes by profit per day, for the current ship and credits. |
| Chain alerts | Alerts from Merchants' Guilds. |
| Information age | The day each column was updated. |

- Profit per day is the most important value. It lets the player compare a short raw-goods route with a long high-value route.
- Calculate route values with the fleet's total free capacity, the fuel use of all ships, the speed of the slowest ship, the daily upkeep, and the player's credits.

### 17.7 Save

- Autosave each time the player docks.
- Save on "Quit to title".
- One save slot in MVP. Save the seed and `saveVersion`.

---

## 18. Art and animation

**Source:** Claude Design makes the final art, effects, icons, and palette from `space-sim-visual-brief.md`. Load them from data files (`/data/art/ships.json`, `/data/art/effects.json`, `/data/art/icons.json`, `/data/art/palette.json`). Read each ship's footprint from its art. Until the final art exists, use the placeholder art below.

| Hull | Size class |
|---|---|
| Shuttle, Wasp | Small |
| Courier, Gunship | Medium |
| Light Freighter, Heavy Freighter, Corvette, Frigate | Large |
| Battleship | Capital |

### 18.1 Placeholder ship art (faces right)

```
Shuttle / Wasp (1x1)        >

Courier / Gunship (3x1)     -=>

Freighter (6x3)              [##]
                            =[##]>
                             [##]

Corvette / Frigate (7x3)     /=\
                            <=###=>
                             \=/

Battleship (15x5)               /=====\
                             =<|#######|>
                            <==|###O###|==>
                             =<|#######|>
                                \=====/
```

- Store each hull's art as a text block. A space character is not part of the footprint.
- On the maps, all ships show as one glyph.
- Munitions: missile `o`, torpedo `0`. Cargo pod `$`.

### 18.2 Colors

| Role | Color |
|---|---|
| Player | Cyan |
| Pirate | Red |
| Trader | Yellow |
| Patrol | Blue |
| Neutral | Grey |
| Cargo pod | Green |

### 18.3 Damage and heat display

- Hull 100%–67%: normal glyphs.
- Hull 66%–34%: 30% of footprint cells change to `%`.
- Hull 33%–1%: 60% of footprint cells change to `%` or `.`. Colors become darker.
- Select damaged cells with the seeded RNG, so they do not change each frame.
- A Hot ship has an orange tint. An Overheated ship flashes red.

### 18.4 Effects

| Effect | Animation |
|---|---|
| Laser shot | Line of `-` or `=` from attacker to target, 120 ms |
| Ballistic shot | One `*` that moves fast along the line, 15 ms per cell |
| Flak | 3 × 3 area of `+` then `.`, 150 ms |
| Missile and torpedo | Glyph with a `.` trail, 30 ms per cell |
| Point defense | Short `'` line to the munition, then `*` |
| Shield hit | Target cells flash in shield color, 100 ms |
| Explosion | 3 frames: `*` → `+` → `.`, spread 1 cell, 300 ms |
| Reinforcement arrival | Ships appear with a `=` trail from the edge |
| Map travel | Ship glyph moves along the path |

- Effects play from a queue after the turn resolves.
- Total effect time per turn: 1.2 s or less.
- `Space` skips the current animations.

---

## 19. Milestones

**Risk:** Days 2 and 3 are full. Use the Cut list (Section 20) early if needed.

| Day | Work | Acceptance checks |
|---|---|---|
| 1 | Project setup, deploy pipeline, display, seeded RNG, debug panel, all data schemas (including recipes and population), generator steps 1–3 (topology, development, bodies), region map, sector map, travel, time, fuel, tow and recovery fee. Fleet-ready data model (list of ships). | The same seed gives the same world. The player can travel in a sector and jump between sectors. Fuel goes down. A tow happens at 0 fuel. The build runs on GitHub Pages. |
| 2 | Generator steps 4–9 (blueprint, assign, sizes, services, validate, repair). Economy tick: recipes, population, installed machinery, background flow, off-map rules, prices. `gen-report.ts`, `sim-economy.ts`. Stretch: NPC agents. | Section 6.11 and Section 9.13 pass. Recipe and wear unit tests pass. |
| 3 | Market tab, Refuel (Hydrogen), Mechanic, Merchants' Guild information, Trade Ledger, `sim-trader.ts`. Hulls, modules, tiers, loadout rules, derived stats, Outfitter and Shipyard screens with the stat panel, `ship-report.ts`. | The greedy trader bot buys a Light Freighter between day 60 and day 120 on 15 of 20 seeds. `ship-report.ts` gives the reference values in 11.4 (±1). All default loadouts are valid. |
| 4 | Combat core: grid, obstacles, footprints, movement, power toggles, heat, lasers, ballistics, flak, shields, armor, hit formula, engine targeting, Raider and Trader AI, `sim-combat.ts`. | Player can win, lose, and flee against 1–3 Raiders. Power and heat rules work. The first two pairings in 13.9 pass. |
| 5 | Guided munitions, point defense, threat units, threat budget, templates, encounters, pirates judge the odds, hail screen, aggressor rule, patrol and pirate reinforcements, Patrol and Evader AI, battle map templates, Hunt, surrender and loot, sector security changes, notoriety. | All pairings in 13.9 pass. Section 10.9 passes. Patrols fight against the aggressor. Pirate kills raise sector security. |
| 6 | Fleet (Section 11.9): buy and sell ships, flagship select, fleet travel and fuel, shared cargo, move cargo, upkeep, prize ships, flagship loss. Fleet screen. Trade Ledger with fleet values. **Feature freeze at the end of this day.** | A fleet of 4 ships can travel, trade, and refuel. Flagship loss gives a new flagship. A prize ship joins the fleet. Upkeep is paid. `sim-trader.ts` with a 2-ship fleet earns more per day than with 1 ship, after upkeep. |
| 7 | Contract generator (Supply, Freight, Sweep, Named Bounty), kill bounties, standing, board display, market events, career end, score and titles, save and load, balance pass with all tools. | Section 14.9 passes. A full career to day 730 runs without errors. Save and load give the same state. |
| 8 | Codex, help screens, animation polish, damage and heat display, bug fixes, final deploy. | No known crash bugs. All acceptance checks pass. |

---

## 20. Cut list (use only if a milestone is late)

Remove features in this order. Write each cut in `DECISIONS.md`.

1. NPC agents (stretch goal; keep background flow)
2. Pirate reinforcements (keep patrol reinforcements)
3. Torpedoes (keep missiles)
4. Codex screen
5. Market events
6. Heat Sinks and Radiators as modules (keep hull heat values)
7. Flak Cannon
8. Biolab, Medicine, Composite Works, and Composites (10 commodities stay)
9. Maneuvering Thrusters
10. Module tiers 2 and 3 (tier 1 only; tech level then gates hulls only)
11. Generator repair step (keep reject and retry)
12. Prize ships (keep fleet purchase at Shipyards)
13. Battle map templates (keep one random layout)
14. Sweep contracts
15. Freight contracts (keep Supply contracts, market information, and bounties)

Do not cut: the threat budget, the loadout model, power toggles, the three weapon families, sector security, patrol reinforcements, recipes, installed machinery, background trade flow, or the Trade Ledger. These are the core of the design.

---

## 21. Parked list (after MVP)

Add these only after the MVP is complete and stable. Add one item at a time.

1. NPC trade agents, if not built as a stretch goal (Section 9.9)
2. Escort missions
3. Contraband and scans
4. Factions, faction reputation, faction territory
5. Player-owned locations and income
6. Development and terraforming
7. Module storage and module damage
8. Fleet combat with orders (Appendix B)
9. Producer growth: a producer type with high prices for a long time grows one size step
10. Insurance and escape pods
11. Crew and officers
12. Bounty hunters that hunt the player
13. Named pirates that escape and return with stronger ships
14. Strongholds: pirate bases in Lawless sectors that the player can attack (a fleet-scale goal; goes with factions)
15. Planet surfaces
16. Sound

---

## 22. Balance targets

| Item | Target |
|---|---|
| Shuttle profit on a good raw-goods route | 100–250 cr per day |
| Early game limit | Cargo mass (raw goods fill the hold) |
| Late game limit | Capital (a hold of advanced goods costs 40,000 cr or more) |
| Machinery wear cost | Less than 20% of each producer's output value |
| Fleet upkeep | A second freighter adds 30%–60% to profit per day after upkeep. A fourth ship adds 10%–25%. |
| First hull upgrade | Day 60–120 |
| Starting ship range | 4–6 jumps on a full tank, empty |
| Battle length | 4–10 turns (median) |
| Encounters | 1 per 3–4 trips at security level 1–2 |
| Danger by place | A starting Shuttle loses most fights in Lawless Frontier sectors, and wins most fights in High and Secure sectors |
| Late-game combat goal | A Battle Group named bounty needs a strong Frigate build, and pays 75,000 cr or more |
| Security change | About 15 pirate kills in one sector raise it by one level for a long time |
| Good trader net worth at day 730 | 250,000–600,000 cr |
| Good pirate net worth at day 730 | Similar to a trader, with more risk |

---

## 23. Definition of done (MVP)

- A player can start a new career, trade, change the ship loadout, build a fleet, fight, become a pirate or a pirate hunter, change a sector's security, and reach the career end screen.
- All acceptance checks in Sections 6.11, 8.7, 9.13, 10.9, 13.9, 14.9, and 19 pass.
- The game runs in a desktop browser from GitHub Pages.
- `PROGRESS.md` and `DECISIONS.md` are up to date.

---

## Appendix A. Other speed and maneuverability formulas

Section 11.4 uses option B. These are the other options, if tuning needs them. All options use `TWR = thrust / mass` and the inertia correction `(M_REF / mass)^(1/3)`.

| Option | Maneuver formula | Result |
|---|---|---|
| A. Exponential | `100 × (1 − exp(−agility / 1.2))` | Smooth. Large ships keep more maneuver (Battleship ≈ 22). |
| **B. Hill S-curve (selected)** | `100 × agility² / (agility² + 1)` | Widest spread. Large ships are very slow to turn (Battleship ≈ 8). Clear roles. |
| C. Class cap | `cap(massClass) × (1 − exp(−TWR))`, cap 90 / 65 / 40 / 20 | Easy to read and tune. Has sharp steps at class borders. |

To make large ships more agile, decrease the exponent `1/3` (for example, `1/4`). To make the S-curve steeper, increase the power `2` in option B.

---

## Appendix B. Fleet design notes

Option A (flagship-only combat) is in the MVP. Section 11.9 has its rules. This appendix keeps the notes for Option B (fleet combat), after the MVP.

The data model for both options:

- `Actor.fleet` is a list of ships. `Actor.flagship` is an index. In the MVP, the list has 1 ship.
- Each ship has its own loadout, cargo, fuel, HP, and engine value.
- Write travel, fuel, market, and service code for "each ship in the fleet", even when there is only one ship.

### B.1 Option A: flagship-only combat (in the MVP, see Section 11.9)

| Rule | Description |
|---|---|
| Travel | The fleet moves together. The slowest ship sets the travel time. Each ship uses its own fuel. |
| Cargo | The Market and Trade Ledger use the total fleet capacity. Cargo goes to the ship with free capacity, heavy goods first to the ship with the most thrust. |
| Combat | Only the flagship fights. The other ships stay off the battle map. |
| Flagship lost | The next ship becomes the flagship. The career continues. The lost ship's cargo is lost. |
| Upkeep | Each ship costs `upkeepPerShip × hull size` per day. This stops very large fleets. |
| Prizes | A pirate or trader that surrenders can join the fleet as a prize ship. The player can keep it or sell it at a Shipyard. |
| Risk | Pirates take cargo from a random fleet ship if the flagship flees. |
| Cost | About 1 day of work. Low tuning risk. |

### B.2 Option B: fleet combat

| Rule | Description |
|---|---|
| Fleet size | Limited by **command points** (for example, 6). Each hull costs points by size: 1×1 = 1, 3×1 = 2, 6×3 and 7×3 = 3, 15×5 = 6. |
| Control | The player controls the flagship directly. Other player ships use AI with orders: Attack target, Guard ship, Hold position, Retreat. |
| AI | Reuse the Patrol AI with order targets. |
| Encounters | Enemy groups scale with fleet strength. |
| Cost | About 3 to 4 days of work, with high tuning risk (turn length, AI, encounter scaling, animation time). |

Build Option A first. Option B reuses all of Option A.

