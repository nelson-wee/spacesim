// Title screen (Section 17.1): New game with seed input, Continue, Help.
import { createGame } from '../../core/newGame';
import type { Term } from '../../render/display';
import { WIDTH } from '../../render/display';
import type { App, Screen } from '../app';
import { DigitInput, type KeyInput } from '../input';
import { HelpScreen } from './help';
import { SectorMapScreen } from './sectorMap';
import { palette } from '../../render/palette';

const TITLE = 'S P A C E   T R U C K I N G   S I M';

/** A seed for a new game. UI code only: the simulation never uses this. */
export function randomSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0] ?? 1) % 1_000_000_000;
}

export class TitleScreen implements Screen {
  private seedInput: DigitInput | null = null;
  private readonly proposedSeed = randomSeed();

  constructor(private readonly app: App) {}

  render(t: Term): void {
    const ui = palette(this.app.data).ui;
    const cx = (text: string) => Math.floor((WIDTH - text.length) / 2);
    const w = TITLE.length + 8;
    const x0 = Math.floor((WIDTH - w) / 2);
    t.box(x0, 7, w, 3, ui.border, undefined, undefined, 'modal');
    t.text(x0 + 4, 8, TITLE, ui.title);
    t.text(cx('(working title)'), 11, '(working title)', ui.dim);

    const menu: [string, string, boolean][] = [
      ['N', 'New game', true],
      ['C', 'Continue (save and load come in a later version)', false],
      ['H', 'Help', true],
    ];
    menu.forEach(([key, text, active], i) => {
      if (active) t.key(30, 18 + i * 2, ` ${key} `, ui.key, ui.keyBg);
      else t.text(30, 18 + i * 2, ` ${key} `, ui.dim);
      t.text(34, 18 + i * 2, text, active ? ui.bright : ui.dim);
      if (active && !this.seedInput) this.app.zones.add(30, 18 + i * 2, 4 + text.length, () => this.app.press({ key: key.toLowerCase(), shift: false, ctrl: false }));
    });

    if (this.seedInput) {
      t.box(25, 26, 50, 6, ui.border, 'New game', ui.title, 'modal');
      t.text(28, 28, 'Seed:', ui.text);
      const value = this.seedInput.value;
      t.text(34, 28, value.length > 0 ? `${value}_` : '_', ui.highlight);
      t.text(28, 29, `Enter: start. Empty seed: ${this.proposedSeed}`, ui.dim);
      t.text(28, 30, 'Esc: cancel', ui.dim);
    } else {
      t.text(cx(`Seed for a new game: ${this.proposedSeed}`), 27, `Seed for a new game: ${this.proposedSeed}`, ui.dim);
    }
  }

  onKey(k: KeyInput): boolean {
    const input = this.seedInput;
    if (input) {
      const result = input.handle(k);
      if (result === 'cancel') this.seedInput = null;
      if (result === 'enter') this.startGame(input.value.length > 0 ? Number(input.value) : this.proposedSeed);
      return true;
    }
    switch (k.key) {
      case 'n':
        this.seedInput = new DigitInput('', 10);
        return true;
      case 'h':
        this.app.push(new HelpScreen(this.app, this.help()));
        return true;
      case 'Escape':
        return true;
      default:
        return false;
    }
  }

  private startGame(seed: number): void {
    this.app.game = createGame(seed, this.app.data);
    this.app.reset(new SectorMapScreen(this.app));
  }

  help(): string[] {
    return [
      'SPACE TRUCKING SIM',
      '',
      'You are an independent captain with a small ship and a little',
      'money. Travel between sectors, trade, and build your fleet.',
      'In this version you can travel in a sector and jump between',
      'sectors. Travel uses time and fuel.',
      '',
      'TITLE SCREEN',
      'N        New game (type a seed, or press Enter for a random seed)',
      'H        Help',
      '',
      'The same seed always gives the same world.',
    ];
  }
}
