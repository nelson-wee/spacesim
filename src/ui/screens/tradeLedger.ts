// Trade Ledger (Section 17.6). It uses only the player's information (Section 9.12).
// - Price table: rows are commodities by tier; columns are known locations,
//   sorted by jumps from the player. Each cell: the price (the buy price where
//   the location sells it, else the sell price), a color for the difference
//   from the region average, and a trend arrow if known.
// - Filters: tier, distance (1, 2, 3 jumps, all), "goods sold here".
// - Route planner: start (A marks it; default: here) and the destination under
//   the cursor, for the commodity under the cursor. Or the best routes.
// - Chain alerts and the information age of each column.
import { knowsLocation, priceView } from '../../actor/knowledge';
import { bestRoutes, type RouteValue, routeValue } from '../../actor/routes';
import { displayDay } from '../../core/clock';
import type { Game } from '../../core/game';
import type { Location } from '../../core/types';
import { econContext } from '../../econ/context';
import type { Term } from '../../render/display';
import { HEIGHT } from '../../render/display';
import { byTier, TIER_ORDER, tierMark } from '../../render/icons';
import { palette } from '../../render/palette';
import { commodityName, marketRole } from '../../services/market';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { drawStatusBar } from '../widgets/statusBar';
import { drawKeyHints, press } from '../widgets/clicks';
import { fit } from '../widgets/text';

const NAME_W = 13;
const COL_W = 7;
const TABLE_Y = 5;
const ARROW = { up: '↑', down: '↓', flat: ' ' } as const;
const LIMIT = { cargo: 'cargo-limited', capital: 'capital-limited', stock: 'stock-limited', margin: 'margin-limited' } as const;

export class TradeLedgerScreen implements Screen {
  private tier: number | null = null;
  private maxJumps: number | null = null;
  private soldHere = false;
  private row = 0;
  private col = 0;
  private colScroll = 0;
  private startId: number | null = null;
  private best: RouteValue[] | null = null;

  constructor(private readonly app: App) {}

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  private here(): Location | null {
    const p = this.game.state.player.position;
    return p.kind === 'docked' ? (this.game.state.world.locations[p.locationId] as Location) : null;
  }

  private hereSector(): number {
    const g = this.game;
    const p = g.state.player.position;
    if (p.kind === 'docked') return (g.state.world.locations[p.locationId] as Location).sectorId;
    if (p.kind === 'jumpPoint') return g.state.world.jumpPoints[p.jumpPointId]?.sectorId ?? 0;
    return p.sectorId;
  }

  private columns(): { loc: Location; jumps: number }[] {
    const g = this.game;
    const actor = g.state.player;
    const row = econContext(g.state.world, g.data).sectorJumps[this.hereSector()] ?? [];
    return g.state.world.locations
      .filter((l) => knowsLocation(actor, l) && (actor.knowledge.markets[l.id] || this.here()?.id === l.id))
      .map((loc) => ({ loc, jumps: row[loc.sectorId] ?? 99 }))
      .filter((c) => this.maxJumps === null || c.jumps <= this.maxJumps)
      .sort((a, b) => a.jumps - b.jumps || a.loc.id - b.loc.id);
  }

  private rows(): string[] {
    const g = this.game;
    const here = this.here();
    let ids = g.data.commodities.map((c) => c.id);
    if (this.tier !== null) ids = ids.filter((id) => g.data.commodityById.get(id)?.tier === TIER_ORDER[this.tier as number]);
    if (this.soldHere && here) ids = ids.filter((id) => here.market[id] && marketRole(here, id, g.data) !== 'buys');
    return byTier(g.data, ids);
  }

  render(t: Term): void {
    const game = this.game;
    const { data } = game;
    const ui = palette(data).ui;
    const actor = game.state.player;
    drawStatusBar(t, game);
    const cols = this.columns();
    const rows = this.rows();
    this.row = Math.min(this.row, Math.max(0, rows.length - 1));
    this.col = Math.min(this.col, Math.max(0, cols.length - 1));
    const visible = Math.floor((100 - NAME_W) / COL_W);
    if (this.col < this.colScroll) this.colScroll = this.col;
    if (this.col >= this.colScroll + visible) this.colScroll = this.col - visible + 1;
    const shown = cols.slice(this.colScroll, this.colScroll + visible);

    const filters = `Tier ${this.tier === null ? 'all' : TIER_ORDER[this.tier]}   Distance ${this.maxJumps === null ? 'all' : `${this.maxJumps} jumps`}   ${this.soldHere ? 'Goods sold here' : 'All goods'}`;
    t.text(0, 2, 'Trade Ledger', ui.title);
    t.text(16, 2, filters, ui.dim);
    // Column heads: name, jumps, information age.
    shown.forEach((c, i) => {
      const x = NAME_W + i * COL_W;
      const sel = this.colScroll + i === this.col;
      const isStart = this.startId === c.loc.id;
      t.text(x, 3, fit(c.loc.name, COL_W - 1), isStart ? ui.good : sel ? ui.bright : ui.text, sel ? ui.selectBg : undefined);
      const v = priceView(game, actor, c.loc, 'hydrogen');
      const age = v.source === 'live' ? 'now' : `D${displayDay(actor.knowledge.markets[c.loc.id]?.day ?? 0)}`;
      t.text(x, 4, fit(`${c.jumps}j ${age}`, COL_W - 1), v.source === 'live' ? ui.good : ui.dim);
      this.app.zones.add(x, 3, COL_W - 1, () => this.moveTo(null, this.colScroll + i), 2);
    });
    const tableH = 15;
    rows.slice(0, tableH).forEach((c, r) => {
      const y = TABLE_Y + r;
      const com = data.commodityById.get(c);
      if (!com) return;
      const mark = tierMark(data, com.tier);
      const selRow = r === this.row;
      t.text(0, y, mark.letter, mark.color);
      t.text(2, y, fit(com.name, NAME_W - 3), mark.color, selRow ? ui.selectBg : undefined);
      this.app.zones.add(0, y, NAME_W - 1, () => this.moveTo(r, null));
      const views = cols.map((col) => ({ col, v: priceView(game, actor, col.loc, c) })).filter((x) => x.v.source !== 'unknown');
      const avg = views.length ? views.reduce((s, x) => s + x.v.mid, 0) / views.length : 0;
      shown.forEach((col, i) => {
        const x = NAME_W + i * COL_W;
        const v = priceView(game, actor, col.loc, c);
        const sel = selRow && this.colScroll + i === this.col;
        const bg = sel ? ui.selectBg : undefined;
        this.app.zones.add(x, y, COL_W - 1, () => this.moveTo(r, this.colScroll + i));
        if (v.source === 'unknown') {
          t.text(x, y, '   -  ', ui.dim, bg);
          return;
        }
        const sells = marketRole(col.loc, c, data) === 'sells';
        const price = sells ? v.buy : v.sell;
        const diff = avg > 0 ? v.mid / avg - 1 : 0;
        const color = diff <= -0.15 ? ui.good : diff >= 0.15 ? ui.danger : ui.text;
        t.text(x, y, `${sells ? '+' : ' '}${String(Math.round(price)).padStart(4)}`, color, bg);
        t.text(x + 5, y, v.trend ? ARROW[v.trend] : ' ', v.trend === 'up' ? ui.danger : ui.good, bg);
      });
    });

    // Route planner, or the best routes.
    let y = TABLE_Y + tableH + 1;
    t.hline(y - 1, 0, 99, '─', ui.border);
    const here = this.here();
    const start = this.startId !== null ? (game.state.world.locations[this.startId] as Location) : here;
    const dest = cols[this.col]?.loc;
    const commodity = rows[this.row];
    if (this.best) {
      t.text(0, y++, `Best known routes by profit per day (${this.startId === null ? 'any start within 3 jumps' : `from ${start?.name}`}):`, ui.title);
      if (this.best.length === 0) t.text(0, y++, 'No profitable route is known.', ui.dim);
      for (const r of this.best) y = this.routeLine(t, y, r);
    } else if (start && dest && commodity) {
      t.text(0, y++, `Route: ${commodityName(data, commodity)} from ${start.name} to ${dest.name}`, ui.title);
      const r = routeValue(game, actor, start, dest, commodity);
      if (!r) t.text(0, y++, start.id === dest.id ? 'Select a different destination.' : 'No profit, or a price is unknown.', ui.dim);
      else {
        t.text(0, y++, `Margin ${r.marginPerTonne.toFixed(1)} cr/t   Units ${r.units}   Buy ${Math.round(r.buyCost)} cr   Profit ${Math.round(r.profit)} cr   Full hold ${Math.round(r.fullHoldProfit)} cr`, ui.text);
        t.text(0, y++, `Fuel ${Math.round(r.fuelCost)} cr   Trip ${r.days.toFixed(1)} days   Profit per day ${Math.round(r.profitPerDay)} cr   ${LIMIT[r.limitedBy]}${r.fuelOk ? '' : '   FUEL RANGE!'}`, r.profitPerDay > 0 ? ui.good : ui.danger);
      }
    } else t.text(0, y++, 'Dock at a location, or mark a start (A), to plan a route.', ui.dim);

    // Chain alerts.
    y = Math.max(y + 1, TABLE_Y + tableH + 8);
    const k = actor.knowledge;
    t.text(0, y++, `Chain alerts${k.alertsDay !== null ? ` (Merchants' Guild, day ${displayDay(k.alertsDay)})` : ''}`, ui.dim);
    const room = HEIGHT - 2 - y;
    if (k.alerts.length === 0) t.text(0, y++, 'None known.', ui.dim);
    for (const a of k.alerts.slice(0, room)) t.text(2, y++, fit(a.text, 97), ui.warning);

    drawKeyHints(
      t,
      this.app.zones,
      0,
      HEIGHT - 1,
      [
        ['I', 'Tier', press('i')],
        ['D', 'Distance', press('d')],
        ['G', 'Sold here', press('g')],
        ['A', 'Start', press('a')],
        ['B', 'Best routes', press('b')],
        ['Esc', 'Back', press('Escape')],
      ],
      ui,
      this.app.press,
      2,
    );
    t.text(78, HEIGHT - 1, 'Arrows/click: cursor', ui.dim);
  }

  /** Moves the cursor (a click). A null keeps that coordinate. The planner shows again. */
  private moveTo(row: number | null, col: number | null): void {
    if (row !== null) this.row = row;
    if (col !== null) this.col = col;
    this.best = null;
  }

  private routeLine(t: Term, y: number, r: RouteValue): number {
    const g = this.game;
    const ui = palette(g.data).ui;
    const from = g.state.world.locations[r.fromId]?.name ?? '?';
    const to = g.state.world.locations[r.toId]?.name ?? '?';
    const text = `${fit(commodityName(g.data, r.commodity), 12)} ${fit(`${from} -> ${to}`, 24)} ${String(r.units).padStart(4)} u  profit ${String(Math.round(r.profit)).padStart(6)}  fuel ${String(Math.round(r.fuelCost)).padStart(4)}  ${r.days.toFixed(1).padStart(5)} d  ${String(Math.round(r.profitPerDay)).padStart(5)}/day  ${r.limitedBy}`;
    t.text(0, y, fit(text, 100), ui.text);
    // A click on a best route opens it in the planner: its start, commodity, and destination.
    this.app.zones.add(0, y, 100, () => {
      const rows = this.rows();
      const cols = this.columns();
      this.startId = r.fromId;
      this.moveTo(Math.max(0, rows.indexOf(r.commodity)), Math.max(0, cols.findIndex((c) => c.loc.id === r.toId)));
    });
    return y + 1;
  }

  onKey(k: KeyInput): boolean {
    const cols = this.columns();
    const rows = this.rows();
    if (k.key !== 'b' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'i', 'd', 'g', 'a'].includes(k.key)) this.best = null;
    switch (k.key) {
      case 'ArrowUp':
        this.row = Math.max(0, this.row - 1);
        return true;
      case 'ArrowDown':
        this.row = Math.min(rows.length - 1, this.row + 1);
        return true;
      case 'ArrowLeft':
        this.col = Math.max(0, this.col - 1);
        return true;
      case 'ArrowRight':
        this.col = Math.min(cols.length - 1, this.col + 1);
        return true;
      case 'i':
        this.tier = this.tier === null ? 0 : this.tier + 1 >= TIER_ORDER.length ? null : this.tier + 1;
        return true;
      case 'd':
        this.maxJumps = this.maxJumps === null ? 1 : this.maxJumps >= 3 ? null : this.maxJumps + 1;
        return true;
      case 'g':
        this.soldHere = !this.soldHere;
        return true;
      case 'a': {
        const c = cols[this.col]?.loc;
        this.startId = c && this.startId !== c.id ? c.id : null;
        return true;
      }
      case 'b': {
        const g = this.game;
        const hereId = this.startId ?? this.here()?.id;
        this.best = hereId === undefined ? [] : bestRoutes(g, g.state.player, { hereId, fromHere: this.startId !== null, maxJumps: 3, limit: 5 });
        return true;
      }
      case 't':
        this.app.pop();
        return true;
      default:
        return false;
    }
  }

  help(): string[] {
    return [
      'TRADE LEDGER',
      '',
      'Arrows   Move the cursor (commodity and location)',
      'I        Filter by tier          D   Filter by distance',
      'G        Only goods sold here    A   Mark the start of a route',
      'B        The 5 best known routes by profit per day',
      'Click    A cell, a commodity, or a location moves the cursor.',
      '         A best route opens it in the route planner.',
      '',
      'A cell shows the buy price (+) where the location makes the',
      'commodity, else its sell price. Green: below the average of',
      'known prices; red: above it. Arrows: 14-day trend from a',
      "Merchants' Guild. Under each name: jumps and the day of the",
      'information ("now" for live prices).',
      'The planner uses your free cargo space, your credits, the fuel',
      'of all ships, and the speed of the slowest ship.',
    ];
  }
}
