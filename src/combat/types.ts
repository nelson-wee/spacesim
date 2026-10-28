// Battle state (Section 13). One plain object; the resolver makes a new one
// each turn (G-13). Ship stats are not stored: they come from the ship copy.
import type { Ship } from '../core/types';
import type { RngState } from '../core/rng';

export type Side = 'player' | 'other' | 'neutral';

/** Who decides a ship's orders: the human player, or an AI behavior (Section 13.8, Q-25). */
export type AiKind = 'human' | 'attack' | 'raider' | 'trader';

/** Who a ship belongs to. Pirates disable the player's ship; they do not destroy it (owner, 2026-10-28). */
export type Faction = 'player' | 'pirate' | 'trader' | 'patrol';

export type ShipStatus = 'active' | 'destroyed' | 'fled' | 'surrendered';

export interface Vec2 {
  x: number;
  y: number;
}

export interface SlotRef {
  kind: 'hardpoint' | 'internal';
  index: number;
}

export interface CombatShip {
  id: number;
  name: string;
  side: Side;
  ai: AiKind;
  faction: Faction;
  /** A copy of the ship: modules ON/OFF, hull, armor, engine value, fuel, cargo. */
  ship: Ship;
  /** Module ids in priority order for AI power use (loadouts.json). */
  powerPriority: string[];
  /** Anchor cell (top-left of the footprint). */
  pos: Vec2;
  /** Footprint cells relative to the anchor (from the battle art; mirrored on the right side). */
  mask: Vec2[];
  mirrored: boolean;
  heat: number;
  shield: number;
  /** Overheated: offline until heat falls to overheatRecoverShare of capacity (Q-40). */
  overheated: boolean;
  status: ShipStatus;
  /** Morale roll done (once, Section 13.8). */
  moraleRolled: boolean;
  /** An enemy fired at this ship (Trader AI fires only if attacked). */
  attacked: boolean;
  /** Retreating to the edge (Raider AI below retreatHull). */
  retreating: boolean;
  /** Cells moved this turn, and weapons fired this turn ("kind:index"). */
  moved: number;
  fired: string[];
  /** Heat per shot of the shots this turn (for the heat step). */
  shotHeat: number;
  /** Power as actions (Q-41): reactor power used this turn (moves and shots). */
  spent: number;
  /** Power in the capacitor. */
  stored: number;
  /** Reserving modules ("kind:index") that lost power this turn after an overdraw; back at the end of the turn. */
  unpowered: string[];
}

export type BattleResult = 'win' | 'loss' | 'fled' | 'draw';

export interface Battle {
  width: number;
  height: number;
  /** Rows of cells: '.' open, '#' asteroid, ':' debris cloud. */
  cells: string[];
  ships: CombatShip[];
  /** Id of the human player's flagship (or the player-side ship in sim-combat). */
  playerId: number;
  turn: number;
  /** The side that started the fight (Section 13.4). */
  aggressor: Side;
  rng: RngState;
  result: BattleResult | null;
  log: string[];
}

export type Aim = 'hull' | 'engines';

export type Order =
  | { kind: 'toggle'; slot: SlotRef; on: boolean }
  | { kind: 'move'; to: Vec2 }
  | { kind: 'fire'; slot: SlotRef; target: number; aim: Aim };

/** What happened, for the renderer (effects.json) and the log. */
export type Effect =
  | { kind: 'move'; shipId: number; path: Vec2[] }
  | { kind: 'shot'; shipId: number; moduleId: string; from: Vec2; to: Vec2; targetId: number; hit: boolean }
  | { kind: 'flak'; shipId: number; from: Vec2; center: Vec2 }
  | { kind: 'shield'; shipId: number; amount: number; broken: boolean }
  | { kind: 'hull'; shipId: number; amount: number; at: Vec2 }
  | { kind: 'armor'; shipId: number; at: Vec2 }
  | { kind: 'engine'; shipId: number; amount: number; at: Vec2 }
  | { kind: 'overheat'; shipId: number; amount: number }
  | { kind: 'online'; shipId: number }
  | { kind: 'unpowered'; shipId: number; moduleId: string }
  | { kind: 'destroy'; shipId: number }
  | { kind: 'flee'; shipId: number }
  | { kind: 'surrender'; shipId: number };
