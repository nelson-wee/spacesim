// Clone Insurance (owner, 2026-10-28; brief Section 21 item 10 moved into the
// MVP). At a station, the actor insures the flagship: the hull, the loadout,
// and the credits after the premium. The premium is a share of the hull price
// plus the module prices; the share goes up as sector security goes down. If
// the last ship is destroyed, the actor wakes at the insuring station with a
// new copy of the insured ship (full HP and fuel, no cargo) and the insured
// credits. One policy at a time; a new policy replaces the old one. A claim
// uses the policy.
import type { Game } from '../core/game';
import type { Actor, InsurancePolicy, Location, Ship } from '../core/types';
import type { GameData } from '../data';
import { observe } from '../actor/knowledge';
import { hullDef } from '../ship/hull';
import { installedModules } from '../ship/loadout';
import { moduleValues } from '../ship/modules';
import { travelStats } from '../ship/stats';
import { securityLevelInfo } from '../world/security';
import { DEBT_TEXT, done, inDebt, refused, type ServiceResult, serviceProblem } from './common';

/** Hull price plus the price of each installed module. */
export function insuredValue(ship: Ship, data: GameData): number {
  const hull = hullDef(data, ship.hullId).price ?? 0;
  return hull + installedModules(ship).reduce((sum, m) => sum + moduleValues(data, m).price, 0);
}

export interface InsuranceQuote {
  value: number;
  share: number;
  premium: number;
  levelName: string;
}

export function quoteInsurance(game: Game, location: Location, ship: Ship): InsuranceQuote {
  const { data } = game;
  const sector = game.state.world.sectors[location.sectorId];
  const level = securityLevelInfo(sector?.securityValue ?? 0, data);
  const share = data.serviceRules.insurance.premiumShare[level.level] ?? 0;
  const value = insuredValue(ship, data);
  return { value, share, premium: value * share, levelName: level.name };
}

/** A new copy of a ship: full hull, armor, engine value, and fuel; no cargo. */
export function freshCopy(ship: Ship, data: GameData): Ship {
  const copy = structuredClone(ship);
  const s = travelStats(copy, data);
  copy.cargo = {};
  copy.hullHp = s.maxHullHp;
  copy.armorHp = s.maxArmorHp;
  copy.engineValue = s.maxEngineValue;
  copy.fuel = s.fuelCapacity;
  return copy;
}

export interface InsuranceResult extends ServiceResult {
  premium: number;
}

/** Insures the flagship at this station. */
export function buyInsurance(game: Game, actor: Actor, location: Location): InsuranceResult {
  const { data } = game;
  const problem = serviceProblem(actor, location, 'insurance', data);
  if (problem) return { ...refused(problem), premium: 0 };
  if (inDebt(actor)) return { ...refused(DEBT_TEXT), premium: 0 };
  const ship = actor.fleet[actor.flagshipIndex];
  if (!ship) return { ...refused('You have no ship.'), premium: 0 };
  const q = quoteInsurance(game, location, ship);
  if (actor.credits < q.premium - 1e-9) return { ...refused('You do not have sufficient credits.'), premium: 0 };
  actor.credits -= q.premium;
  const policy: InsurancePolicy = {
    locationId: location.id,
    day: game.state.day,
    ship: freshCopy(ship, data),
    credits: actor.credits,
    premium: q.premium,
  };
  actor.insurance = policy;
  return {
    ...done(`You insure ${ship.name} at ${location.name} for ${Math.round(q.premium)} cr. Insured credits: ${Math.round(actor.credits)} cr.`),
    premium: q.premium,
  };
}

/**
 * Uses the policy after the last ship is destroyed. Returns null if the actor
 * has no policy (game over).
 */
export function claimInsurance(game: Game, actor: Actor): ServiceResult | null {
  const policy = actor.insurance;
  if (!policy) return null;
  const location = game.state.world.locations[policy.locationId] as Location;
  actor.fleet = [freshCopy(policy.ship, game.data)];
  actor.flagshipIndex = 0;
  actor.credits = policy.credits;
  actor.position = { kind: 'docked', locationId: location.id };
  actor.insurance = null;
  observe(game, actor);
  return done(`Your clone wakes at ${location.name} with a new ${hullDef(game.data, policy.ship.hullId).name} and ${Math.round(policy.credits)} cr. The policy is used.`);
}
