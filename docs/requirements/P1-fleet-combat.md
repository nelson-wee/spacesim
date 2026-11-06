# P1 (post-MVP): Fleet combat

**Goal:** All fleet ships can fight. The player controls the flagship; the other joined ships follow orders.

**Brief sections:** §11.9, §21 item 8, Appendix B.2. Scope: `docs/proposals/factions-and-fleet-combat.md`, Section 3 (owner decisions 2026-11-06).

**Depends on:** the MVP (M1-M8).

**Rule:** one Parked item at a time (§21). This item does not need factions.

---

## 1. Fleet setup (FS)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| P1-FS-01 | Each fleet ship has a battle setting: **Join** or **Stay out**. Default: Join if the ship has a weapon (laser, ballistic, or guided), else Stay out. The flagship always joins. | owner | T |
| P1-FS-02 | The fleet screen shows the battle setting of each ship and the command points in use. A key (J) toggles Join and Stay out on the selected ship (not the flagship). | owner | M, T |
| P1-FS-03 | **Command points** (`fleet.commandPoints`, 6): the joined ships use points by size class (`fleet.sizePoints`: Small 1, Medium 2, Large 3, Capital 6). A Join that goes over the limit is refused. At a battle start, ships join in fleet order until the points are used; the others stay out, with a message. The fleet keeps its limit of `fleet.maxFleetSize` (4) ships. | owner, DECISIONS | T |
| P1-FS-04 | Old saves load with no change: a ship with no setting uses the default of P1-FS-01. | — | T |

## 2. Battle (FB)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| P1-FB-01 | The joined ships start on the player side, stacked around the start column with the flagship. Stay-out ships are off the map and cannot be targeted. | B.2 | T |
| P1-FB-02 | Each joined ship that is not the flagship has an **order**: Attack (a target, or the AI's choice), Guard (stay within 6 cells of the flagship; attack the enemy nearest to it), Hold (no moves; fire at what is in range), Retreat (go to the nearest edge and flee). Default: Attack. | B.2 | T |
| P1-FB-03 | The player changes an order at any time in the planning phase (key O: select a ship, then the order). A change costs no power and no time. | owner | M |
| P1-FB-04 | Fleet ships use the Wingman AI: the Balanced AI (auto-battle) with the order as its goal. A wingman retreats below `combat.auto.retreatHull`, except on Hold. Wingmen do not surrender. | B.2 | T |
| P1-FB-05 | **Flagship destroyed or fled:** the battle goes on while a fleet ship is active on the map. The player controls the next active fleet ship (fleet order). | proposal | T |
| P1-FB-06 | **Battle result:** win when no hostile ship is active; while a fleet ship is active, the battle goes on; else `fled` if a fleet ship fled, else `loss`. | proposal | T |
| P1-FB-07 | **Pirates disable, others destroy:** in a battle where all hostile ships are pirates, a fleet ship at 0 hull is disabled, not destroyed: it stays in the fleet with `disabledHullShare` of its hull. A loss to pirates disables the whole fleet as now (all cargo taken, tow). In other battles, a destroyed fleet ship and its cargo are lost. | owner 2026-10-28 | T |
| P1-FB-08 | **After the battle:** each fleet ship that fought gets its hull, armor, engine value, fuel, ammunition, cargo, and modules back. The new flagship is the ship that the player controlled at the end (if the old flagship is lost). Game over and Clone Insurance apply only when no fleet ship is left. | §11.9 | T |
| P1-FB-09 | **Flee:** each ship flees on its own. On a `fled` result against pirates, they take `fleeCargoShare` of the cargo of one random stay-out ship (as now). | §11.9 | T |
| P1-FB-10 | Auto-battle (T, Shift+T, R) plays the controlled ship with the Balanced AI; the wingmen use their orders. "Auto until" also stops when a fleet ship is lost or the control moves to another ship. | Q-47 | T |

## 3. Encounters (FE)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| P1-FE-01 | **Partial scaling:** the pirate budget grows by `encounters.fleetBudgetShare` (0.5) x the threat units of the joined ships other than the flagship. Patrol, trader, and named bounty groups do not scale. *Note (not a requirement): a later difficulty setting can change this share.* | owner | T |
| P1-FE-02 | Pirate odds (§10.7) use the group TU of the joined ships (`groupTu`), not the flagship TU only. A much weaker group avoids the fleet. | owner | T |

## 4. Screens (UI)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| P1-UI-01 | Combat panel: a fleet list (name, hull, shield, order, status) and a marker on the controlled ship. | B.2 | M |
| P1-UI-02 | The orders box (O): the joined ships with their orders; Up/Down selects a ship; A Attack (the current target), G Guard, H Hold, R Retreat; Esc closes. | owner | M |
| P1-UI-03 | Help and a tutorial tip for orders and the battle setting. | §17.5 | M |

## 5. Tools and checks (TOOL)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| P1-TOOL-01 | `sim-combat --fleet`: fleet pairings (for example Gunship + Light Freighter, Gunship + Gunship) against pirate groups; win rate and ships lost (report). | — | S |
| P1-TOOL-02 | The tool bots (encounter bot, chaos bot, play test) start battles with the same fleet rules as the game. | — | S |
| P1-TOOL-03 | `sim-playtest` runs with no new problems; `sim-trader --encounters` and `sim-combat` checks are reports for fleets. | — | S |

## 6. Exit checks

| # | Check | Verify |
|---|---|---|
| 1 | A fleet of 2-3 armed ships fights a pirate group; orders change the wingmen's behavior; the flagship can be lost and the battle goes on. | M, T |
| 2 | Stay-out ships are safe; the J toggle and command points work on the fleet screen. | M, T |
| 3 | All existing tests pass; the old `sim-combat` checks (one ship) do not change. | T, S |
| 4 | `PROGRESS.md` and `DECISIONS.md` are up to date. | I |
