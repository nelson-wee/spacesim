// Generator step 7: services by location type and tech level (Sections 6.9, 7.4).
// The rules are in data/services.json.
import type { Location, Sector, World } from '../core/types';
import type { GameData, ServiceClause } from '../data';
import { hasResidentPopulation } from '../econ/population';

function clauseMatches(clause: ServiceClause, loc: Location, sector: Sector): boolean {
  if (clause.kind && loc.kind !== clause.kind) return false;
  if (clause.bodyType && !clause.bodyType.includes(loc.bodyType)) return false;
  if (clause.minTech !== undefined && loc.techLevel < clause.minTech) return false;
  if (clause.residentPopulation !== undefined && hasResidentPopulation(loc.bodyType) !== clause.residentPopulation) return false;
  // Services do not change after generation, so they use the baseline (Q-22).
  if (clause.minBaselineSecurity !== undefined && sector.securityBaseline < clause.minBaselineSecurity) return false;
  return true;
}

/** Tech level from development (Section 6.4), plus the station bonus (Shipyard Stations, Trade Hubs; maximum 3). */
export function setTechLevels(world: World, data: GameData): void {
  for (const loc of world.locations) {
    const sector = world.sectors[loc.sectorId] as Sector;
    const base = data.balance.world.techByDevelopment[sector.development];
    const bonus = data.stationTypeById.get(loc.bodyType)?.techBonus ?? 0;
    loc.techLevel = Math.min(3, base + bonus);
  }
}

/** Sets the services of each location from the rules. Keeps services that a repair added. */
export function placeServices(world: World, data: GameData): void {
  for (const loc of world.locations) {
    const sector = world.sectors[loc.sectorId] as Sector;
    const services = new Set(loc.services);
    for (const svc of data.services) {
      if (svc.where.some((c) => clauseMatches(c, loc, sector))) services.add(svc.id);
    }
    loc.services = data.services.map((s) => s.id).filter((id) => services.has(id));
  }
}

export function hasService(loc: Location, id: string): boolean {
  return loc.services.includes(id);
}
