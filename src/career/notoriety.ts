// Notoriety (Section 15, Q-21, M5-NOT): 0 to max. Levels: Clean, Suspect,
// Wanted. Suspect: Secure sectors refuse docking. Wanted: High and Secure
// sectors refuse docking, and patrols attack. Pirate Havens accept all.
import type { Actor, Location, Sector } from '../core/types';
import type { GameData } from '../data';
import { isPirateHaven } from '../services/common';
import { securityLevel } from '../world/security';

export type NotorietyLevel = 'clean' | 'suspect' | 'wanted';

export function notorietyLevel(actor: Actor, data: GameData): NotorietyLevel {
  const n = data.balance.notoriety;
  return actor.notoriety >= n.wanted ? 'wanted' : actor.notoriety >= n.suspect ? 'suspect' : 'clean';
}

export function addNotoriety(actor: Actor, amount: number, data: GameData): void {
  actor.notoriety = Math.min(data.balance.notoriety.max, Math.max(0, actor.notoriety + amount));
}

/** Each day: notoriety goes down by `perDay` (it is negative). */
export function notorietyDay(actor: Actor, data: GameData): void {
  addNotoriety(actor, data.balance.notoriety.perDay, data);
}

/** Why the location refuses docking, or null (M5-NOT-03). */
export function dockingRefusal(actor: Actor, location: Location, sector: Sector, data: GameData): string | null {
  if (isPirateHaven(location, data)) return null;
  const level = notorietyLevel(actor, data);
  const sec = securityLevel(sector.securityValue, data);
  if (level === 'wanted' && sec >= 3) return `${location.name} refuses docking: you are Wanted.`;
  if (level === 'suspect' && sec >= 4) return `${location.name} refuses docking: you are a Suspect in a Secure sector.`;
  return null;
}
