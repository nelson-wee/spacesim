// Small Location tabs: Refuel, Mechanic, Shipyard, Merchants' Guild, Bounty Guild.
import { observe } from '../../actor/knowledge';
import { displayDay } from '../../core/clock';
import type { Term } from '../../render/display';
import { palette } from '../../render/palette';
import { report } from '../../services/common';
import { quoteRepair, repair } from '../../services/mechanic';
import { quoteRefuel, refuel } from '../../services/refuel';
import { buyHull, hullOffers, quoteHull, tradeInValue } from '../../services/shipyard';
import { travelStats } from '../../ship/stats';
import type { KeyInput } from '../input';
import { drawKeyHints, press } from '../widgets/clicks';
import { formatCredits } from '../widgets/statusBar';
import { fit } from '../widgets/text';
import { type LocationTab, TAB_H, TAB_Y, type TabContext } from './tab';

function keys(t: Term, ctx: TabContext, list: [string, string, KeyInput][]): void {
  drawKeyHints(t, ctx.zones, 0, TAB_Y + TAB_H - 1, list, palette(ctx.game.data).ui, ctx.press);
}

export class RefuelTab implements LocationTab {
  readonly serviceId = 'refuel';
  readonly title = 'Refuel';

  render(t: Term, ctx: TabContext): void {
    const { game, location } = ctx;
    const ui = palette(game.data).ui;
    const actor = game.state.player;
    const q = quoteRefuel(game, actor, location);
    let y = TAB_Y;
    t.text(0, y++, `Fuel price ${q.unitPrice.toFixed(2)} cr per unit (local Hydrogen buy price / ${game.data.balance.fuel.fuelPerHydrogen}).`, ui.text);
    t.text(0, y++, `Hydrogen stock: ${Math.floor(location.market.hydrogen?.stock ?? 0)} units. Refuel uses this stock.`, ui.dim);
    y++;
    for (const ship of actor.fleet) {
      const cap = travelStats(ship, game.data).fuelCapacity;
      t.text(0, y++, `${fit(ship.name, 20)} ${ship.fuel.toFixed(1)} / ${cap}`, ui.text);
    }
    y++;
    if (q.units <= 1e-9) t.text(0, y, 'All tanks are full.', ui.good);
    else {
      t.text(0, y++, `Fill all tanks: ${q.units.toFixed(1)} fuel for ${formatCredits(q.cost)}.`, ui.bright);
      if (q.affordable < q.units - 1e-6) t.text(0, y, `You can buy ${q.affordable.toFixed(1)} fuel now.`, ui.warning);
    }
    keys(t, ctx, [['R', 'Refuel all ships', press('r')]]);
  }

  onKey(k: KeyInput, { game, location }: TabContext): boolean {
    if (k.key !== 'r') return false;
    report(game, refuel(game, game.state.player, location));
    return true;
  }

  help(): string[] {
    return ['REFUEL', '', 'R   Fill the tanks of all fleet ships.', '', 'One Hydrogen unit gives 2 fuel units. The price follows', 'the local Hydrogen price, unit by unit.'];
  }
}

export class MechanicTab implements LocationTab {
  readonly serviceId = 'mechanic';
  readonly title = 'Mechanic';
  private ship = 0;

  render(t: Term, ctx: TabContext): void {
    const { game } = ctx;
    const { data } = game;
    const ui = palette(data).ui;
    const actor = game.state.player;
    const p = data.serviceRules.mechanic;
    let y = TAB_Y;
    t.text(0, y++, `Price per point: hull ${p.hullPerPoint} cr, engine ${p.enginePerPoint} cr, armor ${p.armorPerPoint} cr.`, ui.dim);
    y++;
    actor.fleet.forEach((ship, i) => {
      const s = travelStats(ship, data);
      const q = quoteRepair(ship, data);
      const bg = i === this.ship ? ui.selectBg : undefined;
      if (bg) t.fill(0, y, 100, 1, bg);
      ctx.zones.add(0, y, 100, () => {
        this.ship = i;
      });
      t.text(0, y, fit(ship.name, 20), ui.bright, bg);
      t.text(21, y, `Hull ${Math.round(ship.hullHp)}/${s.maxHullHp}  Engine ${ship.engineValue.toFixed(0)}/${s.maxEngineValue}  Armor ${Math.round(ship.armorHp)}/${s.maxArmorHp}`, ui.text, bg);
      t.text(80, y, q.cost > 0 ? formatCredits(q.cost) : 'No repair', q.cost > 0 ? ui.warning : ui.good, bg);
      y++;
    });
    y++;
    t.text(0, y, 'Refill of guided munitions comes with combat (M5).', ui.dim);
    keys(t, ctx, [['Up/Down', 'Select ship', press('ArrowDown')], ['R', 'Repair', press('r')]]);
  }

  onKey(k: KeyInput, { game, location }: TabContext): boolean {
    const n = game.state.player.fleet.length;
    if (k.key === 'ArrowUp') this.ship = Math.max(0, this.ship - 1);
    else if (k.key === 'ArrowDown') this.ship = Math.min(n - 1, this.ship + 1);
    else if (k.key === 'r') report(game, repair(game, game.state.player, location, this.ship));
    else return false;
    return true;
  }

  help(): string[] {
    return ['MECHANIC', '', 'Up/Down   Select a ship', 'R         Repair hull, engine, and armor as far as credits allow'];
  }
}

export class ShipyardTab implements LocationTab {
  readonly serviceId = 'shipyard';
  readonly title = 'Shipyard';
  private row = 0;
  private confirm: string | null = null;

  render(t: Term, ctx: TabContext): void {
    const { game, location } = ctx;
    const { data } = game;
    const ui = palette(data).ui;
    const actor = game.state.player;
    const offers = hullOffers(location, data);
    this.row = Math.min(this.row, Math.max(0, offers.length - 1));
    const ship = actor.fleet[actor.flagshipIndex];
    let y = TAB_Y;
    if (ship) t.text(0, y++, `Trade-in of ${ship.name}: ${formatCredits(tradeInValue(ship, data))} (60% of hull and module prices).`, ui.dim);
    y++;
    const head = ['Hull', 'Role', '  HP', 'Arm', 'Mass', 'Pwr', 'Hardp S/M/L', 'Internal S/M/L', 'Tech', '    Price', ' After trade-in'];
    const cols = [0, 16, 28, 33, 37, 42, 46, 58, 73, 78, 88];
    head.forEach((h, i) => t.text(cols[i] as number, y, h, ui.dim));
    y++;
    offers.forEach((o, i) => {
      const h = data.hullById.get(o.hullId);
      if (!h) return;
      const bg = i === this.row ? ui.selectBg : undefined;
      if (bg) t.fill(0, y, 100, 1, bg);
      ctx.zones.add(0, y, 100, () => {
        if (this.row !== i) this.confirm = null;
        this.row = i;
      });
      const q = quoteHull(actor, actor.flagshipIndex, location, o.hullId, data);
      const v = [h.name, h.role, String(h.hp).padStart(4), String(h.armor).padStart(3), String(h.mass).padStart(4), String(h.basePower).padStart(3),
        `${h.hardpoints.S}/${h.hardpoints.M}/${h.hardpoints.L}`, `${h.internal.S}/${h.internal.M}/${h.internal.L}`, String(h.tech ?? '-'),
        String(Math.round(o.price)).padStart(9), q ? String(Math.round(q.net)).padStart(14) : ''];
      v.forEach((text, j) => t.text(cols[j] as number, y, fit(text, ((cols[j + 1] ?? 100) as number) - (cols[j] as number) - 1), j === 10 && q && q.net > actor.credits ? ui.danger : ui.text, bg));
      y++;
    });
    y++;
    t.text(0, y++, 'A new hull has an empty loadout: fit an engine, a reactor if needed, a fuel tank, and cargo.', ui.warning);
    if (this.confirm) t.text(0, y, this.confirm, ui.bright);
    keys(t, ctx, [['Up/Down', 'Select', press('ArrowDown')], ['Enter', 'Buy (trade in)', press('Enter')]]);
  }

  onKey(k: KeyInput, { game, location }: TabContext): boolean {
    const offers = hullOffers(location, game.data);
    const o = offers[this.row];
    if (k.key === 'ArrowUp') this.row = Math.max(0, this.row - 1);
    else if (k.key === 'ArrowDown') this.row = Math.min(offers.length - 1, this.row + 1);
    else if (k.key === 'Enter' && o) {
      const name = game.data.hullById.get(o.hullId)?.name ?? o.hullId;
      if (this.confirm === null) {
        this.confirm = `Buy a ${name} and trade in your ship? Press Enter again to confirm, Esc to cancel.`;
        return true;
      }
      report(game, buyHull(game, game.state.player, location, game.state.player.flagshipIndex, o.hullId), 'good');
      this.confirm = null;
    } else if (k.key === 'Escape' && this.confirm) this.confirm = null;
    else return false;
    if (k.key !== 'Enter') this.confirm = null;
    return true;
  }

  help(): string[] {
    return ['SHIPYARD', '', 'Up/Down   Select a hull', 'Enter     Buy it (press twice); your ship is traded in', '', 'Trade-in: 60% of the hull price and 60% of each module.', 'Sell the cargo first. The new hull has no modules.'];
  }
}

export class GuildTab implements LocationTab {
  readonly serviceId = 'merchants_guild';
  readonly title = "Merchants' Guild";

  render(t: Term, { game }: TabContext): void {
    const ui = palette(game.data).ui;
    const k = game.state.player.knowledge;
    let y = TAB_Y;
    t.text(0, y++, `Live prices for all locations within ${game.data.serviceRules.guildRangeJumps} jumps, with ${game.data.serviceRules.trendDays}-day trend arrows. Free.`, ui.text);
    t.text(0, y++, 'See them in the Trade Ledger (T).', ui.dim);
    y++;
    t.text(0, y++, `Chain alerts${k.alertsDay !== null ? ` (day ${displayDay(k.alertsDay)})` : ''}:`, ui.title);
    if (k.alerts.length === 0) t.text(0, y++, 'No alerts.', ui.dim);
    for (const a of k.alerts.slice(0, TAB_H - 6)) t.text(2, y++, a.text, ui.warning, undefined, 98);
    if (k.alerts.length > TAB_H - 6) t.text(2, y, `... and ${k.alerts.length - (TAB_H - 6)} more (Trade Ledger).`, ui.dim);
    t.text(0, TAB_Y + TAB_H - 1, 'Supply and Freight contracts come in M7.', ui.dim);
  }

  onKey(k: KeyInput, { game }: TabContext): boolean {
    if (k.key !== 'u') return false;
    observe(game, game.state.player);
    return true;
  }

  help(): string[] {
    return ["MERCHANTS' GUILD", '', 'Live prices within 2 jumps, trend arrows, and chain alerts.', 'A chain alert shows a producer with low output, or a', 'population that is short of a commodity.'];
  }
}

export class BountyTab implements LocationTab {
  readonly serviceId = 'bounty_guild';
  readonly title = 'Bounty Guild';

  render(t: Term, { game }: TabContext): void {
    t.text(0, TAB_Y, 'Sweep contracts and named bounties come in M7.', palette(game.data).ui.dim);
  }

  onKey(): boolean {
    return false;
  }

  help(): string[] {
    return ['BOUNTY GUILD', '', 'Contracts and bounties come in a later version.'];
  }
}
