// Start and end of a battle (Sections 13.1, 13.4, 13.7). The battle works on
// copies of the ships; at the end, the player's ship gets its new hull, armor,
// engine value, fuel, cargo, and power setting. Heat goes to 0 (Section 11.6).
import type { Ship } from '../core/types';
import type { RngState } from '../core/rng';
import { Rng } from '../core/rng';
import type { GameData } from '../data';
import { aiPower } from './ai';
import { blockedCells, fits, footprint, maskSize } from './geometry';
import { generateCells } from './map';
import { combatStats } from './rules';
import type { AiKind, Battle, CombatShip, Faction, Side, Vec2 } from './types';

export interface BattleShipSpec {
  ship: Ship;
  ai: AiKind;
  /** Default: from the AI (Raider: pirate, Trader: trader, else the side). */
  faction?: Faction;
  /** Loadout power priority (loadouts.json); default: the hull's default loadout. */
  powerPriority?: string[];
}

export interface BattleSpec {
  player: BattleShipSpec[];
  other: BattleShipSpec[];
  aggressor: Side;
  /** The combat RNG state to use (a copy is made). */
  rng: RngState;
}

/**
 * Power priority: the given loadout list, else a general order: engines,
 * shields, the weapons in hardpoint order, thrusters, then other modules.
 */
function priorityFor(spec: BattleShipSpec, data: GameData): string[] {
  if (spec.powerPriority) return spec.powerPriority;
  const ids = [...spec.ship.hardpoints, ...spec.ship.internal].filter((m) => m !== null).map((m) => m.moduleId);
  const rank = (id: string) => {
    const c = data.moduleById.get(id)?.category;
    return c === 'engine' ? 0 : c === 'shield' ? 1 : c === 'laser' || c === 'ballistic' || c === 'guided' || c === 'pointDefense' ? 2 : c === 'thrusters' ? 3 : 4;
  };
  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b));
}

function factionFor(spec: BattleShipSpec, side: Side): Faction {
  if (spec.faction) return spec.faction;
  if (spec.ai === 'raider') return 'pirate';
  if (spec.ai === 'trader') return 'trader';
  return side === 'player' ? 'player' : 'patrol';
}

/** The nearest anchor to `want` where the footprint fits, searched in rings. */
function place(b: Battle, s: CombatShip, want: Vec2): Vec2 {
  const blocked = blockedCells(b, s);
  for (let r = 0; r < Math.max(b.width, b.height); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const at = { x: want.x + dx, y: want.y + dy };
        if (fits(b, s, at, blocked)) return at;
      }
    }
  }
  throw new Error('No room for a ship on the battle map');
}

/**
 * A new battle: the map, the ships on their start sides (player side on the
 * left, the other side on the right, mirrored), full shields, heat 0. AI ships
 * set their power; the player's setting stays if it is valid.
 */
export function createBattle(spec: BattleSpec, data: GameData): Battle {
  const c = data.balance.combat;
  const rngState = [...spec.rng] as RngState;
  const rng = new Rng(rngState);
  const b: Battle = {
    width: c.gridWidth,
    height: c.gridHeight,
    cells: generateCells(data, rng),
    ships: [],
    playerId: 0,
    turn: 0,
    aggressor: spec.aggressor,
    rng: rngState,
    result: null,
    log: [],
    munitions: [],
    nextMunitionId: 0,
  };
  let id = 0;
  const groups: [Side, BattleShipSpec[]][] = [
    ['player', spec.player],
    ['other', spec.other],
  ];
  for (const [side, specs] of groups) {
    const mirrored = side !== 'player';
    const ships = specs.map((sp) => {
      const mask = footprint(data, sp.ship.hullId, mirrored);
      const s: CombatShip = {
        id: id++,
        name: sp.ship.name,
        side,
        ai: sp.ai,
        faction: factionFor(sp, side),
        ship: structuredClone(sp.ship),
        powerPriority: priorityFor(sp, data),
        pos: { x: 0, y: 0 },
        mask,
        mirrored,
        heat: 0,
        shield: 0,
        overheated: false,
        status: 'active',
        moraleRolled: false,
        attacked: false,
        retreating: false,
        moved: 0,
        fired: [],
        shotHeat: 0,
        spent: 0,
        stored: 0,
        unpowered: [],
        pdShots: {},
      };
      return s;
    });
    // Stack the group in the middle of its side, 2 rows apart.
    const heights = ships.map((s) => maskSize(s.mask).h);
    let y = Math.floor((b.height - (heights.reduce((a, h) => a + h, 0) + 2 * (ships.length - 1))) / 2);
    for (const s of ships) {
      const { w, h } = maskSize(s.mask);
      // The start column is the ship's center column.
      const x = side === 'player' ? c.map.startColumn - Math.floor(w / 2) : b.width - 1 - c.map.startColumn - Math.floor(w / 2);
      b.ships.push(s);
      s.pos = place(b, s, { x, y });
      y += h + 2;
    }
  }
  const empty: never[] = [];
  for (const s of b.ships) {
    // AI ships come from outside travel: they have at least a combat fuel reserve.
    if (s.ai !== 'human') s.ship.fuel = Math.max(s.ship.fuel, c.npcFuelReserve);
    const st = combatStats(s, data);
    if (s.ai !== 'human' || st.powerReserve > st.powerSupply) aiPower(b, s, data, rng, empty);
    const ready = combatStats(s, data);
    s.shield = ready.shieldCapacity;
    // Capacitors are charged in travel (Q-41).
    s.stored = ready.capacitorCapacity;
  }
  return b;
}

/** Copies the battle result of the player's ship back to the real ship. */
export function applyToShip(b: Battle, ship: Ship): void {
  const s = b.ships.find((x) => x.id === b.playerId);
  if (!s) return;
  ship.hullHp = s.ship.hullHp;
  ship.armorHp = s.ship.armorHp;
  ship.engineValue = s.ship.engineValue;
  ship.fuel = s.ship.fuel;
  ship.cargo = structuredClone(s.ship.cargo);
  ship.hardpoints = structuredClone(s.ship.hardpoints);
  ship.internal = structuredClone(s.ship.internal);
}
