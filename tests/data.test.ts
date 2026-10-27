import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGameData, checkReferences, gameData, RAW_DATA } from '../src/data';
import { nonCp437 } from '../src/render/cp437';

describe('data files (G-18)', () => {
  it('all data files load and pass their checks', () => {
    const data = gameData();
    expect(checkReferences(data)).toEqual([]);
    expect(data.commodities).toHaveLength(12);
    expect(data.hulls).toHaveLength(9);
    expect(data.recipes.recipes).toHaveLength(12);
  });

  it('rejects a file that is not valid', () => {
    const bad = structuredClone(RAW_DATA) as typeof RAW_DATA;
    (bad.balance as { travel: { kJump: number } }).travel.kJump = -1;
    expect(() => buildGameData(bad)).toThrow(/balance.json/);
  });

  it('rejects a broken link between files', () => {
    const bad = structuredClone(RAW_DATA) as typeof RAW_DATA;
    (bad.loadouts as { loadouts: { hullId: string }[] }).loadouts[0]!.hullId = 'no_such_hull';
    expect(() => buildGameData(bad)).toThrow(/unknown hull/);
  });

  it('the starting loadout is the ship of Section 11.8', () => {
    const l = gameData().loadoutById.get('start_shuttle')!;
    expect(l.hullId).toBe('shuttle');
    expect(l.hardpoints.map((s) => s?.moduleId)).toEqual(['pulse_laser']);
    expect(l.internal.map((s) => (s ? `${s.moduleId}:${s.size}` : null))).toEqual([
      'engine:S',
      'reactor:S',
      'shield_generator:S',
      null,
      'cargo_rack:M',
      'fuel_tank:M',
    ]);
  });

  it('fuelMassExponent gives about 3x fuel for a laden Heavy Freighter (Q-01)', () => {
    const e = gameData().balance.travel.fuelMassExponent;
    const ratio = (156 / 28) ** e;
    expect(ratio).toBeGreaterThan(2.8);
    expect(ratio).toBeLessThan(3.2);
  });
});

describe('Code Page 437 (Section 4, M1-DATA-11)', () => {
  it('art, style glyphs, icons, and names use only CP437 characters', () => {
    const data = gameData();
    const texts = [
      ...Object.values(data.art.ships.ships).flatMap((a) =>
        [a.battle, a.portrait].flatMap((v) => [...v.glyphs, ...v.glyphsDamaged, ...v.glyphsCritical]),
      ),
      ...Object.entries(data.art.ships.mirrorSwaps).flat(),
      ...Object.entries(data.art.ships.damageStep).flat(),
      data.art.ships.damageStepBox,
      data.art.ships.surrenderMarker.glyph,
      data.art.style.frame.single,
      data.art.style.frame.modal,
      data.art.style.frame.titlePrefix,
      data.art.style.threatBand.glyph,
      data.art.style.threatBand.empty,
      ...Object.values(data.art.style.tiers).map((t) => t[0]),
      ...Object.values(data.art.icons.map),
      ...Object.values(data.names.sector).flat(),
      ...Object.values(data.names.location).flat(),
      ...data.commodities.map((c) => c.name),
      ...data.hulls.map((h) => h.name),
      ...data.modules.modules.map((m) => m.name),
      ...data.art.modules.modules.flatMap((m) => [m.glyph, m.short]),
      ...Object.values(data.art.modules.families).map((f) => f.mark),
      ...Object.values(data.art.modules.states).map((s) => s.glyph),
      ...Object.values(data.art.effects.lineSets).flat(),
      JSON.stringify(data.art.effects.effects),
      JSON.stringify(data.art.effects.patterns),
    ];
    expect(texts.flatMap(nonCp437)).toEqual([]);
  });

  it('UI and render source files use only CP437 characters', () => {
    const dirs = ['src/ui', 'src/ui/screens', 'src/ui/widgets', 'src/render'];
    const bad: string[] = [];
    for (const dir of dirs) {
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'cp437.ts')) {
        const text = readFileSync(join(dir, file), 'utf8').replace(/[\n\r\t]/g, ' ');
        const chars = nonCp437(text);
        if (chars.length > 0) bad.push(`${dir}/${file}: ${chars.join(' ')}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
