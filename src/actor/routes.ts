// Trade route values (Section 17.6). The Trade Ledger and the trader bot use
// the same code (M3-UI-13). A route uses only the actor's price information
// (Section 9.12): the known buy price at the start and the known sell price
// at the destination, unit by unit. Values use the fleet's free capacity, the
// fuel use of all ships, the speed of the slowest ship, and the credits.
// (Daily upkeep comes in M6.)
import type { Game } from '../core/game';
import type { Actor, Location, MarketEntry, Ship } from '../core/types';
import type { GameData } from '../data';
import { econContext } from '../econ/context';
import { basePrice, priceAt } from '../econ/prices';
import { travelStats } from '../ship/stats';
import { commodityMass, fleetFreeTonnes } from './cargo';
import { fuelUnitPrice } from './fuel';
import { knowsLocation, priceView } from './knowledge';
import { estimatePath, fleetWithCargo, type Path, pathBetween } from './paths';

/** What stops a larger cargo: free tonnes, credits, known stock, or the margin of the next unit. */
export type RouteLimit = 'cargo' | 'capital' | 'stock' | 'margin';

export interface RouteValue {
  commodity: string;
  fromId: number;
  toId: number;
  units: number;
  /** Sell price at the destination - buy price at the start, per tonne, for the first unit. */
  marginPerTonne: number;
  buyCost: number;
  saleValue: number;
  /** Sale value - buy cost, for the units. */
  profit: number;
  /** Profit for a full hold (no credit limit), for the Trade Ledger. */
  fullHoldProfit: number;
  /** Fuel cost of the trip (and of the trip to the start, if the fleet is not there). */
  fuelCost: number;
  /** Days of the trip (and of the trip to the start). */
  days: number;
  profitPerDay: number;
  limitedBy: RouteLimit;
  /** Jumps from the start to the destination. */
  jumps: number;
  /** Day of the oldest price that the route uses (null if live). */
  infoDay: number | null;
  /** False if a ship cannot reach the start with its fuel now, or cannot do the trip on a full tank. */
  fuelOk: boolean;
}

export interface RouteOptions {
  /** Credits for the buy. Default: the actor's credits, less the fuel cost. */
  credits?: number;
  /** Where the fleet is now. Default: the docked location. */
  hereId?: number;
}

interface Quoted {
  units: number;
  buyCost: number;
  saleValue: number;
  limitedBy: RouteLimit;
}

/** Buys unit by unit while the next unit makes a profit, up to the limits. */
function bestUnits(src: MarketEntry, dst: MarketEntry, base: number, maxCargo: number, credits: number, data: GameData): Quoted {
  const half = data.balance.economy.spread / 2;
  const maxStock = Math.max(0, Math.floor(src.stock + 1e-9));
  let units = 0;
  let buyCost = 0;
  let saleValue = 0;
  let limitedBy: RouteLimit = 'margin';
  for (;;) {
    if (units >= maxCargo) {
      limitedBy = 'cargo';
      break;
    }
    if (units >= maxStock) {
      limitedBy = 'stock';
      break;
    }
    const buy = priceAt(base, src.target, src.stock - units, data) * (1 + half);
    const sell = priceAt(base, dst.target, dst.stock + units, data) * (1 - half);
    if (sell <= buy) break;
    if (buyCost + buy > credits + 1e-9) {
      limitedBy = 'capital';
      break;
    }
    buyCost += buy;
    saleValue += sell;
    units++;
  }
  return { units, buyCost, saleValue, limitedBy };
}

function hereOf(game: Game, actor: Actor, options: RouteOptions): Location | null {
  const id = options.hereId ?? (actor.position.kind === 'docked' ? actor.position.locationId : undefined);
  return id === undefined ? null : (game.state.world.locations[id] ?? null);
}

/** The value of one route for one commodity, or null if a price is unknown or there is no path. */
export function routeValue(game: Game, actor: Actor, from: Location, to: Location, commodity: string, options: RouteOptions = {}): RouteValue | null {
  const { data } = game;
  const { world } = game.state;
  if (from.id === to.id) return null;
  const bp = priceView(game, actor, from, commodity);
  const sp = priceView(game, actor, to, commodity);
  if (!bp.entry || !sp.entry) return null;
  const mass = commodityMass(data, commodity);
  const marginPerTonne = (sp.sell - bp.buy) / mass;
  if (marginPerTonne <= 0) return null;
  const trip = pathBetween(world, data, from, to);
  if (!trip) return null;
  const here = hereOf(game, actor, options);
  const toStart: Path | null = here && here.id !== from.id ? pathBetween(world, data, here, from) : null;
  if (here && here.id !== from.id && !toStart) return null;

  const base = basePrice(data, commodity);
  const freeTonnes = fleetFreeTonnes(actor, data);
  const maxCargo = Math.floor(freeTonnes / mass + 1e-9);
  const full = bestUnits(bp.entry, sp.entry, base, maxCargo, Infinity, data);
  // Fuel: the trip to the start with the cargo now; the trip with the new cargo.
  const fuelPrice = fuelUnitPrice(data, here ?? from);
  const startEst = toStart ? estimatePath(toStart, actor.fleet, data) : { days: 0, totalFuel: 0, enoughFuel: true };
  const firstGuess = estimatePath(trip, fleetWithCargo(actor, data, commodity, full.units), data);
  const fuelGuess = (startEst.totalFuel + firstGuess.totalFuel) * fuelPrice;
  const credits = options.credits ?? Math.max(0, actor.credits - fuelGuess);
  const q = bestUnits(bp.entry, sp.entry, base, maxCargo, credits, data);
  if (q.units <= 0) return null;
  const tripEst = q.units === full.units ? firstGuess : estimatePath(trip, fleetWithCargo(actor, data, commodity, q.units), data);
  const days = startEst.days + tripEst.days;
  const fuelCost = (startEst.totalFuel + tripEst.totalFuel) * fuelPrice;
  if (!(days > 0 && days < Infinity)) return null;
  const profit = q.saleValue - q.buyCost;
  const fuelOk = startEst.enoughFuel && tripEst.fuel.every((f, i) => f <= travelStats(actor.fleet[i] as Ship, data).fuelCapacity + 1e-9);
  const days0 = [bp.day, sp.day].filter((d): d is number => d !== null);
  return {
    commodity,
    fromId: from.id,
    toId: to.id,
    units: q.units,
    marginPerTonne,
    buyCost: q.buyCost,
    saleValue: q.saleValue,
    profit,
    fullHoldProfit: full.saleValue - full.buyCost,
    fuelCost,
    days,
    profitPerDay: (profit - fuelCost) / days,
    limitedBy: q.limitedBy,
    jumps: trip.jumps,
    infoDay: bp.source === 'live' && sp.source === 'live' ? null : Math.min(...days0),
    fuelOk,
  };
}

export interface BestRoutesOptions extends RouteOptions {
  /** Only routes that start at the fleet's location. */
  fromHere?: boolean;
  /** Most jumps from the fleet to the start, and from the start to the destination. */
  maxJumps?: number;
  limit?: number;
  /** Only these commodities. */
  commodities?: string[];
}

/** The best known routes by profit per day (Section 17.6: the Trade Ledger shows 5). */
export function bestRoutes(game: Game, actor: Actor, options: BestRoutesOptions = {}): RouteValue[] {
  const { data } = game;
  const { world } = game.state;
  const here = hereOf(game, actor, options);
  if (!here) return [];
  const maxJumps = options.maxJumps ?? 3;
  const jumps = econContext(world, data).sectorJumps;
  const near = (a: Location, b: Location) => (jumps[a.sectorId]?.[b.sectorId] ?? Infinity) <= maxJumps;
  const known = world.locations.filter((l) => knowsLocation(actor, l) && actor.knowledge.markets[l.id] !== undefined);
  const starts = options.fromHere ? [here] : known.filter((l) => near(here, l));
  const out: RouteValue[] = [];
  // The commodities that a location trades are known from its last price information.
  const trades = (l: Location, c: string) => actor.knowledge.markets[l.id]?.prices[c] !== undefined;
  for (const from of starts) {
    for (const commodity of Object.keys(actor.knowledge.markets[from.id]?.prices ?? {})) {
      if (options.commodities && !options.commodities.includes(commodity)) continue;
      for (const to of known) {
        if (to.id === from.id || !trades(to, commodity) || !near(from, to)) continue;
        const v = routeValue(game, actor, from, to, commodity, options);
        if (v && v.profitPerDay > 0) out.push(v);
      }
    }
  }
  out.sort((a, b) => b.profitPerDay - a.profitPerDay || a.fromId - b.fromId || a.toId - b.toId);
  return out.slice(0, options.limit ?? 5);
}
