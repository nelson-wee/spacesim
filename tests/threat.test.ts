// Threat units, budget, templates, and selection (M5-THREAT, M5-TOOL-03).
import { describe, expect, it } from 'vitest';
import { createRngState, Rng } from '../src/core/rng';
import type { Sector } from '../src/core/types';
import { gameData } from '../src/data';
import {
  allowedPirateTemplates,
  budgetMid,
  budgetRange,
  patrolGroup,
  pirateBudget,
  pirateGroup,
  selectTemplate,
  templateTu,
  threatBand,
} from '../src/encounter/budget';
import { createShipFromLoadout } from '../src/ship/loadout';
import { durability, firepower, groupTu, loadoutTu, shipTu } from '../src/ship/threat';

const data = gameData();
const DEVS = ['core', 'middle', 'frontier'] as const;

/** A sector stub at a security level (value = level minimum + 10). */
function sector(level: number, development: Sector['development']): Sector {
  const min = data.security.levels.find((l) => l.level === level)?.min ?? 0;
  return { id: 0, name: 'S', code: 'SSS', pos: { x: 0, y: 0 }, star: 'g', development, jumpsFromCore: 0, securityBaseline: min + 10, securityValue: min + 10, securityHistory: [], locationIds: [], jumpPointIds: [] };
}

describe('threat units (M5-THREAT-01, M5-THREAT-02)', () => {
  it('the Pirate Raider is 10 TU; TU = 10 x sqrt(durability x firepower) / Raider', () => {
    expect(loadoutTu('pirate_raider', data)).toBeCloseTo(10);
    const s = createShipFromLoadout(data, 'start_shuttle', 's', 's');
    const r = createShipFromLoadout(data, 'pirate_raider', 'r', 'r');
    expect(shipTu(s, data)).toBeCloseTo((10 * Math.sqrt(durability(s, data) * firepower(s, data))) / Math.sqrt(durability(r, data) * firepower(r, data)));
  });

  it('the Section 10.5 reference values within 10%', () => {
    const ref: Record<string, number> = {
      start_shuttle: 9,
      pirate_raider: 10,
      light_freighter_trader: 13,
      heavy_freighter_trader: 28,
      pirate_gunship: 37,
      patrol_cutter: 38,
      pirate_corvette: 57,
      pirate_frigate: 76,
      battleship: 154,
    };
    for (const [id, tu] of Object.entries(ref)) expect(Math.abs(loadoutTu(id, data) / tu - 1), id).toBeLessThanOrEqual(0.1);
  });

  it('group TU = sum x (1 + groupBonus x (count - 1)); template TU values of Section 10.6 within 10%', () => {
    expect(groupTu([10, 10], data)).toBeCloseTo(20 * (1 + data.balance.threat.groupBonus));
    const ref: Record<string, number> = { lone_raider: 10, raider_pair: 23, gunship: 37, raider_pack: 39, gunship_escort: 74, frigate: 76, corvette_pack: 100, frigate_group: 194, battle_group: 298 };
    for (const t of data.templates.pirate) expect(Math.abs(templateTu(t, data) / (ref[t.id] ?? 1) - 1), t.id).toBeLessThanOrEqual(0.1);
  });
});

describe('budget and selection (M5-THREAT-03, M5-THREAT-06, M5-THREAT-07, Q-18)', () => {
  it('budget = securityBase x devMult x random(0.6, 1.4), minimum 10', () => {
    const rng = new Rng(createRngState(1, 'enc'));
    for (let level = 0; level <= 4; level++) {
      for (const dev of DEVS) {
        const s = sector(level, dev);
        const [lo, hi] = budgetRange(s, data);
        expect(budgetMid(s, data)).toBeCloseTo((data.security.pirateBudget.securityBase[level] ?? 0) * data.security.pirateBudget.devMult[dev]);
        for (let i = 0; i < 50; i++) {
          const b = pirateBudget(s, rng, data);
          expect(b).toBeGreaterThanOrEqual(Math.max(10, lo) - 1e-9);
          expect(b).toBeLessThanOrEqual(hi + 1e-9);
        }
      }
    }
  });

  it('placement rules: Raider Pack only at level <= 2; Frigate and Corvette Pack not in Core; named-only templates never', () => {
    const ids = (lvl: number, dev: Sector['development']) => allowedPirateTemplates(sector(lvl, dev), data).map((t) => t.id);
    expect(ids(4, 'core')).toEqual(['lone_raider', 'raider_pair']);
    expect(ids(3, 'middle')).toContain('gunship');
    expect(ids(3, 'middle')).not.toContain('raider_pack');
    expect(ids(1, 'core')).not.toContain('frigate');
    expect(ids(1, 'frontier')).toContain('corvette_pack');
    expect(ids(0, 'frontier')).not.toContain('battle_group');
  });

  it('selection: TU <= budget, then TU >= 0.5 x budget (else the most expensive), weighted by TU', () => {
    const rng = new Rng(createRngState(2, 'enc'));
    const all = data.templates.pirate.filter((t) => !t.namedOnly);
    for (let i = 0; i < 200; i++) {
      const t = selectTemplate(all, 50, rng, data);
      expect(t).not.toBeNull();
      const tu = templateTu(t!, data);
      expect(tu).toBeLessThanOrEqual(50);
      expect(tu).toBeGreaterThanOrEqual(25);
    }
    // Budget 12: nothing is >= 6 except the Lone Raider (10) -> it.
    expect(selectTemplate(all, 12, rng, data)?.id).toBe('lone_raider');
    expect(selectTemplate(all, 5, rng, data)).toBeNull();
  });

  it('threat band from the budget midpoint: limits 15, 30, 50, 80', () => {
    expect(threatBand(sector(4, 'core'), data)).toBe(1);
    expect(threatBand(sector(2, 'middle'), data)).toBe(2);
    expect(threatBand(sector(1, 'middle'), data)).toBe(3);
    expect(threatBand(sector(0, 'middle'), data)).toBe(4);
    expect(threatBand(sector(0, 'frontier'), data)).toBe(5);
  });

  it('patrols: none in Lawless; a Cutter in Low and Medium; larger groups in High and Secure', () => {
    const rng = new Rng(createRngState(3, 'enc'));
    expect(patrolGroup(sector(0, 'middle'), rng, data)).toBeNull();
    expect(patrolGroup(sector(1, 'middle'), rng, data)?.template.id).toBe('cutter');
    for (let i = 0; i < 20; i++) expect(['cutter_pair', 'corvette_cutter']).toContain(patrolGroup(sector(4, 'core'), rng, data)?.template.id);
  });
});

describe('generated encounters (M5-TOOL-03, Section 10.9)', () => {
  // Q-45 (default): the mean group TU is the gate; the template ladder has steps (10, 23, 36...), so the median falls on a step below some ranges (Medium Core: 10 < 13).
  it('10,000 pirate groups per security and development level: the mean group TU is in the budget range', () => {
    const rng = new Rng(createRngState(4, 'enc'));
    for (let level = 0; level <= 4; level++) {
      for (const dev of DEVS) {
        const s = sector(level, dev);
        const tus: number[] = [];
        for (let i = 0; i < 10000; i++) tus.push(templateTu(pirateGroup(s, rng, data).template, data));
        const mean = tus.reduce((a, b) => a + b, 0) / tus.length;
        const [lo, hi] = budgetRange(s, data);
        expect(mean, `level ${level} ${dev}: mean ${mean.toFixed(1)}, range ${lo.toFixed(1)}-${hi.toFixed(1)}`).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(mean).toBeLessThanOrEqual(hi + 1e-9);
      }
    }
  });
});
