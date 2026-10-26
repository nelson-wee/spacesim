// Hull lookups (Section 11.1).
import type { GameData, Hull, SlotSize } from '../data';
import { slotSizes } from '../data';

export function hullDef(data: GameData, hullId: string): Hull {
  const hull = data.hullById.get(hullId);
  if (!hull) throw new Error(`Unknown hull ${hullId}`);
  return hull;
}

export function hardpointSizes(hull: Hull): SlotSize[] {
  return slotSizes(hull.hardpoints);
}

export function internalSizes(hull: Hull): SlotSize[] {
  return slotSizes(hull.internal);
}

/** Engine value at full repair: a share of hull HP (Section 11.1). */
export function maxEngineValue(hull: Hull, data: GameData): number {
  return hull.hp * data.balance.ship.engineValueShare;
}
