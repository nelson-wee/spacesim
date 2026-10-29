// Game over (M6-FCMB-05): the last ship is lost and there is no Clone
// Insurance. A simple screen; the career end screen comes in M7.
import { displayDay } from '../../core/clock';
import type { Term } from '../../render/display';
import { WIDTH } from '../../render/display';
import { palette } from '../../render/palette';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { drawKeyHints, press } from '../widgets/clicks';
import { formatCredits } from '../widgets/statusBar';
import { TitleScreen } from './title';

export class GameOverScreen implements Screen {
  constructor(
    private readonly app: App,
    private readonly day: number,
    private readonly credits: number,
  ) {}

  render(t: Term): void {
    const ui = palette(this.app.data).ui;
    const lines = [
      'G A M E   O V E R',
      '',
      'Your last ship is destroyed, and you have no Clone Insurance.',
      `Day ${displayDay(this.day)}. Credits: ${formatCredits(this.credits)}.`,
    ];
    lines.forEach((l, i) => t.text(Math.floor((WIDTH - l.length) / 2), 14 + i, l, i === 0 ? ui.danger : ui.text));
    drawKeyHints(t, this.app.zones, Math.floor(WIDTH / 2) - 10, 21, [['Enter', 'Title screen', press('Enter')]], ui, this.app.press);
  }

  onKey(k: KeyInput): boolean {
    if (k.key === 'Enter' || k.key === 'Escape') this.app.reset(new TitleScreen(this.app));
    return true;
  }

  help(): string[] {
    return ['GAME OVER', '', 'Enter  Back to the title screen'];
  }
}
