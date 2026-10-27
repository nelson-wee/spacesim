// Generator step 9: repairs (Section 6.11). Each repair is one action: change
// a size, change the producer at one location, or add a service.
import type { Rng } from '../core/rng';
import type { Location, MarketEntry, World } from '../core/types';
import type { GameData } from '../data';
import { midPrice } from '../econ/prices';
import { recipeOf } from '../econ/recipes';
import { mainProduct } from './blueprint';
import { balanceSizes, placeProducer, supplyAtFloor, supplyRatios } from './assign';
import { hasService } from './placeServices';
import type { RuleResult } from './validate';

/** The producer type whose main product is the commodity. */
function mainMaker(data: GameData, commodity: string): string | null {
  return data.recipes.recipes.find((r) => mainProduct(r, data) === commodity)?.producer ?? null;
}

function addService(loc: Location | undefined, id: string): boolean {
  if (!loc || hasService(loc, id)) return false;
  loc.services.push(id);
  return true;
}

function best<T>(items: T[], score: (t: T) => number): T | undefined {
  let pick: T | undefined;
  let top = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > top) {
      top = s;
      pick = item;
    }
  }
  return pick;
}

/** Frees one Habitat in an allowed place, so that a producer or Trade Hub can use the slot. */
export function freeHabitat(world: World, sectorIds: number[] | null): Location | undefined {
  const habitat = world.locations.find(
    (l) => l.bodyType === 'habitat' && l.producer === null && (sectorIds === null || sectorIds.includes(l.sectorId)),
  );
  if (habitat) habitat.bodyType = 'station_slot';
  return habitat;
}

function repairStart(world: World): string | null {
  const core = world.sectors[world.coreSectorId];
  if (!core) return null;
  const locs = core.locationIds.map((id) => world.locations[id] as Location);
  const pick = best(locs, (l) => (l.kind === 'planet' ? 2 : 0) + l.techLevel + (hasService(l, 'merchants_guild') ? 1 : 0));
  if (!pick) return null;
  addService(pick, 'outfitter');
  addService(pick, 'merchants_guild');
  world.startLocationId = pick.id;
  return `start at ${pick.name}: add Outfitter and Merchants' Guild`;
}

function repairServices(world: World): string | null {
  const count = (id: string) => world.locations.filter((l) => hasService(l, id)).length;
  const planets = world.locations.filter((l) => l.kind === 'planet');
  const yards = world.locations.filter((l) => hasService(l, 'shipyard'));
  if (yards.length < 2 || !yards.some((l) => l.techLevel >= 3)) {
    const pick = best(
      world.locations.filter((l) => !hasService(l, 'shipyard')),
      (l) => l.techLevel * 2 + (l.bodyType === 'terran' ? 1 : 0),
    );
    if (addService(pick, 'shipyard')) return `add Shipyard at ${pick?.name}`;
  }
  if (count('outfitter') < 3) {
    const pick = best(world.locations.filter((l) => !hasService(l, 'outfitter')), (l) => l.techLevel);
    if (addService(pick, 'outfitter')) return `add Outfitter at ${pick?.name}`;
  }
  if (count('merchants_guild') < 2) {
    const pick = best(planets.filter((l) => !hasService(l, 'merchants_guild')), (l) => l.techLevel + l.population / 100);
    if (addService(pick, 'merchants_guild')) return `add Merchants' Guild at ${pick?.name}`;
  }
  if (count('bounty_guild') < 2) {
    const pick = best(
      world.locations.filter((l) => !hasService(l, 'bounty_guild')),
      (l) => (world.sectors[l.sectorId]?.securityBaseline ?? 0) + l.techLevel,
    );
    if (addService(pick, 'bounty_guild')) return `add Bounty Guild at ${pick?.name}`;
  }
  return null;
}

/** Places one more producer of a type. Frees a Habitat if no body is free. */
function addProducer(
  world: World,
  producer: string,
  rng: Rng,
  data: GameData,
  prefer?: (loc: Location) => number,
): string | null {
  if (!producer) return null;
  let loc = placeProducer(world, producer, rng, data, prefer);
  if (!loc && freeHabitat(world, null)) loc = placeProducer(world, producer, rng, data, prefer);
  return loc ? `add ${producer} at ${loc.name}` : null;
}

/** A sector and the sectors one lane from it. */
function nearSectors(world: World, sectorId: number): Set<number> {
  const near = new Set([sectorId]);
  for (const l of world.lanes) {
    if (l.a === sectorId) near.add(l.b);
    if (l.b === sectorId) near.add(l.a);
  }
  return near;
}

/** Moves a producer to a body in another sector, scored by `prefer`. Keeps it in place if no body is free. */
function moveProducer(world: World, loc: Location, rng: Rng, data: GameData, prefer: (l: Location) => number): string | null {
  const producer = loc.producer as string;
  const bodyType = loc.bodyType;
  loc.producer = null;
  if (loc.kind === 'station') loc.bodyType = 'station_slot';
  const to = placeProducer(world, producer, rng, data, (l) => (l.sectorId === loc.sectorId ? -100 : prefer(l)));
  if (!to || to.sectorId === loc.sectorId) {
    if (to) {
      to.producer = null;
      if (to.kind === 'station') to.bodyType = 'station_slot';
    }
    loc.producer = producer;
    loc.bodyType = bodyType;
    return null;
  }
  loc.production = null;
  loc.installedMachinery = 0;
  return `move ${producer} from ${loc.name} to ${to.name}`;
}

/**
 * Frees a station slot for a relay Trade Hub next to a cut-off location: in a
 * full Middle or Core sector one lane away (or the same sector), moves a
 * station producer to another sector. The next supply-path pass adds the hub.
 */
function freeRelaySlot(world: World, loc: Location, rng: Rng, data: GameData): string | null {
  for (const sid of [...nearSectors(world, loc.sectorId)].sort((a, b) => a - b)) {
    const sector = world.sectors[sid];
    if (!sector || sector.development === 'frontier') continue;
    const locs = sector.locationIds.map((id) => world.locations[id] as Location);
    if (locs.some((l) => l.bodyType === 'trade_hub' || l.bodyType === 'station_slot' || (l.bodyType === 'habitat' && !l.producer))) continue;
    for (const station of locs.filter((l) => l.kind === 'station' && l.producer)) {
      const done = moveProducer(world, station, rng, data, () => 0);
      if (done) return done;
    }
  }
  return null;
}

function removeProducer(world: World, producer: string, data: GameData): string | null {
  const g = data.balance.generator;
  const list = world.locations.filter((l) => l.producer === producer);
  if (list.length <= g.minProducersPerType) return null;
  const loc = list[list.length - 1] as Location;
  loc.producer = null;
  loc.production = null;
  loc.installedMachinery = 0;
  if (loc.kind === 'station') loc.bodyType = 'habitat';
  return `remove ${producer} at ${loc.name}`;
}

function repairRatio(world: World, rng: Rng, data: GameData): string | null {
  const g = data.balance.generator;
  balanceSizes(world, rng, data, false);
  const ratios = supplyRatios(world, data);
  const worst = Object.entries(ratios)
    .filter(([c, r]) => r < g.ratioAcceptLow || (r > g.ratioAcceptHigh && !supplyAtFloor(world, data, c)))
    .sort((a, b) => Math.abs(Math.log(b[1])) - Math.abs(Math.log(a[1])))[0];
  if (!worst) return 'size passes';
  const [commodity, ratio] = worst;
  const maker = mainMaker(data, commodity);
  if (!maker) return null;
  return ratio < g.ratioLow ? addProducer(world, maker, rng, data) : removeProducer(world, maker, data);
}

/**
 * Tries one repair for the first failing rule that has a repair. Returns a
 * short description, or null if no repair is possible.
 */
export function repairWorld(world: World, failed: RuleResult[], rng: Rng, data: GameData): string | null {
  const ids = new Set(failed.filter((r) => !r.pass).map((r) => r.id));
  if (ids.has('start')) return repairStart(world);
  if (ids.has('services')) {
    const done = repairServices(world);
    if (done) return done;
  }
  if (ids.has('producersPlaced')) {
    const detail = failed.find((r) => r.id === 'producersPlaced')?.detail ?? '';
    const producer = /no body for (\w+)/.exec(detail)?.[1];
    if (producer) {
      const done = addProducer(world, producer, rng, data);
      if (done) return done;
    }
  }
  for (const id of ['twoSectors', 'chainSeparation']) {
    if (!ids.has(id)) continue;
    const detail = failed.find((r) => r.id === id)?.detail ?? '';
    const first = detail.split('; ')[0] ?? '';
    const producer = id === 'twoSectors' ? mainMaker(data, first) : first.split('<-')[0];
    if (producer) {
      const done = addProducer(world, producer, rng, data);
      if (done) return done;
    }
  }
  if (ids.has('supplyPath')) {
    // "commodity@locationId". If the location makes the commodity, its goods cannot reach a
    // user: move it to another sector. Else it cannot get an input: add a maker near it.
    const detail = failed.find((r) => r.id === 'supplyPath')?.detail ?? '';
    for (const item of detail.split('; ')) {
      const [commodity, idText] = item.split('@');
      const loc = world.locations[Number(idText)];
      if (!commodity || !loc?.producer) continue;
      const near = nearSectors(world, loc.sectorId);
      const makes = recipeOf(data, loc.producer).outputs.some((o) => o.commodity === commodity);
      // Sectors one lane or less from the other end of the path.
      const ends = new Set<number>();
      for (const l of world.locations) {
        if (!l.producer || l.id === loc.id) continue;
        const r = recipeOf(data, l.producer);
        const other = makes
          ? r.inputs.some((x) => x.commodity === commodity) || r.softInput === commodity
          : r.outputs.some((x) => x.commodity === commodity);
        if (other) for (const sid of nearSectors(world, l.sectorId)) ends.add(sid);
      }
      const done =
        (makes ? null : addProducer(world, mainMaker(data, commodity) ?? '', rng, data, (l) => (near.has(l.sectorId) ? 5 : 0))) ??
        moveProducer(world, loc, rng, data, (l) => (ends.has(l.sectorId) ? 5 : 0)) ??
        freeRelaySlot(world, loc, rng, data);
      if (done) return done;
    }
  }
  if (ids.has('lowOutput')) {
    // Change a Habitat next to a starving producer to a Trade Hub (a relay).
    const starving = world.locations.filter((l) => l.producer && (l.production?.outputRatio ?? 1) < data.balance.generator.lowOutputShare);
    const sectors = new Set<number>();
    for (const l of starving.length > 0 ? starving : world.locations.filter((x) => x.producer)) {
      sectors.add(l.sectorId);
      for (const lane of world.lanes) {
        if (lane.a === l.sectorId) sectors.add(lane.b);
        if (lane.b === l.sectorId) sectors.add(lane.a);
      }
    }
    // Trade Hubs may stand only in Middle and Core sectors (Section 7.2).
    const hubSectors = [...sectors].filter((id) => world.sectors[id]?.development !== 'frontier');
    const habitat = freeHabitat(world, hubSectors);
    if (habitat) {
      habitat.bodyType = 'trade_hub';
      return `change Habitat ${habitat.name} to a Trade Hub`;
    }
    const input = starving[0]?.producer ? recipeOf(data, starving[0].producer).inputs[0]?.commodity : undefined;
    const maker = input ? mainMaker(data, input) : null;
    if (maker) {
      const done = addProducer(world, maker, rng, data);
      if (done) return done;
    }
  }
  if (ids.has('gradient')) {
    // Advanced goods cost too much in the Core: add a maker in the Core of the dearest one.
    // The world keeps the market state of the validation run.
    const dear = dearestInCore(world, data, 'advanced');
    const maker = dear ? mainMaker(data, dear) : null;
    if (maker) {
      const done = addProducer(world, maker, rng, data, (l) => (world.sectors[l.sectorId]?.development === 'core' ? 5 : 0));
      if (done) return done;
    }
  }
  if (ids.has('supplyRatio')) return repairRatio(world, rng, data);
  return null;
}

/** The commodity of a tier with the highest median price factor in Core sectors. */
function dearestInCore(world: World, data: GameData, tier: string): string | null {
  let pick: string | null = null;
  let top = -Infinity;
  for (const c of data.commodities.filter((x) => x.tier === tier)) {
    const factors = world.locations
      .filter((l) => world.sectors[l.sectorId]?.development === 'core' && l.market[c.id])
      .map((l) => midPrice(l.market[c.id] as MarketEntry, c.basePrice, data) / c.basePrice)
      .sort((a, b) => a - b);
    const mid = factors[Math.floor(factors.length / 2)];
    if (mid !== undefined && mid > top) {
      top = mid;
      pick = c.id;
    }
  }
  return pick;
}
