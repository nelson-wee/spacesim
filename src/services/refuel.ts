// Refuel (Section 7.4). M1 version: the price comes from the Hydrogen base
// price. M3 uses the local Hydrogen price and stock (Q-02).
import { fuelUnitPrice } from '../actor/fuel';
import type { Game } from '../core/game';
import type { Actor, Location } from '../core/types';
import { travelStats } from '../ship/stats';

export interface RefuelQuote {
  units: number;
  unitPrice: number;
  cost: number;
}

export function quoteRefuel(game: Game, actor: Actor, location: Location): RefuelQuote {
  const unitPrice = fuelUnitPrice(game.data, location);
  let units = 0;
  for (const ship of actor.fleet) units += Math.max(0, travelStats(ship, game.data).fuelCapacity - ship.fuel);
  return { units, unitPrice, cost: units * unitPrice };
}

/** Fills all fleet ships, as far as the credits allow. Returns the fuel bought. */
export function refuelFleet(game: Game, actor: Actor): number {
  if (actor.position.kind !== 'docked') {
    game.bus.message('You can refuel only at a location.', 'warning');
    return 0;
  }
  const location = game.state.world.locations[actor.position.locationId] as Location;
  const quote = quoteRefuel(game, actor, location);
  if (quote.units <= 0) {
    game.bus.message('All tanks are full.');
    return 0;
  }
  const affordable = Math.max(0, actor.credits) / quote.unitPrice;
  let budget = Math.min(quote.units, affordable);
  const bought = budget;
  for (const ship of actor.fleet) {
    const room = Math.max(0, travelStats(ship, game.data).fuelCapacity - ship.fuel);
    const add = Math.min(room, budget);
    ship.fuel += add;
    budget -= add;
  }
  actor.credits -= bought * quote.unitPrice;
  if (bought <= 0) game.bus.message('You do not have sufficient credits to buy fuel.', 'warning');
  else game.bus.message(`You buy ${bought.toFixed(1)} fuel for ${Math.round(bought * quote.unitPrice)} cr.`);
  return bought;
}
