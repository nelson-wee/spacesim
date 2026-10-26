import { describe, expect, it } from 'vitest';
import { createStreams, Rng, STREAM_NAMES } from '../src/core/rng';

describe('seeded RNG (G-06, Q-08)', () => {
  it('gives the same sequence for the same seed and stream', () => {
    const a = Rng.fromSeed(42, 'world');
    const b = Rng.fromSeed(42, 'world');
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds and streams', () => {
    const base = Rng.fromSeed(42, 'world').next();
    expect(Rng.fromSeed(43, 'world').next()).not.toBe(base);
    expect(Rng.fromSeed(42, 'economy').next()).not.toBe(base);
  });

  it('streams are independent: using one does not change another', () => {
    const s1 = createStreams(7);
    const s2 = createStreams(7);
    const econ = new Rng(s1.economy);
    for (let i = 0; i < 50; i++) econ.next();
    expect(new Rng(s1.world).next()).toBe(new Rng(s2.world).next());
  });

  it('stream state is plain data and continues after a JSON round trip', () => {
    const streams = createStreams(99);
    const r = new Rng(streams.combat);
    r.next();
    const copy = JSON.parse(JSON.stringify(streams)) as typeof streams;
    expect(new Rng(copy.combat).next()).toBe(new Rng(streams.combat).next());
    expect(Object.keys(streams).sort()).toEqual([...STREAM_NAMES].sort());
  });

  it('gives values in range', () => {
    const r = Rng.fromSeed(1, 'ui');
    for (let i = 0; i < 2000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('int covers both ends', () => {
    const r = Rng.fromSeed(5, 'ui');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 4));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  it('weighted never picks weight 0 and follows weights', () => {
    const r = Rng.fromSeed(11, 'ui');
    const items = [
      { id: 'a', w: 0 },
      { id: 'b', w: 1 },
      { id: 'c', w: 3 },
    ];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 4000; i++) counts[r.weighted(items, (x) => x.w).id]! += 1;
    expect(counts.a).toBe(0);
    expect(counts.c! / counts.b!).toBeGreaterThan(2.5);
    expect(counts.c! / counts.b!).toBeLessThan(3.5);
  });
});
