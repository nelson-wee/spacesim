# Second chance: scope proposal (Q-52)

Status: proposal (2026-11-03). Nothing in this file is built. The owner selects the options, the defaults, and the milestone. M8 is after the feature freeze, so this needs an owner exception.

## 1. The problem

A player invests all credits in cargo. Pirates disable the ship and take all the cargo; the tow fee and the repairs put the player in debt. In debt, the player cannot buy cargo, modules, hulls, or contracts (Section 8.6). With no cargo and no module left to sell, the player cannot trade again: only Retire is left. In `sim-career`, the test bot ended like this in 2 of 6 careers.

## 2. Trigger (both options)

- **When:** the first time a tow docks the fleet at a location and the credits are below 0 after the fee (`towFleet`, also after pirates disable the ship).
- **Once per career:** `career.secondChanceUsed` becomes true when the offer shows, also if the player declines it. The save keeps it.
- **Which offer:** by the security level of the sector where the tow docks the fleet.

| Sector level | Offer | Proposed default |
|---|---|---|
| 3-4 (High, Secure) | Guild relief contract (Section 3) | Yes |
| 2 (Medium) | Not in the owner note | Guild relief contract (the guild still works there) |
| 0-1 (Lawless, Low) | Pirate offer (Section 4) | Yes |

The offer is a modal screen with Accept and Decline. With Decline, the career goes on as it is.

## 3. Option A: Guild relief contract (secure sectors)

| Item | Rule (proposed) |
|---|---|
| At once | Free full repair (hull, armor, engine value) and full refuel of all fleet ships. The debt stays. |
| Task | Deliver 10 t (Small) of a raw commodity to a location 0-1 jumps away that needs it (a real need from the contract generator; if none, a location that trades it). The guild supplies the cargo at the tow location, free (the player cannot buy in debt). |
| Deadline | Today + 8 + 4 x jumps (the Supply rule). |
| Done | The debt is cleared (credits = 0 if below 0). The goods go into the market stock. Counts as a completed contract (standing +1). |
| Fail | The deadline passes, or the cargo is lost: the debt stays; a failed contract (standing -2). No second offer. |
| Limits | It does not count toward the 4 Merchants' Guild contracts. |

Code: a Supply contract with `relief: true` (no goods payment; the effect clears the debt), the trigger in `towFleet` (headless, a bus event `secondChance`), a modal screen, data in `contracts.json` (`relief`: tonnes, maxJumps, deadline). About 0.5 day with tests.

## 4. Option B: Pirate offer (low-security sectors)

| Item | Rule (proposed) |
|---|---|
| Offer | "The pirates here like your nerve. They take your ship in trade for a raiding Wasp, and they have a job for you." |
| At once | The flagship is traded for a raiding Wasp: a new player loadout `raider_wasp` (Wasp hull; Pulse Laser S and Autocannon S; Engine; Reactor; Fuel Tank S, so that it can travel; full fuel). The debt is cleared by the trade-in. Other fleet ships stay. |
| Task | Capture a special trader: a Light Freighter with cargo (and a small escort in a Medium sector) in a sector 1-2 jumps away with security level 2 or lower. The encounter is guaranteed on arrival in that sector or on Hunt there (as a named bounty). Then bring the captured ship, with its cargo, to a known Pirate Haven within 3 jumps. |
| Capture | The normal rules: the trader surrenders by morale (70%) or by forced surrender (engine value 0 and hull 20% or less; the Wasp's laser aims best at the Engines). Prize rules apply (fleet size, notoriety +10 for a non-pirate prize). |
| Done | Docked at a Pirate Haven with the prize in the fleet. Reward: the pirates' cut, a fixed fee (for example 2,000 cr), plus what the player gets for the cargo (the Haven buys at 70%) and the prize (sell it, or keep it). |
| Fail | 25 days pass, or the trader escapes or is destroyed: the contract ends. The player keeps the Wasp and has no debt. |
| Side effects | The attack and the prize raise notoriety (about +25: Suspect). Secure sectors can refuse docking. This is the change of playstyle. |

Code: the `raider_wasp` loadout (data), the trade-in (headless), a contract kind `raid` with a spawned encounter (the named-bounty mechanism), the Pirate Haven completion check, a modal screen, tests. About 1 day.

## 5. After the second chance

If the player is stuck again later (in debt, no cargo, no module to sell), the owner note gives a forced retire as an option: the game shows "You cannot trade any more" with Retire (a career end with the reason "bankrupt"). Proposed: offer Retire on that screen; do not force it, because a fleet can still have a ship to sell.

## 6. Open points for the owner

1. Medium security (level 2): guild relief (proposed) or pirate offer?
2. Option A reward: clear the debt only (proposed), or also the normal Supply fee?
3. Option B: does the trade-in also clear a large debt (proposed: yes, all of it)?
4. Option B: does the player keep the old flagship's other fleet ships (proposed: yes)?
5. A bankrupt state after the second chance: Retire offered (proposed) or forced?
6. Milestone: M8 with an exception to the feature freeze (proposed), or after the MVP.
