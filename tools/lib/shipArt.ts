// Converts the Claude Design ship art (data/art/ships.yaml) into the game data
// file data/art/ships.json, and checks its structure. The YAML is the source
// of truth; do not edit ships.json by hand.
import yaml from 'js-yaml';

interface YamlView {
  size: string;
  glyphs: string[];
  roles: string[];
  glyphs_damaged: string[];
  glyphs_critical: string[];
  flicker?: [number, number][];
  slot_count?: number;
  slots?: string[];
}

interface YamlShip {
  name: string;
  size_class: string;
  battle: YamlView;
  portrait: YamlView;
}

interface YamlDoc {
  mirror_swaps: string;
  role_colors: Record<string, string>;
  damage_rule: {
    order: unknown[];
    damaged: number;
    critical: number;
    dim: { damaged: number; critical: number; changed: number };
  };
  damage_step: string;
  surrender_marker: { glyph: string; fg: string; at: string; blink_ms: [number, number] };
  ships: YamlShip[];
}

export interface ArtView {
  width: number;
  height: number;
  glyphs: string[];
  roles: string[];
  glyphsDamaged: string[];
  glyphsCritical: string[];
  /** [x, y] cells that flicker (for example, engine glow). */
  flicker: [number, number][];
}

export interface PortraitView extends ArtView {
  slotCount: number;
  /** Digits 1-9 mark slot positions; spaces elsewhere. */
  slots: string[];
}

export interface ShipArtFile {
  source: string;
  mirrorSwaps: Record<string, string>;
  roleColors: Record<string, string>;
  damageRule: YamlDoc['damage_rule'];
  /** One damage step for each glyph: glyph -> next glyph. */
  damageStep: Record<string, string>;
  /** Replacement for any box-drawing glyph in a damage step. */
  damageStepBox: string;
  surrenderMarker: { glyph: string; fg: string; at: string; blinkMs: [number, number] };
  ships: Record<string, { sizeClass: string; battle: ArtView; portrait: PortraitView }>;
}

export const ROLE_CODES = 'habewscr';

const chars = (s: string) => Array.from(s);

function parseSize(size: string): [number, number] {
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) throw new Error(`bad size "${size}"`);
  return [Number(m[1]), Number(m[2])];
}

/** Structure problems in one view. */
function checkView(name: string, v: YamlView, problems: string[]): void {
  const [w, h] = parseSize(v.size);
  const grids: [string, string[] | undefined][] = [
    ['glyphs', v.glyphs],
    ['roles', v.roles],
    ['glyphs_damaged', v.glyphs_damaged],
    ['glyphs_critical', v.glyphs_critical],
  ];
  if (v.slots) grids.push(['slots', v.slots]);
  for (const [key, rows] of grids) {
    if (!Array.isArray(rows)) {
      problems.push(`${name}.${key}: missing`);
      continue;
    }
    if (rows.length !== h) problems.push(`${name}.${key}: ${rows.length} rows, size says ${h}`);
    rows.forEach((r, y) => {
      if (chars(r).length !== w) problems.push(`${name}.${key}[${y}]: width ${chars(r).length}, size says ${w}`);
    });
  }
  v.glyphs.forEach((row, y) => {
    const g = chars(row);
    const r = chars(v.roles[y] ?? '');
    const d = chars(v.glyphs_damaged[y] ?? '');
    const c = chars(v.glyphs_critical[y] ?? '');
    g.forEach((ch, x) => {
      const role = r[x] ?? ' ';
      if ((ch === ' ') !== (role === ' ')) problems.push(`${name} (${x},${y}): glyph "${ch}" has role "${role}"`);
      if (role !== ' ' && !ROLE_CODES.includes(role)) problems.push(`${name} (${x},${y}): unknown role "${role}"`);
      if ((ch === ' ') !== ((d[x] ?? ' ') === ' ')) problems.push(`${name} (${x},${y}): damaged art changes the footprint`);
      if ((ch === ' ') !== ((c[x] ?? ' ') === ' ')) problems.push(`${name} (${x},${y}): critical art changes the footprint`);
    });
  });
  for (const [x, y] of v.flicker ?? []) {
    const ch = chars(v.glyphs[y] ?? '')[x];
    if (ch === undefined || ch === ' ') problems.push(`${name}: flicker cell (${x},${y}) is not on the ship`);
  }
  if (v.slots) {
    const marks = v.slots.join('').replace(/ /g, '');
    if (!/^[1-9]*$/.test(marks)) problems.push(`${name}.slots: only digits 1-9 are allowed`);
    if (marks.length !== v.slot_count) problems.push(`${name}.slots: ${marks.length} marks, slot_count ${v.slot_count}`);
  }
}

function toView(v: YamlView): ArtView {
  const [width, height] = parseSize(v.size);
  return {
    width,
    height,
    glyphs: v.glyphs,
    roles: v.roles,
    glyphsDamaged: v.glyphs_damaged,
    glyphsCritical: v.glyphs_critical,
    flicker: v.flicker ?? [],
  };
}

/** "█▓ ▓▒ ... box+" -> map of steps, and the replacement for box-drawing glyphs. */
function parseDamageStep(text: string): { steps: Record<string, string>; box: string } {
  const steps: Record<string, string> = {};
  let box = '+';
  for (const token of text.trim().split(/ +/)) {
    if (token.startsWith('box')) {
      box = chars(token.slice(3))[0] ?? '+';
      continue;
    }
    const [from, to] = chars(token);
    if (from === undefined || to === undefined) throw new Error(`damage_step: bad token "${token}"`);
    steps[from] = to;
  }
  return { steps, box };
}

function parseMirror(text: string): Record<string, string> {
  const swaps: Record<string, string> = {};
  for (const pair of text.trim().split(/ +/)) {
    const [a, b] = chars(pair);
    if (a === undefined || b === undefined || chars(pair).length !== 2) throw new Error(`mirror_swaps: bad pair "${pair}"`);
    swaps[a] = b;
    swaps[b] = a;
  }
  return swaps;
}

/** Reads the YAML text, checks it, and returns the ships.json content. Throws on problems. */
export function convertShipArt(yamlText: string): ShipArtFile {
  const doc = yaml.load(yamlText) as YamlDoc;
  const header = yamlText.split('\n')[0]?.replace(/^#\s*/, '') ?? '';
  const problems: string[] = [];
  const ships: ShipArtFile['ships'] = {};
  for (const ship of doc.ships) {
    checkView(`${ship.name}.battle`, ship.battle, problems);
    checkView(`${ship.name}.portrait`, ship.portrait, problems);
    if (ships[ship.name]) problems.push(`${ship.name}: listed twice`);
    ships[ship.name] = {
      sizeClass: ship.size_class,
      battle: toView(ship.battle),
      portrait: { ...toView(ship.portrait), slotCount: ship.portrait.slot_count ?? 0, slots: ship.portrait.slots ?? [] },
    };
  }
  if (problems.length > 0) throw new Error(`ships.yaml has problems:\n  ${problems.join('\n  ')}`);
  const step = parseDamageStep(doc.damage_step);
  return {
    source: `data/art/ships.yaml (${header}). Generated by tools/import-art.ts. Do not edit.`,
    mirrorSwaps: parseMirror(doc.mirror_swaps),
    roleColors: doc.role_colors,
    damageRule: doc.damage_rule,
    damageStep: step.steps,
    damageStepBox: step.box,
    surrenderMarker: {
      glyph: doc.surrender_marker.glyph,
      fg: doc.surrender_marker.fg,
      at: doc.surrender_marker.at,
      blinkMs: doc.surrender_marker.blink_ms,
    },
    ships,
  };
}

/** The exact text of data/art/ships.json for a YAML text. */
export function shipArtJson(yamlText: string): string {
  return `${JSON.stringify(convertShipArt(yamlText), null, 2)}\n`;
}
