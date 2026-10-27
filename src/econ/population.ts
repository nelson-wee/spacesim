// Population: the final demand (Section 9.4).
import type { Location, Sector } from '../core/types';
import type { GameData } from '../data';

export type PopulationKind = 'terran' | 'ocean' | 'habitat' | 'crew';

export function populationKind(bodyType: string): PopulationKind {
  return bodyType === 'terran' || bodyType === 'ocean' || bodyType === 'habitat' ? bodyType : 'crew';
}

/** True for planets with atmosphere and Habitat stations (a real population, not only crew). */
export function hasResidentPopulation(bodyType: string): boolean {
  return populationKind(bodyType) !== 'crew';
}

export function populationFor(bodyType: string, size: number, data: GameData): number {
  return data.population.unitsPerSize[populationKind(bodyType)] * size;
}

export function hasAtmosphere(loc: Location, data: GameData): boolean {
  return loc.kind === 'planet' && (data.planetTypeById.get(loc.bodyType)?.atmosphere ?? false);
}

export interface Use {
  commodity: string;
  amount: number;
}

/**
 * True if a population rule applies to a location (data/population.json `who`):
 * `all` and `noAtmosphere` apply to resident populations and crew; `resident`
 * and `coreResident` apply only to resident populations (planets with
 * atmosphere and Habitats). This keeps each location at 4 to 8 commodities
 * (Q-03, DECISIONS.md).
 */
export function useApplies(
  who: 'all' | 'resident' | 'noAtmosphere' | 'coreResident',
  bodyType: string,
  airless: boolean,
  core: boolean,
): boolean {
  if (who === 'all') return true;
  if (who === 'noAtmosphere') return airless;
  if (!hasResidentPopulation(bodyType)) return false;
  return who === 'resident' || core;
}

/**
 * Daily use of a location at full supply, before the security multiplier:
 * population use (scaled by `useScale`) and station use (for example, a
 * Shipyard Station buys Alloys).
 */
export function dailyUse(loc: Location, sector: Sector, data: GameData): Use[] {
  const uses = new Map<string, number>();
  const add = (c: string, q: number) => {
    if (q > 0) uses.set(c, (uses.get(c) ?? 0) + q);
  };
  const scale = data.population.useScale;
  for (const u of data.population.use) {
    if (useApplies(u.who, loc.bodyType, !hasAtmosphere(loc, data), sector.development === 'core')) add(u.commodity, u.perUnitPerDay * loc.population * scale);
  }
  for (const u of data.population.stationUse[loc.bodyType] ?? []) add(u.commodity, u.perSizePerDay * loc.size);
  return [...uses].map(([commodity, amount]) => ({ commodity, amount }));
}
