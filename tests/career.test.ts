import { describe, expect, it } from 'vitest';
import { careerDue, careerScore, careerSummary, careerTitles, endCareer, retire } from '../src/career/career';
import { passTime, wrapGame } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import { deserializeGame, serializeGame } from '../src/core/save';
import { SAVE_VERSION } from '../src/core/types';
import { gameData } from '../src/data';
import { insuredValue } from '../src/services/insurance';
import { securityLevel } from '../src/world/security';

const data = gameData();
const c = data.balance.career;

describe('career end and score (Section 16)', () => {
  it('score = credits + 60% of hull and module prices + cargo at local prices; credits only when the last ship is lost', () => {
    const g = createGame(11, data);
    const p = g.state.player;
    p.credits = 10000;
    const ships = p.fleet.reduce((s, x) => s + insuredValue(x, data), 0);
    expect(careerScore(g)).toBeCloseTo(10000 + c.fleetValueShare * ships);
    p.fleet[0]!.cargo.water = { units: 10, unitCost: 1 };
    expect(careerScore(g)).toBeGreaterThan(10000 + c.fleetValueShare * ships);
    expect(careerScore(g, true)).toBe(10000);
  });

  it('titles by net worth; Dread Pirate at notoriety 50+; Pirate Hunter at 10+ named bounties; Warden of a raised sector', () => {
    const g = createGame(11, data);
    expect(careerTitles(g, 5000).title).toBe('Drifter');
    expect(careerTitles(g, 20000).title).toBe('Hauler');
    expect(careerTitles(g, 100000).title).toBe('Merchant Captain');
    expect(careerTitles(g, 600000).title).toBe('Sector Magnate');
    g.state.player.notoriety = 50;
    expect(careerTitles(g, 600000).title).toBe('Dread Pirate');
    g.state.player.notoriety = 0;
    g.state.career.stats.namedBounties = 10;
    expect(careerTitles(g, 0).secondTitles).toContain('Pirate Hunter');
    const s = g.state.world.sectors[0]!;
    g.state.career.stats.startLevels[0] = 1;
    s.securityValue = data.security.levels.find((l) => l.level === 3)!.min + 1;
    expect(securityLevel(s.securityValue, data)).toBe(3);
    expect(careerTitles(g, 0).secondTitles).toContain(`Warden of ${s.name}`);
  });

  it('the career ends at day 730, at Retire (docked), or at a total loss; the end is kept once; the summary names the stats', () => {
    const g = createGame(11, data);
    expect(careerDue(g)).toBe(false);
    g.state.day = c.days;
    expect(careerDue(g)).toBe(true);
    const end = endCareer(g, 'day');
    expect(careerDue(g)).toBe(false);
    expect(endCareer(g, 'retire')).toBe(end);
    const lines = careerSummary(g, end).join('\n');
    for (const word of ['Days', 'Net worth', 'Jumps', 'Cargo traded', 'Battles won', 'Ships captured', 'Bounties', 'Security change']) expect(lines).toContain(word);
    const g2 = createGame(12, data);
    g2.state.player.position = { kind: 'space', sectorId: 0, x: 1, y: 1 };
    expect(retire(g2)).toMatch(/location/);
  });
});

describe('save and load (M7-SAVE)', () => {
  it('a save holds saveVersion and the seed; load gives a deep-equal state, RNG streams too (exit check 6)', () => {
    const g = createGame(11, data);
    passTime(g, 9.5);
    const text = serializeGame(g);
    const parsed = JSON.parse(text) as { saveVersion: number; seed: number };
    expect(parsed.saveVersion).toBe(SAVE_VERSION);
    expect(parsed.seed).toBe(g.state.seed);
    const loaded = deserializeGame(text, data);
    if (typeof loaded === 'string') throw new Error(loaded);
    expect(loaded.state).toEqual(g.state);
    expect(loaded.state.rng).toEqual(g.state.rng);
  });

  it('after a load, the next days give the same results as with no save', () => {
    const a = createGame(21, data);
    passTime(a, 20);
    const loaded = deserializeGame(serializeGame(a), data);
    if (typeof loaded === 'string') throw new Error(loaded);
    const b = wrapGame(loaded.state, data);
    passTime(a, 30);
    passTime(b, 30);
    expect(b.state).toEqual(a.state);
  });

  it('load refuses an unknown saveVersion and a damaged save', () => {
    const g = createGame(11, data);
    const old = JSON.stringify({ ...g.state, saveVersion: SAVE_VERSION - 1 });
    expect(deserializeGame(old, data)).toMatch(/another version/);
    expect(deserializeGame('{nope', data)).toMatch(/damaged/);
  });
});
