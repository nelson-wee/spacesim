// Ship art (Section 18): glyphs and role colors from data/art/ships.json and
// data/art/style.json. Ships on the right side use mirrored art (Section 13.2).
import type { GameData } from '../data';
import { roleColor, styleColor } from './palette';
import type { Term } from './display';

export type DamageState = 'normal' | 'damaged' | 'critical';
export type ArtView = GameData['art']['ships']['ships'][string]['battle'];

/** One row of art, mirrored: reversed, with each glyph in mirrorSwaps changed to its pair. */
export function mirrorRow(row: string, swaps: Record<string, string>): string {
  return Array.from(row)
    .reverse()
    .map((ch) => swaps[ch] ?? ch)
    .join('');
}

export function artRows(view: ArtView, state: DamageState): string[] {
  return state === 'critical' ? view.glyphsCritical : state === 'damaged' ? view.glyphsDamaged : view.glyphs;
}

/** Multiplies the brightness of a #RRGGBB color. */
export function dimColor(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * factor);
  return `#${[ch(16), ch(8), ch(0)].map((v) => Math.min(255, v).toString(16).padStart(2, '0')).join('')}`;
}

export interface DrawArtOptions {
  side: string;
  state?: DamageState;
  mirrored?: boolean;
  /** Hot ships use the hot tint on hull and armor cells (style.roles.hot_tint). */
  hot?: boolean;
  /** Engines OFF: engine cells (role 'e') use the `engineOff` color (Section 18.2). */
  enginesOff?: boolean;
  background?: string;
}

/**
 * Draws art with its top-left cell at (x, y). Spaces are not part of the
 * ship and are not drawn. Damaged and critical states dim the colors with the
 * factors of damage_rule; changed cells are dimmer.
 */
export function drawArt(t: Term, data: GameData, view: ArtView, x: number, y: number, opts: DrawArtOptions): void {
  const style = data.art.style;
  const rule = data.art.ships.damageRule;
  const state = opts.state ?? 'normal';
  const swaps = data.art.ships.mirrorSwaps;
  const hotTint = style.roles.hot_tint;
  const rows = artRows(view, state);
  rows.forEach((row, j) => {
    const normal = Array.from(view.glyphs[j] ?? '');
    let glyphs = Array.from(row);
    let roles = Array.from(view.roles[j] ?? '');
    let base = normal;
    if (opts.mirrored) {
      glyphs = Array.from(mirrorRow(row, swaps));
      roles = roles.reverse();
      base = Array.from(mirrorRow(view.glyphs[j] ?? '', swaps));
    }
    glyphs.forEach((ch, i) => {
      if (ch === ' ') return;
      const role = roles[i] ?? 'a';
      let color =
        opts.enginesOff && role === 'e'
          ? styleColor(style, 'engineOff')
          : opts.hot && typeof hotTint === 'object' && hotTint[role]
            ? styleColor(style, hotTint[role])
            : roleColor(style, opts.side, role);
      if (state !== 'normal') {
        const changed = base[i] !== ch;
        color = dimColor(color, changed ? rule.dim.changed : rule.dim[state]);
      }
      t.put(x + i, y + j, ch, color, opts.background);
    });
  });
}
