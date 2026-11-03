// What happens when the player loses a battle (owner, 2026-10-28; replaces
// "game over" in brief Sections 13.7 and 16 for these cases).
// - Pirates do not fight to kill. If all hostile ships are pirates, they
//   disable the ship and take all cargo of the fleet. The ship keeps
//   `disabledHullShare` of its hull, and a tug tows the fleet to the nearest
//   location (Section 8.6 recovery fee).
// - Any other loss destroys the ship. With other ships in the fleet, the next
//   ship becomes the flagship and the career goes on (M6-FCMB-04); the lost
//   ship's cargo is lost. If it was the last ship: with Clone Insurance, the
//   player wakes at the insuring location (services/insurance.ts); without
//   it, game over (M6-FCMB-05).
import { removeShip } from '../actor/fleet';
import { towFleet } from '../actor/fuel';
import { actorPlace } from '../actor/travel';
import type { Battle } from '../combat/types';
import type { Game } from '../core/game';
import type { Actor } from '../core/types';
import { claimInsurance } from '../services/insurance';
import { travelStats } from '../ship/stats';

export type DefeatKind = 'disabled' | 'destroyed';

/** Disabled if every ship on the other side is a pirate. */
export function defeatKind(b: Battle): DefeatKind {
  const hostiles = b.ships.filter((s) => s.side === 'other');
  return hostiles.length > 0 && hostiles.every((s) => s.faction === 'pirate') ? 'disabled' : 'destroyed';
}

export type DefeatOutcome = 'disabled' | 'flagshipLost' | 'cloned' | 'gameOver';

/** Applies a lost battle to the actor. The battle result is already on the flagship (applyToShip). */
export function applyDefeat(game: Game, actor: Actor, b: Battle): DefeatOutcome {
  const { data } = game;
  if (defeatKind(b) === 'disabled') {
    let units = 0;
    let cost = 0;
    for (const ship of actor.fleet) {
      for (const lot of Object.values(ship.cargo)) {
        units += lot.units;
        cost += lot.units * lot.unitCost;
      }
      ship.cargo = {};
    }
    const flag = actor.fleet[actor.flagshipIndex];
    if (flag) flag.hullHp = Math.max(flag.hullHp, travelStats(flag, data).maxHullHp * data.balance.combat.disabledHullShare);
    game.bus.message(
      units > 0 ? `The pirates disable your ship and take all cargo: ${Math.round(units)} units (bought for ${Math.round(cost)} cr).` : 'The pirates disable your ship. You have no cargo for them.',
      'danger',
    );
    const place = actorPlace(game, actor);
    towFleet(game, actor, place.sectorId, place.point, 0, true);
    return 'disabled';
  }
  if (actor.fleet.length > 1) {
    const lost = removeShip(game, actor, actor.flagshipIndex);
    const next = actor.fleet[actor.flagshipIndex];
    game.bus.message(`${lost?.name ?? 'Your flagship'} is destroyed, with its cargo. ${next?.name ?? '?'} is your new flagship.`, 'danger');
    return 'flagshipLost';
  }
  game.bus.message('Your ship is destroyed.', 'danger');
  const claim = claimInsurance(game, actor);
  if (claim) {
    game.bus.message(claim.text, 'warning');
    return 'cloned';
  }
  game.bus.message('You have no Clone Insurance. Game over.', 'danger');
  return 'gameOver';
}
