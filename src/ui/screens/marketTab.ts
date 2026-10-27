// Market tab (Section 17.4): the commodities that this location trades,
// grouped by tier, with Sells or Buys, price per unit and per tonne, the
// cargo held, and the best known sell price elsewhere.
import { fleetFreeTonnes, fleetUnitCost, fleetUnits } from '../../actor/cargo';
import { knowsLocation, priceView } from '../../actor/knowledge';
import type { Game } from '../../core/game';
import type { Location } from '../../core/types';
import { econContext } from '../../econ/context';
import { basePrice, buyPrice, sellPrice } from '../../econ/prices';
import type { Term } from '../../render/display';
import { byTier, tierMark } from '../../render/icons';
import { palette } from '../../render/palette';
import { report } from '../../services/common';
import { buy, buyLimit, commodityName, formatUnits, marketRole, sell } from '../../services/market';
import type { KeyInput } from '../input';
import { fit } from '../widgets/text';
import { type LocationTab, TAB_H, TAB_Y, type TabContext } from './tab';

const LIMIT_TEXT = { stock: 'stock', cargo: 'cargo space', credits: 'credits' } as const;

/** Best known sell price of a commodity at other locations, and where. */
export function bestKnownSell(game: Game, here: Location, commodity: string): { price: number; location: Location; jumps: number } | null {
  const actor = game.state.player;
  const jumps = econContext(game.state.world, game.data).sectorJumps[here.sectorId] ?? [];
  let best: { price: number; location: Location; jumps: number } | null = null;
  for (const loc of game.state.world.locations) {
    if (loc.id === here.id || !knowsLocation(actor, loc)) continue;
    const v = priceView(game, actor, loc, commodity);
    if (v.source === 'unknown') continue;
    if (!best || v.sell > best.price) best = { price: v.sell, location: loc, jumps: jumps[loc.sectorId] ?? 0 };
  }
  return best;
}

export class MarketTab implements LocationTab {
  readonly serviceId = 'market';
  readonly title = 'Market';
  private row = 0;
  private scroll = 0;

  private rows(ctx: TabContext): string[] {
    return byTier(ctx.game.data, Object.keys(ctx.location.market));
  }

  render(t: Term, ctx: TabContext): void {
    const { game, location } = ctx;
    const { data } = game;
    const ui = palette(data).ui;
    const actor = game.state.player;
    const rows = this.rows(ctx);
    this.row = Math.min(this.row, Math.max(0, rows.length - 1));
    const listH = TAB_H - 8;
    if (this.row < this.scroll) this.scroll = this.row;
    if (this.row >= this.scroll + listH) this.scroll = this.row - listH + 1;
    const head = ['T', 'Commodity', 'Role', '   Buy', '  Sell', ' Buy/t', '  Stock', '   Held', ' Paid', '  Best known sell'];
    const cols = [0, 2, 16, 22, 30, 38, 46, 55, 64, 71];
    head.forEach((h, i) => t.text(cols[i] as number, TAB_Y, h, ui.dim));
    rows.slice(this.scroll, this.scroll + listH).forEach((c, i) => {
      const y = TAB_Y + 1 + i;
      const sel = this.scroll + i === this.row;
      const bg = sel ? ui.selectBg : undefined;
      if (sel) t.fill(0, y, 100, 1, ui.selectBg);
      const entry = location.market[c];
      const com = data.commodityById.get(c);
      if (!entry || !com) return;
      const base = basePrice(data, c);
      const mark = tierMark(data, com.tier);
      const role = marketRole(location, c, data);
      const b = buyPrice(entry, base, data);
      const s = sellPrice(entry, base, data);
      const held = fleetUnits(actor, c);
      t.text(0, y, mark.letter, mark.color, bg);
      t.text(2, y, fit(com.name, 13), mark.color, bg);
      t.text(16, y, role === 'sells' ? 'Sells' : role === 'buys' ? 'Buys' : 'Hub', role === 'sells' ? ui.good : role === 'buys' ? ui.warning : ui.text, bg);
      t.text(22, y, String(Math.round(b)).padStart(6), ui.bright, bg);
      t.text(30, y, String(Math.round(s)).padStart(6), ui.bright, bg);
      t.text(38, y, String(Math.round(b / com.massPerUnit)).padStart(6), ui.text, bg);
      t.text(46, y, String(Math.floor(entry.stock)).padStart(7), ui.text, bg);
      t.text(55, y, (held > 0 ? formatUnits(Number(held.toFixed(1))) : '-').padStart(7), held > 0 ? ui.bright : ui.dim, bg);
      t.text(64, y, (held > 0 ? String(Math.round(fleetUnitCost(actor, c))) : '').padStart(5), ui.text, bg);
      const best = bestKnownSell(game, location, c);
      if (best) {
        const color = best.price > s ? ui.good : ui.dim;
        t.text(71, y, fit(`${Math.round(best.price)} ${best.location.name} ${best.jumps}j`, 28), color, bg);
      } else t.text(71, y, 'Unknown', ui.dim, bg);
    });

    // The selected commodity: limits and keys.
    const c = rows[this.row];
    let y = TAB_Y + listH + 2;
    const free = fleetFreeTonnes(actor, data);
    t.text(0, y, `Free cargo ${free.toFixed(1)} t`, ui.text);
    if (c) {
      const lim = buyLimit(actor, location, c, data);
      t.text(24, y, `${commodityName(data, c)}: you can buy ${lim.units} (limit: ${LIMIT_TEXT[lim.limitedBy]})`, ui.text);
    }
    y += 2;
    let x = 0;
    for (const [key, text] of [
      ['Up/Down', 'Select'],
      ['B', 'Buy 1'],
      ['Shift+B', 'Buy max'],
      ['S', 'Sell 1'],
      ['Shift+S', 'Sell all'],
    ] as const) {
      x = t.key(x, y, key, ui.key, ui.keyBg);
      x = t.text(x, y, ` ${text}   `, ui.text);
    }
  }

  onKey(k: KeyInput, ctx: TabContext): boolean {
    const { game, location } = ctx;
    const rows = this.rows(ctx);
    const c = rows[this.row];
    const actor = game.state.player;
    switch (k.key) {
      case 'ArrowUp':
        this.row = Math.max(0, this.row - 1);
        return true;
      case 'ArrowDown':
        this.row = Math.min(rows.length - 1, this.row + 1);
        return true;
      case 'b':
        if (c) report(game, buy(game, actor, location, c, k.shift ? Number.MAX_SAFE_INTEGER : 1));
        return true;
      case 's':
        if (c) report(game, sell(game, actor, location, c, k.shift ? fleetUnits(actor, c) : Math.min(1, fleetUnits(actor, c))));
        return true;
      default:
        return false;
    }
  }

  help(): string[] {
    return [
      'MARKET',
      '',
      'Up/Down   Select a commodity',
      'B         Buy 1 unit;  Shift+B buy as much as you can',
      'S         Sell 1 unit; Shift+S sell all',
      '',
      'Sells: this location makes it. Buys: this location needs it.',
      'Each unit you buy makes the next unit dearer; each unit you',
      'sell makes the next one cheaper. A buy is limited by credits,',
      'free cargo space, and stock. A sale pays a debt first.',
    ];
  }
}
