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
import { palette, styleColor, techColor } from '../../render/palette';
import { displayDay } from '../../core/clock';
import { midPrice } from '../../econ/prices';
import { travelStats } from '../../ship/stats';

type Mode = 'menu' | 'teleport' | 'skip' | 'art' | 'prices' | 'ship';

const ART_PAGES = ['Battle art 1', 'Battle art 2', 'Portraits (slot numbers shown)', 'Portraits, damaged', 'Portraits, critical', 'Module icons'];
const MODULE_PAGE = 5;
/** Ships on each battle art page. */
const BATTLE_PAGE_SPLIT = 6;

export class DebugScreen implements Screen {
  readonly overlay = true;
  private mode: Mode = 'menu';
  private input = new DigitInput('', 4);
  private artPage = 0;
  private pricePage = 0;

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
        ['8', 'Show all prices'],
        ['9', 'Flagship derived stats'],
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
    if (this.mode === 'prices') {
      const pages = this.renderPrices(t, x + 2, y + 4, h - 8);
      t.text(x + 2, y + h - 2, `Page ${this.pricePage + 1}/${pages}   Left/Right: page   Esc: back`, ui.highlight);
      return;
    }
    if (this.mode === 'ship') {
      // M3-TOOL-06: all derived stats of the flagship.
      const ship = game.state.player.fleet[game.state.player.flagshipIndex];
      if (ship) {
        t.text(x + 2, y + 4, `${ship.name} (${ship.hullId})`, ui.title);
        const stats = Object.entries(travelStats(ship, game.data));
        const perCol = h - 9;
        stats.forEach(([key, value], i) => {
          const text = `${key.padEnd(16)} ${typeof value === 'number' ? Number(value.toFixed(3)) : String(value)}`;
          t.text(x + 2 + Math.floor(i / perCol) * 30, y + 6 + (i % perCol), text, ui.text, undefined, 29);
        });
      }
      t.text(x + 2, y + h - 2, 'Esc: back', ui.highlight);
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
    if (this.mode === 'prices') {
      const pages = Math.max(1, Math.ceil(game.state.world.locations.length / this.priceRows()));
      if (k.key === 'ArrowRight') this.pricePage = (this.pricePage + 1) % pages;
      else if (k.key === 'ArrowLeft') this.pricePage = (this.pricePage + pages - 1) % pages;
      else if (k.key === 'Escape') this.mode = 'menu';
      return true;
    }
    if (this.mode === 'ship') {
      if (k.key === 'Escape') this.mode = 'menu';
      return true;
    }
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
      case '8':
        this.mode = 'prices';
        this.pricePage = 0;
        return true;
      case '9':
        this.mode = 'ship';
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

  /** Location rows on one page of the price table. */
  private priceRows(): number {
    return HEIGHT - 6 - 8 - 3;
  }

  /**
   * Mid prices of all commodities at all locations (M2-TOOL-08). Colors show
   * the price against the base price. Returns the number of pages.
   */
  private renderPrices(t: Term, x0: number, y0: number, height: number): number {
    const { data, state } = this.game;
    const { world } = state;
    const ui = palette(data).ui;
    const rows = this.priceRows();
    const pages = Math.max(1, Math.ceil(world.locations.length / rows));
    const nameW = 15;
    const colW = 6;
    t.text(x0, y0, `Day ${displayDay(state.day)}. Mid price; - = not traded.`, ui.dim);
    t.text(x0 + 40, y0, 'x0.75 or less', ui.good);
    t.text(x0 + 55, y0, 'x1.25 or more', ui.warning);
    t.text(x0 + 70, y0, 'x2 or more', ui.danger);
    data.commodities.forEach((c, i) => t.text(x0 + nameW + i * colW, y0 + 2, c.name.replace(/ /g, '').slice(0, colW - 1), ui.dim));
    world.locations.slice(this.pricePage * rows, (this.pricePage + 1) * rows).forEach((loc, r) => {
      if (r >= height - 3) return;
      const y = y0 + 3 + r;
      const dev = world.sectors[loc.sectorId]?.development ?? 'core';
      t.text(x0, y, `${dev[0]?.toUpperCase()} ${loc.name}`, ui.text, undefined, nameW - 1);
      data.commodities.forEach((c, i) => {
        const entry = loc.market[c.id];
        const cx = x0 + nameW + i * colW;
        if (!entry) {
          t.text(cx, y, '    -', ui.dim);
          return;
        }
        const price = midPrice(entry, c.basePrice, data);
        const factor = price / c.basePrice;
        const color = factor >= 2 ? ui.danger : factor >= 1.25 ? ui.warning : factor <= 0.75 ? ui.good : ui.text;
        t.text(cx, y, String(Math.round(price)).padStart(colW - 1), color);
      });
    });
    return pages;
  }

  /** Ship art from data/art/ships.json, for a visual check of the Claude Design import. */
  private renderArt(t: Term, x0: number, y0: number): void {
    const data = this.game.data;
    const ui = palette(data).ui;
    const ships = Object.entries(data.art.ships.ships);
    if (this.artPage === MODULE_PAGE) {
      this.renderModuleIcons(t, x0, y0);
      return;
    }
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

  /**
   * Module icons from data/art/modules.json: family mark, two glyphs, size,
   * and tier (M3 uses them in the Outfitter), and the four module states.
   */
  private renderModuleIcons(t: Term, x0: number, y0: number): void {
    const data = this.game.data;
    const ui = palette(data).ui;
    const art = data.art.modules;
    const color = (name: string) => styleColor(data.art.style, name);
    t.text(x0, y0, 'Icon: mark + glyph(2) + size + tier.  Tier 1/2/3 in tech colors.', ui.dim);
    art.modules.forEach((m, i) => {
      const x = x0 + Math.floor(i / 12) * 44;
      const y = y0 + 2 + (i % 12);
      const family = art.families[m.family];
      t.text(x, y, family?.mark ?? ' ', color(family?.fg ?? 'dim'));
      t.text(x + 1, y, m.glyph, color(m.fg));
      t.text(x + 3, y, m.default_size, ui.bright);
      t.text(x + 4, y, String((i % 3) + 1), techColor(data, (i % 3) + 1));
      t.text(x + 6, y, m.short, ui.text, undefined, 12);
      t.text(x + 19, y, m.id, ui.dim, undefined, 24);
    });
    const sy = y0 + 15;
    t.text(x0, sy, 'States (Pulse Laser):', ui.dim);
    const laser = art.modules.find((m) => m.id === 'pulse_laser');
    Object.entries(art.states).forEach(([name, s], i) => {
      const x = x0 + i * 20;
      t.text(x, sy + 1, s.glyph, color(s.fg));
      if (laser) t.text(x + 2, sy + 1, laser.glyph, color(s.icon_fg ?? laser.fg));
      t.text(x + 5, sy + 1, name, ui.text);
    });
  }

  help(): string[] {
    return ['DEBUG PANEL', '', 'Number keys run the actions. Esc closes the panel.'];
  }
}
