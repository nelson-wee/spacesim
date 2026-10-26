// World generator (Section 6). M1 has steps 1 to 3. M2 adds steps 4 to 9.
import { Rng } from '../core/rng';
import type { JumpPoint, Lane, Location, Sector, World } from '../core/types';
import type { GameData } from '../data';
import { placeBodies, placeJumpPoints } from './bodies';
import { mapDistance } from './geometry';
import { makeUniqueName } from './names';
import { securityBaseline } from './security';
import { assignDevelopment, buildTopology, findCore, jumpDistances } from './topology';

/**
 * Makes a world from a seed. All random results come from `rng` (the world
 * stream). The same seed and the same data give the same world.
 */
export function generateWorld(seed: number, data: GameData, rng: Rng = Rng.fromSeed(seed, 'world')): World {
  const w = data.balance.world;

  // Step 1: topology.
  const topology = buildTopology(rng, data);
  const usedNames = new Set<string>();

  // Step 2: development and security.
  const core = findCore(topology.positions, data);
  const jumps = jumpDistances(topology.positions.length, topology.lanes, core);
  if (jumps.some((j) => !Number.isFinite(j))) throw new Error('World generator: sectors are not connected');
  const development = assignDevelopment(topology.positions, jumps, core, data);

  const sectors: Sector[] = topology.positions.map((pos, id) => {
    const baseline = securityBaseline(rng, jumps[id] as number, data);
    return {
      id,
      name: makeUniqueName(rng, data, 'sector', usedNames),
      pos,
      star: rng.weighted(data.bodyTypes.stars, (s) => s.weight).id,
      development: development[id] ?? 'frontier',
      jumpsFromCore: jumps[id] as number,
      securityBaseline: baseline,
      securityValue: baseline,
      locationIds: [],
      jumpPointIds: [],
    };
  });

  const lanes: Lane[] = topology.lanes.map(([a, b], id) => ({
    id,
    a,
    b,
    length: mapDistance(sectors[a]!.pos, sectors[b]!.pos, w.cellAspect),
  }));

  // Step 3: bodies and jump points.
  const jumpPoints: JumpPoint[] = [];
  const locations: Location[] = [];
  for (const sector of sectors) {
    const points = placeJumpPoints(sector, lanes, sectors, jumpPoints.length, data);
    jumpPoints.push(...points);
    sector.jumpPointIds = points.map((p) => p.id);
    const bodies = placeBodies(rng, sector, points, locations.length, usedNames, data);
    locations.push(...bodies);
    sector.locationIds = bodies.map((l) => l.id);
  }

  // The start location is in the core sector (Section 11.8). M2 adds the service rule.
  const coreSector = sectors[core] as Sector;
  const startLocationId = rng.pick(coreSector.locationIds);

  return {
    sectors,
    lanes,
    jumpPoints,
    locations,
    coreSectorId: core,
    startLocationId,
    generator: { seedUsed: seed, tries: 1, topologyResamples: topology.resamples },
  };
}
