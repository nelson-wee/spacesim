# M8 (Day 8): Polish and release

**Goal:** The game is complete, readable, and stable. All acceptance checks pass. The final build is on GitHub Pages.

**Brief sections:** §17.1 (9), §17.5 (help), §18.3, §18.4, §23.

**Depends on:** M1–M7.

**Rule:** No new features after M6 (feature freeze). This milestone adds only the items below and bug fixes. Owner exceptions: the second chance (2026-11-03, Section 1b, Q-52); map animation and the region route highlight (2026-11-04, M8-ART-06, M8-ART-07).

**Balance (owner, 2026-11-04):** economy and balance results are reports, not gates (Section 4).

---

## 1. Screens (UI)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M8-UI-01 | **Codex.** The production chain diagram, and for each commodity: tier, sources (producers), and buyers (producers and populations). The content comes from `recipes.json` and `population.json`, not from fixed text. | §17.1 | M |
| M8-UI-02 | **Help.** `?` shows help for each screen. The title screen Help explains the core loop and the keys. | §17.1, §17.5 | M |
| M8-UI-03 | All actions have a key, and the keys show on screen. | §17.5 | M |

## 1b. Second chance (owner exception, Q-52; `docs/proposals/second-chance.md`)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M8-SC-01 | **Trigger.** The first time a tow docks the fleet and the credits are below 0 after the fee (also after pirates disable the ship), the game shows a one-time offer. Security level 2-4 at the tow location: guild relief. Level 0-1: pirate offer. `career.secondChanceUsed` is set when the offer shows, also on Decline. | Q-52 | T |
| M8-SC-02 | **Guild relief.** At once: free full repair and refuel of all ships; the debt stays. Contract: deliver a fixed 10 t of a raw commodity (supplied free at the tow location, purchase price 0) to a location 0-1 jumps away that needs it (if none, a location that trades it). Deadline: acceptance + `relief.deadlineBase` 8 + `relief.deadlinePerJump` 4 x jumps. This is its own contract kind (`relief`), not a Supply contract: no per-tonne pay, no 28-day limit, and it does not end when the need ends; it is done when the 10 t are delivered. Done: the debt is cleared (credits = 0 if below 0), then the guild pays `relief.startCapital` 1,000 cr (owner, Q-54); the goods go into the market stock; standing +1. Fail (deadline, or the cargo is lost): the debt stays; standing -2. Not counted in the 4-contract limit. Numbers in `contracts.json` (`relief`). | Q-52, Q-53 | T |
| M8-SC-03 | **Pirate offer.** The flagship (with its modules as they are at the offer) is traded for a raiding Wasp (`raider_wasp` loadout with a fuel tank, full fuel); the Wasp becomes the flagship; other fleet ships stay. The trade happens on the offer screen, not in a fleet screen session: the fleet hold is not used. Before Accept, the offer screen opens the fleet screen (I) to move modules or cargo off the flagship; that session must close normally (Section M6-FLEET-10) before Accept. Cargo still on the flagship moves to the Wasp and the other fleet ships as far as it fits; the offer screen shows what does not fit, and that cargo is lost. The debt stays until the contract is done. Contract: capture a spawned trader (guaranteed encounter on arrival or Hunt in a sector 1-2 jumps away, security level 2 or lower) and deliver that vessel with its cargo to a known Pirate Haven within 3 jumps; 25 days. Done: the debt is cleared; the pirates take the vessel; the player keeps the cargo sale. Fail: the debt stays; the player keeps the Wasp. | Q-52 | T |
| M8-SC-04 | **Buyback.** After the pirate contract is done, the Pirate Haven offers the original ship (with its modules as they were at the trade-in) for sale at its trade-in value at that time. The offer stays at that Haven. The ship joins the fleet only if the fleet has room (`maxFleetSize`); it does not become the flagship by itself (F on the fleet screen). Paying in debt is not possible (Section 8.6). | Q-52 | T |
| M8-SC-05 | **Starting ship name.** The starting ship of a new career is named "Fresh Start" (data, `start.shipName`; now "Second Chance"). Saved careers keep their names; the player can rename any fleet ship (N on the fleet screen). | Q-52 | I |
| M8-SC-06 | A later stuck state (debt, no cargo, no module to sell) offers Retire on a message screen; it does not force it. | Q-52 | M |

## 2. Art and animation (ART)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M8-ART-01 | **Damage display.** Hull 100%-67%: normal art. 66%-34%: damaged art (`glyphs_damaged`). 33%-1%: critical art (`glyphs_critical`). Colors dim with the `damage_rule` factors (changed cells dimmer). The design art replaces the `%` and `.` rule of §18.3. | §18, §18.3 | M, T |
| M8-ART-02 | **Heat display.** A Hot ship uses the hot tint (`roles.hot_tint`). An Overheated ship flashes with `over` / `overBg` at `heat.flashHz`. | §18.3, §18 | M |
| M8-ART-03 | **Effects.** All effects in §18.4 work: laser, ballistic, flak, missile and torpedo, point defense, shield hit, explosion (`*` → `+` → `.`), reinforcement arrival, map travel (ship glyph moves along the path). | §18.4 | M |
| M8-ART-04 | Total effect time per turn is 1.2 s or less. `Space` skips the current animations. | §18.4 | M |
| M8-ART-05 | Load the remaining Claude Design output (icons, effects) into `/data/art/` when it exists. Check that all glyphs are Code Page 437. Run `sim-combat.ts` again if footprints change. | §4, §18 | S, T |
| M8-ART-06 | **Sector map travel** (owner, 2026-11-04). When the fleet travels in a sector, the player glyph `@` moves cell by cell along the path from the start to the end point (a location, a jump point, or the point of an encounter). The animation plays before the arrival message, the hail screen, or the jump. Total time 1.2 s or less (`animation.mapTravelMaxSeconds` in data); `Space` or any key skips it. The simulation result does not change (it is computed before the animation). Existing colors and glyphs only. | owner | M |
| M8-ART-07 | **Region map route** (owner, 2026-11-04). When a sector is selected, the lanes of the shortest route (by jumps) from the current sector to it, and the sector glyphs on the route, show in the bright color (`ui.highlight`, style color `hi`); the other lanes stay in `map.lane`. The side panel shows the number of jumps. No route (not connected): no highlight. Existing colors and glyphs only; a dedicated route color needs Claude Design (`style.json` is not edited by hand). | owner | M |

## 3. Quality and release (REL)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M8-REL-01 | Fix all known crash bugs. | §19 | M |
| M8-REL-02 | Run all acceptance checks in §6.11, §8.7, §9.13, §10.9, §13.9, §14.9, and §19. Record each result in `PROGRESS.md`. | §23 | S, T |
| M8-REL-03 | Play one career manually as a trader and one as a pirate. Record problems in `PROGRESS.md`. | §23 | M |
| M8-REL-04 | Deploy the final build to GitHub Pages. Check that it runs in a desktop browser. | §19, §23 | M |
| M8-REL-05 | `PROGRESS.md` and `DECISIONS.md` are up to date. | §23 | I |

## 4. Exit checks (Definition of done, §23)

| # | Check | Source | Verify |
|---|---|---|---|
| 1 | A player can start a new career, trade, change the ship loadout, build a fleet, fight, become a pirate or a pirate hunter, change a sector's security, and reach the career end screen. | §23 | M |
| 2 | All acceptance checks in §6.11, §8.7, §9.13, §10.9, §13.9, §14.9, and §19 pass. Economy and balance results are reports, not gates (owner, 2026-11-04): the M3 Light Freighter median day, M6 check 5 (fleet value), Shuttle profit per day, net worth at day 730 (Q-52), and the Supply contract gap (Q-53). `PROGRESS.md` records each one. | §23 | S, T |
| 3 | No known crash bugs. | §19 | M |
| 4 | The game runs in a desktop browser from GitHub Pages. | §23 | M |
| 5 | `PROGRESS.md` and `DECISIONS.md` are up to date. | §23 | I |

## 5. After the MVP

Add items from the Parked list (§21) one at a time, only after the MVP is complete and stable. The first item is NPC trade agents (§9.9), if M2 did not build them.
