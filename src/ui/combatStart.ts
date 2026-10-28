// Starts a battle for the player and applies its result (Sections 13.7, 8.6).
// M4 starts battles from the debug panel; M5 starts them from encounters.
import { actorPlace } from '../actor/travel';
import { towFleet } from '../actor/fuel';
import { applyToShip, createBattle } from '../combat/battle';
import type { AiKind, Battle } from '../combat/types';
import type { RngState } from '../core/rng';
import { createShipFromLoadout } from '../ship/loadout';
import type { App } from './app';
import { CombatScreen, resultText } from './screens/combat';
import { TitleScreen } from './screens/title';

export interface EnemySpec {
  loadoutId: string;
  ai: AiKind;
}

/** A battle of the player's flagship against ships from loadouts. */
export function startBattle(app: App, enemies: EnemySpec[]): void {
  const game = app.game;
  if (!game) return;
  const { data, state } = game;
  const player = state.player;
  const flag = player.fleet[player.flagshipIndex];
  if (!flag) return;
  const battle = createBattle(
    {
      player: [{ ship: flag, ai: 'human' }],
      other: enemies.map((e, i) => ({
        ship: createShipFromLoadout(data, e.loadoutId, `enemy-${i}`, `${data.loadoutById.get(e.loadoutId)?.name ?? e.loadoutId} ${i + 1}`),
        ai: e.ai,
        powerPriority: data.loadoutById.get(e.loadoutId)?.powerPriority,
      })),
      aggressor: enemies.some((e) => e.ai === 'trader') ? 'player' : 'other',
      rng: state.rng.combat,
    },
    data,
  );
  game.bus.message(`Battle: ${enemies.length} ship${enemies.length === 1 ? '' : 's'} attack.`, 'danger');
  app.push(new CombatScreen(app, battle, (b) => endBattle(app, b)));
}

/** Applies the result to the player's ship; game over on a loss (M4: one ship; the fleet rule is M6). */
export function endBattle(app: App, b: Battle): void {
  const game = app.game;
  if (!game) return;
  const { state } = game;
  state.rng.combat = [...b.rng] as RngState;
  const player = state.player;
  const flag = player.fleet[player.flagshipIndex];
  if (flag) applyToShip(b, flag);
  game.bus.message(resultText(b.result), b.result === 'win' ? 'good' : b.result === 'loss' ? 'danger' : 'warning');
  if (b.result === 'loss') {
    game.bus.message('Game over.', 'danger');
    app.game = null;
    app.reset(new TitleScreen(app));
    return;
  }
  app.pop();
  // A ship with 0 fuel after the battle needs a tow (Section 8.6).
  if (flag && flag.fuel <= 1e-9) {
    const place = actorPlace(game, player);
    towFleet(game, player, place.sectorId, place.point);
  }
}
