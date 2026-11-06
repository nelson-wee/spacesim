# Factions and fleet combat: scope (2026-11-06)

Status: scope only, for the owner to agree the direction before work starts. Brief: Section 21 (Parked list) items 4 (factions) and 8 (fleet combat, Appendix B.2); item 14 (strongholds) needs both. The brief rule "add one Parked item at a time" stays: this file scopes two items, which are built one after the other, each on its own branch.

## 1. Summary

| Item | What the player gets | Effort | Tuning risk |
|---|---|---|---|
| Fleet combat (Option B) | All fleet ships can fight. The player controls the flagship; the other ships follow orders (Attack, Guard, Hold, Retreat). | 5-6 days | High (encounter scaling, turn length) |
| Factions v1 | 2 states, pirate clans, and the Merchants' Guild. Each sector has an owner. Reputation with each faction changes docking, patrols, contracts, and prices. Territory changes slowly with security. | 6-7 days | Medium (generator and contracts) |
| Strongholds (later) | Clan bases in Lawless sectors that a fleet can attack; a clan loses territory when its base falls. | 3-4 days | High |

**Recommended order:** fleet combat first, then factions v1, then strongholds. Reasons: fleet combat uses the existing battle engine and fleet model and does not change the world generator; factions change the generator, the save format, and the contract boards, so all M2 and M7 checks run again; strongholds need both.

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
| Who fights | Each fleet ship has a battle setting: **Join** or **Stay out**. Default: armed ships join; unarmed ships (no weapon) stay out. Stay-out ships are off the map and safe, as now. |
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
| A | Data | `fleet.commandPoints`, points by size class, battle setting and order on each fleet ship (save version + 1, old saves: Join if armed). | 0.25 day |
| B | Battle start and end | All joined ships on the player side; start positions; copy each ship's state back (now only the flagship); the new flagship and loss rules; flee for each ship. | 1 day |
| C | Wingman AI | Order goals on the Balanced AI; target and guard selection; Retreat. | 1 day |
| D | Combat screen | A fleet list in the panel (HP, shield, order, status); the order keys; a marker on the controlled ship; help and tips. The move and shot animations already handle many ships; the turn gets longer (Section 3.3, point 4). | 1 day |
| E | Encounters | Encounter strength and hail odds with the fleet (point 3). | 0.5 day |
| F | Tools and tuning | `sim-combat` fleet pairings (for example Gunship + Light Freighter vs pirate groups); `sim-trader --fleet` with fleet battles; the play-test bots join fleets; tune. | 1 day |
| G | Tests and docs | Unit tests for each rule, browser check, DECISIONS, PROGRESS, requirements file `docs/requirements/P1-fleet-combat.md`. | 0.5 day |

Total: about 5-6 days (the brief says 3-4; the UI and the encounter tuning add time).

### 3.3 Points to decide

1. **Stay out.** Proposal above (armed ships join by default). Other option: all ships always fight; then a freighter is a target in every battle, and a backup ship is no longer safe.
2. **Fleet limit.** Command points 6 plus 4 ships (proposal), or ship count only (as now).
3. **Encounter scaling.** The brief says "enemy groups scale with fleet strength". Options: (a) no scaling: a strong fleet makes pirates easy; (b) full scaling by fleet threat units: a fleet gives no safety, only cost; (c) **partial (proposal):** the budget grows by half of the threat units of the joined ships other than the flagship, and pirate groups that are much weaker than the fleet do not attack (the hail already has odds). Patrol and bounty groups do not scale.
4. **Turn time.** With 4 player ships and 4 or more enemies, moves and shots take longer. Proposal: keep the budgets (1.2 s for shots, 1.5 s for moves), so each effect plays faster in a big battle; Space skips as now.

## 4. Factions v1

The brief names "factions, faction reputation, faction territory" and gives no rules. This is a proposal.

### 4.1 Rules (proposal)

| Rule | Proposal |
|---|---|
| Factions | **2 states** (each owns a part of the core and middle sectors; their patrols keep the law), **1-3 pirate clans** (they own Lawless and Low frontier sectors; each clan has a Pirate Haven), and the **Merchants' Guild** (no territory; contracts in all lawful sectors). Names and numbers in `data/factions.json`. |
| Territory | The generator gives each sector an owner: each state grows from one core sector by jumps; low-security frontier sectors go to clans; some sectors stay unclaimed. |
| Reputation | -100 to +100 with each faction. It replaces the global notoriety: notoriety becomes "reputation with the state that owns the sector". The same thresholds apply (Suspect, Wanted). |
| Changes | Attack or destroy a ship of a faction: that faction -. Kill pirates of a clan: the clan -, the state of the sector +. Complete a contract: the faction that gave it +. The states are rivals: a large gain with one gives a small loss with the other. Reputation moves back to 0 a little each day, as notoriety does now. |
| Effects | Docking refusal and hostile patrols by the owner's reputation (the current rules, per faction). Contracts: each board belongs to the sector's owner; high reputation shows better offers. Prices: a small tariff (for example +5% at low reputation, -5% at high). Clans: with good clan reputation, pirates of that clan hail before they attack and accept a smaller tribute; the Haven sells more. |
| Territory change | When a state's sector stays at security level 0 for 30 days, the nearest clan takes it. When a clan's sector reaches level 2 for 30 days, the nearest state takes it. The current security drift (patrols, pirate kills) drives this, so the player can move borders. |
| Not in v1 | Wars between factions, a player faction, owned locations (Parked item 5), faction fleets that travel on the map. |

### 4.2 Changes to the code

| # | Part | Change | Effort |
|---|---|---|---|
| A | Data | `factions.json` (id, name, kind, relations, the reputation numbers); schema; checks. | 0.25 day |
| B | Generator | Owner of each sector; clan Havens; `gen-report` checks (each state has a core sector, each clan has a Haven). | 0.75 day |
| C | Reputation | Reputation for each faction in place of notoriety; the change events; rivalry; daily return. | 1 day |
| D | Effects | Docking and patrols by owner; contract boards by faction and reputation; tariffs; clan hail and tribute. | 1 day |
| E | Territory change | Daily check of security against the owner; messages; contract and market effects of a new owner. | 0.75 day |
| F | Encounters and combat | Patrols carry their state, pirates their clan; the combat `Faction` gets the faction id (the role stays). | 0.5 day |
| G | UI | Region map: owner mark on each sector; sector panel; a reputation page (status bar and ledger); location screen; Codex and tutorial text. | 1 day |
| H | Save | Save version + 1; old saves get owners from the generator rules and their notoriety becomes state reputation. | 0.25 day |
| I | Tools, tests, docs | `sim-playtest` checks (reputation in range, each sector has a valid owner); `sim-economy` and `sim-career` again; unit tests; DECISIONS, PROGRESS, `docs/requirements/P2-factions.md`. | 0.75 day |

Total: about 6-7 days.

### 4.3 Points to decide

1. **What a faction is.** (a) **States, clans, and the Guild (proposal)**; (b) only pirate clans and the Guild (smaller, about 3-4 days, no state territory); (c) a full simulation with wars and moving fleets (much larger; not for the next update).
2. **Notoriety.** Replace it with reputation per faction (proposal), or keep both (simpler code, but two numbers that mean almost the same).
3. **Territory change.** Slow and driven by security (proposal), or fixed at generation for v1.
4. **Colors.** Owner colors on the region map need new style colors from Claude Design (`style.json` is not edited by hand). Until then: a letter for each faction in existing colors.
5. **World size.** 8-12 sectors fit 2 states and 1-3 clans. More factions need more sectors (generator change and economy checks again).

## 5. Strongholds (after both items)

A clan's base in a Lawless sector: a location with defenses and a large garrison. A fleet attacks it as a battle with special rules (station on the map, waves). A win gives a large bounty and the clan loses its hold on nearby sectors. Effort 3-4 days, mostly the battle map and tuning. Scope it after fleet combat and factions are done.

## 6. Risks

- **Balance.** Fleet combat changes how safe a career is; factions change contracts and docking. Economy and balance results stay reports (owner, 2026-11-04), but the M5 and M6 checks need new targets for fleets.
- **Turn length.** Big battles take longer to play and to watch.
- **Save format.** Each item raises the save version; old saves load with defaults.
- **Feature size.** Each item must work alone; factions must not need fleet combat, and the reverse.
