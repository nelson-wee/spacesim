# M6 (Day 6): Fleet

**Goal:** The player owns up to 4 ships. Only the flagship fights. The other ships carry cargo and are backups. Ships come from the Shipyard or as prize ships. Each non-flagship ship costs upkeep. **Feature freeze at the end of this day.**

**Brief sections:** §8.2 (fleets), §8.6 (fleet tow), §11.9, §13.7 (prize ships, flagship loss), §15 (prize notoriety), §17.1 (7), §17.6 (fleet values), Appendix B.1. Owner additions (Q-50): forced surrender, boarding of surrendered ships, and fleet management after a battle and at any location. The disable rule of Q-49 is not used.

**Depends on:** M3 (Shipyard, Market, Trade Ledger), M5 (encounters, surrender, loot).

---

## 1. Fleet rules (FLEET)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M6-FLEET-01 | The fleet has 1 to `maxFleetSize` (4) ships. | §11.9 | T |
| M6-FLEET-02 | **Buy.** A hull bought at a Shipyard joins the fleet with an empty loadout. Trade-in (M3) stays available. | §11.9 | T |
| M6-FLEET-03 | **Sell.** At a Shipyard, sell a non-flagship ship at its trade-in value (§11.1). The ship must have no cargo (Q-14). | §11.9 | T |
| M6-FLEET-04 | **Flagship.** The player selects a different flagship at any docked location. | §11.9 | T |
| M6-FLEET-05 | **Travel.** The fleet moves together. The ship with the lowest `move` sets the time. Each ship uses its own fuel. | §8.2, §11.9 | T |
| M6-FLEET-06 | **Departure.** The fleet can leave only if each ship passes the required-module rules (§11.2). | §11.2 | T |
| M6-FLEET-07 | **Refuel.** Refuel fills all ships. | §11.9 | T |
| M6-FLEET-08 | **Tow.** If one ship has 0 fuel, the full fleet is towed. The fee is paid for each ship with 0 fuel. | §8.6 | T |
| M6-FLEET-09 | **Cargo.** The Market and Trade Ledger use the total free capacity of the fleet. Bought cargo goes to ships with the allocation rule (flagship last; heavy goods first to the ship with the most thrust). | §11.9 | T |
| M6-FLEET-10 | **Fleet management at a location** (owner, 2026-10-29, Q-50). Docked at any location, the player moves cargo and modules between the fleet ships, with the same screen and rules as after a battle (M6-UI-06). No fee and no time. | §11.9, Q-50 | T |
| M6-FLEET-11 | **Outfitting.** The Outfitter and Mechanic work on one selected ship at a time. | §11.9 | M |
| M6-FLEET-12 | **Upkeep.** Each non-flagship ship costs `upkeepPerShip × size points` per day. Size points come from the hull size class, not the footprint: Small = 1, Medium = 2, Large = 3, Capital = 6. The player pays at each dock for the days since the last dock. Wait (M3) also pays upkeep. Debt rules apply. | §11.9, §8.8 | T |
| M6-FLEET-13 | **Encounters.** Pirate chance × `(1 + 0.1 × (fleetSize − 1))`. | §10.4, §11.9 | T |

## 2. Fleet in combat (FCMB)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M6-FCMB-01 | Only the flagship goes on the battle map. Other ships stay off the map and cannot be targeted. | §11.9 | T |
| M6-FCMB-02 | Pirates judge the odds with the flagship TU only. | §10.7 | T |
| M6-FCMB-03 | **Flagship flees from pirates.** The pirates take 50% of the cargo of one random non-flagship ship. This also applies to a successful Flee on the hail screen. | §11.9, Q-15 | T |
| M6-FCMB-04 | **Flagship destroyed.** The next ship in the list becomes the flagship. The battle ends. The destroyed ship and its cargo are lost. The career continues. | §11.9, §13.7 | T |
| M6-FCMB-05 | **Last ship destroyed.** Game over (§16). In M6, go to a simple game-over screen. (The career end screen is an M7 item.) | §11.9, §16 | T |
| M6-FCMB-06 | **Prize ship.** If the fleet has fewer than `maxFleetSize` ships, the player can take a surrendered ship into the fleet, with its loadout, damage, cargo, and 25% fuel. | §13.7 | T |
| M6-FCMB-07 | A prize ship from a non-pirate adds +10 notoriety. Battleships cannot be prizes. | §13.7, §15 | T |
| M6-FCMB-08 | **Forced surrender** (owner, 2026-10-29, Q-50). An NPC ship with engine value 0 (it cannot flee) and hull at or below `combat.forcedSurrenderHull` (20%) of its max hull surrenders at the morale step, with no roll. This applies to all NPC factions, patrols too. The morale roll (§13.8) stays as it is. A surrendered ship takes no more actions. | Q-50, §13.8 | T |
| M6-FCMB-09 | **Boarding.** After a win, the player boards each surrendered ship. For each ship, the player selects one: **Take as prize** (M6-FCMB-06 and M6-FCMB-07 rules), **Take cargo** (all cargo, as far as it fits in the fleet), or **Leave**. Take as prize also takes the cargo. A ship that the player leaves does not come back in later encounters. | Q-50 | T |

## 3. Screens (UI)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M6-UI-01 | **Fleet and cargo screen.** List of ships, flagship first. For each ship: loadout, derived stats, fuel, cargo with purchase price per unit. Actions at a location: select flagship, move cargo, sell ship. | §17.1 | M |
| M6-UI-02 | Before a trip, the UI shows the fuel of the ship with the lowest range. | §8.6 | M |
| M6-UI-03 | **Trade Ledger with fleet values.** Route values use the fleet's total free capacity, the fuel use of all ships, the speed of the slowest ship, daily upkeep, and the player's credits. | §17.6 | T, M |
| M6-UI-04 | The prize option shows on the battle result screen when a ship surrenders. | §13.7 | M |
| M6-UI-05 | **After-battle screen** (Q-50). After a win with surrendered ships: a list of these ships with loadout, hull, cargo, and value. Keys: P take as prize, C take cargo, L leave. The screen shows the free fleet slots and the free cargo space. Auto-resolve (Q-47) opens the same screen. | Q-50 | M |
| M6-UI-06 | **Fleet management after a battle** (owner, 2026-10-29, Q-50). On the after-battle screen, the player can: move cargo between all fleet ships and the boarded ships; move modules between fleet ships (prizes included), into free slots of the correct type and size; scuttle a fleet ship (the ship and the cargo and modules still on it are lost; a new flagship is selected if needed). These actions cost no time and no fee. The player can close the screen only when each fleet ship passes the required-module rules (§11.2), or the player scuttles the ship. | Q-50 | T, M |

## 4. Tools (TOOL)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M6-TOOL-01 | `sim-trader.ts` supports a fleet of N ships. It compares profit per day after upkeep for 1, 2, and 4 ships on the same seeds. | §19, §22 | S |

## 5. Tests (minimum)

- Fleet size limit.
- Travel time from the slowest ship. Fuel use for each ship.
- Tow of the full fleet, fee for each ship with 0 fuel.
- Cargo allocation order and move cargo.
- Upkeep calculation over several days and at Wait.
- Flagship loss, last ship loss.
- Flee cargo loss from a random non-flagship ship.
- Prize ship: loadout, damage, cargo, 25% fuel, notoriety, Battleship rule, full fleet rule.
- Forced surrender (Q-50): engine value 0 and hull at or below 20% gives a surrender with no roll, also for patrols.
- Fleet management (Q-50), after a battle and at a location: cargo moves; module moves (slot type and size); scuttle (flagship change); the required-module check before the screen closes.
- Encounter chance with the fleet factor.

## 6. Exit checks

| # | Check | Source | Verify |
|---|---|---|---|
| 1 | A fleet of 4 ships can travel, trade, and refuel. | §19 | T, M |
| 2 | Flagship loss gives a new flagship. | §19 | T |
| 3 | A prize ship joins the fleet. | §19 | T, M |
| 4 | Upkeep is paid. | §19 | T |
| 5 | `sim-trader.ts` with a 2-ship fleet earns more per day than with 1 ship, after upkeep. | §19 | S |
| 6 | **Feature freeze.** After this milestone, add no new features. Only balance, bug fixes, and the items in M7 and M8. | §19, §0.10 | I |
| 7 | `PROGRESS.md` is updated. | §0.9 | I |

**Monitor (not a gate):** a second freighter adds 30%–60% to profit per day after upkeep. A fourth ship adds 10%–25% (§22).

## 7. Not in this milestone

Fleet combat with all ships on the map (Parked, §21 item 8). Module storage (Parked): a module that is moved must go into a free slot on a fleet ship.
