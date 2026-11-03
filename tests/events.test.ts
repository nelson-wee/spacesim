import { describe, expect, it } from 'vitest';
import { createGame } from '../src/core/newGame';
import { createRngState, Rng } from '../src/core/rng';
import type { MarketEvent } from '../src/core/types';
import { gameData } from '../src/data';
import { econContext } from '../src/econ/context';
import { batchMult, eventsDay, useMult } from '../src/econ/events';

const data = gameData();
const kind = (id: string) => data.events.kinds.find((k) => k.id === id)!;

describe('market events (Section 9.11)', () => {
  it('Shortage doubles one use; Boom x1.5 and Strike x0 multiply the batches of one producer', () => {
    const g = createGame(11, data);
    const e = g.state.world.economy;
    const loc = g.state.world.locations.find((l) => l.producer)!;
    e.events = [{ id: 1, kind: 'shortage', startDay: 0, endDay: 30, locationId: loc.id, commodity: 'food' }];
    expect(useMult(e, loc.id, 'food', data)).toBe(kind('shortage').useMult);
    expect(useMult(e, loc.id, 'water', data)).toBe(1);
    e.events = [{ id: 2, kind: 'boom', startDay: 0, endDay: 30, locationId: loc.id }];
    expect(batchMult(e, loc, data)).toBe(1.5);
    e.events = [{ id: 3, kind: 'strike', startDay: 0, endDay: 15, locationId: loc.id }];
    expect(batchMult(e, loc, data)).toBe(0);
  });

  it('new events have durations in range; at most 3 are active; old events end; a Pirate Surge lowers security by 20 at once', () => {
    const g = createGame(11, data);
    const ctx = econContext(g.state.world, data);
    const e = g.state.world.economy;
    const r = new Rng(createRngState(5, 'economy'));
    const seen: MarketEvent[] = [];
    for (let d = 0; d < 2000; d++) {
      const before = g.state.world.sectors.map((s) => s.securityValue);
      const ev = eventsDay(ctx, e, r);
      e.days++;
      expect(e.events.length).toBeLessThanOrEqual(data.events.maxActive);
      if (!ev) continue;
      seen.push(ev);
      const k = kind(ev.kind);
      const days = ev.endDay - ev.startDay;
      expect(days).toBeGreaterThanOrEqual(k.minDays);
      expect(days).toBeLessThanOrEqual(k.maxDays);
      if (ev.kind === 'pirateSurge') {
        const s = g.state.world.sectors[ev.sectorId!]!;
        expect(s.securityValue).toBeCloseTo(Math.max(0, (before[s.id] as number) - 20));
        for (const x of g.state.world.sectors) x.securityValue = 50;
      }
    }
    for (const id of ['shortage', 'boom', 'strike', 'pirateSurge']) expect(seen.some((x) => x.kind === id)).toBe(true);
    e.days = 10000;
    eventsDay(ctx, e, new Rng(createRngState(9, 'economy')));
    expect(e.events.every((x) => x.endDay > e.days)).toBe(true);
  });
});
