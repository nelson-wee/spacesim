// Reinforcements (Section 13.5, M5-REIN-01 to 03). From turn 3, each turn,
// roll with the chances of the battle's sector (Section 10.2). One group of
// each type per battle. Ships arrive at a random map edge.
// - Patrol: a group from the patrol budget. It fights against the pirates if
//   pirates are in the battle; else against the aggressor (DECISIONS.md, M5).
// - Pirate: a group from 0.3 x the pirate budget (at least a Lone Raider), on
//   the pirate side; only where the pirate chance per turn is above 0
//   (Lawless and Low) and only if pirates are in the battle.
import type { Rng } from '../core/rng';
import type { GameData } from '../data';
import { allowedPirateTemplates, patrolGroup, pirateBudget, selectTemplate } from '../encounter/budget';
import { createShipFromLoadout } from '../ship/loadout';
import { securityLevel } from '../world/security';
import { addShips, type BattleShipSpec } from './battle';
import { isActive } from './geometry';
import type { AiKind, Battle, Effect, Faction, Side } from './types';

const opposite = (s: Side): Side => (s === 'player' ? 'other' : 'player');

function specs(ids: string[], ai: AiKind, faction: Faction, data: GameData, tag: string): BattleShipSpec[] {
  return ids.map((id, i) => ({
    ship: createShipFromLoadout(data, id, `${tag}-${i}`, `${data.loadoutById.get(id)?.name ?? id} ${tag.toUpperCase()}${i + 1}`),
    ai,
    faction,
    powerPriority: data.loadoutById.get(id)?.powerPriority,
  }));
}

export function reinforcementStep(b: Battle, data: GameData, rng: Rng, effects: Effect[]): void {
  if (!b.sector || b.turn + 1 < data.security.reinforcement.startTurn) return;
  const level = data.security.levels.find((l) => l.level === securityLevel(b.sector!.securityValue, data));
  if (!level) return;
  const pirates = b.ships.filter((s) => isActive(s) && s.faction === 'pirate');
  if (!b.reinforced.patrol && level.patrolPerTurn > 0 && rng.chance(level.patrolPerTurn)) {
    const group = patrolGroup(b.sector, rng, data);
    if (group) {
      b.reinforced.patrol = true;
      const side = pirates[0] ? opposite(pirates[0].side) : opposite(b.aggressor === 'neutral' ? 'other' : b.aggressor);
      const ships = addShips(b, side, specs(group.template.ships, 'patrol', 'patrol', data, 'p'), data, rng);
      effects.push({ kind: 'reinforce', side, faction: 'patrol', shipIds: ships.map((s) => s.id) });
      b.log.push(`A patrol arrives (${group.template.name}) on the ${side === 'player' ? 'your' : 'enemy'} side.`);
    }
  }
  if (!b.reinforced.pirate && pirates.length > 0 && level.piratePerTurn > 0 && rng.chance(level.piratePerTurn)) {
    const budget = pirateBudget(b.sector, rng, data) * data.security.reinforcement.pirateBudgetShare;
    const allowed = allowedPirateTemplates(b.sector, data);
    const template = selectTemplate(allowed, budget, rng, data) ?? data.templates.pirate.find((t) => t.id === 'lone_raider') ?? allowed[0];
    if (template) {
      b.reinforced.pirate = true;
      const side = (pirates[0] as (typeof pirates)[number]).side;
      const ships = addShips(b, side, specs(template.ships, 'raider', 'pirate', data, 'r'), data, rng);
      effects.push({ kind: 'reinforce', side, faction: 'pirate', shipIds: ships.map((s) => s.id) });
      b.log.push(`Pirate reinforcements arrive (${template.name}).`);
    }
  }
}
