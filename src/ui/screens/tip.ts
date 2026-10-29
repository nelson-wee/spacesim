// A tutorial tip (Q-48): a box on top of the screen. Enter closes it; X turns
// off the tutorial for this game.
import { setTutorialOn } from '../../core/tutorial';
import type { TutorialTip } from '../../data/schemas';
import type { Term } from '../../render/display';
import { HEIGHT, WIDTH } from '../../render/display';
import { palette } from '../../render/palette';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { drawKeyHints, press } from '../widgets/clicks';

export class TipScreen implements Screen {
  readonly overlay = true;

  constructor(
    private readonly app: App,
    private readonly tip: TutorialTip,
    private readonly lines: string[],
  ) {}

  render(t: Term): void {
    const ui = palette(this.app.data).ui;
    const w = 66;
    const h = this.lines.length + 6;
    const x = Math.floor((WIDTH - w) / 2);
    const y = Math.max(1, Math.floor((HEIGHT - h) / 2) - 4);
    t.box(x, y, w, h, ui.border, `Tutorial: ${this.tip.title}`, ui.title, 'modal');
    this.lines.forEach((l, i) => t.text(x + 3, y + 2 + i, l, ui.bright, undefined, w - 6));
    drawKeyHints(t, this.app.zones, x + 3, y + h - 2, [['Enter', 'Close', press('Enter')], ['X', 'Tutorial off', press('x')]], ui, this.app.press, 2);
  }

  onKey(k: KeyInput): boolean {
    if (k.key === 'x' && this.app.game) setTutorialOn(this.app.game.state, false);
    if (k.key === 'Enter' || k.key === 'Escape' || k.key === ' ' || k.key === 'x') this.app.pop();
    // The tip takes all keys: the screen below gets none while it shows.
    return true;
  }

  help(): string[] {
    return ['TUTORIAL TIP', '', 'Enter, Esc  Close the tip', 'X           Turn off the tutorial for this game', '', 'Title screen, S: the tutorial setting for new games.'];
  }
}
