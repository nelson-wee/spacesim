// Help overlay (`?`, Section 17.5): help for the screen below, and global keys.
import type { Term } from '../../render/display';
import { HEIGHT, WIDTH } from '../../render/display';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { palette } from '../../render/palette';

const GLOBAL = ['', 'ALL SCREENS', '?        This help', 'Esc      Back one screen'];

export class HelpScreen implements Screen {
  readonly overlay = true;

  constructor(
    private readonly app: App,
    private readonly lines: string[],
  ) {}

  render(t: Term): void {
    const ui = palette(this.app.data).ui;
    const lines = [...this.lines, ...GLOBAL];
    const w = Math.min(WIDTH - 4, Math.max(40, ...lines.map((l) => l.length)) + 4);
    const h = Math.min(HEIGHT - 2, lines.length + 4);
    const x = Math.floor((WIDTH - w) / 2);
    const y = Math.floor((HEIGHT - h) / 2);
    t.box(x, y, w, h, ui.border, 'Help', ui.title, 'modal');
    lines.slice(0, h - 4).forEach((l, i) => {
      const heading = l.length > 0 && l === l.toUpperCase() && /[A-Z]/.test(l);
      t.text(x + 2, y + 2 + i, l, heading ? ui.title : ui.text, undefined, w - 4);
    });
    t.key(x + 2, y + h - 1, ' Any key: close ', ui.key, ui.keyBg);
  }

  onKey(_k: KeyInput): boolean {
    this.app.pop();
    return true;
  }

  help(): string[] {
    return this.lines;
  }
}
