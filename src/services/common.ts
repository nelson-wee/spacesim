// Shared service rules: the result type, service lookup, debt (Section 8.6),
// and the Pirate Haven price rule (Section 7.3).
import type { Game } from '../core/game';
import type { Actor, Location, LogKind } from '../core/types';
import type { GameData } from '../data';

/** The result of one service action. The UI shows `text`; the simulation does not need the bus. */
export interface ServiceResult {
  ok: boolean;
  text: string;
}

export function done(text: string): ServiceResult {
  return { ok: true, text };
}

export function refused(text: string): ServiceResult {
  return { ok: false, text };
}

/** Puts a result in the message log. */
export function report(game: Game, result: ServiceResult, okKind: LogKind = 'info'): ServiceResult {
  game.bus.message(result.text, result.ok ? okKind : 'warning');
  return result;
}

export function hasService(location: Location, serviceId: string): boolean {
  return location.services.includes(serviceId);
}

/** True if the actor is docked at this location. */
export function isDockedAt(actor: Actor, location: Location): boolean {
  return actor.position.kind === 'docked' && actor.position.locationId === location.id;
}

/** Checks that the actor is docked at a location that has the service. */
export function serviceProblem(actor: Actor, location: Location, serviceId: string, data: GameData): string | null {
  if (!isDockedAt(actor, location)) return `You are not docked at ${location.name}.`;
  if (!hasService(location, serviceId)) {
    const name = data.services.find((s) => s.id === serviceId)?.name ?? serviceId;
    return `${location.name} has no ${name}.`;
  }
  return null;
}

/** While credits are below 0, the actor cannot buy hulls, modules, or contracts (Section 8.6). */
export function inDebt(actor: Actor): boolean {
  return actor.credits < 0;
}

export const DEBT_TEXT = 'You are in debt. Sell cargo to pay the debt first.';

export function isPirateHaven(location: Location, data: GameData): boolean {
  return location.bodyType === data.serviceRules.pirateHaven.bodyType;
}

/** Highest hull and module tier that the location sells (Section 7.3). */
export function maxSaleTier(location: Location, data: GameData): number {
  return isPirateHaven(location, data) ? data.serviceRules.pirateHaven.maxTier : location.techLevel;
}

/** Price multiplier for hulls and modules at the location (Pirate Havens 130%). */
export function salePriceMult(location: Location, data: GameData): number {
  return isPirateHaven(location, data) ? data.serviceRules.pirateHaven.priceMult : 1;
}
