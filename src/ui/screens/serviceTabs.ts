// Small Location tabs: Refuel, Mechanic, Clone Insurance, Shipyard, Merchants' Guild, Bounty Guild.
import { observe } from '../../actor/knowledge';
import { acceptContract, acceptProblem, collectBounty, standing } from '../../career/contracts';
import { offerView } from '../../career/contractView';
import type { Board, Contract } from '../../core/types';
import { eventText } from '../../econ/events';
import { displayDay } from '../../core/clock';
import type { Term } from '../../render/display';
import { palette } from '../../render/palette';
import { report } from '../../services/common';
import { buyInsurance, quoteInsurance } from '../../services/insurance';
import { quoteRepair, repair } from '../../services/mechanic';
import { quoteRefuel, refuel } from '../../services/refuel';
import { buyHull, buyShip, hullOffers, quoteHull, tradeInValue } from '../../services/shipyard';
import { travelStats } from '../../ship/stats';
import { locationCode } from '../../world/codes';
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
    const q = actor.fleet[this.ship] ? quoteRepair(actor.fleet[this.ship] as NonNullable<(typeof actor.fleet)[number]>, data) : null;
    t.text(0, y, q && q.ammo > 0 ? `Guided munitions: ${q.ammo} rounds missing, ${formatCredits(q.ammoCost)} (part of the repair).` : 'Guided munitions: full.', q && q.ammo > 0 ? ui.warning : ui.dim);
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
    return ['MECHANIC', '', 'Up/Down   Select a ship', 'R         Repair hull, engine, and armor, then refill guided', '          munitions, as far as credits allow'];
  }
}

export class InsuranceTab implements LocationTab {
  readonly serviceId = 'insurance';
  readonly title = 'Insurance';
  private confirm = false;

  render(t: Term, ctx: TabContext): void {
    const { game, location } = ctx;
    const { data, state } = game;
    const ui = palette(data).ui;
    const actor = state.player;
    const ship = actor.fleet[actor.flagshipIndex];
    let y = TAB_Y;
    t.text(0, y++, 'Clone Insurance: if your last ship is destroyed, your clone wakes where you bought the policy.', ui.text);
    t.text(0, y++, 'You get a new copy of the insured ship (full HP and fuel, no cargo). You keep your credits.', ui.dim);
    t.text(0, y++, 'Pirates do not destroy ships: they disable your ship and take all cargo. The policy is not used.', ui.dim);
    y++;
    const p = actor.insurance;
    if (p) {
      const at = state.world.locations[p.locationId];
      const hull = data.hullById.get(p.ship.hullId)?.name ?? p.ship.hullId;
      t.text(0, y++, `Your policy: ${hull} "${p.ship.name}", at ${at ? `${at.name} (${locationCode(state.world, at, data)})` : '?'}, day ${displayDay(p.day)}.`, ui.good);
      if (ship && ship.hullId !== p.ship.hullId) t.text(0, y++, 'Your flagship is not the insured hull. Insure again to cover it.', ui.warning);
    } else t.text(0, y++, 'You have no policy. If your ship is destroyed, the game ends.', ui.danger);
    y++;
    if (ship) {
      const q = quoteInsurance(game, location, ship);
      t.text(0, y++, `Insure ${ship.name}: value ${formatCredits(q.value)} (hull and modules) x ${Math.round(q.share * 100)}% (${q.levelName} security) = ${formatCredits(q.premium)}.`, ui.bright);
      t.text(0, y++, 'A new policy replaces the old one.', ui.dim);
      y++;
      const levels = data.security.levels.map((l) => `${l.name} ${Math.round((data.serviceRules.insurance.premiumShare[l.level] ?? 0) * 100)}%`).join(', ');
      t.text(0, y++, `Premium by sector security: ${levels}.`, ui.dim);
    }
    if (this.confirm) t.text(0, y + 1, 'Buy this policy? Press Enter again to confirm, Esc to cancel.', ui.bright);
    keys(t, ctx, [['Enter', 'Insure flagship', press('Enter')]]);
  }

  onKey(k: KeyInput, { game, location }: TabContext): boolean {
    if (k.key === 'Enter') {
      if (!this.confirm) {
        this.confirm = true;
        return true;
      }
      report(game, buyInsurance(game, game.state.player, location), 'good');
      this.confirm = false;
      return true;
    }
    if (k.key === 'Escape' && this.confirm) {
      this.confirm = false;
      return true;
    }
    return false;
  }

  help(): string[] {
    return [
      'CLONE INSURANCE',
      '',
      'Enter   Insure the flagship (press twice)',
      '',
      'The premium is a share of the hull and module prices.',
      'Safe sectors are cheaper; Lawless sectors cost the most.',
      'If your last ship is destroyed, you wake here with the',
      'insured ship. You keep your credits. Pirates only',
      'disable ships and take the cargo.',
    ];
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
    t.text(0, y++, `Fleet: ${actor.fleet.length}/${data.balance.fleet.maxFleetSize} ships. B buys a hull for the fleet; sell a ship on the fleet screen (I).`, ui.dim);
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
    keys(t, ctx, [['Up/Down', 'Select', press('ArrowDown')], ['Enter', 'Buy (trade in)', press('Enter')], ['B', 'Buy for the fleet', press('b')]]);
  }

  onKey(k: KeyInput, { game, location }: TabContext): boolean {
    const offers = hullOffers(location, game.data);
    const o = offers[this.row];
    if (k.key === 'ArrowUp') this.row = Math.max(0, this.row - 1);
    else if (k.key === 'ArrowDown') this.row = Math.min(offers.length - 1, this.row + 1);
    else if (k.key === 'Enter' && o) {
      const name = game.data.hullById.get(o.hullId)?.name ?? o.hullId;
      if (this.confirm === null || this.confirm.includes('for the fleet')) {
        this.confirm = `Buy a ${name} and trade in your ship? Press Enter again to confirm, Esc to cancel.`;
        return true;
      }
      report(game, buyHull(game, game.state.player, location, game.state.player.flagshipIndex, o.hullId), 'good');
      this.confirm = null;
    } else if (k.key === 'b' && o) {
      const name = game.data.hullById.get(o.hullId)?.name ?? o.hullId;
      if (this.confirm === null || !this.confirm.includes('for the fleet')) {
        this.confirm = `Buy a ${name} for the fleet (no trade-in)? Press B again to confirm, Esc to cancel.`;
        return true;
      }
      report(game, buyShip(game, game.state.player, location, o.hullId), 'good');
      this.confirm = null;
    } else if (k.key === 'Escape' && this.confirm) this.confirm = null;
    else return false;
    if (k.key !== 'Enter' && k.key !== 'b') this.confirm = null;
    return true;
  }

  help(): string[] {
    return [
      'SHIPYARD',
      '',
      'Up/Down   Select a hull',
      'Enter     Buy it (press twice); your flagship is traded in',
      'B         Buy it for the fleet (press twice); no trade-in',
      '',
      'Trade-in: 60% of the hull price and 60% of each module.',
      'Sell the cargo first. The new hull has no modules.',
      'Sell a fleet ship (not the flagship) on the fleet screen (I).',
      'Each ship that is not the flagship costs upkeep each day.',
    ];
  }
}

/** A contract board (Section 14.8): the offers of one guild here, with the display fields; Enter accepts. */
class BoardView {
  row = 0;
  notice = '';

  offers(ctx: TabContext, guild: Board['guild']): Contract[] {
    return ctx.game.state.contracts.boards.find((b) => b.locationId === ctx.location.id && b.guild === guild)?.offers ?? [];
  }

  render(t: Term, ctx: TabContext, guild: Board['guild'], y: number, rows: number): void {
    const { game } = ctx;
    const ui = palette(game.data).ui;
    const offers = this.offers(ctx, guild);
    this.row = Math.min(this.row, Math.max(0, offers.length - 1));
    const board = game.state.contracts.boards.find((b) => b.locationId === ctx.location.id && b.guild === guild);
    const next = board ? board.day + game.data.contracts.boardIntervalDays : null;
    t.text(0, y++, `Offers${next !== null ? ` (new offers on day ${displayDay(next)})` : ''}:`, ui.title);
    if (offers.length === 0) t.text(2, y++, 'No offers now.', ui.dim);
    const max = Math.floor(rows / 3);
    offers.slice(0, max).forEach((o, i) => {
      const v = offerView(game, o);
      const sel = i === this.row;
      const bg = sel ? ui.selectBg : undefined;
      if (bg) t.fill(0, y, 100, 3, bg);
      ctx.zones.add(0, y, 100, () => {
        this.row = i;
      });
      const problem = acceptProblem(game, o);
      const head = o.kind === 'named' ? `${v.type}: ${o.name}` : `${v.type}: ${o.reason}`;
      t.text(0, y, fit(head, 99), problem ? ui.dim : sel ? ui.bright : ui.text, bg);
      const what = o.kind === 'named' ? o.reason : o.kind === 'sweep' ? `${o.ships} pirate ships` : o.kind === 'supply' ? `needs ${Math.round(v.tonnes)} t now` : `${Math.round(v.tonnes)} t`;
      const dl = o.kind === 'supply' ? '' : v.deadline === null ? `; ${game.data.contracts.sweep.deadlineDays} days from acceptance` : `; by day ${displayDay(v.deadline)}`;
      t.text(2, y + 1, fit(`${what}; ${v.route}, ${v.jumps} jumps, lowest security ${v.lowestLevel}, threat band ${v.band}`, 97), ui.text, bg);
      const est = v.perDay === null ? '' : `, about ${Math.round(v.perDay)} cr/day`;
      const fee = o.kind === 'supply' ? ` per hold (goods ${Math.round(o.price)} cr each + fee ${Math.round(o.feePerTonne)} cr/t${o.alert ? ', chain alert x1.5' : ''}); until the need ends` : '';
      t.text(2, y + 2, fit(`Reward ${formatCredits(v.reward)}${fee}${est}${dl}${problem ? ` - ${problem}` : ''}`, 97), problem ? ui.warning : ui.good, bg);
      y += 3;
    });
    if (offers.length > max) t.text(2, y, `... ${offers.length - max} more.`, ui.dim);
  }

  onKey(k: KeyInput, ctx: TabContext, guild: Board['guild']): boolean {
    const offers = this.offers(ctx, guild);
    if (k.key === 'ArrowUp') this.row = Math.max(0, this.row - 1);
    else if (k.key === 'ArrowDown') this.row = Math.min(Math.max(0, offers.length - 1), this.row + 1);
    else if (k.key === 'Enter') {
      const o = offers[this.row];
      if (o) this.notice = report(ctx.game, acceptContract(ctx.game, ctx.location.id, o.id), 'good').text;
    } else return false;
    return true;
  }
}

export class GuildTab implements LocationTab {
  readonly serviceId = 'merchants_guild';
  readonly title = "Merchants' Guild";
  private readonly board = new BoardView();

  render(t: Term, ctx: TabContext): void {
    const { game } = ctx;
    const ui = palette(game.data).ui;
    const k = game.state.player.knowledge;
    let y = TAB_Y;
    t.text(0, y++, fit(`Live prices within ${game.data.serviceRules.guildRangeJumps} jumps in the Trade Ledger (T). Standing ${standing(game)}. Active contracts: G.`, 99), ui.dim);
    const alerts = k.alerts.slice(0, 2);
    for (const a of alerts) t.text(2, y++, fit(`Alert: ${a.text}`, 97), ui.warning);
    const events = game.state.world.economy.events;
    for (const e of events) t.text(2, y++, fit(`Event: ${eventText(e, game.state.world, game.data)} Ends on day ${displayDay(game.state.day + (e.endDay - game.state.world.economy.days))}.`, 97), ui.warning);
    y++;
    this.board.render(t, ctx, 'merchants', y, TAB_Y + TAB_H - 3 - y);
    t.text(0, TAB_Y + TAB_H - 2, fit(this.board.notice, 99), ui.warning);
    keys(t, ctx, [['Up/Down', 'Select', press('ArrowDown')], ['Enter', 'Accept', press('Enter')], ['G', 'Contracts', press('g')]]);
  }

  onKey(k: KeyInput, ctx: TabContext): boolean {
    if (k.key === 'u') {
      observe(ctx.game, ctx.game.state.player);
      return true;
    }
    return this.board.onKey(k, ctx, 'merchants');
  }

  help(): string[] {
    return [
      "MERCHANTS' GUILD",
      '',
      'Up/Down  Select an offer;  Enter  Accept it;  G  Your contracts',
      '',
      'Supply: deliver goods to a location that needs them, as much as it',
      'needs, until the need ends. Each tonne pays the goods at the market',
      'price on the posting day and a fee by jumps, urgency, and risk (x1.5',
      'for a chain alert). Freight: carry the guild\'s cargo from a surplus',
      'to a deficit',
      '(deposit at pickup). Offers come from real needs; new offers every',
      '7 days. At most 4 active contracts. Freight Medium and Large need',
      'standing 3 and 8 (done - 2 x failed). Live prices within 2 jumps,',
      'chain alerts, and market events show here too.',
    ];
  }
}

export class BountyTab implements LocationTab {
  readonly serviceId = 'bounty_guild';
  readonly title = 'Bounty Guild';
  private readonly board = new BoardView();

  render(t: Term, ctx: TabContext): void {
    const { game } = ctx;
    const ui = palette(game.data).ui;
    let y = TAB_Y;
    const owed = game.state.contracts.killBounty;
    t.text(0, y++, `Kill bounty to collect: ${formatCredits(owed)}${owed > 0 ? ' (K)' : ''}. Active contracts: G.`, owed > 0 ? ui.good : ui.dim);
    y++;
    this.board.render(t, ctx, 'bounty', y, TAB_Y + TAB_H - 3 - y);
    t.text(0, TAB_Y + TAB_H - 2, fit(this.board.notice, 99), ui.warning);
    keys(t, ctx, [['Up/Down', 'Select', press('ArrowDown')], ['Enter', 'Accept', press('Enter')], ['K', 'Collect bounty', press('k')], ['G', 'Contracts', press('g')]]);
  }

  onKey(k: KeyInput, ctx: TabContext): boolean {
    if (k.key === 'k') {
      this.board.notice = report(ctx.game, collectBounty(ctx.game, ctx.location), 'good').text;
      return true;
    }
    return this.board.onKey(k, ctx, 'bounty');
  }

  help(): string[] {
    return [
      'BOUNTY GUILD',
      '',
      'Up/Down  Select an offer;  Enter  Accept it;  K  Collect kill bounties',
      '',
      'Sweep: destroy or capture N pirate ships in a sector in 25 days.',
      'Named bounty: find and beat a named pirate group. It meets you when',
      'you arrive in its sector or Hunt there. The threat band shows how',
      'strong it is. Kill bounty: each pirate ship that you destroy or',
      'capture pays; collect here. Wanted captains are not paid.',
      'At most 3 named bounties and 1 Sweep at a time.',
    ];
  }
}
