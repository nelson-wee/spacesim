// Combat effects (Section 18.4, G-20). Frames, glyphs, colors, and times come
// from data/art/effects.json (Claude Design). The resolver gives a list of
// effects; this file makes a timeline of overlay cells that the combat screen
// draws on top of the battle. Queue rules: stagger 150 ms (120 ms for 5 or
// more effects), a budget of 1.2 s per turn (times scale down if over), and a
// minimum frame of 15 ms. A damage effect starts when the shot before it ends.
import { footprint, lineCells, shipCells } from '../combat/geometry';
import type { Battle, CombatShip, Effect, Vec2 } from '../combat/types';
import { defeatKind } from '../career/defeat';
import type { GameData } from '../data';
import { styleColor } from './palette';

export interface OverlayCell {
  x: number;
  y: number;
  ch: string;
  fg: string;
}

interface TimedFrame {
  start: number;
  end: number;
  cells: OverlayCell[];
}

export interface Timeline {
  duration: number;
  frames: TimedFrame[];
}

type Frame = Record<string, unknown>;

function color(data: GameData, name: unknown): string {
  const n = String(name ?? 'hi');
  return data.art.effects.colors[n] ?? styleColor(data.art.style, n);
}

/** Line glyph for a step direction from a line set: horizontal, vertical, '/', '\'. */
function lineGlyph(set: string[], dx: number, dy: number): string {
  if (dy === 0) return set[0] ?? '-';
  if (dx === 0) return set[1] ?? '|';
  return (dx > 0) === (dy < 0) ? (set[2] ?? '/') : (set[3] ?? '\\');
}

/** The cells of a shot path: to the target, or past it to the grid edge (a miss). */
function shotPath(b: Battle, from: Vec2, to: Vec2, miss: boolean): Vec2[] {
  const cells = [...lineCells(from, to), to];
  if (!miss) return cells;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const far = { x: Math.round(from.x + (dx / n) * (b.width + b.height)), y: Math.round(from.y + (dy / n) * (b.width + b.height)) };
  return [...lineCells(from, far), far].filter((c) => c.x >= 0 && c.y >= 0 && c.x < b.width && c.y < b.height);
}

/** A stable subset of cells for "frac" (render only; no game randomness). */
function frac<T>(items: T[], f: unknown): T[] {
  const share = typeof f === 'number' ? f : 1;
  if (share >= 1) return items;
  return items.filter((_, i) => ((i * 37 + 11) % 100) / 100 < share);
}

/** Perimeter cells of a ship (the 8 cells around its footprint); "facing" = the side toward `from`. */
function perimeter(s: CombatShip, from: Vec2 | null, part: unknown): Vec2[] {
  const foot = new Set(shipCells(s).map((c) => `${c.x},${c.y}`));
  const out = new Map<string, Vec2>();
  for (const c of shipCells(s)) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${c.x + dx},${c.y + dy}`;
        if (!foot.has(k)) out.set(k, { x: c.x + dx, y: c.y + dy });
      }
    }
  }
  let cells = [...out.values()];
  if (part === 'facing' && from) {
    const cx = cells.reduce((a, c) => a + c.x, 0) / Math.max(1, cells.length);
    cells = cells.filter((c) => (from.x < cx ? c.x <= cx : c.x >= cx));
  }
  return cells;
}

interface Ctx {
  data: GameData;
  b: Battle;
  path: Vec2[];
  target: CombatShip | null;
  from: Vec2 | null;
  at: Vec2 | null;
}

/** Overlay cells of one frame (for a travel frame: one step of the head). */
function frameCells(f: Frame, ctx: Ctx, head: number): OverlayCell[] {
  const { data } = ctx;
  const out: OverlayCell[] = [];
  const line = f.line as Frame | undefined;
  if (line) {
    const set = data.art.effects.lineSets[String(line.set ?? 'thin')] ?? ['-', '|', '/', '\\'];
    let prev = ctx.from ?? ctx.path[0] ?? { x: 0, y: 0 };
    for (const c of ctx.path) {
      out.push({ x: c.x, y: c.y, ch: lineGlyph(set, c.x - prev.x, c.y - prev.y), fg: color(data, line.fg) });
      prev = c;
    }
  }
  const at = f.at as Frame | undefined;
  if (at) {
    const where = at.at === 'origin' ? ctx.from : at.at === 'end' ? (ctx.path[ctx.path.length - 1] ?? null) : ctx.at;
    if (where) {
      if (typeof at.g === 'string' && !at.g.startsWith('@')) out.push({ x: where.x, y: where.y, ch: at.g, fg: color(data, at.fg) });
      const pat = at.pat ? data.art.effects.patterns[String(at.pat)] : undefined;
      for (const p of frac(pat ?? [], at.pfrac)) {
        const ch = typeof p[2] === 'string' ? p[2] : String(at.pg ?? '*');
        out.push({ x: where.x + Number(p[0]), y: where.y + Number(p[1]), ch, fg: color(data, at.pfg ?? at.fg) });
      }
    }
  }
  const travel = f.travel as Frame | undefined;
  if (travel) {
    const count = Number(travel.count ?? 1);
    const gap = Number(travel.gap ?? 1);
    // A glyph of more than one character (a torpedo "■►") shows its head; it turns with the path.
    const glyphs = Array.from(String(travel.g ?? '*'));
    const dir = ctx.path.length > 0 ? Math.sign((ctx.path[ctx.path.length - 1]?.x ?? 0) - (ctx.from?.x ?? ctx.path[0]?.x ?? 0)) : 1;
    const headGlyph = (glyphs[glyphs.length - 1] ?? '*').replace('►', dir < 0 ? '◄' : '►');
    for (let k = 0; k < count; k++) {
      const c = ctx.path[head - k * (gap + 1)];
      if (c) out.push({ x: c.x, y: c.y, ch: headGlyph, fg: color(data, travel.fg) });
    }
    const trail = (travel.trail as [string, string][] | undefined) ?? [];
    trail.forEach(([g, fg], i) => {
      const c = ctx.path[head - (count - 1) * (gap + 1) - 1 - i];
      if (c) out.push({ x: c.x, y: c.y, ch: g, fg: color(data, fg) });
    });
  }
  const perim = f.perim as Frame | undefined;
  if (perim && ctx.target) {
    for (const c of frac(perimeter(ctx.target, ctx.from, perim.part), perim.frac)) out.push({ x: c.x, y: c.y, ch: String(perim.g ?? '·'), fg: color(data, perim.fg) });
  }
  const foot = f.foot as Frame | undefined;
  if (foot && ctx.target) {
    const t = ctx.target;
    const art = data.art.ships.ships[t.ship.hullId]?.battle;
    let cells = shipCells(t);
    if (foot.role && art) {
      // Only the cells with this role code (for example 'e' engines).
      const mask = footprint(data, t.ship.hullId, t.mirrored);
      const roles = art.roles.flatMap((row, y) => Array.from(row).map((r, x) => ({ r, x: t.mirrored ? art.width - 1 - x : x, y })));
      cells = mask
        .filter((m) => roles.find((r) => r.x === m.x && r.y === m.y)?.r === foot.role)
        .map((m) => ({ x: t.pos.x + m.x, y: t.pos.y + m.y }));
    }
    const g = String(foot.g ?? '*');
    if (!g.startsWith('@')) for (const c of frac(cells, foot.frac)) out.push({ x: c.x, y: c.y, ch: g, fg: color(data, foot.fg) });
  }
  return out;
}

/** Duration of a frame; a travel frame repeats until its head reaches the end of the path. */
function frameSteps(f: Frame, pathLen: number): { ms: number; steps: number } {
  const travel = f.travel as Frame | undefined;
  if (travel) {
    const adv = Math.max(1, Number(travel.adv ?? 1));
    return { ms: Number(travel.ms ?? 30), steps: Math.max(1, Math.ceil(pathLen / adv)) };
  }
  return { ms: Number(f.ms ?? 0), steps: 1 };
}

const DAMAGE_KINDS = new Set(['shield', 'hull', 'armor', 'engine', 'destroy']);

function effectId(e: Effect, b: Battle, data: GameData): string | null {
  const has = (id: string) => data.art.effects.effects[id] !== undefined;
  switch (e.kind) {
    case 'shot': {
      const own = `${e.moduleId}_${e.hit ? 'hit' : 'miss'}`;
      if (has(own)) return own;
      const family = data.moduleById.get(e.moduleId)?.category === 'laser' ? 'pulse_laser' : 'autocannon';
      return `${family}_${e.hit ? 'hit' : 'miss'}`;
    }
    case 'flak':
      return 'flak_cannon';
    case 'shield':
      return e.broken ? 'shield_break' : e.amount >= 10 ? 'shield_hit_large' : 'shield_hit_small';
    case 'hull':
      return 'hull_hit';
    case 'armor':
      return 'armor_deflect';
    case 'engine':
      return 'engine_hit';
    case 'destroy': {
      // Pirates disable the player's ship: its engines go dark, it does not explode.
      if (e.shipId === b.playerId && defeatKind(b) === 'disabled') return 'engine_hit';
      const s = b.ships.find((x) => x.id === e.shipId);
      const size = s ? data.hullById.get(s.ship.hullId)?.sizeClass : 'small';
      return size === 'capital' ? 'destroy_capital' : size === 'small' ? 'destroy_small' : 'destroy_medium';
    }
    case 'surrender':
      return 'surrender';
    case 'munitionMove':
      return e.moduleId === 'torpedo_tube' ? 'torpedo_move' : 'missile_move';
    case 'munitionHit':
      return e.hit ? (e.moduleId === 'torpedo_tube' ? 'torpedo_hit' : 'missile_hit') : null;
    case 'pd':
      return 'point_defense';
    default:
      return null;
  }
}

/** Builds the timeline of one turn's effects. `b` is the battle after the turn. */
export function buildTimeline(effects: Effect[], b: Battle, data: GameData): Timeline {
  const q = data.art.effects.queue;
  const shown = effects.filter((e) => effectId(e, b, data) !== null);
  const stagger = shown.length >= 5 ? q.staggerMs5Plus : q.staggerMs;
  const frames: TimedFrame[] = [];
  let slot = 0;
  let lastShotEnd = 0;
  let lastShot: Effect | null = null;
  for (const e of shown) {
    const def = data.art.effects.effects[effectId(e, b, data) as string];
    if (!def) continue;
    let start: number;
    if (DAMAGE_KINDS.has(e.kind) && lastShot) start = lastShotEnd;
    else {
      start = slot * stagger;
      slot++;
    }
    const shipId = 'shipId' in e ? e.shipId : -1;
    const targetOf = e.kind === 'shot' || e.kind === 'munitionHit' ? e.targetId : shipId;
    const target = b.ships.find((s) => s.id === targetOf);
    const ctx: Ctx = { data, b, path: [], target: target ?? null, from: null, at: null };
    if (e.kind === 'shot') {
      ctx.from = e.from;
      ctx.at = e.to;
      ctx.path = shotPath(b, e.from, e.to, !e.hit);
    } else if (e.kind === 'flak') {
      ctx.from = e.from;
      ctx.at = e.center;
      ctx.path = shotPath(b, e.from, e.center, false);
    } else if (e.kind === 'hull' || e.kind === 'armor' || e.kind === 'engine') {
      ctx.at = e.at;
      ctx.from = lastShot && lastShot.kind === 'shot' ? lastShot.from : null;
    } else if (e.kind === 'munitionMove') {
      ctx.path = e.path.slice(1);
      ctx.from = e.path[0] ?? null;
    } else if (e.kind === 'munitionHit') {
      ctx.at = e.at;
    } else if (e.kind === 'pd') {
      ctx.from = e.from;
      ctx.at = e.to;
      ctx.path = [...lineCells(e.from, e.to), e.to];
    } else if (e.kind === 'shield') {
      ctx.from = lastShot && lastShot.kind === 'shot' ? lastShot.from : null;
    }
    let t = start;
    for (const f of def.frames) {
      const { ms, steps } = frameSteps(f, ctx.path.length);
      for (let k = 0; k < steps; k++) {
        const head = Math.min(ctx.path.length - 1, (k + 1) * Math.max(1, Number((f.travel as Frame | undefined)?.adv ?? 1)) - 1);
        frames.push({ start: t, end: t + ms, cells: frameCells(f, ctx, head) });
        t += ms;
      }
    }
    if (e.kind === 'shot' || e.kind === 'flak' || e.kind === 'munitionHit') {
      lastShot = e;
      lastShotEnd = t;
    }
  }
  let duration = frames.reduce((m, f) => Math.max(m, f.end), 0);
  if (q.scaleIfOver && duration > q.budgetMs) {
    const k = q.budgetMs / duration;
    for (const f of frames) {
      f.start *= k;
      f.end = Math.max(f.start + q.minFrameMs, f.end * k);
    }
    duration = frames.reduce((m, f) => Math.max(m, f.end), 0);
  }
  return { duration, frames };
}

/** Overlay cells at time `ms` (later frames on top). */
export function overlayAt(tl: Timeline, ms: number): OverlayCell[] {
  return tl.frames.filter((f) => ms >= f.start && ms < f.end).flatMap((f) => f.cells);
}
