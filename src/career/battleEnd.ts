// The end of a battle, headless (Sections 13.7, 8.6; career/defeat.ts;
// career/consequences.ts). The UI and the tools use it. It writes the combat
// RNG state back, copies the flagship's state, applies security and notoriety
// changes, then: a loss disables or destroys the ship; a win gives the loot
// (cargo of pods on the map, and with automatic boarding the cargo of
// surrendered ships, as far as it fits); a flee from pirates costs cargo of
// one non-flagship ship (M6-FCMB-03). With manual boarding, the UI shows the
// after-battle screen for the surrendered ships (career/prize.ts).
// A flagship with 0 fuel after the battle is towed.
import { towFleet } from '../actor/fuel';
import { actorPlace } from '../actor/travel';
import { applyToShip } from '../combat/battle';
import type { Battle } from '../combat/types';
import type { Game } from '../core/game';
import type { RngState } from '../core/rng';
import type { Actor, CargoLot } from '../core/types';
import { fleeCargoLoss, takeCargo } from '../encounter/encounter';
import { rng } from '../core/game';
import { battleConsequences } from './consequences';
import { applyDefeat, type DefeatOutcome } from './defeat';

export type BattleEnd = DefeatOutcome | 'ok';

export interface FinishOptions {
  /** 'auto' (tools, tests): take the cargo of surrendered ships. 'manual': the after-battle screen does it. */
  boarding?: 'auto' | 'manual';
}

export function finishBattle(game: Game, actor: Actor, b: Battle, options: FinishOptions = {}): BattleEnd {
  const { state, data } = game;
  state.rng.combat = [...b.rng] as RngState;
  const flag = actor.fleet[actor.flagshipIndex];
  if (flag) applyToShip(b, flag);
  battleConsequences(game, actor, b);
  if (b.result === 'loss') {
    const outcome = applyDefeat(game, actor, b);
    if (outcome !== 'flagshipLost') return outcome;
  }
  if (b.result === 'fled' && b.ships.some((s) => s.side === 'other' && s.faction === 'pirate')) {
    const loss = fleeCargoLoss(actor, rng(game, 'encounter'), data);
    if (loss && loss.units > 1e-9) game.bus.message(`The pirates take cargo from ${loss.ship.name}: ${Math.round(loss.units)} units.`, 'warning');
  }
  if (b.result === 'win') {
    const loot: Record<string, CargoLot> = {};
    const add = (cargo: Record<string, CargoLot>) => {
      for (const [id, lot] of Object.entries(cargo)) {
        const l = loot[id] ?? { units: 0, unitCost: 0 };
        l.units += lot.units;
        loot[id] = l;
      }
    };
    if ((options.boarding ?? 'auto') === 'auto') for (const s of b.ships) if (s.side === 'other' && s.status === 'surrendered') add(s.ship.cargo);
    for (const pod of b.pods) add(pod.cargo);
    const taken = takeCargo(actor, loot, data);
    const got = Object.entries(taken).map(([id, u]) => `${Math.floor(u)} ${data.commodityById.get(id)?.name ?? id}`);
    const offered = Object.values(loot).reduce((sum, l) => sum + l.units, 0);
    const took = Object.values(taken).reduce((sum, u) => sum + u, 0);
    if (got.length > 0) game.bus.message(`Loot: ${got.join(', ')}.${took < offered - 1e-6 ? ' The rest does not fit in the hold.' : ''}`, 'good');
    else if (offered > 0) game.bus.message('There is loot, but your hold is full.', 'warning');
  }
  const now = actor.fleet[actor.flagshipIndex];
  if (now && now.fuel <= 1e-9) {
    const place = actorPlace(game, actor);
    towFleet(game, actor, place.sectorId, place.point);
  }
  return b.result === 'loss' ? 'flagshipLost' : 'ok';
}
