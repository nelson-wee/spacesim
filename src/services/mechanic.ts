// Mechanic (Section 7.4). Repairs hull HP, engine value, and armor plating HP
// of one selected ship, for a price per point (services.json). The refill of
// guided munitions comes in M5.
import type { Game } from '../core/game';
import type { Actor, Location, Ship } from '../core/types';
import type { GameData } from '../data';
import { travelStats } from '../ship/stats';
import { done, refused, type ServiceResult, serviceProblem } from './common';

export interface RepairQuote {
  hull: number;
  engine: number;
  armor: number;
  cost: number;
}

/** Missing points and the cost of a full repair. */
export function quoteRepair(ship: Ship, data: GameData): RepairQuote {
  const s = travelStats(ship, data);
  const p = data.serviceRules.mechanic;
  const hull = Math.max(0, s.maxHullHp - ship.hullHp);
  const engine = Math.max(0, s.maxEngineValue - ship.engineValue);
  const armor = Math.max(0, s.maxArmorHp - ship.armorHp);
  return { hull, engine, armor, cost: hull * p.hullPerPoint + engine * p.enginePerPoint + armor * p.armorPerPoint };
}

export interface RepairResult extends ServiceResult {
  cost: number;
}

/**
 * Repairs one ship as far as the credits allow: hull first, then the engine,
 * then armor plating. Part points are allowed.
 */
export function repair(game: Game, actor: Actor, location: Location, shipIndex: number): RepairResult {
  const { data } = game;
  const problem = serviceProblem(actor, location, 'mechanic', data);
  if (problem) return { ...refused(problem), cost: 0 };
  const ship = actor.fleet[shipIndex];
  if (!ship) return { ...refused('There is no such ship.'), cost: 0 };
  const q = quoteRepair(ship, data);
  if (q.cost <= 1e-9) return { ...refused(`${ship.name} needs no repair.`), cost: 0 };
  const p = data.serviceRules.mechanic;
  let budget = Math.max(0, actor.credits);
  if (budget <= 0) return { ...refused('You do not have sufficient credits for repairs.'), cost: 0 };
  let cost = 0;
  const fix = (missing: number, price: number): number => {
    const points = price > 0 ? Math.min(missing, budget / price) : missing;
    budget -= points * price;
    cost += points * price;
    return points;
  };
  ship.hullHp += fix(q.hull, p.hullPerPoint);
  ship.engineValue += fix(q.engine, p.enginePerPoint);
  ship.armorHp += fix(q.armor, p.armorPerPoint);
  actor.credits -= cost;
  const full = cost >= q.cost - 1e-6 ? '' : ' The repair is not complete.';
  return { ...done(`Repairs to ${ship.name} cost ${Math.round(cost)} cr.${full}`), cost };
}
