// Off-map supply and demand (Section 9.8). These rules stop a deadlock that never recovers.
import type { EconomyState, Location, RegionCommodityStats } from '../core/types';
import type { EconContext } from './context';
import { nominalBatches } from './capital';
import { recipeOf } from './recipes';
import type { DayReport } from './report';

/** Each producer gets a share of its hard input needs from outside the region. */
export function inputTrickle(ctx: EconContext, report?: DayReport): Map<string, number> {
  const share = ctx.data.balance.economy.offMapInputShare;
  const added = new Map<string, number>();
  for (const loc of ctx.producers) {
    const r = recipeOf(ctx.data, loc.producer as string);
    const batches = nominalBatches(loc, r);
    for (const i of r.inputs) {
      const entry = loc.market[i.commodity];
      if (!entry) continue;
      const qty = share * i.qty * batches;
      entry.stock += qty;
      added.set(i.commodity, (added.get(i.commodity) ?? 0) + qty);
      report?.add(loc.id, i.commodity, 'offMap', qty);
    }
  }
  return added;
}

/**
 * Off-map export (DECISIONS.md, M2): a share of each stock above
 * `exportStockRatio x target` leaves the region each day. Without it, a small
 * surplus piles up at a producer for ever, because the brief has no other
 * sink. Returns the units removed for each commodity.
 */
export function offMapExport(ctx: EconContext, report?: DayReport): Map<string, number> {
  const e = ctx.data.balance.economy;
  const removed = new Map<string, number>();
  for (const loc of ctx.world.locations) {
    for (const [c, entry] of Object.entries(loc.market)) {
      const excess = entry.stock - e.exportStockRatio * entry.target;
      if (excess <= 0) continue;
      const qty = excess * e.exportShare;
      entry.stock -= qty;
      removed.set(c, (removed.get(c) ?? 0) + qty);
      report?.add(loc.id, c, 'offMap', -qty);
    }
  }
  return removed;
}

export function emptyRegionStats(): RegionCommodityStats {
  return { supply: [], demand: [], outOfRangeDays: 0, balancing: null };
}

function sum(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

/** Ratio of supply to demand over the window. Null when there is no demand. */
export function windowRatio(stats: RegionCommodityStats): number | null {
  const demand = sum(stats.demand);
  return demand > 0 ? sum(stats.supply) / demand : null;
}

/**
 * Records today's region supply and demand, then runs the region balance:
 * if the ratio stays outside the start limits for a full window, add (or
 * remove) a share of region demand each day, split between Trade Hubs, until
 * the ratio is inside the stop limits. Off-map changes count as supply or
 * demand, so the ratio can recover.
 */
export function regionBalance(
  ctx: EconContext,
  economy: EconomyState,
  supply: Map<string, number>,
  demand: Map<string, number>,
  report?: DayReport,
): void {
  const e = ctx.data.balance.economy;
  for (const c of ctx.data.commodities) {
    const stats = (economy.region[c.id] ??= { supply: [], demand: [], outOfRangeDays: 0, balancing: null });
    let daySupply = supply.get(c.id) ?? 0;
    let dayDemand = demand.get(c.id) ?? 0;
    const avgDemand = stats.demand.length > 0 ? sum(stats.demand) / stats.demand.length : dayDemand;
    if (stats.balancing) {
      const qty = e.offMapBalance * avgDemand;
      const targets: Location[] = ctx.tradeHubs.length > 0 ? ctx.tradeHubs : (ctx.traders.get(c.id) ?? []).map((id) => ctx.world.locations[id] as Location);
      const each = targets.length > 0 ? qty / targets.length : 0;
      for (const loc of targets) {
        const entry = loc.market[c.id];
        if (!entry) continue;
        const change = stats.balancing === 'add' ? each : -Math.min(each, Math.max(0, entry.stock));
        entry.stock += change;
        report?.add(loc.id, c.id, 'offMap', change);
        if (change > 0) daySupply += change;
        else dayDemand -= change;
      }
    }
    stats.supply.push(daySupply);
    stats.demand.push(dayDemand);
    if (stats.supply.length > e.balanceWindowDays) stats.supply.shift();
    if (stats.demand.length > e.balanceWindowDays) stats.demand.shift();
    const ratio = windowRatio(stats);
    if (ratio === null) continue;
    if (stats.balancing) {
      if (ratio >= e.balanceStopLow && ratio <= e.balanceStopHigh) {
        stats.balancing = null;
        stats.outOfRangeDays = 0;
      }
    } else if (ratio < e.balanceStartLow || ratio > e.balanceStartHigh) {
      stats.outOfRangeDays++;
      if (stats.outOfRangeDays >= e.balanceWindowDays) stats.balancing = ratio < 1 ? 'add' : 'remove';
    } else {
      stats.outOfRangeDays = 0;
    }
  }
}
