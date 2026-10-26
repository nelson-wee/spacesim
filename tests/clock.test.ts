import { describe, expect, it } from 'vitest';
import { advanceClock, displayDay } from '../src/core/clock';

describe('clock (Section 8.1)', () => {
  it('keeps fractions and ticks once for each whole day crossed', () => {
    const clock = { day: 0 };
    const ticks: number[] = [];
    advanceClock(clock, 0.4, (d) => ticks.push(d));
    expect(ticks).toEqual([]);
    advanceClock(clock, 0.7, (d) => ticks.push(d));
    expect(ticks).toEqual([1]);
    expect(clock.day).toBeCloseTo(1.1);
    advanceClock(clock, 2.9, (d) => ticks.push(d));
    expect(ticks).toEqual([1, 2, 3, 4]);
    expect(clock.day).toBeCloseTo(4.0);
  });

  it('ticks exactly at a whole day', () => {
    const clock = { day: 0 };
    let n = 0;
    advanceClock(clock, 1, () => n++);
    expect(n).toBe(1);
  });

  it('rejects a negative duration', () => {
    expect(() => advanceClock({ day: 0 }, -1, () => {})).toThrow();
  });

  it('shows day 1 at the start', () => {
    expect(displayDay(0)).toBe(1);
    expect(displayDay(1.5)).toBe(2);
  });
});
