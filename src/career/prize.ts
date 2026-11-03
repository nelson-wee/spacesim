// Prize ships and boarding (Section 13.7, M6-FCMB-06, M6-FCMB-07,
// M6-FCMB-09). After a win, the player boards each surrendered ship: take it
// as a prize (with its loadout, damage, cargo, and prizeFuelShare of its
// tank), take its cargo, or leave it. A prize from a non-pirate adds
// notoriety. Battleships (capital hulls) cannot be prizes.
import { addShip } from '../actor/fleet';
import type { Battle, CombatShip } from '../combat/types';
import type { Game } from '../core/game';
import type { Actor, Ship } from '../core/types';
import { hullDef } from '../ship/hull';
import { travelStats } from '../ship/stats';
import { addNotoriety } from './notoriety';

/** Surrendered ships of the other side: the ships that the player can board. */
export function surrenderedShips(b: Battle): CombatShip[] {
  return b.ships.filter((s) => s.side === 'other' && s.status === 'surrendered');
}

/** Why the ship cannot be a prize now, or null. */
export function prizeProblem(game: Game, actor: Actor, ship: Ship): string | null {
  const { data } = game;
  if (hullDef(data, ship.hullId).sizeClass === 'capital') return 'A capital ship cannot be a prize.';
  if (actor.fleet.length >= data.balance.fleet.maxFleetSize) return `Your fleet is full (${data.balance.fleet.maxFleetSize} ships). Scuttle a ship first.`;
  return null;
}

/**
 * Takes a surrendered ship into the fleet. `faction` is the ship's faction in
 * the battle (a non-pirate prize adds notoriety). The ship keeps its loadout,
 * damage, and cargo; its tank has prizeFuelShare of its capacity.
 */
export function takePrize(game: Game, actor: Actor, cs: CombatShip): { ok: boolean; text: string; ship?: Ship } {
  const { data } = game;
  const why = prizeProblem(game, actor, cs.ship);
  if (why) return { ok: false, text: why };
  const ship: Ship = structuredClone(cs.ship);
  ship.id = `ship-${game.state.nextId++}`;
  ship.name = cs.name;
  ship.fuel = travelStats(ship, data).fuelCapacity * data.balance.fleet.prizeFuelShare;
  // Its cargo is loot: a purchase price of 0 (M5-LOOT).
  for (const lot of Object.values(ship.cargo)) lot.unitCost = 0;
  const full = addShip(game, actor, ship);
  if (full) return { ok: false, text: full };
  // The ship is now in the fleet: the battle copy has no cargo left to take.
  cs.ship.cargo = {};
  if (cs.faction !== 'pirate') addNotoriety(actor, data.balance.notoriety.prizeNonPirate, data);
  return { ok: true, text: `${ship.name} joins your fleet as a prize.${cs.faction !== 'pirate' ? ' Notoriety rises.' : ''}`, ship };
}
