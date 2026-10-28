// Sector security (Sections 6.4 and 10.1).
import type { Rng } from '../core/rng';
import type { Sector } from '../core/types';
import type { GameData, SecurityLevel } from '../data';

/** Baseline: core value, minus a value for each jump, plus or minus a random value, with limits. */
export function securityBaseline(rng: Rng, jumpsFromCore: number, data: GameData): number {
  const b = data.security.baseline;
  const value = b.core - b.perJump * jumpsFromCore + rng.range(-b.jitter, b.jitter);
  return Math.round(Math.min(b.max, Math.max(b.min, value)));
}

/** Security level (0 to 4) of a security value. */
export function securityLevel(value: number, data: GameData): number {
  let level = 0;
  for (const l of data.security.levels) if (value >= l.min) level = l.level;
  return level;
}

/** A §10.3 change (destroyPirate, pirateSurrenders, attackNonPirate) to value and baseline, kept in 0-100. */
export function changeSecurity(sector: Sector, change: string, data: GameData): void {
  const c = data.security.changes[change];
  if (!c) throw new Error(`security.json: no change ${change}`);
  sector.securityValue = clamp100(sector.securityValue + c.value);
  sector.securityBaseline = clamp100(sector.securityBaseline + c.baseline);
}

/** Each day: the value moves `dailyDrift` of the gap toward the baseline; the history keeps `trendDays` values (M5-SEC-02). */
export function securityDay(sectors: Sector[], data: GameData): void {
  for (const s of sectors) {
    s.securityValue = clamp100(s.securityValue + (s.securityBaseline - s.securityValue) * data.security.dailyDrift);
    s.securityHistory.push(s.securityValue);
    if (s.securityHistory.length > data.security.trendDays) s.securityHistory.shift();
  }
}

/** Trend over the last `trendDays` days: 1 up, -1 down, 0 flat (a change of less than 1 point is flat). */
export function securityTrend(sector: Sector): -1 | 0 | 1 {
  const first = sector.securityHistory[0];
  if (first === undefined) return 0;
  const d = sector.securityValue - first;
  return d >= 1 ? 1 : d <= -1 ? -1 : 0;
}

function clamp100(v: number): number {
  return Math.min(100, Math.max(0, v));
}

export function securityLevelInfo(value: number, data: GameData): SecurityLevel {
  const level = securityLevel(value, data);
  const info = data.security.levels.find((l) => l.level === level);
  if (!info) throw new Error(`security.json: no level ${level}`);
  return info;
}
