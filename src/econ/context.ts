// Data for the economy tick that does not change after world generation.
// It is not saved; it is made again from the world when needed.
import type { Location, World } from '../core/types';
import type { GameData } from '../data';
import { type Use, dailyUse } from './population';
import { nominalFlowParts, tradesAll } from './markets';

export interface EconContext {
  world: World;
  data: GameData;
  /** Location ids that trade each commodity. */
  traders: Map<string, number[]>;
  producers: Location[];
  tradeHubs: Location[];
  /** Daily use at full supply for each location id, before the security multiplier. */
  uses: Use[][];
  /** Nominal daily need of each market ("locationId:commodity"): population use and recipe inputs. */
  dailyNeed: Map<string, number>;
  /** Jumps between each pair of sectors (shortest path). */
  sectorJumps: number[][];
  /** Sectors on the shortest path from sector a to sector b, both ends included. */
  sectorPaths: number[][][];
}

/** Shortest paths between all sectors (breadth-first search; lower sector ids first). */
function sectorRoutes(world: World): { jumps: number[][]; paths: number[][][] } {
  const n = world.sectors.length;
  const neighbours: number[][] = world.sectors.map(() => []);
  for (const l of world.lanes) {
    neighbours[l.a]?.push(l.b);
    neighbours[l.b]?.push(l.a);
  }
  for (const list of neighbours) list.sort((a, b) => a - b);
  const jumps: number[][] = [];
  const paths: number[][][] = [];
  for (let s = 0; s < n; s++) {
    const prev = new Array<number>(n).fill(-1);
    const dist = new Array<number>(n).fill(Infinity);
    dist[s] = 0;
    const queue = [s];
    while (queue.length > 0) {
      const u = queue.shift() as number;
      for (const v of neighbours[u] ?? []) {
        if (dist[v] !== Infinity) continue;
        dist[v] = (dist[u] as number) + 1;
        prev[v] = u;
        queue.push(v);
      }
    }
    jumps.push(dist);
    paths.push(
      dist.map((d, t) => {
        if (d === Infinity) return [];
        const path = [t];
        for (let v = t; v !== s; v = prev[v] as number) path.push(prev[v] as number);
        return path.reverse();
      }),
    );
  }
  return { jumps, paths };
}

export function createEconContext(world: World, data: GameData): EconContext {
  const traders = new Map<string, number[]>();
  for (const c of data.commodities) traders.set(c.id, world.locations.filter((l) => l.market[c.id]).map((l) => l.id));
  const routes = sectorRoutes(world);
  const uses = world.locations.map((l) => {
    const sector = world.sectors[l.sectorId];
    return sector ? dailyUse(l, sector, data) : [];
  });
  const dailyNeed = new Map<string, number>();
  const addNeed = (id: number, c: string, q: number) => dailyNeed.set(`${id}:${c}`, (dailyNeed.get(`${id}:${c}`) ?? 0) + q);
  for (const l of world.locations) {
    for (const u of uses[l.id] ?? []) addNeed(l.id, u.commodity, u.amount);
    for (const [c, q] of nominalFlowParts(l, world, data).inputs) addNeed(l.id, c, q);
  }
  return {
    world,
    data,
    traders,
    producers: world.locations.filter((l) => l.producer !== null),
    tradeHubs: world.locations.filter((l) => tradesAll(l, data)),
    uses,
    dailyNeed,
    sectorJumps: routes.jumps,
    sectorPaths: routes.paths,
  };
}

const cache = new WeakMap<World, EconContext>();

/** The context of a world. Made once; call `resetEconContext` after the world changes. */
export function econContext(world: World, data: GameData): EconContext {
  let ctx = cache.get(world);
  if (!ctx) {
    ctx = createEconContext(world, data);
    cache.set(world, ctx);
  }
  return ctx;
}

export function resetEconContext(world: World): void {
  cache.delete(world);
}
