// Loadout rules (Sections 11.1, 11.2, 11.5): slot fit, required modules, and
// the power warning. The Outfitter and the travel code use them.
import type { InstalledModule, Ship } from '../core/types';
import { type GameData, type SlotSize, sizeFits } from '../data';
import { hardpointSizes, hullDef, internalSizes } from './hull';
import { moduleDef } from './modules';
import { type ShipStats, travelStats } from './stats';

export type SlotKind = 'hardpoint' | 'internal';

export interface LoadoutCheck {
  /** Rules that stop the ship from leaving a location (red warnings). */
  errors: string[];
  /** Power warnings (yellow), Q-41. */
  warnings: string[];
  stats: ShipStats;
}

/** Size of each slot of one kind, in loadout order (S, then M, then L). */
export function slotSizesOf(ship: Ship, kind: SlotKind, data: GameData): SlotSize[] {
  const hull = hullDef(data, ship.hullId);
  return kind === 'hardpoint' ? hardpointSizes(hull) : internalSizes(hull);
}

/** Why a module cannot go in a slot, or null if it fits (Section 11.1). */
export function fitProblem(ship: Ship, kind: SlotKind, index: number, moduleId: string, size: SlotSize, data: GameData): string | null {
  const def = moduleDef(data, moduleId);
  const sizes = slotSizesOf(ship, kind, data);
  const slotSize = sizes[index];
  if (slotSize === undefined) return `There is no ${kind} slot ${index + 1}.`;
  if (def.slot !== kind) return `${def.name} goes in a ${def.slot === 'hardpoint' ? 'hardpoint' : 'internal slot'}.`;
  if (!def.sizes[size]) return `${def.name} has no size ${size}.`;
  if (!sizeFits(size, slotSize)) return `A size ${size} module does not fit a size ${slotSize} slot.`;
  const slots = kind === 'hardpoint' ? ship.hardpoints : ship.internal;
  if (slots[index]) return 'The slot is not empty.';
  return null;
}

/** The required-module rules (Section 11.2) and the power warning (Section 17.3). */
export function checkLoadout(ship: Ship, data: GameData): LoadoutCheck {
  const stats = travelStats(ship, data);
  const errors: string[] = [];
  const warnings: string[] = [];
  const engines = [...ship.internal, ...ship.hardpoints].filter(
    (m): m is InstalledModule => m !== null && moduleDef(data, m.moduleId).category === 'engine',
  );
  if (engines.length === 0) errors.push('No engine: the ship cannot leave.');
  if (stats.powerSupply < stats.enginePowerDraw) {
    errors.push(`Power ${stats.powerSupply} is below the engine draw ${stats.enginePowerDraw}: add a reactor.`);
  }
  if (stats.cargoMass > stats.cargoCapacity + 1e-9) {
    errors.push(`Cargo ${stats.cargoMass.toFixed(1)} t is above the capacity ${stats.cargoCapacity} t.`);
  }
  if (stats.powerReserve + stats.powerMove > stats.powerSupply) {
    warnings.push(
      `Combat power: reserved ${stats.powerReserve} + a move ${stats.powerMove} is above the reactors' ${stats.powerSupply}. A move in combat takes power from the shields.`,
    );
  }
  return { errors, warnings, stats };
}

/** True if the ship may leave a location (Section 11.2). */
export function canLeave(ship: Ship, data: GameData): boolean {
  return checkLoadout(ship, data).errors.length === 0;
}
