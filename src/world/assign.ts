// Generator steps 5 and 6 (Sections 6.7, 6.8): producers, population, other
// station types, and sizes.
import type { Rng } from '../core/rng';
import type { Location, Sector, World } from '../core/types';
import type { GameData, ProducerType, StationType } from '../data';
import { capitalFactor, kRef, nominalBatches } from '../econ/capital';
import { dailyUse, hasResidentPopulation, populationFor } from '../econ/population';
import { tradedCommodities } from '../econ/markets';
import { recipeOf } from '../econ/recipes';
import { type Blueprint, mainProduct } from './blueprint';
import { securityLevelInfo } from './security';

const SLOT = 'station_slot';

function producerType(data: GameData, id: string): ProducerType {
  const p = data.producerTypes.find((t) => t.id === id);
  if (!p) throw new Error(`Unknown producer type ${id}`);
  return p;
}

function sectorOf(world: World, loc: Location): Sector {
  const s = world.sectors[loc.sectorId];
  if (!s) throw new Error(`Location ${loc.id} has no sector`);
  return s;
}

/** Station types that may stand in this sector (development and baseline security, Section 7.2). */
export function stationAllowed(type: StationType, sector: Sector): boolean {
  if (!type.development.includes(sector.development)) return false;
  if (type.minBaselineSecurity !== undefined && sector.securityBaseline < type.minBaselineSecurity) return false;
  if (type.maxBaselineSecurity !== undefined && sector.securityBaseline > type.maxBaselineSecurity) return false;
  return true;
}

/**
 * The body type that a producer gives to a location, or null if the location
 * cannot host it. A free station slot becomes the station type in the host list.
 */
export function hostBodyType(loc: Location, sector: Sector, p: ProducerType, data: GameData): string | null {
  if (loc.producer !== null) return null;
  if (!p.development.includes(sector.development)) return null;
  if (loc.kind === 'planet') return p.hosts.includes(loc.bodyType) ? loc.bodyType : null;
  if (loc.bodyType !== SLOT) return null;
  for (const host of p.hosts) {
    const type = data.stationTypeById.get(host);
    if (type && stationAllowed(type, sector)) return host;
  }
  return null;
}

export function producersOf(world: World, producer: string): Location[] {
  return world.locations.filter((l) => l.producer === producer);
}

/** Producers that use a commodity as a hard input, and producers that make it. */
function chainNeighbours(data: GameData, producer: string): Set<string> {
  const r = recipeOf(data, producer);
  const result = new Set<string>();
  for (const other of data.recipes.recipes) {
    if (other.producer === producer) continue;
    const makesMyInput = other.outputs.some((o) => r.inputs.some((i) => i.commodity === o.commodity));
    const usesMyOutput = other.inputs.some((i) => r.outputs.some((o) => o.commodity === i.commodity));
    if (makesMyInput || usesMyOutput) result.add(other.producer);
  }
  return result;
}

/**
 * Host planets (DECISIONS.md, M2): a producer that may stand only on planets
 * (for example the Gas Skimmer) needs a host body for each producer in the
 * blueprint. If there are too few, change donor planets to a host type. A
 * donor has no resident population, and each producer that it can host can
 * also use a station. Prefers sectors with no host yet. Returns the changes.
 */
export function ensurePlanetHosts(world: World, blueprint: Blueprint, rng: Rng, data: GameData): string[] {
  const changes: string[] = [];
  const planetIds = new Set(data.bodyTypes.planets.map((t) => t.id));
  const planetOnly = (p: ProducerType) => p.hosts.every((h) => planetIds.has(h));
  const donorTypes = new Set(
    data.bodyTypes.planets
      .map((t) => t.id)
      .filter(
        (id) =>
          !hasResidentPopulation(id) &&
          data.producerTypes.every((p) => !p.hosts.includes(id) || !planetOnly(p)),
      ),
  );
  for (const p of data.producerTypes.filter(planetOnly)) {
    const need = blueprint.counts[p.id] ?? 0;
    const allowed = (l: Location) => l.kind === 'planet' && p.development.includes(sectorOf(world, l).development);
    let hosts = world.locations.filter((l) => allowed(l) && p.hosts.includes(l.bodyType));
    while (hosts.length < need) {
      const donors = world.locations.filter((l) => allowed(l) && donorTypes.has(l.bodyType));
      if (donors.length === 0) break;
      const hostSectors = new Set(hosts.map((l) => l.sectorId));
      let pick = donors[0] as Location;
      let top = -Infinity;
      for (const d of donors) {
        const score = rng.range(0, 0.5) + (hostSectors.has(d.sectorId) ? 0 : 2);
        if (score > top) {
          top = score;
          pick = d;
        }
      }
      const type = p.hosts[0] as string;
      changes.push(`${pick.name}: ${pick.bodyType} to ${type}`);
      pick.bodyType = type;
      pick.gravity = data.planetTypeById.get(type)?.gravity ?? 0;
      hosts = [...hosts, pick];
    }
  }
  return changes;
}

/**
 * Puts one producer on the best free body (Section 6.7 steps 2 and 3).
 * Prefers a sector with no producer of this type, then a sector with no
 * producer of a chain neighbour, then planets over station slots.
 * Returns the location, or null if no body can host it.
 */
export function placeProducer(
  world: World,
  producer: string,
  rng: Rng,
  data: GameData,
  prefer?: (loc: Location) => number,
): Location | null {
  const p = producerType(data, producer);
  const neighbours = chainNeighbours(data, producer);
  let best: Location | null = null;
  let bestType = '';
  let bestScore = -Infinity;
  for (const loc of world.locations) {
    const sector = sectorOf(world, loc);
    const type = hostBodyType(loc, sector, p, data);
    if (!type) continue;
    const inSector = sector.locationIds.map((id) => world.locations[id] as Location);
    let score = rng.range(0, 0.5);
    if (!inSector.some((l) => l.producer === producer)) score += 4;
    if (!inSector.some((l) => l.producer !== null && neighbours.has(l.producer))) score += 2;
    // Background flow moves goods one lane at a time: a chain neighbour one lane away is good.
    const adjacent = world.lanes
      .map((l) => (l.a === sector.id ? l.b : l.b === sector.id ? l.a : -1))
      .filter((v) => v >= 0)
      .flatMap((sid) => (world.sectors[sid] as Sector).locationIds.map((id) => world.locations[id] as Location));
    if (adjacent.some((l) => l.producer !== null && neighbours.has(l.producer))) score += 3;
    if (loc.kind === 'station') score -= 1;
    if (prefer) score += prefer(loc);
    // A Frontier sector that touches no Middle or Core sector can send goods out only through
    // other Frontier sectors, which cannot have Trade Hubs.
    if (sector.development === 'frontier') {
      const touchesHubZone = world.lanes.some((l) => {
        const other = l.a === sector.id ? l.b : l.b === sector.id ? l.a : -1;
        return other >= 0 && (world.sectors[other] as Sector).development !== 'frontier';
      });
      if (!touchesHubZone) score -= 6;
    }
    // Keep the last station slot of a Middle or Core sector for a relay Trade Hub.
    if (loc.kind === 'station' && sector.development !== 'frontier') {
      const free = inSector.filter((l) => l.kind === 'station' && l.bodyType === SLOT && l.producer === null).length;
      if (free <= 1) score -= 20;
    }
    if (score > bestScore) {
      best = loc;
      bestType = type;
      bestScore = score;
    }
  }
  if (!best) return null;
  best.producer = producer;
  best.bodyType = bestType;
  return best;
}

/** Number of free bodies that can host each producer type. */
function hostCount(world: World, p: ProducerType, data: GameData): number {
  return world.locations.filter((l) => hostBodyType(l, sectorOf(world, l), p, data) !== null).length;
}

/**
 * Step 5: places the producers of the blueprint, from the rarest type (fewest
 * hosts) to the most common. Returns the producers that found no body.
 */
export function assignProducers(world: World, blueprint: Blueprint, rng: Rng, data: GameData): string[] {
  const order = data.producerTypes
    .map((p) => ({ p, hosts: hostCount(world, p, data) }))
    .sort((a, b) => a.hosts - b.hosts || (blueprint.counts[b.p.id] ?? 0) - (blueprint.counts[a.p.id] ?? 0) || a.p.id.localeCompare(b.p.id));
  const unplaced: string[] = [];
  for (const { p } of order) {
    for (let i = 0; i < (blueprint.counts[p.id] ?? 0); i++) {
      if (!placeProducer(world, p.id, rng, data)) unplaced.push(p.id);
    }
  }
  return unplaced;
}

/** Free station slots in a sector, where a station type may stand. */
function freeSlots(world: World, sector: Sector, type: StationType): Location[] {
  if (!stationAllowed(type, sector)) return [];
  return sector.locationIds
    .map((id) => world.locations[id] as Location)
    .filter((l) => l.kind === 'station' && l.bodyType === SLOT);
}

/** Free station slots, then Habitats (filler that a relay may replace). */
function relaySlots(world: World, sector: Sector, type: StationType): Location[] {
  if (!stationAllowed(type, sector)) return [];
  const locs = sector.locationIds.map((id) => world.locations[id] as Location);
  return [
    ...locs.filter((l) => l.kind === 'station' && l.bodyType === SLOT),
    ...locs.filter((l) => l.bodyType === 'habitat' && l.producer === null),
  ];
}

function setStation(loc: Location, typeId: string): void {
  loc.bodyType = typeId;
}

function stationType(data: GameData, id: string): StationType {
  const t = data.stationTypeById.get(id);
  if (!t) throw new Error(`Unknown station type ${id}`);
  return t;
}

/** Jumps between all sectors (breadth-first search from each sector). */
export function sectorJumps(world: World): number[][] {
  const n = world.sectors.length;
  return world.sectors.map((s) => {
    const dist = new Array<number>(n).fill(Infinity);
    dist[s.id] = 0;
    const queue = [s.id];
    while (queue.length > 0) {
      const u = queue.shift() as number;
      for (const l of world.lanes) {
        const v = l.a === u ? l.b : l.b === u ? l.a : -1;
        if (v >= 0 && dist[v] === Infinity) {
          dist[v] = (dist[u] as number) + 1;
          queue.push(v);
        }
      }
    }
    return dist;
  });
}

/**
 * Supply paths (DECISIONS.md, M2). Background flow moves goods only one lane a
 * day, so each producer needs a chain of relay sectors to its inputs and to the
 * users of its outputs. A relay sector has a Trade Hub (it trades all
 * commodities), a maker or user of the commodity, or a location that trades
 * it as a relay commodity. The search goes only through sectors that have a
 * relay or can get one: a Trade Hub (Middle or Core, with a free station slot
 * or a Habitat), else a relay commodity at a location with fewer than the
 * maximum commodities. Adds the relays that the paths need. Returns the paths
 * that are still missing ("commodity@location").
 */
export function ensureSupplyPaths(world: World, data: GameData): string[] {
  const hubType = stationType(data, 'trade_hub');
  const max = data.balance.economy.maxCommodities;
  const missing: string[] = [];
  const populationGoods = new Set(data.population.use.map((u) => u.commodity));
  for (const l of world.locations) l.relays = {};
  const neighbours = (sid: number) =>
    world.lanes.map((l) => (l.a === sid ? l.b : l.b === sid ? l.a : -1)).filter((v) => v >= 0).sort((a, b) => a - b);
  const makes = (l: Location, c: string) => l.producer !== null && recipeOf(data, l.producer).outputs.some((o) => o.commodity === c);
  const uses = (l: Location, c: string) =>
    (l.producer !== null &&
      (recipeOf(data, l.producer).inputs.some((i) => i.commodity === c) || recipeOf(data, l.producer).softInput === c)) ||
    (data.population.stationUse[l.bodyType] ?? []).some((u) => u.commodity === c);
  const locsOf = (sid: number) => (world.sectors[sid] as Sector).locationIds.map((id) => world.locations[id] as Location);
  /** Locations that can take one more commodity as a relay, fewest commodities first. */
  const relayHosts = (sid: number) =>
    locsOf(sid)
      .filter((l) => l.bodyType !== SLOT && l.bodyType !== 'trade_hub')
      .map((l) => ({ l, n: tradedCommodities(l, world, data).length }))
      .filter((x) => x.n < max)
      .sort((a, b) => a.n - b.n || a.l.id - b.l.id)
      .map((x) => x.l);

  /** Connects a location to the nearest sector in `targets`; adds relays that carry `daily`. */
  const connect = (from: Location, c: string, targets: Set<number>, daily: number): void => {
    if (targets.size === 0) {
      missing.push(`${c}@${from.id}`);
      return;
    }
    // A relay passes on its stock above half target. The economy check (low output) catches weak relays.
    const relayAt = (sid: number) =>
      locsOf(sid).find((l) => l.bodyType === 'trade_hub' || makes(l, c) || uses(l, c) || l.relays[c] !== undefined);
    const canRelay = (sid: number) =>
      relayAt(sid) !== undefined ||
      relaySlots(world, world.sectors[sid] as Sector, hubType).length > 0 ||
      relayHosts(sid).length > 0;
    // Breadth-first search. A target sector next to a reached sector ends the search.
    const prev = new Map<number, number>([[from.sectorId, -1]]);
    const queue = [from.sectorId];
    let found = targets.has(from.sectorId) ? from.sectorId : -1;
    while (found < 0 && queue.length > 0) {
      const u = queue.shift() as number;
      for (const v of neighbours(u)) {
        if (prev.has(v)) continue;
        if (targets.has(v)) {
          prev.set(v, u);
          found = v;
          break;
        }
        if (!canRelay(v)) continue;
        prev.set(v, u);
        queue.push(v);
      }
    }
    if (found < 0) {
      missing.push(`${c}@${from.id}`);
      return;
    }
    for (let sid = prev.get(found) ?? -1; sid >= 0 && sid !== from.sectorId; sid = prev.get(sid) ?? -1) {
      const relay = relayAt(sid);
      if (relay) {
        if (relay.relays[c] !== undefined) relay.relays[c] += daily;
        continue;
      }
      const slot = relaySlots(world, world.sectors[sid] as Sector, hubType)[0];
      if (slot) {
        setStation(slot, 'trade_hub');
        continue;
      }
      const host = relayHosts(sid)[0];
      if (host) host.relays[c] = daily;
      else missing.push(`${c}@${from.id}`);
    }
  };

  for (const loc of world.locations) {
    if (!loc.producer) continue;
    const recipe = recipeOf(data, loc.producer);
    const batches = nominalBatches(loc, recipe);
    for (const input of recipe.inputs) {
      const makers = world.locations.filter((l) => makes(l, input.commodity));
      connect(loc, input.commodity, new Set(makers.map((l) => l.sectorId)), input.qty * batches);
    }
    for (const output of recipe.outputs) {
      if (populationGoods.has(output.commodity)) continue;
      const users = world.locations.filter((l) => l.id !== loc.id && uses(l, output.commodity));
      connect(loc, output.commodity, new Set(users.map((l) => l.sectorId)), output.qty * batches);
    }
  }
  return missing;
}

/** Shipyards: Shipyard Stations, and Terran planets with tech level 3 (Section 7.4). */
function shipyardCount(world: World, data: GameData): { total: number; tech3: number } {
  let total = 0;
  let tech3 = 0;
  for (const l of world.locations) {
    const bonus = data.stationTypeById.get(l.bodyType)?.techBonus ?? 0;
    const tech = Math.min(3, l.techLevel + bonus);
    if (l.bodyType === 'shipyard_station' || (l.bodyType === 'terran' && tech >= 3)) {
      total++;
      if (tech >= 3) tech3++;
    }
  }
  return { total, tech3 };
}

/**
 * Step 5.5: fills the free station slots: Trade Hubs (at least the minimum),
 * Shipyard Stations (if the region has too few shipyards), Military Outposts,
 * Pirate Havens, and then Habitats or Trade Hubs.
 */
export function fillStations(world: World, rng: Rng, data: GameData): void {
  const f = data.balance.generator.fill;
  const place = (typeId: string, count: number, prefer?: (s: Sector) => number): number => {
    const type = stationType(data, typeId);
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const options = world.sectors.flatMap((s) => freeSlots(world, s, type).map((l) => ({ l, s })));
      if (options.length === 0) break;
      // Prefer sectors with no station of this type yet.
      const scored = options.map((o) => ({
        ...o,
        score:
          rng.range(0, 1) +
          (o.s.locationIds.some((id) => world.locations[id]?.bodyType === typeId) ? 0 : 3) +
          (prefer ? prefer(o.s) : 0),
      }));
      const pick = scored.reduce((a, b) => (b.score > a.score ? b : a));
      setStation(pick.l, typeId);
      placed++;
    }
    return placed;
  };
  const hubs = world.locations.filter((l) => l.bodyType === 'trade_hub').length;
  place('trade_hub', Math.max(0, f.minTradeHubs - hubs));
  const yards = shipyardCount(world, data);
  const needYards = Math.max(f.minShipyards - yards.total, yards.tech3 === 0 ? 1 : 0);
  place('shipyard_station', needYards, (s) => (s.development === 'core' ? 2 : 0));
  place('military_outpost', f.militaryOutposts);
  place('pirate_haven', f.pirateHavens);
  // The rest: Habitats or Trade Hubs, by weight.
  for (const loc of world.locations) {
    if (loc.kind !== 'station' || loc.bodyType !== SLOT) continue;
    const sector = sectorOf(world, loc);
    const hubOk = stationAllowed(stationType(data, 'trade_hub'), sector);
    const hubWeight = hubOk ? f.tradeHubWeight : 0;
    setStation(loc, rng.chance(hubWeight / (hubWeight + f.habitatWeight)) ? 'trade_hub' : 'habitat');
  }
}

/** Population from body type and size (Section 9.4). */
export function setPopulation(world: World, data: GameData): void {
  for (const loc of world.locations) loc.population = populationFor(loc.bodyType, loc.size, data);
}

export interface SupplyDemand {
  supply: Record<string, number>;
  demand: Record<string, number>;
}

/**
 * Nominal region supply and demand per day (Q-06, generator): producers at
 * full inputs and K = K_ref; population and inputs at full supply; the
 * economy multiplier of the baseline security level; Machinery wear.
 */
export function nominalSupplyDemand(world: World, data: GameData): SupplyDemand {
  const supply: Record<string, number> = {};
  const demand: Record<string, number> = {};
  const add = (m: Record<string, number>, c: string, q: number) => (m[c] = (m[c] ?? 0) + q);
  for (const loc of world.locations) {
    const sector = sectorOf(world, loc);
    const mult = securityLevelInfo(sector.securityBaseline, data).economyMult;
    for (const u of dailyUse(loc, sector, data)) add(demand, u.commodity, u.amount * mult);
    if (!loc.producer) continue;
    const r = recipeOf(data, loc.producer);
    const ref = kRef(loc, r);
    const batches = nominalBatches(loc, r) * capitalFactor(ref, ref) * mult;
    for (const o of r.outputs) add(supply, o.commodity, o.qty * batches);
    for (const i of r.inputs) add(demand, i.commodity, i.qty * batches);
    add(demand, r.softInput, data.recipes.capital.machineryWear * ref);
  }
  return { supply, demand };
}

/**
 * True if the generator cannot make the supply of a commodity smaller: its
 * main makers are at the minimum size and the minimum count (DECISIONS.md, M2:
 * the minimum producer count wins over the ratio; by-products and off-map
 * export do the rest).
 */
export function supplyAtFloor(world: World, data: GameData, commodity: string): boolean {
  const g = data.balance.generator;
  const main = world.locations.filter((l) => l.producer !== null && mainProduct(recipeOf(data, l.producer), data) === commodity);
  return main.length > 0 && main.length <= g.minProducersPerType && main.every((l) => l.size <= g.sizeMin);
}

export function supplyRatios(world: World, data: GameData): Record<string, number> {
  const { supply, demand } = nominalSupplyDemand(world, data);
  const ratios: Record<string, number> = {};
  for (const c of data.commodities) {
    const d = demand[c.id] ?? 0;
    ratios[c.id] = d > 0 ? (supply[c.id] ?? 0) / d : Infinity;
  }
  return ratios;
}

/**
 * Step 6: start all sizes at the default; then, for each commodity outside the
 * ratio limits, change the size of one of its producers. Repeat until all
 * ratios are inside the limits, or for the maximum passes.
 */
export function balanceSizes(world: World, rng: Rng, data: GameData, reset = true): void {
  const g = data.balance.generator;
  if (reset) for (const loc of world.locations) loc.size = data.balance.world.defaultLocationSize;
  setPopulation(world, data);
  for (let pass = 0; pass < g.sizePasses; pass++) {
    const ratios = supplyRatios(world, data);
    let changed = false;
    for (const c of data.commodities) {
      const ratio = ratios[c.id] ?? 1;
      if (ratio >= g.ratioLow && ratio <= g.ratioHigh) continue;
      const makers = world.locations.filter(
        (l) => l.producer !== null && recipeOf(data, l.producer).outputs.some((o) => o.commodity === c.id),
      );
      const canChange = (l: Location) => (ratio < g.ratioLow ? l.size < g.sizeMax : l.size > g.sizeMin);
      // Change the main makers first (Gas Skimmers for Hydrogen), so a by-product does not move.
      const main = makers.filter((l) => mainProduct(recipeOf(data, l.producer as string), data) === c.id && canChange(l));
      const options = main.length > 0 ? main : makers.filter(canChange);
      if (options.length === 0) continue;
      const pick = rng.pick(options);
      const step = ratio < g.ratioLow ? 1 : -1;
      pick.size += step;
      // Integer sizes can jump over the sizing band. Undo a step that moves the ratio out of the
      // accept band, if it was in the band before or a smaller size makes it too low (DECISIONS.md, M2).
      const after = supplyRatios(world, data)[c.id] ?? 1;
      const inBand = (r: number) => r >= g.ratioAcceptLow && r <= g.ratioAcceptHigh;
      if (!inBand(after) && (inBand(ratio) || (step < 0 && after < g.ratioAcceptLow))) {
        pick.size -= step;
        continue;
      }
      changed = true;
    }
    setPopulation(world, data);
    if (!changed) break;
  }
}
