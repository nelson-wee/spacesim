# Combat v2: scope proposals (Q-40)

Status: proposals for the owner. Nothing in this file is built, except the items in Section 1.
Date: 2026-10-28.

## 1. Built (owner request, 2026-10-28)

- **Heat split.** `idleHeatScale` 0.3 (heat per turn of modules ON) and `shotHeatScale` 0.6 (heat per shot). Idle heat is below cooling for all default loadouts. Firing makes most of the heat. The laser Wasp pairing (Section 13.9, 50–70%) sets the limit on shot heat: 0.75 gives 48–52%, 1.0 gives 32%, 0.6 gives 53% (500 battles).
- **Overheat takes the ship offline.** At 100% heat: hull damage = heat above capacity, then the ship is offline. It cannot give orders. Active modules (engines, shields, weapons, thrusters) do not work: move 0, maneuver 0, shields 0. Passive modules (armor, heat sinks, radiators) still work. Only cooling acts. The ship is back online at 70% heat (`overheatRecoverShare`).
- **Aimed shots use tracking.** A shot at the Engines has hit x tracking / (tracking + 25) (`moduleAimTracking`). Pulse laser 0.86, autocannon 0.62, mass driver 0.50, heavy cannon 0.32. When module damage comes, other module targets use the same rule.
- **AI.** No AI fires a shot that would overheat its ship.
- **UI.** The heat bar shows the heat after this turn with the planned shots. A warning shows if the plan overheats the ship. An offline ship shows the turns left.

Heat budget per default loadout (all weapons fire every turn; "sustain" = share of the shot heat that cooling removes):

| Loadout | Idle | Shots | Cooling | Capacity | Hot at turn | Overheat at turn | Sustain |
|---|---|---|---|---|---|---|---|
| Starting Shuttle | 1.5 | 2.4 | 3 | 30 | 24 | 34 | 63% |
| Pirate Raider | 1.5 | 2.4 | 3 | 40 | 32 | 45 | 63% |
| Laser Wasp | 1.5 | 4.8 | 3 | 40 | 9 | 13 | 31% |
| Laser Gunship | 1.8 | 9.6 | 4 | 50 | 5 | 7 | 23% |
| Ballistic Gunship | 1.8 | 6.0 | 4 | 50 | 10 | 14 | 37% |
| Laser Corvette | 3.3 | 12.0 | 8 | 80 | 8 | 11 | 39% |
| Ballistic Corvette | 3.3 | 7.2 | 8 | 80 | 23 | 32 | 65% |
| Laser Frigate | 4.8 | 16.8 | 10 | 120 | 8 | 11 | 31% |
| Torpedo Frigate | 4.8 | 8.4 | 10 | 120 | 27 | 38 | 62% |
| Battleship | 8.1 | 18.6 | 16 | 270 | 18 | 26 | 42% |

Result: ships with one weapon can fire every turn. Laser builds on Gunships and larger ships overheat in 7–11 turns and must choose when to fire. Ballistic builds can fire for the whole battle. This is the family difference in brief Section 12.1 ("Lasers: much heat. Ballistics: low heat"). Heat still has little effect on small ships. A stronger heat effect needs a Wasp loadout with a heat module, or a new Wasp pairing band (M5).

## 2. Heat Dump (module)

**Purpose:** a burst tool. A radiator removes a fixed amount of heat each turn. A heat dump removes a large amount of heat one time, when the player chooses.

| Item | Proposal |
|---|---|
| Slot | Internal, S / M / L |
| Dump | S 12, M 25, L 50 heat (x tier main multiplier: 1, 1.25, 1.5) |
| Charges | 2 per battle (tier 3: 3). Charges refill at the start of each battle, at no cost. |
| Power | 0 (passive). Mass 2 / 4 / 8. Price 1,500 / 3,000 / 6,000. |
| Use | A free order in the player phase. It is the only order that an offline (overheated) ship can give. The heat drops at once; the ship is back online if the heat is at or below 70%. |
| Option | The vented coolant makes a debris cloud on the ship's cells for 1 turn (shots at it get `debrisFactor`). This gives a defensive use too. |
| AI | Use a charge if the ship is offline, or if the planned shots would overheat it and the target is in range. |
| Compare | Radiator S: 2 cooling per turn, 16 heat over 8 turns, always. Heat Dump S: 24 heat in 2 moments that the player selects. |

**Cost:** about 0.5 day (data, order, AI rule, UI key, tests). Claude Design: one module icon and one vent effect.

## 3. Plasma weapons (new family)

**Purpose:** damage that is mostly heat. A plasma ship pushes its target into overheat, so the target goes offline (no engines, no shields). Heat becomes an attack layer, and plasma becomes a capture tool for piracy.

| Item | Plasma Cannon | Plasma Torpedo |
|---|---|---|
| Slot | Hardpoint M | Hardpoint L |
| Type | Projectile, hits in the same turn | Guided munition (Section 12.4 rules) |
| Damage (before `damageScale`) | 6, vs shield x0.5, vs hull x1.0, armor pierce 2 | 20, vs shield x0.7, vs hull x1.0, armor pierce 4 |
| Heat damage (new field `heatDamage`) | 12 | 45 |
| Range / tracking | 9 / 60 | 18 / munition agility 30, speed 3, life 8, HP 10 |
| Power / heat per shot | 3 / 5 | 2 / 3 |
| Ammo | — | 3 |

Rules:
- On a hit, `heatDamage` goes into the target's heat. If the target's shield is up, the target gets half of the heat damage.
- Heat damage can cause an overheat at the next heat step (hull damage and offline, Section 1).
- An offline ship rolls for morale (Section 13.8), as at engine value 0. This makes plasma a capture tool.
- Counters: heat sinks, radiators, heat dumps, shields, point defense and flak (torpedoes only).
- The plasma cannon heats its own ship a lot (5 per shot). A plasma build must manage its own heat.

Open points for the owner:
- The brief "do not cut" list names three weapon families. Plasma is a fourth family. Is it MVP or after MVP?
- Threat units (Section 10.5) need a heat-damage term in `firepower`, for example `heatDamage x heatThreatFactor`. TU calibration (Section 10.9) then needs a new check.

**Cost:** about 1 to 1.5 days with the torpedo (the torpedo needs the M5 munition code first). Claude Design: 2 icons and 4 effects (shot, hit, miss, torpedo).

## 4. Power as an action economy

**Now:** power is a fit check. The sum of the draw of modules that are ON must be at or below supply. In combat, toggles are free, and the AI sets them one time. This gives few decisions each turn.

**Owner idea:** each turn, the reactors give `powerSupply` points. Each action costs the module's draw. The ship can do actions until it has no points.

**Proposal (keeps the current data):**

| Module | Cost each turn |
|---|---|
| Shield generator | Its draw, for each turn that it is ON (upkeep). OFF: no regeneration; the points stay. |
| Thrusters | Their draw, for each turn that they are ON (upkeep). |
| Engines | Their draw, only in a turn when the ship moves. |
| Weapons | Their draw, for each shot. |
| Capacitor (option) | Points that are not used go into a capacitor (new module or a hull value), up to its capacity, for a later burst. |

Decisions this gives each turn: move or stand and fire more; keep shields up or fire one more weapon; save points for a burst.

- **Power and heat do different jobs:** power limits one turn (how much the ship can do now). Heat limits a series of turns (how long it can keep that up). Cogmind uses this pair: energy with storage, and heat.
- **Cost:** about 1 day. The resolver order check and the AI need a points budget (greedy). The combat panel shows "Power left this turn". The fit rule stays. Retune all §13.9 pairings and the TU formula (firepower must count only the weapons that the ship can power each turn).
- **Risk:** two budgets on one panel. The UI must show both in one place: "Power left: 3 / 9. Heat after turn: 64%."

**Recommendation:** yes, this is the best next step for decisions in each turn. It is better than more heat rules, because today toggles are not a real choice. Build it after the skill-gap check (Section 6), so that we can measure the change.

## 5. Velocity and inertia

**Now:** the battle map is a grid. Each turn, a ship moves up to `move` cells (from thrust to weight). It stops at the end of the turn. Maneuver (from agility) lowers the hit chance against it. Ships do not turn: the art faces left or right (mirrored).

| Option | What changes | Cost | Risk |
|---|---|---|---|
| A. Evasion from motion | Hit chance against a ship goes down with the cells it moved this turn. Standing still makes a ship easy to hit. | 0.5 day | Low |
| B. Vector movement (no facing) | Each ship keeps a velocity (cells per turn). Each turn it changes the velocity by up to its acceleration (from thrust to weight), then drifts. A path through an asteroid is a collision (damage, stop). The screen shows the next position. Hit chance uses the speed across the line of fire with maneuver. Fuel is used for thrust. | 1.5–2 days | Medium: AI must plan with momentum (2–3 turns of search over about 25 thrust choices); all pairings change |
| C. Facing and arcs | Ships turn to 8 directions; shields and armor have front and rear arcs; munitions and flank attacks hit weaker arcs. | 3+ days | High: needs art for 8 directions for each hull (Claude Design); large UI and AI changes |

With option B:
- A Raider (high acceleration) can change course each turn. A laden freighter (low acceleration) is predictable and easy to intercept.
- A fighter against a frigate: the fighter stays at high speed across the frigate's line of fire, so the heavy guns cannot track it.
- Guided munitions have their own speed and turn rate. A fast ship can outrun a torpedo, and a slow ship cannot.
- Munitions "from a different vector than the ship's bearing" matter only with arcs (option C) or with point defense arcs. Without arcs, the difference is the munition's own path and speed.

**Recommendation:** option A now if you want a quick "speed is defense" effect. Option B is possible on the current grid, but it changes the M5 AI (Evader, pursuit, flee), so decide before M5 builds those. Option C after the MVP, with art.

## 6. Order of work (proposal)

1. Skill-gap check in `sim-combat`: a "fire all, move closer" policy against a "hold fire until range, burst to break shields, cool down, aim at engines" policy, with equal ships. The second policy must win at least 15 points more.
2. Heat Dump (Section 2).
3. Power as an action economy (Section 4), then the skill-gap check again.
4. Decide on inertia (Section 5) before the M5 AI.
5. Plasma (Section 3) when guided munitions exist (M5), or after the MVP.
