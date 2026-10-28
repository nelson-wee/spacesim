import { describe, expect, it } from 'vitest';
import type { InstalledModule } from '../src/core/types';
import { gameData } from '../src/data';
import { createShipFromLoadout } from '../src/ship/loadout';
import { moduleValues } from '../src/ship/modules';
import { checkLoadout, fitProblem } from '../src/ship/rules';
import { travelStats } from '../src/ship/stats';

const data = gameData();
const shuttle = () => createShipFromLoadout(data, 'start_shuttle', 's', 'Test');
const mod = (moduleId: string, size: 'S' | 'M' | 'L', tier: 1 | 2 | 3 = 1): InstalledModule => ({ moduleId, size, tier, on: true });

describe('default loadouts (M3-SHIP-11, M3-SHIP-13)', () => {
  it.each([...data.loadoutById.keys()])('%s is valid', (id) => {
    expect(checkLoadout(createShipFromLoadout(data, id, 'x', id), data).errors).toEqual([]);
  });

  it('each hull has a default loadout for its hull', () => {
    for (const h of data.hulls) expect(data.loadoutById.get(h.defaultLoadout)?.hullId).toBe(h.id);
  });

  it('all weapons and point defense of Section 12.2 are in modules.json', () => {
    for (const id of ['pulse_laser', 'beam_laser', 'autocannon', 'mass_driver', 'heavy_cannon', 'flak_cannon', 'missile_rack', 'torpedo_tube', 'point_defense']) {
      expect(data.moduleById.get(id)?.slot).toBe('hardpoint');
    }
  });
});

describe('tiers (Section 11.7, M3-SHIP-03)', () => {
  it('tier 2 and 3 multiply main value, heat, mass, and price; power stays', () => {
    const t1 = moduleValues(data, mod('engine', 'M', 1));
    const t2 = moduleValues(data, mod('engine', 'M', 2));
    const t3 = moduleValues(data, mod('engine', 'M', 3));
    expect(t2.thrust).toBeCloseTo((t1.thrust ?? 0) * 1.25);
    expect(t3.thrust).toBeCloseTo((t1.thrust ?? 0) * 1.5);
    expect(t2.power).toBe(t1.power);
    expect(t2.heatPerTurn).toBeCloseTo((t1.heatPerTurn ?? 0) * 0.9);
    expect(t3.mass).toBeCloseTo(t1.mass * 0.9);
    expect(t3.price).toBeCloseTo(t1.price * 6);
    expect(t2.fuelRate).toBe(0.9);
    expect(t3.fuelRate).toBe(0.8);
  });

  it('a weapon tier multiplies its damage (and the combat damage scale applies, DECISIONS.md M4)', () => {
    expect(moduleValues(data, mod('beam_laser', 'M', 2)).damage).toBeCloseTo(12 * 1.25 * data.balance.combat.damageScale);
  });

  it('heat scale applies to heat per turn and per shot; not to point defense damage', () => {
    const h = data.balance.combat.heatScale;
    expect(moduleValues(data, mod('engine', 'S')).heatPerTurn).toBeCloseTo(2 * h);
    expect(moduleValues(data, mod('pulse_laser', 'S')).heatPerShot).toBeCloseTo(4 * h);
    expect(moduleValues(data, mod('point_defense', 'S')).damage).toBe(10);
  });
});

describe('loadout rules (Sections 11.1, 11.2)', () => {
  it('a module fits a slot of the same size or larger, and of its kind', () => {
    const s = shuttle();
    // Internal slots: S S S S M M; slot 3 (S) is free.
    expect(fitProblem(s, 'internal', 3, 'engine', 'S', data)).toBeNull();
    expect(fitProblem(s, 'internal', 3, 'engine', 'M', data)).toMatch(/does not fit/);
    expect(fitProblem(s, 'internal', 3, 'pulse_laser', 'S', data)).toMatch(/hardpoint/);
    expect(fitProblem(s, 'internal', 0, 'engine', 'S', data)).toMatch(/not empty/);
    s.internal[4] = null;
    expect(fitProblem(s, 'internal', 4, 'fuel_tank', 'S', data)).toBeNull(); // S in an M slot
  });

  it('no engine, too little power, or too much cargo stops the ship', () => {
    const noEngine = shuttle();
    noEngine.internal[0] = null;
    expect(checkLoadout(noEngine, data).errors.join()).toMatch(/No engine/);
    const noPower = shuttle();
    noPower.internal[1] = null; // the reactor: base power 1 < engine draw 2
    expect(checkLoadout(noPower, data).errors.join()).toMatch(/Power/);
    const heavy = shuttle();
    heavy.cargo.iron_ore = { units: 31, unitCost: 15 };
    expect(checkLoadout(heavy, data).errors.join()).toMatch(/Cargo/);
  });

  it('power warning when all modules ON draw more than the supply (Section 17.3)', () => {
    const s = shuttle();
    s.internal[3] = mod('maneuvering_thrusters', 'S');
    s.hardpoints[0] = mod('pulse_laser', 'S');
    expect(checkLoadout(s, data).warnings).toEqual([]);
    const g = createShipFromLoadout(data, 'laser_gunship', 'g', 'Gunship');
    expect(checkLoadout(g, data).warnings.join()).toMatch(/Combat power if all ON: 16\/10/);
  });
});

describe('derived stats (Sections 10.5, 11.5, 11.6, M3-SHIP-06 to 09)', () => {
  it('starting Shuttle: power 6/9, heat 5 x heatScale per turn, cooling 3, shields 20, durability 60', () => {
    const s = travelStats(shuttle(), data);
    expect(s.powerSupply).toBe(9);
    expect(s.powerDraw).toBe(6);
    expect(s.heatCapacity).toBe(30);
    expect(s.cooling).toBe(3);
    expect(s.heatPerTurn).toBeCloseTo(5 * data.balance.combat.heatScale);
    expect(s.shieldCapacity).toBe(20);
    expect(s.shieldRegen).toBe(4);
    expect(s.durability).toBe(40 + 0 + 20 + 0);
    expect(s.maxEngineValue).toBe(8);
  });

  it('modules that are OFF draw no power and give no shields; engines are ON for travel', () => {
    const ship = shuttle();
    for (const m of [...ship.internal, ...ship.hardpoints]) if (m) m.on = false;
    const s = travelStats(ship, data);
    expect(s.shieldCapacity).toBe(0);
    expect(s.powerDraw).toBe(2); // the engine only
    expect(s.move).toBeGreaterThan(0);
  });

  it('armor plating adds armor and armor HP to durability', () => {
    const ship = shuttle();
    ship.internal[3] = mod('armor_plating', 'S');
    const s = travelStats(ship, data);
    expect(s.armor).toBe(1);
    expect(s.durability).toBe(40 + 15 + 20 + 10);
  });
});

describe('fuel checks (Section 8.7, Q-01)', () => {
  it('the starting ship does 4 to 6 jumps on a full tank, empty', () => {
    const s = travelStats(shuttle(), data);
    const jumps = s.fuelCapacity / s.fuelPerJump;
    expect(jumps).toBeGreaterThanOrEqual(4);
    expect(jumps).toBeLessThanOrEqual(6);
  });
});
