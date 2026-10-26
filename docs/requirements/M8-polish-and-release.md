# M8 (Day 8): Polish and release

**Goal:** The game is complete, readable, and stable. All acceptance checks pass. The final build is on GitHub Pages.

**Brief sections:** §17.1 (9), §17.5 (help), §18.3, §18.4, §23.

**Depends on:** M1–M7.

**Rule:** No new features after M6 (feature freeze). This milestone adds only the items below and bug fixes.

---

## 1. Screens (UI)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M8-UI-01 | **Codex.** The production chain diagram, and for each commodity: tier, sources (producers), and buyers (producers and populations). The content comes from `recipes.json` and `population.json`, not from fixed text. | §17.1 | M |
| M8-UI-02 | **Help.** `?` shows help for each screen. The title screen Help explains the core loop and the keys. | §17.1, §17.5 | M |
| M8-UI-03 | All actions have a key, and the keys show on screen. | §17.5 | M |

## 2. Art and animation (ART)

| ID | Requirement | Source | Verify |
|---|---|---|---|
| M8-ART-05 | If the final art from the visual brief exists, load it into `/data/art/` (ships, effects, icons, palette). Check that all glyphs are Code Page 437. Run `sim-combat.ts` again, because footprints can change. | §4, §18 | S, T |
| M8-ART-01 | **Damage display.** Hull 100%–67%: normal glyphs. 66%–34%: 30% of footprint cells change to `%`. 33%–1%: 60% of cells change to `%` or `.`, and colors become darker. Select damaged cells with the seeded RNG so they do not change each frame. | §18.3 | M, T |
| M8-ART-02 | **Heat display.** A Hot ship has an orange tint. An Overheated ship flashes red. | §18.3 | M |
| M8-ART-03 | **Effects.** All effects in §18.4 work: laser, ballistic, flak, missile and torpedo, point defense, shield hit, explosion (`*` → `+` → `.`), reinforcement arrival, map travel (ship glyph moves along the path). | §18.4 | M |
| M8-ART-04 | Total effect time per turn is 1.2 s or less. `Space` skips the current animations. | §18.4 | M |

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
