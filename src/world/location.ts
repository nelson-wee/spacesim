// The Location model (Section 7.1). Planets and stations use the same model.
import type { Location, Vec } from '../core/types';
import type { GameData } from '../data';

export interface NewLocation {
  id: number;
  sectorId: number;
  name: string;
  kind: 'planet' | 'station';
  bodyType: string;
  pos: Vec;
  ring: number;
  techLevel: number;
}

export function createLocation(spec: NewLocation, data: GameData): Location {
  const planet = spec.kind === 'planet' ? data.planetTypeById.get(spec.bodyType) : undefined;
  if (spec.kind === 'planet' && !planet) throw new Error(`Unknown planet type ${spec.bodyType}`);
  return {
    ...spec,
    size: data.balance.world.defaultLocationSize,
    // Stations and Gas Giants have gravity 0 (Section 8.4).
    gravity: planet ? planet.gravity : 0,
    producer: null,
    population: 0,
    installedMachinery: 0,
    market: {},
    services: [],
  };
}

export function locationTypeName(loc: Location, data: GameData): string {
  if (loc.kind === 'planet') return `${data.planetTypeById.get(loc.bodyType)?.name ?? loc.bodyType} planet`;
  return data.stationTypeById.get(loc.bodyType)?.name ?? 'Station';
}
