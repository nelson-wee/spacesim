// Data for the economy tick that does not change after world generation.
// It is not saved; it is made again from the world when needed.
import type { Location, World } from '../core/types';
import type { GameData } from '../data';
import { type Use, dailyUse } from './population';
import { tradesAll } from './markets';

export interface FlowPair {
  a: number;
  b: number;
  /** κ of the pair (Section 9.7). */
  kappa: number;
}

export interface EconContext {
  world: World;
  data: GameData;
  /** Pairs of locations (same sector or one lane) that both trade the commodity. */
  pairs: Map<string, FlowPair[]>;
  /** Location ids that trade each commodity. */
  traders: Map<string, number[]>;
  producers: Location[];
  tradeHubs: Location[];
  /** Daily use at full supply for each location id, before the security multiplier. */
  uses: Use[][];
}

/** Jumps between two sectors: 0 (same), 1, 2, or 3 (farther). */
function laneDistance(world: World, a: number, b: number): number {
  if (a === b) return 0;
  const linked = (x: number, y: number) => world.lanes.some((l) => (l.a === x && l.b === y) || (l.a === y && l.b === x));
  if (linked(a, b)) return 1;
  return world.sectors.some((s) => linked(a, s.id) && linked(s.id, b)) ? 2 : 3;
}

export function createEconContext(world: World, data: GameData): EconContext {
  const e = data.balance.economy;
  const pairs = new Map<string, FlowPair[]>();
  const traders = new Map<string, number[]>();
  for (const c of data.commodities) {
    const ids = world.locations.filter((l) => l.market[c.id]).map((l) => l.id);
    traders.set(c.id, ids);
    const list: FlowPair[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = world.locations[ids[i] as number] as Location;
        const b = world.locations[ids[j] as number] as Location;
        const d = laneDistance(world, a.sectorId, b.sectorId);
        const scale = e.flowScale[c.id] ?? 1;
        const kappa = (d === 0 ? e.flowSameSector : d === 1 ? e.flowOneLane : d === 2 ? e.flowTwoLanes : 0) * scale;
        if (kappa > 0) list.push({ a: a.id, b: b.id, kappa });
      }
    }
    pairs.set(c.id, list);
  }
  return {
    world,
    data,
    pairs,
    traders,
    producers: world.locations.filter((l) => l.producer !== null),
    tradeHubs: world.locations.filter((l) => tradesAll(l, data)),
    uses: world.locations.map((l) => {
      const sector = world.sectors[l.sectorId];
      return sector ? dailyUse(l, sector, data) : [];
    }),
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
