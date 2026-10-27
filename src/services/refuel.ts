// Refuel (Sections 7.4, 9.1, Q-02). One Hydrogen unit gives `fuelPerHydrogen`
// fuel units. Fuel price = local Hydrogen buy price / fuelPerHydrogen, unit by
// unit. Refuel fills all fleet ships and removes the Hydrogen it uses from the
// local stock.
import { fuelUnitPrice } from '../actor/fuel';
import type { Game } from '../core/game';
import type { Actor, Location, MarketEntry } from '../core/types';
import type { GameData } from '../data';
import { basePrice, priceAt, quoteBuy } from '../econ/prices';
import { travelStats } from '../ship/stats';
import { done, refused, type ServiceResult, serviceProblem } from './common';

const HYDROGEN = 'hydrogen';

export interface RefuelQuote {
  /** Fuel to fill all tanks. */
  units: number;
  /** Price of the first fuel unit. */
  unitPrice: number;
  /** Cost to fill all tanks, unit by unit. */
  cost: number;
  /** Fuel that the actor can buy now (credits and Hydrogen stock). */
  affordable: number;
}

function roomInTanks(actor: Actor, data: GameData): number {
  return actor.fleet.reduce((sum, ship) => sum + Math.max(0, travelStats(ship, data).fuelCapacity - ship.fuel), 0);
}

/** Most fuel that `credits` buys from the Hydrogen entry, up to `maxFuel`. */
function affordableFuel(entry: MarketEntry, credits: number, maxFuel: number, data: GameData): number {
  const fph = data.balance.fuel.fuelPerHydrogen;
  const base = basePrice(data, HYDROGEN);
  const mult = 1 + data.balance.economy.spread / 2;
  const maxH = Math.min(maxFuel / fph, Math.max(0, entry.stock));
  let h = 0;
  let left = Math.max(0, credits);
  while (h < maxH - 1e-9) {
    const price = priceAt(base, entry.target, entry.stock - Math.floor(h), data) * mult;
    const step = Math.min(1 - (h % 1), maxH - h);
    if (step * price > left) {
      h += left / price;
      break;
    }
    left -= step * price;
    h += step;
  }
  return h * fph;
}

export function quoteRefuel(game: Game, actor: Actor, location: Location): RefuelQuote {
  const { data } = game;
  const units = roomInTanks(actor, data);
  const unitPrice = fuelUnitPrice(data, location);
  const entry = location.market[HYDROGEN];
  if (!entry) return { units, unitPrice, cost: 0, affordable: 0 };
  const fph = data.balance.fuel.fuelPerHydrogen;
  const cost = quoteBuy(entry, basePrice(data, HYDROGEN), units / fph, data).total;
  return { units, unitPrice, cost, affordable: affordableFuel(entry, actor.credits, units, data) };
}

export interface RefuelResult extends ServiceResult {
  fuel: number;
  cost: number;
}

/** Fills all fleet ships, as far as the credits and the Hydrogen stock allow. */
export function refuel(game: Game, actor: Actor, location: Location): RefuelResult {
  const { data } = game;
  const problem = serviceProblem(actor, location, 'refuel', data);
  if (problem) return { ...refused(problem), fuel: 0, cost: 0 };
  const entry = location.market[HYDROGEN];
  if (!entry) return { ...refused(`${location.name} has no Hydrogen.`), fuel: 0, cost: 0 };
  const quote = quoteRefuel(game, actor, location);
  if (quote.units <= 1e-9) return { ...refused('All tanks are full.'), fuel: 0, cost: 0 };
  const fuel = quote.affordable;
  if (fuel <= 1e-9) {
    const why = entry.stock < 1 ? `${location.name} has no Hydrogen in stock.` : 'You do not have sufficient credits to buy fuel.';
    return { ...refused(why), fuel: 0, cost: 0 };
  }
  const hydrogen = fuel / data.balance.fuel.fuelPerHydrogen;
  const cost = quoteBuy(entry, basePrice(data, HYDROGEN), hydrogen, data).total;
  let left = fuel;
  for (const ship of actor.fleet) {
    const add = Math.min(Math.max(0, travelStats(ship, data).fuelCapacity - ship.fuel), left);
    ship.fuel += add;
    left -= add;
  }
  entry.stock -= hydrogen;
  actor.credits -= cost;
  const part = fuel < quote.units - 1e-6 ? ' The tanks are not full.' : '';
  return { ...done(`You buy ${fuel.toFixed(1)} fuel for ${Math.round(cost)} cr.${part}`), fuel, cost };
}
