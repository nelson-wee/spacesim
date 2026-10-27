// Wait (Section 8.8). At a docked location, pass 1 to 30 days. The economy
// runs. There are no encounters. Upkeep is added in M6.
import { observe } from '../actor/knowledge';
import { type Game, passTime } from '../core/game';
import type { Actor, Location } from '../core/types';
import { done, isDockedAt, refused, type ServiceResult } from './common';

export function wait(game: Game, actor: Actor, location: Location, days: number): ServiceResult {
  if (!isDockedAt(actor, location)) return refused('You can wait only at a location.');
  const max = game.data.serviceRules.waitMaxDays;
  const n = Math.floor(days);
  if (n < 1 || n > max) return refused(`Wait 1 to ${max} days.`);
  // Day by day: the actor sees the live market each day (Section 9.12).
  for (let i = 0; i < n; i++) {
    passTime(game, 1);
    observe(game, actor);
  }
  return done(`You wait ${n} day${n === 1 ? '' : 's'} at ${location.name}.`);
}
