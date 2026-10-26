// Map geometry. Map cells are taller than they are wide, so all distances
// multiply the vertical difference by the cell aspect (balance.world.cellAspect).
import type { Vec } from '../core/types';

/** Distance between two cells, in horizontal cell units. */
export function mapDistance(a: Vec, b: Vec, aspect: number): number {
  const dx = b.x - a.x;
  const dy = (b.y - a.y) * aspect;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Point on an orbit ring. The ring has vertical radius `radius` and horizontal radius `radius × aspect`. */
export function ringPoint(center: Vec, radius: number, angle: number, aspect: number): Vec {
  return {
    x: Math.round(center.x + radius * aspect * Math.cos(angle)),
    y: Math.round(center.y + radius * Math.sin(angle)),
  };
}

/** Angle on a ring that points in the screen direction (dx, dy). */
export function ringAngleToward(dx: number, dy: number, aspect: number): number {
  return Math.atan2(dy * aspect, dx);
}

function orient(a: Vec, b: Vec, c: Vec): number {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return v === 0 ? 0 : v > 0 ? 1 : -1;
}

function onSegment(a: Vec, b: Vec, p: Vec): boolean {
  return (
    Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)
  );
}

function samePoint(a: Vec, b: Vec): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * True if segment p1-p2 crosses segment q1-q2. Segments that only share an
 * end point do not cross. Overlapping collinear segments cross.
 */
export function segmentsCross(p1: Vec, p2: Vec, q1: Vec, q2: Vec): boolean {
  const o1 = orient(p1, p2, q1);
  const o2 = orient(p1, p2, q2);
  const o3 = orient(q1, q2, p1);
  const o4 = orient(q1, q2, p2);
  const sharedP = samePoint(p1, q1) || samePoint(p1, q2) ? p1 : samePoint(p2, q1) || samePoint(p2, q2) ? p2 : null;
  if (sharedP) {
    const pOther = sharedP === p1 ? p2 : p1;
    const qOther = samePoint(q1, sharedP) ? q2 : q1;
    if (samePoint(pOther, qOther)) return true; // the same segment
    // One shared end point: they cross only if they overlap on one line.
    if (o1 !== 0 || o2 !== 0) return false;
    const dot = (pOther.x - sharedP.x) * (qOther.x - sharedP.x) + (pOther.y - sharedP.y) * (qOther.y - sharedP.y);
    return dot > 0;
  }
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, p2, q2)) return true;
  if (o3 === 0 && onSegment(q1, q2, p1)) return true;
  if (o4 === 0 && onSegment(q1, q2, p2)) return true;
  return false;
}

/** Cells on a straight line from a to b (Bresenham), both ends included. */
export function lineCells(a: Vec, b: Vec): Vec[] {
  const cells: Vec[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}
