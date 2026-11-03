// Fleet helpers (Section 11.9). All travel code works on each ship in the fleet
// (Section 4.2). Upkeep: each ship that is not the flagship costs
// upkeepPerShip x size points of its hull size class per day, paid at each
// dock for the days since the last dock (and at Wait). The flagship can
// change at any docked location.
import type { Game } from '../core/game';
import type { Actor, Ship } from '../core/types';
import type { GameData } from '../data';
import { hullDef } from '../ship/hull';
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

/** Size points of a ship's hull size class (Section 11.9). */
export function sizePoints(ship: Ship, data: GameData): number {
  return data.balance.fleet.sizePoints[hullDef(data, ship.hullId).sizeClass];
}

/** Upkeep per day of the fleet: all ships except the flagship. */
export function upkeepPerDay(actor: Actor, data: GameData): number {
  return actor.fleet.reduce((sum, ship, i) => (i === actor.flagshipIndex ? sum : sum + data.balance.fleet.upkeepPerShip * sizePoints(ship, data)), 0);
}

/**
 * Counts the upkeep of the fleet as it is now, up to today. Call it before
 * each change to the fleet or the flagship, so that each ship pays only for
 * its own days.
 */
export function accrueUpkeep(game: Game, actor: Actor): void {
  const days = Math.max(0, game.state.day - actor.upkeepDay);
  actor.upkeepDay = game.state.day;
  actor.upkeepOwed += upkeepPerDay(actor, game.data) * days;
}

/**
 * Pays the upkeep owed (Section 11.9: at each dock, and at Wait). The credits
 * can go below 0: then the debt rules apply (Section 8.6). Returns the amount.
 */
export function payUpkeep(game: Game, actor: Actor): number {
  const from = actor.upkeepDay;
  accrueUpkeep(game, actor);
  const cost = actor.upkeepOwed;
  actor.upkeepOwed = 0;
  if (cost <= 1e-9) return 0;
  actor.credits -= cost;
  if (actor === game.state.player) {
    const days = game.state.day - from;
    game.bus.message(`Fleet upkeep: ${Math.round(cost)} cr (${days.toFixed(1)} days).`, actor.credits < 0 ? 'danger' : 'info');
  }
  return cost;
}

/** Makes another ship the flagship (Section 11.9: at any docked location). */
export function setFlagship(game: Game, actor: Actor, index: number): string | null {
  if (actor.position.kind !== 'docked') return 'You can change the flagship only at a location.';
  if (!actor.fleet[index]) return 'There is no such ship.';
  accrueUpkeep(game, actor);
  actor.flagshipIndex = index;
  return null;
}

/**
 * Removes a ship from the fleet (a sale, a scuttle, or a loss). If it was the
 * flagship, the next ship in the list becomes the flagship (Section 11.9).
 */
export function removeShip(game: Game, actor: Actor, index: number): Ship | null {
  if (actor.fleet.length <= 1 || !actor.fleet[index]) return null;
  accrueUpkeep(game, actor);
  const [ship] = actor.fleet.splice(index, 1);
  if (index < actor.flagshipIndex) actor.flagshipIndex--;
  else if (index === actor.flagshipIndex) actor.flagshipIndex = Math.min(index, actor.fleet.length - 1);
  return ship ?? null;
}

/** Adds a ship to the end of the fleet list (a bought hull or a prize). Checks the fleet size. */
export function addShip(game: Game, actor: Actor, ship: Ship): string | null {
  const max = game.data.balance.fleet.maxFleetSize;
  if (actor.fleet.length >= max) return `Your fleet is full (${max} ships).`;
  accrueUpkeep(game, actor);
  actor.fleet.push(ship);
  return null;
}

/** A name for a new ship: the hull name and a number that the fleet does not use yet. */
export function newShipName(actor: Actor, hullName: string): string {
  for (let n = 2; ; n++) {
    const name = `${hullName} ${n}`;
    if (!actor.fleet.some((s) => s.name === name)) return name;
  }
}
