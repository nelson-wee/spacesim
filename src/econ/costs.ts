// Replacement cost of inputs (DECISIONS.md, M2). A producer that uses its inputs
// each day has a nearly empty input market, so its local input price sits near
// the high clamp: that price asks carriers for more goods, but it is not what
// the goods cost. A producer values an input at the cheapest price at which a
// carrier can bring it now: a source's buy price plus transport cost and risk,
// within the carrier range. With no source, it uses the local price.
import type { Location } from '../core/types';
import { transportCost } from './carriers';
import type { EconContext } from './context';
import { basePrice, buyPrice, midPrice } from './prices';

/** Price of one unit of a commodity for a producer at a location. */
export type InputPricer = (loc: Location, commodity: string) => number;

/** Makes the replacement-cost pricer for today's stocks and prices. */
export function createReplacementPricer(ctx: EconContext): InputPricer {
  const { world, data } = ctx;
  const e = data.balance.economy;
  const sources = new Map<string, { id: number; sectorId: number; buy: number }[]>();
  const cache = new Map<string, number>();
  const sourcesOf = (commodity: string) => {
    let list = sources.get(commodity);
    if (list) return list;
    list = [];
    const base = basePrice(data, commodity);
    for (const id of ctx.traders.get(commodity) ?? []) {
      const loc = world.locations[id] as Location;
      const entry = loc.market[commodity];
      if (entry && entry.stock > e.surplusShareOfTarget * entry.target) list.push({ id, sectorId: loc.sectorId, buy: buyPrice(entry, base, data) });
    }
    sources.set(commodity, list);
    return list;
  };
  return (loc, commodity) => {
    const key = `${loc.id}:${commodity}`;
    const known = cache.get(key);
    if (known !== undefined) return known;
    const mass = data.commodityById.get(commodity)?.massPerUnit ?? 1;
    let best = Infinity;
    for (const s of sourcesOf(commodity)) {
      if (s.id === loc.id) continue;
      const jumps = ctx.sectorJumps[s.sectorId]?.[loc.sectorId] ?? Infinity;
      if (jumps > e.carriers.maxJumps) continue;
      best = Math.min(best, s.buy + transportCost(mass, jumps, s.buy, ctx));
    }
    if (best === Infinity) {
      const entry = loc.market[commodity];
      const base = basePrice(data, commodity);
      best = entry ? midPrice(entry, base, data) : base;
    }
    cache.set(key, best);
    return best;
  };
}
