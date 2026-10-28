// Automatic encounter policy for tools (M5-TOOL-04): a careful trader.
// Pirates that avoid: ignore. Pirates that demand tribute or attack, or a
// hostile patrol: flee; if the flee fails, fight with the Attack AI (paying
// half the cargo loses more on average than a 50% flee and a fair fight). Traders and friendly patrols: ignore. Returns 'continue' to go on with
// the trip, or 'stop' after a battle (the bot plans again from where it is).
import { finishBattle, type BattleEnd } from '../../src/career/battleEnd';
import { createBattle } from '../../src/combat/battle';
import { resolveTurn } from '../../src/combat/resolver';
import type { Game } from '../../src/core/game';
import { rng } from '../../src/core/game';
import type { Actor } from '../../src/core/types';
import { battleMapFor } from '../../src/encounter/battleMap';
import { type Encounter, fleeSucceeds } from '../../src/encounter/encounter';
import { createShipFromLoadout } from '../../src/ship/loadout';
import { travelStats } from '../../src/ship/stats';
import { massFactor } from '../../src/actor/fuel';

export interface EncounterLog {
  encounters: number;
  pirates: number;
  paid: number;
  fled: number;
  battles: number;
  results: Record<BattleEnd | 'win' | 'loss' | 'fled' | 'draw', number>;
}

export function newEncounterLog(): EncounterLog {
  return { encounters: 0, pirates: 0, paid: 0, fled: 0, battles: 0, results: { ok: 0, disabled: 0, cloned: 0, gameOver: 0, win: 0, loss: 0, fled: 0, draw: 0 } };
}

/** Runs an encounter battle with the Attack AI for the player (headless). */
function fight(game: Game, actor: Actor, enc: Encounter, enemyFirst: boolean, log: EncounterLog): BattleEnd {
  const { data, state } = game;
  const flag = actor.fleet[actor.flagshipIndex];
  if (!flag) return 'gameOver';
  const sector = state.world.sectors[enc.sectorId];
  let b = createBattle(
    {
      player: [{ ship: flag, ai: 'attack' }],
      other: enc.ships.map((s, i) => {
        const ship = createShipFromLoadout(data, s.loadoutId, `e${i}`, s.loadoutId);
        ship.cargo = structuredClone(s.cargo);
        return { ship, ai: s.ai, faction: s.faction, escortOf: s.escortOf ?? undefined, powerPriority: data.loadoutById.get(s.loadoutId)?.powerPriority };
      }),
      aggressor: 'other',
      rng: state.rng.combat,
      map: sector ? battleMapFor(sector, enc.point, state.world.locations, data) : undefined,
      sectorId: enc.sectorId,
      sector: sector ? { securityValue: sector.securityValue, development: sector.development } : undefined,
    },
    data,
  );
  if (enemyFirst) b = resolveTurn(b, [], data).battle;
  while (!b.result) b = resolveTurn(b, null, data).battle;
  log.battles++;
  log.results[b.result]++;
  const end = finishBattle(game, actor, b);
  log.results[end]++;
  return end;
}

export function encounterPolicy(game: Game, actor: Actor, log: EncounterLog): (enc: Encounter) => 'continue' | 'stop' {
  return (enc) => {
    log.encounters++;
    if (enc.kind === 'pirate') log.pirates++;
    const hostile = (enc.kind === 'pirate' && enc.behavior === 'attack') || (enc.kind === 'patrol' && enc.hostile);
    if (!hostile && !(enc.kind === 'pirate' && enc.behavior === 'tribute')) return 'continue';
    if (fleeSucceeds(actor, enc, rng(game, 'encounter'), game.data)) {
      for (const ship of actor.fleet) ship.fuel = Math.max(0, ship.fuel - massFactor(travelStats(ship, game.data).mass, game.data) * game.data.balance.combat.kFlee);
      log.fled++;
      return 'continue';
    }
    fight(game, actor, enc, true, log);
    return 'stop';
  };
}
