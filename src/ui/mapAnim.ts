// Map animations (effects v0.2, movement.map): the player glyph moves along
// the real path on the sector map and the region map, with a trail, an engine
// glow on every other frame, rings at the start and at the arrival, and rings
// at a jump. The simulation has already done the trip; the animation only
// shows it. Any key skips it. These frames replace the simple trail of
// M8-ART-06.
import type { GameData } from '../data';
import { bresenham, effectVersion, type OverlayCell, renderOps } from '../render/effects';

type Op = Record<string, unknown>;

export interface Vec {
  x: number;
  y: number;
}

export interface MapFrame {
  ms: number;
  o: Op[];
  /** The sector that the sector map shows in this frame (a jump changes it). */
  sectorId?: number;
}

/** The preview scene puts the jump point at (40, 2) (effects.yaml jump_out, jump_in). */
const SCENE_JUMP = { x: 40, y: 2 };

/** Moves the absolute positions of operations by (dx, dy): `at` objects, cell lists, and text. */
export function shiftOps(ops: Op[], dx: number, dy: number): Op[] {
  return ops.map((op) => {
    const out: Op = { ...op };
    const at = op.at as Vec | undefined;
    if (at && typeof at === 'object' && !Array.isArray(at)) out.at = { x: at.x + dx, y: at.y + dy };
    if (Array.isArray(op.list)) out.list = (op.list as [number, number, string, string][]).map(([x, y, g, fg]) => [x + dx, y + dy, g, fg]);
    if (op.k === 'text') {
      out.x = Number(op.x) + dx;
      out.y = Number(op.y) + dy;
    }
    return out;
  });
}

/** The trail behind the head: the first cell is the engine glow ° on every other frame, then the trail colors. */
function trail(data: GameData, path: Vec[], head: number, frame: number, len: number): Op {
  const m = data.art.effects.movement.map;
  const colors = m.trailColors;
  const list: [number, number, string, string][] = [];
  for (let j = 1; j <= len; j++) {
    const c = path[head - j];
    if (!c) break;
    if (j === 1) list.push([c.x, c.y, frame % 2 === 1 ? '°' : '·', frame % 2 === 1 ? 'engine' : (colors[0] as string)]);
    else list.push([c.x, c.y, '·', colors[Math.min(j - 1, colors.length - 1)] as string]);
  }
  return { k: 'cells', list };
}

/** How many cells the head moves in each frame: movement.map, more when the trip would be longer than `maxMs`. */
function cellsPerFrame(data: GameData, cells: number, maxMs: number): number {
  const m = data.art.effects.movement.map;
  const frames = Math.max(1, Math.floor(maxMs / m.msPerFrame));
  return Math.max(m.cellsPerFrame, Math.ceil(cells / frames));
}

/**
 * Sector travel (sector_travel): a ring at the start, the head 3 cells a frame
 * with a 5-cell trail, the route ahead dotted in frameHi (used up as the head
 * passes), and a ring at the arrival.
 */
export function sectorTravelFrames(data: GameData, from: Vec, to: Vec, maxMs: number, sectorId?: number): MapFrame[] {
  const m = data.art.effects.movement.map;
  const path = bresenham(from, to);
  const end = path.length - 1;
  if (end < 1) return [];
  const glyph = { k: 'at', g: m.glyph, fg: 'player' };
  const route = (i0: number): Op => ({ k: 'line', path: 'sec', set: 'dot', fg: 'frameHi', i0, i1: end, every: 2, phase: 1, soft: 1 });
  const frames: MapFrame[] = [{ ms: 80, o: [route(1), { k: 'ring', at: from, r: 1, g: '·', fg: 'playerDeep', soft: 1 }, { ...glyph, at: from }] }];
  const step = cellsPerFrame(data, end, Math.max(0, maxMs - 240));
  let head = 0;
  let n = 0;
  while (head < end) {
    head = Math.min(end, head + step);
    n++;
    frames.push({ ms: m.msPerFrame, o: [route(head + 1), trail(data, path, head, n, m.trail), { ...glyph, at: path[head] }] });
  }
  frames.push({ ms: 80, o: [trail(data, path, end, 0, 2), { k: 'ring', at: to, r: 1, g: '·', fg: 'playerBright', soft: 1 }, { ...glyph, at: to }] });
  frames.push({ ms: 80, o: [{ k: 'ring', at: to, r: 1, g: '·', fg: 'playerDeep', soft: 1 }, { ...glyph, at: to }] });
  return frames.map((f) => ({ ...f, ...(sectorId !== undefined ? { sectorId } : {}) }));
}

/** The paths that the frames of sectorTravelFrames use. */
export function sectorTravelPaths(from: Vec, to: Vec): Record<string, Vec[]> {
  return { sec: bresenham(from, to) };
}

/** Jump out (or in): the frames of effects.yaml jump_out (jump_in), moved to the jump point. */
export function jumpFrames(data: GameData, id: 'jump_out' | 'jump_in', at: Vec, sectorId?: number): MapFrame[] {
  const v = effectVersion(data, id);
  if (!v) return [];
  return v.frames.map((f) => ({ ms: Number(f.ms ?? 80), o: shiftOps((f.o as Op[] | undefined) ?? [], at.x - SCENE_JUMP.x, at.y - SCENE_JUMP.y), ...(sectorId !== undefined ? { sectorId } : {}) }));
}

/**
 * Region travel (region_travel): the head moves along the lane from sector to
 * sector, with a thin playerDeep trace behind it and the route ahead dotted;
 * each sector on the way pulses once; a ring at the arrival. `stops` are the
 * path indexes of the sectors (the trace does not paint over them).
 */
export function regionTravelFrames(data: GameData, path: Vec[], stops: number[], maxMs: number): MapFrame[] {
  const m = data.art.effects.movement.map;
  const end = path.length - 1;
  if (end < 1) return [];
  const skip = stops.filter((i) => i > 0 && i < end);
  const glyph = { k: 'at', g: m.glyph, fg: 'player' };
  const ahead = (i0: number): Op => ({ k: 'line', path: 'reg', set: 'dot', fg: 'frameHi', i0, i1: end, skip, soft: 1 });
  const trace = (i1: number): Op => ({ k: 'line', path: 'reg', set: 'thin', fg: 'playerDeep', i0: 1, i1, skip });
  const from = path[0] as Vec;
  const to = path[end] as Vec;
  const frames: MapFrame[] = [{ ms: 80, o: [ahead(1), { k: 'ring', at: from, r: 1, g: '·', fg: 'playerDeep', soft: 1 }, { ...glyph, at: from }] }];
  const step = cellsPerFrame(data, end, Math.max(0, maxMs - 240));
  let head = 0;
  let n = 0;
  let pulsed = new Set<number>();
  while (head < end) {
    const last = head;
    head = Math.min(end, head + step);
    n++;
    const o: Op[] = [trace(head), ahead(head + 1), trail(data, path, head, n, 2)];
    // A sector on the way pulses once, when the head passes it.
    const passed = skip.find((i) => i > last && i <= head && !pulsed.has(i));
    if (passed !== undefined) {
      pulsed = new Set([...pulsed, passed]);
      o.push({ k: 'at', at: path[passed], g: null, pat: 'plus', pg: '·', pfg: 'playerBright', soft: 1 });
    }
    o.push({ ...glyph, at: path[head] });
    frames.push({ ms: passed !== undefined ? 100 : m.msPerFrame, o });
  }
  frames.push({ ms: 80, o: [trace(end), { k: 'ring', at: to, r: 1, g: '·', fg: 'playerBright', soft: 1 }, { ...glyph, at: to }] });
  frames.push({ ms: 80, o: [{ k: 'ring', at: to, r: 1, g: '·', fg: 'playerDeep', soft: 1 }, { ...glyph, at: to }] });
  return frames;
}

/** A running map animation: the frames, the paths they use, and what runs at the end. */
export class MapAnim {
  private readonly started = Date.now();
  readonly duration: number;

  constructor(
    readonly frames: MapFrame[],
    readonly paths: Record<string, Vec[]>,
    readonly then: () => void,
  ) {
    this.duration = frames.reduce((s, f) => s + f.ms, 0);
  }

  get elapsed(): number {
    return Date.now() - this.started;
  }

  /** The frame at a time from the start (the last frame after the end). */
  frameAt(ms: number = this.elapsed): MapFrame | undefined {
    let t = 0;
    for (const f of this.frames) {
      t += f.ms;
      if (ms < t) return f;
    }
    return this.frames[this.frames.length - 1];
  }

  get done(): boolean {
    return this.elapsed >= this.duration;
  }

  cells(data: GameData, ms?: number): OverlayCell[] {
    const f = this.frameAt(ms);
    return f ? renderOps(f.o, { data, paths: this.paths }) : [];
  }
}
