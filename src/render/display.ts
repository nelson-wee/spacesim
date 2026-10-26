// The rot.js display: 100 x 40 cells, monospace font (Section 4).
// Term draws one cell at a time, so map glyphs such as '%' are not read as
// rot.js color codes.
import { Display } from 'rot-js';

export const WIDTH = 100;
export const HEIGHT = 40;

// Fonts with Code Page 437 glyphs. The visual brief can change this list.
const FONT_FAMILY = '"DejaVu Sans Mono", Consolas, "Lucida Console", "Courier New", monospace';

export function createDisplay(background: string, foreground: string): Display {
  return new Display({
    width: WIDTH,
    height: HEIGHT,
    fontSize: 16,
    fontFamily: FONT_FAMILY,
    bg: background,
    fg: foreground,
  });
}

export class Term {
  constructor(
    readonly display: Display,
    readonly background: string,
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

  /** A box with single-line box-drawing characters and an optional title. */
  box(x: number, y: number, w: number, h: number, fg: string, title?: string, titleFg = fg): void {
    this.fill(x, y, w, h, this.background);
    this.put(x, y, '┌', fg);
    this.put(x + w - 1, y, '┐', fg);
    this.put(x, y + h - 1, '└', fg);
    this.put(x + w - 1, y + h - 1, '┘', fg);
    this.hline(y, x + 1, x + w - 2, '─', fg);
    this.hline(y + h - 1, x + 1, x + w - 2, '─', fg);
    this.vline(x, y + 1, y + h - 2, '│', fg);
    this.vline(x + w - 1, y + 1, y + h - 2, '│', fg);
    if (title) this.text(x + 2, y, ` ${title} `, titleFg, undefined, w - 4);
  }
}
