// Fleet cargo (Sections 9.1, 11.9). The Market and the Trade Ledger use the free
// capacity of the whole fleet. Bought cargo goes to the ships in this order:
// the flagship last; the ship with the most thrust first (heavy goods first to it).
import type { Actor, Ship } from '../core/types';
import type { GameData } from '../data';
import { travelStats } from '../ship/stats';

const EPS = 1e-9;

export function commodityMass(data: GameData, commodity: string): number {
  const c = data.commodityById.get(commodity);
  if (!c) throw new Error(`Unknown commodity ${commodity}`);
  return c.massPerUnit;
}

/** Free cargo tonnes of one ship. */
export function freeTonnes(ship: Ship, data: GameData): number {
  const s = travelStats(ship, data);
  return Math.max(0, s.cargoCapacity - s.cargoMass);
}

export function fleetFreeTonnes(actor: Actor, data: GameData): number {
  return actor.fleet.reduce((sum, ship) => sum + freeTonnes(ship, data), 0);
}

export function fleetCargoCapacity(actor: Actor, data: GameData): number {
  return actor.fleet.reduce((sum, ship) => sum + travelStats(ship, data).cargoCapacity, 0);
}

/** Units of a commodity in the fleet. */
export function fleetUnits(actor: Actor, commodity: string): number {
  return actor.fleet.reduce((sum, ship) => sum + (ship.cargo[commodity]?.units ?? 0), 0);
}

/** Average purchase price per unit of a commodity in the fleet. */
export function fleetUnitCost(actor: Actor, commodity: string): number {
  let units = 0;
  let cost = 0;
  for (const ship of actor.fleet) {
    const lot = ship.cargo[commodity];
    if (!lot) continue;
    units += lot.units;
    cost += lot.units * lot.unitCost;
  }
  return units > 0 ? cost / units : 0;
}

/** Ships in loading order: the ship with the most thrust first, the flagship last (Section 11.9). */
export function loadingOrder(actor: Actor, data: GameData): Ship[] {
  const flag = actor.fleet[actor.flagshipIndex];
  const others = actor.fleet.filter((s) => s !== flag).sort((a, b) => travelStats(b, data).thrust - travelStats(a, data).thrust);
  return flag ? [...others, flag] : others;
}

/** Puts units into the fleet in loading order. Returns the units that did not fit. */
export function addCargo(actor: Actor, data: GameData, commodity: string, units: number, unitCost: number): number {
  const mass = commodityMass(data, commodity);
  let left = units;
  for (const ship of loadingOrder(actor, data)) {
    if (left <= EPS) break;
    const fit = mass > 0 ? Math.min(left, freeTonnes(ship, data) / mass) : left;
    if (fit <= EPS) continue;
    const lot = ship.cargo[commodity] ?? { units: 0, unitCost: 0 };
    lot.unitCost = (lot.units * lot.unitCost + fit * unitCost) / (lot.units + fit);
    lot.units += fit;
    ship.cargo[commodity] = lot;
    left -= fit;
  }
  return Math.max(0, left);
}

/** Takes units out of the fleet: the flagship first, so it is free for combat. Returns the units taken. */
export function removeCargo(actor: Actor, commodity: string, units: number): number {
  let left = units;
  const flag = actor.fleet[actor.flagshipIndex];
  const order = flag ? [flag, ...actor.fleet.filter((s) => s !== flag)] : actor.fleet;
  for (const ship of order) {
    const lot = ship.cargo[commodity];
    if (!lot || left <= EPS) continue;
    const take = Math.min(lot.units, left);
    lot.units -= take;
    left -= take;
    if (lot.units <= EPS) delete ship.cargo[commodity];
  }
  return units - Math.max(0, left);
}

/** Daily loss of perishable cargo (Section 9.1: Food loses 1% of its quantity a day in cargo). */
export function decayCargo(actor: Actor, data: GameData): void {
  for (const ship of actor.fleet) {
    for (const [commodity, lot] of Object.entries(ship.cargo)) {
      const loss = data.commodityById.get(commodity)?.perishablePerDay ?? 0;
      if (loss > 0) lot.units *= 1 - loss;
    }
  }
}
