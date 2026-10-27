// Debug actions (Section 4.3). The UI shows them only in development builds.
// Later milestones add: show all prices (M2), set sector security (M5),
// test battles (M4, M5), and spawn contracts (M7).
import { observe } from '../actor/knowledge';
import { type Game, passTime } from '../core/game';
import type { Actor } from '../core/types';
import { travelStats } from '../ship/stats';

export function debugAddCredits(game: Game, actor: Actor, amount: number): void {
  actor.credits += amount;
  game.bus.message(`[debug] Credits +${amount}.`, 'warning');
}

/** Sets the fuel of each ship to a share of its capacity (0 to 1). */
export function debugSetFuel(game: Game, actor: Actor, share: number): void {
  for (const ship of actor.fleet) ship.fuel = travelStats(ship, game.data).fuelCapacity * share;
  game.bus.message(`[debug] Fuel set to ${Math.round(share * 100)}%.`, 'warning');
}

export function debugTeleport(game: Game, actor: Actor, locationId: number): void {
  const loc = game.state.world.locations[locationId];
  if (!loc) throw new Error(`Unknown location ${locationId}`);
  actor.position = { kind: 'docked', locationId };
  observe(game, actor);
  game.bus.message(`[debug] Teleport to ${loc.name}.`, 'warning');
}

export function debugSkipDays(game: Game, days: number): void {
  passTime(game, days);
  game.bus.message(`[debug] ${days} days pass.`, 'warning');
}
