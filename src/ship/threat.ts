// Threat units (Section 10.5, M5-THREAT-01, M5-THREAT-02). One Pirate Raider
// = 10 TU. TU uses the installed loadout at full repair, not the power
// setting. A uniform damage scale does not change TU (it is a ratio).
import type { Ship } from '../core/types';
import type { GameData } from '../data';
import { createShipFromLoadout, installedModules } from './loadout';
import { moduleDef, moduleValues } from './modules';
import { travelStats } from './stats';

/** Sum over weapons: damage x (vsShield + vsHull) / 2 x trackFactor(maneuver 40) x ammoFactor. */
export function firepower(ship: Ship, data: GameData): number {
  const t = data.balance.threat;
  let sum = 0;
  for (const m of installedModules(ship)) {
    const category = moduleDef(data, m.moduleId).category;
    if (category !== 'laser' && category !== 'ballistic' && category !== 'guided') continue;
    const v = moduleValues(data, m);
    let track: number;
    if (v.area !== undefined) track = t.flakTrackFactor;
    else {
      const aim = category === 'guided' ? (v.munitionAgility ?? 0) : (v.tracking ?? 0);
      track = aim / (aim + t.trackManeuver);
    }
    sum += (v.damage ?? 0) * (((v.vsShield ?? 1) + (v.vsHull ?? 1)) / 2) * track * (t.ammoFactor[m.moduleId] ?? 1);
  }
  return sum;
}

/** hullHP + armorPlatingHP + shieldCapacity + 10 x armor, at full repair (with all modules ON). */
export function durability(ship: Ship, data: GameData): number {
  return travelStats(allOn(ship), data).durability;
}

function allOn(ship: Ship): Ship {
  const copy = structuredClone(ship);
  for (const m of installedModules(copy)) m.on = true;
  return copy;
}

export function rawThreat(ship: Ship, data: GameData): number {
  return Math.sqrt(durability(ship, data) * firepower(ship, data));
}

const referenceCache = new WeakMap<GameData, number>();

function referenceRaw(data: GameData): number {
  let raw = referenceCache.get(data);
  if (raw === undefined) {
    raw = rawThreat(createShipFromLoadout(data, data.balance.threat.referenceLoadout, 'ref', 'ref'), data);
    referenceCache.set(data, raw);
  }
  return raw;
}

/** TU of one ship. */
export function shipTu(ship: Ship, data: GameData): number {
  return (data.balance.threat.referenceTu * rawThreat(ship, data)) / referenceRaw(data);
}

/** TU of a default loadout. */
export function loadoutTu(loadoutId: string, data: GameData): number {
  return shipTu(createShipFromLoadout(data, loadoutId, 'tu', 'tu'), data);
}

/** Group TU: sum of ship TU x (1 + groupBonus x (count - 1)). */
export function groupTu(tus: number[], data: GameData): number {
  if (tus.length === 0) return 0;
  const sum = tus.reduce((a, b) => a + b, 0);
  return sum * (1 + data.balance.threat.groupBonus * (tus.length - 1));
}
