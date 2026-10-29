// Auto-battle (Q-47, docs/proposals/auto-battle.md). The AI plays the player's
// ship with the Balanced doctrine (ai.ts): the resolver runs the AI for the
// player when it gets no orders. Three modes:
// - A. auto turn: one turn;
// - B. auto until: turn after turn until a stop reason (autoStopReason);
// - C. auto-resolve: the full battle at once (autoResolve).
// The battle RNG stream is the same as in a played battle, so the same seed
// and the same orders give the same result.
import type { GameData } from '../data';
import { isActive } from './geometry';
import { resolveTurn, shipById, type TurnOutput } from './resolver';
import { combatStats, heatState } from './rules';
import type { Battle } from './types';

export type AutoStop = 'end' | 'hull' | 'heat' | 'reinforcement' | 'munition';

/** Mode A: one turn with the AI for the player's ship. */
export function autoTurn(b: Battle, data: GameData): TurnOutput {
  return resolveTurn(b, null, data);
}

/**
 * Mode B: the reason to stop after a turn, or null to go on. Each reason is a
 * change in this turn (the hull falls below combat.auto.stopHull, the heat
 * becomes Hot, a reinforcement arrives, a munition is launched at the player),
 * so that the next "auto until" does not stop at once for the same reason.
 */
export function autoStopReason(before: Battle, out: TurnOutput, data: GameData): AutoStop | null {
  const after = out.battle;
  const p0 = shipById(before, before.playerId);
  const p1 = shipById(after, after.playerId);
  if (after.result || !p0 || !p1 || !isActive(p1)) return 'end';
  const st = combatStats(p1, data);
  const limit = data.balance.combat.auto.stopHull * st.maxHullHp;
  if (p1.ship.hullHp < limit && p0.ship.hullHp >= limit) return 'hull';
  if (heatState(p1, data, st) !== 'normal' && heatState(p0, data) === 'normal') return 'heat';
  if (out.effects.some((e) => e.kind === 'reinforce')) return 'reinforcement';
  const launched = new Set(out.effects.flatMap((e) => (e.kind === 'launch' ? [e.munitionId] : [])));
  if (after.munitions.some((m) => launched.has(m.id) && m.targetId === after.playerId)) return 'munition';
  return null;
}

export const AUTO_STOP_TEXT: Record<AutoStop, string> = {
  end: 'The battle is over.',
  hull: 'Auto stops: your hull is low.',
  heat: 'Auto stops: your ship is Hot.',
  reinforcement: 'Auto stops: reinforcements arrive.',
  munition: 'Auto stops: a munition comes at your ship.',
};

export interface AutoResult {
  battle: Battle;
  /** The output of each turn, in order. */
  turns: TurnOutput[];
}

/** Mode C: plays the battle to its end (combat.maxTurns ends it as a draw). */
export function autoResolve(b: Battle, data: GameData): AutoResult {
  const turns: TurnOutput[] = [];
  let now = b;
  while (!now.result) {
    const out = resolveTurn(now, null, data);
    turns.push(out);
    now = out.battle;
  }
  return { battle: now, turns };
}

/** Summary lines of an auto-resolved battle: turns, the player's damage, and the enemy ships. */
export function autoSummary(start: Battle, end: Battle): string[] {
  const p0 = shipById(start, start.playerId);
  const p1 = shipById(end, end.playerId);
  const lines = [`Auto-resolve: ${end.turn - start.turn} turn${end.turn - start.turn === 1 ? '' : 's'}.`];
  if (p0 && p1) {
    const hull = Math.max(0, p0.ship.hullHp - p1.ship.hullHp);
    const armor = Math.max(0, p0.ship.armorHp - p1.ship.armorHp);
    lines.push(`Your ship: ${Math.round(hull)} hull and ${Math.round(armor)} armor damage; heat ${Math.round(p1.heat)}.`);
  }
  const foes = end.ships.filter((s) => s.side !== p1?.side);
  const count = (status: string) => foes.filter((s) => s.status === status).length;
  lines.push(`Enemy ships: ${count('destroyed')} destroyed, ${count('surrendered')} surrendered, ${count('fled')} fled, ${count('active')} still in the fight.`);
  return lines;
}
