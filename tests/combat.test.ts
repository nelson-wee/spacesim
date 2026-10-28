import { describe, expect, it } from 'vitest';
import { createBattle } from '../src/combat/battle';
import { distance, footprint, lineOfFire, onEdge, pathTo, reachable } from '../src/combat/geometry';
import { generateCells } from '../src/combat/map';
import { applyOrder, battleResult, resolveTurn } from '../src/combat/resolver';
import { applyHit, combatStats, fuelStep, heatState, heatStep, hitChance, moveBudget, shieldStep, toggleModule } from '../src/combat/rules';
import type { Battle, CombatShip, Effect } from '../src/combat/types';
import { createRngState, Rng } from '../src/core/rng';
import { gameData } from '../src/data';
import { massFactor } from '../src/actor/fuel';
import { createShipFromLoadout } from '../src/ship/loadout';
import { moduleValues } from '../src/ship/modules';

const data = gameData();
const c = data.balance.combat;

/** A battle on an open map: player ship (human) at (10, 14), others in a row from (20, 14). */
function open(player = 'start_shuttle', others: string[] = ['pirate_raider']): Battle {
  const b = createBattle(
    {
      player: [{ ship: createShipFromLoadout(data, player, 'p', 'Player'), ai: 'human' }],
      other: others.map((l, i) => ({ ship: createShipFromLoadout(data, l, `o${i}`, `Enemy ${i}`), ai: 'raider', powerPriority: data.loadoutById.get(l)?.powerPriority })),
      aggressor: 'other',
      rng: createRngState(1, 'combat'),
    },
    data,
  );
  b.cells = b.cells.map((row) => '.'.repeat(row.length));
  b.ships[0]!.pos = { x: 10, y: 14 };
  b.ships.slice(1).forEach((s, i) => {
    s.pos = { x: 20, y: 10 + i * 4 };
  });
  return b;
}
const P = (b: Battle) => b.ships[0] as CombatShip;
const E = (b: Battle, i = 0) => b.ships[1 + i] as CombatShip;
const laser = () => moduleValues(data, { moduleId: 'pulse_laser', size: 'S', tier: 1, on: true });
const cannon = () => moduleValues(data, { moduleId: 'autocannon', size: 'S', tier: 1, on: true });

describe('battle map (M4-GRID)', () => {
  it('70 x 30 grid; asteroids and debris in clusters; open edges and start bands; same seed, same map', () => {
    const a = generateCells(data, new Rng(createRngState(5, 'combat')));
    const b = generateCells(data, new Rng(createRngState(5, 'combat')));
    expect(a).toEqual(b);
    expect(a.length).toBe(30);
    expect(a[0]!.length).toBe(70);
    const all = a.join('');
    expect(all).toMatch(/#/);
    expect(a[0]).toBe('.'.repeat(70));
    for (const row of a) {
      expect(row[0]).toBe('.');
      expect(row[c.map.startColumn]).toBe('.');
      expect(row[69 - c.map.startColumn]).toBe('.');
    }
  });

  it('the player side starts on the left, the other side on the right, mirrored', () => {
    const b = createBattle({ player: [{ ship: createShipFromLoadout(data, 'start_shuttle', 'p', 'P'), ai: 'human' }], other: [{ ship: createShipFromLoadout(data, 'pirate_raider', 'o', 'O'), ai: 'raider' }], aggressor: 'other', rng: createRngState(9, 'combat') }, data);
    expect(P(b).pos.x).toBeLessThan(35);
    expect(E(b).pos.x).toBeGreaterThan(35);
    expect(E(b).mirrored).toBe(true);
  });
});

describe('footprints and movement (M4-FOOT)', () => {
  it('footprint from the battle art (no spaces); mirrored on the right side', () => {
    const lf = footprint(data, 'light_freighter', false);
    expect(lf.length).toBe(7 + 4 + 4);
    expect(lf.some((c) => c.x === 0 && c.y === 0)).toBe(false);
    const m = footprint(data, 'heavy_freighter', true);
    // Heavy Freighter art row 0 has a space at x 7; mirrored, the space is at x 0.
    expect(m.some((c) => c.x === 0 && c.y === 0)).toBe(false);
    expect(m.some((c) => c.x === 7 && c.y === 0)).toBe(true);
  });

  it('Chebyshev distance between the nearest cells', () => {
    const b = open();
    // Shuttle cells x 10-11, raider cells x 20-21 at y 10.
    expect(distance(P(b), E(b))).toBe(Math.max(20 - 11, 14 - 10));
  });

  it('a ship moves up to move cells; footprints and asteroids block; no fuel or engine value 0 gives no move', () => {
    const b = open();
    const me = P(b);
    const budget = moveBudget(me, data);
    expect(budget).toBe(combatStats(me, data).move);
    const reach = reachable(b, me, budget);
    expect(pathTo(reach, { x: 10 + budget, y: 14 })).not.toBeNull();
    expect(pathTo(reach, { x: 10 + budget + 1, y: 14 })).toBeNull();
    b.cells[14] = `${b.cells[14]!.slice(0, 12)}#${b.cells[14]!.slice(13)}`;
    expect(pathTo(reachable(b, me, 1), { x: 11, y: 14 })).toBeNull();
    me.ship.fuel = 0;
    expect(moveBudget(me, data)).toBe(0);
    me.ship.fuel = 10;
    me.ship.engineValue = 0;
    expect(moveBudget(me, data)).toBe(0);
  });
});

describe('hit chance (M4-WPN-01, M4-WPN-02, Q-19)', () => {
  it('track x range x heat x debris, clamped; engine shots x tracking / (tracking + moduleAimTracking)', () => {
    const b = open();
    const me = P(b);
    const t = E(b);
    t.pos = { x: 16, y: 12 };
    const w = laser();
    const man = combatStats(t, data).maneuver;
    const d = distance(me, t);
    const expected = (w.tracking! / (w.tracking! + man)) * (1 - c.rangePenalty * (d / w.range!));
    expect(hitChance(b, me, w, t, 'hull', data)).toBeCloseTo(Math.min(c.hitMax, Math.max(c.hitMin, expected)));
    expect(hitChance(b, me, w, t, 'engines', data)).toBeCloseTo(Math.min(c.hitMax, Math.max(c.hitMin, expected * (w.tracking! / (w.tracking! + c.moduleAimTracking)))));
    me.heat = combatStats(me, data).heatCapacity * c.hotShare;
    expect(heatState(me, data)).toBe('hot');
    expect(hitChance(b, me, w, t, 'hull', data)).toBeCloseTo(expected * c.hotHitFactor);
    me.heat = 0;
    const lof = lineOfFire(b, me, t);
    const mid = Math.floor((lof.from.x + lof.to.x) / 2);
    const row = Math.round((lof.from.y + lof.to.y) / 2);
    b.cells[row] = `${b.cells[row]!.slice(0, mid)}:${b.cells[row]!.slice(mid + 1)}`;
    if (lineOfFire(b, me, t).debris) expect(hitChance(b, me, w, t, 'hull', data)).toBeCloseTo(expected * c.debrisFactor);
  });

  it('no shot beyond range, or through an asteroid', () => {
    const b = open();
    const me = P(b);
    const t = E(b);
    t.pos = { x: 40, y: 14 };
    expect(hitChance(b, me, laser(), t, 'hull', data)).toBe(0);
    t.pos = { x: 15, y: 14 };
    b.cells[14] = `${b.cells[14]!.slice(0, 13)}#${b.cells[14]!.slice(14)}`;
    expect(lineOfFire(b, me, t).clear).toBe(false);
    expect(hitChance(b, me, laser(), t, 'hull', data)).toBe(0);
  });

  it('the minimum hit chance is hitMin', () => {
    const b = open();
    const me = P(b);
    const t = E(b);
    t.pos = { x: 16, y: 12 };
    const w = { ...laser(), tracking: 0.001 };
    expect(hitChance(b, me, w, t, 'hull', data)).toBe(c.hitMin);
  });
});

describe('damage (M4-WPN-03, Section 12.5)', () => {
  it('shields first, the rest back to base damage, x vs hull, less armor, at least 1', () => {
    const b = open();
    const t = P(b); // Shuttle: shield 20, armor 0
    const w = cannon(); // damage x scale, vs shield 0.6, vs hull 1.3, pierce 1
    const fx: Effect[] = [];
    t.shield = 5;
    const hp = t.ship.hullHp;
    applyHit(t, w, 'hull', t.pos, data, fx);
    const toShield = w.damage! * w.vsShield!;
    const left = (toShield - 5) / w.vsShield!;
    expect(t.shield).toBe(0);
    expect(hp - t.ship.hullHp).toBeCloseTo(Math.max(1, left * w.vsHull! - 0));
  });

  it('armor less armor pierce; a hit does at least 1 damage', () => {
    const b = open('laser_gunship');
    const t = P(b); // Gunship armor 2
    t.shield = 0;
    const armor = combatStats(t, data).armor;
    const w = { ...laser(), damage: 1 };
    const hp = t.ship.hullHp;
    applyHit(t, w, 'hull', t.pos, data, []);
    expect(hp - t.ship.hullHp).toBe(1);
    const big = { ...cannon(), damage: 20 };
    const hp2 = t.ship.hullHp;
    applyHit(t, big, 'hull', t.pos, data, []);
    expect(hp2 - t.ship.hullHp).toBeCloseTo(20 * big.vsHull! - Math.max(0, armor - big.armorPierce!));
  });

  it('Armor Plating HP takes hull damage first; an engine shot goes to the engine value', () => {
    const b = open();
    const t = P(b);
    t.shield = 0;
    t.ship.armorHp = 3;
    const hp = t.ship.hullHp;
    applyHit(t, { ...cannon(), damage: 10, vsHull: 1, armorPierce: 0 }, 'hull', t.pos, data, []);
    expect(t.ship.armorHp).toBe(0);
    expect(hp - t.ship.hullHp).toBeCloseTo(7);
    const ev = t.ship.engineValue;
    applyHit(t, { ...cannon(), damage: 3, vsHull: 1, armorPierce: 0 }, 'engines', t.pos, data, []);
    expect(t.ship.engineValue).toBeCloseTo(ev - 3);
    expect(t.ship.hullHp).toBeCloseTo(hp - 7);
  });
});

describe('flak (M4-WPN-04)', () => {
  it('a 3 x 3 area; a flat hit chance on each hostile ship in it', () => {
    const b = open('start_shuttle', ['pirate_raider', 'pirate_raider']);
    const me = P(b);
    const [a, z] = [E(b, 0), E(b, 1)];
    a.pos = { x: 14, y: 14 };
    z.pos = { x: 14, y: 15 };
    const flak = moduleValues(data, { moduleId: 'flak_cannon', size: 'M', tier: 1, on: true });
    expect(hitChance(b, me, flak, a, 'hull', data)).toBe(flak.flatHitChance);
    // Put a flak cannon on the player's hardpoint and fire many times; both raiders are in the area.
    me.ship.hardpoints[0] = { moduleId: 'flak_cannon', size: 'M', tier: 1, on: true };
    let hits = 0;
    let rolls = 0;
    for (let i = 0; i < 400; i++) {
      const bb = structuredClone(b);
      const fx: Effect[] = [];
      applyOrder(bb, P(bb), { kind: 'fire', slot: { kind: 'hardpoint', index: 0 }, target: a.id, aim: 'hull' }, data, new Rng(createRngState(i, 'combat')), fx);
      rolls += 2;
      hits += new Set(fx.filter((e) => e.kind === 'shield' || e.kind === 'hull').map((e) => ('shipId' in e ? e.shipId : -1))).size;
    }
    expect(hits / rolls).toBeGreaterThan(flak.flatHitChance! - 0.06);
    expect(hits / rolls).toBeLessThan(flak.flatHitChance! + 0.06);
  });
});

describe('power and heat (M4-PWR)', () => {
  it('a switch ON over supply is refused; OFF weapons cannot fire; a shield that goes ON starts at 0', () => {
    const b = open();
    const me = P(b);
    // Shuttle: supply 9, draw 6. A second shield over supply is refused (fill the free slot).
    me.ship.internal[3] = { moduleId: 'shield_generator', size: 'S', tier: 1, on: false };
    E(b).pos = { x: 15, y: 14 };
    // Laser OFF: draw 4; a second shield ON: draw 6 <= 9.
    expect(toggleModule(me, { kind: 'hardpoint', index: 0 }, false, data)).toBeNull();
    const why = applyOrder(b, me, { kind: 'fire', slot: { kind: 'hardpoint', index: 0 }, target: E(b).id, aim: 'hull' }, data, new Rng(createRngState(1, 'x')), []);
    expect(why).toMatch(/OFF/);
    expect(toggleModule(me, { kind: 'internal', index: 3 }, true, data)).toBeNull();
    // Laser ON again: draw 8; a third shield (+2) is over the supply of 9.
    me.ship.hardpoints[0]!.on = true;
    me.ship.internal[4] = { moduleId: 'shield_generator', size: 'S', tier: 1, on: false };
    expect(toggleModule(me, { kind: 'internal', index: 4 }, true, data)).toMatch(/power/);
    const shield = me.shield;
    expect(toggleModule(me, { kind: 'internal', index: 2 }, false, data)).toBeNull();
    expect(me.shield).toBeLessThanOrEqual(combatStats(me, data).shieldCapacity);
    toggleModule(me, { kind: 'internal', index: 2 }, true, data);
    expect(me.shield).toBeLessThanOrEqual(shield);
  });

  it('engines OFF give no thrust: move and maneuver 0', () => {
    const b = open();
    const me = P(b);
    toggleModule(me, { kind: 'internal', index: 0 }, false, data);
    expect(combatStats(me, data).move).toBe(0);
    expect(combatStats(me, data).maneuver).toBe(0);
  });

  it('heat: + heat per turn + shots - cooling (min 0); Hot halves shield regen; Overheat hurts the hull and stops fire', () => {
    const b = open();
    const me = P(b);
    const st = combatStats(me, data);
    me.heat = 0;
    me.shotHeat = 0;
    heatStep(me, data, []);
    expect(me.heat).toBeCloseTo(Math.max(0, st.heatPerTurn - st.cooling));
    me.heat = st.heatCapacity * 0.75;
    me.shield = 0;
    shieldStep(me, data);
    expect(me.shield).toBeCloseTo(st.shieldRegen * c.hotShieldRegen);
    me.heat = st.heatCapacity + 5;
    me.shotHeat = 0;
    const hp = me.ship.hullHp;
    heatStep(me, data, []);
    const over = st.heatCapacity + 5 + st.heatPerTurn - st.cooling - st.heatCapacity;
    expect(hp - me.ship.hullHp).toBeCloseTo(over);
    expect(me.heat).toBe(st.heatCapacity);
    expect(me.overheated).toBe(true);
    const why = applyOrder(b, me, { kind: 'fire', slot: { kind: 'hardpoint', index: 0 }, target: E(b).id, aim: 'hull' }, data, new Rng(createRngState(1, 'x')), []);
    expect(why).toMatch(/Overheat/);
  });

  it('overheat (Q-40): offline (no orders, no move, no shields) until heat is at or below the recover share', () => {
    const b = open();
    const me = P(b);
    const st = combatStats(me, data);
    me.heat = st.heatCapacity + 2;
    me.shotHeat = 0;
    const effects: Effect[] = [];
    heatStep(me, data, effects);
    expect(me.overheated).toBe(true);
    expect(effects.some((e) => e.kind === 'overheat')).toBe(true);
    // Active modules are offline: no movement, no maneuver, no shields; passive modules still count.
    const off = combatStats(me, data);
    expect(moveBudget(me, data)).toBe(0);
    expect(off.engineCount).toBe(0);
    expect(off.shieldCapacity).toBe(0);
    expect(off.cooling).toBe(st.cooling);
    shieldStep(me, data);
    expect(me.shield).toBe(0);
    const rng = new Rng(createRngState(1, 'x'));
    expect(applyOrder(b, me, { kind: 'move', to: { x: 11, y: 14 } }, data, rng, [])).toMatch(/offline/);
    expect(applyOrder(b, me, { kind: 'toggle', slot: { kind: 'hardpoint', index: 0 }, on: false }, data, rng, [])).toMatch(/offline/);
    // Only cooling acts; the ship is back online at or below the recover share.
    let steps = 0;
    while (me.overheated && steps < 50) {
      const before = me.heat;
      heatStep(me, data, effects);
      steps++;
      if (me.overheated) expect(me.heat).toBeCloseTo(before - st.cooling);
    }
    expect(me.overheated).toBe(false);
    expect(me.heat).toBeLessThanOrEqual(c.overheatRecoverShare * st.heatCapacity + 1e-9);
    expect(steps).toBe(Math.ceil((st.heatCapacity * (1 - c.overheatRecoverShare)) / st.cooling - 1e-9));
    expect(effects.some((e) => e.kind === 'online')).toBe(true);
    expect(combatStats(me, data).engineCount).toBeGreaterThan(0);
  });

  it('the AI does not fire a shot that would overheat it (Q-40)', () => {
    const b = open('laser_wasp', ['pirate_raider']);
    const me = P(b);
    me.ai = 'attack';
    const st = combatStats(me, data);
    me.heat = st.heatCapacity - 1;
    const out = resolveTurn(b, null, data);
    const after = out.battle.ships[0]!;
    expect(after.overheated).toBe(false);
    expect(out.effects.some((e) => e.kind === 'shot' && e.shipId === me.id)).toBe(false);
  });

  it('aimed shots at the Engines: lasers aim better than heavy guns (Q-40)', () => {
    const b = open();
    const me = P(b);
    const t = E(b);
    t.pos = { x: 15, y: 13 };
    const heavy = moduleValues(data, { moduleId: 'heavy_cannon', size: 'L', tier: 1, on: true });
    const ratio = (w: ReturnType<typeof laser>) => hitChance(b, me, w, t, 'engines', data) / hitChance(b, me, w, t, 'hull', data);
    expect(ratio(laser())).toBeCloseTo(laser().tracking! / (laser().tracking! + c.moduleAimTracking));
    expect(ratio(laser())).toBeGreaterThan(ratio(cannon()));
    expect(ratio(cannon())).toBeGreaterThan(ratio(heavy));
  });

  it('fuel: mass^exp x kCombat for a turn with an engine ON (M4-FUEL-01)', () => {
    const b = open();
    const me = P(b);
    const f = me.ship.fuel;
    fuelStep(me, data);
    expect(f - me.ship.fuel).toBeCloseTo(massFactor(combatStats(me, data).mass, data) * c.kCombat);
  });
});

describe('battle end (M4-END)', () => {
  it('the player flees at an edge cell with an engine ON; engine value 0 cannot flee', () => {
    const b = open();
    const me = P(b);
    me.pos = { x: 2, y: 14 };
    const fx: Effect[] = [];
    expect(applyOrder(b, me, { kind: 'move', to: { x: 0, y: 14 } }, data, new Rng(createRngState(1, 'x')), fx)).toBeNull();
    expect(onEdge(b, me)).toBe(true);
    expect(me.status).toBe('fled');
    expect(battleResult(b, data)).toBe('fled');
    const b2 = open();
    const me2 = P(b2);
    me2.pos = { x: 2, y: 14 };
    me2.ship.engineValue = 0;
    expect(applyOrder(b2, me2, { kind: 'move', to: { x: 0, y: 14 } }, data, new Rng(createRngState(1, 'x')), [])).toMatch(/movement|cannot/);
  });

  it('win when all others are destroyed, surrendered, or fled; loss when the player is destroyed; draw at maxTurns', () => {
    const b = open();
    E(b).status = 'surrendered';
    expect(battleResult(b, data)).toBe('win');
    E(b).status = 'active';
    P(b).status = 'destroyed';
    expect(battleResult(b, data)).toBe('loss');
    P(b).status = 'active';
    b.turn = c.maxTurns;
    expect(battleResult(b, data)).toBe('draw');
  });

  it('a surrendered ship stops acting', () => {
    const b = open();
    E(b).status = 'surrendered';
    E(b).pos = { x: 13, y: 14 };
    const out = resolveTurn(b, [], data);
    expect(out.effects.some((e) => 'shipId' in e && e.shipId === E(b).id && e.kind === 'shot')).toBe(false);
  });
});

describe('resolver (M4-TURN)', () => {
  it('is deterministic: the same battle and orders give the same result; the input is not changed', () => {
    const b = createBattle({ player: [{ ship: createShipFromLoadout(data, 'laser_wasp', 'p', 'P'), ai: 'attack' }], other: [0, 1].map((i) => ({ ship: createShipFromLoadout(data, 'pirate_raider', `o${i}`, 'O'), ai: 'raider' as const })), aggressor: 'other', rng: createRngState(77, 'combat') }, data);
    const copy = structuredClone(b);
    let x = b;
    let y = structuredClone(b);
    while (!x.result) x = resolveTurn(x, null, data).battle;
    while (!y.result) y = resolveTurn(y, null, data).battle;
    expect(x).toEqual(y);
    expect(b).toEqual(copy);
  });

  it('records the aggressor and the sides', () => {
    const b = open();
    expect(b.aggressor).toBe('other');
    expect(P(b).side).toBe('player');
    expect(E(b).side).toBe('other');
  });
});
