// Fleet helpers. All travel code works on each ship in the fleet (Section 4.2).
import type { Actor, Ship } from '../core/types';
import type { GameData } from '../data';
import { type ShipStats, travelStats } from '../ship/stats';

export function flagship(actor: Actor): Ship {
  const ship = actor.fleet[actor.flagshipIndex];
  if (!ship) throw new Error(`Actor ${actor.id} has no flagship`);
  return ship;
}

export function fleetTravelStats(actor: Actor, data: GameData): ShipStats[] {
  return actor.fleet.map((ship) => travelStats(ship, data));
}

/** The lowest `move` in the fleet. The slowest ship sets the travel time (Section 8.2). */
export function fleetMove(stats: ShipStats[]): number {
  return stats.reduce((min, s) => Math.min(min, s.move), Infinity);
}
