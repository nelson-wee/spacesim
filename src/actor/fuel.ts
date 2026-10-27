// Fuel use, fuel price, tow, and recovery fee (Sections 8.2 to 8.6).
// Fuel uses mass ^ fuelMassExponent (Q-01).
import type { Game } from '../core/game';
import type { Actor, Location, Ship, Vec } from '../core/types';
import { type GameData, hydrogenBasePrice } from '../data';
import { basePrice, buyPrice, sellPrice } from '../econ/prices';
import type { ShipStats } from '../ship/stats';
import { fleetUnits, removeCargo } from './cargo';
import { observe } from './knowledge';
import { travelStats } from '../ship/stats';
import { mapDistance } from '../world/geometry';

/** Fuel left below this value counts as 0. */
const EMPTY = 1e-6;

export function massFactor(mass: number, data: GameData): number {
  return mass ** data.balance.travel.fuelMassExponent;
}

export function sectorTripFuel(distance: number, stats: ShipStats, data: GameData): number {
  return distance * massFactor(stats.mass, data) * data.balance.travel.kSector * stats.engineFuelRate;
}

export function jumpFuel(laneLength: number, stats: ShipStats, data: GameData): number {
  return laneLength * massFactor(stats.mass, data) * data.balance.travel.kJump * stats.engineFuelRate;
}

export function dockFuel(gravity: number, stats: ShipStats, data: GameData): number {
  return gravity * massFactor(stats.mass, data) * data.balance.travel.kDock;
}

/**
 * Price of one fuel unit at a location: the local Hydrogen buy price /
 * `fuelPerHydrogen` (Q-02). With no location, or no Hydrogen market, the
 * Hydrogen base price.
 */
export function fuelUnitPrice(data: GameData, location?: Location): number {
  const entry = location?.market.hydrogen;
  const hydrogen = entry ? buyPrice(entry, hydrogenBasePrice(data), data) : hydrogenBasePrice(data);
  return hydrogen / data.balance.fuel.fuelPerHydrogen;
}

export function fullTankPrice(ship: Ship, data: GameData, location?: Location): number {
  return travelStats(ship, data).fuelCapacity * fuelUnitPrice(data, location);
}

/** Recovery fee for one ship (Section 8.6). */
export function recoveryFee(ship: Ship, distance: number, data: GameData, location?: Location): number {
  const r = data.balance.recovery;
  return r.base + r.perDistance * distance + r.fullTankShare * fullTankPrice(ship, data, location);
}

export function isEmpty(ship: Ship): boolean {
  return ship.fuel <= EMPTY;
}

/** Nearest location in a sector to a point, by travel distance (Q-12). */
export function nearestLocation(game: Game, sectorId: number, point: Vec): { location: Location; distance: number } {
  const { world } = game.state;
  const aspect = game.data.balance.world.cellAspect;
  const sector = world.sectors[sectorId];
  if (!sector) throw new Error(`Unknown sector ${sectorId}`);
  let best: Location | null = null;
  let bestDist = Infinity;
  for (const id of sector.locationIds) {
    const loc = world.locations[id] as Location;
    const d = mapDistance(point, loc.pos, aspect);
    if (d < bestDist) {
      best = loc;
      bestDist = d;
    }
  }
  if (!best) throw new Error(`Sector ${sector.name} has no locations`);
  return { location: best, distance: bestDist };
}

/**
 * Pays a fee. If the credits are not sufficient, the location buys cargo at
 * its local sell price, unit by unit (M3-SVC-15). It buys only the goods that
 * it trades. If that is not sufficient, the credits go below 0 (Section 8.6).
 */
export function payFeeWithCargo(game: Game, actor: Actor, fee: number, location: Location): { soldValue: number } {
  const { data } = game;
  let soldValue = 0;
  if (actor.credits >= fee) {
    actor.credits -= fee;
    return { soldValue };
  }
  let shortfall = fee - Math.max(0, actor.credits);
  const commodities = new Set(actor.fleet.flatMap((ship) => Object.keys(ship.cargo)));
  for (const commodity of commodities) {
    const entry = location.market[commodity];
    if (shortfall <= 0 || !entry) continue;
    const base = basePrice(data, commodity);
    // Sell whole units until the fee is paid, or all units if that is not sufficient.
    const held = fleetUnits(actor, commodity);
    let units = 0;
    let value = 0;
    while (units < held - 1e-9 && value < shortfall) {
      const step = Math.min(1, held - units);
      value += step * sellPrice({ ...entry, stock: entry.stock + units }, base, data);
      units += step;
    }
    removeCargo(actor, commodity, units);
    entry.stock += units;
    soldValue += value;
    shortfall -= value;
  }
  actor.credits = actor.credits + soldValue - fee;
  return { soldValue };
}

export interface TowResult {
  location: Location;
  distance: number;
  fee: number;
  towedShips: number;
  soldValue: number;
}

/**
 * Tows the full fleet to the nearest location (Section 8.6, Q-12). The fee is
 * paid for each ship with 0 fuel. Those ships then get a share of a full tank.
 * The tow takes no time. `extraDistance` adds distance before `fromPoint`
 * (for example, the rest of a lane).
 */
export function towFleet(game: Game, actor: Actor, sectorId: number, fromPoint: Vec, extraDistance = 0): TowResult {
  const { data } = game;
  const { location, distance: nearDistance } = nearestLocation(game, sectorId, fromPoint);
  const distance = nearDistance + extraDistance;
  let fee = 0;
  let towedShips = 0;
  for (const ship of actor.fleet) {
    if (!isEmpty(ship)) continue;
    fee += recoveryFee(ship, distance, data, location);
    ship.fuel = travelStats(ship, data).fuelCapacity * data.balance.recovery.fuelShareAfterTow;
    towedShips++;
  }
  const { soldValue } = payFeeWithCargo(game, actor, fee, location);
  actor.position = { kind: 'docked', locationId: location.id };
  observe(game, actor);
  game.bus.message(
    `Out of fuel. A tug tows your fleet to ${location.name}. Recovery fee: ${Math.round(fee)} cr.`,
    'danger',
  );
  if (soldValue > 0) game.bus.message(`${location.name} buys cargo for ${Math.round(soldValue)} cr to pay the fee.`, 'warning');
  if (actor.credits < 0) game.bus.message(`You are in debt: ${Math.round(actor.credits)} cr.`, 'danger');
  game.bus.emit({ type: 'towed', actorId: actor.id, locationId: location.id, fee });
  return { location, distance, fee, towedShips, soldValue };
}

