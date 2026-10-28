# M2 (Day 2): World economy and generator steps 4–9

**Goal:** The generator makes a world with producers, population, sizes, and services that pass all validation rules. The economy runs headless for 1000 days with stable prices, production chains, and price gradients that give the player profitable routes.

**Brief sections:** §6.6–6.11, §7.1–7.4, §9.1–9.8, §9.10, §10.2 (economy multiplier), §4.3 (CSV export). Stretch: §9.9.

**Depends on:** M1 (world steps 1–3, RNG, clock, data schemas).

**Risk:** Day 2 is full (§19). Use the Cut list early if needed. NPC agents are a stretch goal only.

---

## 1. Generator steps 4–9 (GEN)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M2-GEN-01 | **Blueprint, final demand.** Estimate the region population from planet types and the default size 2. Calculate population demand for each commodity per day. | §6.6 | T |
| M2-GEN-02 | **Blueprint, recipes.** Process tiers from top to bottom (Consumer, Advanced, Processed, Raw). For each commodity with demand, calculate the recipe batches the region needs, and add the recipe inputs to demand. | §6.6 | T |
| M2-GEN-03 | **Blueprint, Machinery.** Add Machinery demand for wear (§9.5) for all producers. | §6.6 | T |
| M2-GEN-04 | **Blueprint, counts.** `count = ceil(batchesNeeded / (batchesPerSize × 2))`. Minimum 2 for each producer type. | §6.6 | T |
| M2-GEN-05 | **Assign.** Sort producer types from the rarest to the most common. Put each producer on a free body that can host it (§7.2 table) in a sector with an allowed development level. Prefer a sector that has no producer of this type yet. | §6.7 | T |
| M2-GEN-06 | **Chain separation.** Where possible, put a producer in a different sector from the producers of its inputs. | §6.7 | T |
| M2-GEN-07 | **Population.** Give population to planets with atmosphere and to Habitat stations (§9.4 table). All other locations get crew population (2 per size). | §6.7, §9.4 | T |
| M2-GEN-08 | **Fill.** Fill the free bodies with population, Trade Hubs, Shipyard Stations, Military Outposts, or Pirate Havens, by the placement rules in §7.2. | §6.7 | T |
| M2-GEN-09 | **Sizes.** Start all sizes at 2. For each commodity, `ratio = regionSupply / regionDemand` (Q-06). If `ratio < 0.9`, increase the size of one producer (maximum 3). If `ratio > 1.1`, decrease one (minimum 1). Repeat until all ratios are in 0.9–1.1, or for 20 passes. | §6.8 | T |
| M2-GEN-10 | **Tech level.** Shipyard Stations and Trade Hubs get tech level +1 (maximum 3). | §6.4 | T |
| M2-GEN-11 | **Services.** Add services with the rules in `services.json` (§7.4 table). Bounty Guild on planets uses the baseline security at generation (Q-22). | §6.9, §7.4 | T |
| M2-GEN-12 | **Start location.** In the core sector, with an Outfitter and a Merchants' Guild. | §6.10 | T |
| M2-GEN-13 | **Validate rules.** Check all rules in §6.10. Return a result for each rule. | §6.10 | T |
| M2-GEN-14 | **Validate economy.** Run the economy for 200 days with no player. No producer is below 30% output for 60 days in a row. The core-frontier gradient exists (Q-34). **On hold (owner, 2026-10-27):** the generator checks structure only (`generator.economyCheck` false) while the economy is tuned; `sim-economy` checks the economy. The generator runs `warmupDays` (100) so the game starts with warm markets. | §6.10 | T |
| M2-GEN-15 | **Repair.** If a rule fails, try a repair for that rule: change a size, change the producer at one location, or add a service. Maximum 5 repairs. Validate again after each repair. | §6.11 | T |
| M2-GEN-16 | **Reject.** If the world still fails, start again from step 1 with `seed + 1`. Maximum 20 tries, then report an error. | §6.11 | T |
| M2-GEN-17 | **Log.** Write the number of repairs and retries, and the rule results, to the generator log. | §6.11 | T |
| M2-GEN-18 | **Frontier count.** Make sure that the region has at least 2 Frontier sectors (Rare Elements need 2 sectors). Change sectors in step 2 (Q-07); do not retry the seed. | Q-07 | T |
| M2-GEN-19 | The same seed gives the same world after repairs and retries. | §6.2 | T |

## 2. Locations and markets (LOC)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M2-LOC-01 | Each `Location` has all fields of §7.1: `kind`, `bodyType`, `producer`, `population`, `size`, `techLevel`, `gravity`, `installedMachinery`, `market`, `services`. | §7.1 | T |
| M2-LOC-02 | A location trades a commodity if its producer makes or uses it (hard or soft input), or its population uses it. All locations trade Hydrogen (Refuel). | §9.2, Q-03 | T |
| M2-LOC-03 | A location trades what its producer makes or uses, what its population uses, and Hydrogen. No limit on the count (Q-03). Trade Hubs trade all 12. | §9.2, Q-03 | T |
| M2-LOC-04 | `target` = 10 days of the location's daily use or output for that commodity. Planets: target × 2. Trade Hubs: a large target for all commodities (value in `balance.json`). Commodities with no local use or output: `minTargetStock` (Q-05). | §9.2, §7.2 | T |
| M2-LOC-05 | Shipyard Stations buy Alloys, Composites, Electronics, and Machinery. Pirate Havens buy Food, Medicine, and Oxygen. Military Outposts have crew population. | §7.2 | T |
| M2-LOC-06 | At generation, `stock = target` and `K = K_ref` for each producer. | §9.5 | T |

## 3. Economy tick (ECON)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M2-ECON-01 | The daily tick runs in this order: population use, production, Machinery install and wear, capacity change and target update, background carriers (arrivals, then new shipments), off-map supply and demand, noise (±3% of target), `stock = max(stock, 0)`, events update (stub until M7). | §9.6 | T |
| M2-ECON-02 | **Population.** Each population unit uses the amounts in `population.json` per day. Oxygen only for stations and planets without atmosphere. Electronics and Composites mainly for Core resident populations; all populations and crews in Middle and Frontier sectors use small amounts of Electronics, Composites, and Machinery (owner, 2026-10-27; post-MVP this demand goes to station building, upgrades, and research). Multiply by the sector economy multiplier. | §9.4, §10.2 | T |
| M2-ECON-03 | **Production.** `output = batches × inputFactor × capitalFactor × securityMult × eventMult`. `batches = batchesPerSize × size × capacity × volumeScale`. **Capacity** (start 1, no limits) changes each day by `changeRate × clamp(min(outputPriceFactor / growthPriceFactor − 1, outputValue / unitCost − 1), −1, 1)`, inputs and Machinery at replacement cost; growth × inputFactor; growth base at least `restartCapacity` (owner, 2026-10-27). | §9.3, DECISIONS.md | T |
| M2-ECON-04 | `inputFactor` = minimum over hard inputs of `stock / required`, maximum 1.0. A producer with no hard inputs has `inputFactor` = 1.0. If a hard input has 0 stock, output is 0. | §9.3 | T |
| M2-ECON-05 | The producer removes the inputs that it uses from stock and adds its outputs to stock. | §9.3 | T |
| M2-ECON-06 | **Capital.** `K_ref = machineryPerBatch × batches`. `capitalFactor = 0.6 + 0.6 × K / (K + K_ref)`. | §9.5 | T |
| M2-ECON-07 | **Install.** Each day, move Machinery from market stock into K, up to 10% of `K_ref` per day, until K = K*. K* is the K where the daily gain of one more unit (`batches × valueAdded × 0.6 × K_ref / (K + K_ref)²`, local prices) equals its daily cost (`machineryPrice × (wear + requiredReturn)`). No upper limit (owner, 2026-10-27; the brief's 1.5 × K_ref is removed). | §9.5, DECISIONS.md | T |
| M2-ECON-08 | **Wear.** Each day, K goes down by `machineryWear` (default 0.25%). | §9.5 | T |
| M2-ECON-09 | **Background carriers** (owner, 2026-10-27; replace the §9.7 flow formula). Carriers buy at a source (stock above `surplusShareOfTarget` × target) and sell at a sink within `maxJumps` (3) jumps if `(sellPrice_B − buyPrice_A − cost) / buyPrice_A ≥ minMargin`. `cost = mass × (costPerTonne + costPerTonneJump × jumps) + buyPrice_A × riskPerJump × jumps`. Best profit per tonne first. Each day they move `dailyShare` of the open amount. They fill a sink up to the stock where its price falls to the route's break-even price (at most `exportStockRatio` × target), counting goods in transit less the sink's use during transit. Capacity per sector: `sectorCapacityTonnes × (0.2 + 0.2 × security level)` tonnes per day, on each sector of the path. Goods arrive after `transitDays + transitDaysPerJump × jumps` days. | §9.7, DECISIONS.md | T |
| M2-ECON-10 | Carriers trade only between locations that trade the commodity. All decisions of one day use the prices at the start of the step. Goods in transit are part of the saved economy state. | §9.7 | T |
| M2-ECON-11 | **Off-map supply and demand:** none (owner, 2026-10-27). Input trickle and region balance are 0; the export rule is removed. The economy is closed. | §9.8, DECISIONS.md | T |
| M2-ECON-12 | **Region balance:** off (`offMapBalance` 0). The code stays for tests and tuning. | §9.8 | T |
| M2-ECON-13 | **Price.** `price = base × clamp((target / max(stock, 1)) ^ k, 0.3, 3.0)`. `buyPrice = price × (1 + spread/2)`. `sellPrice = price × (1 − spread/2)`. `k` = 0.6, `spread` = 0.08. | §9.10 | T |
| M2-ECON-14 | **Trade quote.** A function quotes a buy or sell of N units unit by unit. Each unit sold adds 1 to stock. Each unit bought removes 1 from stock. Large trades get worse prices. (The Market screen uses it in M3.) | §9.10 | T |
| M2-ECON-15 | The economy keeps daily prices for each location and commodity for at least 30 days (for trend arrows in M3). | §9.12 | T |
| M2-ECON-16 | The economy records daily output ratio (output / nominal batches) for each producer. | §9.13 | T |
| M2-ECON-17 | `securityMult` is the economy multiplier of the sector security level (`security.json`, §10.2 table). | §9.3, §10.2 | T |
| M2-ECON-18 | All economy values (κ, k, spread, wear, shares, multipliers) are in `/data`. | §0.4 | I |
| M2-ECON-19 | The economy tick must be fast enough for the generator validation loop. Measure the time of one tick and write it in `PROGRESS.md`. | Risk | S |

## 4. Tools (TOOL)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M2-TOOL-01 | `tools/gen-report.ts` generates 100 seeds. It prints blueprint ratios, rule results, repairs, retries, and station-slot use for each seed, and a summary. | §6.11 | S |
| M2-TOOL-02 | `tools/sim-economy.ts` runs N days on M seeds (default 1000 days, 20 seeds) with no player and fixed security. | §9.13 | S |
| M2-TOOL-03 | `sim-economy.ts` writes one CSV file per run: one row per day, location, and commodity, with stock, target, price, production, consumption, flow in, flow out, installed machinery, and capacity. | §4.3 | S |
| M2-TOOL-04 | `sim-economy.ts` prints minimum, median, and maximum price per commodity per development level, and a PASS or FAIL line for each check in §9.13. | §9.13 | S |
| M2-TOOL-05 | `sim-economy.ts` reports a "chain shock": stop all Iron Ore output in one sector for 30 days, then report the Alloys price rise in its neighbor sectors and the days to recover. Report only (owner, Q-32). | §9.13 | S |
| M2-TOOL-06 | `sim-economy.ts` checks "capital responds": stop all Machine Works for 60 days; the Machinery price rises, K* falls, and the price is back within 20% within 180 days after the restart. It reports the player effect: 10 Machinery delivered to a Frontier mine at 0.5 × K* and at K* (Q-33). | §9.13, Q-33 | S |
| M2-TOOL-07 | Route margin (for the §9.13 route checks) = `(sellPrice_B − buyPrice_A) / buyPrice_A`, for routes of 1 to 3 jumps (1 to 2 jumps for raw goods). | §9.13 | S |
| M2-TOOL-08 | Debug panel: "show all prices". | §4.3 | M |

## 5. Tests (minimum)

- **Recipe value rule:** for each recipe, the base value of outputs ≥ 1.3 × the base value of inputs. (`§9.1`)
- **Wear rule:** for each producer, `machineryWear × K_ref × Machinery base price` < 20% of daily output base value. (`§9.5`)
- `capitalFactor`: K = 0 gives 0.6. K = K_ref gives 0.9. Large K approaches 1.2.
- `inputFactor`, output formula, and stock changes for one producer.
- Price formula, clamp, spread, and unit-by-unit quotes.
- Carriers: route limit, minimum margin after cost and risk, break-even fill, transit days, capacity by security, goods in transit counted.
- Off-map trickle and region balance start and stop.
- Each generator rule in §6.10, over at least 20 seeds.
- Blueprint: counts and minimum 2.
- Host table (§7.2): no producer on a body or development level that is not allowed.
- No stock below 0 after any tick.
- Determinism: the same seed gives the same prices on day 200.

## 6. Exit checks

| # | Check | Source | Verify |
|---|---|---|---|
| 1 | At least 95 of 100 seeds pass with 2 tries or fewer. | §6.11 | S (`gen-report.ts`) |
| 2 | No systemic price clamp: no commodity is at the price clamp (0.3 or 3.0) on more than 50% of its market-days. Shares above 20% are reported only (owner, Q-31: price gaps are good for trade). | §9.13, Q-31 | S |
| 3 | No stock is below 0. | §9.13 | S, T |
| 4 | No permanent stop: no producer is below 30% output for more than 365 days in a row. Shorter busts are reported (owner, 2026-10-27). | §9.13, DECISIONS.md | S |
| 5 | Report: gradient (raw goods dearer in Core; advanced goods cheaper in Core, per commodity, Q-34). Not a check (owner, 2026-10-27). | §9.13 | S |
| 6 | Report: each commodity has a route (1–3 jumps) with a margin of 25% or more on 60% of days. Not a check (owner, 2026-10-27). | §9.13 | S |
| 7 | Report: raw goods have routes of 1–2 jumps with margins of 40%–80% on 50% of days. Not a check (owner, 2026-10-27). | §9.13 | S |
| 8 | Chain shock: report only (owner, Q-32). Swings and boom/bust cycles are a feature. | §9.13, Q-32 | S |
| 9 | Capital responds: when Machine Works stop for 60 days, Machinery is dearer and K* falls; after the restart, the Machinery price is within 20% of a control run (no stop) in 180 days (owner, Q-33). | §9.13, Q-33 | S |
| 10 | Recipe value and wear unit tests pass. | §19 | T |
| 11 | `PROGRESS.md` is updated with the tool results. | §0.9 | I |

## 7. Stretch goal: NPC trade agents (§9.9)

**Parked until after the MVP (owner, 2026-10-28).** Build this only if all exit checks pass early on Day 2. If not, it is the first item after the MVP (§21, item 1). The code must allow agents later: they are Actors and use the same services (G-07).

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M2-AGT-01 | An agent is an Actor with one ship (hull and default loadout), a home sector, and a budget per trip. | §9.9 | T |
| M2-AGT-02 | Route choice: profit per day within 2 jumps with live prices. Select at random from the top 3. Trade only if the margin is 20% or more. Reservations reduce demand that other agents see. | §9.9 | T |
| M2-AGT-03 | Travel is abstract. Each trip rolls for pirates by sector security. A lost agent comes back after 10–20 days. | §9.9 | T |
| M2-AGT-04 | Agents do `agentTradeShare` (0.3) of the trade. Reduce the carrier capacity by the same share. Start with 15–25 agents. | §9.9 | S |

## 8. Open questions for this milestone

Q-03 (commodities per location, decided: no limit), Q-05 (minimum target), Q-06 (supply/demand ratio), Q-07 (Frontier count), Q-22 (Bounty Guild security). See [README.md](README.md#8-open-questions-conflicts-and-gaps-in-the-brief).

## 9. Not in this milestone

Market screen, Refuel, and other services for the player (M3). Market events (M7). Security changes from player actions (M5). Price information rules (M3).
