// Ships from loadouts (data/loadouts.json).
import type { InstalledModule, Ship } from '../core/types';
import type { GameData, LoadoutSlot } from '../data';
import { hullDef, maxEngineValue } from './hull';
import { moduleValues } from './modules';

function install(slot: LoadoutSlot): InstalledModule | null {
  return slot ? { moduleId: slot.moduleId, size: slot.size, tier: slot.tier, on: true } : null;
}

export function installedModules(ship: Ship): InstalledModule[] {
  return [...ship.hardpoints, ...ship.internal].filter((m): m is InstalledModule => m !== null);
}

/** A new ship with the loadout, full fuel, full HP, and no cargo. */
export function createShipFromLoadout(data: GameData, loadoutId: string, id: string, name: string): Ship {
  const loadout = data.loadoutById.get(loadoutId);
  if (!loadout) throw new Error(`Unknown loadout ${loadoutId}`);
  const hull = hullDef(data, loadout.hullId);
  const ship: Ship = {
    id,
    name,
    hullId: hull.id,
    hardpoints: loadout.hardpoints.map(install),
    internal: loadout.internal.map(install),
    cargo: {},
    fuel: 0,
    hullHp: hull.hp,
    armorHp: 0,
    engineValue: maxEngineValue(hull, data),
  };
  let fuel = 0;
  let armorHp = 0;
  for (const m of installedModules(ship)) {
    const v = moduleValues(data, m);
    fuel += v.fuelCapacity ?? 0;
    armorHp += v.armorHp ?? 0;
  }
  ship.fuel = fuel;
  ship.armorHp = armorHp;
  return ship;
}
