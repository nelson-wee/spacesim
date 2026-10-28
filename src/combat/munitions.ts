// Guided munitions and point defense (Sections 12.2, 12.4, Q-44). A guided
// weapon launches a munition. It does not move or hit in the turn it is
// launched. In each munition step it moves up to `speed` cells toward its
// target, around asteroids (ships do not block it). Point defense fires during
// the move: when a munition comes within range of a ship with point defense
// that is hostile to it, each point defense module with shots left this turn
// fires one shot, before the hit roll. Next to the target footprint, the
// munition rolls agility / (agility + target maneuver), then it is removed.
import type { Rng } from '../core/rng';
import type { InstalledModule } from '../core/types';
import type { GameData, ModuleValues } from '../data';
import { moduleDef, moduleValues } from '../ship/modules';
import { cellAt, distance, isActive, lineCells, nearestPair, shipCells } from './geometry';
import { applyHit, combatStats, destroyIfDead, hostile, moduleAt, moduleSlots, slotKey } from './rules';
import type { Battle, CombatShip, Effect, Munition, SlotRef, Vec2 } from './types';

export function isGuided(m: InstalledModule, data: GameData): boolean {
  return moduleDef(data, m.moduleId).category === 'guided';
}

/** Rounds left (missing = full). */
export function ammoOf(m: InstalledModule, data: GameData): number {
  return m.ammo ?? moduleValues(data, m).ammo ?? 0;
}

/** Hit chance of a munition against a ship: agility / (agility + maneuver) (Section 12.4). */
export function guidedHitChance(w: ModuleValues, t: CombatShip, data: GameData): number {
  const agility = w.munitionAgility ?? 0;
  const maneuver = combatStats(t, data).maneuver;
  return agility + maneuver > 0 ? agility / (agility + maneuver) : 0;
}

/** True if the target is in launch range (Chebyshev distance between nearest cells; no line of fire needed). */
export function inLaunchRange(s: CombatShip, w: ModuleValues, t: CombatShip, at?: Vec2): boolean {
  return distance(s, t, at) <= (w.range ?? 0);
}

/**
 * Launches one munition (the caller has checked the order and paid power).
 * It starts on the first open cell next to the ship on the line to the target.
 */
export function launchMunition(b: Battle, s: CombatShip, slot: SlotRef, t: CombatShip, data: GameData, effects: Effect[]): void {
  const m = moduleAt(s, slot) as InstalledModule;
  const w = moduleValues(data, m);
  m.ammo = ammoOf(m, data) - 1;
  const pair = nearestPair(s, t);
  const own = new Set(shipCells(s).map((c) => `${c.x},${c.y}`));
  const start = [...lineCells(pair.from, pair.to), pair.to].find((c) => !own.has(`${c.x},${c.y}`) && cellAt(b, c.x, c.y) !== '#') ?? pair.from;
  const munition: Munition = {
    id: b.nextMunitionId++,
    ownerId: s.id,
    side: s.side,
    targetId: t.id,
    moduleId: m.moduleId,
    size: m.size,
    tier: m.tier,
    pos: start,
    life: w.munitionLife ?? 1,
    hp: w.munitionHp ?? 1,
    fresh: true,
  };
  b.munitions.push(munition);
  effects.push({ kind: 'launch', shipId: s.id, moduleId: m.moduleId, munitionId: munition.id, at: start });
}

const key = (c: Vec2) => `${c.x},${c.y}`;

/**
 * Shortest path (8 directions) from `from` to a cell next to the target
 * footprint, around asteroids. Ships do not block munitions. Returns the
 * cells after `from`, or null if there is no path.
 */
export function munitionPath(b: Battle, from: Vec2, t: CombatShip): Vec2[] | null {
  const target = new Set(shipCells(t).map(key));
  const goal = (c: Vec2) => {
    if (target.has(key(c))) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (target.has(`${c.x + dx},${c.y + dy}`)) return true;
    return false;
  };
  if (goal(from)) return [];
  const prev = new Map<string, Vec2 | null>([[key(from), null]]);
  const queue: Vec2[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i] as Vec2;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const n = { x: c.x + dx, y: c.y + dy };
        const k = key(n);
        if (prev.has(k) || target.has(k) || cellAt(b, n.x, n.y) === '#') continue;
        prev.set(k, c);
        if (goal(n)) {
          const path: Vec2[] = [n];
          let p = c;
          while (key(p) !== key(from)) {
            path.unshift(p);
            p = prev.get(key(p)) as Vec2;
          }
          return path;
        }
        queue.push(n);
      }
    }
  }
  return null;
}

/** Point defense against one munition at its cell. Returns true if the munition is destroyed. */
function pointDefense(b: Battle, mu: Munition, data: GameData, rng: Rng, effects: Effect[]): boolean {
  for (const s of b.ships) {
    if (!isActive(s) || s.overheated || s.side === mu.side || s.side === 'neutral') continue;
    const owner = b.ships.find((o) => o.id === mu.ownerId);
    if (owner && !hostile(owner, s)) continue;
    for (const slot of moduleSlots(s)) {
      const m = moduleAt(s, slot);
      if (!m || !m.on || moduleDef(data, m.moduleId).category !== 'pointDefense' || s.unpowered.includes(slotKey(slot))) continue;
      const v = moduleValues(data, m);
      const k = slotKey(slot);
      const used = s.pdShots[k] ?? 0;
      if (used >= (v.shotsPerTurn ?? 0)) continue;
      const cells = shipCells(s);
      const near = cells.reduce((best, c) => (Math.max(Math.abs(c.x - mu.pos.x), Math.abs(c.y - mu.pos.y)) < Math.max(Math.abs(best.x - mu.pos.x), Math.abs(best.y - mu.pos.y)) ? c : best), cells[0] as Vec2);
      if (Math.max(Math.abs(near.x - mu.pos.x), Math.abs(near.y - mu.pos.y)) > (v.range ?? 0)) continue;
      s.pdShots[k] = used + 1;
      s.shotHeat += v.heatPerShot ?? 0;
      const hit = rng.chance(v.hitChance ?? 0);
      effects.push({ kind: 'pd', shipId: s.id, munitionId: mu.id, from: near, to: { ...mu.pos }, hit });
      if (hit) {
        mu.hp -= v.damage ?? 0;
        if (mu.hp <= 1e-9) {
          effects.push({ kind: 'munitionDown', munitionId: mu.id, at: { ...mu.pos } });
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * The munition step (Section 13.3 step 3, with point defense during the move, Q-44).
 * Munitions launched this turn wait for the next step.
 */
export function munitionStep(b: Battle, data: GameData, rng: Rng, effects: Effect[]): void {
  const keep: Munition[] = [];
  for (const mu of b.munitions) {
    if (mu.fresh) {
      mu.fresh = false;
      keep.push(mu);
      continue;
    }
    const t = b.ships.find((s) => s.id === mu.targetId);
    const w = moduleValues(data, { moduleId: mu.moduleId, size: mu.size, tier: mu.tier, on: true });
    if (!t || !isActive(t)) {
      effects.push({ kind: 'munitionLost', munitionId: mu.id, at: { ...mu.pos } });
      continue;
    }
    const route = munitionPath(b, mu.pos, t);
    const path = route ?? [];
    const steps = path.slice(0, Math.max(0, Math.floor(w.munitionSpeed ?? 0)));
    const moved: Vec2[] = [{ ...mu.pos }];
    let gone = pointDefense(b, mu, data, rng, effects);
    for (const c of steps) {
      if (gone) break;
      mu.pos = c;
      moved.push(c);
      gone = pointDefense(b, mu, data, rng, effects);
    }
    if (moved.length > 1) effects.push({ kind: 'munitionMove', munitionId: mu.id, moduleId: mu.moduleId, path: moved });
    if (gone) continue;
    // Next to the target: the hit roll; hit or miss, the munition is removed.
    if (route !== null && steps.length === path.length) {
      const hit = rng.chance(guidedHitChance(w, t, data));
      const at = nearestCell(t, mu.pos);
      effects.push({ kind: 'munitionHit', munitionId: mu.id, moduleId: mu.moduleId, targetId: t.id, at, hit });
      t.attacked = true;
      if (hit) {
        applyHit(t, w, 'hull', at, data, effects);
        destroyIfDead(t, effects, b);
      }
      continue;
    }
    mu.life -= 1;
    if (mu.life <= 0) {
      effects.push({ kind: 'munitionLost', munitionId: mu.id, at: { ...mu.pos } });
      continue;
    }
    keep.push(mu);
  }
  b.munitions = keep;
}

function nearestCell(t: CombatShip, from: Vec2): Vec2 {
  const cells = shipCells(t);
  return cells.reduce((best, c) => (Math.max(Math.abs(c.x - from.x), Math.abs(c.y - from.y)) < Math.max(Math.abs(best.x - from.x), Math.abs(best.y - from.y)) ? c : best), cells[0] as Vec2);
}

/** Flak destroys all munitions of the other side in its area (Section 12.2). */
export function clearMunitionsInArea(b: Battle, shooter: CombatShip, center: Vec2, half: number, effects: Effect[]): void {
  b.munitions = b.munitions.filter((mu) => {
    const owner = b.ships.find((o) => o.id === mu.ownerId);
    const enemy = owner ? hostile(owner, shooter) : mu.side !== shooter.side;
    const inside = Math.abs(mu.pos.x - center.x) <= half && Math.abs(mu.pos.y - center.y) <= half;
    if (enemy && inside) {
      effects.push({ kind: 'munitionDown', munitionId: mu.id, at: { ...mu.pos } });
      return false;
    }
    return true;
  });
}
