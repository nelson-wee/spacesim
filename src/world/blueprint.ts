// Generator step 4: the blueprint (Section 6.6). It calculates how many
// producers of each type the region needs, like a bill-of-materials explosion.
import type { World } from '../core/types';
import type { GameData, Recipe } from '../data';
import { populationFor, useApplies } from '../econ/population';

const TIER_RANK: Record<string, number> = { raw: 0, processed: 1, advanced: 2, consumer: 3 };

/** The main product of a recipe: its output with the highest tier (Electrolysis: Oxygen). */
export function mainProduct(recipe: Recipe, data: GameData): string {
  let best = recipe.outputs[0]?.commodity ?? '';
  for (const o of recipe.outputs) {
    const rank = TIER_RANK[data.commodityById.get(o.commodity)?.tier ?? 'raw'] ?? 0;
    const bestRank = TIER_RANK[data.commodityById.get(best)?.tier ?? 'raw'] ?? 0;
    if (rank > bestRank) best = o.commodity;
  }
  return best;
}

export interface Blueprint {
  /** Region demand for each commodity per day (population, recipe inputs, Machinery wear). */
  demand: Record<string, number>;
  /** Batches per day that the region needs, for each producer type. */
  batches: Record<string, number>;
  /** Number of producers of each type. */
  counts: Record<string, number>;
}

/** Population demand of the region at the average size (step 4.1). */
export function populationDemand(world: World, data: GameData): Record<string, number> {
  const g = data.balance.generator;
  const demand: Record<string, number> = {};
  for (const loc of world.locations) {
    const sector = world.sectors[loc.sectorId];
    if (!sector) continue;
    const pop = populationFor(loc.bodyType, g.averageSize, data);
    const airless = !(loc.kind === 'planet' && data.planetTypeById.get(loc.bodyType)?.atmosphere);
    for (const u of data.population.use) {
      if (useApplies(u.who, loc.bodyType, airless, sector.development === 'core')) demand[u.commodity] = (demand[u.commodity] ?? 0) + u.perUnitPerDay * pop * data.population.useScale;
    }
  }
  return demand;
}

/**
 * Steps 4.2 to 4.5. The demand of each product goes back through its recipe
 * to the inputs. Machinery wear of all producers adds Machinery demand. The
 * calculation repeats until it is stable (a few passes).
 */
export function computeBlueprint(world: World, data: GameData): Blueprint {
  const g = data.balance.generator;
  const wear = data.recipes.capital.machineryWear;
  const popDemand = populationDemand(world, data);
  const recipes = data.recipes.recipes;
  let batches: Record<string, number> = Object.fromEntries(recipes.map((r) => [r.producer, 0]));
  let counts: Record<string, number> = Object.fromEntries(recipes.map((r) => [r.producer, g.minProducersPerType]));
  let demand: Record<string, number> = {};
  for (let pass = 0; pass < g.blueprintPasses; pass++) {
    demand = { ...popDemand };
    const add = (c: string, q: number) => (demand[c] = (demand[c] ?? 0) + q);
    for (const r of recipes) {
      for (const i of r.inputs) add(i.commodity, i.qty * (batches[r.producer] ?? 0));
      add(r.softInput, wear * r.machineryPerBatch * r.batchesPerSize * g.averageSize * (counts[r.producer] ?? 0));
    }
    const next: Record<string, number> = {};
    for (const r of recipes) {
      const main = mainProduct(r, data);
      // Other recipes that make this commodity as a by-product reduce the need.
      let byProduct = 0;
      for (const other of recipes) {
        if (other === r || mainProduct(other, data) === main) continue;
        const o = other.outputs.find((x) => x.commodity === main);
        if (o) byProduct += o.qty * (batches[other.producer] ?? 0);
      }
      const qty = r.outputs.find((o) => o.commodity === main)?.qty ?? 1;
      next[r.producer] = Math.max(0, (demand[main] ?? 0) - byProduct) / qty;
    }
    batches = next;
    counts = Object.fromEntries(
      recipes.map((r) => [
        r.producer,
        Math.max(g.minProducersPerType, Math.ceil((batches[r.producer] ?? 0) / (r.batchesPerSize * g.averageSize))),
      ]),
    );
  }
  return { demand, batches, counts };
}
