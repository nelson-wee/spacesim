// World generator (Section 6): constructive first, then repair, then reject.
import { Rng } from '../core/rng';
import type { JumpPoint, Lane, Location, Sector, World } from '../core/types';
import type { GameData } from '../data';
import { kRef } from '../econ/capital';
import { resetEconContext } from '../econ/context';
import { createEconomyState } from '../econ/economy';
import { initMarkets } from '../econ/markets';
import { recipeOf } from '../econ/recipes';
import { assignProducers, balanceSizes, ensurePlanetHosts, ensureSupplyPaths, fillStations, setPopulation } from './assign';
import { placeBodies, placeJumpPoints } from './bodies';
import { computeBlueprint } from './blueprint';
import { mapDistance } from './geometry';
import { makeUniqueName } from './names';
import { hasService, placeServices, setTechLevels } from './placeServices';
import { repairWorld } from './repair';
import { securityBaseline } from './security';
import { assignDevelopment, buildTopology, findCore, jumpDistances } from './topology';
import { type RuleResult, validateEconomy, validateRules } from './validate';

/** Steps 1 to 3: topology, development and security, bodies. */
function buildBase(seed: number, rng: Rng, data: GameData): World {
  const w = data.balance.world;
  const topology = buildTopology(rng, data);
  const usedNames = new Set<string>();
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
    length: mapDistance((sectors[a] as Sector).pos, (sectors[b] as Sector).pos, w.cellAspect),
  }));
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
  const coreSector = sectors[core] as Sector;
  return {
    sectors,
    lanes,
    jumpPoints,
    locations,
    coreSectorId: core,
    startLocationId: rng.pick(coreSector.locationIds),
    economy: createEconomyState(data),
    generator: { seedUsed: seed, tries: 1, repairs: 0, topologyResamples: topology.resamples, rules: {} },
  };
}

/** The start location: in the core sector, with an Outfitter and a Merchants' Guild (Section 6.10). */
function chooseStart(world: World, rng: Rng): void {
  const core = world.sectors[world.coreSectorId] as Sector;
  const options = core.locationIds
    .map((id) => world.locations[id] as Location)
    .filter((l) => hasService(l, 'outfitter') && hasService(l, 'merchants_guild'));
  if (options.length === 0) return;
  const score = (l: Location) => (l.kind === 'planet' ? 2 : 0) + l.techLevel;
  const top = Math.max(...options.map(score));
  world.startLocationId = rng.pick(options.filter((l) => score(l) === top)).id;
}

/** Population, tech, services, start, markets, and K = K_ref. Run after each change. */
function finishWorld(world: World, rng: Rng, data: GameData, keepStart: boolean): void {
  setPopulation(world, data);
  setTechLevels(world, data);
  placeServices(world, data);
  if (!keepStart) chooseStart(world, rng);
  initMarkets(world, data);
  for (const loc of world.locations) {
    loc.production = null;
    loc.installedMachinery = loc.producer ? kRef(loc, recipeOf(data, loc.producer)) : 0;
  }
  world.economy = createEconomyState(data);
  resetEconContext(world);
}

export interface GenerationAttempt {
  seed: number;
  repairs: string[];
  rules: RuleResult[];
  pass: boolean;
}

export interface GenerationResult {
  world: World;
  attempts: GenerationAttempt[];
}

/** No valid world after the maximum tries. Keeps the log of all tries. */
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly attempts: GenerationAttempt[],
    readonly lastWorld: World | null,
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

/**
 * Makes a world from a seed, with the full log of tries and repairs.
 * Steps 4 to 9 (Sections 6.6 to 6.11). If a world fails its rules after the
 * maximum repairs, the generator starts again with seed + 1. A world that
 * passes keeps the market state of its validation run (warm start).
 */
export function generateWorldWithLog(seed: number, data: GameData, firstRng?: Rng): GenerationResult {
  const g = data.balance.generator;
  const attempts: GenerationAttempt[] = [];
  let lastWorld: World | null = null;
  for (let tryNo = 0; tryNo < g.maxTries; tryNo++) {
    const trySeed = (seed + tryNo) >>> 0;
    const rng = tryNo === 0 && firstRng ? firstRng : Rng.fromSeed(trySeed, 'world');
    const world = buildBase(trySeed, rng, data);
    lastWorld = world;
    // Steps 4 to 7.
    let blueprint = computeBlueprint(world, data);
    if (ensurePlanetHosts(world, blueprint, rng, data).length > 0) blueprint = computeBlueprint(world, data);
    const unplaced = assignProducers(world, blueprint, rng, data);
    let pathMissing = ensureSupplyPaths(world, data);
    fillStations(world, rng, data);
    setTechLevels(world, data);
    balanceSizes(world, rng, data);
    finishWorld(world, rng, data, false);

    const attempt: GenerationAttempt = { seed: trySeed, repairs: [], rules: [], pass: false };
    attempts.push(attempt);
    for (;;) {
      // Step 8: structure rules, then the short economy run.
      let rules = validateRules(world, data, attempt.repairs.length === 0 ? unplaced : [], pathMissing);
      if (rules.every((r) => r.pass)) rules = [...rules, ...validateEconomy(world, data, trySeed).results];
      attempt.rules = rules;
      if (rules.every((r) => r.pass)) {
        attempt.pass = true;
        world.generator = {
          seedUsed: trySeed,
          tries: tryNo + 1,
          repairs: attempt.repairs.length,
          topologyResamples: world.generator.topologyResamples,
          rules: Object.fromEntries(rules.map((r) => [r.id, r.pass])),
        };
        return { world, attempts };
      }
      // Step 9: repair, or reject.
      if (attempt.repairs.length >= g.maxRepairs) break;
      const done = repairWorld(world, rules, rng, data);
      if (!done) break;
      attempt.repairs.push(done);
      pathMissing = ensureSupplyPaths(world, data);
      fillStations(world, rng, data);
      setTechLevels(world, data);
      balanceSizes(world, rng, data, false);
      finishWorld(world, rng, data, rules.find((r) => r.id === 'start')?.pass === false);
    }
  }
  const last = attempts[attempts.length - 1];
  const failing = last?.rules.filter((r) => !r.pass).map((r) => `${r.id}: ${r.detail}`) ?? [];
  throw new GenerationError(
    `World generator: no valid world after ${g.maxTries} tries from seed ${seed}. Last failures: ${failing.join(' | ')}`,
    attempts,
    lastWorld,
  );
}

/** Makes a world from a seed. The same seed and data give the same world. */
export function generateWorld(seed: number, data: GameData, rng?: Rng): World {
  return generateWorldWithLog(seed, data, rng).world;
}
