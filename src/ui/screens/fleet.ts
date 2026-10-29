// Fleet and cargo screen (Section 17.1 (7), M6-UI-01, M6-UI-05, M6-UI-06).
// For each ship: the portrait, loadout, derived stats, fuel, and cargo with
// the purchase price per unit. Docked at a location: select the flagship,
// move cargo and modules between ships, and sell a ship (at a Shipyard).
// After a battle (Q-50): the same screen also shows the surrendered ships;
// the player takes a ship as a prize, takes its cargo, or leaves it, and can
// scuttle a fleet ship. The screen closes only when each fleet ship passes the
// required-module rules (Section 11.2).
import { removeShip, setFlagship, upkeepPerDay } from '../../actor/fleet';
import { fleetProblems, moveAllCargo, moveCargo, moveModule } from '../../actor/fleetManage';
import { takePrize } from '../../career/prize';
import type { CombatShip } from '../../combat/types';
import type { Game } from '../../core/game';
import type { Ship } from '../../core/types';
import type { Term } from '../../render/display';
import { HEIGHT } from '../../render/display';
import { drawModuleIcon, moduleShort } from '../../render/icons';
import { palette } from '../../render/palette';
import { drawArt } from '../../render/shipArt';
import { report } from '../../services/common';
import { sellShip, tradeInValue } from '../../services/shipyard';
import { checkLoadout, type SlotKind } from '../../ship/rules';
import { travelStats } from '../../ship/stats';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { drawKeyHints, press } from '../widgets/clicks';
import { drawStatusBar } from '../widgets/statusBar';
import { fit } from '../widgets/text';
import { powerText } from './outfitterTab';

/** A line of the item list: a module slot or a cargo lot. */
type Item = { kind: 'module'; slot: SlotKind; index: number } | { kind: 'cargo'; commodity: string };

export interface AfterBattle {
  /** Surrendered ships of the other side (career/prize.ts). */
  boarded: CombatShip[];
}


export class FleetScreen implements Screen {
  /** Index in the combined list: fleet ships, then boarded ships. */
  private ship = 0;
  private item = 0;
  private notice = '';
  /** A scuttle waits for a second X. */
  private scuttleArmed = false;

  constructor(
    private readonly app: App,
    private readonly after: AfterBattle | null = null,
  ) {}

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  private fleet(): Ship[] {
    return this.game.state.player.fleet;
  }

  private boarded(): CombatShip[] {
    return this.after?.boarded ?? [];
  }

  private all(): Ship[] {
    return [...this.fleet(), ...this.boarded().map((c) => c.ship)];
  }

  private isBoarded(i: number): boolean {
    return i >= this.fleet().length;
  }

  private docked(): boolean {
    return this.game.state.player.position.kind === 'docked';
  }

  /** Moves are allowed when docked and after a battle (M6-FLEET-10, M6-UI-06). */
  private canManage(): boolean {
    return this.after !== null || this.docked();
  }

  private items(ship: Ship): Item[] {
    return [
      ...ship.hardpoints.map((_, index) => ({ kind: 'module', slot: 'hardpoint', index }) as Item),
      ...ship.internal.map((_, index) => ({ kind: 'module', slot: 'internal', index }) as Item),
      ...Object.keys(ship.cargo).map((commodity) => ({ kind: 'cargo', commodity }) as Item),
    ];
  }

  render(t: Term): void {
    const game = this.game;
    const { data } = game;
    const ui = palette(data).ui;
    const actor = game.state.player;
    drawStatusBar(t, game);
    const all = this.all();
    this.ship = Math.min(this.ship, all.length - 1);
    t.text(0, 2, this.after ? 'After the battle' : 'Fleet and cargo', ui.title);
    // Ship tabs: the number key moves the selected item to that ship.
    const tabW = Math.min(20, Math.floor(82 / Math.max(1, all.length)));
    all.forEach((s, i) => {
      const x = 18 + i * tabW;
      const mark = i === actor.flagshipIndex && !this.isBoarded(i) ? '*' : this.isBoarded(i) ? '?' : ' ';
      const fg = this.isBoarded(i) ? palette(data).roles.pirate : i === this.ship ? ui.bright : ui.dim;
      t.text(x, 2, `${i + 1}`, ui.key, ui.keyBg);
      t.text(x + 1, 2, fit(`${mark}${s.name}`, tabW - 2), fg, i === this.ship ? ui.selectBg : undefined);
      this.app.zones.add(x, 2, tabW - 1, () => {
        this.ship = i;
        this.item = 0;
      });
    });
    t.hline(3, 0, 99, '─', ui.border);
    const ship = all[this.ship] as Ship;
    const boarded = this.isBoarded(this.ship);
    const s = travelStats(ship, data);
    const hull = data.hullById.get(ship.hullId);
    const role = boarded ? ' - surrendered' : this.ship === actor.flagshipIndex ? ' - flagship' : '';
    t.text(0, 4, fit(`${ship.name}: ${hull?.name ?? ship.hullId} (${hull?.sizeClass ?? ''})${role}`, 39), ui.title);
    const art = data.art.ships.ships[ship.hullId];
    if (art) drawArt(t, data, art.portrait, 1, 5, { side: boarded ? 'pirate' : 'player' });

    const items = this.items(ship);
    this.item = Math.min(this.item, Math.max(0, items.length - 1));
    // Loadout.
    let y = 14;
    t.text(0, y++, 'Loadout', ui.dim);
    items.forEach((it, i) => {
      if (it.kind !== 'module') return;
      const m = (it.slot === 'hardpoint' ? ship.hardpoints : ship.internal)[it.index] ?? null;
      const sel = i === this.item;
      if (sel) t.fill(0, y, 38, 1, ui.selectBg);
      t.text(0, y, `${it.slot === 'hardpoint' ? 'H' : 'I'}${it.index + 1}`, ui.dim, sel ? ui.selectBg : undefined);
      if (m) {
        drawModuleIcon(t, data, 4, y, m);
        t.text(10, y, fit(`${moduleShort(data, m.moduleId)} ${m.size}`, 16), m.on ? ui.text : ui.dim, sel ? ui.selectBg : undefined);
        t.text(27, y, m.on ? 'ON' : 'OFF', m.on ? ui.good : ui.dim, sel ? ui.selectBg : undefined);
      } else t.text(4, y, '- empty -', ui.dim, sel ? ui.selectBg : undefined);
      this.zoneItem(y, 38, i);
      y++;
    });

    // Derived stats.
    const x = 40;
    y = 4;
    const stat = (label: string, value: string) => {
      t.text(x, y, fit(label, 15), ui.dim);
      t.text(x + 16, y++, fit(value, 44), ui.text);
    };
    stat('Mass', `${s.mass.toFixed(1)} t (cargo ${s.cargoMass.toFixed(1)} t)`);
    stat('Move / maneuver', `${s.move} / ${Math.round(s.maneuver)}`);
    stat('Power', `${powerText(s)}; a move ${s.powerMove}, all weapons ${s.powerWeapons}`);
    stat('Heat', `+${s.heatPerTurn.toFixed(0)}/turn, cooling ${s.cooling}, capacity ${s.heatCapacity}`);
    stat('Shields', `${s.shieldCapacity} (regen ${s.shieldRegen})`);
    stat('Hull / armor', `${Math.round(ship.hullHp)}/${s.maxHullHp} HP, armor ${s.armor}, plating ${Math.round(ship.armorHp)}/${s.maxArmorHp}`);
    stat('Engine value', `${ship.engineValue.toFixed(0)}/${s.maxEngineValue}`);
    stat('Fuel', `${ship.fuel.toFixed(1)}/${s.fuelCapacity}, ${s.fuelPerJump.toFixed(1)} per jump`);
    stat('Cargo', `${s.cargoMass.toFixed(1)}/${s.cargoCapacity} t`);
    if (!boarded) stat('Trade-in', `${Math.round(tradeInValue(ship, data))} cr`);
    const check = checkLoadout(ship, data);
    for (const e of check.errors.slice(0, 2)) t.text(x, y++, fit(e, 60), ui.danger);
    for (const w of check.warnings.slice(0, 1)) t.text(x, y++, fit(w, 60), ui.warning);

    // Cargo.
    y++;
    t.text(x, y++, 'Cargo            Units   Mass   Paid/unit', ui.dim);
    if (!items.some((it) => it.kind === 'cargo')) t.text(x, y++, 'Empty', ui.dim);
    items.forEach((it, i) => {
      if (it.kind !== 'cargo') return;
      const lot = ship.cargo[it.commodity];
      if (!lot) return;
      const com = data.commodityById.get(it.commodity);
      const bg = i === this.item ? ui.selectBg : undefined;
      if (bg) t.fill(x, y, 46, 1, bg);
      t.text(x, y, fit(com?.name ?? it.commodity, 16), ui.text, bg);
      t.text(x + 16, y, lot.units.toFixed(1).padStart(6), ui.bright, bg);
      t.text(x + 23, y, (lot.units * (com?.massPerUnit ?? 0)).toFixed(1).padStart(6), ui.text, bg);
      t.text(x + 30, y, (boarded ? '-' : String(Math.round(lot.unitCost))).padStart(9), ui.text, bg);
      this.zoneItem(y, 46, i, x);
      y++;
    });

    // Notice and keys.
    const fleetLine = `Fleet ${actor.fleet.length}/${data.balance.fleet.maxFleetSize} ships. Upkeep ${Math.round(upkeepPerDay(actor, data))} cr/day (each ship but the flagship).`;
    t.text(0, HEIGHT - 5, fit(fleetLine, 99), ui.dim);
    t.text(0, HEIGHT - 4, fit(this.notice, 99), ui.warning);
    const hints: [string, string, KeyInput][] = [['Left/Right', 'Ship', press('ArrowRight')], ['Up/Down', 'Item', press('ArrowDown')]];
    if (this.canManage()) hints.push(['1-8', 'Move item to ship', press('1')]);
    if (this.after && boarded) hints.push(['P', 'Take as prize', press('p')], ['C', 'Take all cargo', press('c')]);
    if (!this.after && this.docked() && !boarded) hints.push(['F', 'Flagship', press('f')], ['S', 'Sell', press('s')]);
    if (this.after && !boarded) hints.push(['X', 'Scuttle', press('x')]);
    hints.push(['Esc', this.after ? 'Done' : 'Back', press('Escape')]);
    drawKeyHints(t, this.app.zones, 0, HEIGHT - 2, hints, ui, this.app.press, 2);
    if (!this.canManage()) t.text(0, HEIGHT - 3, 'Dock at a location to move cargo and modules or to change the flagship.', ui.dim);
  }

  private zoneItem(y: number, w: number, i: number, x = 0): void {
    this.app.zones.add(x, y, w, () => {
      this.item = i;
    });
  }

  onKey(k: KeyInput): boolean {
    const game = this.game;
    const { data } = game;
    const actor = game.state.player;
    const all = this.all();
    const scuttleArmed = this.scuttleArmed;
    this.scuttleArmed = false;
    const ship = all[this.ship] as Ship;
    const items = this.items(ship);
    const item = items[this.item];
    const boarded = this.isBoarded(this.ship);
    const say = (text: string) => {
      this.notice = text;
    };
    const n = Number(k.key);
    if (k.key.length === 1 && n >= 1 && n <= 8) {
      const target = all[n - 1];
      if (!target) return true;
      if (!this.canManage()) {
        say('Dock at a location to move cargo and modules.');
        return true;
      }
      if (this.isBoarded(n - 1)) {
        say('You cannot load a surrendered ship. Take it as a prize first.');
        return true;
      }
      if (!item) {
        say('Select a module or a cargo line first (Up/Down).');
        return true;
      }
      if (item.kind === 'cargo') {
        const lot = ship.cargo[item.commodity];
        say(moveCargo(data, ship, target, item.commodity, lot?.units ?? 0, boarded).text);
      } else if (boarded) say('Take the ship as a prize first, then move its modules.');
      else say(moveModule(data, ship, item.slot, item.index, target).text);
      return true;
    }
    switch (k.key) {
      case 'ArrowLeft':
      case '[':
        this.ship = Math.max(0, this.ship - 1);
        this.item = 0;
        return true;
      case 'ArrowRight':
      case ']':
      case 'Tab':
        this.ship = Math.min(all.length - 1, this.ship + 1);
        this.item = 0;
        return true;
      case 'ArrowUp':
        this.item = Math.max(0, this.item - 1);
        return true;
      case 'ArrowDown':
        this.item = Math.min(Math.max(0, items.length - 1), this.item + 1);
        return true;
      case 'f':
        if (this.after || boarded) return true;
        say(setFlagship(game, actor, this.ship) ?? `${ship.name} is now your flagship.`);
        return true;
      case 's': {
        if (this.after || boarded) return true;
        const loc = actor.position.kind === 'docked' ? game.state.world.locations[actor.position.locationId] : undefined;
        if (!loc) {
        say('Dock at a location with a Shipyard to sell a ship.');
        return true;
      }
        say(report(game, sellShip(game, actor, loc, this.ship), 'good').text);
        return true;
      }
      case 'p': {
        const cs = this.boarded()[this.ship - this.fleet().length];
        if (!this.after || !cs) return true;
        const r = takePrize(game, actor, cs);
        say(r.text);
        if (r.ok) {
          this.after.boarded = this.after.boarded.filter((c) => c !== cs);
          game.bus.message(r.text, 'good');
        }
        return true;
      }
      case 'c': {
        if (!this.after || !boarded) return true;
        let moved = 0;
        for (const target of [...actor.fleet]) moved += moveAllCargo(data, ship, target, true);
        say(moved > 0 ? `You take ${Math.round(moved)} units of cargo.${Object.keys(ship.cargo).length > 0 ? ' The rest does not fit.' : ''}` : 'No cargo fits in your fleet.');
        return true;
      }
      case 'x': {
        if (!this.after || boarded) return true;
        if (actor.fleet.length <= 1) {
        say('You cannot scuttle your last ship.');
        return true;
      }
        if (!scuttleArmed) {
          this.scuttleArmed = true;
          say(`Scuttle ${ship.name}? Its cargo and modules are lost. Press X again to confirm.`);
          return true;
        }
        removeShip(game, actor, this.ship);
        game.bus.message(`You scuttle ${ship.name}.`, 'warning');
        say(`${ship.name} is scuttled.`);
        return true;
      }
      case 'Escape':
      case 'i':
        this.close();
        return true;
      default:
        return false;
    }
  }

  /** After a battle, each fleet ship must pass the required-module rules; the surrendered ships stay behind. */
  private close(): void {
    if (this.after) {
      const problems = fleetProblems(this.fleet(), this.game.data);
      if (problems.length > 0) {
        this.notice = `Fix or scuttle first: ${problems[0]}`;
        return;
      }
      const left = this.boarded().length;
      if (left > 0) this.game.bus.message(`You leave ${left} surrendered ship${left === 1 ? '' : 's'} behind.`);
    }
    this.app.pop();
  }

  help(): string[] {
    return [
      this.after ? 'AFTER THE BATTLE' : 'FLEET AND CARGO',
      '',
      'Left/Right, Tab   Select a ship (or click its name)',
      'Up/Down           Select a module or a cargo line',
      '1-8               Move the selected item to that ship: a module goes',
      '                  to the first empty slot that takes it; cargo moves',
      '                  as far as it fits (docked, or after a battle)',
      'F                 Make the selected ship the flagship (docked)',
      'S                 Sell the selected ship (at a Shipyard; not the',
      '                  flagship; no cargo)',
      'P                 Take a surrendered ship as a prize (after a battle)',
      'C                 Take all cargo of a surrendered ship',
      'X, X              Scuttle a fleet ship (after a battle)',
      'Esc               Back (after a battle: done; surrendered ships that',
      '                  you do not take stay behind)',
      '',
      `Prize: ${prizeProblemText(this.game)}`,
      'Each ship that is not the flagship costs upkeep each day.',
    ];
  }
}

function prizeProblemText(game: Game): string {
  const max = game.data.balance.fleet.maxFleetSize;
  return `the fleet has at most ${max} ships; capital ships cannot be prizes; a prize from a non-pirate adds notoriety.`;
}
