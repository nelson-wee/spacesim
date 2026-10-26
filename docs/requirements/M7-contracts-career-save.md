# M7 (Day 7): Contracts, market events, career end, and save

**Goal:** The Merchants' Guild and Bounty Guild post contracts that come from the real state of the world. Market events change the economy. A career ends at day 730, at "Retire", or when the last ship is destroyed, with a score and a title. The game saves and loads. A balance pass runs with all tools.

**Brief sections:** §7.4 (Bounty Guild), §9.11, §10.3 (bounty and surge changes), §10.4 (named pirate), §14, §15 (named bounty), §16, §17.7, §17.1 (13).

**Depends on:** M2 (economy state), M3 (Merchants' Guild), M5 (security, encounters, templates), M6 (fleet).

---

## 1. Contract generator (GEN)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M7-GEN-01 | Each board makes new offers every 7 days. Offers that the player did not accept are removed. Each board has 3 to 6 offers. | §14.3 | T |
| M7-GEN-02 | **Candidates** within 3 jumps of the board: Deficit, Capital need, Input starvation, Surplus, Security problem, with the conditions and severities in §14.3. | §14.3 | T |
| M7-GEN-03 | **Score.** `severity × dailyNeed × basePrice × size`. Security problems: `severity × 1000`. | §14.3 | T |
| M7-GEN-04 | **Select** at random with weight = score. Maximum 1 offer for each pair of location and commodity. If possible, each Merchants' Guild board has at least 1 Raw or Processed offer, at least 1 Advanced offer, and at least 1 Small offer. | §14.3 | T |
| M7-GEN-05 | Each offer shows its reason, for example "Vashti Ice Mine: output 65%, needs Machinery". | §14.1 | T |
| M7-GEN-06 | Contract size and danger do not scale with the player. | §14.1 | I |
| M7-GEN-07 | Contract values (fee rates, size classes, deadlines, reward rates) are in `contracts.json`. | §0.4 | I |

## 2. Merchants' Guild contracts (MG)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M7-MG-01 | **Size classes.** Small 10 t, Medium 30 t, Large 80 t. Quantity = the largest class ≤ the deficit or surplus in tonnes, minimum Small. | §14.4 | T |
| M7-MG-02 | **Standing** = completed − 2 × failed, minimum 0. It applies at all Merchants' Guilds. Freight needs standing 0 / 3 / 8 for Small / Medium / Large. | §14.4 | T |
| M7-MG-03 | **Supply.** Destination = deficit location. Price per unit = destination sell price at posting × (1 + 0.10 + 0.20 × severity), fixed, with no price slope. Deadline = posting day + 8 + 4 × jumps. Partial deliveries are paid at once. No deposit. Fail: standing −2. | §14.4 | T |
| M7-MG-04 | **Supply effect.** Delivered units go into the destination market stock. Machinery then goes into installed machinery by the normal install rule. | §14.4, §9.5 | T |
| M7-MG-05 | **Freight.** Pickup = surplus location A (within 2 jumps of the board). Destination B has a deficit of the same commodity, 1 to 3 jumps from A. Cargo is removed from A's stock at pickup. Deposit 25% of cargo value at pickup. | §14.4 | T |
| M7-MG-06 | **Freight fee** = `tonnes × jumps × feePerTonneJump × riskMult + 0.05 × cargo value`. `feePerTonneJump` = 4. `riskMult = 1 + 0.3 × (4 − lowest security level on the shortest path)`. Deadline = pickup day + 5 + 3 × jumps. Fail (also cargo lost to pirates): deposit lost, standing −2. Effect: cargo goes into B's stock. | §14.4 | T |
| M7-MG-07 | Maximum 4 active Merchants' Guild contracts. | §14.7 | T |

## 3. Bounty Guild (BG)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M7-BG-01 | Add the Bounty Guild service (§7.4) with its board and bounty payment. | §7.4 | M |
| M7-BG-02 | **Sweep.** Sector = a security problem sector within 3 jumps. Destroy or capture N = 3 to 6 pirate ships in the sector. Deadline = acceptance + 25 days. Reward = `N × averageShipTU(sector templates) × 40 × (1 + 0.25 × (4 − level))`. On completion, baseline +2. No fail penalty. Maximum 1 active Sweep. | §14.5 | T |
| M7-BG-03 | **Named bounty.** Sector within 3 jumps with security level ≤ 2. Budget = the sector's maximum pirate budget × random(1.5, 3.0). Select from all pirate templates, also Frigate Group and Battle Group (by their placement rules). Tier 2 modules; tier 3 if TU ≥ 150 (Q-23). | §14.6, Q-23 | T |
| M7-BG-04 | **Named bounty name**: captain name, epithet, and ship name from `names.json` (for example, "Oriel the Saltless, aboard the *Low Tide*"). | §14.6 | T |
| M7-BG-05 | **Named encounter.** Guaranteed on the next arrival in the sector, or on the first Hunt in the sector, while the player has the bounty. | §10.4, §14.6 | T |
| M7-BG-06 | **Named reward** = `TU × 150 × (1 + 0.25 × (4 − level))`. Expiry: 28 days after posting. Effect: security +5, baseline +1, notoriety −10. Each Bounty Guild keeps 2 to 4 named bounties. Maximum 3 active. | §14.6, §14.7 | T |
| M7-BG-07 | **Kill bounty.** Each pirate ship that the player destroys or captures gives `shipTU × 25 × (1 + 0.25 × (4 − level))`. The player collects the total at any Bounty Guild. Wanted players are not paid. | §14.6, §15 | T |
| M7-BG-08 | **Board display.** Each offer shows type, reason, route with jumps, lowest security level and threat band on the route, tonnes, reward, deadline, and estimated profit per day for the current fleet. | §14.8 | M |
| M7-BG-09 | A player in debt cannot accept contracts (§8.6). | §8.6 | T |
| M7-BG-10 | Debug panel: spawn any contract. | §4.3 | M |

## 4. Market events (EVT)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M7-EVT-01 | Events (`events.json`): Shortage (population use × 2, one commodity, one location, 20–40 days), Boom (batches × 1.5, one producer, 20–40 days), Strike (batches × 0, one producer, 10–20 days), Pirate Surge (security value −20 in one sector, instant). | §9.11 | T |
| M7-EVT-02 | Maximum 3 active events. Roll for a new event each day (tick step 8). | §9.11, §9.6 | T |
| M7-EVT-03 | The log and the Merchants' Guild show active events. | §9.11 | M |

## 5. Career end and score (CAR)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M7-CAR-01 | The career ends at day 730, at "Retire" at any location, or when the last ship is destroyed. | §16 | T |
| M7-CAR-02 | **Score** = credits + 60% of hull and module value of all fleet ships + cargo value at local prices. If the last ship is destroyed, the score uses only credits. | §16 | T |
| M7-CAR-03 | **Titles:** Drifter (< 20,000), Hauler (20,000–99,999), Merchant Captain (100,000–499,999), Sector Magnate (500,000+). Notoriety 50+ at the end replaces it with Dread Pirate. | §16 | T |
| M7-CAR-04 | **Second titles:** Pirate Hunter (10+ named bounties). Warden of [sector] (a sector raised from Lawless or Low to High or Secure). | §16 | T |
| M7-CAR-05 | **Career summary:** days, net worth, jumps, cargo traded, battles won, ships captured, bounties, security change per sector, title. The simulation records these statistics from the start of the career. | §16 | T |
| M7-CAR-06 | **Career end screen** shows the summary, the title, and the seed. | §17.1, §4.3 | M |

## 6. Save and load (SAVE)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M7-SAVE-01 | Save writes `GameState` as JSON to `localStorage`, with `saveVersion` and the seed. One save slot. | §4, §17.7 | T |
| M7-SAVE-02 | Autosave each time the player docks. Save on "Quit to title". | §17.7 | T, M |
| M7-SAVE-03 | "Continue" on the title screen loads the save. | §17.1 | M |
| M7-SAVE-04 | Load rejects a save with an unknown `saveVersion`, and shows a message. | §4 | T |
| M7-SAVE-05 | Save then load gives a deep-equal state, also the RNG stream states. After load, the next days give the same results as with no save. | §19 | T |

## 7. Balance pass (BAL)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M7-BAL-01 | Run all tools (`gen-report`, `sim-economy`, `sim-trader`, `sim-combat`, `ship-report`). Record the results in `PROGRESS.md`. | §19 | S |
| M7-BAL-02 | Compare results with the balance targets in §22. Tune only data. Record each change of more than a small step in `DECISIONS.md`. | §22, §0.4 | S |
| M7-BAL-03 | Tune `security.json` for the target "about 15 pirate kills raise a sector one level for a long time". | §22, Risk | S |

## 8. Tools (TOOL)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M7-TOOL-01 | `sim-economy.ts` generates boards every 7 days for 1000 days on 20 seeds and reports the §14.9 checks. | §14.9 | S |
| M7-TOOL-02 | `sim-trader.ts` can accept Supply contracts and compares their profit per day with the best known open-market route of similar length. | §14.9 | S |
| M7-TOOL-03 | A headless full-career run plays to day 730 with the trader bot, with encounters and AI combat for the player side. It must end with no errors. | §19 | S |

## 9. Tests (minimum)

- Each candidate type and its severity.
- 100% of Supply and Freight offers point to a real deficit at posting.
- Size class selection and standing rules.
- Supply price, deadline, partial delivery, fail.
- Freight deposit, fee, `riskMult`, deadline, fail on cargo loss.
- Sweep and named bounty rewards, limits, expiry, effects.
- Kill bounty and the Wanted rule.
- Market events: effects, durations, maximum 3.
- Score, titles, second titles.
- Save and load round trip.

## 10. Exit checks

| # | Check | Source | Verify |
|---|---|---|---|
| 1 | 90% of boards have 3 or more offers. | §14.9 | S |
| 2 | 100% of Supply and Freight offers point to a real deficit at posting. | §14.9 | T |
| 3 | For the greedy trader bot, the median Supply contract gives 1.0× to 1.5× the profit per day of the best known open-market route of similar length. | §14.9 | S |
| 4 | A completed Machinery Supply contract to a producer with low K increases its output. | §14.9 | T |
| 5 | A full career to day 730 runs without errors. | §19 | S |
| 6 | Save and load give the same state. | §19 | T |
| 7 | `PROGRESS.md` is updated with all tool results. | §0.9 | I |

**Monitor (not a gate):** good trader net worth at day 730 is 250,000–600,000 cr. A Battle Group named bounty pays 75,000 cr or more (§22).

## 11. Open questions for this milestone

Q-23 (named bounty TU), Q-26 (encounter rate). See [README.md](README.md#8-open-questions-conflicts-and-gaps-in-the-brief).

## 12. Not in this milestone

Escort missions, bounty hunters, factions (Parked, §21).
