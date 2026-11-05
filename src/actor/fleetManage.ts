// Fleet management (Q-50, M6-FLEET-10, M6-UI-06): move cargo and modules
// between ships, docked at any location and after a battle. The functions
// work on Ship objects, so that the after-battle screen can also take cargo
// from surrendered ships. No fee and no time.
import type { CargoLot, InstalledModule, Ship } from '../core/types';
import type { GameData } from '../data';
import { moduleName, removeProblem } from '../services/outfitter';
import { checkLoadout, fitProblem, type SlotKind, slotSizesOf } from '../ship/rules';
import { travelStats } from '../ship/stats';
import { commodityMass, freeTonnes } from './cargo';

const EPS = 1e-9;

export interface MoveResult {
  ok: boolean;
  text: string;
}

/**
 * Moves up to `units` of a commodity from one ship to another, as far as it
 * fits. Cargo from a ship that is not in the fleet (`loot`) has a purchase
 * price of 0, as other loot (M5-LOOT).
 */
export function moveCargo(data: GameData, from: Ship, to: Ship, commodity: string, units: number, loot = false): MoveResult {
  const lot = from.cargo[commodity];
  const name = data.commodityById.get(commodity)?.name ?? commodity;
  if (from === to) return { ok: false, text: 'Select another ship.' };
  if (!lot || lot.units <= EPS) return { ok: false, text: `${from.name} has no ${name}.` };
  const mass = commodityMass(data, commodity);
  const room = mass > 0 ? freeTonnes(to, data) / mass : Infinity;
  const n = Math.min(units, lot.units, room);
  if (n <= EPS) return { ok: false, text: `${to.name} has no free cargo space.` };
  const cost = loot ? 0 : lot.unitCost;
  const dest: CargoLot = to.cargo[commodity] ?? { units: 0, unitCost: 0 };
  dest.unitCost = (dest.units * dest.unitCost + n * cost) / (dest.units + n);
  dest.units += n;
  to.cargo[commodity] = dest;
  lot.units -= n;
  if (lot.units <= EPS) delete from.cargo[commodity];
  const whole = Math.abs(n - Math.round(n)) < 1e-6 ? String(Math.round(n)) : n.toFixed(1);
  return { ok: true, text: `${whole} ${name} moves from ${from.name} to ${to.name}.` };
}

/** Moves all cargo of one ship to another, as far as it fits. */
export function moveAllCargo(data: GameData, from: Ship, to: Ship, loot = false): number {
  let moved = 0;
  for (const [commodity, lot] of Object.entries(from.cargo)) {
    const before = lot.units;
    moveCargo(data, from, to, commodity, before, loot);
    moved += before - (from.cargo[commodity]?.units ?? 0);
  }
  return moved;
}

function slotList(ship: Ship, kind: SlotKind): (InstalledModule | null)[] {
  return kind === 'hardpoint' ? ship.hardpoints : ship.internal;
}

const SIZE_RANK = { S: 1, M: 2, L: 3 } as const;

/**
 * The smallest empty slot of a ship that takes this module, or null. The
 * smallest slot keeps the larger slots free for larger modules (owner bug
 * report, 2026-11-03: a small module took the only large slot).
 */
export function freeSlotFor(data: GameData, ship: Ship, kind: SlotKind, m: InstalledModule): number | null {
  const sizes = slotSizesOf(ship, kind, data);
  let best: number | null = null;
  for (let i = 0; i < sizes.length; i++) {
    if (fitProblem(ship, kind, i, m.moduleId, m.size, data)) continue;
    if (best === null || SIZE_RANK[sizes[i] as keyof typeof SIZE_RANK] < SIZE_RANK[sizes[best] as keyof typeof SIZE_RANK]) best = i;
  }
  return best;
}

/** A module out of its slot, in the fleet hold of the fleet screen (owner, 2026-11-03). */
export interface HeldModule {
  module: InstalledModule;
  /** Armor plating keeps its armor HP. */
  armorHp: number;
  /** The ship it came from, for the list. */
  fromName: string;
}

export interface UninstallResult extends MoveResult {
  held?: HeldModule;
}

/**
 * Takes a module out of its slot. Armor plating takes its share of the armor
 * HP with it; fuel above the new tank capacity is lost.
 */
export function uninstallModule(data: GameData, ship: Ship, kind: SlotKind, index: number): UninstallResult {
  const m = slotList(ship, kind)[index];
  if (!m) return { ok: false, text: 'The slot is empty.' };
  const why = removeProblem(ship, kind, index, data);
  if (why) return { ok: false, text: why };
  const armorBefore = ship.armorHp;
  const fuelBefore = ship.fuel;
  slotList(ship, kind)[index] = null;
  const s = travelStats(ship, data);
  ship.fuel = Math.min(ship.fuel, s.fuelCapacity);
  ship.armorHp = Math.min(ship.armorHp, s.maxArmorHp);
  const lostFuel = fuelBefore - ship.fuel;
  const text = `You uninstall ${moduleName(m, data)} from ${ship.name}.${lostFuel > 1e-6 ? ` ${lostFuel.toFixed(1)} fuel is lost.` : ''}`;
  return { ok: true, text, held: { module: m, armorHp: armorBefore - ship.armorHp, fromName: ship.name } };
}

/** Puts a held module in a slot (index null: the smallest empty slot that takes it). */
export function installModule(data: GameData, ship: Ship, held: HeldModule, index: number | null = null): MoveResult {
  const kind: SlotKind = data.moduleById.get(held.module.moduleId)?.slot === 'hardpoint' ? 'hardpoint' : 'internal';
  const slot = index ?? freeSlotFor(data, ship, kind, held.module);
  if (slot === null) return { ok: false, text: `${ship.name} has no empty ${kind === 'hardpoint' ? 'hardpoint' : 'internal slot'} of size ${held.module.size} or larger.` };
  const why = fitProblem(ship, kind, slot, held.module.moduleId, held.module.size, data);
  if (why) return { ok: false, text: why };
  const list = slotList(ship, kind);
  while (list.length < slot) list.push(null);
  list[slot] = held.module;
  ship.armorHp = Math.min(ship.armorHp + held.armorHp, travelStats(ship, data).maxArmorHp);
  return { ok: true, text: `You install ${moduleName(held.module, data)} on ${ship.name}.` };
}

/**
 * Moves a module from a slot of one ship to the smallest empty slot that
 * takes it on another ship (uninstall, then install). Armor plating takes its
 * armor HP with it; a fuel tank keeps no fuel.
 */
export function moveModule(data: GameData, from: Ship, kind: SlotKind, index: number, to: Ship): MoveResult {
  const m = slotList(from, kind)[index];
  if (!m) return { ok: false, text: 'The slot is empty.' };
  if (from === to) return { ok: false, text: 'Select another ship.' };
  const why = removeProblem(from, kind, index, data);
  if (why) return { ok: false, text: why };
  if (freeSlotFor(data, to, kind, m) === null) return { ok: false, text: `${to.name} has no empty ${kind === 'hardpoint' ? 'hardpoint' : 'internal slot'} of size ${m.size} or larger.` };
  const out = uninstallModule(data, from, kind, index);
  if (!out.held) return out;
  installModule(data, to, out.held);
  return { ok: true, text: `${moduleName(m, data)} moves from ${from.name} to ${to.name}.` };
}

/** The modules, fuel, and armor HP of a ship, to revert the changes of a fleet screen session. */
export interface LoadoutSnapshot {
  hardpoints: (InstalledModule | null)[];
  internal: (InstalledModule | null)[];
  fuel: number;
  armorHp: number;
}

export function snapshotLoadout(ship: Ship): LoadoutSnapshot {
  return structuredClone({ hardpoints: ship.hardpoints, internal: ship.internal, fuel: ship.fuel, armorHp: ship.armorHp });
}

export function restoreLoadout(ship: Ship, snap: LoadoutSnapshot): void {
  const copy = structuredClone(snap);
  ship.hardpoints = copy.hardpoints;
  ship.internal = copy.internal;
  ship.fuel = copy.fuel;
  ship.armorHp = copy.armorHp;
}

/** Fleet ships that break a required-module rule (Section 11.2), with the first error. */
export function fleetProblems(fleet: Ship[], data: GameData): string[] {
  return fleet.flatMap((ship) => {
    const error = checkLoadout(ship, data).errors[0];
    return error ? [`${ship.name}: ${error}`] : [];
  });
}

/**
 * Moves fuel between the fleet ships (owner, 2026-11-04), so that all ships
 * can go the same distance before one is empty: each ship gets fuel in
 * proportion to its fuel use per distance (mass factor x engine fuel rate),
 * up to its tank capacity. The total fuel does not change. No fee and no time.
 */
export function balanceFuel(data: GameData, fleet: Ship[]): MoveResult {
  const ships = fleet.map((ship) => {
    const s = travelStats(ship, data);
    return { ship, cap: s.fuelCapacity, rate: Math.max(EPS, s.mass ** data.balance.travel.fuelMassExponent * Math.max(s.engineFuelRate, EPS)) };
  });
  const total = ships.reduce((sum, x) => sum + Math.min(x.ship.fuel, x.cap), 0);
  if (ships.length < 2) return { ok: false, text: 'The fleet has only one ship.' };
  if (total <= EPS) return { ok: false, text: 'The fleet has no fuel.' };
  const fill = (t: number) => ships.reduce((sum, x) => sum + Math.min(x.cap, t * x.rate), 0);
  let lo = 0;
  let hi = Math.max(...ships.map((x) => x.cap / x.rate));
  if (fill(hi) <= total) lo = hi;
  else for (let i = 0; i < 100; i++) (fill((lo + hi) / 2) < total ? (lo = (lo + hi) / 2) : (hi = (lo + hi) / 2));
  const before = ships.map((x) => x.ship.fuel);
  for (const x of ships) x.ship.fuel = Math.min(x.cap, lo * x.rate);
  // Put the rounding rest on the ships with tank space, so that no fuel is lost.
  let rest = total - ships.reduce((sum, x) => sum + x.ship.fuel, 0);
  for (const x of ships) {
    if (rest <= 0) break;
    const add = Math.min(rest, x.cap - x.ship.fuel);
    x.ship.fuel += add;
    rest -= add;
  }
  const moved = ships.reduce((sum, x, i) => sum + Math.max(0, x.ship.fuel - (before[i] ?? 0)), 0);
  if (moved < 0.05) return { ok: true, text: 'The fuel is already balanced.' };
  return { ok: true, text: `Moved ${moved.toFixed(1)} fuel between the ships. All ships can now go about the same distance.` };
}
