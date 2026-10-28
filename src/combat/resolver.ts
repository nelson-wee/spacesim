// The turn resolver (Sections 4.2, 13.3). A pure function of the battle state
// and the player orders: it returns a new state and the effects. It uses only
// the battle's combat RNG state, and it runs headless (G-13).
import { Rng } from '../core/rng';
import type { GameData } from '../data';
import { moduleValues } from '../ship/modules';
import { runAi } from './ai';
import { cellAt, isActive, lineOfFire, onEdge, pathTo, reachable, shipCells } from './geometry';
import {
  applyHit,
  combatStats,
  fleeFuel,
  fuelStep,
  heatStep,
  hitChance,
  drawOf,
  isDirectWeapon,
  moduleAt,
  moveBudget,
  moveCost,
  powerStep,
  shieldStep,
  spendPower,
  slotKey,
  toggleModule,
} from './rules';
import type { Battle, CombatShip, Effect, Order } from './types';

export function hostile(a: CombatShip, b: CombatShip): boolean {
  return a.side !== b.side && a.side !== 'neutral' && b.side !== 'neutral';
}

export function shipById(b: Battle, id: number): CombatShip | undefined {
  return b.ships.find((s) => s.id === id);
}

/** True if the ship flees when it reaches an edge cell (the player; retreating ships; traders). */
function fleesAtEdge(s: CombatShip): boolean {
  return s.ai === 'human' || s.retreating || s.ai === 'trader';
}

function destroyIfDead(s: CombatShip, effects: Effect[], b: Battle): void {
  if (s.status === 'active' && s.ship.hullHp <= 0) {
    s.status = 'destroyed';
    effects.push({ kind: 'destroy', shipId: s.id });
    b.log.push(`${s.name} is destroyed.`);
  }
}

/**
 * Applies one order of one ship, with the rules of Sections 11.5, 12.3, and
 * 13.3. Returns why the order is refused, or null. The same function runs the
 * player's orders and the AI's orders.
 */
export function applyOrder(b: Battle, s: CombatShip, order: Order, data: GameData, rng: Rng, effects: Effect[]): string | null {
  if (!isActive(s)) return 'The ship is not in the battle.';
  if (s.overheated) return 'Overheat: the ship is offline until it cools down.';
  if (order.kind === 'toggle') return toggleModule(s, order.slot, order.on, data);
  if (order.kind === 'move') {
    const budget = moveBudget(s, data);
    if (budget <= 0) return s.ship.fuel <= 1e-9 ? 'No fuel: the ship cannot move.' : 'No movement left this turn.';
    const path = pathTo(reachable(b, s, budget), order.to);
    if (!path) return 'The ship cannot get there this turn.';
    if (path.length <= 1) return null;
    // The first move of a turn pays the engines' draw (Q-41).
    const noPower = spendPower(s, moveCost(s, data), data, rng, effects);
    if (noPower) return `${noPower} The engines need ${moveCost(s, data)}.`;
    s.pos = order.to;
    s.moved += path.length - 1;
    effects.push({ kind: 'move', shipId: s.id, path });
    if (fleesAtEdge(s) && combatStats(s, data).engineCount > 0 && onEdge(b, s)) {
      s.status = 'fled';
      s.ship.fuel = Math.max(0, s.ship.fuel - fleeFuel(s, data));
      effects.push({ kind: 'flee', shipId: s.id });
      b.log.push(`${s.name} flees.`);
    }
    return null;
  }
  // Fire.
  const m = moduleAt(s, order.slot);
  if (!m || !isDirectWeapon(m, data)) return 'That is not a weapon that can fire now.';
  if (!m.on) return 'The weapon is OFF.';
  if (s.fired.includes(slotKey(order.slot))) return 'The weapon fired this turn.';
  const t = shipById(b, order.target);
  if (!t || !isActive(t) || !hostile(s, t)) return 'No valid target.';
  const w = moduleValues(data, m);
  const aim = w.area !== undefined ? 'hull' : order.aim;
  const chance = hitChance(b, s, w, t, aim, data);
  if (chance <= 0) return 'Out of range, or no line of fire.';
  // Each shot costs the weapon's draw (Q-41).
  const noPower = spendPower(s, drawOf(m, data), data, rng, effects);
  if (noPower) return `${noPower} The weapon needs ${drawOf(m, data)}.`;
  s.fired.push(slotKey(order.slot));
  s.shotHeat += w.heatPerShot ?? 0;
  t.attacked = true;
  const lof = lineOfFire(b, s, t);
  if (w.area !== undefined) {
    // Flak (Section 12.2): an area around the nearest target cell; a flat hit chance on each hostile ship in it.
    const half = Math.floor(w.area / 2);
    const center = lof.to;
    effects.push({ kind: 'flak', shipId: s.id, from: lof.from, center });
    for (const o of b.ships) {
      if (!isActive(o) || !hostile(s, o)) continue;
      const inArea = shipCells(o).find((c) => Math.abs(c.x - center.x) <= half && Math.abs(c.y - center.y) <= half);
      if (!inArea) continue;
      o.attacked = true;
      if (rng.chance(w.flatHitChance ?? 0)) {
        applyHit(o, w, 'hull', inArea, data, effects);
        destroyIfDead(o, effects, b);
      }
    }
    return null;
  }
  const hit = rng.chance(chance);
  effects.push({ kind: 'shot', shipId: s.id, moduleId: m.moduleId, from: lof.from, to: lof.to, targetId: t.id, hit });
  if (hit) {
    applyHit(t, w, aim, lof.to, data, effects);
    destroyIfDead(t, effects, b);
  }
  return null;
}

const MORALE_KEY = { raider: 'raider', trader: 'trader', attack: 'attack' } as const;

/** Morale (Section 13.8): one surrender roll when hull falls below moraleHull or the engine value is 0. */
function moraleStep(b: Battle, s: CombatShip, data: GameData, rng: Rng, effects: Effect[]): void {
  if (s.ai === 'human' || s.moraleRolled || !isActive(s)) return;
  const c = data.balance.combat;
  const st = combatStats(s, data);
  if (s.ship.hullHp >= c.moraleHull * st.maxHullHp && s.ship.engineValue > 0) return;
  s.moraleRolled = true;
  if (rng.chance(c.surrenderChance[MORALE_KEY[s.ai]])) {
    s.status = 'surrendered';
    effects.push({ kind: 'surrender', shipId: s.id });
    b.log.push(`${s.name} surrenders.`);
  }
}

/** The battle result after a step, or null if the battle goes on (Section 13.7). */
export function battleResult(b: Battle, data: GameData): Battle['result'] {
  const player = shipById(b, b.playerId);
  if (!player || player.status === 'destroyed') return 'loss';
  if (player.status === 'fled') return 'fled';
  if (!b.ships.some((s) => hostile(player, s) && isActive(s))) return 'win';
  if (b.turn >= data.balance.combat.maxTurns) return 'draw';
  return null;
}

export interface TurnOutput {
  battle: Battle;
  effects: Effect[];
  /** Player orders that the resolver refused, with the reason. */
  refused: string[];
}

/**
 * One turn (Section 13.3): player phase, other ships, (munitions and point
 * defense in M5), power (Q-41), heat, shields, fuel, (reinforcements in M5), morale. With
 * `orders` null, the player ship uses its AI (sim-combat).
 */
export function resolveTurn(input: Battle, orders: Order[] | null, data: GameData): TurnOutput {
  const b = structuredClone(input);
  const rng = new Rng(b.rng);
  const effects: Effect[] = [];
  const refused: string[] = [];
  if (b.result) return { battle: b, effects, refused };
  for (const s of b.ships) {
    s.moved = 0;
    s.fired = [];
    s.spent = 0;
  }
  const player = shipById(b, b.playerId);
  // 1. Player phase.
  if (player && isActive(player)) {
    if (orders && player.ai === 'human') {
      for (const o of orders) {
        const why = applyOrder(b, player, o, data, rng, effects);
        if (why) refused.push(why);
      }
    } else runAi(b, player, data, rng, effects);
  }
  b.result = battleResult(b, data);
  // 2. Other ships, in id order.
  if (!b.result) {
    for (const s of b.ships) {
      if (s.id === b.playerId || !isActive(s)) continue;
      runAi(b, s, data, rng, effects);
      if (battleResult(b, data) === 'loss') break;
    }
  }
  // Power (Q-41): unused power charges the capacitor; modules that lost power get it back.
  for (const s of b.ships) if (isActive(s)) powerStep(s, data);
  // 5-7. Heat, shields, fuel; 9. morale.
  for (const s of b.ships) {
    if (!isActive(s)) continue;
    heatStep(s, data, effects);
    destroyIfDead(s, effects, b);
  }
  for (const s of b.ships) if (isActive(s)) shieldStep(s, data);
  for (const s of b.ships) if (isActive(s)) fuelStep(s, data);
  for (const s of b.ships) moraleStep(b, s, data, rng, effects);
  b.turn += 1;
  b.result = battleResult(b, data);
  return { battle: b, effects, refused };
}

/** Free cells check for the renderer and placement: true if no asteroid. */
export function isOpen(b: Battle, x: number, y: number): boolean {
  return cellAt(b, x, y) !== '#';
}
