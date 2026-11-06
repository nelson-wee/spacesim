# Factions and fleet combat: scope (2026-11-06)

Status: scope; owner decisions of 2026-11-06 are in. Next step: a requirements file for fleet combat. Brief: Section 21 (Parked list) items 4 (factions) and 8 (fleet combat, Appendix B.2); item 14 (strongholds) needs both. The brief rule "add one Parked item at a time" stays: this file scopes two items, which are built one after the other, each on its own branch.

## 1. Summary

| Item | What the player gets | Effort | Tuning risk |
|---|---|---|---|
| Fleet combat (Option B) | All fleet ships can fight. The player controls the flagship; the other ships follow orders (Attack, Guard, Hold, Retreat). | 5-6 days | High (encounter scaling, turn length) |
| Factions (owner version, 2026-11-06) | 2 states (peace or conflict) and 1-3 pirate clans (peace or war with each other); the Guild in state sectors. Each sector has an owner. Reputation from combat and from trade volume; reputation tiers give benefits. Hostile-faction encounters. Territory on the region map and a Politics screen. | 10-12 days | Medium-high (benefits and trade reputation touch the economy) |
| Strongholds (later) | Clan bases in Lawless sectors that a fleet can attack; a clan loses territory when its base falls. | 3-4 days | High |

**Recommended order:** fleet combat first, then factions, then strongholds. Reasons: fleet combat uses the existing battle engine and fleet model and does not change the world generator; factions change the generator, the save format, and the contract boards, so all M2 and M7 checks run again; strongholds need both.

## 2. What exists now

| Area | Now | Ready for the new items? |
|---|---|---|
| Fleet | Up to 4 ships (`fleet.maxFleetSize`); only the flagship fights (Section 11.9); upkeep by size class; prizes join the fleet. | Yes: each ship has its own loadout, cargo, fuel, and HP. |
| Battle engine | Many ships on each side (escorts, reinforcements, patrols that join the player); one ship has `ai: 'human'`; AI kinds `attack`, `raider`, `trader`, `patrol`, `evader`, plus the Balanced auto-battle AI. | Mostly: the engine takes a list of player-side ships. The end rules, the copy back to the fleet, and the UI assume one player ship. |
| Encounters | The threat budget comes from the sector only; the player's ship does not change it (M5-THREAT-04). Pirate chance x (1 + 0.1 x (fleet size - 1)). | Needs a decision (Section 3.3, point 3). |
| "Factions" in code | `Faction = 'player' | 'pirate' | 'trader' | 'patrol'`: combat roles, not polities. | No polity model. |
| Law and reputation | One global notoriety (Suspect 25, Wanted 50): docking refusal and hostile patrols by sector security; Pirate Havens accept all. Merchants' Guild standing (completed - 2 x failed). | The rules are a good base; they become per faction. |
| World | 8-12 sectors (core, middle, frontier), security that drifts, a Pirate Haven in each world. | Small: room for 2 states and 1-3 clans, not more. |

## 3. Fleet combat (Option B)

### 3.1 Rules (proposal)

| Rule | Proposal |
|---|---|
| Who fights | Each fleet ship has a battle setting: **Join** or **Stay out**, set on the fleet screen (owner, 2026-11-06). Default: armed ships join; unarmed ships (no weapon) stay out. Stay-out ships are off the map and safe, as now. |
| Fleet limit | **Command points** 6 (brief B.2): Small 1, Medium 2, Large 3, Capital 6. Keep `maxFleetSize` 4 as the ship count limit. A capital ship then fills the fleet. |
| Control | The player gives orders to the flagship as now. Other ships have an order: **Attack** (a target, or the nearest hostile), **Guard** (a ship; stay near it, attack what attacks it), **Hold** (stay; fire at what is in range), **Retreat** (go to the map edge and flee). The player changes an order at any time in the turn (key O, then the ship, then the order). |
| AI | One new AI kind, `wingman`: the Balanced AI (auto-battle) with the order as its goal. Patrol AI parts give Guard. |
| Start | Fleet ships start in a column near the flagship, in the player's start area. |
| Flagship destroyed | The battle goes on: the next joined ship becomes the flagship and the player controls it. The battle ends as a loss only when no player ship is left on the map. |
| Flee | Each ship flees on its own (map edge, engine ON). Result `fled` when all remaining player ships have fled. Ships that stay behind can still be destroyed or surrender. The pirate cargo rule (50% of one stay-out ship) stays. |
| After the battle | Each ship that fought keeps its HP, heat, fuel, and ammo. A destroyed fleet ship and its cargo are lost. Prizes and the after-battle screen do not change. |
| Auto-battle | T, Shift+T, and R also play the fleet ships (they already run AI). |

### 3.2 Changes to the code

| # | Part | Change | Effort |
|---|---|---|---|
| A | Data and fleet screen | `fleet.commandPoints`, points by size class, battle setting and order on each fleet ship (save version + 1, old saves: Join if armed); a fleet-screen key toggles Join / Stay out, and the screen shows the command points. | 0.5 day |
| B | Battle start and end | All joined ships on the player side; start positions; copy each ship's state back (now only the flagship); the new flagship and loss rules; flee for each ship. | 1 day |
| C | Wingman AI | Order goals on the Balanced AI; target and guard selection; Retreat. | 1 day |
| D | Combat screen | A fleet list in the panel (HP, shield, order, status); the order keys; a marker on the controlled ship; help and tips. The move and shot animations already handle many ships; the turn gets longer (Section 3.3, point 4). | 1 day |
| E | Encounters | Encounter strength and hail odds with the fleet (point 3). | 0.5 day |
| F | Tools and tuning | `sim-combat` fleet pairings (for example Gunship + Light Freighter vs pirate groups); `sim-trader --fleet` with fleet battles; the play-test bots join fleets; tune. | 1 day |
| G | Tests and docs | Unit tests for each rule, browser check, DECISIONS, PROGRESS, requirements file `docs/requirements/P1-fleet-combat.md`. | 0.5 day |

Total: about 5-6 days (the brief says 3-4; the UI and the encounter tuning add time).

### 3.3 Owner decisions (2026-11-06)

1. **Stay out:** armed ships join by default; the player sets Join or Stay out for each ship on the fleet screen.
2. **Encounter scaling:** partial. The pirate budget grows by half of the threat units of the joined ships other than the flagship; pirate groups that are much weaker than the fleet do not attack. Patrol and bounty groups do not scale. *Note (not a requirement): a later difficulty setting can change the scaling share.*
3. **Fleet limit:** command points 6 (Small 1, Medium 2, Large 3, Capital 6) and at most 4 ships.
4. **Turn time (proposal, open):** keep the budgets (1.2 s for shots, 1.5 s for moves), so each effect plays faster in a big battle; Space skips as now.

## 4. Factions (owner version, 2026-11-06)

### 4.1 Rules

| Rule | Owner decision or proposal |
|---|---|
| Factions | **2 states** and **1-3 pirate clans** (owner). The **Merchants' Guild** works only in state (lawful) sectors (owner). Names and numbers in `data/factions.json`. |
| Territory | The generator gives each sector an owner: each state grows from one core sector by jumps; low-security frontier sectors go to clans (each clan has a Pirate Haven); some sectors stay unclaimed. |
| Relations | States and clans are always at war (owner). The 2 states are at **peace** or in **conflict** (owner); clans are at **peace** or **war** with each other (owner). *Proposal:* a relation changes at random intervals (a roll every 60-120 days; a conflict lasts 30-90 days); the game shows a message and the Politics screen shows the change. No full war simulation (owner). |
| Reputation | -100 to +100 with each faction. It replaces the global notoriety: notoriety becomes "reputation with the state that owns the sector"; the same thresholds (Suspect, Wanted) apply. Reputation moves back to 0 a little each day, as notoriety does now. |
| Reputation from combat | Attack or destroy a ship of a faction: that faction -. **States in conflict:** attack or capture a ship of the other state: + with the state (owner); no loss with the own state. **Clans:** attack a rival clan's ships (war): + with the clan; attack an allied clan's ships (peace): - with the clan (owner). Kill pirates in a state sector: + with that state. |
| Reputation from trade | Trade in a sector of a faction gives reputation with that faction **by volume (tonnes), not value** (owner). *Proposal against abuse:* count tonnes sold (not bought), with a daily cap for each faction; goods bought and sold at the same location do not count. |
| Reputation tiers and benefits | Benefits by tier (owner: for example subsidized modules or trade goods, free refuels). *Proposal (numbers in data):* Hostile (-50 or less): no docking, its ships attack; Unfriendly (-10 to -50): +10% service prices; Neutral; Friendly (+25): -10% refuel and repair; Trusted (+50): -15% modules and hulls, better contract offers; Honored (+75): free refuel, -5% buy price of goods that the faction's locations make. Clans: Friendly and above, the clan's pirates hail before they attack and ask a smaller tribute; the Haven sells more. |
| Hostile encounters | In a faction's sector, encounters can come from its enemies (owner): in a state sector, pirates and (during a conflict) raiders of the other state; in a clan sector, state hunters and ships of a rival clan at war. *Proposal:* hostile-faction groups attack the player when the player's reputation with that faction is below 0, or high with its enemy (Trusted or above); else they pass. |
| Territory change | *Proposal:* when a state's sector stays at security level 0 for 30 days, the nearest clan takes it; when a clan's sector reaches level 2 for 30 days, the nearest state takes it. The current security drift drives this. |
| UI | **Region map:** a key toggles the territory view (owner of each sector) (owner). **Politics screen (new, owner):** factions, their relations (peace, conflict, war, and since when), territory count, the player's reputation, tier, and benefits with each faction, and recent political events. |
| Not in this version | Full wars and faction fleets that move on the map (owner), a player faction, owned locations (Parked item 5). |

### 4.2 Changes to the code

| # | Part | Change | Effort |
|---|---|---|---|
| A | Data | `factions.json`: factions, relation rules, reputation numbers, tiers and benefits; schema; checks. | 0.5 day |
| B | Generator | Sector owners; one Haven for each clan; the Guild only in state sectors; `gen-report` checks. | 0.75 day |
| C | Reputation core | Reputation for each faction in place of notoriety; combat events by relation; daily return; docking and patrols by owner. | 1 day |
| D | Relations | State peace and conflict, clan peace and war: timers, messages, history for the Politics screen. | 0.75 day |
| E | Trade reputation | Tonnes sold in faction sectors; daily cap; abuse rules. | 0.5 day |
| F | Tiers and benefits | Discounts in the market, outfitter, shipyard, refuel, and mechanic; free refuel; contract quality by tier; clan tribute and hail. | 1.25 days |
| G | Faction encounters | Groups by sector owner and relations (state raiders, rival clan pirates, state hunters); state ship templates; hail rules by reputation; the faction id on combat ships; conflict reputation on attack and capture. | 1.5 days |
| H | Territory change | Daily check of security against the owner; messages; contract and market effects of a new owner. | 0.75 day |
| I | Contracts | Boards by owner; the Guild only in state sectors; offers by tier. | 0.5 day |
| J | UI | Region map territory toggle; sector panel; the Politics screen; benefits on the location and service screens; status bar; Codex, help, and tutorial text. | 1.75 days |
| K | Save | Save version + 1; old saves get owners from the generator rules; notoriety becomes state reputation. | 0.25 day |
| L | Tools, tests, docs | `sim-playtest` checks (reputation in range, valid owners and relations) and a faction-play style; `sim-economy`, `sim-trader`, and `sim-career` again (discounts change profit); unit tests; browser check; DECISIONS, PROGRESS, `docs/requirements/P2-factions.md`. | 1.25 days |

Total: about **10-12 days** (the first proposal was 6-7 days). The increase: relations that change (D), trade reputation (E), benefits in five services (F), hostile-faction encounters with new templates (G), and the Politics screen (J).

Option, not in the estimate: **battles in progress** (the player meets two hostile factions in a fight and can join a side). About +1 day; it fits the conflict rules well.

### 4.3 Points still open

1. **Trade reputation abuse:** the proposal counts tonnes sold, with a daily cap, and not goods bought and sold at the same location. Without a cap, a large freighter fleet gets Honored in days.
2. **Benefit sizes:** discounts and free refuel raise profit, and net worth at day 730 is already above the target (report). Proposal: small numbers first, then a `sim-career` report.
3. **Relation timing:** a roll every 60-120 days, conflicts of 30-90 days (proposal).
4. **When hostile-faction groups attack the player:** reputation below 0 with them, or Trusted or above with their enemy (proposal).
5. **Colors:** owner colors on the region map need new style colors from Claude Design (`style.json` is not edited by hand). Until then: a letter for each faction in existing colors.
6. **World size:** 8-12 sectors fit 2 states and 1-3 clans; more factions need a larger world.

## 5. Strongholds (after both items)

A clan's base in a Lawless sector: a location with defenses and a large garrison. A fleet attacks it as a battle with special rules (station on the map, waves). A win gives a large bounty and the clan loses its hold on nearby sectors. Effort 3-4 days, mostly the battle map and tuning. Scope it after fleet combat and factions are done.

## 6. Risks

- **Balance.** Fleet combat changes how safe a career is; factions change contracts and docking. Economy and balance results stay reports (owner, 2026-11-04), but the M5 and M6 checks need new targets for fleets.
- **Turn length.** Big battles take longer to play and to watch.
- **Save format.** Each item raises the save version; old saves load with defaults.
- **Feature size.** Each item must work alone; factions must not need fleet combat, and the reverse.
