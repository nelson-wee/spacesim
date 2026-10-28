// Market (Sections 7.4, 9.1, 9.10, 17.4). Buy and sell with unit-by-unit
// quotes. Bought cargo goes to the fleet in the loading order of Section 11.9.
// A buy is limited by credits, free cargo tonnes, and local stock (M3-SVC-05).
// A sale adds to credits, so it pays a debt first (Section 8.6).
import { addCargo, commodityMass, fleetFreeTonnes, fleetUnitCost, fleetUnits, removeCargo } from '../actor/cargo';
import type { Game } from '../core/game';
import type { Actor, Location, MarketEntry } from '../core/types';
import type { GameData } from '../data';
import { tradesAll } from '../econ/markets';
import { basePrice, priceAt, quoteBuy, quoteSell } from '../econ/prices';
import { recipeOf } from '../econ/recipes';
import { done, isPirateHaven, refused, type ServiceResult, serviceProblem } from './common';

/** What limits a buy: local stock, free cargo tonnes, or credits ("capital"). */
export type BuyLimit = 'stock' | 'cargo' | 'credits';

export interface BuyLimitResult {
  /** Whole units that the actor can buy now. */
  units: number;
  limitedBy: BuyLimit;
  /** Units at each limit. */
  byStock: number;
  byCargo: number;
  byCredits: number;
}

/** Sells: the location makes it. Buys: the location needs it. Trade Hubs trade all goods (Section 17.4). */
export type MarketRole = 'sells' | 'buys' | 'hub';

export function marketRole(location: Location, commodity: string, data: GameData): MarketRole {
  if (location.producer && recipeOf(data, location.producer).outputs.some((o) => o.commodity === commodity)) return 'sells';
  return tradesAll(location, data) ? 'hub' : 'buys';
}

function entryOf(location: Location, commodity: string): MarketEntry | undefined {
  return location.market[commodity];
}

/**
 * The entry for a sale. A Pirate Haven buys all cargo (Q-24): a commodity
 * that it does not trade sells at the base price (a large virtual market, no
 * stock change).
 */
export function sellEntryOf(location: Location, commodity: string, data: GameData): MarketEntry | undefined {
  const entry = entryOf(location, commodity);
  if (entry || !isPirateHaven(location, data)) return entry;
  return { stock: 1e6, target: 1e6, history: [] };
}

/** Share of the sell price that the location pays: 70% at a Pirate Haven (Q-24), else 100%. */
export function sellShare(location: Location, data: GameData): number {
  return isPirateHaven(location, data) ? data.serviceRules.pirateHaven.cargoBuyShare : 1;
}

/** Most whole units that `credits` buys, unit by unit. */
function unitsForCredits(entry: MarketEntry, base: number, credits: number, maxUnits: number, data: GameData): number {
  const mult = 1 + data.balance.economy.spread / 2;
  let spent = 0;
  let units = 0;
  while (units < maxUnits) {
    const price = priceAt(base, entry.target, entry.stock - units, data) * mult;
    if (spent + price > credits + 1e-9) break;
    spent += price;
    units++;
  }
  return units;
}

/** Units the actor can buy, and the limit that stops a larger buy. */
export function buyLimit(actor: Actor, location: Location, commodity: string, data: GameData, credits = actor.credits): BuyLimitResult {
  const entry = entryOf(location, commodity);
  if (!entry) return { units: 0, limitedBy: 'stock', byStock: 0, byCargo: 0, byCredits: 0 };
  const mass = commodityMass(data, commodity);
  const byStock = Math.max(0, Math.floor(entry.stock + 1e-9));
  const byCargo = mass > 0 ? Math.max(0, Math.floor(fleetFreeTonnes(actor, data) / mass + 1e-9)) : byStock;
  const cap = Math.min(byStock, byCargo);
  const byCredits = unitsForCredits(entry, basePrice(data, commodity), Math.max(0, credits), cap + 1, data);
  const units = Math.min(cap, byCredits);
  const limitedBy: BuyLimit = byCredits < cap ? 'credits' : byCargo < byStock ? 'cargo' : 'stock';
  return { units, limitedBy, byStock, byCargo, byCredits };
}

export interface TradeResult extends ServiceResult {
  units: number;
  total: number;
}

const LIMIT_TEXT: Record<BuyLimit, string> = {
  stock: 'The location has no more stock.',
  cargo: 'Your fleet has no free cargo space.',
  credits: 'You do not have sufficient credits.',
};

/** Buys up to `units` whole units. Fewer units if a limit stops the buy. */
export function buy(game: Game, actor: Actor, location: Location, commodity: string, units: number): TradeResult {
  const { data } = game;
  const problem = serviceProblem(actor, location, 'market', data);
  const entry = entryOf(location, commodity);
  if (problem) return { ...refused(problem), units: 0, total: 0 };
  if (!entry) return { ...refused(`${location.name} does not trade ${commodityName(data, commodity)}.`), units: 0, total: 0 };
  const limit = buyLimit(actor, location, commodity, data);
  const n = Math.min(Math.floor(units), limit.units);
  if (n <= 0) return { ...refused(LIMIT_TEXT[limit.limitedBy]), units: 0, total: 0 };
  const q = quoteBuy(entry, basePrice(data, commodity), n, data);
  entry.stock -= n;
  actor.credits -= q.total;
  const left = addCargo(actor, data, commodity, n, q.average);
  if (left > 1e-6) throw new Error(`Cargo allocation lost ${left} units`);
  const short = n < units ? ` (${LIMIT_TEXT[limit.limitedBy].toLowerCase().replace(/\.$/, '')})` : '';
  return { ...done(`You buy ${n} ${commodityName(data, commodity)} for ${Math.round(q.total)} cr${short}.`), units: n, total: q.total };
}

/** Sells up to `units` units from the fleet cargo (part units too). */
export function sell(game: Game, actor: Actor, location: Location, commodity: string, units: number): TradeResult {
  const { data } = game;
  const problem = serviceProblem(actor, location, 'market', data);
  const entry = sellEntryOf(location, commodity, data);
  if (problem) return { ...refused(problem), units: 0, total: 0 };
  if (!entry) return { ...refused(`${location.name} does not buy ${commodityName(data, commodity)}.`), units: 0, total: 0 };
  const n = Math.min(units, fleetUnits(actor, commodity));
  if (n <= 1e-9) return { ...refused(`You have no ${commodityName(data, commodity)}.`), units: 0, total: 0 };
  const q = { total: quoteSell(entry, basePrice(data, commodity), n, data).total * sellShare(location, data) };
  const debt = Math.max(0, -actor.credits);
  removeCargo(actor, commodity, n);
  entry.stock += n;
  actor.credits += q.total;
  const debtText = debt > 0 ? ` ${Math.round(Math.min(debt, q.total))} cr pays your debt.` : '';
  return { ...done(`You sell ${formatUnits(n)} ${commodityName(data, commodity)} for ${Math.round(q.total)} cr.${debtText}`), units: n, total: q.total };
}

/** Sell value of the actor's cargo of one commodity here, unit by unit, or null if the location does not trade it. */
export function cargoSaleValue(actor: Actor, location: Location, commodity: string, data: GameData): number | null {
  const entry = sellEntryOf(location, commodity, data);
  if (!entry) return null;
  return quoteSell(entry, basePrice(data, commodity), fleetUnits(actor, commodity), data).total * sellShare(location, data);
}

/** Profit of a sale against the purchase price, for the Market tab. */
export function saleProfit(actor: Actor, location: Location, commodity: string, data: GameData): number | null {
  const value = cargoSaleValue(actor, location, commodity, data);
  if (value === null) return null;
  return value - fleetUnits(actor, commodity) * fleetUnitCost(actor, commodity);
}

export function commodityName(data: GameData, commodity: string): string {
  return data.commodityById.get(commodity)?.name ?? commodity;
}

export function formatUnits(units: number): string {
  return Number.isInteger(units) ? String(units) : units.toFixed(1);
}
