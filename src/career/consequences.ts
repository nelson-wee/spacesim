// What a battle or an attack changes in the world (Sections 10.3, 15; Q-21).
// - The player selects Attack on a trader or patrol (Q-21): notoriety +15,
//   sector security -4 (baseline -0.5), one time for the battle.
// - After a battle in a sector: each pirate ship destroyed +3 (+0.5), each
//   pirate ship that surrendered +2 (+0.3), notoriety -3 for each of them;
//   each non-pirate ship destroyed on the other side: notoriety +10.
import type { Battle } from '../combat/types';
import type { Game } from '../core/game';
import type { Actor } from '../core/types';
import { changeSecurity } from '../world/security';
import { addNotoriety } from './notoriety';

export function attackNonPirate(game: Game, actor: Actor, sectorId: number): void {
  const sector = game.state.world.sectors[sectorId];
  const n = game.data.balance.notoriety;
  addNotoriety(actor, n.attackNonPirate, game.data);
  if (sector) changeSecurity(sector, 'attackNonPirate', game.data);
  game.bus.message(`You attack a non-pirate ship. Notoriety +${n.attackNonPirate}; ${sector?.name ?? 'the sector'} is less secure.`, 'warning');
}

export function battleConsequences(game: Game, actor: Actor, b: Battle): void {
  const sector = b.sectorId === null ? undefined : game.state.world.sectors[b.sectorId];
  const n = game.data.balance.notoriety;
  const others = b.ships.filter((s) => s.side === 'other');
  const pirateKills = others.filter((s) => s.faction === 'pirate' && s.status === 'destroyed').length;
  const pirateSurrenders = others.filter((s) => s.faction === 'pirate' && s.status === 'surrendered').length;
  const otherKills = others.filter((s) => s.faction !== 'pirate' && s.status === 'destroyed').length;
  if (sector) {
    for (let i = 0; i < pirateKills; i++) changeSecurity(sector, 'destroyPirate', game.data);
    for (let i = 0; i < pirateSurrenders; i++) changeSecurity(sector, 'pirateSurrenders', game.data);
  }
  if (pirateKills + pirateSurrenders > 0) {
    addNotoriety(actor, n.pirateKilledOrCaptured * (pirateKills + pirateSurrenders), game.data);
    if (sector) game.bus.message(`Pirates beaten: ${sector.name} is more secure (${Math.round(sector.securityValue)}).`, 'good');
  }
  // The player attacked and a patrol came for them (Section 15): notoriety +10.
  if (b.aggressor === 'player' && others.some((s) => s.faction === 'patrol' && s.ai === 'patrol' && b.reinforced.patrol)) {
    addNotoriety(actor, n.aggressorWhenPatrolArrives, game.data);
    game.bus.message(`A patrol answered your attack. Notoriety +${n.aggressorWhenPatrolArrives}.`, 'danger');
  }
  if (otherKills > 0) {
    addNotoriety(actor, n.destroyNonPirate * otherKills, game.data);
    game.bus.message(`You destroyed ${otherKills} non-pirate ship${otherKills === 1 ? '' : 's'}. Notoriety +${n.destroyNonPirate * otherKills}.`, 'danger');
  }
}
