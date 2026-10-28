// Combat rules (Sections 8.5, 11.5, 11.6, 12.3, 12.5, 13.6): stats in combat,
// power toggles, hit chance, damage, heat, shields, and fuel.
import { massFactor } from '../actor/fuel';
import type { InstalledModule } from '../core/types';
import type { GameData, ModuleValues } from '../data';
import { moduleDef, moduleValues } from '../ship/modules';
import { type ShipStats, shipStats } from '../ship/stats';
import { lineOfFire } from './geometry';
import type { Aim, Battle, CombatShip, Effect, SlotRef, Vec2 } from './types';

/**
 * Stats with the combat power setting: only modules that are ON work (Section
 * 11.5). While the ship is overheated, its active modules (power draw > 0:
 * engines, shields, weapons, thrusters) are offline; passive modules (armor,
 * heat sinks, radiators, cargo, fuel, reactors) still work (Q-40).
 */
export function combatStats(s: CombatShip, data: GameData): ShipStats {
  if (!s.overheated) return shipStats(s.ship, data);
  const offline = structuredClone(s.ship);
  for (const m of [...offline.hardpoints, ...offline.internal]) if (m && drawOf(m, data) > 0) m.on = false;
  return shipStats(offline, data);
}

/** Cells the ship can move this turn: 0 with no fuel (Section 8.6), engine value 0 (Q-20), or overheat (Q-40). */
export function moveBudget(s: CombatShip, data: GameData): number {
  if (s.ship.fuel <= 1e-9 || s.overheated) return 0;
  return Math.max(0, combatStats(s, data).move - s.moved);
}

export type HeatState = 'normal' | 'hot' | 'over';

export function heatState(s: CombatShip, data: GameData, stats: ShipStats = combatStats(s, data)): HeatState {
  const cap = stats.heatCapacity;
  if (s.overheated || s.heat >= cap) return 'over';
  return s.heat >= data.balance.combat.hotShare * cap ? 'hot' : 'normal';
}

export function moduleAt(s: CombatShip, slot: SlotRef): InstalledModule | null {
  return (slot.kind === 'hardpoint' ? s.ship.hardpoints : s.ship.internal)[slot.index] ?? null;
}

export function slotKey(slot: SlotRef): string {
  return `${slot.kind}:${slot.index}`;
}

/** All slots with a module, hardpoints first. */
export function moduleSlots(s: CombatShip): SlotRef[] {
  const out: SlotRef[] = [];
  s.ship.hardpoints.forEach((m, index) => {
    if (m) out.push({ kind: 'hardpoint', index });
  });
  s.ship.internal.forEach((m, index) => {
    if (m) out.push({ kind: 'internal', index });
  });
  return out;
}

/** Weapons that fire in the same turn: lasers and ballistics, flak included (Section 12.2). Guided weapons come in M5. */
export function isDirectWeapon(m: InstalledModule, data: GameData): boolean {
  const c = moduleDef(data, m.moduleId).category;
  return c === 'laser' || c === 'ballistic';
}

/** Power draw of a module when ON (passive modules draw 0). */
export function drawOf(m: InstalledModule, data: GameData): number {
  return moduleValues(data, m).power ?? 0;
}

/**
 * Switches a module ON or OFF (a free action, Section 11.5). A switch ON that
 * puts the draw above supply is refused. A shield generator that goes ON
 * starts at 0 points: the pool does not grow. A shield that goes OFF lowers
 * the capacity, and the pool keeps no more than the new capacity.
 */
export function toggleModule(s: CombatShip, slot: SlotRef, on: boolean, data: GameData): string | null {
  const m = moduleAt(s, slot);
  if (!m) return 'The slot is empty.';
  if (m.on === on) return null;
  if (on) {
    const st = combatStats(s, data);
    if (st.powerDraw + drawOf(m, data) > st.powerSupply + 1e-9) return 'Not sufficient power.';
  }
  m.on = on;
  const cap = combatStats(s, data).shieldCapacity;
  s.shield = Math.min(s.shield, cap);
  return null;
}

/**
 * Aim factor of a shot at a module (the Engines now; other modules when
 * module damage comes): tracking / (tracking + moduleAimTracking) (Q-40,
 * replaces the flat 0.85 of Q-19). Lasers aim well; heavy guns do not.
 */
export function moduleAimFactor(w: ModuleValues, data: GameData): number {
  const k = data.balance.combat.moduleAimTracking;
  const tracking = w.tracking ?? 0;
  return tracking + k > 0 ? tracking / (tracking + k) : 0;
}

/** Hit chance of a lasers or ballistics shot (Section 12.3; module aim Q-40). */
export function hitChance(b: Battle, a: CombatShip, w: ModuleValues, t: CombatShip, aim: Aim, data: GameData, aAt?: Vec2): number {
  const c = data.balance.combat;
  const lof = lineOfFire(b, a, t, aAt);
  if (!lof.clear || lof.distance > (w.range ?? 0)) return 0;
  if (w.flatHitChance !== undefined) return w.flatHitChance;
  const tracking = w.tracking ?? 0;
  const maneuver = combatStats(t, data).maneuver;
  const trackFactor = tracking + maneuver > 0 ? tracking / (tracking + maneuver) : 0;
  const rangeFactor = 1 - c.rangePenalty * (lof.distance / Math.max(1, w.range ?? 1));
  const heatFactor = heatState(a, data) === 'hot' ? c.hotHitFactor : 1;
  const debrisFactor = lof.debris ? c.debrisFactor : 1;
  const engine = aim === 'engines' ? moduleAimFactor(w, data) : 1;
  return Math.min(c.hitMax, Math.max(c.hitMin, c.baseAccuracy * trackFactor * rangeFactor * heatFactor * debrisFactor * engine));
}

/**
 * Damage of one hit (Section 12.5): shields first (x vs shield), the rest back
 * to base damage, x vs hull, less max(0, armor - armor pierce), at least 1.
 * Hull damage goes to Armor Plating HP first, then hull HP; an engine shot
 * goes to the engine value.
 */
export function applyHit(t: CombatShip, w: ModuleValues, aim: Aim, at: Vec2, data: GameData, effects: Effect[]): void {
  const damage = w.damage ?? 0;
  const vsShield = w.vsShield ?? 1;
  const vsHull = w.vsHull ?? 1;
  let toShield = damage * vsShield;
  if (t.shield > 0 && toShield > 0) {
    const taken = Math.min(t.shield, toShield);
    t.shield -= taken;
    toShield -= taken;
    effects.push({ kind: 'shield', shipId: t.id, amount: taken, broken: t.shield <= 1e-9 });
    if (toShield <= 1e-9) return;
  }
  const remaining = vsShield > 0 ? toShield / vsShield : damage;
  const armor = combatStats(t, data).armor;
  const raw = remaining * vsHull;
  const reduced = raw - Math.max(0, armor - (w.armorPierce ?? 0));
  const hull = Math.max(1, reduced);
  if (reduced < 1 && armor > 0) effects.push({ kind: 'armor', shipId: t.id, at });
  if (aim === 'engines') {
    const before = t.ship.engineValue;
    t.ship.engineValue = Math.max(0, before - hull);
    effects.push({ kind: 'engine', shipId: t.id, amount: before - t.ship.engineValue, at });
    return;
  }
  let left = hull;
  if (t.ship.armorHp > 0) {
    const taken = Math.min(t.ship.armorHp, left);
    t.ship.armorHp -= taken;
    left -= taken;
  }
  t.ship.hullHp = Math.max(0, t.ship.hullHp - left);
  effects.push({ kind: 'hull', shipId: t.id, amount: hull, at });
}

/** Heat at the end of this turn with the shots planned so far (no cap; Section 11.6). */
export function heatForecast(s: CombatShip, data: GameData): number {
  const st = combatStats(s, data);
  return Math.max(0, s.heat + (s.overheated ? 0 : st.heatPerTurn) + s.shotHeat - st.cooling);
}

/** Heat at or below this value ends an overheat (Q-40). */
export function recoverHeat(s: CombatShip, data: GameData, stats: ShipStats = combatStats(s, data)): number {
  return data.balance.combat.overheatRecoverShare * stats.heatCapacity;
}

/** Heat steps until an overheated ship is back online (0 if it is not overheated). */
export function overheatTurnsLeft(s: CombatShip, data: GameData): number {
  if (!s.overheated) return 0;
  const st = combatStats(s, data);
  return Math.max(1, Math.ceil((s.heat - recoverHeat(s, data, st)) / Math.max(1e-9, st.cooling)));
}

/**
 * The heat step (Section 11.6): heat + heat per turn of modules ON + heat of
 * this turn's shots - cooling, at least 0. Overheat (Q-40): hull damage = heat
 * above capacity (no armor), heat back to capacity, and the ship is offline:
 * no orders, active modules do not work (no movement, no shields), and only
 * cooling acts. The ship is back online when its heat is at or below
 * `overheatRecoverShare` of capacity.
 */
export function heatStep(s: CombatShip, data: GameData, effects: Effect[]): void {
  if (s.overheated) {
    const st = combatStats(s, data);
    s.heat = Math.max(0, s.heat + s.shotHeat - st.cooling);
    s.shotHeat = 0;
    if (s.heat <= recoverHeat(s, data, st) + 1e-9) {
      s.overheated = false;
      effects.push({ kind: 'online', shipId: s.id });
    }
    return;
  }
  const st = combatStats(s, data);
  s.heat = Math.max(0, s.heat + st.heatPerTurn + s.shotHeat - st.cooling);
  s.shotHeat = 0;
  if (s.heat >= st.heatCapacity) {
    const over = s.heat - st.heatCapacity;
    s.ship.hullHp = Math.max(0, s.ship.hullHp - over);
    effects.push({ kind: 'overheat', shipId: s.id, amount: over });
    s.heat = st.heatCapacity;
    s.overheated = true;
  }
}

/** Shields regenerate by their regen value (x 0.5 when Hot), up to capacity. */
export function shieldStep(s: CombatShip, data: GameData): void {
  const st = combatStats(s, data);
  const regen = st.shieldRegen * (heatState(s, data, st) === 'hot' ? data.balance.combat.hotShieldRegen : 1);
  s.shield = Math.min(st.shieldCapacity, s.shield + regen);
}

/** Fuel for one turn with an engine ON: mass^fuelMassExponent x kCombat (Section 8.5, Q-01). */
export function fuelStep(s: CombatShip, data: GameData): void {
  const st = combatStats(s, data);
  if (st.engineCount === 0) return;
  s.ship.fuel = Math.max(0, s.ship.fuel - massFactor(st.mass, data) * data.balance.combat.kCombat);
}

/** Fuel for a successful flee (Section 8.5). */
export function fleeFuel(s: CombatShip, data: GameData): number {
  return massFactor(combatStats(s, data).mass, data) * data.balance.combat.kFlee;
}
