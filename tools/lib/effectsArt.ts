// Converts the Claude Design combat effects (data/art/effects.yaml, v0.2) into
// the game data file data/art/effects.json, and checks its structure. The YAML
// is the source of truth; do not edit effects.json by hand.
//
// v0.2: weapon effects have three tiers; a frame is a list of operations (`o`);
// colors come from style.json, and the ramp rule (Dim, Hi, Core) gives the
// colors that style.json does not have (for example laserCore, jumpDim).
import yaml from 'js-yaml';

type Frame = Record<string, unknown>;

interface YamlVersion {
  total_ms: number;
  frames: Frame[];
  persist?: Frame;
}

interface YamlEffect extends Partial<YamlVersion> {
  effect: string;
  scene: string;
  tiers?: Record<string, YamlVersion>;
  loop?: boolean;
  static?: boolean;
}

interface YamlDoc {
  family_base: Record<string, string>;
  ramp_rule: Record<string, string>;
  line_sets: Record<string, string[]>;
  patterns: Record<string, unknown[][]>;
  queue: { stagger_ms: number; stagger_ms_5plus: number; budget_ms: number; scale_if_over: boolean; min_frame_ms: number; skip_key: string };
  movement: {
    combat: { ms_per_cell: number; cells_per_frame_if_path_gt_12: number; ignite_ms: number; exhaust_ignite: string; exhaust_move: string; wake_frames: number };
    map: { glyph: string; cells_per_frame: number; ms_per_frame: number; trail: number; trail_colors: string[] };
  };
  effects: YamlEffect[];
}

export interface EffectVersion {
  totalMs: number;
  frames: Frame[];
  /** What stays on the grid after the effect. */
  persist?: Frame;
}

export interface EffectDef {
  /** The preview scene of the Claude Design file (duel, pd, wasp, capital, edge, move, sector, region). */
  scene: string;
  /** Tier 1, 2, 3 for weapon effects; one version for the others. */
  versions: EffectVersion[];
  loop?: boolean;
  static?: boolean;
}

export interface Movement {
  combat: { msPerCell: number; cellsPerFrameLongPath: number; longPath: number; igniteMs: number; exhaustIgnite: string; exhaustMove: string; wakeFrames: number };
  map: { glyph: string; cellsPerFrame: number; msPerFrame: number; trail: number; trailColors: string[] };
}

export interface EffectsFile {
  source: string;
  lineSets: Record<string, string[]>;
  patterns: Record<string, unknown[][]>;
  queue: { staggerMs: number; staggerMs5Plus: number; budgetMs: number; scaleIfOver: boolean; minFrameMs: number; skipKey: string };
  /** Colors that the effects use and style.json does not have, from the ramp rule. */
  colors: Record<string, string>;
  movement: Movement;
  effects: Record<string, EffectDef>;
}

const OPS = new Set(['at', 'line', 'ring', 'disc', 'blast', 'cells', 'exh', 'foot', 'mship', 'perim', 'proj', 'row', 'ship', 'text']);

/** mix(a, b, f) of two #RRGGBB colors, as the reference file computes it. */
export function mixHex(a: string, b: string, f: number): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const [A, B] = [rgb(a), rgb(b)];
  return `#${A.map((v, i) => Math.round(v * (1 - f) + (B[i] ?? 0) * f).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** "mix(base, void, 0.50)" -> ['void', 0.5]. */
function parseRamp(rule: string): [string, number] {
  const m = /mix\(\s*base\s*,\s*([#\w]+)\s*,\s*([\d.]+)\s*\)/.exec(rule);
  if (!m) throw new Error(`effects.yaml: bad ramp rule "${rule}"`);
  return [m[1] as string, Number(m[2])];
}

/** Names of colors, line sets, and patterns in a frame (fg, pfg, pods, bg, ghost, trail, cells, exhaust). */
export function frameRefs(frame: unknown): { colors: string[]; sets: string[]; patterns: string[]; ops: string[] } {
  const out = { colors: [] as string[], sets: [] as string[], patterns: [] as string[], ops: [] as string[] };
  const visit = (v: unknown, key: string): void => {
    if (Array.isArray(v)) {
      if (key === 'trail' || key === 'exhaust') for (const t of v) if (Array.isArray(t) && typeof t[1] === 'string') out.colors.push(t[1]);
      if (key === 'list') for (const c of v) if (Array.isArray(c) && typeof c[3] === 'string') out.colors.push(c[3]);
      for (const x of v) visit(x, '');
      return;
    }
    if (v === null || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (['fg', 'pfg', 'pods', 'bg', 'ghost'].includes(k) && typeof x === 'string') out.colors.push(x);
      else if (k === 'set' && typeof x === 'string') out.sets.push(x);
      else if (k === 'pat' && typeof x === 'string') out.patterns.push(x);
      else if (k === 'k' && typeof x === 'string') out.ops.push(x);
      if (k === 'crawl' && x && typeof x === 'object' && typeof (x as Frame).fg === 'string') out.colors.push((x as Frame).fg as string);
      visit(x, k);
    }
  };
  visit(frame, '');
  return out;
}

/** Reads the YAML text, checks it, and returns the effects.json content. Throws on problems. */
export function convertEffects(yamlText: string, styleColors: Record<string, string>): EffectsFile {
  const doc = yaml.load(yamlText) as YamlDoc;
  const header = yamlText.split('\n')[0]?.replace(/^#\s*/, '') ?? '';
  const problems: string[] = [];
  const effects: Record<string, EffectDef> = {};
  for (const [name, set] of Object.entries(doc.line_sets)) {
    if (set.length !== 4) problems.push(`line_sets.${name}: ${set.length} glyphs, need 4 (horizontal, vertical, two diagonals)`);
  }
  const ramp = Object.fromEntries(Object.entries(doc.ramp_rule).map(([k, r]) => [k, parseRamp(r)]));
  const base = (name: string): string | undefined => doc.family_base[name] ?? styleColors[name];
  const colors: Record<string, string> = {};
  /** A color name: from style.json, else from the ramp rule (base + Dim, Hi, or Core). */
  const resolve = (name: string): boolean => {
    if (styleColors[name] !== undefined || colors[name] !== undefined) return true;
    for (const [suffix, [to, f]] of Object.entries(ramp)) {
      if (!name.endsWith(suffix)) continue;
      const b = base(name.slice(0, -suffix.length));
      const other = to === 'void' ? styleColors.void : to;
      if (b && other) {
        colors[name] = mixHex(b, other, f);
        return true;
      }
    }
    return false;
  };
  const checkVersion = (id: string, v: YamlVersion): EffectVersion => {
    if (!Array.isArray(v.frames) || v.frames.length === 0) problems.push(`${id}: no frames`);
    if (typeof v.total_ms !== 'number' || v.total_ms < 0) problems.push(`${id}: bad total_ms`);
    for (const [i, f] of (v.frames ?? []).entries()) {
      const travel = f.travel as { ms?: unknown } | undefined;
      const ms = typeof f.ms === 'number' ? f.ms : travel?.ms;
      if (typeof ms !== 'number' || ms < 0) problems.push(`${id}.frames[${i}]: no time (ms)`);
    }
    for (const f of [...(v.frames ?? []), ...(v.persist ? [v.persist] : [])]) {
      const refs = frameRefs(f);
      for (const s of refs.sets) if (!doc.line_sets[s]) problems.push(`${id}: unknown line set "${s}"`);
      for (const p of refs.patterns) if (!doc.patterns[p]) problems.push(`${id}: unknown pattern "${p}"`);
      for (const k of refs.ops) if (!OPS.has(k)) problems.push(`${id}: unknown operation "${k}"`);
      for (const c of refs.colors) if (!resolve(c)) problems.push(`${id}: unknown color "${c}"`);
    }
    return { totalMs: v.total_ms, frames: v.frames, ...(v.persist ? { persist: v.persist } : {}) };
  };
  for (const e of doc.effects) {
    if (effects[e.effect]) problems.push(`${e.effect}: listed twice`);
    let versions: EffectVersion[];
    if (e.tiers) {
      versions = ['1', '2', '3'].map((t) => {
        const v = e.tiers?.[t];
        if (!v) problems.push(`${e.effect}: no tier ${t}`);
        return checkVersion(`${e.effect}.tiers.${t}`, v ?? { total_ms: 0, frames: [] });
      });
    } else versions = [checkVersion(e.effect, { total_ms: e.total_ms ?? -1, frames: e.frames ?? [], ...(e.persist ? { persist: e.persist } : {}) })];
    effects[e.effect] = { scene: e.scene, versions, ...(e.loop ? { loop: true } : {}), ...(e.static ? { static: true } : {}) };
  }
  for (const c of doc.movement.map.trail_colors) if (!resolve(c)) problems.push(`movement.map: unknown color "${c}"`);
  if (problems.length > 0) throw new Error(`effects.yaml has problems:\n  ${problems.join('\n  ')}`);
  const q = doc.queue;
  const mc = doc.movement.combat;
  const mm = doc.movement.map;
  return {
    source: `data/art/effects.yaml (${header}). Generated by tools/import-art.ts. Do not edit.`,
    lineSets: doc.line_sets,
    patterns: doc.patterns,
    queue: {
      staggerMs: q.stagger_ms,
      staggerMs5Plus: q.stagger_ms_5plus,
      budgetMs: q.budget_ms,
      scaleIfOver: q.scale_if_over,
      minFrameMs: q.min_frame_ms,
      skipKey: q.skip_key,
    },
    colors: Object.fromEntries(Object.entries(colors).sort(([a], [b]) => a.localeCompare(b))),
    movement: {
      combat: {
        msPerCell: mc.ms_per_cell,
        cellsPerFrameLongPath: mc.cells_per_frame_if_path_gt_12,
        longPath: 12,
        igniteMs: mc.ignite_ms,
        exhaustIgnite: mc.exhaust_ignite,
        exhaustMove: mc.exhaust_move,
        wakeFrames: mc.wake_frames,
      },
      map: { glyph: mm.glyph, cellsPerFrame: mm.cells_per_frame, msPerFrame: mm.ms_per_frame, trail: mm.trail, trailColors: mm.trail_colors },
    },
    effects,
  };
}

/** The exact text of data/art/effects.json for a YAML text and the style colors. */
export function effectsJson(yamlText: string, styleColors: Record<string, string>): string {
  return `${JSON.stringify(convertEffects(yamlText, styleColors), null, 2)}\n`;
}
