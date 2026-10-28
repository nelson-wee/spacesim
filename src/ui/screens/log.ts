// Log screen (Section 17.1): the full message history.
import { displayDay } from '../../core/clock';
import type { Term } from '../../render/display';
import { HEIGHT, WIDTH } from '../../render/display';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { logColor } from '../widgets/statusBar';
import { palette } from '../../render/palette';

const TOP = 2;
const ROWS = HEIGHT - TOP - 2;

export class LogScreen implements Screen {
  /** Lines from the end of the log to the last line on screen. */
  private offset = 0;

  constructor(private readonly app: App) {}

  render(t: Term): void {
    const game = this.app.game;
    if (!game) return;
    const ui = palette(game.data).ui;
    const log = game.state.log;
    t.text(0, 0, 'Log', ui.title);
    t.text(10, 0, `${log.length} messages`, ui.dim);
    t.hline(1, 0, WIDTH - 1, '─', ui.border);
    const end = Math.max(0, log.length - this.offset);
    const start = Math.max(0, end - ROWS);
    log.slice(start, end).forEach((e, i) => {
      const prefix = `D${displayDay(e.day)}`.padEnd(6);
      t.text(0, TOP + i, prefix, ui.dim);
      t.text(6, TOP + i, e.text, logColor(game, e.kind), undefined, WIDTH - 6);
    });
    t.hline(HEIGHT - 2, 0, WIDTH - 1, '─', ui.border);
    let x = t.key(0, HEIGHT - 1, 'Up/Down PgUp/PgDn Home/End', ui.key, ui.keyBg);
    x = t.text(x, HEIGHT - 1, ' Scroll   ', ui.text);
    const esc = x;
    x = t.key(x, HEIGHT - 1, 'Esc', ui.key, ui.keyBg);
    this.app.zones.add(esc, HEIGHT - 1, 8, () => this.app.pop());
    t.text(x, HEIGHT - 1, ' Back', ui.text);
  }

  onKey(k: KeyInput): boolean {
    const total = this.app.game?.state.log.length ?? 0;
    const maxOffset = Math.max(0, total - ROWS);
    const moves: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: ROWS, PageDown: -ROWS };
    if (k.key in moves) {
      this.offset = Math.min(maxOffset, Math.max(0, this.offset + (moves[k.key] ?? 0)));
      return true;
    }
    if (k.key === 'Home') {
      this.offset = maxOffset;
      return true;
    }
    if (k.key === 'End') {
      this.offset = 0;
      return true;
    }
    if (k.key === 'l') {
      this.app.pop();
      return true;
    }
    return false;
  }

  help(): string[] {
    return ['LOG', '', 'Up/Down, PgUp/PgDn  Scroll', 'Home/End           First / last message', 'Esc, L             Back'];
  }
}
