// The daily economy tick (Section 9.6).
import type { Rng } from '../core/rng';
import type { EconomyState, Location } from '../core/types';
import type { GameData } from '../data';
import { securityLevel, securityLevelInfo } from '../world/security';
import { installAndWear, installWant } from './capital';
import type { EconContext } from './context';
import { runCarriers } from './carriers';
import { emptyRegionStats, inputTrickle, offMapExport, regionBalance } from './offmap';
import { basePrice, midPrice } from './prices';
import { produce, recipeOf } from './recipes';
import type { DayReport } from './report';

export function createEconomyState(data: GameData): EconomyState {
  const region: EconomyState['region'] = {};
  for (const c of data.commodities) region[c.id] = emptyRegionStats();
  return { days: 0, region, shipments: [] };
}

export interface EconomyDayOptions {
  /**
   * Batch multiplier for each producer. Market events (M7, Section 9.11) use
   * it; tools use it for the chain-shock test. Default 1.
   */
  eventMult?: (loc: Location) => number;
}

function addTo(map: Map<string, number>, key: string, qty: number): void {
  map.set(key, (map.get(key) ?? 0) + qty);
}

/**
 * Runs one economy day:
 * 1 population use, 2 production, 3 Machinery install and wear,
 * 4 background carriers, 5 off-map supply and demand, 6 noise,
 * 7 stock = max(stock, 0), 8 events (M7). Then each market keeps its price.
 */
export function economyDay(
  ctx: EconContext,
  economy: EconomyState,
  rng: Rng,
  report?: DayReport,
  options: EconomyDayOptions = {},
): void {
  const { world, data } = ctx;
  const e = data.balance.economy;
  const levels = world.sectors.map((s) => securityLevel(s.securityValue, data));
  const mults = world.sectors.map((s) => securityLevelInfo(s.securityValue, data).economyMult);
  const supply = new Map<string, number>();
  const demand = new Map<string, number>();

  // 1. Population (and station) use.
  for (const loc of world.locations) {
    const mult = mults[loc.sectorId] ?? 1;
    for (const u of ctx.uses[loc.id] ?? []) {
      const entry = loc.market[u.commodity];
      if (!entry) continue;
      const want = u.amount * mult;
      const used = Math.min(want, Math.max(0, entry.stock));
      entry.stock -= used;
      addTo(demand, u.commodity, want);
      report?.add(loc.id, u.commodity, 'consumed', used);
    }
  }

  // 2. Production.
  for (const loc of ctx.producers) {
    const recipe = recipeOf(data, loc.producer as string);
    const result = produce(loc, recipe, mults[loc.sectorId] ?? 1, options.eventMult?.(loc) ?? 1);
    loc.production = {
      outputRatio: result.outputRatio,
      inputFactor: result.inputFactor,
      capitalFactor: result.capitalFactor,
    };
    for (const w of result.inputWant) addTo(demand, w.commodity, w.qty);
    for (const u of result.inputsUsed) report?.add(loc.id, u.commodity, 'consumed', u.qty);
    for (const o of result.outputs) {
      addTo(supply, o.commodity, o.qty);
      report?.add(loc.id, o.commodity, 'produced', o.qty);
    }
    report?.outputRatio.set(loc.id, result.outputRatio);
  }

  // 3. Machinery install and wear.
  for (const loc of ctx.producers) {
    const recipe = recipeOf(data, loc.producer as string);
    addTo(demand, recipe.softInput, installWant(loc, recipe, data));
    const installed = installAndWear(loc, recipe, data);
    report?.add(loc.id, recipe.softInput, 'consumed', installed);
  }

  // 4. Background trade: carriers (replaces the Section 9.7 flow; DECISIONS.md).
  runCarriers(ctx, economy, levels, report);

  // 5. Off-map supply and demand.
  for (const [c, qty] of inputTrickle(ctx, report)) addTo(supply, c, qty);
  for (const [c, qty] of offMapExport(ctx, report)) addTo(demand, c, qty);
  regionBalance(ctx, economy, supply, demand, report);

  // 6. Noise, and 7. no stock below 0.
  for (const loc of world.locations) {
    for (const entry of Object.values(loc.market)) {
      entry.stock += entry.target * rng.range(-e.noiseShare, e.noiseShare);
      if (entry.stock < 0) entry.stock = 0;
    }
  }

  // 8. Events update: M7.

  // Price history for trend arrows (Section 9.12).
  for (const loc of world.locations) {
    for (const [c, entry] of Object.entries(loc.market)) {
      entry.history.push(midPrice(entry, basePrice(data, c), data));
      if (entry.history.length > e.historyDays) entry.history.shift();
    }
  }
  economy.days++;
}
