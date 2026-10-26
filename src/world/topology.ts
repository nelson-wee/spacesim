// Generator step 1 (topology) and the development part of step 2 (Sections 6.3, 6.4).
import type { Rng } from '../core/rng';
import type { Vec } from '../core/types';
import type { Development, GameData } from '../data';
import { mapDistance, segmentsCross } from './geometry';

export interface Topology {
  positions: Vec[];
  lanes: [number, number][];
  resamples: number;
}

/** Poisson-disc style placement by dart throwing. Returns null if the area is too full. */
export function placeSectors(rng: Rng, data: GameData): Vec[] | null {
  const w = data.balance.world;
  const points: Vec[] = [];
  for (let attempt = 0; attempt < w.sectorPlacementAttempts && points.length < w.sectorCount; attempt++) {
    const p = {
      x: rng.int(w.regionMarginX, w.regionWidth - 1 - w.regionMarginX),
      y: rng.int(w.regionMarginY, w.regionHeight - 1 - w.regionMarginY),
    };
    if (points.every((q) => mapDistance(p, q, w.cellAspect) >= w.minSectorDistance)) points.push(p);
  }
  return points.length === w.sectorCount ? points : null;
}

/** Minimum spanning tree (Prim) on map distance. */
export function minimumSpanningTree(points: Vec[], aspect: number): [number, number][] {
  const n = points.length;
  const inTree = new Array<boolean>(n).fill(false);
  const best = new Array<number>(n).fill(Infinity);
  const parent = new Array<number>(n).fill(-1);
  const edges: [number, number][] = [];
  best[0] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u === -1 || (best[i] as number) < (best[u] as number))) u = i;
    inTree[u] = true;
    const pu = parent[u] as number;
    if (pu >= 0) edges.push([pu, u]);
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      const d = mapDistance(points[u] as Vec, points[v] as Vec, aspect);
      if (d < (best[v] as number)) {
        best[v] = d;
        parent[v] = u;
      }
    }
  }
  return edges;
}

function degree(lanes: [number, number][], i: number): number {
  return lanes.filter(([a, b]) => a === i || b === i).length;
}

function linked(lanes: [number, number][], i: number, j: number): boolean {
  return lanes.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
}

/** Step 1.3: for each sector, a lane to its nearest sector that it does not link to yet. */
export function addExtraLanes(points: Vec[], tree: [number, number][], aspect: number, maxLanes: number): [number, number][] {
  const lanes = tree.map(([a, b]) => [a, b] as [number, number]);
  for (let i = 0; i < points.length; i++) {
    let nearest = -1;
    let nearestDist = Infinity;
    for (let j = 0; j < points.length; j++) {
      if (j === i || linked(lanes, i, j)) continue;
      const d = mapDistance(points[i] as Vec, points[j] as Vec, aspect);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = j;
      }
    }
    if (nearest < 0) continue;
    if (degree(lanes, i) >= maxLanes || degree(lanes, nearest) >= maxLanes) continue;
    const a = points[i] as Vec;
    const b = points[nearest] as Vec;
    const crosses = lanes.some(([p, q]) => segmentsCross(a, b, points[p] as Vec, points[q] as Vec));
    if (!crosses) lanes.push([i, nearest]);
  }
  return lanes;
}

/** Steps 1.1 to 1.4. Samples positions again if a sector would have more than the maximum lanes (Q-27). */
export function buildTopology(rng: Rng, data: GameData): Topology {
  const w = data.balance.world;
  for (let resample = 0; resample < w.topologyResamples; resample++) {
    const positions = placeSectors(rng, data);
    if (!positions) continue;
    const tree = minimumSpanningTree(positions, w.cellAspect);
    if (positions.some((_, i) => degree(tree, i) > w.maxLanesPerSector)) continue;
    const lanes = addExtraLanes(positions, tree, w.cellAspect, w.maxLanesPerSector);
    return { positions, lanes, resamples: resample };
  }
  throw new Error('World generator: cannot place sectors and lanes. Check balance.world.');
}

/** Jumps from `start` to each sector (breadth-first search). */
export function jumpDistances(count: number, lanes: [number, number][], start: number): number[] {
  const dist = new Array<number>(count).fill(Infinity);
  dist[start] = 0;
  const queue = [start];
  while (queue.length > 0) {
    const u = queue.shift() as number;
    for (const [a, b] of lanes) {
      const v = a === u ? b : b === u ? a : -1;
      if (v >= 0 && dist[v] === Infinity) {
        dist[v] = (dist[u] as number) + 1;
        queue.push(v);
      }
    }
  }
  return dist;
}

/** The sector nearest to the map center is the core (Section 6.4). */
export function findCore(positions: Vec[], data: GameData): number {
  const w = data.balance.world;
  const center = { x: (w.regionWidth - 1) / 2, y: (w.regionHeight - 1) / 2 };
  let best = 0;
  let bestDist = Infinity;
  positions.forEach((p, i) => {
    const d = mapDistance(p, center, w.cellAspect);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/** Development level by jumps from the core, then the fix in Section 6.4 step 3. */
export function assignDevelopment(
  positions: Vec[],
  jumps: number[],
  core: number,
  data: GameData,
): Development[] {
  const w = data.balance.world;
  const levels: Development[] = jumps.map((j) =>
    j <= w.coreMaxJumps ? 'core' : j <= w.middleMaxJumps ? 'middle' : 'frontier',
  );
  // Farthest first: most jumps, then largest map distance from the core.
  const corePos = positions[core] as Vec;
  const byDistance = positions
    .map((p, i) => ({ i, jumps: jumps[i] as number, dist: mapDistance(p, corePos, w.cellAspect) }))
    .filter((s) => s.i !== core)
    .sort((a, b) => b.jumps - a.jumps || b.dist - a.dist || a.i - b.i);
  const changed = new Set<number>();
  if (!levels.includes('frontier')) {
    const s = byDistance[0];
    if (s) {
      levels[s.i] = 'frontier';
      changed.add(s.i);
    }
  }
  if (!levels.includes('middle')) {
    // Do not take the last Frontier sector.
    const frontierCount = levels.filter((l) => l === 'frontier').length;
    const s =
      byDistance.find((c) => !changed.has(c.i) && levels[c.i] !== 'frontier') ??
      (frontierCount > 1 ? byDistance.find((c) => !changed.has(c.i)) : undefined);
    if (s) levels[s.i] = 'middle';
  }
  return levels;
}
