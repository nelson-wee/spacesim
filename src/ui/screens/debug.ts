// Debug panel (Section 4.3). main.ts loads this file only in development builds (G-16).
import {
  debugAddCredits,
  debugSetFuel,
  debugSkipDays,
  debugTeleport,
} from '../../debug/debugPanel';
import type { Game } from '../../core/game';
import type { Term } from '../../render/display';
import { HEIGHT, WIDTH } from '../../render/display';
import type { App, Screen } from '../app';
import { DigitInput, type KeyInput } from '../input';

type Mode = 'menu' | 'teleport' | 'skip';

export class DebugScreen implements Screen {
  readonly overlay = true;
  private mode: Mode = 'menu';
  private input = new DigitInput('', 4);

  constructor(private readonly app: App) {}

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  render(t: Term): void {
    const game = this.game;
    const ui = game.data.art.palette.ui;
    const x = 4;
    const y = 3;
    const w = WIDTH - 8;
    const h = HEIGHT - 6;
    t.box(x, y, w, h, ui.warning, 'DEBUG (development build only)', ui.warning);
    t.text(x + 2, y + 2, `Seed ${game.state.seed}   World seed used ${game.state.world.generator.seedUsed}`, ui.bright);
    if (this.mode === 'menu') {
      const items = [
        ['1', 'Add 10,000 credits'],
        ['2', 'Fill fuel on all ships'],
        ['3', 'Set fuel to 0 on all ships (test the tow)'],
        ['4', 'Set fuel to 10% on all ships'],
        ['5', 'Teleport to a location'],
        ['6', 'Skip N days'],
        ['Esc', 'Close'],
      ];
      items.forEach(([key, text], i) => {
        t.text(x + 2, y + 4 + i, key ?? '', ui.key);
        t.text(x + 8, y + 4 + i, text ?? '', ui.text);
      });
      return;
    }
    if (this.mode === 'teleport') {
      const { world } = game.state;
      const perColumn = h - 8;
      world.locations.forEach((loc, i) => {
        const col = Math.floor(i / perColumn);
        const row = i % perColumn;
        const sector = world.sectors[loc.sectorId]?.name ?? '?';
        t.text(x + 2 + col * 30, y + 4 + row, `${String(loc.id).padStart(2)} ${loc.name} (${sector})`, ui.text, undefined, 29);
      });
      t.text(x + 2, y + h - 3, `Location number: ${this.input.value}_   Enter: go   Esc: back`, ui.highlight);
      return;
    }
    t.text(x + 2, y + 4, `Days to skip: ${this.input.value}_   Enter: skip   Esc: back`, ui.highlight);
  }

  onKey(k: KeyInput): boolean {
    const game = this.game;
    const player = game.state.player;
    if (this.mode !== 'menu') {
      const result = this.input.handle(k);
      if (result === 'cancel') this.mode = 'menu';
      if (result === 'enter') {
        const n = Number(this.input.value);
        if (this.input.value.length > 0 && this.mode === 'teleport' && game.state.world.locations[n]) {
          debugTeleport(game, player, n);
          this.app.pop();
        } else if (this.input.value.length > 0 && this.mode === 'skip' && n > 0) {
          debugSkipDays(game, n);
          this.app.pop();
        }
      }
      return true;
    }
    switch (k.key) {
      case '1':
        debugAddCredits(game, player, 10000);
        return true;
      case '2':
        debugSetFuel(game, player, 1);
        return true;
      case '3':
        debugSetFuel(game, player, 0);
        return true;
      case '4':
        debugSetFuel(game, player, 0.1);
        return true;
      case '5':
        this.mode = 'teleport';
        this.input = new DigitInput('', 3);
        return true;
      case '6':
        this.mode = 'skip';
        this.input = new DigitInput('', 4);
        return true;
      case 'F12':
      case '`':
      case '~':
        this.app.pop();
        return true;
      default:
        return false;
    }
  }

  help(): string[] {
    return ['DEBUG PANEL', '', 'Number keys run the actions. Esc closes the panel.'];
  }
}
