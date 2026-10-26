// The rot.js display: 100 x 40 cells (Section 4). Cell size, font, and frame
// glyphs come from data/art/style.json. Term draws one cell at a time, so map
// glyphs such as '%' are not read as rot.js color codes.
import { Display } from 'rot-js';
import Rect from 'rot-js/lib/display/rect.js';
import type { Style } from '../data';

export const WIDTH = 100;
export const HEIGHT = 40;

/**
 * rot.js makes cells `spacing x fontSize` high, so it cannot give the 10 x 20
 * cells of the style (font size 16.667). This backend uses the cell size of
 * the style. Glyphs are drawn at the center of each cell, as in rot.js.
 */
class FixedCellRect extends Rect {
  constructor(
    private readonly cellW: number,
    private readonly cellH: number,
  ) {
    super();
  }

  override _updateSize(): void {
    const opts = this._options;
    this._spacingX = this.cellW;
    this._spacingY = this.cellH;
    this._ctx.canvas.width = opts.width * this._spacingX;
    this._ctx.canvas.height = opts.height * this._spacingY;
  }
}

/** CSS font family: the style font first, then fallbacks for missing glyphs. */
export function fontFamily(style: Style): string {
  return `"${style.cell.font}", "DejaVu Sans Mono", Consolas, monospace`;
}

export function createDisplay(style: Style, background: string, foreground: string): Display {
  const display = new Display({
    width: WIDTH,
    height: HEIGHT,
    fontSize: style.cell.fontSize,
    fontFamily: fontFamily(style),
    bg: background,
    fg: foreground,
  });
  // Change to the fixed-cell backend. rot.js has no option for this.
  const backend = new FixedCellRect(style.cell.w, style.cell.h);
  (display as unknown as { _backend: Rect })._backend = backend;
  backend.setOptions(display.getOptions());
  return display;
}

export type FrameKind = 'single' | 'modal';

export class Term {
  constructor(
    readonly display: Display,
    readonly background: string,
    private readonly frames: Style['frame'],
  ) {}

  clear(): void {
    this.display.clear();
  }

  put(x: number, y: number, ch: string, fg: string, bg: string = this.background): void {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    this.display.draw(x, y, ch, fg, bg);
  }

  /** Writes text from (x, y). Text longer than `maxWidth` is cut. Returns the end x. */
  text(x: number, y: number, text: string, fg: string, bg?: string, maxWidth = WIDTH): number {
    const chars = Array.from(text).slice(0, Math.max(0, maxWidth));
    chars.forEach((ch, i) => this.put(x + i, y, ch, fg, bg));
    return x + chars.length;
  }

  hline(y: number, x0: number, x1: number, ch: string, fg: string): void {
    for (let x = x0; x <= x1; x++) this.put(x, y, ch, fg);
  }

  vline(x: number, y0: number, y1: number, ch: string, fg: string): void {
    for (let y = y0; y <= y1; y++) this.put(x, y, ch, fg);
  }

  fill(x: number, y: number, w: number, h: number, bg: string): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.put(i, j, ' ', bg, bg);
  }

  /** Frame glyphs in the order of style.json: top-left, top-right, bottom-left, bottom-right, horizontal, vertical. */
  frameGlyphs(kind: FrameKind): string[] {
    return Array.from(this.frames[kind]);
  }

  /** A box with a frame from the style, and an optional title. */
  box(x: number, y: number, w: number, h: number, fg: string, title?: string, titleFg = fg, kind: FrameKind = 'single'): void {
    const [tl, tr, bl, br, hz, vt] = this.frameGlyphs(kind) as [string, string, string, string, string, string];
    this.fill(x, y, w, h, this.background);
    this.put(x, y, tl, fg);
    this.put(x + w - 1, y, tr, fg);
    this.put(x, y + h - 1, bl, fg);
    this.put(x + w - 1, y + h - 1, br, fg);
    this.hline(y, x + 1, x + w - 2, hz, fg);
    this.hline(y + h - 1, x + 1, x + w - 2, hz, fg);
    this.vline(x, y + 1, y + h - 2, vt, fg);
    this.vline(x + w - 1, y + 1, y + h - 2, vt, fg);
    if (title) {
      // Title after the corner and one horizontal glyph, for example "┌─ Help ".
      const after = this.text(x + 2, y, ' ', fg);
      this.text(this.text(after, y, title, titleFg, undefined, w - 6), y, ' ', fg);
    }
  }

  /** A key cap: the key label on the key background. Returns the end x. */
  key(x: number, y: number, label: string, fg: string, bg: string): number {
    return this.text(x, y, label, fg, bg);
  }
}
