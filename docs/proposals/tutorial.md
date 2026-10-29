# Tutorial: scope proposal (Q-48)

Status: built (owner, 2026-10-29), before M6, with the defaults of Section 4 (b) and (c). Do a text pass in M8 for the M6 and M7 screens. The decisions are in `DECISIONS.md`.

## 1. Goal

A minimal tutorial for a new player:

1. A short introduction to the screen (status bar, map, panel, keys, help).
2. Help for the first trade: what to buy, where to sell, and how to go there.
3. Help for the first encounter and the first battle, when they occur.

A setting on the title screen turns the tutorial ON or OFF. The tutorial does not change the rules or the simulation.

## 2. Design

### 2.1 Tips

A **tip** is a small box (an overlay, like the hail screen) with a title, 3 to 8 lines of text, and keys:

- **Enter:** close the tip.
- **X:** turn off the tutorial (the same as the setting).

Each tip shows one time for each game. The game shows a tip when its trigger occurs. If two triggers occur at the same time, the tips show one after the other.

### 2.2 Tip list

| # | Trigger | Content |
|---|---|---|
| 1 | New game: the sector map opens | Welcome. Your goal: trade, build a fleet, and fight or hunt pirates. The status bar shows day, credits, fuel, and cargo. The map shows locations (keys a-f) and jump points (keys 1-4). `?` shows help on each screen. `X` turns off the tutorial. |
| 2 | After tip 1 | **First trade plan.** The game takes the best route from the Trade Ledger (`bestRoutes`, from the start location, 3 jumps or fewer). Example: "Buy Food here at 32. Sell it at Kestrel Station (KS-2) for about 48. Profit: about 1,600 for a full hold." If no route has a profit, the tip shows how to use the Trade Ledger (T). |
| 3 | First time the location screen opens | The tabs: one tab for each service. The Market tab buys and sells. Refuel (R) before a long trip. |
| 4 | First time the Market tab opens | Keys to buy and sell. The price colors. The Trade Ledger (T) shows the best routes. |
| 5 | First purchase | Go to the sell location: select it on the sector map and press Enter. For another sector: M (region map), select the sector, Enter. Travel uses time and fuel. |
| 6 | First time the region map opens | Security level (0-4), the trend arrow, and the threat band (1-5). Low security means more pirates. Pirates disable your ship and take the cargo. Clone Insurance (at each location) gives your ship back if other enemies destroy it. |
| 7 | First sale with a profit | Good work. The next steps: trade more, buy modules at the Outfitter, buy a bigger hull at the Shipyard, and buy insurance. |
| 8 | First hail | The options: Fight, Flee, Pay, Pursue, Ignore, Attack. The threat band of the group compared with your ship. R (auto-resolve) plays the battle for you. |
| 9 | First battle | The power line, a move (arrows and Enter), a target (Tab), fire (F), end of turn (E). Flee: move to a map edge. T, Shift+T, and R let the AI play for you. |
| 10 | First defeat (disabled or destroyed) | What happened: tow, cargo loss, insurance. How to avoid it: flee, pay, or insurance. |

### 2.3 Goal line

While the first trade is not done, the sector map panel shows one goal line:

- "Goal: buy Food at Marrow Depot (MD-1)."
- "Goal: sell Food at Kestrel Station (KS-2)."
- "Goal: done. You made 1,540 credits."

The goal line uses the route from tip 2. If the player buys another commodity, the goal changes to "sell <commodity> at a location that buys it (Trade Ledger: T)".

### 2.4 Setting

- **Title screen:** a new item **S Settings**. The settings screen has one line: "Tutorial: ON / OFF" (Enter or click toggles it). Later settings (effect speed, auto-battle limits) can go on the same screen.
- **Storage:** the setting is a viewer setting, not a game state. It is in `localStorage` (key `spacesim.settings`). Each read and write has a try/catch. With no storage, the default is ON.
- **In a game:** a new game copies the setting into `GameState.tutorial = { on, seen: string[] }`. X on a tip sets `on = false`. The M7 save keeps the progress, so a loaded game does not show the same tips again.

### 2.5 Data and code

| Area | Change | Size |
|---|---|---|
| `data/tutorial.json` (new) | The tips: `id`, `trigger`, `title`, `lines`. The text has fields such as `{commodity}`, `{buyAt}`, `{sellAt}`, `{profit}`. Write the text in STE. | S |
| `src/data/schemas.ts` | Zod schema for the tips. | S |
| `src/core/types.ts` | `GameState.tutorial` (plain data; the M7 save keeps it). | S |
| `src/core/eventBus.ts` | New events: `traded` (buy and sell, with the profit), `encounter`, `battleEnd`. The tutorial listens to the bus and to screen changes. | S |
| `src/ui/tutorial.ts` (new) | Trigger checks, the tip queue, the text fields, the goal line. UI code only: no change to the simulation. | M |
| `src/ui/screens/tip.ts` (new) | The tip overlay. | S |
| `src/ui/screens/settings.ts` (new), `title.ts` | The settings screen and the S key. | S |
| `src/ui/screens/sectorMap.ts` | The goal line. | S |
| Tests | Each tip shows one time; OFF shows no tips; the first-trade text uses the best route; the setting survives a page load; **the same seed and the same actions give the same `GameState` with the tutorial ON and OFF** (except `tutorial`). | S |

Estimate: about 1 day (framework and setting 0.4, tips and the first-trade help 0.4, tests and browser check 0.2).

## 3. Dependencies

| Item | Effect on the tutorial | Action |
|---|---|---|
| Feature freeze at the end of M6 (§0.10, M8 rule) | The tutorial is a new feature. After M6, only M7 and M8 items and bug fixes are allowed. | Build the tutorial in M6 (or before), or the owner makes an exception for M8. |
| M6 changes the Market (fleet capacity), the Fleet screen, and the Trade Ledger (fleet values) | Tips 3, 4, and 5 describe these screens. | Build the framework now or in M6. Do a text pass in M8 (a text change is not a new feature). |
| M7 save and load | The save must keep `GameState.tutorial`. | Add the field now; M7-SAVE-05 (deep-equal) covers it. |
| M7 contracts, M8 Codex and help (M8-UI-02) | Tip 7 can name contracts and the Codex. | Text pass in M8. |
| The first encounter is random (§10.4) | Tips 8-10 show only when an encounter occurs. A new player can meet strong pirates before the first sale. | Optional, see Q-48 (b). |

## 4. Options for the owner (Q-48)

- **(a) Placement.** Proposed: build the framework, the setting, and the 10 tips as the last item of M6 (before the freeze). Do a text pass in M8.
- **(b) A safe start.** Optional: while the tutorial is ON, no hostile encounter occurs before the first sale. This changes the simulation (the encounter roll), so the same seed gives a different game with the tutorial ON and OFF. Proposed: no safe start. The tips explain Flee and Pay, and the player starts in a Core sector (high security, few pirates).
- **(c) Default.** Proposed: the tutorial is ON for the first game in a browser.
