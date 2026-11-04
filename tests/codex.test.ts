// Codex (M8-UI-01): the text comes from the data files.
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data';
import { codexEntry } from '../src/ui/screens/codex';

const data = gameData();

describe('codex', () => {
  it('each commodity shows its producers and buyers from recipes.json and population.json', () => {
    const water = codexEntry(data, 'water');
    expect(water.madeBy.some((l) => l.startsWith('Ice Mine'))).toBe(true);
    expect(water.usedBy.some((l) => l.startsWith('Agri World'))).toBe(true);
    expect(water.usedBy.some((l) => l.startsWith('Population'))).toBe(true);
    expect(water.products).toContain('food');
    const machinery = codexEntry(data, 'machinery');
    expect(machinery.inputs).toEqual(expect.arrayContaining(['alloys', 'electronics']));
    expect(machinery.usedBy.filter((l) => l.includes('installs')).length).toBe(data.recipes.recipes.length);
    for (const c of data.commodities) {
      const e = codexEntry(data, c.id);
      expect(e.madeBy.length + e.usedBy.length).toBeGreaterThan(0);
    }
  });
});
