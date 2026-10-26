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
import { type DamageState, type DrawArtOptions, drawArt } from '../../render/shipArt';
import { palette } from '../../render/palette';

type Mode = 'menu' | 'teleport' | 'skip' | 'art';

const ART_PAGES = ['Battle art 1', 'Battle art 2', 'Portraits (slot numbers shown)', 'Portraits, damaged', 'Portraits, critical'];
/** Ships on each battle art page. */
const BATTLE_PAGE_SPLIT = 6;

export class DebugScreen implements Screen {
  readonly overlay = true;
  private mode: Mode = 'menu';
  private input = new DigitInput('', 4);
  private artPage = 0;

  constructor(private readonly app: App) {}

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  render(t: Term): void {
    const game = this.game;
    const ui = palette(game.data).ui;
    const x = 4;
    const y = 3;
    const w = WIDTH - 8;
    const h = HEIGHT - 6;
    t.box(x, y, w, h, ui.warning, 'DEBUG (development build only)', ui.warning, 'modal');
    t.text(x + 2, y + 2, `Seed ${game.state.seed}   World seed used ${game.state.world.generator.seedUsed}`, ui.bright);
    if (this.mode === 'menu') {
      const items = [
        ['1', 'Add 10,000 credits'],
        ['2', 'Fill fuel on all ships'],
        ['3', 'Set fuel to 0 on all ships (test the tow)'],
        ['4', 'Set fuel to 10% on all ships'],
        ['5', 'Teleport to a location'],
        ['6', 'Skip N days'],
        ['7', 'Ship art gallery'],
        ['Esc', 'Close'],
      ];
      items.forEach(([key, text], i) => {
        t.key(x + 2, y + 4 + i, key ?? '', ui.key, ui.keyBg);
        t.text(x + 8, y + 4 + i, text ?? '', ui.text);
      });
      return;
    }
    if (this.mode === 'art') {
      this.renderArt(t, x + 2, y + 4);
      t.text(x + 2, y + h - 2, `Page ${this.artPage + 1}/${ART_PAGES.length}: ${ART_PAGES[this.artPage]}   Left/Right: page   Esc: back`, ui.highlight);
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
    if (this.mode === 'art') {
      if (k.key === 'ArrowRight') this.artPage = (this.artPage + 1) % ART_PAGES.length;
      else if (k.key === 'ArrowLeft') this.artPage = (this.artPage + ART_PAGES.length - 1) % ART_PAGES.length;
      else if (k.key === 'Escape') this.mode = 'menu';
      return true;
    }
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
      case '7':
        this.mode = 'art';
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

  /** Ship art from data/art/ships.json, for a visual check of the Claude Design import. */
  private renderArt(t: Term, x0: number, y0: number): void {
    const data = this.game.data;
    const ui = palette(data).ui;
    const ships = Object.entries(data.art.ships.ships);
    if (this.artPage <= 1) {
      const cols: [string, DrawArtOptions][] = [
        ['player', { side: 'player' }],
        ['damaged', { side: 'player', state: 'damaged' }],
        ['critical', { side: 'player', state: 'critical' }],
        ['hot', { side: 'player', hot: true }],
        ['pirate, mirror', { side: 'pirate', mirrored: true }],
      ];
      const colW = 17;
      cols.forEach(([label], c) => t.text(x0 + c * colW, y0, label, ui.dim, undefined, colW - 1));
      const page = this.artPage === 0 ? ships.slice(0, BATTLE_PAGE_SPLIT) : ships.slice(BATTLE_PAGE_SPLIT);
      let y = y0 + 2;
      for (const [id, art] of page) {
        t.text(x0, y, `${id} ${art.battle.width}x${art.battle.height}`, ui.text);
        cols.forEach(([, opts], c) => drawArt(t, data, art.battle, x0 + c * colW, y + 1, opts));
        y += art.battle.height + 2;
      }
      return;
    }
    const state: DamageState = this.artPage === 3 ? 'damaged' : this.artPage === 4 ? 'critical' : 'normal';
    // Three portraits in each row; each row is as high as its tallest portrait.
    const rowY: number[] = [y0];
    for (let r = 0; r * 3 < ships.length; r++) {
      const tallest = Math.max(...ships.slice(r * 3, r * 3 + 3).map(([, a]) => a.portrait.height));
      rowY.push((rowY[r] ?? y0) + tallest + 2);
    }
    ships.forEach(([id, art], i) => {
      const x = x0 + (i % 3) * 30;
      const y = rowY[Math.floor(i / 3)] ?? y0;
      t.text(x, y, `${id} (${art.portrait.slotCount} slots)`, ui.dim, undefined, 29);
      drawArt(t, data, art.portrait, x, y + 1, { side: 'player', state });
      if (this.artPage === 2) {
        art.portrait.slots.forEach((row, j) =>
          Array.from(row).forEach((ch, k) => {
            if (ch !== ' ') t.put(x + k, y + 1 + j, ch, ui.key, ui.keyBg);
          }),
        );
      }
    });
  }

  help(): string[] {
    return ['DEBUG PANEL', '', 'Number keys run the actions. Esc closes the panel.'];
  }
}
