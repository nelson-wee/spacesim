// Grid geometry (Sections 13.1, 13.2): footprints from the battle art,
// Chebyshev distance between footprints, lines of fire, and movement.
import type { GameData } from '../data';
import type { Battle, CombatShip, Vec2 } from './types';

/** Footprint cells of a hull's battle art; a space is not part of the ship. Mirrored for the right side. */
export function footprint(data: GameData, hullId: string, mirrored: boolean): Vec2[] {
  const art = data.art.ships.ships[hullId];
  if (!art) throw new Error(`No battle art for hull ${hullId}`);
  const { width, glyphs } = art.battle;
  const cells: Vec2[] = [];
  glyphs.forEach((row, y) => {
    Array.from(row).forEach((ch, x) => {
      if (ch !== ' ') cells.push({ x: mirrored ? width - 1 - x : x, y });
    });
  });
  return cells;
}

export function shipCells(s: CombatShip, at: Vec2 = s.pos): Vec2[] {
  return s.mask.map((c) => ({ x: at.x + c.x, y: at.y + c.y }));
}

/** Width and height of the footprint box. */
export function maskSize(mask: Vec2[]): { w: number; h: number } {
  return { w: Math.max(...mask.map((c) => c.x)) + 1, h: Math.max(...mask.map((c) => c.y)) + 1 };
}

export function cellAt(b: Battle, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= b.width || y >= b.height) return '#';
  return b.cells[y]?.[x] ?? '#';
}

export function isActive(s: CombatShip): boolean {
  return s.status === 'active';
}

/** Chebyshev distance between the nearest cells, and that pair of cells. */
export function nearestPair(a: CombatShip, b: CombatShip, aAt: Vec2 = a.pos): { distance: number; from: Vec2; to: Vec2 } {
  let best = { distance: Infinity, from: aAt, to: b.pos };
  for (const p of shipCells(a, aAt)) {
    for (const q of shipCells(b)) {
      const d = Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
      if (d < best.distance) best = { distance: d, from: p, to: q };
    }
  }
  return best;
}

export function distance(a: CombatShip, b: CombatShip, aAt?: Vec2): number {
  return nearestPair(a, b, aAt).distance;
}

/** Cells on the line from a to b (Bresenham), without the two end cells. */
export function lineCells(a: Vec2, b: Vec2): Vec2[] {
  const cells: Vec2[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
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
    if (x === b.x && y === b.y) break;
    cells.push({ x, y });
  }
  return cells;
}

export interface LineOfFire {
  clear: boolean;
  /** The line goes through a debris cloud cell. */
  debris: boolean;
  from: Vec2;
  to: Vec2;
  distance: number;
}

/** Line of fire from the nearest attacker cell to the nearest target cell. Asteroids block it (Section 13.1). */
export function lineOfFire(b: Battle, a: CombatShip, t: CombatShip, aAt?: Vec2): LineOfFire {
  const pair = nearestPair(a, t, aAt);
  let debris = false;
  for (const c of lineCells(pair.from, pair.to)) {
    const cell = cellAt(b, c.x, c.y);
    if (cell === '#') return { clear: false, debris, ...pair };
    if (cell === ':') debris = true;
  }
  return { clear: true, debris, ...pair };
}

/** True if the footprint at `at` is in the grid, on no asteroid, and on no other active ship. */
export function fits(b: Battle, s: CombatShip, at: Vec2, blocked: Set<string>): boolean {
  for (const c of shipCells(s, at)) {
    if (c.x < 0 || c.y < 0 || c.x >= b.width || c.y >= b.height) return false;
    if (cellAt(b, c.x, c.y) === '#') return false;
    if (blocked.has(`${c.x},${c.y}`)) return false;
  }
  return true;
}

/** Cells of all other active ships. */
export function blockedCells(b: Battle, s: CombatShip): Set<string> {
  const set = new Set<string>();
  for (const o of b.ships) {
    if (o.id === s.id || !isActive(o)) continue;
    for (const c of shipCells(o)) set.add(`${c.x},${c.y}`);
  }
  return set;
}

export interface Reach {
  /** Anchor key "x,y" -> steps from the start. */
  steps: Map<string, number>;
  parent: Map<string, string>;
}

const DIRS: Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

/**
 * Anchor positions that the ship can reach in `maxSteps` steps (8 directions,
 * the full footprint checked at each step). Breadth-first search gives the
 * shortest path on this grid, so it is the same as A* within the move budget.
 */
export function reachable(b: Battle, s: CombatShip, maxSteps: number): Reach {
  const blocked = blockedCells(b, s);
  const start = `${s.pos.x},${s.pos.y}`;
  const steps = new Map<string, number>([[start, 0]]);
  const parent = new Map<string, string>();
  let frontier: Vec2[] = [s.pos];
  for (let d = 1; d <= maxSteps && frontier.length > 0; d++) {
    const next: Vec2[] = [];
    for (const p of frontier) {
      for (const dir of DIRS) {
        const q = { x: p.x + dir.x, y: p.y + dir.y };
        const key = `${q.x},${q.y}`;
        if (steps.has(key) || !fits(b, s, q, blocked)) continue;
        steps.set(key, d);
        parent.set(key, `${p.x},${p.y}`);
        next.push(q);
      }
    }
    frontier = next;
  }
  return { steps, parent };
}

export function parseKey(key: string): Vec2 {
  const [x, y] = key.split(',').map(Number);
  return { x: x ?? 0, y: y ?? 0 };
}

/** The path from the start to `to` (both included), or null. */
export function pathTo(reach: Reach, to: Vec2): Vec2[] | null {
  let key = `${to.x},${to.y}`;
  if (!reach.steps.has(key)) return null;
  const path: Vec2[] = [parseKey(key)];
  while (reach.parent.has(key)) {
    key = reach.parent.get(key) as string;
    path.unshift(parseKey(key));
  }
  return path;
}

/** True if a footprint cell at `at` is on the map edge (a flee, Section 13.7). */
export function onEdge(b: Battle, s: CombatShip, at: Vec2 = s.pos): boolean {
  return shipCells(s, at).some((c) => c.x === 0 || c.y === 0 || c.x === b.width - 1 || c.y === b.height - 1);
}

/** Steps from an anchor to the nearest edge (for Trader and retreat moves). */
export function edgeDistance(b: Battle, s: CombatShip, at: Vec2): number {
  let best = Infinity;
  for (const c of shipCells(s, at)) best = Math.min(best, c.x, c.y, b.width - 1 - c.x, b.height - 1 - c.y);
  return best;
}
