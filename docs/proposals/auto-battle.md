# Auto-battle and loadout tactics: scope proposal (Q-40, Q-47)

Status: Section 2 modes A, B, and C with the Balanced doctrine are built (owner, 2026-10-29; `DECISIONS.md`). The win estimate (2.3), the other doctrines (2.4), and Section 3 are proposals.

## 1. What exists now

### 1.1 The code is ready for an auto-battle

- `resolveTurn(battle, null, data)` runs the AI for the player's ship (`src/combat/resolver.ts`, step 1). `sim-combat` and the `sim-trader` encounter bot use this already.
- The AI uses the same orders as the player (`applyOrder`). An AI turn is a legal player turn.
- `finishBattle` (`src/career/battleEnd.ts`) applies the result, loot, consequences, defeat, and the tow. It is headless.
- The battle uses its own RNG stream (`state.rng.combat`). The battle is deterministic for a seed.

Thus an auto-battle is mainly UI work and one new AI profile. The rules do not change.

### 1.2 How the AI uses the loadout now

| Input from the loadout | AI use | File |
|---|---|---|
| `powerPriority` (data, per loadout) | Reserving modules (shields, thrusters, point defense) get power in this order. | `aiPower` |
| Range of the direct weapons that are ON | Wanted distance = `bestRangeShare` (0.5) × the shortest range. | `wantedDistance` |
| Power draw of the engine and the weapons | The ship stands and fires when it cannot pay for a move and all its shots. It does not overdraw. | `standAndFire`, `aiFire` |
| Heat per shot | The ship does not fire a shot that would cause an overheat. Raider and Trader AI switch OFF the hottest weapon at Hot. | `aiFire`, `heatTooHigh` |
| Guided weapons and ammunition | The ship launches when the target is in launch range and ammunition is left. | `canReach`, `readyWeapons` |
| Hit chance of each weapon | If the main target is out of reach of a weapon, the weapon fires at the target with the best chance. | `aiFire` |
| Footprint and move | The ship looks 4 turns ahead for a cell with a clear line of fire (around asteroids). | `aiMove` |

The AI kind (Raider, Trader, Attack, Patrol, Evader) sets the target and the retreat rule. The loadout does not set them.

### 1.3 What the AI does not use

These gaps make all loadouts fight in almost the same way: "go to half the shortest range, then fire all weapons".

| # | Gap | Effect now |
|---|---|---|
| G1 | Guided weapons do not count for the wanted distance. | The Torpedo Frigate goes to 5 cells (half the beam laser range). It does not stay at its torpedo range (20). A ship with only guided weapons goes to 1 cell. |
| G2 | The wanted distance uses only the shortest range. | A ship with a heavy cannon (range 14) and an autocannon (range 7) fights at 3-4 cells. It does not use its long range. |
| G3 | The AI does not compare its speed and range with the enemy's. | A fast ship with long range does not stay out of the enemy's range (kite). A slow ship does not close in quickly on a long-range enemy. |
| G4 | The weapon order is the slot order. | When power is short, the AI does not fire the weapon with the most damage per power first. |
| G5 | The AI does not match weapons to the target's defense. | Lasers (`vsShield` 1.5) and ballistics (`vsHull`, `armorPierce`) fire at the same target. Lasers do not go first at a full shield, and ballistics do not go first at a ship with no shield. |
| G6 | Target choice is nearest (or most cargo). | The AI does not focus on the weakest enemy or on the most dangerous enemy. |
| G7 | The aim is always the hull. | The AI never aims at the engines. In a pursuit, an automatic player cannot catch an Evader. |
| G8 | The AI does not react to munitions in flight. | It does not move away from torpedoes, does not use asteroids as cover, and does not give power to point defense first. |
| G9 | Heat has a one-turn view. | The AI does not plan heat over several turns (for example, fire the hot weapon on alternate turns). |
| G10 | Only the Raider AI retreats, by hull share. | The Attack AI never flees, also when the battle is lost. |

## 2. Auto-battle for the player

### 2.1 Modes

| Mode | What the player does | Use |
|---|---|---|
| A. Auto turn | Press a key: the AI plans this turn for the player. The player sees the turn and can take control again on the next turn. | Quick turns in an easy fight. The player learns from the AI. |
| B. Auto until | Press a key: the AI plays turn after turn, with the effects shown. It stops at a stop condition (Section 2.2), or when the player presses a key. | Long fights with a clear result. |
| C. Auto-resolve | On the hail screen (Fight) or on the first turn: the battle resolves at once. A result screen shows the turns, the damage, the loot, and the losses. | Fights that the player does not want to play. |

Modes A and B keep the player's agency (owner note, 2026-10-28). Mode C removes it for one battle, so it shows the risk first (Section 2.3).

### 2.2 Stop conditions (mode B)

The auto-battle stops before the next turn if:

- the flagship hull goes below a player limit (default 50%);
- the ship is Hot, or an overheat would come;
- a reinforcement arrives;
- a guided munition comes near the flagship;
- a new enemy ship comes into view.

The limits are in `balance.json` (`combat.auto`).

### 2.3 Risk display before auto-resolve (mode C, optional)

- Show "Estimated win chance: N%". The game runs `autoEstimateRuns` (for example 20) headless copies of the battle, each with a copy of the RNG stream. The copies do not use the real stream.
- Cost (measured in Node, 2026-10-29): Shuttle vs 1 Raider takes about 45 ms for each battle, Gunship vs 3 Raiders about 65 ms, and a Battleship battle about 150 ms. Thus 20 copies take 1-3 s. The estimate must run in a Web Worker (or with fewer runs), so that the screen does not stop.
- The same estimate can show on the hail screen for Fight. It replaces a guess from the TU ratio.

### 2.4 Player doctrine

The player selects a doctrine for the auto modes. The doctrine also becomes the default plan that the AI uses when the player gives no order.

| Doctrine | Rules |
|---|---|
| Balanced (default) | Like the Attack AI, with the loadout profile (Section 3). Flees below the hull limit. |
| Aggressive | Closes in, fires at once, does not flee. |
| Standoff | Stays at the longest effective range. Moves away if the enemy closes in. |
| Disable | Aims at the engines. Use: pursuit, and capture of prize ships in M6. |
| Escape | Goes to the nearest edge and fires only at ships that block the way. |

### 2.5 Changes

| Area | Change | Size |
|---|---|---|
| `src/combat/types.ts` | `AiKind` adds `auto`; `CombatShip.doctrine`. | S |
| `src/combat/ai.ts` | `auto` profile: target, retreat at the hull limit, doctrine rules. The heat guard of the Attack AI. Fixes G7 and G10 for the player. | M |
| `src/combat/autoplay.ts` (new, headless) | `autoTurn`, `autoUntil(stop)`, `autoResolve`, `estimateWin(battle, runs)`. | S |
| `src/ui/screens/combat.ts` | Keys: T auto turn, Shift+T auto until, stop on any key. A speed setting for the effects. The doctrine on the panel. | M |
| `src/ui/screens/hail.ts` | "Auto-resolve" option and the win estimate. | S |
| Result screen | Summary of an auto-resolved battle (turns, damage, loot, losses, notoriety). | S |
| `data/balance.json` | `combat.auto`: stop limits, `autoEstimateRuns`, effect speed. | S |
| Tests | Auto-resolve gives the same result as a turn loop with no orders on the same seed. The estimate does not change the real RNG stream. Stop conditions. | S |
| Save (M7) | The doctrine and the hull limit go into the save. | S |

Estimate: about 1 day for modes A, B, and C with the Balanced doctrine. Add 0.5 day for the win estimate, and 0.5 day for the other doctrines. The tuning risk is low: NPC behavior does not change.

## 3. Loadout tactics for the AI

### 3.1 Proposal: a tactical profile from the loadout

A new headless function `tacticalProfile(ship, data)` (`src/combat/tactics.ts`) calculates these values from the loadout. It needs no new data per loadout, so it also works for player loadouts.

| Value | Calculation | Fixes |
|---|---|---|
| Range band | For each weapon (guided weapons included): its range and its expected damage per turn at each distance (hit chance, `rangePenalty`, damage). The band is the distances where the ship does most of its damage. | G1, G2 |
| Speed edge | My `moveBudget` against the fastest enemy. My best range against the enemy's best range. If I am faster and my range is longer: kite (stay out of the enemy's range band). If I am slower: close in by the shortest path. | G3 |
| Weapon order | Fire the weapons in order of expected damage per power (after shields, armor, and `armorPierce` of the target). | G4, G5 |
| Target value | Expected damage that I can do to the target / its remaining HP, plus a term for the target's damage to me. | G6 |
| Munition threat | Incoming munitions: their expected damage and the turns to impact. | G8 |

### 3.2 Proposal: a score for each move cell

`aiMove` now uses a fixed order of rules: line of fire, then wanted distance, then fewer steps. A score is more flexible:

```
score(cell) = damage I can do from the cell
            − aggression × damage that the enemies can do to me at the cell
            − munition threat at the cell
            + cover (asteroid between the cell and an enemy)
```

- `aggression` comes from the AI kind and the doctrine (Raider 0.6, Patrol 0.8, Aggressive 0.3, Standoff 1.5). The values go in `balance.json`.
- The scores use only the formulas of `rules.ts` (`hitChance`, `applyHit` values), so the AI uses the same rules as the player.
- CPU cost: reachable cells × enemies × weapons. For capital ships, use only cells on the path to some goal cells (for example 30).

### 3.3 Optional: a doctrine per loadout in data

`loadouts.json` gets an optional `doctrine` (Brawler, Standoff, Kite, Striker, Support). The doctrine sets the `aggression` and the range band if the profile is not correct. Use it only where the calculated profile does not give the behavior the designer wants. Default: no doctrine (the profile only).

### 3.4 Risks

- **All combat checks change.** The §13.9 pairings and the M4 and M5 tuning use the current AI. A better AI changes the win rates. Example: a torpedo ship at range 20 can win more against a Battleship. The laser vs ballistic checks can change direction.
- **Encounter difficulty changes.** Pirates with a better AI are stronger at the same TU. Sector budgets can need new values.
- **`sim-combat` gets slower.** It takes about 13 minutes now (300 battles per pairing). The score in Section 3.2 adds CPU time.
- **Skill gap.** If the AI is too good, the player has little edge over auto-resolve. The Q-40 skill-gap check is the guard: a scripted good player must beat the Balanced auto-battle by a margin in `sim-combat`.

Mitigation: keep each change behind a value in `balance.json`, so that `sim-combat --override` can compare old and new AI. Change the AI and tune the modules again in the same work (owner note: module tuning pass).

### 3.5 Changes

| Area | Change | Size |
|---|---|---|
| `src/combat/tactics.ts` (new) | `tacticalProfile`, expected damage per weapon and per distance, target value, munition threat. | M |
| `src/combat/ai.ts` | Move score (Section 3.2), weapon order, target value, engine aim for Evader pursuit, retreat by odds. | M |
| `data/balance.json` | `combat.tactics`: aggression per AI kind, weights, cell cap. | S |
| `data/loadouts.json` | Optional `doctrine` (Section 3.3). | S |
| `tools/sim-combat.ts` | Pairings for the new behavior: Torpedo Frigate stays at range; a fast laser ship kites a slow ballistic ship; a skill-gap pairing. | S |
| Tests | Profile values for reference loadouts; the move score selects a range cell for a torpedo ship; the weapon order. | S |
| Tuning | Run `sim-combat` again; tune modules and budgets. | L |

Estimate: about 1.5 days of code and 1-2 days of tuning. The tuning risk is high.

## 4. Proposed order

1. **Auto-battle (Section 2), modes A, B, C with the Balanced doctrine.** Low risk. NPC behavior does not change. It can go in M6 (the prize ship flow uses the Disable doctrine) or in M8 (polish).
2. **Fix G1 and G7 only** (guided weapons in the range band; engine aim in a pursuit). These are small, local changes. Run `sim-combat` again.
3. **The tactical profile and the move score (Section 3)**, together with the module tuning pass (owner note, `README.md` Section 11). Do them at the same time, because both need a full re-tune.
4. **The win estimate and the other doctrines**, when the AI is stable.
