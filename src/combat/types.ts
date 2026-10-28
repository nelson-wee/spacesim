// Battle state (Section 13). One plain object; the resolver makes a new one
// each turn (G-13). Ship stats are not stored: they come from the ship copy.
import type { CargoLot, Ship } from '../core/types';
import type { SlotSize, Tier } from '../data';
import type { RngState } from '../core/rng';

export type Side = 'player' | 'other' | 'neutral';

/** Who decides a ship's orders: the human player, or an AI behavior (Section 13.8, Q-25). */
export type AiKind = 'human' | 'attack' | 'raider' | 'trader' | 'patrol' | 'evader';

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
  /** Patrol AI escort: the id of the trader it guards (stays within 6 cells, Section 13.8). */
  escortOf: number | null;
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
  /** Point defense shots used this turn, by slot key (M5-GUIDE-06). */
  pdShots: Record<string, number>;
}

export type BattleResult = 'win' | 'loss' | 'fled' | 'draw';

/** A guided munition on the grid (Section 12.4). */
export interface Munition {
  id: number;
  /** The launching ship and its side. */
  ownerId: number;
  side: Side;
  targetId: number;
  moduleId: string;
  size: SlotSize;
  tier: Tier;
  pos: Vec2;
  life: number;
  hp: number;
  /** Launched this turn: it does not move until the next munition step (it does not hit in the same turn). */
  fresh: boolean;
}

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
  munitions: Munition[];
  nextMunitionId: number;
  /** Cargo pods of destroyed ships (Section 13.7). */
  pods: CargoPod[];
  /** The sector of the battle, for reinforcements (null in test battles with no sector). */
  sectorId: number | null;
  /** Its security value and development at the battle start (reinforcement budgets, Section 13.5). */
  sector: { securityValue: number; development: 'core' | 'middle' | 'frontier' } | null;
  /** Reinforcement groups that arrived (one of each type, Section 13.5). */
  reinforced: { patrol: boolean; pirate: boolean };
}

/** A cargo pod ($): a ship collects it when it moves onto it (Section 13.7). */
export interface CargoPod {
  pos: Vec2;
  cargo: Record<string, CargoLot>;
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
  | { kind: 'launch'; shipId: number; moduleId: string; munitionId: number; at: Vec2 }
  | { kind: 'munitionMove'; munitionId: number; moduleId: string; path: Vec2[] }
  | { kind: 'munitionHit'; munitionId: number; moduleId: string; targetId: number; at: Vec2; hit: boolean }
  | { kind: 'pd'; shipId: number; munitionId: number; from: Vec2; to: Vec2; hit: boolean }
  | { kind: 'munitionDown'; munitionId: number; at: Vec2 }
  | { kind: 'munitionLost'; munitionId: number; at: Vec2 }
  | { kind: 'pod'; shipId: number; at: Vec2 }
  | { kind: 'reinforce'; side: Side; faction: Faction; shipIds: number[] }
  | { kind: 'collect'; shipId: number; units: number }
  | { kind: 'destroy'; shipId: number }
  | { kind: 'flee'; shipId: number }
  | { kind: 'surrender'; shipId: number };
