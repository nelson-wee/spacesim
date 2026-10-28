// Battle map (Section 13.1): obstacle clusters from rot.js Map.Cellular, with
// the random fill from the combat RNG stream. Each cluster is an asteroid
// field ('#') or a debris cloud (':'). The map edges (a ship flees there) and
// bands around the two start columns stay open. M4 uses one random layout
// (templates come in M5).
import { Map as RotMap } from 'rot-js';
import type { Rng } from '../core/rng';
import type { GameData } from '../data';

export function generateCells(data: GameData, rng: Rng): string[] {
  const c = data.balance.combat;
  const m = c.map;
  const w = c.gridWidth;
  const h = c.gridHeight;
  const cellular = new RotMap.Cellular(w, h, { born: [5, 6, 7, 8], survive: [4, 5, 6, 7, 8], topology: 8 });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cellular.set(x, y, rng.chance(m.fill) ? 1 : 0);
  const solid: boolean[][] = Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
  for (let i = 0; i < m.iterations; i++) cellular.create();
  cellular.create((x, y, value) => {
    const row = solid[y];
    if (row) row[x] = value === 1;
  });
  // Open start areas and the map edges (a ship flees at an edge cell).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = Math.abs(x - m.startColumn) <= m.startAreaHalfWidth || Math.abs(w - 1 - x - m.startColumn) <= m.startAreaHalfWidth;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (start || edge) (solid[y] as boolean[])[x] = false;
    }
  }
  // Each connected cluster is asteroids or debris.
  const cells = Array.from({ length: h }, () => new Array<string>(w).fill('.'));
  const seen = Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid[y]?.[x] || seen[y]?.[x]) continue;
      const glyph = rng.chance(m.debrisShare) ? ':' : '#';
      const stack: [number, number][] = [[x, y]];
      (seen[y] as boolean[])[x] = true;
      while (stack.length > 0) {
        const [cx, cy] = stack.pop() as [number, number];
        (cells[cy] as string[])[cx] = glyph;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny]?.[nx] || !solid[ny]?.[nx]) continue;
          (seen[ny] as boolean[])[nx] = true;
          stack.push([nx, ny]);
        }
      }
    }
  }
  return cells.map((row) => row.join(''));
}
