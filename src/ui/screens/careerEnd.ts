// Career end screen (Section 16, M7-CAR-06): the summary, the title, and the seed.
import { careerSummary } from '../../career/career';
import type { Game } from '../../core/game';
import type { CareerEnd } from '../../core/types';
import type { Term } from '../../render/display';
import { WIDTH } from '../../render/display';
import { palette } from '../../render/palette';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { clearSave } from '../saveStore';
import { drawKeyHints, press } from '../widgets/clicks';
import { TitleScreen } from './title';

export class CareerEndScreen implements Screen {
  private readonly lines: string[];
  private readonly seed: number;

  constructor(
    private readonly app: App,
    game: Game,
    private readonly end: CareerEnd,
  ) {
    this.lines = careerSummary(game, end);
    this.seed = game.state.seed;
    // The career is over: the save slot is free for a new career.
    clearSave();
  }

  render(t: Term): void {
    const ui = palette(this.app.data).ui;
    const head = 'C A R E E R   E N D';
    t.text(Math.floor((WIDTH - head.length) / 2), 2, head, ui.title);
    const title = [this.end.title, ...this.end.secondTitles].join(', ');
    t.text(Math.floor((WIDTH - title.length) / 2), 4, title, ui.highlight);
    this.lines.slice(0, 30).forEach((l, i) => t.text(20, 6 + i, l, i === 0 ? ui.bright : ui.text, undefined, 78));
    t.text(20, 37, `Seed: ${this.seed}`, ui.dim);
    drawKeyHints(t, this.app.zones, 20, 38, [['Enter', 'Title screen', press('Enter')]], ui, this.app.press);
  }

  onKey(k: KeyInput): boolean {
    if (k.key === 'Enter' || k.key === 'Escape') {
      this.app.game = null;
      this.app.reset(new TitleScreen(this.app));
    }
    return true;
  }

  help(): string[] {
    return ['CAREER END', '', 'Enter  Back to the title screen'];
  }
}
