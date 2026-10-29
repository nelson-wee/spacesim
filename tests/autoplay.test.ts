import { describe, expect, it } from 'vitest';
import { autoResolve, autoStopReason, autoSummary, autoTurn } from '../src/combat/autoplay';
import { createBattle } from '../src/combat/battle';
import { resolveTurn } from '../src/combat/resolver';
import { combatStats } from '../src/combat/rules';
import type { Battle, CombatShip } from '../src/combat/types';
import { createRngState } from '../src/core/rng';
import { gameData } from '../src/data';
import { createShipFromLoadout } from '../src/ship/loadout';

const data = gameData();

function battle(seed = 1, player = 'start_shuttle', others: string[] = ['pirate_raider']): Battle {
  return createBattle(
    {
      player: [{ ship: createShipFromLoadout(data, player, 'p', 'Player'), ai: 'human' }],
      other: others.map((l, i) => ({ ship: createShipFromLoadout(data, l, `o${i}`, `Enemy ${i}`), ai: 'raider' as const, powerPriority: data.loadoutById.get(l)?.powerPriority })),
      aggressor: 'other',
      rng: createRngState(seed, 'combat'),
    },
    data,
  );
}
const P = (b: Battle) => b.ships.find((s) => s.id === b.playerId) as CombatShip;

describe('auto-battle (Q-47)', () => {
  it('auto turn is a turn with no player orders', () => {
    const b = battle(3);
    expect(autoTurn(b, data)).toEqual(resolveTurn(b, null, data));
  });

  it('auto-resolve ends the battle and gives the same result as a turn loop on the same seed', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const b = battle(seed);
      let loop = b;
      while (!loop.result) loop = resolveTurn(loop, null, data).battle;
      const auto = autoResolve(b, data);
      expect(auto.battle).toEqual(loop);
      expect(auto.turns.length).toBe(loop.turn - b.turn);
      expect(auto.battle.turn).toBeLessThanOrEqual(data.balance.combat.maxTurns);
    }
  });

  it('auto-resolve does not change the start battle', () => {
    const b = battle(7);
    const copy = structuredClone(b);
    autoResolve(b, data);
    expect(b).toEqual(copy);
  });

  it('Balanced doctrine: below retreatHull, the player ship retreats to an edge and does not fire', () => {
    const b = battle(2);
    const p = P(b);
    p.ship.hullHp = combatStats(p, data).maxHullHp * data.balance.combat.auto.retreatHull * 0.5;
    const out = autoTurn(b, data);
    expect(P(out.battle).retreating).toBe(true);
    expect(out.effects.some((e) => e.kind === 'shot' && e.shipId === b.playerId)).toBe(false);
  });

  it('auto until: stops when the hull falls below stopHull, not again on the next turn', () => {
    const b = battle(2);
    const p = P(b);
    const limit = combatStats(p, data).maxHullHp * data.balance.combat.auto.stopHull;
    const out = autoTurn(b, data);
    const after = structuredClone(out.battle);
    P(after).ship.hullHp = limit - 1;
    p.ship.hullHp = limit + 1;
    expect(autoStopReason(b, { ...out, battle: after }, data)).toBe('hull');
    expect(autoStopReason(after, { ...out, battle: structuredClone(after) }, data)).toBeNull();
  });

  it('auto until: stops at the end, at Hot heat, at a reinforcement, and at a munition launched at the player', () => {
    const b = battle(2);
    const out = autoTurn(b, data);
    expect(autoStopReason(b, { ...out, battle: { ...out.battle, result: 'win' } }, data)).toBe('end');
    const hot = structuredClone(out.battle);
    P(hot).heat = combatStats(P(hot), data).heatCapacity * 0.9;
    P(b).heat = 0;
    expect(autoStopReason(b, { ...out, battle: hot }, data)).toBe('heat');
    expect(autoStopReason(b, { ...out, effects: [{ kind: 'reinforce', side: 'other', faction: 'pirate', shipIds: [9] }] }, data)).toBe('reinforcement');
    const m = structuredClone(out.battle);
    m.munitions.push({ id: 99, ownerId: 1, side: 'other', targetId: m.playerId, moduleId: 'missile_rack', size: 'S', tier: 1, pos: { x: 30, y: 10 }, life: 5, hp: 1, fresh: true });
    expect(autoStopReason(b, { ...out, battle: m, effects: [{ kind: 'launch', shipId: 1, moduleId: 'missile_rack', munitionId: 99, at: { x: 30, y: 10 } }] }, data)).toBe('munition');
  });

  it('summary lines name the turns, the damage, and the enemy ships', () => {
    const b = battle(4);
    const end = autoResolve(b, data).battle;
    const lines = autoSummary(b, end);
    expect(lines[0]).toMatch(/^Auto-resolve: \d+ turns?\.$/);
    expect(lines.join(' ')).toMatch(/Enemy ships: \d+ destroyed/);
  });
});
