import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkArt, gameData } from '../src/data';
import { palette, roleColor } from '../src/render/palette';
import { convertEffects, effectsJson } from '../tools/lib/effectsArt';
import { convertShipArt, ROLE_CODES, shipArtJson } from '../tools/lib/shipArt';

const data = gameData();
const yamlText = readFileSync('data/art/ships.yaml', 'utf8');

describe('ship art from Claude Design (Section 18)', () => {
  it('ships.json matches ships.yaml (run `npm run import-art` after a change)', () => {
    expect(readFileSync('data/art/ships.json', 'utf8')).toBe(shipArtJson(yamlText));
  });

  it('the art agrees with the game data and the style', () => {
    expect(checkArt(data)).toEqual([]);
  });

  it('each hull has battle art; the size class matches hulls.json', () => {
    for (const hull of data.hulls) {
      const art = data.art.ships.ships[hull.id];
      expect(art, hull.id).toBeDefined();
      expect(art?.sizeClass).toBe(hull.sizeClass);
    }
  });

  it('mirror swaps go both ways', () => {
    for (const [a, b] of Object.entries(data.art.ships.mirrorSwaps)) expect(data.art.ships.mirrorSwaps[b]).toBe(a);
  });

  it('rejects art where a role does not match a glyph', () => {
    const broken = yamlText.replace("      - 'eb'\n", "      - 'e '\n");
    expect(broken).not.toBe(yamlText);
    expect(() => convertShipArt(broken)).toThrow(/role/);
  });

  it('rejects damaged art that changes the footprint', () => {
    const broken = yamlText.replace("      - '░■'\n", "      - '░ '\n");
    expect(broken).not.toBe(yamlText);
    expect(() => convertShipArt(broken)).toThrow(/footprint/);
  });

  it('rejects a grid with the wrong width', () => {
    const broken = yamlText.replace("      - '=►'\n", "      - '=►>'\n");
    expect(() => convertShipArt(broken)).toThrow(/width/);
  });
});

describe('style (data/art/style.json)', () => {
  it('cell size matches the map aspect in balance.json', () => {
    const { w, h } = data.art.style.cell;
    expect(h / w).toBe(data.balance.world.cellAspect);
  });

  it('each role code has a color for each side', () => {
    for (const side of Object.keys(data.art.style.sides)) {
      for (const role of ROLE_CODES) expect(roleColor(data.art.style, side, role)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    expect(roleColor(data.art.style, 'pirate', 'a')).toBe(data.art.style.colors.pirateDeep);
  });

  it('the screen palette uses only colors from the style', () => {
    const colors = new Set(Object.values(data.art.style.colors));
    const p = palette(data);
    const all = [
      ...Object.values(p.ui),
      ...Object.values(p.roles),
      ...Object.values(p.techLevel),
      ...Object.values(p.development),
      ...p.security,
      ...Object.values(p.map),
    ];
    for (const c of all) expect(colors.has(c), c).toBe(true);
  });

  it('frames have 6 glyphs', () => {
    expect(Array.from(data.art.style.frame.single)).toHaveLength(6);
    expect(Array.from(data.art.style.frame.modal)).toHaveLength(6);
  });
});

describe('ship art drawing helpers', () => {
  it('mirrors a row: reversed, with glyph pairs swapped', async () => {
    const { mirrorRow } = await import('../src/render/shipArt');
    const swaps = data.art.ships.mirrorSwaps;
    expect(mirrorRow('≡▓▓◘▓■═>', swaps)).toBe('<═■▓◘▓▓≡');
    expect(mirrorRow('  /▀°▄─ ', swaps)).toBe(' ─▄°▀\\  ');
    expect(mirrorRow('▐█▀═', swaps)).toBe('═▀█▌');
  });

  it('dims a color', async () => {
    const { dimColor } = await import('../src/render/shipArt');
    expect(dimColor('#FF8040', 0.5)).toBe('#804020');
    expect(dimColor('#123456', 1)).toBe('#123456');
  });
});

describe('module icons (data/art/modules.json)', () => {
  it('each game module has an icon of one mark and two glyphs', () => {
    for (const m of data.modules.modules) {
      const icon = data.art.modules.modules.find((x) => x.id === m.id);
      expect(icon, m.id).toBeDefined();
      expect(Array.from(icon?.glyph ?? '').length).toBe(2);
      expect(data.art.modules.families[icon?.family ?? '']).toBeDefined();
    }
  });

  it('the art check finds an unknown color', () => {
    const broken = structuredClone(data);
    broken.art.modules.modules[0]!.fg = 'noSuchColor';
    expect(checkArt(broken).join()).toMatch(/noSuchColor/);
  });
});

describe('combat effects (data/art/effects.yaml)', () => {
  const effectsYaml = readFileSync('data/art/effects.yaml', 'utf8');

  it('effects.json matches effects.yaml (run `npm run import-art` after a change)', () => {
    expect(readFileSync('data/art/effects.json', 'utf8')).toBe(effectsJson(effectsYaml));
  });

  it('has the effects of Section 18.4 and a 1.2 s budget per turn', () => {
    const names = Object.keys(data.art.effects.effects);
    for (const n of ['pulse_laser_hit', 'autocannon_hit', 'flak_cannon', 'missile_move', 'point_defense', 'shield_hit_small', 'destroy_small', 'reinforcement_arrival']) {
      expect(names).toContain(n);
    }
    expect(data.art.effects.queue.budgetMs).toBe(1200);
    expect(data.art.effects.queue.skipKey).toBe('Space');
  });

  it('the art check finds an unknown effect color', () => {
    const broken = structuredClone(data);
    broken.art.effects.effects.pulse_laser_hit!.frames[0] = { ms: 30, at: { at: 'target', g: '*', fg: 'noSuchColor' } };
    expect(checkArt(broken).join()).toMatch(/noSuchColor/);
  });

  it('rejects an unknown line set', () => {
    const broken = effectsYaml.replace('"set":"thin","fg":"laserHi"}}', '"set":"wavy","fg":"laserHi"}}');
    expect(broken).not.toBe(effectsYaml);
    expect(() => convertEffects(broken)).toThrow(/line set/);
  });
});
