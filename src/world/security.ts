// Sector security (Sections 6.4 and 10.1).
import type { Rng } from '../core/rng';
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

export function securityLevelInfo(value: number, data: GameData): SecurityLevel {
  const level = securityLevel(value, data);
  const info = data.security.levels.find((l) => l.level === level);
  if (!info) throw new Error(`security.json: no level ${level}`);
  return info;
}
