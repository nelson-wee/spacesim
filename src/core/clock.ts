// Time in days, with fractions (Section 8.1). The economy runs one tick for
// each whole day that passes.

/**
 * Moves the clock forward by `days` and calls `onNewDay` one time for each
 * whole-day boundary that the clock crosses. Returns the number of ticks.
 */
export function advanceClock(
  clock: { day: number },
  days: number,
  onNewDay: (day: number) => void,
): number {
  if (!(days >= 0) || !Number.isFinite(days)) throw new Error(`advanceClock: bad duration ${days}`);
  const start = clock.day;
  const end = start + days;
  let ticks = 0;
  for (let d = Math.floor(start) + 1; d <= Math.floor(end); d++) {
    clock.day = d;
    onNewDay(d);
    ticks++;
  }
  clock.day = end;
  return ticks;
}

/** The day number that the UI shows. Day 1 is the first day of the career. */
export function displayDay(day: number): number {
  return Math.floor(day) + 1;
}
