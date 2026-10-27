// Paths between locations across sectors (Sections 8.2, 8.3). A path is a list
// of steps: travel in a sector to a jump point, jump, ..., travel to the
// destination location. The fastest path counts sector distance / cruiseFactor
// plus lane length / jumpFactor (the fleet `move` is the same on all steps).
// Paths use only sectors, lanes, and jump points, which the player knows from
// the start (Section 9.12). The route planner and the trader bot use them.
import type { Game } from '../core/game';
import type { Actor, Location, Ship, Vec, World } from '../core/types';
import type { GameData } from '../data';
import { travelStats } from '../ship/stats';
import { mapDistance } from '../world/geometry';
import { addCargo } from './cargo';
import { massFactor } from './fuel';
import { observe } from './knowledge';
import { type Destination, travelInSector, jump, type TripOutcome } from './travel';

export type PathStep = { kind: 'go'; dest: Destination } | { kind: 'jump'; jumpPointId: number };

export interface Path {
  steps: PathStep[];
  /** Total distance in sectors and in lanes. */
  sectorDistance: number;
  laneDistance: number;
  jumps: number;
  /** Gravity of the destination (dock fuel). */
  gravity: number;
}

interface Tree {
  /** Best cost to stand at each jump point after a jump into its sector; -1 prev = from the start. */
  cost: number[];
  sector: number[];
  lane: number[];
  /** Jump point that the fleet jumped from to arrive at this jump point. */
  via: number[];
  /** Arrival jump point before `via`, or -1 for the start location. */
  prev: number[];
}

const trees = new WeakMap<World, Map<number, Tree>>();

/** The jump point at the other end of a jump point's lane. */
function partner(world: World, jpId: number): number {
  const jp = world.jumpPoints[jpId];
  if (!jp) throw new Error(`Unknown jump point ${jpId}`);
  const other = world.jumpPoints.find((j) => j.laneId === jp.laneId && j.id !== jp.id);
  if (!other) throw new Error(`Lane ${jp.laneId} has one jump point`);
  return other.id;
}

function buildTree(world: World, data: GameData, start: Location): Tree {
  const t = data.balance.travel;
  const aspect = data.balance.world.cellAspect;
  const n = world.jumpPoints.length;
  const tree: Tree = {
    cost: new Array<number>(n).fill(Infinity),
    sector: new Array<number>(n).fill(0),
    lane: new Array<number>(n).fill(0),
    via: new Array<number>(n).fill(-1),
    prev: new Array<number>(n).fill(-1),
  };
  const done = new Array<boolean>(n).fill(false);
  const relax = (fromCost: number, fromSector: number, fromLane: number, fromPos: Vec, sectorId: number, prevArrival: number) => {
    for (const jpId of world.sectors[sectorId]?.jumpPointIds ?? []) {
      const jp = world.jumpPoints[jpId];
      if (!jp) continue;
      const d = mapDistance(fromPos, jp.pos, aspect);
      const laneLength = world.lanes[jp.laneId]?.length ?? 0;
      const arrive = partner(world, jpId);
      const cost = fromCost + d / t.cruiseFactor + laneLength / t.jumpFactor;
      if (cost < (tree.cost[arrive] as number) - 1e-12) {
        tree.cost[arrive] = cost;
        tree.sector[arrive] = fromSector + d;
        tree.lane[arrive] = fromLane + laneLength;
        tree.via[arrive] = jpId;
        tree.prev[arrive] = prevArrival;
      }
    }
  };
  relax(0, 0, 0, start.pos, start.sectorId, -1);
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (tree.cost[i] as number) < Infinity && (u < 0 || (tree.cost[i] as number) < (tree.cost[u] as number))) u = i;
    if (u < 0) break;
    done[u] = true;
    const jp = world.jumpPoints[u];
    if (!jp) continue;
    relax(tree.cost[u] as number, tree.sector[u] as number, tree.lane[u] as number, jp.pos, jp.sectorId, u);
  }
  return tree;
}

function treeFrom(world: World, data: GameData, start: Location): Tree {
  let byStart = trees.get(world);
  if (!byStart) {
    byStart = new Map();
    trees.set(world, byStart);
  }
  let tree = byStart.get(start.id);
  if (!tree) {
    tree = buildTree(world, data, start);
    byStart.set(start.id, tree);
  }
  return tree;
}

/** The fastest path from one location to another, or null if there is none. */
export function pathBetween(world: World, data: GameData, from: Location, to: Location): Path | null {
  const t = data.balance.travel;
  const aspect = data.balance.world.cellAspect;
  if (from.id === to.id) return { steps: [], sectorDistance: 0, laneDistance: 0, jumps: 0, gravity: to.gravity };
  let best = Infinity;
  let bestArrival = -1;
  let bestSector = 0;
  let bestLane = 0;
  if (from.sectorId === to.sectorId) {
    const d = mapDistance(from.pos, to.pos, aspect);
    best = d / t.cruiseFactor;
    bestSector = d;
  }
  const tree = treeFrom(world, data, from);
  for (const jpId of world.sectors[to.sectorId]?.jumpPointIds ?? []) {
    const jp = world.jumpPoints[jpId];
    if (!jp || (tree.cost[jpId] as number) === Infinity) continue;
    const d = mapDistance(jp.pos, to.pos, aspect);
    const cost = (tree.cost[jpId] as number) + d / t.cruiseFactor;
    if (cost < best - 1e-12) {
      best = cost;
      bestArrival = jpId;
      bestSector = (tree.sector[jpId] as number) + d;
      bestLane = tree.lane[jpId] as number;
    }
  }
  if (best === Infinity) return null;
  const steps: PathStep[] = [{ kind: 'go', dest: { kind: 'location', locationId: to.id } }];
  let jumps = 0;
  for (let a = bestArrival; a >= 0; a = tree.prev[a] as number) {
    const via = tree.via[a] as number;
    steps.unshift({ kind: 'jump', jumpPointId: via });
    steps.unshift({ kind: 'go', dest: { kind: 'jumpPoint', jumpPointId: via } });
    jumps++;
  }
  return { steps, sectorDistance: bestSector, laneDistance: bestLane, jumps, gravity: to.gravity };
}

export interface TripEstimate {
  days: number;
  /** Fuel that each ship needs. */
  fuel: number[];
  totalFuel: number;
  /** True if each ship has sufficient fuel now. */
  enoughFuel: boolean;
}

/** Days and fuel of a path for a fleet (ships with their cargo). */
export function estimatePath(path: Path, fleet: Ship[], data: GameData): TripEstimate {
  const t = data.balance.travel;
  const stats = fleet.map((s) => travelStats(s, data));
  const move = stats.reduce((m, s) => Math.min(m, s.move), Infinity);
  const days = move > 0 && move < Infinity ? path.sectorDistance / (t.cruiseFactor * move) + path.laneDistance / (t.jumpFactor * move) : Infinity;
  const fuel = stats.map(
    (s) => massFactor(s.mass, data) * (s.engineFuelRate * (path.sectorDistance * t.kSector + path.laneDistance * t.kJump) + path.gravity * t.kDock),
  );
  return { days, fuel, totalFuel: fuel.reduce((a, b) => a + b, 0), enoughFuel: fuel.every((f, i) => (fleet[i]?.fuel ?? 0) >= f - 1e-9) };
}

/** A copy of the fleet with extra cargo, loaded in the Section 11.9 order. */
export function fleetWithCargo(actor: Actor, data: GameData, commodity: string, units: number): Ship[] {
  const copy: Actor = { ...actor, fleet: structuredClone(actor.fleet) };
  if (units > 0) addCargo(copy, data, commodity, units, 0);
  return copy.fleet;
}

/**
 * Follows a path step by step. Stops at the first step that does not arrive
 * (a tow or a refusal). `stopAfterJumpInto` stops after the jump into that
 * sector (exploration: the locations of a new sector become known there).
 */
export function followPath(game: Game, actor: Actor, path: Path, stopAfterJumpInto?: number): TripOutcome {
  let days = 0;
  for (const step of path.steps) {
    const out = step.kind === 'go' ? travelInSector(game, actor, step.dest) : jump(game, actor);
    if (out.result !== 'arrived') return out;
    days += out.days;
    if (step.kind === 'jump' && stopAfterJumpInto !== undefined) {
      const jp = game.state.world.jumpPoints[step.jumpPointId];
      if (jp?.toSectorId === stopAfterJumpInto) break;
    }
  }
  observe(game, actor);
  return { result: 'arrived', days };
}
