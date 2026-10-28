// Starts a battle for the player and applies its result (Sections 13.7, 8.6).
// Battles start from encounters (the hail screen) and from the debug panel.
// A loss: pirates disable the ship, others destroy it (career/defeat.ts). A
// win: the player takes the cargo of ships that surrendered and of the pods
// left on the map, as far as it fits (M5-LOOT). Then security and notoriety
// change (career/consequences.ts).
import { actorPlace } from '../actor/travel';
import { towFleet } from '../actor/fuel';
import { battleConsequences } from '../career/consequences';
import { applyDefeat } from '../career/defeat';
import { applyToShip, createBattle } from '../combat/battle';
import { resolveTurn } from '../combat/resolver';
import type { AiKind, Battle, Faction, Side } from '../combat/types';
import type { RngState } from '../core/rng';
import type { CargoLot, Sector } from '../core/types';
import type { BattleMapTemplate } from '../data/schemas';
import { takeCargo } from '../encounter/encounter';
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
  app.push(new CombatScreen(app, battle, (b) => endBattle(app, b)));
}

/** Applies the result to the player's ship (M4: one ship; the fleet rule is M6). */
export function endBattle(app: App, b: Battle): void {
  const game = app.game;
  if (!game) return;
  const { state, data } = game;
  state.rng.combat = [...b.rng] as RngState;
  const player = state.player;
  const flag = player.fleet[player.flagshipIndex];
  if (flag) applyToShip(b, flag);
  battleConsequences(game, player, b);
  if (b.result === 'loss') {
    if (applyDefeat(game, player, b) === 'gameOver') {
      app.game = null;
      app.reset(new TitleScreen(app));
      return;
    }
    app.pop();
    return;
  }
  game.bus.message(resultText(b), b.result === 'win' ? 'good' : 'warning');
  if (b.result === 'win') {
    // Loot (M5-LOOT-01, M5-LOOT-02): cargo of surrendered ships and pods left on the map.
    const loot: Record<string, CargoLot> = {};
    const add = (cargo: Record<string, CargoLot>) => {
      for (const [id, lot] of Object.entries(cargo)) {
        const l = loot[id] ?? { units: 0, unitCost: 0 };
        l.units += lot.units;
        loot[id] = l;
      }
    };
    for (const s of b.ships) if (s.side === 'other' && s.status === 'surrendered') add(s.ship.cargo);
    for (const pod of b.pods) add(pod.cargo);
    const taken = takeCargo(player, loot, data);
    const got = Object.entries(taken).map(([id, u]) => `${Math.floor(u)} ${data.commodityById.get(id)?.name ?? id}`);
    const offered = Object.values(loot).reduce((sum, l) => sum + l.units, 0);
    const took = Object.values(taken).reduce((sum, u) => sum + u, 0);
    if (got.length > 0) game.bus.message(`Loot: ${got.join(', ')}.${took < offered - 1e-6 ? ' The rest does not fit in the hold.' : ''}`, 'good');
    else if (offered > 0) game.bus.message('There is loot, but your hold is full.', 'warning');
  }
  app.pop();
  // A ship with 0 fuel after the battle needs a tow (Section 8.6).
  if (flag && flag.fuel <= 1e-9) {
    const place = actorPlace(game, player);
    towFleet(game, player, place.sectorId, place.point);
  }
}
