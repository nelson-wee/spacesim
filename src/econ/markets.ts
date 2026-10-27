// Market state: which commodities a location trades, and its targets (Section 9.2).
import type { Location, World } from '../core/types';
import type { GameData } from '../data';
import { kRef, nominalBatches } from './capital';
import { dailyUse } from './population';
import { recipeOf } from './recipes';

/** True if the location is a Trade Hub (trades all commodities). */
export function tradesAll(loc: Location, data: GameData): boolean {
  return data.stationTypeById.get(loc.bodyType)?.tradesAll ?? false;
}

/**
 * Nominal daily amount of each commodity that a location uses or makes, in
 * two parts: recipe inputs (hard inputs and Machinery wear), and the rest
 * (population and station use, recipe outputs). Section 9.2: target = days x
 * daily amount; inputs use fewer days (DECISIONS.md, M2).
 */
export function nominalFlowParts(loc: Location, world: World, data: GameData): { inputs: Map<string, number>; other: Map<string, number> } {
  const inputs = new Map<string, number>();
  const other = new Map<string, number>();
  const add = (m: Map<string, number>, c: string, q: number) => m.set(c, (m.get(c) ?? 0) + q);
  const sector = world.sectors[loc.sectorId];
  if (!sector) throw new Error(`Location ${loc.id} has no sector`);
  for (const u of dailyUse(loc, sector, data)) add(other, u.commodity, u.amount);
  if (loc.producer) {
    const r = recipeOf(data, loc.producer);
    const batches = nominalBatches(loc, r);
    for (const i of r.inputs) add(inputs, i.commodity, i.qty * batches);
    for (const o of r.outputs) add(other, o.commodity, o.qty * batches);
    add(inputs, r.softInput, data.recipes.capital.machineryWear * kRef(loc, r));
  }
  return { inputs, other };
}

/**
 * Commodities that a location trades: what its producer makes or uses (hard
 * and soft inputs), what its population uses, and Hydrogen (Refuel, Q-03).
 * Trade Hubs trade all commodities.
 */
export function tradedCommodities(loc: Location, world: World, data: GameData): string[] {
  if (tradesAll(loc, data)) return data.commodities.map((c) => c.id);
  const { inputs, other } = nominalFlowParts(loc, world, data);
  const traded = new Set([...inputs.keys(), ...other.keys()]);
  traded.add('hydrogen');
  return data.commodities.map((c) => c.id).filter((id) => traded.has(id));
}

/** Region daily use at full supply, for each commodity (Trade Hub targets). */
export function regionDailyUse(world: World, data: GameData): Map<string, number> {
  const total = new Map<string, number>();
  for (const loc of world.locations) {
    const sector = world.sectors[loc.sectorId];
    if (!sector) continue;
    for (const u of dailyUse(loc, sector, data)) total.set(u.commodity, (total.get(u.commodity) ?? 0) + u.amount);
    if (loc.producer) {
      const r = recipeOf(data, loc.producer);
      for (const i of r.inputs) total.set(i.commodity, (total.get(i.commodity) ?? 0) + i.qty * nominalBatches(loc, r));
    }
  }
  return total;
}

/** Sets the market of each location: traded commodities, targets, and stock = target (Section 9.5). */
export function initMarkets(world: World, data: GameData): void {
  const e = data.balance.economy;
  const region = regionDailyUse(world, data);
  for (const loc of world.locations) {
    const { inputs, other } = nominalFlowParts(loc, world, data);
    const hub = tradesAll(loc, data);
    const mult = loc.kind === 'planet' ? e.planetTargetMult : 1;
    loc.market = {};
    for (const c of tradedCommodities(loc, world, data)) {
      const own = ((inputs.get(c) ?? 0) * e.inputTargetDays + (other.get(c) ?? 0) * e.targetDays) * mult;
      const hubTarget = hub ? (region.get(c) ?? 0) * e.tradeHubTargetDays : 0;
      const target = Math.max(e.minTargetStock[c] ?? 1, own, hubTarget);
      loc.market[c] = { stock: target, target, history: [] };
    }
  }
}
