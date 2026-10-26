# M5 (Day 5): Threat, encounters, and the full combat system

**Goal:** Encounters happen on travel, on sector arrival, and on Hunt. Sector security and development level set enemy strength through a threat budget. Pirates judge the odds before they attack. Patrols arrive during combat and fight the aggressor. Guided weapons and point defense work. Pirate kills raise sector security. Piracy raises notoriety.

**Brief sections:** §7.4 (Pirate Haven, Mechanic refill), §8.8 (Hunt), §10 (all), §12.4, §12.2 (Missile Rack, Torpedo Tube, Point Defense, flak vs munitions), §13.1 (templates), §13.4, §13.5, §13.7 (loot), §13.8 (Patrol and Evader AI), §15, §17.1 (10), §18.4 (munitions, PD, reinforcements).

**Depends on:** M4 (combat core), M3 (stats, loadouts), M2 (security in the economy).

---

## 1. Guided munitions and point defense (GUIDE)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M5-GUIDE-01 | A guided weapon launches a munition entity on the grid. It does not hit in the same turn. | §12.4 | T |
| M5-GUIDE-02 | Each turn, a munition moves up to `speed` cells toward its target, in a straight line, and around asteroids with A*. | §12.4 | T |
| M5-GUIDE-03 | When a munition reaches a cell next to the target footprint, roll `hit = agility / (agility + target.maneuver)`. Hit or miss, remove the munition. | §12.4 | T |
| M5-GUIDE-04 | When `life` reaches 0, remove the munition. Munitions have HP (missile 1, torpedo 10). | §12.2, §12.4 | T |
| M5-GUIDE-05 | Ammunition: Missile Rack 8, Torpedo Tube 3. A weapon with 0 ammunition cannot fire. The Mechanic refills ammunition for a price. | §12.2, §7.4 | T |
| M5-GUIDE-06 | Point defense fires automatically in the point defense step: up to 2 shots per turn at munitions in range 3. Each shot: 50% chance, 10 damage. Heat 1 per shot. | §12.2, §13.3 | T |
| M5-GUIDE-07 | Flak destroys all munitions in its 3 × 3 area. | §12.2 | T |
| M5-GUIDE-08 | Effects: missile `o` and torpedo `0` with a `.` trail (30 ms per cell). Point defense: short `'` line, then `*`. | §18.4 | M |

## 2. Threat units and budget (THREAT)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M5-THREAT-01 | `ship/stats.ts` calculates TU: `durability`, `firepower` (with `trackFactor` at maneuver 40, flak 0.6, torpedo ammo factor 0.6), `rawThreat = sqrt(durability × firepower)`, `TU = 10 × rawThreat / rawThreat(Pirate Raider)`. | §10.5 | T |
| M5-THREAT-02 | `groupTU = sum(TU) × (1 + groupBonus × (count − 1))`, `groupBonus` = 0.15. | §10.5 | T |
| M5-THREAT-03 | `pirateBudget = securityBase[level] × devMult[development] × random(0.6, 1.4)`, minimum 10. Values in `security.json`. | §10.5 | T |
| M5-THREAT-04 | The player's strength does not change the budget. The only player factor is the fleet size factor on encounter chance (M6). | §10.5 | I |
| M5-THREAT-05 | `templates.json` has the 9 pirate templates (§10.6), trader templates (§10.8), escort rules, and patrol templates. TU of a template is calculated from its ships, not typed. | §10.6, §10.8 | T |
| M5-THREAT-06 | **Selection.** List allowed templates with `TU ≤ budget`. Keep those with `TU ≥ 0.5 × budget`; if none, keep the most expensive allowed one. Select at random with weight = TU. | §10.6 | T |
| M5-THREAT-07 | **Patrol budget.** `patrolBase[level] × random(0.8, 1.2)`. Patrol groups use the same selection rule (Q-04, interim rule). The owner will rework security patrols later; keep all patrol values in data. | §10.8, Q-04 | T |
| M5-THREAT-08 | **Threat band.** Each sector shows 1 to 5 `!` on the region map (Q-18) and a TU range (budget at 0.6 and 1.4) in the sector panel. | §10.6, §17.2, Q-18 | M |

## 3. Encounters and hail (ENC)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M5-ENC-01 | Roll for pirates on sector arrival and on each sector trip, with the chances in `security.json` (§10.2). | §10.2, §10.4 | T |
| M5-ENC-02 | On sector travel, if no pirate encounter happens: Trader 30%. In sectors with security level 2+: Patrol 20%. | §10.4 | T |
| M5-ENC-03 | **Traders.** Template by development level (§10.8). If security level ≤ 2, the trader has an escort with budget 0.5 × pirate budget, Patrol AI, and trader colors ("Escort Wasps"). Trader cargo comes from the local market. | §10.8 | T |
| M5-ENC-04 | **Pirates judge the odds.** `ratio = pirateGroupTU / flagshipTU × boldness[level]`. ≥ 1.5: Attack (Fight, Flee). 0.75–1.49: Demand tribute (Fight, Flee, Pay). < 0.75: Avoid (Pursue, Ignore). | §10.7 | T |
| M5-ENC-05 | **Pursue.** Combat starts. The player acts first. The pirates use the Evader AI. | §10.7 | T |
| M5-ENC-06 | **Tribute.** 50% of the cargo of one ship (Q-17). | §10.7, Q-17 | T |
| M5-ENC-07 | **Flee from hail.** Resolve with Q-15. | Q-15 | T |
| M5-ENC-08 | **Trader and patrol hail options** (Q-16). Attack makes the player the aggressor. | §13.4, Q-16 | T |
| M5-ENC-09 | **Hail screen.** Encounter text, the enemy group with its threat band, and the options with keys. | §17.1 | M |
| M5-ENC-10 | **Battle map templates.** Select the template by the place of the encounter: Open Space, Asteroid Field, Debris Field, Gas Giant Edge (`battleMaps.json`). | §13.1 | T |
| M5-ENC-11 | **Hunt.** In space on the sector map: pass 1 day, roll for a pirate encounter with chance × `huntMultiplier` (3), use fuel for 1 day of cruise. | §8.8 | T |
| M5-ENC-12 | Debug panel: start a test battle with any template. Set sector security. | §4.3 | M |

## 4. Reinforcements and AI (REIN)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M5-REIN-01 | From turn 3, roll each turn with the chances for the battle's sector (§10.2). Maximum one group per battle for each type. | §13.5 | T |
| M5-REIN-02 | **Patrol** reinforcement: a group from the patrol budget. It is hostile to the aggressor and allied to the victim. If the player is the aggressor, notoriety +10. | §13.5, §15 | T |
| M5-REIN-03 | **Pirate** reinforcement: a group from 0.3 × pirate budget (minimum 1 Raider), on the pirate side. Only in Lawless and Low sectors, and only if pirates are in the battle. | §13.5 | T |
| M5-REIN-04 | Reinforcements arrive at a random edge cell, with a `=` trail effect. | §13.1, §18.4 | M |
| M5-REIN-05 | **Patrol AI.** Attack the aggressor side. Keep the best weapon range. Do not retreat. Escorts stay within 6 cells of their trader. Morale 0%. | §13.8 | T |
| M5-REIN-06 | **Evader AI.** Move to the nearest edge. Fire at the player when in range. Surrender when engine value = 0. Morale 60%. | §13.8 | T |

## 5. Loot (LOOT)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M5-LOOT-01 | A destroyed ship drops 30% to 60% of its cargo as cargo pods (`$`). A ship collects a pod when it moves onto it. | §13.7 | T |
| M5-LOOT-02 | A ship that surrenders gives all its cargo. The player takes as much as fits in the fleet. | §13.7 | T |
| M5-LOOT-03 | No module salvage. (Prize ships are an M6 item.) | §13.7 | I |
| M5-LOOT-04 | A Pirate Haven buys all cargo at 70% of its local sell price (Q-24). | §7.4, Q-24 | T |

## 6. Sector security (SEC)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M5-SEC-01 | Changes (§10.3 table): destroy pirate +3/+0.5; pirate surrenders +2/+0.3; attack non-pirate −4/−0.5. (Bounty and Pirate Surge changes come in M7.) | §10.3 | T |
| M5-SEC-02 | Each day, the security value moves 2% of the gap toward the baseline. Value and baseline stay in 0–100. | §10.3 | T |
| M5-SEC-03 | The region map shows each sector's security level and an up, down, or flat arrow for the last 30 days. | §10.3, §17.2 | M |
| M5-SEC-04 | The economy uses the current security level (economy multiplier and flow `securityFactor`). | §9.7, §10.2 | T |

## 7. Notoriety (NOT)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M5-NOT-01 | Notoriety is 0 to 100. Changes (§15 table): attack non-pirate +15 (Q-21); destroy non-pirate +10; aggressor when patrol arrives +10; destroy or capture pirate −3; each day −0.3. | §15, Q-21 | T |
| M5-NOT-02 | Levels: Clean 0–24, Suspect 25–49, Wanted 50–100. | §15 | T |
| M5-NOT-03 | Suspect: locations in Secure sectors refuse docking. Wanted: patrols attack in all encounters; locations in High and Secure sectors refuse docking. Pirate Havens accept all levels. | §15 | T |
| M5-NOT-04 | The tow skips locations that refuse docking (Q-12). | Q-12 | T |

## 8. Tools (TOOL)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M5-TOOL-01 | `ship-report.ts` prints TU for all hulls, default loadouts, and templates, and compares the §10.5 reference values (±10%). | §10.9 | S |
| M5-TOOL-02 | `sim-combat.ts` runs all §13.9 pairings and the TU calibration (5 pairs of a single ship vs a group of equal TU ±10%). | §10.9, §13.9 | S |
| M5-TOOL-03 | A test or tool generates 10,000 pirate encounters for each security level and development level, and checks that the median group TU is in the §10.5 range. | §10.9 | T, S |
| M5-TOOL-04 | Run `sim-trader.ts` again with encounters ON. Record the change in `PROGRESS.md`. | Risk | S |

## 9. Tests (minimum)

- TU formula and group TU. Template TU values in §10.6.
- Budget formula and range for each security and development level.
- Template selection rules.
- Odds ratio and the three pirate behaviors.
- Munition movement, hit roll, life, point defense, flak vs munitions.
- Reinforcement rules: start turn, chances, one per type, sides.
- Security changes and daily drift.
- Notoriety changes, levels, and docking refusal.
- Loot: pod share, surrender cargo, fit in fleet.

## 10. Exit checks

| # | Check | Source | Verify |
|---|---|---|---|
| 1 | All pairings in §13.9 pass (Shuttle vs Raider; laser Wasp vs 2 Raiders; ballistic vs laser Gunship; ballistic vs laser Corvette vs Frigate; torpedo vs laser Frigate vs Battleship; single vs equal-TU group; median length 4–10 turns). | §13.9 | S |
| 2 | §10.9 passes: TU reference values ±10%, TU calibration 35%–65%, median generated TU in range. | §10.9 | S, T |
| 3 | Patrols fight against the aggressor. | §19 | T, M |
| 4 | Pirate kills raise sector security. | §19 | T |
| 5 | `PROGRESS.md` is updated. | §0.9 | I |

If a combat check fails, tune data, not formulas (§13.9). For TU calibration, tune `groupBonus` and the firepower formula, not the templates (§10.9).

**Monitor (not a gate):** a starting Shuttle loses most fights in Lawless Frontier sectors and wins most fights in High and Secure sectors (§22). Encounters: 1 per 3–4 trips at security level 1–2 (§22, Q-26).

## 11. Open questions for this milestone

Q-04 (Secure patrol, deferred), Q-12 (tow and docking), Q-15 (flee from hail), Q-16 (trader and patrol options), Q-17 (tribute), Q-18 (threat band), Q-21 (attack), Q-24 (Pirate Haven), Q-26 (encounter rate). See [README.md](README.md#8-open-questions-conflicts-and-gaps-in-the-brief).

## 12. Not in this milestone

Prize ships and fleet rules (M6). Named pirates, bounties, and Pirate Surge events (M7).
