# M3 (Day 3): Trade, services, ships, and outfitting

**Goal:** The player docks, trades, refuels, and repairs. The player plans routes with the Trade Ledger and live prices from Merchants' Guilds. The player changes the ship loadout at the Outfitter and buys a new hull at the Shipyard. A headless trader bot earns a Light Freighter in 60 to 120 days.

**Brief sections:** §7.3, §7.4, §8.6 (debt), §8.8 (Wait), §9.1 (fuel, Food loss), §9.12, §11.1–11.8, §12.2 (weapon data), §17.1 (no commodity limit, Q-03), §17.2 (route view), §17.3, §17.4, §17.6.

**Depends on:** M1 (travel, ship stats part 1), M2 (markets, prices, trade quotes, services in the world).

**Risk:** Day 3 is full (§19). Use the Cut list early if needed.

---

## 1. Services (SVC)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M3-SVC-01 | Each service is one file in `src/services/`. Each service function takes an `Actor` and a `Location`. `services.json` gives the rules for which location has which service. | §7.4, G-07 | I |
| M3-SVC-02 | **Location screen.** One tab for each service at the location. | §17.1 | M |
| M3-SVC-03 | **Refuel.** Fuel price = local Hydrogen buy price ÷ `fuelPerHydrogen`. Refuel fills all fleet ships. It removes the Hydrogen it uses from the local stock, unit by unit (Q-02). | §7.4, §9.1, Q-02 | T |
| M3-SVC-04 | **Market.** Buy and sell with unit-by-unit quotes (M2-ECON-14). Bought cargo goes to fleet ships with the allocation rule of §11.9 (flagship last; heavy goods first to the ship with the most thrust). | §7.4, §9.10, §11.9 | T |
| M3-SVC-05 | **Market limits.** A buy is limited by credits, free cargo tonnes of the fleet, and local stock. | §9.1 | T |
| M3-SVC-06 | **Mechanic.** Repair hull HP, armor plating HP, and engine value of one selected ship, for a price per point (`services.json`). Refill of guided munitions comes in M5. | §7.4 | T |
| M3-SVC-07 | **Outfitter.** Buy, sell, and install modules on one selected ship. Sell price is 60% of the module price (Q-13). No module storage. | §7.4, §3.2, Q-13 | T |
| M3-SVC-08 | **Shipyard.** Buy a hull. Trade in the old hull at 60% of the hull price and 60% of each module price. The new hull has an empty loadout. The trade-in is blocked while the old ship has cargo (Q-14). From M6, a bought hull can also join the fleet. | §7.4, §11.1, Q-14 | T |
| M3-SVC-09 | **Tech level.** The Shipyard and the Outfitter sell only hulls and modules with tier ≤ location tech level. Pirate Havens sell tiers 1 to 3 at 130% price. | §7.3 | T |
| M3-SVC-10 | **Debt.** While credits are below 0, the actor cannot buy hulls, modules, or contracts. Each sale pays the debt first. | §8.6 | T |
| M3-SVC-11 | **Merchants' Guild information.** Docking at a Merchants' Guild gives live prices for all locations within 2 jumps, a 14-day trend arrow for each price, and chain alerts. It is free. | §7.4, §9.12, §14.4 | T |
| M3-SVC-12 | **Chain alerts.** An alert shows a producer with low output and its cause, for example "Kaveri smelter: no Iron Ore, output 40%". It also shows population deficits (§9.4). | §9.4, §14.4 | T |
| M3-SVC-13 | **Wait.** At a docked location, pass 1 to 30 days. The economy runs. No encounters. (Upkeep is added in M6.) | §8.8 | T |
| M3-SVC-14 | **Food loss.** Food in cargo loses 1% of its quantity per day. | §9.1 | T |
| M3-SVC-15 | Replace the M1 placeholder prices (tow fee, cargo sale) with local market prices. | §8.6 | T |

## 2. Price information and map knowledge (INFO)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M3-INFO-01 | The actor stores known prices: for each location and commodity, the last price and the day it was known. | §9.12 | T |
| M3-INFO-02 | Docked location: live prices. Merchants' Guild: live prices within 2 jumps. Other locations: last known price with its day. No information: "Unknown". | §9.12 | T |
| M3-INFO-03 | At the start, the player knows all sectors, lanes, and security levels. | §9.12 | T |
| M3-INFO-04 | The player knows the locations in a sector after the first visit to that sector, or from a Merchants' Guild within 2 jumps. Unknown locations do not show on the sector map. | §9.12 | T, M |

## 3. Ships: hulls, modules, loadouts, and stats (SHIP)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M3-SHIP-01 | `hulls.json` has all values of §11.1: HP, armor, base power, mass, heat capacity, base cooling, hardpoints S/M/L, internal slots S/M/L, size class, tech, price. The art is in `/data/art/ships.json` (§18). Engine value = 20% of hull HP. | §11.1, §18 | T |
| M3-SHIP-02 | `modules.json` has all internal modules (§11.7) and all weapons and point defense (§12.2), with base values per size for tier 1. Weapon mass, price, and heat per turn come from Q-09. | §11.7, §12.2, Q-09 | T |
| M3-SHIP-03 | Tier multipliers (§11.7 table) apply to main value, power, heat, mass, and price. Engine tiers 2 and 3 have fuel rate 0.9 and 0.8. | §11.7 | T |
| M3-SHIP-04 | **Slots.** Hardpoints hold weapons and point defense. Internal slots hold all other modules. A module fits a slot of the same size or a larger size. | §11.1 | T |
| M3-SHIP-05 | **Required modules.** A ship can leave a location only if it has at least 1 engine, power supply ≥ draw of all engines, and cargo mass ≤ cargo capacity. | §11.2 | T |
| M3-SHIP-06 | **Power.** Supply = hull base power + reactors. Draw = sum of active modules that are ON. Passive modules draw 0. | §11.5 | T |
| M3-SHIP-07 | **Heat values.** Capacity = hull + Heat Sinks. Cooling = hull + Radiators. Heat per turn of modules ON. (Heat rules in combat are an M4 item.) | §11.6 | T |
| M3-SHIP-08 | **Speed and maneuver.** Complete `ship/stats.ts` with `agility`, `maneuver`, and `thrusterMult` (§11.4). No engine ON or engine value 0 gives `move` 0 and `maneuver` 0. | §11.4 | T |
| M3-SHIP-09 | **Other derived stats.** Fuel per jump (average lane), shield capacity and regen, armor, total HP, durability (§10.5, for M5). | §10.5, §17.3 | T |
| M3-SHIP-10 | **Travel power setting.** Outside combat, all engines are ON. Other modules use the last combat setting, or the default travel setting. | §11.5 | T |
| M3-SHIP-11 | `loadouts.json` has default loadouts for: the starting Shuttle, all player hulls, Pirate Raider (Wasp), Pirate Gunship, Pirate Corvette, Pirate Frigate, Battleship, Patrol Cutter (Gunship), Light Freighter trader, Heavy Freighter trader, Escort Wasp, and the build variants for §13.9 (laser Wasp, laser and ballistic Gunship, laser and ballistic Corvette, laser and torpedo Frigate). | §11.1, §13.9 | T |
| M3-SHIP-12 | Each loadout has a list of modules in priority order, for AI power use (§13.8). | §13.8 | I |
| M3-SHIP-13 | All default loadouts are valid (M3-SHIP-04, M3-SHIP-05). | §19 | T |
| M3-SHIP-14 | The default loadouts give the masses in the §11.4 reference table. | §11.4 | T |

## 4. Screens (UI)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M3-UI-01 | **Market tab.** Show only the commodities this location trades. Mark each one Sells or Buys. Group by tier, with the tier letter and color from `style.json` (`tiers`). Show price per unit and per tonne. Show the best known sell price and where it is. A location can trade up to 12 commodities (no limit, Q-03): the list must fit or scroll. | §17.4, §18 | M |
| M3-UI-02 | **Outfitter.** Slot list on the left, module shop on the right, stat panel at the bottom. The selected ship's portrait (`ships.yaml`) shows above the slot list. Slot marks follow Q-29. Each module shows its icon from `data/art/modules.json`: family mark, two glyphs, size letter (`hi`), tier digit (tech color). | §17.1, §17.3, §18, Q-29 | M |
| M3-UI-03 | **Stat panel.** When the player selects a module, show old → new for: mass, TWR, move, maneuver, power (draw/supply), heat per turn and cooling, fuel per jump, cargo. Green for better, red for worse. | §17.3 | M |
| M3-UI-04 | **Outfitter warnings.** Red warning when the loadout fails a required-module rule. Yellow warning "Combat power if all ON: X/Y — switch modules OFF in combat" when total draw > supply. | §11.2, §17.3 | M |
| M3-UI-05 | **Shipyard.** Hulls for sale with base values and price after trade-in. | §17.1 | M |
| M3-UI-06 | **Fleet and cargo screen.** For each ship (1 in M3): portrait, loadout, derived stats, fuel, cargo with purchase price per unit. | §17.1, §18 | M |
| M3-UI-07 | **Trade Ledger, price table.** Rows: commodities by tier. Columns: known locations, sorted by jumps from the player. Each cell: buy or sell price, a color for the difference from the region average, a trend arrow if known. | §17.6 | M |
| M3-UI-08 | **Trade Ledger, filters.** Tier. Distance (1, 2, 3 jumps). "Goods sold here". | §17.6 | M |
| M3-UI-09 | **Trade Ledger, route planner.** Start and destination, or "best from here". Show margin per tonne, profit for a full hold, fuel cost, trip days, profit per day, and "cargo-limited" or "capital-limited". | §17.6 | M, T |
| M3-UI-10 | **Trade Ledger, best routes.** The 5 best known routes by profit per day for the current ship and credits. | §17.6 | M, T |
| M3-UI-11 | **Trade Ledger, chain alerts and information age.** Show alerts from Merchants' Guilds and the day each column was updated. | §17.6 | M |
| M3-UI-12 | **Route view.** The player selects one commodity on a map. Each known location shows its price and a margin color. `+` marks locations that make the commodity. `-` marks locations that need it. | §17.2 | M |
| M3-UI-13 | The route calculation code is in the simulation (not the UI), so `sim-trader.ts` can use it. | §0.5 | I |

## 5. Tools (TOOL)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M3-TOOL-01 | `tools/sim-trader.ts` runs a greedy trader bot. The bot is an Actor. It uses the same services, travel, and information rules as the player. | §4.1, G-07 | S |
| M3-TOOL-02 | The bot selects the best known route by profit per day, refuels, and buys a better hull when it can pay for it and keep trade capital. | §19 | S |
| M3-TOOL-03 | `sim-trader.ts` reports the day of the first hull upgrade on each of 20 seeds, and profit per day over time. | §19, §22 | S |
| M3-TOOL-04 | `tools/ship-report.ts` prints a table like §11.4 for all hulls and default loadouts: mass, TWR, agility, maneuver, move, power, heat, fuel per jump, cargo. It compares the §11.4 reference rows and prints PASS or FAIL (±1). | §11.4, §19 | S |
| M3-TOOL-05 | `ship-report.ts` prints fuel per jump for the empty Shuttle and the laden Heavy Freighter, and their ratio (§8.7, Q-01). It prints the range in jumps of the starting ship. | §8.7 | S |
| M3-TOOL-06 | Debug panel: show the selected ship's derived stats. | §4.3 | M |

## 6. Tests (minimum)

- Loadout rules: slot fit by size, required modules, power warning.
- Ship stats against all 12 rows of the §11.4 table (±1 for maneuver and move, ±0.01 for TWR and agility).
- Tier multipliers.
- Trade-in value and Outfitter sell value.
- Refuel price, Hydrogen use, refuel of all fleet ships.
- Market buy and sell: unit-by-unit price, cargo allocation, limits, debt rule.
- Food loss in cargo.
- Price information: live, Merchants' Guild range, last known, unknown.
- Map knowledge: sectors known at start, locations known after visit.
- Route planner: profit per day and the cargo-limited or capital-limited flag.
- Fuel checks: starting ship 4–6 jumps; Heavy Freighter ratio (§8.7).

## 7. Exit checks

| # | Check | Source | Verify |
|---|---|---|---|
| 1 | The greedy trader bot buys a Light Freighter: the median upgrade day is in day 60–120, and 15 of 20 seeds upgrade by day 150 (owner, Q-36). The count of seeds in day 60–120 is a report. | §19, §22, Q-36 | S (`sim-trader.ts`) |
| 2 | `ship-report.ts` gives the reference values in §11.4 (±1). | §19 | S |
| 3 | All default loadouts are valid. | §19 | T |
| 4 | Starting ship range is 4–6 jumps, empty, on a full tank. | §8.7 | S, T |
| 5 | A laden Heavy Freighter uses about 3× the fuel per jump of an empty Shuttle, with `fuelMassExponent` (Q-01). | §8.7, Q-01 | S, T |
| 6 | `PROGRESS.md` is updated. | §0.9 | I |

**Monitor (not a gate):** Shuttle profit on a good raw-goods route is 100–250 cr per day (§22). The early-game limit is cargo mass (§22).

## 8. Open questions for this milestone

Q-01 (fuel ratio, decided), Q-02 (fuel per Hydrogen), Q-09 (weapon data), Q-13 (Outfitter sell price), Q-14 (trade-in with cargo). From the M3 results: Q-36 (first hull upgrade check) and Q-37 (Light Freighter slots). See [README.md](README.md#8-open-questions-conflicts-and-gaps-in-the-brief).

## 9. Not in this milestone

Combat (M4). Threat units (M5). Bounty Guild (M7). Fleet of more than one ship (M6). Contracts on the Merchants' Guild board (M7).
