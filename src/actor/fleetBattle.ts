// Fleet combat setup (P1-FS-01 to FS-03): which fleet ships join a battle.
// Each ship has a battle setting, Join or Stay out; with no setting, an armed
// ship joins. The flagship always joins. The joined ships use command points
// by size class (`fleet.sizePoints`), at most `fleet.commandPoints`.
import type { Actor, Ship } from '../core/types';
import type { GameData } from '../data';
import { moduleDef } from '../ship/modules';
import { sizePoints } from './fleet';

const WEAPONS = new Set(['laser', 'ballistic', 'guided']);

/** True if the ship has a weapon module (laser, ballistic, or guided). */
export function isArmed(ship: Ship, data: GameData): boolean {
  return ship.hardpoints.some((m) => m !== null && WEAPONS.has(moduleDef(data, m.moduleId).category));
}

/** The ship's own setting: Join or Stay out (the default from its weapons). */
export function wantsToJoin(ship: Ship, data: GameData): boolean {
  return ship.battle ? ship.battle === 'join' : isArmed(ship, data);
}

/**
 * The fleet ships that join a battle: the flagship first, then the other
 * ships that want to join, in fleet order, while command points are left.
 */
export function joinedShips(actor: Actor, data: GameData): Ship[] {
  const flag = actor.fleet[actor.flagshipIndex];
  if (!flag) return [];
  const out = [flag];
  let used = sizePoints(flag, data);
  for (const [i, ship] of actor.fleet.entries()) {
    if (i === actor.flagshipIndex || !wantsToJoin(ship, data)) continue;
    const pts = sizePoints(ship, data);
    if (used + pts > data.balance.fleet.commandPoints + 1e-9) continue;
    out.push(ship);
    used += pts;
  }
  return out;
}

/** Ships that want to join but have no command points left (the UI names them). */
export function leftOut(actor: Actor, data: GameData): Ship[] {
  const joined = new Set(joinedShips(actor, data).map((s) => s.id));
  return actor.fleet.filter((s, i) => i !== actor.flagshipIndex && wantsToJoin(s, data) && !joined.has(s.id));
}

/** Command points of the ships that join (the flagship included). */
export function commandPointsUsed(actor: Actor, data: GameData): number {
  return joinedShips(actor, data).reduce((sum, s) => sum + sizePoints(s, data), 0);
}

/** Toggles Join and Stay out for a fleet ship (not the flagship). A Join over the command points is refused. */
export function toggleJoin(actor: Actor, index: number, data: GameData): { ok: boolean; text: string } {
  const ship = actor.fleet[index];
  if (!ship) return { ok: false, text: 'There is no such ship.' };
  if (index === actor.flagshipIndex) return { ok: false, text: 'The flagship always joins a battle.' };
  if (wantsToJoin(ship, data)) {
    ship.battle = 'stay';
    return { ok: true, text: `${ship.name} stays out of battles (off the map, safe).` };
  }
  const max = data.balance.fleet.commandPoints;
  const need = commandPointsUsed(actor, data) + sizePoints(ship, data);
  if (need > max + 1e-9) return { ok: false, text: `Not enough command points: ${ship.name} needs ${sizePoints(ship, data)}, ${max - commandPointsUsed(actor, data)} of ${max} are free.` };
  ship.battle = 'join';
  return { ok: true, text: `${ship.name} joins battles.${isArmed(ship, data) ? '' : ' It has no weapon.'}` };
}

/**
 * The player-side ships of a battle (P1-FB-01): the flagship with the given
 * AI (human in the game), then the other joined ships with the Wingman AI.
 */
export function fleetBattleSpecs(actor: Actor, data: GameData, flagshipAi: 'human' | 'attack' = 'human'): { ship: Ship; ai: 'human' | 'attack' | 'wingman'; faction: 'player' }[] {
  return joinedShips(actor, data).map((ship, i) => ({ ship, ai: i === 0 ? flagshipAi : 'wingman', faction: 'player' }));
}
