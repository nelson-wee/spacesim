# Second chance: scope proposal (Q-52)

Status: planned for M8 (owner, 2026-11-03; M8-SC-01 to M8-SC-06), with an owner exception to the feature freeze. Owner decisions: Medium security gets the guild relief; the pirate trade-in keeps the debt until the contract is done; the Pirate Haven offers a buyback of the original ship (the contract delivers the captured vessel to the pirates); the starting ship is named "Fresh Start". Nothing in this file is built yet.

## 1. The problem

A player invests all credits in cargo. Pirates disable the ship and take all the cargo; the tow fee and the repairs put the player in debt. In debt, the player cannot buy cargo, modules, hulls, or contracts (Section 8.6). With no cargo and no module left to sell, the player cannot trade again: only Retire is left. In `sim-career`, the test bot ended like this in 2 of 6 careers.

## 2. Trigger (both options)

- **When:** the first time a tow docks the fleet at a location and the credits are below 0 after the fee (`towFleet`, also after pirates disable the ship).
- **Once per career:** `career.secondChanceUsed` becomes true when the offer shows, also if the player declines it. The save keeps it.
- **Which offer:** by the security level of the sector where the tow docks the fleet.

| Sector level | Offer | Proposed default |
|---|---|---|
| 3-4 (High, Secure) | Guild relief contract (Section 3) | Yes |
| 2 (Medium) | Guild relief contract (owner, 2026-11-03) | Yes |
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
| At once | The flagship (with its modules) is traded for a raiding Wasp: a new player loadout `raider_wasp` (Wasp hull; Pulse Laser S and Autocannon S; Engine; Reactor; Fuel Tank S, so that it can travel; full fuel). The debt stays until the contract is done (owner). Other fleet ships stay. |
| Task | Capture a special trader: a Light Freighter with cargo (and a small escort in a Medium sector) in a sector 1-2 jumps away with security level 2 or lower. The encounter is guaranteed on arrival in that sector or on Hunt there (as a named bounty). Then bring the captured ship, with its cargo, to a known Pirate Haven within 3 jumps. |
| Capture | The normal rules: the trader surrenders by morale (70%) or by forced surrender (engine value 0 and hull 20% or less; the Wasp's laser aims best at the Engines). Prize rules apply (fleet size, notoriety +10 for a non-pirate prize). |
| Done | Docked at a Pirate Haven with the captured vessel in the fleet. The pirates take the vessel (the contract is for its delivery); the debt is cleared; the player keeps the cargo sale (the Haven buys at 70%). |
| Buyback | After that, the Haven offers the original ship with its modules at its trade-in value (owner, 2026-11-03). |
| Fail | 25 days pass, or the trader escapes or is destroyed: the contract ends. The player keeps the Wasp, and the debt stays. |
| Side effects | The attack and the prize raise notoriety (about +25: Suspect). Secure sectors can refuse docking. This is the change of playstyle. |

Code: the `raider_wasp` loadout (data), the trade-in (headless), a contract kind `raid` with a spawned encounter (the named-bounty mechanism), the Pirate Haven completion check, a modal screen, tests. About 1 day.

## 5. After the second chance

If the player is stuck again later (in debt, no cargo, no module to sell), the owner note gives a forced retire as an option: the game shows "You cannot trade any more" with Retire (a career end with the reason "bankrupt"). Proposed: offer Retire on that screen; do not force it, because a fleet can still have a ship to sell.

## 6. Owner decisions (2026-11-03)

1. Medium security (level 2): guild relief.
2. Option A reward: the debt is cleared (proposed default kept).
3. Option B: the debt stays until the contract is done (not cleared by the trade-in).
4. Option B: the other fleet ships stay (proposed default kept).
5. A later stuck state: Retire offered, not forced (proposed default kept).
6. Milestone: M8, with an exception to the feature freeze.
7. Buyback of the original ship at the Pirate Haven, at its trade-in value (price: proposed default).
8. The starting ship is named "Fresh Start".
