import { describe, expect, it } from 'vitest';
import { lineCells, mapDistance, ringAngleToward, ringPoint, segmentsCross } from '../src/world/geometry';

const v = (x: number, y: number) => ({ x, y });

describe('map geometry', () => {
  it('distance uses the cell aspect for the vertical part', () => {
    expect(mapDistance(v(0, 0), v(3, 0), 2)).toBe(3);
    expect(mapDistance(v(0, 0), v(0, 3), 2)).toBe(6);
  });

  it('crossing segments', () => {
    expect(segmentsCross(v(0, 0), v(4, 4), v(0, 4), v(4, 0))).toBe(true);
    expect(segmentsCross(v(0, 0), v(4, 0), v(0, 1), v(4, 1))).toBe(false);
  });

  it('segments with one shared end point do not cross', () => {
    expect(segmentsCross(v(0, 0), v(4, 0), v(0, 0), v(0, 4))).toBe(false);
    expect(segmentsCross(v(0, 0), v(4, 4), v(4, 4), v(8, 0))).toBe(false);
  });

  it('collinear overlap counts as a crossing', () => {
    expect(segmentsCross(v(0, 0), v(4, 0), v(2, 0), v(6, 0))).toBe(true);
    expect(segmentsCross(v(0, 0), v(4, 0), v(0, 0), v(2, 0))).toBe(true);
    expect(segmentsCross(v(0, 0), v(4, 0), v(4, 0), v(8, 0))).toBe(false);
  });

  it('a point that touches the other segment counts as a crossing', () => {
    expect(segmentsCross(v(0, 0), v(4, 0), v(2, 0), v(2, 4))).toBe(true);
  });

  it('ring angle points in the screen direction', () => {
    const c = v(33, 17);
    const right = ringPoint(c, 10, ringAngleToward(5, 0, 2), 2);
    expect(right).toEqual(v(53, 17));
    const down = ringPoint(c, 10, ringAngleToward(0, 5, 2), 2);
    expect(down).toEqual(v(33, 27));
  });

  it('line cells include both ends and are connected', () => {
    const cells = lineCells(v(0, 0), v(5, 2));
    expect(cells[0]).toEqual(v(0, 0));
    expect(cells.at(-1)).toEqual(v(5, 2));
    for (let i = 1; i < cells.length; i++) {
      expect(Math.abs(cells[i]!.x - cells[i - 1]!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(cells[i]!.y - cells[i - 1]!.y)).toBeLessThanOrEqual(1);
    }
  });
});
