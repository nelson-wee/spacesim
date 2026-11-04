// Map animations (effects v0.2 movement.map): sector travel, jumps, region travel.
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data';
import { bresenham, effectColor, renderOps } from '../src/render/effects';
import { jumpFrames, MapAnim, regionTravelFrames, sectorTravelFrames, sectorTravelPaths } from '../src/ui/mapAnim';

const data = gameData();
const m = data.art.effects.movement.map;

describe('map animations', () => {
  it('sector travel: @ moves 3 cells a frame with a 5-cell trail, from a start ring to an arrival ring', () => {
    const from = { x: 4, y: 5 };
    const to = { x: 34, y: 2 };
    const frames = sectorTravelFrames(data, from, to, 5000);
    const paths = sectorTravelPaths(from, to);
    const path = paths.sec!;
    const heads = frames.map((f) => renderOps(f.o, { data, paths }).filter((c) => c.ch === m.glyph).pop()!);
    expect(heads[0]).toMatchObject(from);
    expect(heads[heads.length - 1]).toMatchObject(to);
    // In the middle: 3 cells a frame, 60 ms a frame.
    expect(heads[2]).toMatchObject(path[2 * m.cellsPerFrame]!);
    expect(frames[2]!.ms).toBe(m.msPerFrame);
    const mid = renderOps(frames[4]!.o, { data, paths });
    const trail = mid.filter((c) => c.ch === '°' || (c.ch === '·' && [effectColor(data, 'playerBright'), effectColor(data, 'player'), effectColor(data, 'playerDeep')].includes(c.fg)));
    expect(trail.length).toBe(m.trail);
    // The engine glow is on every other frame.
    const glow = frames.slice(1, 6).map((f) => renderOps(f.o, { data, paths }).some((c) => c.ch === '°'));
    expect(glow).toEqual([true, false, true, false, true]);
    // The arrival ring is soft (it does not paint the location glyph).
    expect(renderOps(frames[frames.length - 2]!.o, { data, paths }).filter((c) => c.soft).length).toBeGreaterThan(4);
  });

  it('a long trip moves more cells a frame, to keep to the time limit', () => {
    const frames = sectorTravelFrames(data, { x: 0, y: 0 }, { x: 60, y: 30 }, 600);
    expect(frames.reduce((s, f) => s + f.ms, 0)).toBeLessThanOrEqual(600 + m.msPerFrame);
  });

  it('jump out and jump in play at the real jump point, in their sectors', () => {
    const at = { x: 12, y: 20 };
    const out = jumpFrames(data, 'jump_out', at, 3);
    const inn = jumpFrames(data, 'jump_in', at, 4);
    expect(out.length).toBeGreaterThan(2);
    expect(out.every((f) => f.sectorId === 3) && inn.every((f) => f.sectorId === 4)).toBe(true);
    const peak = renderOps(out[1]!.o, { data, paths: {} });
    expect(peak.some((c) => c.x === at.x && c.y === at.y && c.ch === '*')).toBe(true);
    expect(peak.some((c) => c.fg === effectColor(data, 'jump'))).toBe(true);
    const last = renderOps(inn[inn.length - 1]!.o, { data, paths: {} });
    expect(last).toContainEqual(expect.objectContaining({ x: at.x, y: at.y, ch: '@' }));
  });

  it('region travel draws a thin trace behind @ and pulses each sector on the way once', () => {
    const a = { x: 3, y: 10 };
    const b = { x: 12, y: 4 };
    const c = { x: 35, y: 3 };
    const ab = bresenham(a, b);
    const path = [...ab.slice(0, -1), ...bresenham(b, c)];
    const stops = [0, ab.length - 1, path.length - 1];
    const frames = regionTravelFrames(data, path, stops, 5000);
    const paths = { reg: path };
    const cells = frames.map((f) => renderOps(f.o, { data, paths }));
    const pulses = cells.filter((cs) => cs.filter((x) => x.soft && x.fg === effectColor(data, 'playerBright')).length === 4);
    expect(pulses.length).toBe(1);
    const late = cells[cells.length - 3]!;
    expect(late.some((x) => ['─', '/', '\\', '│'].includes(x.ch) && x.fg === effectColor(data, 'playerDeep'))).toBe(true);
    // The trace does not paint over the sector on the way.
    expect(late.some((x) => x.x === b.x && x.y === b.y && x.ch !== '@')).toBe(false);
  });

  it('MapAnim gives the frame at a time and the end', () => {
    const anim = new MapAnim([{ ms: 50, o: [] }, { ms: 50, o: [{ k: 'at', at: { x: 1, y: 1 }, g: '@', fg: 'player' }] }], {}, () => undefined);
    expect(anim.duration).toBe(100);
    expect(anim.cells(data, 10)).toEqual([]);
    expect(anim.cells(data, 60)).toHaveLength(1);
  });
});
