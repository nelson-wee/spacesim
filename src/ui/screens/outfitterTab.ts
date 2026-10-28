// Outfitter tab (Sections 17.1, 17.3): slot list on the left with the ship
// portrait above it, the module shop on the right, and the stat panel at the
// bottom (old -> new, green better, red worse). Red warnings for a loadout
// that breaks a required-module rule; a yellow warning for combat power.
import type { InstalledModule, Ship } from '../../core/types';
import type { GameData, SlotSize } from '../../data';
import { sizeFits } from '../../data';
import type { Term } from '../../render/display';
import { drawModuleIcon, moduleShort } from '../../render/icons';
import { palette } from '../../render/palette';
import { drawArt } from '../../render/shipArt';
import { report } from '../../services/common';
import { buyModule, type ModuleOffer, moduleOffers, moduleSellValue, sellModule, setModuleOn } from '../../services/outfitter';
import { checkLoadout, type SlotKind, slotSizesOf } from '../../ship/rules';
import { type ShipStats, travelStats } from '../../ship/stats';
import type { KeyInput } from '../input';
import { drawKeyHints, press } from '../widgets/clicks';
import { fit } from '../widgets/text';
import { type LocationTab, TAB_H, TAB_Y, type TabContext } from './tab';

interface SlotRef {
  kind: SlotKind;
  index: number;
  size: SlotSize;
}

const LEFT_W = 50;
const SHOP_X = 51;
const LIST_Y = TAB_Y + 9;
const STAT_Y = TAB_Y + TAB_H - 6;
const LIST_H = STAT_Y - LIST_Y - 1;

function slotsOf(ship: Ship, data: GameData): SlotRef[] {
  const out: SlotRef[] = [];
  for (const kind of ['hardpoint', 'internal'] as const) slotSizesOf(ship, kind, data).forEach((size, index) => out.push({ kind, index, size }));
  return out;
}

function moduleIn(ship: Ship, s: SlotRef): InstalledModule | null {
  return (s.kind === 'hardpoint' ? ship.hardpoints : ship.internal)[s.index] ?? null;
}

interface StatRow {
  label: string;
  old: string;
  now: string;
  /** +1 better, -1 worse, 0 same. */
  delta: number;
}

/** Combat power (Q-41): available (reserved) / max, + capacitor if any. */
export function powerText(s: ShipStats, compact = false): string {
  const t = `${s.powerSupply - s.powerReserve} (${s.powerReserve}) / ${s.powerSupply}${s.capacitorCapacity > 0 ? ` + ${s.capacitorCapacity}` : ''}`;
  return compact ? t.replace(/ /g, '') : t;
}

/** The stat panel rows of Section 17.3. */
export function statRows(a: ShipStats, b: ShipStats): StatRow[] {
  const cmp = (x: number, y: number, higherBetter: boolean) => (Math.abs(x - y) < 1e-9 ? 0 : (y > x) === higherBetter ? 1 : -1);
  return [
    { label: 'Mass', old: `${a.mass.toFixed(0)} t`, now: `${b.mass.toFixed(0)} t`, delta: cmp(a.mass, b.mass, false) },
    { label: 'TWR', old: a.twr.toFixed(2), now: b.twr.toFixed(2), delta: cmp(a.twr, b.twr, true) },
    { label: 'Move', old: String(a.move), now: String(b.move), delta: cmp(a.move, b.move, true) },
    { label: 'Maneuver', old: String(Math.round(a.maneuver)), now: String(Math.round(b.maneuver)), delta: cmp(Math.round(a.maneuver), Math.round(b.maneuver), true) },
    { label: 'Power', old: powerText(a, true), now: powerText(b, true), delta: cmp(a.powerSupply - a.powerReserve, b.powerSupply - b.powerReserve, true) },
    { label: 'Move+fire', old: String(a.powerMove + a.powerWeapons), now: String(b.powerMove + b.powerWeapons), delta: cmp(a.powerMove + a.powerWeapons, b.powerMove + b.powerWeapons, false) },
    { label: 'Heat/turn', old: `+${a.heatPerTurn.toFixed(0)} c${a.cooling}`, now: `+${b.heatPerTurn.toFixed(0)} c${b.cooling}`, delta: cmp(a.cooling - a.heatPerTurn, b.cooling - b.heatPerTurn, true) },
    { label: 'Fuel/jump', old: a.fuelPerJump.toFixed(1), now: b.fuelPerJump.toFixed(1), delta: cmp(a.fuelPerJump, b.fuelPerJump, false) },
    { label: 'Cargo', old: `${a.cargoCapacity} t`, now: `${b.cargoCapacity} t`, delta: cmp(a.cargoCapacity, b.cargoCapacity, true) },
    { label: 'Fuel tank', old: String(a.fuelCapacity), now: String(b.fuelCapacity), delta: cmp(a.fuelCapacity, b.fuelCapacity, true) },
  ];
}

export class OutfitterTab implements LocationTab {
  readonly serviceId = 'outfitter';
  readonly title = 'Outfitter';
  private ship = 0;
  private slot = 0;
  private shop = 0;
  private shopScroll = 0;
  private focus: 'slots' | 'shop' = 'slots';

  private current(ctx: TabContext): Ship {
    const fleet = ctx.game.state.player.fleet;
    this.ship = Math.min(this.ship, fleet.length - 1);
    return fleet[this.ship] as Ship;
  }

  /** Offers that fit the selected slot. */
  private offers(ctx: TabContext, s: SlotRef | undefined): ModuleOffer[] {
    if (!s) return [];
    const { data } = ctx.game;
    return moduleOffers(ctx.location, data).filter((o) => data.moduleById.get(o.moduleId)?.slot === s.kind && sizeFits(o.size, s.size));
  }

  /** The ship after the selected change, or null if there is no change to show. */
  private preview(ctx: TabContext, ship: Ship, s: SlotRef | undefined, offer: ModuleOffer | undefined): Ship | null {
    if (!s) return null;
    const copy = structuredClone(ship);
    const list = s.kind === 'hardpoint' ? copy.hardpoints : copy.internal;
    if (this.focus === 'shop' && offer) list[s.index] = { moduleId: offer.moduleId, size: offer.size, tier: offer.tier, on: true };
    else if (this.focus === 'slots' && moduleIn(ship, s)) list[s.index] = null;
    else return null;
    return copy;
  }

  render(t: Term, ctx: TabContext): void {
    const { game } = ctx;
    const { data } = game;
    const ui = palette(data).ui;
    const ship = this.current(ctx);
    const slots = slotsOf(ship, data);
    this.slot = Math.min(this.slot, slots.length - 1);
    const sel = slots[this.slot];
    const offers = this.offers(ctx, sel);
    this.shop = Math.min(this.shop, Math.max(0, offers.length - 1));

    // Ship, portrait (slot marks are decoration only, Q-29).
    const hull = data.hullById.get(ship.hullId);
    t.text(0, TAB_Y, fit(`${ship.name} (${hull?.name ?? ship.hullId})`, LEFT_W - 12), ui.title);
    if (game.state.player.fleet.length > 1) t.text(LEFT_W - 12, TAB_Y, '[ ] Ship', ui.dim);
    const art = data.art.ships.ships[ship.hullId];
    if (art) drawArt(t, data, art.portrait, 1, TAB_Y + 1, { side: 'player' });

    // Slot list.
    t.text(0, LIST_Y - 1, 'Slot  Module', this.focus === 'slots' ? ui.bright : ui.dim);
    slots.slice(0, LIST_H).forEach((s, i) => {
      const y = LIST_Y + i;
      const m = moduleIn(ship, s);
      const bg = i === this.slot ? ui.selectBg : undefined;
      if (bg) t.fill(0, y, LEFT_W, 1, bg);
      ctx.zones.add(0, y, LEFT_W, () => {
        this.slot = i;
        this.focus = 'slots';
      });
      t.text(0, y, `${s.kind === 'hardpoint' ? 'H' : 'I'}${s.index + 1} ${s.size}`, ui.dim, bg);
      if (!m) {
        t.text(6, y, '- empty -', ui.dim, bg);
        return;
      }
      drawModuleIcon(t, data, 6, y, m);
      t.text(12, y, fit(moduleShort(data, m.moduleId), 14), m.on ? ui.text : ui.dim, bg);
      t.text(27, y, m.on ? 'ON ' : 'OFF', m.on ? ui.good : ui.dim, bg);
      t.text(32, y, `sell ${Math.round(moduleSellValue(m, data))}`, ui.dim, bg);
    });

    // Module shop.
    t.text(SHOP_X, TAB_Y, `Shop: modules for ${sel ? `${sel.kind === 'hardpoint' ? 'hardpoint' : 'internal'} slot size ${sel.size}` : '-'}`, this.focus === 'shop' ? ui.bright : ui.dim);
    const shopH = STAT_Y - TAB_Y - 2;
    if (this.shop < this.shopScroll) this.shopScroll = this.shop;
    if (this.shop >= this.shopScroll + shopH) this.shopScroll = this.shop - shopH + 1;
    offers.slice(this.shopScroll, this.shopScroll + shopH).forEach((o, i) => {
      const y = TAB_Y + 1 + i;
      const selected = this.focus === 'shop' && this.shopScroll + i === this.shop;
      const bg = selected ? ui.selectBg : undefined;
      if (bg) t.fill(SHOP_X, y, 100 - SHOP_X, 1, bg);
      ctx.zones.add(SHOP_X, y, 100 - SHOP_X, () => {
        this.shop = this.shopScroll + i;
        this.focus = 'shop';
      });
      drawModuleIcon(t, data, SHOP_X, y, o);
      t.text(SHOP_X + 6, y, fit(data.moduleById.get(o.moduleId)?.name ?? o.moduleId, 22), ui.text, bg);
      t.text(SHOP_X + 30, y, String(Math.round(o.price)).padStart(7), o.price > game.state.player.credits ? ui.danger : ui.bright, bg);
      t.text(SHOP_X + 38, y, 'cr', ui.dim, bg);
    });
    if (offers.length === 0) t.text(SHOP_X, TAB_Y + 1, 'Nothing for this slot.', ui.dim);

    // Stat panel: old -> new.
    const after = this.preview(ctx, ship, sel, offers[this.shop]);
    const a = travelStats(ship, data);
    const b = after ? travelStats(after, data) : a;
    t.hline(STAT_Y - 1, 0, 99, '─', ui.border);
    statRows(a, b).forEach((r, i) => {
      const x = (i % 3) * 33;
      const y = STAT_Y + Math.floor(i / 3);
      t.text(x, y, fit(r.label, 10), ui.dim);
      t.text(x + 10, y, fit(r.old, 9), ui.text);
      if (after) {
        t.text(x + 19, y, '->', ui.dim);
        t.text(x + 22, y, fit(r.now, 10), r.delta > 0 ? ui.good : r.delta < 0 ? ui.danger : ui.text);
      }
    });
    const check = checkLoadout(after ?? ship, data);
    const warn = check.errors[0] ?? check.warnings[0];
    if (warn) t.text(0, STAT_Y + Math.ceil(statRows(a, b).length / 3), fit(warn, 100), check.errors.length ? ui.danger : ui.warning);
    drawKeyHints(
      t,
      ctx.zones,
      0,
      STAT_Y + 4,
      [
        ['Left/Right', 'Slots/Shop', press(this.focus === 'slots' ? 'ArrowRight' : 'ArrowLeft')],
        ['Enter', 'Buy and install', press('Enter')],
        ['X', 'Sell module', press('x')],
        ['O', 'ON/OFF', press('o')],
      ],
      ui,
      ctx.press,
      2,
    );
  }

  onKey(k: KeyInput, ctx: TabContext): boolean {
    const { game, location } = ctx;
    const actor = game.state.player;
    const ship = this.current(ctx);
    const slots = slotsOf(ship, game.data);
    const sel = slots[this.slot];
    const offers = this.offers(ctx, sel);
    switch (k.key) {
      case 'ArrowUp':
        if (this.focus === 'slots') this.slot = Math.max(0, this.slot - 1);
        else this.shop = Math.max(0, this.shop - 1);
        return true;
      case 'ArrowDown':
        if (this.focus === 'slots') this.slot = Math.min(slots.length - 1, this.slot + 1);
        else this.shop = Math.min(offers.length - 1, this.shop + 1);
        return true;
      // At the edge, Left/Right go to the next tab (the Location screen).
      case 'ArrowLeft':
        if (this.focus === 'slots') return false;
        this.focus = 'slots';
        return true;
      case 'ArrowRight':
        if (this.focus === 'shop') return false;
        this.focus = 'shop';
        return true;
      case '[':
        this.ship = Math.max(0, this.ship - 1);
        return true;
      case ']':
        this.ship = Math.min(actor.fleet.length - 1, this.ship + 1);
        return true;
      case 'Enter': {
        const o = offers[this.shop];
        if (this.focus !== 'shop' || !sel || !o) {
          this.focus = 'shop';
          return true;
        }
        if (moduleIn(ship, sel)) {
          game.bus.message('Sell the module in this slot first (X). There is no module storage.', 'warning');
          return true;
        }
        report(game, buyModule(game, actor, location, this.ship, sel.kind, sel.index, o));
        return true;
      }
      case 'x':
        if (sel) report(game, sellModule(game, actor, location, this.ship, sel.kind, sel.index));
        return true;
      case 'o': {
        const m = sel ? moduleIn(ship, sel) : null;
        if (sel && m) setModuleOn(ship, sel.kind, sel.index, !m.on);
        return true;
      }
      default:
        return false;
    }
  }

  help(): string[] {
    return [
      'OUTFITTER',
      '',
      'Up/Down      Select a slot, or a module in the shop',
      'Left/Right   Slot list / shop (at the edge: the next tab)',
      'Click        Select a slot or a module',
      'Enter        Buy the module and install it in the empty slot',
      'X            Sell the module in the slot (60% of its price)',
      'O            Switch the module ON or OFF for travel',
      '[ ]          Select a different fleet ship',
      '',
      'A module fits a slot of its size or larger. The stat panel shows',
      'old -> new values: green is better, red is worse. A ship needs an',
      'engine, power for its engines, and cargo within its capacity.',
    ];
  }
}
