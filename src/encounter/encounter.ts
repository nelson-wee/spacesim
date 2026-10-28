// Encounters (Sections 10.4, 10.7, 10.8, 8.8; Q-15, Q-16, Q-17, Q-26). The
// world rolls an encounter on sector arrival, on each sector trip, and on
// Hunt. Pirates judge the odds against the player's flagship; the hail screen
// then offers the options. All functions here are headless.
import { addCargo, fleetUnits } from '../actor/cargo';
import type { AiKind, Faction } from '../combat/types';
import type { Rng } from '../core/rng';
import type { Actor, CargoLot, Location, Sector, Ship, Vec } from '../core/types';
import type { GameData } from '../data';
import type { TemplateDef } from '../data/schemas';
import { basePrice, sellPrice } from '../econ/prices';
import { createShipFromLoadout } from '../ship/loadout';
import { travelStats } from '../ship/stats';
import { shipTu } from '../ship/threat';
import { mapDistance } from '../world/geometry';
import { allowedPirateTemplates, patrolGroup, pirateBudget, sectorLevel, selectTemplate, templateTu } from './budget';

export type EncounterKind = 'pirate' | 'trader' | 'patrol';
export type PirateBehavior = 'attack' | 'tribute' | 'avoid';
export type HailOption = 'fight' | 'flee' | 'pay' | 'pursue' | 'ignore' | 'attack';

export interface EncounterShip {
  loadoutId: string;
  ai: AiKind;
  faction: Faction;
  /** Index of the ship this escort guards (in `ships`), or null. */
  escortOf: number | null;
  cargo: Record<string, CargoLot>;
}

export interface Encounter {
  kind: EncounterKind;
  sectorId: number;
  point: Vec;
  /** The template name for the hail screen. */
  name: string;
  ships: EncounterShip[];
  groupTu: number;
  /** Pirates (Section 10.7). */
  behavior: PirateBehavior | null;
  ratio: number;
  /** Patrols: hostile when the player is Wanted (Section 15). */
  hostile: boolean;
}

/** TU of the flagship, at least 1 (a ship with no weapons has 0 firepower). */
export function flagshipTu(actor: Actor, data: GameData): number {
  const flag = actor.fleet[actor.flagshipIndex];
  return flag ? Math.max(1, shipTu(flag, data)) : 1;
}

export function isWanted(actor: Actor, data: GameData): boolean {
  return actor.notoriety >= data.balance.notoriety.wanted;
}

/** Section 10.7: ratio = group TU / flagship TU x boldness[level]. */
export function pirateBehavior(groupTu: number, actor: Actor, sector: Sector, data: GameData): { behavior: PirateBehavior; ratio: number } {
  const ratio = (groupTu / flagshipTu(actor, data)) * (data.security.boldness[sectorLevel(sector, data)] ?? 1);
  const o = data.security.odds;
  const behavior: PirateBehavior = ratio >= o.attack ? 'attack' : ratio >= o.tribute ? 'tribute' : 'avoid';
  // Q-17: with no cargo in the fleet, tribute pirates attack.
  if (behavior === 'tribute' && !hasCargo(actor)) return { behavior: 'attack', ratio };
  return { behavior, ratio };
}

function hasCargo(actor: Actor): boolean {
  return actor.fleet.some((s) => Object.values(s.cargo).some((l) => l.units > 1e-9));
}

function groupShips(t: TemplateDef, ai: AiKind, faction: Faction, swap: Record<string, string> = {}): EncounterShip[] {
  return t.ships.map((id) => ({ loadoutId: swap[id] ?? id, ai, faction, escortOf: null, cargo: {} }));
}

/** A pirate encounter (Section 10.6 selection; Section 10.7 odds). */
export function pirateEncounter(sector: Sector, point: Vec, actor: Actor, rng: Rng, data: GameData): Encounter {
  const budget = pirateBudget(sector, rng, data);
  const allowed = allowedPirateTemplates(sector, data);
  const template = selectTemplate(allowed, budget, rng, data) ?? (allowed[0] as TemplateDef);
  return pirateEncounterOf(template, sector, point, actor, data);
}

/** A pirate encounter with a given template (also the debug panel, M5-ENC-12). */
export function pirateEncounterOf(template: TemplateDef, sector: Sector, point: Vec, actor: Actor, data: GameData): Encounter {
  const tu = templateTu(template, data);
  const { behavior, ratio } = pirateBehavior(tu, actor, sector, data);
  // Pursued pirates use the Evader AI (Section 10.7); the AI is set when the battle starts.
  return { kind: 'pirate', sectorId: sector.id, point, name: template.name, ships: groupShips(template, 'raider', 'pirate'), groupTu: tu, behavior, ratio, hostile: true };
}

/** A patrol encounter with a given template (also the debug panel). */
export function patrolEncounterOf(template: TemplateDef, sector: Sector, point: Vec, actor: Actor, data: GameData): Encounter {
  return {
    kind: 'patrol',
    sectorId: sector.id,
    point,
    name: template.name,
    ships: groupShips(template, 'patrol', 'patrol'),
    groupTu: templateTu(template, data),
    behavior: null,
    ratio: 0,
    hostile: isWanted(actor, data),
  };
}

/** The location nearest to a point in a sector. */
function nearestLocation(sector: Sector, point: Vec, locations: Location[], data: GameData): Location | undefined {
  let best: Location | undefined;
  let bestD = Infinity;
  for (const id of sector.locationIds) {
    const loc = locations[id];
    if (!loc) continue;
    const d = mapDistance(point, loc.pos, data.balance.world.cellAspect);
    if (d < bestD) {
      bestD = d;
      best = loc;
    }
  }
  return best;
}

/**
 * Trader cargo from the local market (M5-ENC-03): goods that the nearest
 * location sells (stock above target first), at its sell price, up to the
 * hold's capacity.
 */
export function traderCargo(ship: Ship, loc: Location | undefined, rng: Rng, data: GameData): Record<string, CargoLot> {
  const cargo: Record<string, CargoLot> = {};
  if (!loc) return cargo;
  const capacity = travelStats(ship, data).cargoCapacity;
  const goods = Object.entries(loc.market)
    .filter(([, e]) => e.stock > 0)
    .sort((a, b) => b[1].stock / Math.max(1, b[1].target) - a[1].stock / Math.max(1, a[1].target))
    .slice(0, 2);
  let left = capacity;
  for (const [i, [id, entry]] of goods.entries()) {
    const mass = data.commodityById.get(id)?.massPerUnit ?? 1;
    const share = i === 0 && goods.length > 1 ? rng.range(0.5, 0.8) : 1;
    const units = Math.floor((left * share) / Math.max(1e-9, mass));
    if (units <= 0) continue;
    cargo[id] = { units, unitCost: sellPrice(entry, basePrice(data, id), data) };
    left -= units * mass;
  }
  return cargo;
}

/** A trader encounter with an escort in sectors with security level <= escort.maxSecurity (Section 10.8). */
export function traderEncounter(sector: Sector, point: Vec, locations: Location[], rng: Rng, data: GameData): Encounter {
  const t = data.templates;
  const loadoutId = rng.weighted(t.trader[sector.development], (w) => w.weight).loadout;
  const traderShip = createShipFromLoadout(data, loadoutId, 'trader', 'trader');
  const ships: EncounterShip[] = [{ loadoutId, ai: 'trader', faction: 'trader', escortOf: null, cargo: traderCargo(traderShip, nearestLocation(sector, point, locations, data), rng, data) }];
  let name = data.loadoutById.get(loadoutId)?.name ?? 'Trader';
  if (sectorLevel(sector, data) <= t.escort.maxSecurity) {
    const budget = pirateBudget(sector, rng, data) * t.escort.budgetShare;
    const escort = selectTemplate(allowedPirateTemplates(sector, data), budget, rng, data);
    if (escort) {
      for (const s of groupShips(escort, 'patrol', 'trader', t.escort.loadoutSwap)) ships.push({ ...s, escortOf: 0 });
      name += ` with escort (${escort.ships.length})`;
    }
  }
  const tu = templateTu({ ships: ships.map((s) => s.loadoutId) }, data);
  return { kind: 'trader', sectorId: sector.id, point, name, ships, groupTu: tu, behavior: null, ratio: 0, hostile: false };
}

/** A patrol encounter (Q-04 interim), or null in Lawless sectors. Hostile when the player is Wanted. */
export function patrolEncounter(sector: Sector, point: Vec, actor: Actor, rng: Rng, data: GameData): Encounter | null {
  const group = patrolGroup(sector, rng, data);
  if (!group) return null;
  return patrolEncounterOf(group.template, sector, point, actor, data);
}

export type EncounterCause = 'arrival' | 'trip' | 'hunt';

/**
 * Section 10.4: pirates first (chance by cause and security level); on a trip
 * with no pirates, a trader (30%), else a patrol (20%, security level 2+).
 * Arrival and Hunt roll only for pirates. Returns null if nothing happens.
 */
export function rollEncounter(cause: EncounterCause, sector: Sector, point: Vec, actor: Actor, locations: Location[], rng: Rng, data: GameData): Encounter | null {
  const level = data.security.levels.find((l) => l.level === sectorLevel(sector, data));
  if (!level) return null;
  const e = data.encounters;
  const pirateChance = cause === 'arrival' ? level.pirateChanceArrival : cause === 'hunt' ? Math.min(1, level.pirateChanceTrip * e.huntMultiplier) : level.pirateChanceTrip;
  if (rng.chance(pirateChance)) return pirateEncounter(sector, point, actor, rng, data);
  if (cause !== 'trip') return null;
  if (rng.chance(e.traderChance)) return traderEncounter(sector, point, locations, rng, data);
  if (level.level >= e.patrolMinSecurity && rng.chance(e.patrolChance)) return patrolEncounter(sector, point, actor, rng, data);
  return null;
}

/** Hail options (Section 10.7, Q-16). */
export function hailOptions(enc: Encounter): HailOption[] {
  if (enc.kind === 'pirate') {
    if (enc.behavior === 'attack') return ['fight', 'flee'];
    if (enc.behavior === 'tribute') return ['fight', 'flee', 'pay'];
    return ['pursue', 'ignore'];
  }
  if (enc.kind === 'patrol' && enc.hostile) return ['fight', 'flee'];
  return ['attack', 'ignore'];
}

/** Q-15: flee succeeds if the flagship moves more than every enemy; else with `fleeChance`. */
export function fleeSucceeds(actor: Actor, enc: Encounter, rng: Rng, data: GameData): boolean {
  const flag = actor.fleet[actor.flagshipIndex];
  if (!flag) return false;
  const mine = travelStats(flag, data).move;
  const theirs = Math.max(...enc.ships.map((s) => travelStats(createShipFromLoadout(data, s.loadoutId, 'e', 'e'), data).move));
  return mine > theirs || rng.chance(data.encounters.fleeChance);
}

/**
 * Q-17 tribute: the fleet ship with the highest cargo value loses tributeShare
 * (rounded down) of each commodity. Returns the units taken.
 */
export function payTribute(actor: Actor, data: GameData): number {
  const value = (s: Ship) => Object.entries(s.cargo).reduce((sum, [id, lot]) => sum + lot.units * basePrice(data, id), 0);
  const ship = [...actor.fleet].sort((a, b) => value(b) - value(a))[0];
  if (!ship) return 0;
  let taken = 0;
  for (const [id, lot] of Object.entries(ship.cargo)) {
    const units = Math.floor(lot.units * data.encounters.tributeShare);
    if (units <= 0) continue;
    lot.units -= units;
    if (lot.units <= 1e-9) delete ship.cargo[id];
    taken += units;
  }
  return taken;
}

/** Takes cargo into the fleet as far as it fits (loot, M5-LOOT-02). Returns the units taken by commodity. */
export function takeCargo(actor: Actor, cargo: Record<string, CargoLot>, data: GameData): Record<string, number> {
  const taken: Record<string, number> = {};
  for (const [id, lot] of Object.entries(cargo)) {
    const before = fleetUnits(actor, id);
    addCargo(actor, data, id, lot.units, 0);
    const got = fleetUnits(actor, id) - before;
    if (got > 1e-9) taken[id] = got;
  }
  return taken;
}

