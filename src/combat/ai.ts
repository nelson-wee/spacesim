// Combat AI (Section 13.8, Q-25). Each AI ship uses the same orders and rules
// as the player: power use, then a move, then fire.
// - Raider: attacks the hostile ship with the most cargo; keeps the best range
//   for its weapons; retreats to the edge below retreatHull.
// - Trader: moves to the nearest edge; fires only if attacked.
// - Attack (the player side in sim-combat): attacks the nearest hostile ship;
//   keeps the best range; does not retreat.
import type { Rng } from '../core/rng';
import type { GameData } from '../data';
import { moduleValues } from '../ship/modules';
import { distance, edgeDistance, isActive, lineOfFire, parseKey, pathTo, reachable } from './geometry';
import { applyOrder, hostile } from './resolver';
import { combatStats, drawOf, heatState, hitChance, isDirectWeapon, moduleAt, moduleSlots, moveBudget, slotKey } from './rules';
import type { Battle, CombatShip, Effect, SlotRef, Vec2 } from './types';

/**
 * AI power use (Section 13.8): switch ON modules in the loadout priority order
 * until no power is left; modules that do not fit go OFF. Passive modules stay
 * ON. If heat is Hot, switch OFF the weapon with the highest heat per shot.
 * Modules that go OFF go OFF first, so a shield that stays ON keeps its points.
 */
export function aiPower(b: Battle, s: CombatShip, data: GameData, rng: Rng, effects: Effect[]): void {
  const st = combatStats(s, data);
  let left = st.powerSupply;
  const want = new Map<string, boolean>();
  const slots = moduleSlots(s);
  for (const slot of slots) {
    const m = moduleAt(s, slot);
    if (m && drawOf(m, data) === 0) want.set(slotKey(slot), true);
  }
  for (const id of s.powerPriority) {
    for (const slot of slots) {
      const m = moduleAt(s, slot);
      if (!m || m.moduleId !== id || want.has(slotKey(slot))) continue;
      const draw = drawOf(m, data);
      want.set(slotKey(slot), draw <= left + 1e-9);
      if (draw <= left + 1e-9) left -= draw;
    }
  }
  if (heatTooHigh(s, data, st, want)) {
    let worst: SlotRef | null = null;
    let worstHeat = -1;
    for (const slot of slots) {
      const m = moduleAt(s, slot);
      if (!m || !want.get(slotKey(slot)) || !isDirectWeapon(m, data)) continue;
      const h = moduleValues(data, m).heatPerShot ?? 0;
      if (h > worstHeat) {
        worstHeat = h;
        worst = slot;
      }
    }
    if (worst) want.set(slotKey(worst), false);
  }
  for (const pass of [false, true]) {
    for (const slot of slots) {
      const on = want.get(slotKey(slot)) ?? false;
      if (on === pass) applyOrder(b, s, { kind: 'toggle', slot, on }, data, rng, effects);
    }
  }
}

function cargoValue(s: CombatShip, data: GameData): number {
  return Object.entries(s.ship.cargo).reduce((sum, [c, lot]) => sum + lot.units * (data.commodityById.get(c)?.basePrice ?? 0), 0);
}

/**
 * When the AI switches OFF its hottest weapon. Raider and Trader: when heat is
 * Hot (Section 13.8). Attack AI (the player side, Q-25): only when firing all
 * weapons that stay ON would overheat the ship on this turn, as a player would.
 */
function heatTooHigh(s: CombatShip, data: GameData, st: ReturnType<typeof combatStats>, want: Map<string, boolean>): boolean {
  if (s.ai !== 'attack') return heatState(s, data, st) === 'hot';
  let heat = s.heat - st.cooling;
  for (const slot of moduleSlots(s)) {
    const m = moduleAt(s, slot);
    if (!m || !want.get(slotKey(slot))) continue;
    const v = moduleValues(data, m);
    heat += (v.heatPerTurn ?? 0) + (isDirectWeapon(m, data) ? (v.heatPerShot ?? 0) : 0);
  }
  return heat >= st.heatCapacity;
}

/** The ship that the AI wants to attack. */
export function aiTarget(b: Battle, s: CombatShip, data: GameData): CombatShip | null {
  const foes = b.ships.filter((o) => isActive(o) && hostile(s, o));
  if (foes.length === 0) return null;
  const byDistance = (x: CombatShip, y: CombatShip) => distance(s, x) - distance(s, y) || x.id - y.id;
  if (s.ai === 'raider') return [...foes].sort((x, y) => cargoValue(y, data) - cargoValue(x, data) || byDistance(x, y))[0] ?? null;
  return [...foes].sort(byDistance)[0] ?? null;
}

/** Weapons that are ON and can fire this turn. */
function readyWeapons(s: CombatShip, data: GameData): SlotRef[] {
  if (s.overheated) return [];
  return moduleSlots(s).filter((slot) => {
    const m = moduleAt(s, slot);
    return m !== null && m.on && isDirectWeapon(m, data) && !s.fired.includes(slotKey(slot));
  });
}

/** The wanted distance: bestRangeShare of the shortest range of the weapons that are ON (Section 13.8). */
export function wantedDistance(s: CombatShip, data: GameData): number {
  const ranges = moduleSlots(s)
    .map((slot) => moduleAt(s, slot))
    .filter((m) => m !== null && m.on && isDirectWeapon(m, data))
    .map((m) => moduleValues(data, m as NonNullable<typeof m>).range ?? 0);
  if (ranges.length === 0) return 1;
  return Math.max(1, Math.round(Math.min(...ranges) * data.balance.combat.bestRangeShare));
}

/** How far ahead (in turns of movement) the AI looks for a cell with a clear line of fire. */
const LOOK_AHEAD_TURNS = 4;

function aiMove(b: Battle, s: CombatShip, target: CombatShip | null, data: GameData, rng: Rng, effects: Effect[]): void {
  const budget = moveBudget(s, data);
  if (budget <= 0) return;
  const toEdge = s.retreating || s.ai === 'trader';
  const want = wantedDistance(s, data);
  // Look some turns ahead, so that the ship can go around an asteroid field.
  const reach = reachable(b, s, toEdge ? budget : budget * LOOK_AHEAD_TURNS);
  let goal: Vec2 = s.pos;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [key, steps] of reach.steps) {
    const at = parseKey(key);
    let score: number;
    if (toEdge) score = edgeDistance(b, s, at) * 100 + steps;
    else if (target) {
      const lof = lineOfFire(b, s, target, at);
      // A clear line of fire first, then the wanted distance, then fewer steps (cells for this turn count less).
      score = (lof.clear ? 0 : 10000) + Math.abs(lof.distance - want) * 100 + steps;
    } else score = steps;
    if (score < bestScore) {
      bestScore = score;
      goal = at;
    }
  }
  // Go along the path to the goal, as far as this turn's movement allows.
  const path = pathTo(reach, goal) ?? [s.pos];
  const to = path[Math.min(budget, path.length - 1)] ?? s.pos;
  if (to.x !== s.pos.x || to.y !== s.pos.y) applyOrder(b, s, { kind: 'move', to }, data, rng, effects);
}

function aiFire(b: Battle, s: CombatShip, target: CombatShip | null, data: GameData, rng: Rng, effects: Effect[]): void {
  if (s.ai === 'trader' && !s.attacked) return;
  // A retreating Raider runs to the edge; it does not stop to fight (Section 13.8).
  if (s.retreating) return;
  for (const slot of readyWeapons(s, data)) {
    if (!isActive(s)) return;
    const m = moduleAt(s, slot);
    if (!m) continue;
    const w = moduleValues(data, m);
    const foes = b.ships.filter((o) => isActive(o) && hostile(s, o));
    let pick: CombatShip | null = target && isActive(target) && hitChance(b, s, w, target, 'hull', data) > 0 ? target : null;
    if (!pick) {
      let bestChance = 0;
      for (const o of foes) {
        const c = hitChance(b, s, w, o, 'hull', data);
        if (c > bestChance) {
          bestChance = c;
          pick = o;
        }
      }
    }
    if (pick) applyOrder(b, s, { kind: 'fire', slot, target: pick.id, aim: 'hull' }, data, rng, effects);
  }
}

/** One AI ship's turn: power, move, fire. */
export function runAi(b: Battle, s: CombatShip, data: GameData, rng: Rng, effects: Effect[]): void {
  if (!isActive(s)) return;
  const st = combatStats(s, data);
  if (s.ai === 'raider' && s.ship.hullHp < data.balance.combat.retreatHull * st.maxHullHp) s.retreating = true;
  aiPower(b, s, data, rng, effects);
  const target = aiTarget(b, s, data);
  aiMove(b, s, target, data, rng, effects);
  if (!isActive(s)) return;
  aiFire(b, s, aiTarget(b, s, data) ?? target, data, rng, effects);
}
