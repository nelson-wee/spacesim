import { describe, expect, it } from 'vitest';
import { observe } from '../src/actor/knowledge';
import { bestRoutes, isSource } from '../src/actor/routes';
import { wrapGame } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import type { Sector } from '../src/core/types';
import { gameData } from '../src/data';
import { assignSectorCodes, locationCode, shortCode } from '../src/world/codes';
import { generateWorld } from '../src/world/generator';

const data = gameData();

describe('technical names (owner, 2026-10-28)', () => {
  it('each sector has a unique 3-letter code', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const codes = generateWorld(seed, data).sectors.map((s) => s.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const c of codes) expect(c).toMatch(/^[A-Z0-9]{3}$/);
    }
  });

  it('a clash on the first 3 letters uses the first letter and two consonants', () => {
    const sectors = ['Selos', 'Selmar'].map((name, id) => ({ id, name, code: '' }) as Sector);
    assignSectorCodes(sectors);
    expect(sectors.map((s) => s.code)).toEqual(['SEL', 'SLM']);
  });

  it('planets have one capital letter, stations two small letters; numbers by orbit only for repeated types', () => {
    const w = generateWorld(3, data);
    for (const loc of w.locations) {
      const sector = w.sectors[loc.sectorId]!;
      const same = sector.locationIds.map((id) => w.locations[id]!).filter((l) => l.bodyType === loc.bodyType);
      const code = locationCode(w, loc, data);
      expect(code.startsWith(`${sector.code}-`)).toBe(true);
      const short = shortCode(w, loc, data);
      expect(short).toMatch(loc.kind === 'planet' ? /^[A-Z]\d?$/ : /^[a-z]{2}\d?$/);
      expect(/\d$/.test(short)).toBe(same.length > 1);
      if (same.length > 1) {
        const inner = [...same].sort((a, b) => a.ring - b.ring || a.id - b.id)[0]!;
        expect(shortCode(w, inner, data).endsWith('1')).toBe(true);
      }
    }
    const all = w.locations.map((l) => locationCode(w, l, data));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('best routes start where the good is made (owner, 2026-10-28)', () => {
  it('each best route starts at a producer of the good or a Trade Hub', () => {
    const game = wrapGame(structuredClone(createGame(11, data).state), data);
    const p = game.state.player;
    // Know all markets, so that there are many candidate routes.
    for (const loc of game.state.world.locations) {
      p.position = { kind: 'docked', locationId: loc.id };
      observe(game, p);
    }
    p.position = { kind: 'docked', locationId: game.state.world.startLocationId };
    p.credits = 1e6;
    const routes = bestRoutes(game, p, { limit: 20 });
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) expect(isSource(game.state.world.locations[r.fromId]!, r.commodity, data)).toBe(true);
    const any = bestRoutes(game, p, { limit: 50, anyStart: true });
    expect(any.some((r) => !isSource(game.state.world.locations[r.fromId]!, r.commodity, data))).toBe(true);
  });
});
