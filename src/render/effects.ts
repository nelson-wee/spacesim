// Combat effects v0.2 (Section 18.4, G-20). Frames, glyphs, colors, and times
// come from data/art/effects.json (Claude Design, "Combat effects v0.2").
// A frame is a list of operations (`o`); this file interprets them against the
// real battle: shot paths, the target footprint, and its perimeter. The
// resolver gives a list of effects; buildTimeline makes a timeline of overlay
// cells that the combat screen draws on top of the battle.
//
// Queue rules: stagger 150 ms (120 ms for 5 or more effects), a budget of
// 1.2 s per turn for shots and damage (times scale down if over), and a
// minimum frame of 15 ms. A damage effect starts when the shot before it ends.
// Ship moves (movement.combat) play in turn order: a move starts when the
// effects before it end, and the effects after it wait for it. The moves of a
// turn have their own budget (balance.combat.moveAnimBudgetMs).
import { lineCells } from '../combat/geometry';
import type { Battle, CombatShip, Effect, Vec2 } from '../combat/types';
import { defeatKind } from '../career/defeat';
import type { GameData } from '../data';
import { roleColor, styleColor } from './palette';
import { artRows, type DamageState, mirrorRow } from './shipArt';

export interface OverlayCell {
  x: number;
  y: number;
  ch: string;
  fg: string;
  /** Paint only an empty cell (space, star, lane dot); not a ship or an earlier effect cell. */
  soft?: boolean;
}

interface TimedFrame {
  start: number;
  end: number;
  cells: OverlayCell[];
}

/** How the combat screen draws one ship while the timeline plays. */
export interface ShipAnim {
  /** The move path of this turn (anchor cells, the start cell first). */
  path?: Vec2[];
  moveStart?: number;
  moveEnd?: number;
  /** Until this time the ship shows as it was before the turn (status and damage): its destroy, flee, or surrender starts then. */
  settleAt?: number;
  /** The overlay draws the ship (or nothing) in these time spans. */
  hidden: [number, number][];
  /** A reinforcement: not drawn before this time. */
  appearAt?: number;
}

export interface Timeline {
  duration: number;
  frames: TimedFrame[];
  ships: Record<number, ShipAnim>;
  /** Munitions that move this turn: the travel effect draws them until the timeline ends. */
  movingMunitions: number[];
}

type Op = Record<string, unknown>;
type Frame = Record<string, unknown>;

/** Art side colors by faction: player, pirate, trader (escorts too), patrol. Allies of the player keep their faction color. */
export function sideOf(s: CombatShip): string {
  if (s.ai === 'human') return 'player';
  return s.faction === 'player' ? 'player' : s.faction;
}

/** An effect color: a style color, or a ramp color of effects.json (laserCore, jumpDim). */
export function effectColor(data: GameData, name: unknown): string {
  const n = String(name ?? 'hi');
  return data.art.effects.colors[n] ?? styleColor(data.art.style, n);
}

/** The cell hash of the reference file: a stable "random" number for frac and seed (render only; no game randomness). */
export function cellHash(x: number, y: number, s: number): number {
  let h = Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul(s + 7, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function keep(x: number, y: number, frac: unknown, seed: number): boolean {
  return typeof frac !== 'number' || cellHash(x, y, seed) % 100 < frac * 100;
}

const ELLIPSES = new Map<string, Vec2[]>();
/** Cells of a ring or a disc on the 2:1 grid: d = sqrt((dx/2)^2 + dy^2); ring r-0.5 <= d < r+0.5; disc d < r+0.5. */
export function ellipse(r: number, mode: 'ring' | 'disc'): Vec2[] {
  const key = `${mode}${r}`;
  const cached = ELLIPSES.get(key);
  if (cached) return cached;
  const out: Vec2[] = [];
  const R = Math.ceil(r + 0.5);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -2 * R; dx <= 2 * R; dx++) {
      const d = Math.sqrt((dx / 2) ** 2 + dy * dy);
      if (mode === 'disc' ? d < r + 0.5 : d >= r - 0.5 && d < r + 0.5) out.push({ x: dx, y: dy });
    }
  }
  ELLIPSES.set(key, out);
  return out;
}

/** Bresenham line with both end cells. */
export function bresenham(a: Vec2, b: Vec2): Vec2[] {
  if (a.x === b.x && a.y === b.y) return [{ ...a }];
  return [{ ...a }, ...lineCells(a, b), { ...b }];
}

/** One step of damage on a glyph (hull_hit "@damage"). */
const DAMAGE_STEP: Record<string, string> = { '█': '▓', '▓': '▒', '▒': '░', '░': ',', '▀': '▒', '▄': '▒', '▌': '░', '▐': '░', '═': '=', '─': '-', '■': '▒', '◘': '*', '°': '·', '≡': '=', '►': '-', '◄': '-' };
/** The three phases of a capital ship's internal blast: center glyph and color, then the plus glyph and color. */
const BLAST: [string, string, string, string][] = [
  ['█', 'white', '*', 'fire'],
  ['▓', 'hot', '+', 'hot'],
  ['░', 'smoke', '·', 'smoke'],
];
const RING8 = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].filter((dx) => dx !== 0 || dy !== 0).map((dx) => ({ x: dx, y: dy })));
const PLUS = [
  { x: 0, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];

/** A ship's art cells: position, glyph, and role (mirrored for ships on the right). */
export interface ArtCell {
  x: number;
  y: number;
  ch: string;
  role: string;
}

export function artCells(data: GameData, hullId: string, x0: number, y0: number, mirrored: boolean, state: DamageState = 'normal'): ArtCell[] {
  const view = data.art.ships.ships[hullId]?.battle;
  if (!view) return [];
  const swaps = data.art.ships.mirrorSwaps;
  const out: ArtCell[] = [];
  artRows(view, state).forEach((row, j) => {
    const glyphs = Array.from(mirrored ? mirrorRow(row, swaps) : row);
    const roles = Array.from(view.roles[j] ?? '');
    if (mirrored) roles.reverse();
    glyphs.forEach((ch, i) => {
      if (ch !== ' ') out.push({ x: x0 + i, y: y0 + j, ch, role: roles[i] ?? 'a' });
    });
  });
  return out;
}

/** The target ship of an effect: footprint with glyphs and roles, perimeter, and the side facing the shooter. */
interface TargetInfo {
  x: number;
  y: number;
  w: number;
  h: number;
  side: string;
  mirrored: boolean;
  foot: ArtCell[];
  perim: Vec2[];
  facing: Vec2[];
}

function targetInfo(data: GameData, s: CombatShip, from: Vec2 | null, width: number, height: number): TargetInfo {
  const foot = artCells(data, s.ship.hullId, s.pos.x, s.pos.y, s.mirrored);
  const fk = new Set(foot.map((c) => `${c.x},${c.y}`));
  const seen = new Set<string>();
  const perim: Vec2[] = [];
  for (const c of foot) {
    for (const d of RING8) {
      const x = c.x + d.x;
      const y = c.y + d.y;
      const k = `${x},${y}`;
      if (fk.has(k) || seen.has(k) || x < 0 || y < 0 || x >= width || y >= height) continue;
      seen.add(k);
      perim.push({ x, y });
    }
  }
  const xs = foot.map((c) => c.x);
  const ys = foot.map((c) => c.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let facing = perim;
  if (from) {
    if (from.x < minX) facing = perim.filter((p) => p.x < minX);
    else if (from.x > maxX) facing = perim.filter((p) => p.x > maxX);
    else if (from.y < minY) facing = perim.filter((p) => p.y < minY);
    else if (from.y > maxY) facing = perim.filter((p) => p.y > maxY);
  }
  return { x: s.pos.x, y: s.pos.y, w: maxX - minX + 1, h: maxY - minY + 1, side: sideOf(s), mirrored: s.mirrored, foot, perim, facing };
}

/** Everything an operation can refer to. Map screens use only paths and absolute positions. */
export interface OpCtx {
  data: GameData;
  paths: Record<string, Vec2[]>;
  origin?: Vec2 | null;
  /** The impact cell ("target"). */
  impact?: Vec2 | null;
  munition?: Vec2 | null;
  target?: TargetInfo | null;
  /** The size of the target art in the preview scene (blast positions scale from it). */
  sceneTarget?: { w: number; h: number };
}

/** Preview target sizes of the scenes (Combat Effects v2): blast and offset positions scale from these. */
const SCENE_TARGET: Record<string, { w: number; h: number }> = { duel: { w: 4, h: 2 }, wasp: { w: 2, h: 1 }, capital: { w: 15, h: 5 }, pd: { w: 4, h: 2 } };

function anchor(ctx: OpCtx, a: unknown): Vec2 | null {
  if (Array.isArray(a)) {
    // An offset from the impact cell (armor_deflect [-2, -1]).
    const base = ctx.impact ?? (ctx.target ? { x: ctx.target.x, y: ctx.target.y } : null);
    return base ? { x: base.x + Number(a[0]), y: base.y + Number(a[1]) } : null;
  }
  if (a && typeof a === 'object') return { x: Number((a as Vec2).x), y: Number((a as Vec2).y) };
  if (a === 'origin') return ctx.origin ?? null;
  if (a === 'munition') return ctx.munition ?? ctx.impact ?? null;
  if (a === 'end') {
    const p = ctx.paths.miss ?? ctx.paths.hit ?? [];
    return p[p.length - 1] ?? null;
  }
  return ctx.impact ?? null;
}

function lineGlyph(set: string[], dx: number, dy: number): string {
  if (dx !== 0 && dy !== 0) return dx * dy < 0 ? (set[2] ?? '/') : (set[3] ?? '\\');
  return dy !== 0 ? (set[1] ?? '|') : (set[0] ?? '-');
}

/** Ship art as overlay cells, in side colors (or one ghost color). */
function shipOverlay(data: GameData, op: Op): OverlayCell[] {
  const ghost = typeof op.ghost === 'string' ? effectColor(data, op.ghost) : null;
  const side = String(op.side ?? 'player');
  return artCells(data, String(op.key), Number(op.x), Number(op.y), op.mirror === true, (op.state as DamageState | undefined) ?? 'normal').map((c) => ({
    x: c.x,
    y: c.y,
    ch: c.ch,
    fg: ghost ?? roleColor(data.art.style, side, c.role),
  }));
}

/** Exhaust behind each engine row: from the rear cell with role 'e', away from the bow. Soft. */
function exhaustOverlay(data: GameData, op: Op): OverlayCell[] {
  const ex = (op.exhaust as [string, string][] | undefined) ?? [];
  const mirrored = op.mirror === true;
  const cells = artCells(data, String(op.key), Number(op.x), Number(op.y), mirrored);
  const out: OverlayCell[] = [];
  const rows = new Map<number, ArtCell[]>();
  for (const c of cells) rows.set(c.y, [...(rows.get(c.y) ?? []), c]);
  for (const row of rows.values()) {
    const rear = mirrored ? row.reduce((a, c) => (c.x > a.x ? c : a)) : row.reduce((a, c) => (c.x < a.x ? c : a));
    if (rear.role !== 'e') continue;
    ex.forEach(([g, fg], j) => out.push({ x: rear.x + (mirrored ? 1 + j : -1 - j), y: rear.y, ch: g, fg: effectColor(data, fg), soft: true }));
  }
  return out;
}

/** The overlay cells of a list of operations, in order (later cells on top). */
export function renderOps(ops: Op[], ctx: OpCtx): OverlayCell[] {
  const { data } = ctx;
  const out: OverlayCell[] = [];
  const put = (x: number, y: number, ch: unknown, fg: unknown, soft?: unknown) => {
    if (typeof ch !== 'string') return;
    out.push({ x, y, ch, fg: effectColor(data, fg), ...(soft ? { soft: true } : {}) });
  };
  const t = ctx.target ?? null;
  for (const op of ops) {
    switch (op.k) {
      case 'line': {
        const P = ctx.paths[String(op.path)] ?? [];
        const n = P.length;
        const a = typeof op.i0 === 'number' ? op.i0 : Math.floor(Number(op.from ?? 0) * n);
        const b = typeof op.i1 === 'number' ? op.i1 : Math.ceil(Number(op.to ?? 1) * n);
        const set = data.art.effects.lineSets[String(op.set ?? 'thin')] ?? ['-', '|', '/', '\\'];
        const skip = (op.skip as number[] | undefined) ?? [];
        const every = Number(op.every ?? 0);
        const crawl = op.crawl as { period: number; phase: number; fg: string } | undefined;
        for (let i = Math.max(0, a); i < Math.min(n, b); i++) {
          if (skip.includes(i) || (every && (i + Number(op.phase ?? 0)) % every)) continue;
          const c = P[i] as Vec2;
          const prev = P[i - 1];
          const next = P[i + 1];
          const [qx, qy] = prev ? [c.x - prev.x, c.y - prev.y] : next ? [next.x - c.x, next.y - c.y] : [1, 0];
          let fg = op.fg;
          if (crawl) {
            const p = crawl.period;
            if ((((i - crawl.phase * 2) % p) + p) % p === 0) fg = crawl.fg;
          }
          put(c.x + Number(op.dx ?? 0), c.y + Number(op.dy ?? 0), lineGlyph(set, qx, qy), fg, op.soft);
        }
        break;
      }
      case 'at': {
        const at = anchor(ctx, op.at);
        if (!at) break;
        const d = (op.d as [number, number] | undefined) ?? [0, 0];
        const [x, y] = [at.x + d[0], at.y + d[1]];
        const pat = op.pat ? (data.art.effects.patterns[String(op.pat)] as [number, number, string?][] | undefined) : undefined;
        for (const [dx, dy, pg] of pat ?? []) {
          if (!keep(x + dx, y + dy, op.pfrac, 3)) continue;
          put(x + dx, y + dy, pg ?? op.pg, op.pfg ?? op.fg, op.soft);
        }
        if (op.g === '@damage') {
          const cell = t?.foot.find((c) => c.x === x && c.y === y);
          if (cell && t) out.push({ x, y, ch: DAMAGE_STEP[cell.ch] ?? '+', fg: roleColor(data.art.style, t.side, cell.role) });
        } else put(x, y, op.g, op.fg);
        break;
      }
      case 'ring':
      case 'disc': {
        const at = anchor(ctx, op.at);
        if (!at) break;
        for (const c of ellipse(Number(op.r ?? 1), op.k)) {
          const [x, y] = [at.x + c.x, at.y + c.y];
          if (keep(x, y, op.frac, Number(op.seed ?? 2))) put(x, y, op.g, op.fg, op.soft);
        }
        break;
      }
      case 'proj': {
        const P = ctx.paths[String(op.path)] ?? [];
        const left = P.length > 1 && (P[P.length - 1] as Vec2).x < (P[0] as Vec2).x;
        const body = Array.from(String(op.g ?? '*')).map((g) => (left ? g.replace('►', '◄') : g));
        const dy = Number(op.dy ?? 0);
        const count = Number(op.count ?? 1);
        const head0 = Number(op.head ?? 0);
        for (let k = 0; k < count; k++) {
          const head = head0 - k * (Number(op.gap ?? 0) + body.length);
          body.forEach((g, j) => {
            const c = P[head - (body.length - 1 - j)];
            if (c) put(c.x, c.y + dy, g, op.fg);
          });
          if (k === count - 1) {
            ((op.trail as [string, string][] | undefined) ?? []).forEach(([g, fg], j) => {
              const c = P[head - body.length - j];
              if (c) put(c.x, c.y + dy, g, fg, true);
            });
          }
        }
        break;
      }
      case 'perim':
        if (t) for (const c of op.part === 'facing' ? t.facing : t.perim) if (keep(c.x, c.y, op.frac, Number(op.seed ?? 2))) put(c.x, c.y, op.g, op.fg);
        break;
      case 'foot':
        if (t) {
          for (const c of t.foot) {
            if ((op.role && c.role !== op.role) || !keep(c.x, c.y, op.frac, Number(op.seed ?? 1))) continue;
            put(c.x, c.y, op.g === '@glyph' ? c.ch : op.g, op.fg);
          }
        }
        break;
      case 'blast': {
        if (!t) break;
        const at = (op.at as [number, number] | undefined) ?? [0, 0];
        const scene = ctx.sceneTarget ?? { w: t.w, h: t.h };
        // The preview ship faces left (mirrored); a ship that faces right gets the mirror position.
        const fx = Math.round((at[0] * Math.max(0, t.w - 1)) / Math.max(1, scene.w - 1));
        const x = t.x + (t.mirrored ? fx : t.w - 1 - fx);
        const y = t.y + Math.round((at[1] * Math.max(0, t.h - 1)) / Math.max(1, scene.h - 1));
        const ph = BLAST[Math.min(2, Math.max(0, Number(op.phase ?? 1) - 1))] as [string, string, string, string];
        for (const d of PLUS) put(x + d.x, y + d.y, ph[2], ph[3]);
        put(x, y, ph[0], ph[1]);
        break;
      }
      case 'cells':
        for (const [x, y, g, fg] of (op.list as [number, number, string, string][] | undefined) ?? []) put(x, y, g, fg);
        break;
      case 'row': {
        const ys = Array.isArray(op.y) ? (op.y as number[]) : [Number(op.y)];
        for (let x = Number(op.x0); x <= Number(op.x1); x++) for (const y of ys) put(x, y, op.g, op.fg);
        break;
      }
      case 'ship':
        out.push(...shipOverlay(data, op));
        break;
      case 'exh':
        out.push(...exhaustOverlay(data, op));
        break;
      case 'mship': {
        const cells = artCells(data, String(op.key), Number(op.x), Number(op.y), op.mirror === true);
        if (cells.length === 0) break;
        if (op.exhaust) out.push(...exhaustOverlay(data, op));
        const xs = cells.map((c) => c.x);
        const ys = cells.map((c) => c.y);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const mid = Math.floor((x0 + x1 + 1) / 2);
        if (op.puff === 'below' || op.puff === 'above') {
          const y = op.puff === 'below' ? y1 + 1 : y0 - 1;
          put(mid - 1, y, '·', 'smoke', true);
          put(mid, y, '·', 'smoke', true);
        }
        if (op.puff === 'front') for (let y = y0; y <= y1; y++) put(op.mirror === true ? x0 - 1 : x1 + 1, y, '·', 'smoke', true);
        out.push(...shipOverlay(data, op));
        break;
      }
      case 'text':
        Array.from(String(op.s ?? '')).forEach((ch, i) => put(Number(op.x) + i, Number(op.y), ch, op.fg));
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * Applies overlay cells in order: a soft cell paints only an empty cell
 * (`solid` says which battle cells are not empty) that no earlier overlay
 * cell covers.
 */
export function applyOverlay(cells: OverlayCell[], solid: (x: number, y: number) => boolean, put: (c: OverlayCell) => void): void {
  const taken = new Set<string>();
  for (const c of cells) {
    const k = `${c.x},${c.y}`;
    if (c.soft && (taken.has(k) || solid(c.x, c.y))) continue;
    taken.add(k);
    put(c);
  }
}

/** A frame with its time and the list of operations, after travel frames are expanded. */
interface PlainFrame {
  ms: number;
  o: Op[];
  hide?: boolean;
  flag?: boolean;
  state?: string;
}

/**
 * Expands a travel frame: the frame repeats, and the projectile head moves
 * `adv` cells each time, until it reaches the path end (or has moved `cells`).
 * A miss path goes on past its end, then the projectile fades.
 */
export function expandFrames(frames: Frame[], paths: Record<string, Vec2[]>, opts: { fullPath?: boolean } = {}): PlainFrame[] {
  const out: PlainFrame[] = [];
  for (const f of frames) {
    const base: PlainFrame = { ms: Number(f.ms ?? 0), o: (f.o as Op[] | undefined) ?? [] };
    if (f.hide) base.hide = true;
    if (f.flag) base.flag = true;
    if (typeof f.state === 'string') base.state = f.state;
    const t = f.travel as Op | undefined;
    if (!t) {
      out.push(base);
      continue;
    }
    const pathName = String(t.path ?? 'hit');
    const P = paths[pathName] ?? [];
    const end = P.length - 1;
    const blen = Array.from(String(t.g ?? '*')).length;
    const lanes = (t.lanes as { dy?: number; lag?: number }[] | undefined) ?? [{ dy: 0, lag: 0 }];
    const adv = Math.max(1, Number(t.adv ?? 1));
    const count = Number(t.count ?? 1);
    const gap = Number(t.gap ?? 0);
    // In the game a munition flies its whole path of this turn (the preview `start` and `cells` do not apply).
    let head = opts.fullPath ? 0 : Number(t.start ?? 0);
    const cells = opts.fullPath ? undefined : (t.cells as number | undefined);
    let moved = 0;
    for (let guard = 0; guard < 200; guard++) {
      head += adv;
      moved += adv;
      const h = pathName === 'miss' ? head : Math.min(head, end);
      out.push({
        ms: Number(t.ms ?? f.ms ?? 30),
        o: [...lanes.map((l) => ({ k: 'proj', path: pathName, head: h - (l.lag ?? 0) * 2, g: t.g, fg: t.fg, count, gap, trail: t.trail, dy: l.dy ?? 0 })), ...base.o],
      });
      if (cells !== undefined && moved >= cells) break;
      if (pathName !== 'miss' && head >= end) break;
      if (pathName === 'miss' && head >= end + blen + count * (gap + blen) + 3) break;
    }
  }
  return out;
}

const DAMAGE_KINDS = new Set(['shield', 'hull', 'armor', 'engine', 'destroy']);
const STATUS_KINDS = new Set(['destroy', 'flee', 'surrender']);

/** The effect name of an Effect (null: not shown). */
export function effectId(e: Effect, b: Battle, data: GameData): string | null {
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
    case 'flee':
      return has('flee') ? 'flee' : null;
    case 'munitionMove':
      return e.moduleId === 'torpedo_tube' ? 'torpedo_move' : 'missile_move';
    case 'munitionHit':
      return e.hit ? (e.moduleId === 'torpedo_tube' ? 'torpedo_hit' : 'missile_hit') : null;
    case 'pd':
      return 'point_defense';
    case 'reinforce':
      return has('reinforcement_arrival') ? 'reinforcement_arrival' : null;
    default:
      return null;
  }
}

/** The version of an effect for a module tier (1-3); effects without tiers have one version. */
export function effectVersion(data: GameData, id: string, tier = 1): GameData['art']['effects']['effects'][string]['versions'][number] | undefined {
  const def = data.art.effects.effects[id];
  if (!def) return undefined;
  return def.versions[Math.min(def.versions.length, Math.max(1, tier)) - 1];
}

/** The path of a miss: from the origin, past a cell next to the target, to the grid edge. */
function missPath(b: Battle, from: Vec2, to: Vec2): Vec2[] {
  const side = to.y > 0 ? -1 : 1;
  const aim = { x: to.x, y: to.y + side };
  const dx = aim.x - from.x;
  const dy = aim.y - from.y;
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  const reach = b.width + b.height;
  const far = { x: Math.round(from.x + (dx / n) * reach), y: Math.round(from.y + (dy / n) * reach) };
  return lineCells(from, far).filter((c) => c.x >= 0 && c.y >= 0 && c.x < b.width && c.y < b.height);
}

/** One placed item of a turn: its frames (already as overlay cells) and its kind for the queue. */
interface Item {
  kind: 'fx' | 'move';
  frames: { ms: number; cells: OverlayCell[]; hide?: boolean }[];
  shipId?: number;
  damage: boolean;
  shot: boolean;
  status: boolean;
  appear?: number[];
  path?: Vec2[];
}

/** A color name of one side (patrolDim) for another side (pirateDim), if the style has it. */
function recolor(data: GameData, name: string, from: string, to: string): string {
  if (!name.startsWith(from) || from === to) return name;
  const other = to + name.slice(from.length);
  if (data.art.style.colors[other] !== undefined || data.art.effects.colors[other] !== undefined) return other;
  const deep = `${to}Deep`;
  return data.art.style.colors[deep] !== undefined ? deep : to;
}

/** Reinforcement arrival and flee: the `row` and `ship` operations of the preview, laid on the real ship. */
function placedOps(ops: Op[], s: CombatShip, data: GameData, b: Battle, mode: 'arrive' | 'flee'): Op[] {
  const cells = artCells(data, s.ship.hullId, s.pos.x, s.pos.y, s.mirrored);
  if (cells.length === 0) return [];
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const rows = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
  const side = sideOf(s);
  // Arrival: the ship comes in from its own map edge (the left for the player's side). Flee: it leaves by the nearer edge.
  const right = mode === 'arrive' ? s.mirrored : x0 + x1 >= b.width;
  const out: Op[] = [];
  for (const op of ops) {
    if (op.k === 'row') {
      // The preview colors are of one faction (patrol arrives, a pirate flees); use the colors of this ship's side.
      const fgSide = recolor(data, String(op.fg), mode === 'arrive' ? 'patrol' : 'pirate', side);
      if (mode === 'arrive') {
        // The preview ship is 6 cells from the edge; the streak scales to the real distance.
        const edgeToShip = right ? b.width - 1 - x1 : x0;
        const share = Math.min(1, (Number(op.x1) - Number(op.x0) + 1) / 6);
        const len = Math.max(1, Math.round(edgeToShip * share));
        out.push({ ...op, fg: fgSide, y: rows, x0: right ? b.width - len : 0, x1: right ? b.width - 1 : len - 1 });
      } else {
        // The preview ship is at x 26 and flees to the right.
        const a = (Number(op.x0) - 26) * (right ? 1 : -1);
        const c = (Number(op.x1) - 26) * (right ? 1 : -1);
        const base = right ? x0 : x1;
        out.push({ ...op, fg: fgSide, y: rows, x0: base + Math.min(a, c), x1: base + Math.max(a, c) });
      }
    } else if (op.k === 'ship') {
      const shift = mode === 'flee' ? (Number(op.x) - 26) * (right ? 1 : -1) : 0;
      out.push({ k: 'ship', key: s.ship.hullId, x: s.pos.x + shift, y: s.pos.y, side, mirror: s.mirrored });
    } else out.push(op);
  }
  return out;
}

/** The frames of a ship move (movement.combat): ignition, one frame per step with exhaust and wake, the brake puff, and the idle glow. */
export function moveFrames(data: GameData, s: CombatShip, path: Vec2[], side: string, state: DamageState = 'normal'): { ms: number; o: Op[] }[] {
  const m = data.art.effects.movement.combat;
  const ex = (glyphs: string, colors: string[]) => Array.from(glyphs).map((g, i) => [g, colors[Math.min(i, colors.length - 1)]]);
  const ignite = ex(m.exhaustIgnite, ['engineHi', 'engine', 'engine', 'smoke']);
  const moving = ex(m.exhaustMove, ['engineHi', 'engine', 'smoke']);
  const ship = (p: Vec2, exhaust: unknown[], puff: string | null = null) => ({ k: 'mship', key: s.ship.hullId, x: p.x, y: p.y, side, mirror: s.mirrored, exhaust, puff, state });
  const wake = (p: Vec2, exhaust: unknown[]) => ({ k: 'exh', key: s.ship.hullId, x: p.x, y: p.y, mirror: s.mirrored, exhaust });
  const per = path.length - 1 > m.longPath ? m.cellsPerFrameLongPath : 1;
  const stops: Vec2[] = [path[0] as Vec2];
  for (let i = per; i < path.length - 1 + per; i += per) stops.push(path[Math.min(i, path.length - 1)] as Vec2);
  const frames: { ms: number; o: Op[] }[] = [{ ms: m.igniteMs, o: [ship(stops[0] as Vec2, ignite)] }];
  for (let i = 1; i < stops.length; i++) {
    const p = stops[i] as Vec2;
    const prev = stops[i - 1] as Vec2;
    const o: Op[] = [];
    if (m.wakeFrames >= 2 && i >= 2) o.push(wake(stops[i - 2] as Vec2, [['·', 'smokeDim']]));
    if (m.wakeFrames >= 1) o.push(wake(prev, [['░', 'engine'], ['·', 'smoke']]));
    // Thruster puffs: opposite to the vertical motion.
    o.push(ship(p, moving, p.y < prev.y ? 'below' : p.y > prev.y ? 'above' : null));
    frames.push({ ms: m.msPerCell, o });
  }
  const last = stops[stops.length - 1] as Vec2;
  const before = stops[stops.length - 2];
  frames.push({ ms: m.igniteMs, o: [...(before ? [wake(before, [['·', 'smokeDim']])] : []), ship(last, [['·', 'engineOff']], 'front')] });
  frames.push({ ms: m.igniteMs, o: [ship(last, [['·', 'engine']])] });
  return frames;
}

/**
 * Builds the timeline of one turn's effects. `b` is the battle after the
 * turn; `before` (optional) is the battle before it, for the ships' look and
 * damage state while they move.
 */
export function buildTimeline(effects: Effect[], b: Battle, data: GameData, before?: Battle): Timeline {
  const q = data.art.effects.queue;
  const items: Item[] = [];
  let lastShot: Effect | null = null;
  const shown = effects.filter((e) => e.kind === 'move' || effectId(e, b, data) !== null);
  const fxCount = shown.filter((e) => e.kind !== 'move').length;
  for (const e of shown) {
    if (e.kind === 'move') {
      const s = b.ships.find((x) => x.id === e.shipId);
      if (!s || e.path.length < 2) continue;
      const old = before?.ships.find((x) => x.id === e.shipId) ?? s;
      const frames = moveFrames(data, old, e.path, sideOf(old)).map((f) => ({ ms: f.ms, cells: renderOps(f.o, { data, paths: {} }) }));
      items.push({ kind: 'move', frames, shipId: s.id, damage: false, shot: false, status: false, path: e.path });
      continue;
    }
    const id = effectId(e, b, data) as string;
    const def = data.art.effects.effects[id];
    const tier = 'tier' in e && typeof e.tier === 'number' ? e.tier : 1;
    const version = effectVersion(data, id, tier);
    if (!def || !version) continue;
    const shipId = 'shipId' in e ? e.shipId : -1;
    const targetOf = e.kind === 'shot' || e.kind === 'munitionHit' ? e.targetId : shipId;
    const targetShip = b.ships.find((s) => s.id === targetOf);
    const ctx: OpCtx = { data, paths: {}, sceneTarget: SCENE_TARGET[def.scene] };
    let from: Vec2 | null = lastShot && (lastShot.kind === 'shot' || lastShot.kind === 'flak') ? lastShot.from : null;
    let fullPath = false;
    let ops: (o: Op[]) => Op[] = (o) => o;
    if (e.kind === 'shot') {
      const hit = lineCells(e.from, e.to);
      ctx.paths = { hit, miss: missPath(b, e.from, e.to) };
      ctx.origin = hit[0] ?? e.from;
      ctx.impact = e.to;
      from = e.from;
    } else if (e.kind === 'flak') {
      const hit = lineCells(e.from, e.center);
      ctx.paths = { hit, miss: hit };
      ctx.origin = hit[0] ?? e.from;
      ctx.impact = e.center;
      from = e.from;
    } else if (e.kind === 'hull' || e.kind === 'armor' || e.kind === 'engine') {
      ctx.impact = e.at;
    } else if (e.kind === 'munitionMove') {
      ctx.paths = { hit: e.path };
      fullPath = true;
    } else if (e.kind === 'munitionHit') {
      ctx.impact = e.at;
    } else if (e.kind === 'pd') {
      ctx.paths = { pd: lineCells(e.from, e.to) };
      ctx.origin = e.from;
      ctx.munition = e.to;
      ctx.impact = e.to;
    } else if (e.kind === 'reinforce') {
      const arrivals = b.ships.filter((s) => e.shipIds.includes(s.id));
      ops = (o) => arrivals.flatMap((s) => placedOps(o, s, data, b, 'arrive'));
    } else if (e.kind === 'flee' && targetShip) {
      ops = (o) => placedOps(o, targetShip, data, b, 'flee');
    }
    if (targetShip) {
      ctx.target = targetInfo(data, targetShip, from, b.width, b.height);
      if (!ctx.impact) ctx.impact = { x: targetShip.pos.x, y: targetShip.pos.y };
    }
    const frames = expandFrames(version.frames, ctx.paths, { fullPath }).map((f) => {
      const cells = renderOps(ops(f.o), ctx);
      if (f.flag && ctx.target) {
        const bridge = ctx.target.foot.find((c) => c.role === 'b') ?? ctx.target.foot[0];
        const mark = data.art.ships.surrenderMarker;
        if (bridge) cells.push({ x: bridge.x, y: ctx.target.y - 1, ch: mark.glyph, fg: styleColor(data.art.style, mark.fg) });
      }
      if (f.state === 'surrendered' && ctx.target) {
        for (const c of ctx.target.foot) {
          const ch = c.role === 'w' ? '·' : c.ch;
          cells.push({ x: c.x, y: c.y, ch, fg: c.role === 'e' ? styleColor(data.art.style, 'neutralDeep') : roleColor(data.art.style, 'neutral', c.role) });
        }
      }
      return { ms: f.ms, cells, ...(f.hide ? { hide: true } : {}) };
    });
    const item: Item = { kind: 'fx', frames, damage: DAMAGE_KINDS.has(e.kind) && lastShot !== null, shot: false, status: STATUS_KINDS.has(e.kind) };
    if (STATUS_KINDS.has(e.kind)) item.shipId = shipId;
    if (e.kind === 'reinforce') item.appear = e.shipIds;
    if (e.kind === 'shot' || e.kind === 'flak' || e.kind === 'munitionHit') {
      lastShot = e;
      item.shot = true;
    }
    items.push(item);
  }
  const stagger = fxCount >= 5 ? q.staggerMs5Plus : q.staggerMs;
  const place = (kFx: number, kMove: number) => {
    const frames: TimedFrame[] = [];
    const ships: Record<number, ShipAnim> = {};
    const anim = (id: number): ShipAnim => (ships[id] ??= { hidden: [] });
    let segStart = 0;
    let segEnd = 0;
    let slot = 0;
    let lastShotEnd: number | null = null;
    let fxTime = 0;
    let moveTime = 0;
    for (const it of items) {
      const k = it.kind === 'move' ? kMove : kFx;
      let t: number;
      if (it.kind === 'move') {
        fxTime += segEnd - segStart;
        t = segEnd;
      } else if (it.damage && lastShotEnd !== null) t = lastShotEnd;
      else t = segStart + slot++ * stagger * kFx;
      const start = t;
      for (const f of it.frames) {
        const ms = Math.max(q.minFrameMs, f.ms * k);
        frames.push({ start: t, end: t + ms, cells: f.cells });
        if (f.hide && it.shipId !== undefined) anim(it.shipId).hidden.push([t, t + ms]);
        t += ms;
      }
      if (it.kind === 'move' && it.shipId !== undefined) {
        const a = anim(it.shipId);
        a.path = it.path;
        a.moveStart = start;
        a.moveEnd = t;
        a.hidden.push([start, t]);
        moveTime += t - start;
        segStart = t;
        segEnd = t;
        slot = 0;
        lastShotEnd = null;
        continue;
      }
      if (it.status && it.shipId !== undefined) anim(it.shipId).settleAt ??= start;
      for (const id of it.appear ?? []) anim(id).appearAt = t;
      segEnd = Math.max(segEnd, t);
      if (it.shot) lastShotEnd = t;
    }
    fxTime += segEnd - segStart;
    const duration = frames.reduce((m, f) => Math.max(m, f.end), 0);
    return { frames, ships, duration, fxTime, moveTime };
  };
  const first = place(1, 1);
  const kFx = q.scaleIfOver && first.fxTime > q.budgetMs ? q.budgetMs / first.fxTime : 1;
  const moveBudget = data.balance.combat.moveAnimBudgetMs;
  const kMove = q.scaleIfOver && first.moveTime > moveBudget ? moveBudget / first.moveTime : 1;
  const out = kFx === 1 && kMove === 1 ? first : place(kFx, kMove);
  const movingMunitions = shown.flatMap((e) => (e.kind === 'munitionMove' ? [e.munitionId] : []));
  return { duration: out.duration, frames: out.frames, ships: out.ships, movingMunitions };
}

/** Overlay cells at time `ms` (later frames on top). */
export function overlayAt(tl: Timeline, ms: number): OverlayCell[] {
  return tl.frames.filter((f) => ms >= f.start && ms < f.end).flatMap((f) => f.cells);
}

/** The persist operations of an effect (debris of a destroyed ship) for a ship on the grid. */
export function persistCells(data: GameData, id: string, s: CombatShip, width: number, height: number): OverlayCell[] {
  const v = effectVersion(data, id);
  const o = (v?.persist?.o as Op[] | undefined) ?? [];
  return renderOps(o, { data, paths: {}, target: targetInfo(data, s, null, width, height), impact: s.pos });
}
