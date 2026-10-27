# M4 (Day 4): Combat core

**Goal:** A turn-based tactical battle works on a grid with obstacles and multi-cell ships. The player switches modules ON and OFF, moves, and fires lasers, ballistics, and flak. Heat, shields, armor, and engine targeting work. The player can win, lose, and flee against 1 to 3 Raiders.

**Brief sections:** §4.2 (resolver), §8.5, §11.5–11.6, §12.1–12.3, §12.5, §13.1 (grid and obstacles), §13.2, §13.3, §13.6, §13.7 (end conditions), §13.8 (Raider and Trader AI, power use, morale), §18 (art data), §18.2, §18.4 (basic effects).

**Depends on:** M3 (hulls, modules, loadouts, derived stats).

---

## 1. Battle map (GRID)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M4-GRID-01 | The battle grid is 70 × 30 cells. The right panel (30 × 40) shows ship status, power, and heat. The bottom 5 rows show the battle log. | §13.1 | M |
| M4-GRID-02 | Obstacles: asteroids `#` stop movement, fire, and munitions. Debris clouds `:` give `debrisFactor` 0.8 on lines of fire through them. | §13.1, §12.3 | T |
| M4-GRID-03 | Make obstacle clusters with rot.js `Map.Cellular` and the combat RNG stream. Remove obstacles from the start areas. In M4, use one random layout. (Map templates are an M5 item.) | §13.1 | T |
| M4-GRID-04 | The player side starts on the left. The other side starts on the right. | §13.1 | T |

## 2. Ships on the grid (FOOT)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M4-FOOT-01 | Each ship has an anchor cell (top-left) and a footprint mask. Read the footprint from the battle art in `ships.json` (from `ships.yaml`). A space character is not part of the footprint. Do not store footprint sizes in `hulls.json`. | §13.2, §18 | T |
| M4-FOOT-02 | All footprint cells block movement. A hit on any footprint cell is a hit on the ship. | §13.2 | T |
| M4-FOOT-03 | Distance = Chebyshev distance from the nearest attacker cell to the nearest target cell. | §13.2 | T |
| M4-FOOT-04 | Ships do not rotate. Ships on the right side use mirrored art (`render/shipArt.ts`, `mirrorRow`) with the swap pairs of `ships.yaml` (`mirror_swaps`). | §13.2, §18 | T |
| M4-FOOT-05 | Movement uses rot.js A* with the full footprint for path checks. A ship moves up to `move` cells per turn. | §13.8, §13.3 | T |

## 3. Turn resolver (TURN)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M4-TURN-01 | The resolver is a pure function of the battle state and the player orders. It returns the new state and a list of effects. It uses only the combat RNG stream. It runs headless. | §4.2, G-13 | T |
| M4-TURN-02 | Turn order: player phase, other ships, munitions (M5), point defense (M5), heat, shields, fuel, reinforcements (M5), morale. | §13.3 | T |
| M4-TURN-03 | Player phase: switch modules ON and OFF (free), move up to `move` cells, fire each weapon that is ON one time. The player can give these orders in any order (Q-28). | §13.3, Q-28 | T |
| M4-TURN-04 | The resolver records the sides (Player, Other, Neutral) and the aggressor in the battle state. | §13.4 | T |

## 4. Power and heat (PWR)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M4-PWR-01 | At the start of each turn, a ship can switch modules ON and OFF. The draw of modules ON must be ≤ supply. | §11.5 | T |
| M4-PWR-02 | Weapons that are OFF cannot fire. A shield generator that goes ON starts at 0 shield points. Engines that are OFF give no thrust; `move` and `maneuver` change at once. | §11.5 | T |
| M4-PWR-03 | Number keys switch modules ON and OFF in combat. | §17.5 | M |
| M4-PWR-04 | Heat each turn: `heat + sum(heatPerTurn of modules ON) + sum(heatPerShot of shots) − cooling`. Minimum 0. | §11.6 | T |
| M4-PWR-05 | Hot (70%–99% of capacity): −10% hit chance (`heatFactor` 0.9), shield regeneration × 0.5. | §11.6 | T |
| M4-PWR-06 | Overheat (100%+): weapons cannot fire this turn. Hull takes damage = heat above capacity (armor does not apply). Heat then goes back to capacity. | §11.6 | T |
| M4-PWR-07 | Heat goes to 0 after combat. | §11.6 | T |

## 5. Weapons and damage (WPN)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M4-WPN-01 | Lasers and ballistics hit in the same turn. `trackFactor = tracking / (tracking + target.maneuver)`. `rangeFactor = 1 − 0.4 × distance / range`. `hit = clamp(BASE_ACC × trackFactor × rangeFactor × heatFactor × debrisFactor, 0.05, 0.95)`. | §12.3 | T |
| M4-WPN-02 | A weapon fires only at a target within its range, with a line of fire that no asteroid blocks. | §12.3, §13.1 | T |
| M4-WPN-03 | Damage: multiply by "vs shield"; shields take it first; convert the rest back (`remaining = leftover / vsShield`); multiply by "vs hull"; subtract `max(0, armor − armorPierce)`; minimum 1 per hit; subtract from hull HP (or engine value). | §12.5 | T |
| M4-WPN-04 | Flak Cannon: 3 × 3 area, 4 damage to each ship in the area, hit chance 0.6 flat on each ship. (It destroys munitions from M5.) | §12.2 | T |
| M4-WPN-05 | Shields regenerate each turn by their regen value, up to capacity. | §11.7, §13.3 | T |
| M4-WPN-06 | **Engine targeting.** The player can target the hull or the engines. An engine shot multiplies hit chance by 0.85 (Q-19). Its hull damage goes to the engine value. | §13.6, Q-19 | T |
| M4-WPN-07 | Engine value 0: `move` 0 and `maneuver` 0. The ship cannot flee. Engine value above 0 has no other effect (Q-20). | §13.6, Q-20 | T |

## 6. Fuel in combat (FUEL)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M4-FUEL-01 | Each turn with at least one engine ON uses `mass × k_combat` fuel (apply `fuelMassExponent`, Q-01). | §8.5 | T |
| M4-FUEL-02 | A successful flee uses `mass × k_flee` fuel. | §8.5 | T |
| M4-FUEL-03 | A ship with 0 fuel cannot move. If the player ship has 0 fuel, the tow happens after the battle ends. | §8.6 | T |

## 7. Battle end (END)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M4-END-01 | The battle ends when all ships on the other side are destroyed, have surrendered, or have fled. | §13.7 | T |
| M4-END-02 | The player flees when the player ship moves onto any map edge cell with engines ON. | §13.7 | T |
| M4-END-03 | When the player flagship hull HP is 0, the battle ends. In M4, this is game over. (The fleet rule is an M6 item.) | §13.7, §16 | T |
| M4-END-04 | At 25 turns, the battle ends as a draw. | §13.7 | T |
| M4-END-05 | A ship that surrenders stops acting. (Loot is an M5 item.) | §13.7, §13.8 | T |

## 8. AI (AI)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M4-AI-01 | **Power use.** The AI switches ON modules in the loadout priority order until no power is left. If heat is Hot, it switches OFF its weapon with the highest heat per shot. | §13.8 | T |
| M4-AI-02 | **Raider AI.** Move to the best range for its weapons. Attack the target with the most cargo. Retreat to the edge when hull < 30%. | §13.8 | T |
| M4-AI-03 | **Trader AI.** Move to the nearest edge. Fire only if attacked. | §13.8 | T |
| M4-AI-04 | **Attack AI** (for the player side in `sim-combat.ts`): keep the best weapon range, fire at the nearest hostile ship, do not retreat. | Q-25 | T |
| M4-AI-05 | **Morale.** When hull < 25% or engine value = 0, roll for surrender. Chance: Trader 70%, Raider 40% (`balance.json`). | §13.8 | T |

## 9. Rendering and screens (UI)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M4-UI-01 | Combat screen: grid, right panel (hull, shields, armor, engine value, heat bar, power list with ON/OFF and keys), and battle log. The power list uses the module icons and states (on, off, cannot fire, no ammunition) of `data/art/modules.json`. The heat bar uses `style.json` `heat` (12 cells, zones normal/hot/over, flash rate). | §13.1, §17.1, §18 | M |
| M4-UI-02 | The player selects target cells with the mouse or the keyboard, and selects Hull or Engines. The UI shows hit chance before a shot. | §17.5, §13.6 | M |
| M4-UI-03 | Ship colors by side and role code (`roleColor`, `style.json` `sides` and `roles`). Engines that are OFF use `engineOff`. Hot ships use the hot tint on hull and armor cells. Engine flicker cells from the art. | §18, §18.2 | M |
| M4-UI-04 | Effect frames, glyphs, colors, and times come from `/data/art/effects.json` (Claude Design `effects.yaml`, not the §18.4 table). Times scale with path length (`totalMsAt18Cells`). Effects queue from the file: stagger 150 ms (120 ms for 5 or more effects), budget 1.2 s per turn, scale down if over, minimum frame 15 ms. The renderer plays the effects after the turn resolves. `Space` skips. M4 uses the laser, ballistic, flak, shield, hull, armor, engine, and destroy effects; M5 adds missiles, torpedoes, point defense, reinforcements, flee, and surrender. | §18.4, G-20 | M |
| M4-UI-05 | Debug panel: start a test battle with any hulls and loadouts on each side. | §4.3 | M |

## 10. Tools (TOOL)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M4-TOOL-01 | `tools/sim-combat.ts` runs N auto-battles (default 500) for each pairing, with AI for both sides and default loadouts. | §13.9 | S |
| M4-TOOL-02 | It reports win, loss, flee, surrender, and draw rates, and the median battle length, for each pairing. It prints PASS or FAIL for each §13.9 check that exists in this milestone. | §13.9 | S |

## 11. Tests (minimum)

- Hit formula: track, range, heat, debris, clamp, engine shot factor.
- Damage pipeline (§12.5) with shield, armor, armor pierce, minimum 1.
- Heat states: Normal, Hot, Overheat (damage and reset to capacity).
- Power rule and the effects of switching OFF weapons, shields, and engines.
- Footprint, mirror, Chebyshev distance, blocked movement.
- Line of fire blocked by asteroids.
- Flak area and flat hit chance.
- Engine value 0 gives `move` 0 and no flee.
- Determinism: the same battle seed and orders give the same result.

## 12. Exit checks

| # | Check | Source | Verify |
|---|---|---|---|
| 1 | The player can win, lose, and flee against 1 to 3 Raiders. | §19 | M, S |
| 2 | Power and heat rules work. | §19 | T |
| 3 | Starting Shuttle vs 1 Pirate Raider: Shuttle wins 40%–60%. | §13.9 | S |
| 4 | Laser Wasp vs 2 Pirate Raiders: Wasp wins 50%–70%. | §13.9 | S |
| 5 | `PROGRESS.md` is updated with the `sim-combat.ts` results. | §0.9 | I |

**Monitor (not a gate):** median battle length is 4–10 turns (§13.9, §22).

## 13. Open questions for this milestone

Q-19 (engine shot), Q-20 (engine damage), Q-25 (player-side AI), Q-28 (order of moves and shots). See [README.md](README.md#8-open-questions-conflicts-and-gaps-in-the-brief).

## 14. Not in this milestone

Guided munitions, point defense, reinforcements, Patrol and Evader AI, map templates, loot, encounters (M5). Fleet rules in combat (M6). Damage and heat display on ship art (M8).
