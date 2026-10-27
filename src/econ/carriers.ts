// Background carriers (DECISIONS.md, M2): they replace the price-diffusion flow
// of Section 9.7. Abstract carriers buy where a commodity is cheap and sell where
// it is dear, on routes of up to `maxJumps` jumps. A route must pay: after the
// transport cost and risk, the margin must be at least `minMargin`. Smaller gaps stay for
// the player. Each sector has a carrier capacity in tonnes per day, lower where
// security is low (pirates slow the trade). Goods arrive after the transit days.
import type { EconomyState, Location, MarketEntry, Shipment } from '../core/types';
import type { EconContext } from './context';
import { basePrice, buyPrice, sellPrice, stockAtPriceFactor } from './prices';
import type { DayReport } from './report';

interface Candidate {
  commodity: string;
  /** Index of the commodity in data.commodities (stable sort order). */
  order: number;
  from: number;
  to: number;
  jumps: number;
  mass: number;
  /** (sell - buy - transport cost) / mass. */
  profitPerTonne: number;
  /**
   * Stock at the sink where the route stops paying: there the sell price is
   * buy x (1 + minMargin) + transport cost. The minimum margin keeps this price
   * above the low clamp, so the stock is finite.
   */
  fillTo: number;
}

/** Capacity multiplier of a sector: base + perLevel x security level (Lawless 0.2, Secure 1.0). */
export function capacityFactor(level: number, ctx: EconContext): number {
  const c = ctx.data.balance.economy.carriers;
  return c.securityBase + c.securityPerLevel * level;
}

/**
 * Transport cost of one unit: mass x (costPerTonne + costPerTonneJump x jumps),
 * plus risk: buy price x riskPerJump x jumps. Mass cost makes raw goods dearer
 * far from their mines; risk makes all goods dearer far from their makers.
 */
export function transportCost(mass: number, jumps: number, buy: number, ctx: EconContext): number {
  const c = ctx.data.balance.economy.carriers;
  return mass * (c.costPerTonne + c.costPerTonneJump * jumps) + buy * c.riskPerJump * jumps;
}

/** Days in transit for a route of `jumps` jumps. */
export function transitDays(jumps: number, ctx: EconContext): number {
  const c = ctx.data.balance.economy.carriers;
  return c.transitDays + c.transitDaysPerJump * jumps;
}

function key(locationId: number, commodity: string): string {
  return `${locationId}:${commodity}`;
}

/** Adds the shipments that arrive today to their destination stock. */
function deliver(ctx: EconContext, economy: EconomyState, report?: DayReport): void {
  const kept: Shipment[] = [];
  for (const s of economy.shipments) {
    if (s.arriveDay > economy.days) {
      kept.push(s);
      continue;
    }
    const entry = ctx.world.locations[s.to]?.market[s.commodity];
    if (!entry) continue;
    entry.stock += s.qty;
    report?.add(s.to, s.commodity, 'flowIn', s.qty);
  }
  economy.shipments = kept;
}

/**
 * One day of carrier trade: deliver arrivals, then dispatch new shipments.
 * All decisions use the prices and stocks at the start of the step. Carriers
 * fill a sink until its price falls to the break-even price of the route (the
 * source price plus transport cost, risk, and the minimum margin), so a far
 * sink stays dearer than a near one. The fill counts the goods already in
 * transit, less what the sink uses during the transit days, so carriers do
 * not send too much or too little. `sectorLevels` are the security
 * levels of the sectors.
 */
export function runCarriers(ctx: EconContext, economy: EconomyState, sectorLevels: number[], report?: DayReport): void {
  const { world, data } = ctx;
  const e = data.balance.economy;
  const c = e.carriers;
  deliver(ctx, economy, report);

  const inbound = new Map<string, number>();
  for (const s of economy.shipments) inbound.set(key(s.to, s.commodity), (inbound.get(key(s.to, s.commodity)) ?? 0) + s.qty);
  const capacity = world.sectors.map((s) => c.sectorCapacityTonnes * capacityFactor(sectorLevels[s.id] ?? 0, ctx));

  const surplus = new Map<string, number>();
  /** Stock at each sink now, plus goods in transit, plus goods sent today. */
  const filled = new Map<string, number>();
  const candidates: Candidate[] = [];
  const spreadOut = 1 - e.spread / 2;
  data.commodities.forEach((commodity, order) => {
    const base = basePrice(data, commodity.id);
    const markets: [Location, MarketEntry][] = [];
    for (const id of ctx.traders.get(commodity.id) ?? []) {
      const loc = world.locations[id] as Location;
      const entry = loc.market[commodity.id];
      if (!entry) continue;
      markets.push([loc, entry]);
      const free = entry.stock - e.surplusShareOfTarget * entry.target;
      if (free > 0) surplus.set(key(id, commodity.id), free);
      filled.set(key(id, commodity.id), entry.stock + (inbound.get(key(id, commodity.id)) ?? 0));
    }
    for (const [src, srcEntry] of markets) {
      if (!surplus.has(key(src.id, commodity.id))) continue;
      const buy = buyPrice(srcEntry, base, data);
      for (const [dst, dstEntry] of markets) {
        if (dst.id === src.id) continue;
        const jumps = ctx.sectorJumps[src.sectorId]?.[dst.sectorId] ?? Infinity;
        if (jumps > c.maxJumps) continue;
        const cost = transportCost(commodity.massPerUnit, jumps, buy, ctx);
        const gain = sellPrice(dstEntry, base, data) - buy - cost;
        if (gain < c.minMargin * buy) continue;
        const breakEven = (buy * (1 + c.minMargin) + cost) / spreadOut / base;
        candidates.push({
          commodity: commodity.id,
          order,
          from: src.id,
          to: dst.id,
          jumps,
          mass: commodity.massPerUnit,
          profitPerTonne: gain / commodity.massPerUnit,
          fillTo: stockAtPriceFactor(dstEntry.target, breakEven, data),
        });
      }
    }
  });

  // The best routes per tonne take the capacity first.
  candidates.sort((a, b) => b.profitPerTonne - a.profitPerTonne || a.order - b.order || a.from - b.from || a.to - b.to);
  for (const cand of candidates) {
    const fromKey = key(cand.from, cand.commodity);
    const toKey = key(cand.to, cand.commodity);
    const src = world.locations[cand.from] as Location;
    const dst = world.locations[cand.to] as Location;
    const path = ctx.sectorPaths[src.sectorId]?.[dst.sectorId] ?? [];
    // The sink uses goods while these travel: count its need for the transit days.
    const room = cand.fillTo - (filled.get(toKey) ?? 0) + (ctx.dailyNeed.get(toKey) ?? 0) * transitDays(cand.jumps, ctx);
    let qty = c.dailyShare * Math.min(surplus.get(fromKey) ?? 0, room);
    for (const sid of path) qty = Math.min(qty, (capacity[sid] ?? 0) / cand.mass);
    if (qty <= 1e-6) continue;
    surplus.set(fromKey, (surplus.get(fromKey) ?? 0) - qty);
    filled.set(toKey, (filled.get(toKey) ?? 0) + qty);
    for (const sid of path) capacity[sid] = (capacity[sid] ?? 0) - qty * cand.mass;
    const entry = src.market[cand.commodity] as MarketEntry;
    entry.stock -= qty;
    report?.add(cand.from, cand.commodity, 'flowOut', qty);
    economy.shipments.push({ to: cand.to, commodity: cand.commodity, qty, arriveDay: economy.days + transitDays(cand.jumps, ctx) });
  }
  // Shipments with no transit time arrive today.
  deliver(ctx, economy, report);
}
