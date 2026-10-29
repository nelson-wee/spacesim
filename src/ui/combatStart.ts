// Starts a battle for the player and applies its result (Sections 13.7, 8.6).
// Battles start from encounters (the hail screen) and from the debug panel.
// A loss: pirates disable the ship, others destroy it (career/defeat.ts). A
// win: the player takes the cargo of ships that surrendered and of the pods
// left on the map, as far as it fits (M5-LOOT). Then security and notoriety
// change (career/consequences.ts).
import { finishBattle } from '../career/battleEnd';
import { createBattle } from '../combat/battle';
import { resolveTurn } from '../combat/resolver';
import type { AiKind, Battle, Faction, Side } from '../combat/types';
import type { CargoLot, Sector } from '../core/types';
import type { BattleMapTemplate } from '../data/schemas';
import { createShipFromLoadout } from '../ship/loadout';
import type { App } from './app';
import { CombatScreen, resultText } from './screens/combat';
import { TitleScreen } from './screens/title';

export interface EnemySpec {
  loadoutId: string;
  ai: AiKind;
  faction?: Faction;
  /** Escort of the ship with this index in the list (Patrol AI). */
  escortOf?: number | null;
  cargo?: Record<string, CargoLot>;
}

export interface BattleOptions {
  /** Default: the player if a trader is in the battle, else the other side. */
  aggressor?: Side;
  map?: BattleMapTemplate;
  sectorId?: number;
  /** A failed flee: the enemy acts first (Q-15). */
  enemyFirst?: boolean;
  /** The text of the first log line. */
  intro?: string;
  /** Auto-resolve the battle at once (Q-47): the screen opens on the result. */
  autoResolve?: boolean;
}

function sectorOf(sectors: Sector[], id: number | undefined): { securityValue: number; development: Sector['development'] } | undefined {
  const s = id === undefined ? undefined : sectors[id];
  return s ? { securityValue: s.securityValue, development: s.development } : undefined;
}

/** A battle of the player's flagship against ships from loadouts. */
export function startBattle(app: App, enemies: EnemySpec[], options: BattleOptions = {}): void {
  const game = app.game;
  if (!game) return;
  const { data, state } = game;
  const player = state.player;
  const flag = player.fleet[player.flagshipIndex];
  if (!flag) return;
  let battle = createBattle(
    {
      player: [{ ship: flag, ai: 'human' }],
      other: enemies.map((e, i) => {
        const ship = createShipFromLoadout(data, e.loadoutId, `enemy-${i}`, `${data.loadoutById.get(e.loadoutId)?.name ?? e.loadoutId} ${i + 1}`);
        if (e.cargo) ship.cargo = structuredClone(e.cargo);
        return {
          ship,
          ai: e.ai,
          faction: e.faction,
          escortOf: e.escortOf ?? undefined,
          powerPriority: data.loadoutById.get(e.loadoutId)?.powerPriority,
        };
      }),
      aggressor: options.aggressor ?? (enemies.some((e) => e.ai === 'trader') ? 'player' : 'other'),
      rng: state.rng.combat,
      map: options.map,
      sectorId: options.sectorId,
      sector: sectorOf(state.world.sectors, options.sectorId),
    },
    data,
  );
  game.bus.message(options.intro ?? `Battle: ${enemies.length} ship${enemies.length === 1 ? '' : 's'} attack.`, 'danger');
  if (options.enemyFirst) {
    // The player gives no orders in this turn: the enemy acts first.
    battle = resolveTurn(battle, [], data).battle;
    battle.log.push('The enemy acts first.');
  }
  app.push(new CombatScreen(app, battle, (b) => endBattle(app, b), { autoResolve: options.autoResolve }));
}

/** Applies the result (career/battleEnd.ts) and leaves the battle screen; game over goes to the title. */
export function endBattle(app: App, b: Battle): void {
  const game = app.game;
  if (!game) return;
  if (b.result !== 'loss') game.bus.message(resultText(b), b.result === 'win' ? 'good' : 'warning');
  if (finishBattle(game, game.state.player, b) === 'gameOver') {
    app.game = null;
    app.reset(new TitleScreen(app));
    return;
  }
  app.pop();
}
