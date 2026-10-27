// Generator step 8: validation (Section 6.10). Structure rules first, then a
// short economy run with no player.
import { Rng } from '../core/rng';
import type { Location, World } from '../core/types';
import type { GameData } from '../data';
import { createEconContext } from '../econ/context';
import { economyDay } from '../econ/economy';
import { tradesAll } from '../econ/markets';
import { type GradientResult, priceGradient } from '../econ/gradient';
import { basePrice, midPrice } from '../econ/prices';
import { recipeOf } from '../econ/recipes';
import { supplyAtFloor, supplyRatios } from './assign';
import { hasService } from './placeServices';

export interface RuleResult {
  id: string;
  pass: boolean;
  detail: string;
}

function rule(id: string, problems: string[]): RuleResult {
  return { id, pass: problems.length === 0, detail: problems.slice(0, 6).join('; ') };
}

function makers(world: World, data: GameData, commodity: string): Location[] {
  return world.locations.filter((l) => l.producer && recipeOf(data, l.producer).outputs.some((o) => o.commodity === commodity));
}

/** The structure rules of Section 6.10, plus the rules of the M2 decisions. */
export function validateRules(world: World, data: GameData, unplaced: string[], pathMissing: string[]): RuleResult[] {
  const g = data.balance.generator;
  const results: RuleResult[] = [];
  // The first try reports the blueprint producers with no body; after a repair, a type below
  // the minimum count still fails.
  const short = data.recipes.recipes
    .filter((r) => world.locations.filter((l) => l.producer === r.producer).length < g.minProducersPerType)
    .map((r) => r.producer);
  results.push(rule('producersPlaced', [...new Set([...unplaced, ...short])].map((p) => `no body for ${p}`)));

  const ratios = supplyRatios(world, data);
  results.push(
    rule(
      'supplyRatio',
      Object.entries(ratios)
        .filter(([c, r]) => r < g.ratioAcceptLow || (r > g.ratioAcceptHigh && !supplyAtFloor(world, data, c)))
        .map(([c, r]) => `${c} ${r.toFixed(2)}`),
    ),
  );

  results.push(
    rule(
      'twoSectors',
      data.commodities
        .filter((c) => new Set(makers(world, data, c.id).map((l) => l.sectorId)).size < 2)
        .map((c) => c.id),
    ),
  );

  const chain: string[] = [];
  for (const r of data.recipes.recipes) {
    const own = world.locations.filter((l) => l.producer === r.producer);
    for (const input of r.inputs) {
      const src = makers(world, data, input.commodity);
      if (!own.some((a) => src.some((b) => b.sectorId !== a.sectorId))) chain.push(`${r.producer}<-${input.commodity}`);
    }
  }
  results.push(rule('chainSeparation', chain));

  results.push(
    rule(
      'rareFrontier',
      world.locations
        .filter((l) => l.producer === 'rare_element_mine' && world.sectors[l.sectorId]?.development !== 'frontier')
        .map((l) => l.name),
    ),
  );

  const withService = (id: string) => world.locations.filter((l) => hasService(l, id));
  const yards = withService('shipyard');
  const svc: string[] = [];
  if (yards.length < 2) svc.push(`shipyards ${yards.length}`);
  if (!yards.some((l) => l.techLevel >= 3)) svc.push('no tech-3 shipyard');
  if (withService('outfitter').length < 3) svc.push(`outfitters ${withService('outfitter').length}`);
  if (withService('merchants_guild').length < 2) svc.push(`merchants guilds ${withService('merchants_guild').length}`);
  if (withService('bounty_guild').length < 2) svc.push(`bounty guilds ${withService('bounty_guild').length}`);
  results.push(rule('services', svc));

  const sec: string[] = [];
  for (const l of world.locations) {
    const s = world.sectors[l.sectorId];
    if (!s) continue;
    if (l.bodyType === 'military_outpost' && s.securityBaseline < 50) sec.push(`outpost ${l.name}`);
    if (l.bodyType === 'pirate_haven' && s.securityBaseline > 30) sec.push(`haven ${l.name}`);
  }
  results.push(rule('stationSecurity', sec));

  const start = world.locations[world.startLocationId];
  const startProblems: string[] = [];
  if (!start || start.sectorId !== world.coreSectorId) startProblems.push('not in the core sector');
  if (start && !(hasService(start, 'outfitter') && hasService(start, 'merchants_guild'))) startProblems.push('no Outfitter or Merchants Guild');
  results.push(rule('start', startProblems));

  results.push(rule('supplyPath', pathMissing));

  return results;
}

export interface EconomyCheck {
  results: RuleResult[];
  /** Longest run of low-output days for each producer location id. */
  lowStreaks: Map<number, number>;
  gradient: GradientResult;
}

/**
 * Short economy run (Section 6.10): the economy runs for the validation days
 * with no player. Checks the low-output rule and the core-frontier gradient
 * (price / base price; the first quarter of the run is warm-up).
 */
export function validateEconomy(world: World, data: GameData, seed: number): EconomyCheck {
  const g = data.balance.generator;
  const ctx = createEconContext(world, data);
  const rng = Rng.fromSeed(seed, 'validation');
  const streak = new Map<number, number>();
  const longest = new Map<number, number>();
  // Price factors (price / base) of raw and advanced goods, keyed `${commodity}:${development}`.
  const samples = new Map<string, number[]>();
  const warmup = Math.floor(g.validationDays / 4);
  for (let day = 0; day < g.validationDays; day++) {
    economyDay(ctx, world.economy, rng);
    for (const loc of ctx.producers) {
      const low = (loc.production?.outputRatio ?? 0) < g.lowOutputShare;
      const n = low ? (streak.get(loc.id) ?? 0) + 1 : 0;
      streak.set(loc.id, n);
      longest.set(loc.id, Math.max(longest.get(loc.id) ?? 0, n));
    }
    if (day < warmup) continue;
    for (const loc of world.locations) {
      const dev = world.sectors[loc.sectorId]?.development;
      if (dev !== 'core' && dev !== 'frontier') continue;
      for (const [c, entry] of Object.entries(loc.market)) {
        const tier = data.commodityById.get(c)?.tier;
        if (tier !== 'raw' && tier !== 'advanced') continue;
        const key = `${c}:${dev}`;
        let list = samples.get(key);
        if (!list) samples.set(key, (list = []));
        list.push(midPrice(entry, basePrice(data, c), data) / basePrice(data, c));
      }
    }
  }
  const low = [...longest]
    .filter(([, n]) => n >= g.lowOutputDays)
    .map(([id, n]) => `${world.locations[id]?.name} (${world.locations[id]?.producer}) ${n} days`);
  const gradient = priceGradient(samples, data);
  return { results: [rule('lowOutput', low), rule('gradient', gradient.problems)], lowStreaks: longest, gradient };
}
