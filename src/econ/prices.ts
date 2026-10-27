// Prices (Section 9.10). The actor pays the buy price and gets the sell price.
import type { MarketEntry } from '../core/types';
import type { GameData } from '../data';

export function basePrice(data: GameData, commodityId: string): number {
  const c = data.commodityById.get(commodityId);
  if (!c) throw new Error(`Unknown commodity ${commodityId}`);
  return c.basePrice;
}

/** Mid price for a stock and target. */
export function priceAt(base: number, target: number, stock: number, data: GameData): number {
  const e = data.balance.economy;
  const factor = (target / Math.max(stock, 1)) ** e.priceExponent;
  return base * Math.min(e.priceClampMax, Math.max(e.priceClampMin, factor));
}

/** Price factor (price / base), before the clamp. Used for clamp checks. */
export function rawPriceFactor(target: number, stock: number, data: GameData): number {
  return (target / Math.max(stock, 1)) ** data.balance.economy.priceExponent;
}

export function midPrice(entry: MarketEntry, base: number, data: GameData): number {
  return priceAt(base, entry.target, entry.stock, data);
}

/** Price that an actor pays for one unit. */
export function buyPrice(entry: MarketEntry, base: number, data: GameData): number {
  return midPrice(entry, base, data) * (1 + data.balance.economy.spread / 2);
}

/** Price that an actor gets for one unit. */
export function sellPrice(entry: MarketEntry, base: number, data: GameData): number {
  return midPrice(entry, base, data) * (1 - data.balance.economy.spread / 2);
}

export interface Quote {
  units: number;
  total: number;
  average: number;
}

/**
 * Cost of buying `units` units, unit by unit. Each unit bought removes 1 from
 * stock, so large trades get worse prices. Does not change the entry.
 */
export function quoteBuy(entry: MarketEntry, base: number, units: number, data: GameData): Quote {
  const mult = 1 + data.balance.economy.spread / 2;
  let total = 0;
  for (let i = 0; i < units; i++) total += priceAt(base, entry.target, entry.stock - i, data) * mult;
  return { units, total, average: units > 0 ? total / units : 0 };
}

/** Value of selling `units` units, unit by unit. Each unit sold adds 1 to stock. */
export function quoteSell(entry: MarketEntry, base: number, units: number, data: GameData): Quote {
  const mult = 1 - data.balance.economy.spread / 2;
  let total = 0;
  for (let i = 0; i < units; i++) total += priceAt(base, entry.target, entry.stock + i, data) * mult;
  return { units, total, average: units > 0 ? total / units : 0 };
}
