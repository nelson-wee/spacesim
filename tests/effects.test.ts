// Combat effects v0.2 (Section 18.4, M8-ART-03, M8-ART-04, M8-ART-05).
import { describe, expect, it } from 'vitest';
import { createBattle } from '../src/combat/battle';
import { lineCells, shipCells } from '../src/combat/geometry';
import { resolveTurn } from '../src/combat/resolver';
import type { Effect } from '../src/combat/types';
import { createRngState } from '../src/core/rng';
import { gameData } from '../src/data';
import { applyOverlay, artCells, buildTimeline, cellHash, effectVersion, ellipse, overlayAt, persistCells, renderOps } from '../src/render/effects';
import { createShipFromLoadout } from '../src/ship/loadout';

const data = gameData();

function battle(player = 'start_shuttle', other = 'pirate_raider', two = true) {
  return createBattle(
    {
      player: [{ ship: createShipFromLoadout(data, player, 'p', 'P'), ai: 'human' }],
      other: [
        { ship: createShipFromLoadout(data, other, 'o1', 'O1'), ai: 'raider' },
        ...(two ? [{ ship: createShipFromLoadout(data, other, 'o2', 'O2'), ai: 'raider' as const }] : []),
      ],
      aggressor: 'other',
      rng: createRngState(3, 'combat'),
    },
    data,
  );
}

function duel() {
  const b = battle('laser_gunship', 'pirate_gunship', false);
  const [p, o] = [b.ships[0]!, b.ships[1]!];
  p.pos = { x: 2, y: 3 };
  o.pos = { x: 26, y: 3 };
  return { b, p, o, from: { x: 5, y: 3 }, to: { x: 26, y: 3 } };
}

/** All cells of the timeline frames that are on at their start time, as "x,y". */
function cellsAtPeak(effects: Effect[], b: ReturnType<typeof duel>['b']) {
  const tl = buildTimeline(effects, b, data);
  return tl.frames.flatMap((f) => f.cells);
}

describe('effect geometry (v0.2 rules)', () => {
  it('rings and discs follow the 2:1 ellipse rule', () => {
    const ring1 = ellipse(1, 'ring');
    for (const c of ring1) {
      const d = Math.sqrt((c.x / 2) ** 2 + c.y ** 2);
      expect(d).toBeGreaterThanOrEqual(0.5);
      expect(d).toBeLessThan(1.5);
    }
    // Twice as wide as high on the grid.
    expect(Math.max(...ring1.map((c) => c.x))).toBe(2);
    expect(Math.max(...ring1.map((c) => c.y))).toBe(1);
    expect(ellipse(0, 'disc')).toEqual([{ x: 0, y: 0 }]);
    expect(ellipse(2, 'disc').length).toBeGreaterThan(ellipse(2, 'ring').length);
  });

  it('frac uses a stable cell hash: the same turn looks the same', () => {
    expect(cellHash(3, 4, 2)).toBe(cellHash(3, 4, 2));
    const op = { k: 'ring', at: { x: 20, y: 10 }, r: 2, g: '·', fg: 'laser', frac: 0.5, seed: 5 };
    const a = renderOps([op], { data, paths: {} });
    expect(renderOps([op], { data, paths: {} })).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThan(ellipse(2, 'ring').length);
  });

  it('a soft cell paints only empty cells', () => {
    const cells = [
      { x: 1, y: 1, ch: 'A', fg: '#fff' },
      { x: 1, y: 1, ch: 'b', fg: '#fff', soft: true },
      { x: 2, y: 1, ch: 'c', fg: '#fff', soft: true },
      { x: 3, y: 1, ch: 'd', fg: '#fff', soft: true },
    ];
    const drawn: string[] = [];
    applyOverlay(cells, (x) => x === 3, (c) => drawn.push(c.ch));
    expect(drawn).toEqual(['A', 'c']);
  });

  it('a line takes its glyph from the step direction', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 1 },
    ];
    const out = renderOps([{ k: 'line', path: 'p', set: 'thin', fg: 'laser' }], { data, paths: { p: path } });
    expect(out.map((c) => c.ch).join('')).toBe('──\\│/');
  });
});

describe('weapon effects by tier', () => {
  it('a pulse laser hit draws the beam on the shot path and a spark on the impact cell', () => {
    const { b, p, o, from, to } = duel();
    const cells = cellsAtPeak([{ kind: 'shot', shipId: p.id, moduleId: 'pulse_laser', from, to, targetId: o.id, hit: true, tier: 1 }], b);
    for (const c of lineCells(from, to)) expect(cells.some((x) => x.x === c.x && x.y === c.y && x.ch === '─')).toBe(true);
    expect(cells.some((x) => x.x === to.x && x.y === to.y && x.ch === '*')).toBe(true);
  });

  it('a higher tier takes longer and adds rings and the Core color (Q: tier never changes the hue)', () => {
    const { b, p, o, from, to } = duel();
    const shot = (tier: 1 | 2 | 3) => [{ kind: 'shot' as const, shipId: p.id, moduleId: 'pulse_laser', from, to, targetId: o.id, hit: true, tier }];
    const [t1, t3] = [buildTimeline(shot(1), b, data), buildTimeline(shot(3), b, data)];
    expect(t3.duration).toBeGreaterThan(t1.duration);
    const core = data.art.effects.colors.laserCore;
    expect(t1.frames.flatMap((f) => f.cells).some((c) => c.fg === core)).toBe(false);
    expect(t3.frames.flatMap((f) => f.cells).some((c) => c.fg === core)).toBe(true);
    // T3 has the thick beam.
    expect(t3.frames.flatMap((f) => f.cells).some((c) => c.ch === '═')).toBe(true);
    expect(effectVersion(data, 'pulse_laser_hit', 3)?.totalMs).toBe(375);
    expect(effectVersion(data, 'hull_hit', 3)).toBe(effectVersion(data, 'hull_hit', 1));
  });

  it('the resolver gives the module tier to each shot', () => {
    const { b, o, p } = duel();
    o.pos = { x: 14, y: 3 };
    for (const m of o.ship.hardpoints) if (m) m.tier = 3;
    const shots = resolveTurn(b, [], data).effects.filter((e) => e.kind === 'shot' && e.shipId === o.id);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((e) => e.kind === 'shot' && e.tier === 3)).toBe(true);
    expect(p.id).not.toBe(o.id);
  });

  it('autocannon rounds travel along the path, 3, 4, and 5 rounds by tier', () => {
    const { b, p, o, from, to } = duel();
    const counts = ([1, 2, 3] as const).map((tier) => {
      const tl = buildTimeline([{ kind: 'shot', shipId: p.id, moduleId: 'autocannon', from, to, targetId: o.id, hit: true, tier }], b, data);
      return Math.max(...tl.frames.map((f) => f.cells.filter((c) => c.ch === '·' && c.y === to.y && c.x > from.x && c.x < to.x).length));
    });
    expect(counts).toEqual([3, 4, 5]);
  });

  it('a missile flies the whole path of its turn; the screen does not draw it while it moves', () => {
    const { b } = duel();
    const path = Array.from({ length: 7 }, (_, i) => ({ x: 6 + i, y: 3 }));
    const tl = buildTimeline([{ kind: 'munitionMove', munitionId: 9, moduleId: 'missile_rack', path, tier: 1 }], b, data);
    const heads = tl.frames.map((f) => f.cells.find((c) => c.ch === '►')?.x).filter((x) => x !== undefined);
    expect(heads[0]).toBe(7);
    expect(heads[heads.length - 1]).toBe(12);
    expect(tl.movingMunitions).toEqual([9]);
  });
});

describe('damage, destroy, and ship moves', () => {
  it('a shield hit lights the perimeter on the side toward the shooter', () => {
    const { b, p, o, from, to } = duel();
    const tl = buildTimeline(
      [
        { kind: 'shot', shipId: p.id, moduleId: 'pulse_laser', from, to, targetId: o.id, hit: true, tier: 1 },
        { kind: 'shield', shipId: o.id, amount: 4, broken: false },
      ],
      b,
      data,
    );
    const shield = tl.frames.flatMap((f) => f.cells).filter((c) => c.ch === '▒');
    expect(shield.length).toBeGreaterThan(0);
    const minX = Math.min(...shipCells(o).map((c) => c.x));
    expect(shield.every((c) => c.x < minX)).toBe(true);
  });

  it('a destroyed ship shows as it was until its effect starts, then debris (persist)', () => {
    const { b, o } = duel();
    const tl = buildTimeline([{ kind: 'destroy', shipId: o.id }], b, data);
    expect(tl.ships[o.id]?.settleAt).toBe(0);
    const debris = persistCells(data, 'destroy_medium', o, b.width, b.height);
    const foot = new Set(shipCells(o).map((c) => `${c.x},${c.y}`));
    expect(debris.length).toBeGreaterThan(0);
    expect(debris.every((c) => foot.has(`${c.x},${c.y}`) && (c.ch === ',' || c.ch === ';'))).toBe(true);
  });

  it('a ship move slides the ship with exhaust behind it; later effects wait for the move', () => {
    const { b, p, o, to } = duel();
    const path = Array.from({ length: 6 }, (_, i) => ({ x: 2 + i, y: 3 }));
    const tl = buildTimeline(
      [
        { kind: 'move', shipId: p.id, path },
        { kind: 'shot', shipId: p.id, moduleId: 'pulse_laser', from: { x: 10, y: 3 }, to, targetId: o.id, hit: true, tier: 1 },
      ],
      b,
      data,
    );
    const a = tl.ships[p.id]!;
    const m = data.art.effects.movement.combat;
    expect(a.moveStart).toBe(0);
    expect(a.moveEnd).toBe(m.igniteMs * 3 + m.msPerCell * 5);
    expect(a.hidden).toContainEqual([0, a.moveEnd]);
    // The shot starts when the move ends.
    const shotStart = Math.min(...tl.frames.filter((f) => f.cells.some((c) => c.ch === '─')).map((f) => f.start));
    expect(shotStart).toBeGreaterThanOrEqual(a.moveEnd!);
    // The ship art moves: in the middle of the move, the overlay has the ship at a cell between the ends.
    const mid = overlayAt(tl, m.igniteMs + m.msPerCell + 1);
    const art = artCells(data, p.ship.hullId, 4, 3, p.mirrored);
    for (const c of art) expect(mid.some((x) => x.x === c.x && x.y === c.y && x.ch === c.ch)).toBe(true);
    // Exhaust behind the ship (to the left for the player's side).
    expect(mid.some((x) => x.x < 4 && ['▒', '░'].includes(x.ch))).toBe(true);
  });

  it('long moves use 2 cells a frame, and the moves of a turn keep to their budget', () => {
    const { b, p, o } = duel();
    const long = Array.from({ length: 20 }, (_, i) => ({ x: 2 + i, y: 3 }));
    const one = buildTimeline([{ kind: 'move', shipId: p.id, path: long }], b, data);
    const m = data.art.effects.movement.combat;
    expect(one.ships[p.id]!.moveEnd).toBe(m.igniteMs * 3 + m.msPerCell * Math.ceil(19 / 2));
    const back = Array.from({ length: 20 }, (_, i) => ({ x: 46 - i, y: 3 }));
    const two = buildTimeline(
      [
        { kind: 'move', shipId: p.id, path: long },
        { kind: 'move', shipId: o.id, path: back },
        { kind: 'move', shipId: p.id, path: long },
      ],
      b,
      data,
    );
    expect(two.duration).toBeLessThanOrEqual(data.balance.combat.moveAnimBudgetMs + 3 * 4 * data.art.effects.queue.minFrameMs);
  });

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
    expect(tl.ships[s.id]?.appearAt).toBe(tl.duration);
  });

  it('the shot effects of one turn take 1.2 s or less (M8-ART-04), also at tier 3', () => {
    const b = battle();
    const [p, o] = [b.ships.find((x) => x.side === 'player')!, b.ships.find((x) => x.side === 'other')!];
    const shots = Array.from({ length: 12 }, () => ({ kind: 'shot' as const, shipId: p.id, targetId: o.id, moduleId: 'beam_laser', from: p.pos, to: o.pos, hit: true, tier: 3 as const }));
    const tl = buildTimeline(shots, b, data);
    expect(tl.duration).toBeLessThanOrEqual(data.art.effects.queue.budgetMs + data.art.effects.queue.minFrameMs);
  });
});
