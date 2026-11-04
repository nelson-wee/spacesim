# M8 (Day 8): Polish and release

**Goal:** The game is complete, readable, and stable. All acceptance checks pass. The final build is on GitHub Pages.

**Brief sections:** §17.1 (9), §17.5 (help), §18.3, §18.4, §23.

**Depends on:** M1–M7.

**Rule:** No new features after M6 (feature freeze). This milestone adds only the items below and bug fixes. Owner exception (2026-11-03): the second chance (Section 5, Q-52).

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
| M8-SC-02 | **Guild relief.** At once: free full repair and refuel of all ships; the debt stays. Contract: deliver 10 t of a raw commodity (supplied free at the tow location) to a location 0-1 jumps away that needs it; Supply deadline rule. Done: the debt is cleared (credits = 0 if below 0); standing +1. Fail: the debt stays; standing -2. Not counted in the 4-contract limit. | Q-52 | T |
| M8-SC-03 | **Pirate offer.** The flagship (with its modules) is traded for a raiding Wasp (`raider_wasp` loadout with a fuel tank, full fuel); other fleet ships stay. The debt stays until the contract is done. Contract: capture a spawned trader (guaranteed encounter on arrival or Hunt in a sector 1-2 jumps away, security level 2 or lower) and deliver that vessel with its cargo to a known Pirate Haven within 3 jumps; 25 days. Done: the debt is cleared; the pirates take the vessel; the player keeps the cargo sale. Fail: the debt stays; the player keeps the Wasp. | Q-52 | T |
| M8-SC-04 | **Buyback.** After the pirate contract is done, the Pirate Haven offers the original ship (with its modules) for sale at its trade-in value. The offer stays at that Haven. | Q-52 | T |
| M8-SC-05 | **Starting ship name.** The starting ship is named "Fresh Start" (data, `start.shipName`). | Q-52 | I |
| M8-SC-06 | A later stuck state (debt, no cargo, no module to sell) offers Retire on a message screen; it does not force it. | Q-52 | M |

## 2. Art and animation (ART)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M8-ART-01 | **Damage display.** Hull 100%-67%: normal art. 66%-34%: damaged art (`glyphs_damaged`). 33%-1%: critical art (`glyphs_critical`). Colors dim with the `damage_rule` factors (changed cells dimmer). The design art replaces the `%` and `.` rule of §18.3. | §18, §18.3 | M, T |
| M8-ART-02 | **Heat display.** A Hot ship uses the hot tint (`roles.hot_tint`). An Overheated ship flashes with `over` / `overBg` at `heat.flashHz`. | §18.3, §18 | M |
| M8-ART-03 | **Effects.** All effects in §18.4 work: laser, ballistic, flak, missile and torpedo, point defense, shield hit, explosion (`*` → `+` → `.`), reinforcement arrival, map travel (ship glyph moves along the path). | §18.4 | M |
| M8-ART-04 | Total effect time per turn is 1.2 s or less. `Space` skips the current animations. | §18.4 | M |
| M8-ART-05 | Load the remaining Claude Design output (icons, effects) into `/data/art/` when it exists. Check that all glyphs are Code Page 437. Run `sim-combat.ts` again if footprints change. | §4, §18 | S, T |

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
| 2 | All acceptance checks in §6.11, §8.7, §9.13, §10.9, §13.9, §14.9, and §19 pass. | §23 | S, T |
| 3 | No known crash bugs. | §19 | M |
| 4 | The game runs in a desktop browser from GitHub Pages. | §23 | M |
| 5 | `PROGRESS.md` and `DECISIONS.md` are up to date. | §23 | I |

## 5. After the MVP

Add items from the Parked list (§21) one at a time, only after the MVP is complete and stable. The first item is NPC trade agents (§9.9), if M2 did not build them.
