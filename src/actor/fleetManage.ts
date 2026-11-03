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

/** The first empty slot of a ship that takes this module, or null. */
export function freeSlotFor(data: GameData, ship: Ship, kind: SlotKind, m: InstalledModule): number | null {
  const n = slotSizesOf(ship, kind, data).length;
  for (let i = 0; i < n; i++) if (!fitProblem(ship, kind, i, m.moduleId, m.size, data)) return i;
  return null;
}

/**
 * Moves a module from a slot of one ship to the first empty slot that takes
 * it on another ship. Armor plating takes its armor HP with it; a fuel tank
 * keeps no fuel (the fuel stays in the other tanks, up to their capacity).
 */
export function moveModule(data: GameData, from: Ship, kind: SlotKind, index: number, to: Ship): MoveResult {
  const m = slotList(from, kind)[index];
  if (!m) return { ok: false, text: 'The slot is empty.' };
  if (from === to) return { ok: false, text: 'Select another ship.' };
  const why = removeProblem(from, kind, index, data);
  if (why) return { ok: false, text: why };
  const slot = freeSlotFor(data, to, kind, m);
  if (slot === null) return { ok: false, text: `${to.name} has no empty ${kind === 'hardpoint' ? 'hardpoint' : 'internal slot'} for this module.` };
  const armorBefore = from.armorHp;
  slotList(from, kind)[index] = null;
  const s = travelStats(from, data);
  from.fuel = Math.min(from.fuel, s.fuelCapacity);
  from.armorHp = Math.min(from.armorHp, s.maxArmorHp);
  slotList(to, kind)[slot] = m;
  to.armorHp = Math.min(to.armorHp + (armorBefore - from.armorHp), travelStats(to, data).maxArmorHp);
  return { ok: true, text: `${moduleName(m, data)} moves from ${from.name} to ${to.name}.` };
}

/** Fleet ships that break a required-module rule (Section 11.2), with the first error. */
export function fleetProblems(fleet: Ship[], data: GameData): string[] {
  return fleet.flatMap((ship) => {
    const error = checkLoadout(ship, data).errors[0];
    return error ? [`${ship.name}: ${error}`] : [];
  });
}
