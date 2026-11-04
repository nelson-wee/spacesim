// Combat effects (Section 18.4, M8-ART-03, M8-ART-04).
import { describe, expect, it } from 'vitest';
import { createBattle } from '../src/combat/battle';
import { createRngState } from '../src/core/rng';
import { gameData } from '../src/data';
import { buildTimeline, overlayAt } from '../src/render/effects';
import { createShipFromLoadout } from '../src/ship/loadout';

const data = gameData();

function battle() {
  return createBattle(
    {
      player: [{ ship: createShipFromLoadout(data, 'start_shuttle', 'p', 'P'), ai: 'human' }],
      other: [
        { ship: createShipFromLoadout(data, 'pirate_raider', 'o1', 'O1'), ai: 'raider' },
        { ship: createShipFromLoadout(data, 'pirate_raider', 'o2', 'O2'), ai: 'raider' },
      ],
      aggressor: 'other',
      rng: createRngState(3, 'combat'),
    },
    data,
  );
}

describe('combat effects', () => {
  it('a reinforcement arrival draws speed streaks from the map edge behind the arriving ship', () => {
    const b = battle();
    const s = b.ships.find((x) => x.side === 'other')!;
    const tl = buildTimeline([{ kind: 'reinforce', side: 'other', faction: 'pirate', shipIds: [s.id] }], b, data);
    expect(tl.frames.length).toBeGreaterThan(0);
    const cells = overlayAt(tl, 1);
    expect(cells.length).toBeGreaterThan(0);
    // The pirate side enters from the right edge.
    expect(cells.some((c) => c.x === b.width - 1)).toBe(true);
    expect(cells.every((c) => c.y >= s.pos.y - 1 && c.y <= s.pos.y + 3)).toBe(true);
  });

  it('the effects of one turn take 1.2 s or less (M8-ART-04)', () => {
    const b = battle();
    const [p, o] = [b.ships.find((x) => x.side === 'player')!, b.ships.find((x) => x.side === 'other')!];
    const shots = Array.from({ length: 12 }, () => ({ kind: 'shot' as const, shipId: p.id, targetId: o.id, moduleId: 'pulse_laser', from: p.pos, to: o.pos, hit: true }));
    const tl = buildTimeline(shots as never, b, data);
    expect(tl.duration).toBeLessThanOrEqual(data.art.effects.queue.budgetMs + data.art.effects.queue.minFrameMs);
  });
});
