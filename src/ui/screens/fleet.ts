// Fleet and cargo screen (Section 17.1 (7), M6-UI-01, M6-UI-05, M6-UI-06).
// For each ship: the portrait, loadout, derived stats, fuel, and cargo with
// the purchase price per unit. Docked at a location: select the flagship,
// move cargo between ships, uninstall and install modules, and sell a ship
// (at a Shipyard). After a battle (Q-50): the same screen also shows the
// surrendered ships; the player takes a ship as a prize, takes its cargo, or
// leaves it, and can scuttle a fleet ship. N renames a fleet ship. B moves
// fuel between the fleet ships (anywhere).
//
// Modules (owner, 2026-11-03): U uninstalls a module into the fleet hold (one
// list for all ships); Enter installs a held module on the selected ship. The
// screen closes when the loadouts pass the rules (Section 11.2) and the hold
// is empty. Else the player reverts all module changes of this session, or
// discards (or, at an Outfitter, sells) the held modules.
import { removeShip, renameShip, setFlagship, sizePoints, upkeepPerDay } from '../../actor/fleet';
import { commandPointsUsed, joinedShips, toggleJoin, wantsToJoin } from '../../actor/fleetBattle';
import {
  type HeldModule,
  installModule,
  type LoadoutSnapshot,
  moveAllCargo,
  moveCargo,
  balanceFuel,
  moveModule,
  restoreLoadout,
  snapshotLoadout,
  uninstallModule,
} from '../../actor/fleetManage';
import { towIfStranded } from '../../career/battleEnd';
import { takePrize } from '../../career/prize';
import type { CombatShip } from '../../combat/types';
import type { Game } from '../../core/game';
import type { TutorialTrigger } from '../../data/schemas';
import type { Location, Ship } from '../../core/types';
import type { SlotSize } from '../../data';
import type { Term } from '../../render/display';
import { HEIGHT } from '../../render/display';
import { drawModuleIcon, moduleShort } from '../../render/icons';
import { palette } from '../../render/palette';
import { drawArt } from '../../render/shipArt';
import { hasService, report } from '../../services/common';
import { moduleName, moduleSellValue } from '../../services/outfitter';
import { sellShip, tradeInValue } from '../../services/shipyard';
import { checkLoadout, type SlotKind, slotSizesOf } from '../../ship/rules';
import { travelStats } from '../../ship/stats';
import type { App, Screen } from '../app';
import { type KeyInput, TextInput } from '../input';
import { drawKeyHints, press } from '../widgets/clicks';
import { drawStatusBar } from '../widgets/statusBar';
import { fit } from '../widgets/text';
import { powerText } from './outfitterTab';

/** A line of the item list: a module slot (empty or not) or a cargo lot. */
type Item = { kind: 'module'; slot: SlotKind; index: number; size: SlotSize } | { kind: 'cargo'; commodity: string };

export interface AfterBattle {
  /** Surrendered ships of the other side (career/prize.ts). */
  boarded: CombatShip[];
}

/** Rows of the screen. */
const LOADOUT_Y = 15;
const HOLD_Y = HEIGHT - 9;
const HOLD_ROWS = 3;
const HOLD_COLS = 2;
const HOLD_W = 50;

export class FleetScreen implements Screen {
  /** Index in the combined list: fleet ships, then boarded ships. */
  private ship = 0;
  private item = 0;
  private notice = '';
  /** A scuttle waits for a second X. */
  private scuttleArmed = false;
  /** The new name while the player types it (N). */
  private nameInput: TextInput | null = null;
  /** Uninstalled modules of this session (one list for the fleet). */
  private held: HeldModule[] = [];
  private holdIndex = 0;
  private focus: 'ship' | 'hold' = 'ship';
  /** The player tried to leave with held modules or a broken loadout. */
  private exitPrompt = false;
  /** The loadouts at the start of the session (prizes: when taken), for revert. */
  private readonly snapshots = new Map<Ship, LoadoutSnapshot>();
  /** Ships that passed the rules at the start: they must pass at the end. */
  private readonly validAtStart = new Set<Ship>();

  constructor(
    private readonly app: App,
    private readonly after: AfterBattle | null = null,
  ) {
    for (const s of this.fleet()) this.remember(s);
  }

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  tutorialTriggers(): TutorialTrigger[] {
    return [this.after ? 'afterBattle' : 'fleet'];
  }

  private remember(s: Ship): void {
    this.snapshots.set(s, snapshotLoadout(s));
    if (checkLoadout(s, this.game.data).errors.length === 0) this.validAtStart.add(s);
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

  private location(): Location | undefined {
    const pos = this.game.state.player.position;
    return pos.kind === 'docked' ? this.game.state.world.locations[pos.locationId] : undefined;
  }

  private docked(): boolean {
    return this.game.state.player.position.kind === 'docked';
  }

  /** Moves are allowed when docked and after a battle (M6-FLEET-10, M6-UI-06). */
  private canManage(): boolean {
    return this.after !== null || this.docked();
  }

  private items(ship: Ship): Item[] {
    const { data } = this.game;
    return [
      ...slotSizesOf(ship, 'hardpoint', data).map((size, index) => ({ kind: 'module', slot: 'hardpoint', index, size }) as Item),
      ...slotSizesOf(ship, 'internal', data).map((size, index) => ({ kind: 'module', slot: 'internal', index, size }) as Item),
      ...Object.keys(ship.cargo).map((commodity) => ({ kind: 'cargo', commodity }) as Item),
    ];
  }

  /** Loadouts that stop the screen from closing. */
  private loadoutProblems(): string[] {
    const { data } = this.game;
    return this.fleet().flatMap((s) => {
      const error = checkLoadout(s, data).errors[0];
      // After a battle each ship must pass; docked, a ship that did not pass at the start (a new hull) may stay as it is.
      return error && (this.after !== null || this.validAtStart.has(s)) ? [`${s.name}: ${error}`] : [];
    });
  }

  private heldValue(): number {
    return this.held.reduce((sum, h) => sum + moduleSellValue(h.module, this.game.data), 0);
  }

  private canSellHeld(): boolean {
    const loc = this.location();
    return !this.after && loc !== undefined && hasService(loc, 'outfitter');
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
        this.focus = 'ship';
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
    const shipFocus = this.focus === 'ship';
    // Loadout: each slot with its size.
    let y = LOADOUT_Y - 1;
    t.text(0, y++, 'Loadout', ui.dim);
    items.forEach((it, i) => {
      if (it.kind !== 'module' || y >= HOLD_Y - 1) return;
      const m = (it.slot === 'hardpoint' ? ship.hardpoints : ship.internal)[it.index] ?? null;
      const bg = i === this.item && shipFocus ? ui.selectBg : undefined;
      if (bg) t.fill(0, y, 38, 1, bg);
      t.text(0, y, `${it.slot === 'hardpoint' ? 'H' : 'I'}${it.index + 1} ${it.size}`, i === this.item ? ui.bright : ui.dim, bg);
      if (m) {
        drawModuleIcon(t, data, 6, y, m);
        t.text(12, y, fit(`${moduleShort(data, m.moduleId)} ${m.size}${m.tier > 1 ? ` T${m.tier}` : ''}`, 16), m.on ? ui.text : ui.dim, bg);
        t.text(30, y, m.on ? 'ON' : 'OFF', m.on ? ui.good : ui.dim, bg);
      } else t.text(6, y, '- empty -', ui.dim, bg);
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
    if (!boarded) {
      // Fleet combat (P1-FS-02): Join or Stay out, and the command points of the hull.
      const isFlag = this.ship === actor.flagshipIndex;
      const joins = joinedShips(actor, data).some((j) => j.id === ship.id);
      const setting = isFlag ? 'Join (flagship)' : wantsToJoin(ship, data) ? (joins ? 'Join' : 'Join (no command points left: stays out)') : 'Stay out';
      stat('Battle', `${setting}; ${sizePoints(ship, data)} command pt`);
    }
    const check = checkLoadout(ship, data);
    for (const e of check.errors.slice(0, 2)) t.text(x, y++, fit(e, 60), ui.danger);
    for (const w of check.warnings.slice(0, 1)) t.text(x, y++, fit(w, 60), ui.warning);

    // Cargo.
    y++;
    t.text(x, y++, 'Cargo            Units   Mass   Paid/unit', ui.dim);
    if (!items.some((it) => it.kind === 'cargo')) t.text(x, y++, 'Empty', ui.dim);
    items.forEach((it, i) => {
      if (it.kind !== 'cargo' || y >= HOLD_Y - 1) return;
      const lot = ship.cargo[it.commodity];
      if (!lot) return;
      const com = data.commodityById.get(it.commodity);
      const bg = i === this.item && shipFocus ? ui.selectBg : undefined;
      if (bg) t.fill(x, y, 46, 1, bg);
      t.text(x, y, fit(com?.name ?? it.commodity, 16), ui.text, bg);
      t.text(x + 16, y, lot.units.toFixed(1).padStart(6), ui.bright, bg);
      t.text(x + 23, y, (lot.units * (com?.massPerUnit ?? 0)).toFixed(1).padStart(6), ui.text, bg);
      t.text(x + 30, y, (boarded ? '-' : String(Math.round(lot.unitCost))).padStart(9), ui.text, bg);
      this.zoneItem(y, 46, i, x);
      y++;
    });

    this.renderHold(t);

    // Notice and keys.
    const fleetLine = `Fleet ${actor.fleet.length}/${data.balance.fleet.maxFleetSize} ships. Command points ${commandPointsUsed(actor, data)}/${data.balance.fleet.commandPoints} in battle. Upkeep ${Math.round(upkeepPerDay(actor, data))} cr/day.`;
    t.text(0, HEIGHT - 5, fit(fleetLine, 99), ui.dim);
    if (this.exitPrompt) {
      this.renderExitPrompt(t);
      return;
    }
    if (this.nameInput) {
      t.text(0, HEIGHT - 4, 'New name: ', ui.dim);
      t.text(10, HEIGHT - 4, `${this.nameInput.value}_`.padEnd(this.nameInput.maxLength + 1), ui.bright, ui.selectBg);
      t.text(33, HEIGHT - 4, 'Enter to apply, Esc to cancel', ui.dim);
    } else if (this.notice) t.text(0, HEIGHT - 4, fit(this.notice, 99), ui.warning);
    else if (!this.canManage()) t.text(0, HEIGHT - 4, 'Dock at a location to move cargo and modules or to change the flagship.', ui.dim);
    else if (!boarded && this.ship !== actor.flagshipIndex) t.text(0, HEIGHT - 4, fit(`F makes ${ship.name} the flagship (the ship that fights; it pays no upkeep).`, 99), ui.dim);
    const row1: [string, string, KeyInput][] = [['Left/Right', 'Ship', press('ArrowRight')], ['Up/Down', 'Item', press('ArrowDown')]];
    if (this.canManage()) {
      row1.push(['U', 'Uninstall', press('u')], ['Enter', 'Install', press('Enter')]);
      if (this.held.length > 0) row1.push(['H', this.focus === 'hold' ? 'Ship list' : 'Hold list', press('h')]);
      row1.push(['1-8', 'Move to ship', press('1')]);
    }
    drawKeyHints(t, this.app.zones, 0, HEIGHT - 3, row1, ui, this.app.press, 2);
    const row2: [string, string, KeyInput][] = [];
    if (this.after && boarded) row2.push(['P', 'Take as prize', press('p')], ['C', 'Take all cargo', press('c')]);
    if (!boarded) row2.push(['F', 'Flagship', press('f')], ['N', 'Rename', press('n')]);
    if (!boarded && actor.fleet.length > 1) row2.push(['J', 'Join/Stay out', press('j')]);
    if (actor.fleet.length > 1) row2.push(['B', 'Balance fuel', press('b')]);
    if (!this.after && this.docked() && !boarded) row2.push(['S', 'Sell ship', press('s')]);
    if (this.after && !boarded) row2.push(['X', 'Scuttle', press('x')]);
    row2.push(['Esc', this.after ? 'Done' : 'Back', press('Escape')]);
    drawKeyHints(t, this.app.zones, 0, HEIGHT - 2, row2, ui, this.app.press, 2);
  }

  /** The fleet hold: uninstalled modules of this session. */
  private renderHold(t: Term): void {
    const { data } = this.game;
    const ui = palette(data).ui;
    if (!this.canManage()) return;
    t.hline(HOLD_Y - 1, 0, 99, '─', ui.border);
    const title =
      this.held.length === 0
        ? 'Fleet hold: empty. U uninstalls the selected module into the hold.'
        : `Fleet hold: ${this.held.length} module${this.held.length === 1 ? '' : 's'}. Enter installs the marked one ${this.focus === 'hold' ? 'on this ship' : 'in the selected empty slot'}.`;
    t.text(0, HOLD_Y, fit(title, 86), this.focus === 'hold' ? ui.bright : ui.dim);
    this.holdIndex = Math.min(this.holdIndex, Math.max(0, this.held.length - 1));
    const per = HOLD_ROWS * HOLD_COLS;
    const first = Math.floor(this.holdIndex / per) * per;
    this.held.slice(first, first + per).forEach((h, j) => {
      const i = first + j;
      const hx = Math.floor(j / HOLD_ROWS) * HOLD_W;
      const hy = HOLD_Y + 1 + (j % HOLD_ROWS);
      const sel = i === this.holdIndex;
      const bg = sel && this.focus === 'hold' ? ui.selectBg : undefined;
      if (bg) t.fill(hx, hy, HOLD_W - 1, 1, bg);
      t.text(hx, hy, sel ? '>' : ' ', ui.bright, bg);
      drawModuleIcon(t, data, hx + 1, hy, h.module);
      t.text(hx + 7, hy, fit(`${moduleShort(data, h.module.moduleId)} ${h.module.size}${h.module.tier > 1 ? ` T${h.module.tier}` : ''} (${h.fromName})`, HOLD_W - 8), sel ? ui.bright : ui.text, bg);
      this.app.zones.add(hx, hy, HOLD_W - 1, () => {
        this.holdIndex = i;
        this.focus = 'hold';
      });
    });
    if (this.held.length > per) t.text(88, HOLD_Y, `${first + 1}-${Math.min(first + per, this.held.length)}/${this.held.length}`, ui.dim);
  }

  private renderExitPrompt(t: Term): void {
    const ui = palette(this.game.data).ui;
    const problems = this.loadoutProblems();
    const parts: string[] = [];
    if (this.held.length > 0) parts.push(`${this.held.length} module${this.held.length === 1 ? ' is' : 's are'} not installed (value ${Math.round(this.heldValue())} cr).`);
    if (problems.length > 0) parts.push(problems[0] as string);
    t.text(0, HEIGHT - 4, fit(parts.join(' '), 99), ui.danger);
    const row: [string, string, KeyInput][] = [['R', 'Revert all module changes and leave', press('r')]];
    if (this.held.length > 0 && problems.length === 0) {
      row.push(['D', 'Discard the held modules and leave', press('d')]);
      if (this.canSellHeld()) row.push(['S', `Sell them (${Math.round(this.heldValue())} cr)`, press('s')]);
    }
    drawKeyHints(t, this.app.zones, 0, HEIGHT - 3, row, ui, this.app.press, 2);
    drawKeyHints(t, this.app.zones, 0, HEIGHT - 2, [['Esc', 'Go back to the fleet screen', press('Escape')]], ui, this.app.press, 2);
  }

  private zoneItem(y: number, w: number, i: number, x = 0): void {
    this.app.zones.add(x, y, w, () => {
      this.item = i;
      this.focus = 'ship';
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
    if (this.exitPrompt) return this.onExitKey(k);
    if (this.nameInput) {
      const r = this.nameInput.handle(k);
      if (r === 'cancel') this.nameInput = null;
      else if (r === 'enter') {
        const old = ship.name;
        const err = renameShip(actor, this.ship, this.nameInput.value);
        if (err) say(err);
        else {
          this.nameInput = null;
          say(old === ship.name ? `The name stays ${ship.name}.` : `${old} is now ${ship.name}.`);
        }
      }
      return true;
    }
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
      if (this.focus === 'hold') {
        const h = this.held[this.holdIndex];
        if (h) this.install(target, h, null);
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
      else {
        const r = moveModule(data, ship, item.slot, item.index, target);
        say(r.ok || r.text === 'The slot is empty.' || r.text === 'Select another ship.' ? r.text : `${r.text} Uninstall it (U) and install it where it fits.`);
      }
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
        if (this.focus === 'hold') this.holdIndex = Math.max(0, this.holdIndex - 1);
        else this.item = Math.max(0, this.item - 1);
        return true;
      case 'ArrowDown':
        if (this.focus === 'hold') this.holdIndex = Math.min(Math.max(0, this.held.length - 1), this.holdIndex + 1);
        else this.item = Math.min(Math.max(0, items.length - 1), this.item + 1);
        return true;
      case 'h':
        if (this.focus === 'hold' || this.held.length === 0) {
          this.focus = 'ship';
          if (this.held.length === 0) say('The fleet hold is empty. U uninstalls the selected module.');
        } else this.focus = 'hold';
        return true;
      case 'u': {
        if (!this.canManage()) {
          say('Dock at a location to uninstall modules.');
          return true;
        }
        if (boarded) {
          say('Take the ship as a prize first, then uninstall its modules.');
          return true;
        }
        if (this.focus !== 'ship' || item?.kind !== 'module') {
          this.focus = 'ship';
          say('Select an installed module in the loadout (Up/Down).');
          return true;
        }
        const r = uninstallModule(data, ship, item.slot, item.index);
        if (r.held) {
          this.held.push(r.held);
          this.holdIndex = this.held.length - 1;
        }
        say(r.ok ? `${r.text} It is in the fleet hold.` : r.text);
        return true;
      }
      case 'Enter': {
        if (!this.canManage()) {
          say('Dock at a location to install modules.');
          return true;
        }
        if (boarded) {
          say('Take the ship as a prize first, then install modules.');
          return true;
        }
        const h = this.held[this.holdIndex];
        if (!h) {
          say('The fleet hold is empty. Uninstall a module first (U).');
          return true;
        }
        if (this.focus === 'hold') {
          this.install(ship, h, null);
          return true;
        }
        if (item?.kind !== 'module') {
          say('Select an empty slot, or press H and select a module in the hold.');
          return true;
        }
        if ((item.slot === 'hardpoint' ? ship.hardpoints : ship.internal)[item.index]) {
          say('The slot is not empty. Uninstall its module first (U).');
          return true;
        }
        this.install(ship, h, item.index);
        return true;
      }
      case 'b':
        say(balanceFuel(data, actor.fleet).text);
        return true;
      case 'j':
        // Fleet combat (P1-FS-02): Join or Stay out of battles; anywhere, no time.
        if (boarded) say('Take the ship as a prize first.');
        else say(toggleJoin(actor, this.ship, data).text);
        return true;
      case 'f':
        if (boarded) {
          say('Take the ship as a prize first.');
          return true;
        }
        say(setFlagship(game, actor, this.ship, this.after !== null) ?? `${ship.name} is now your flagship.`);
        return true;
      case 'n':
        if (boarded) {
          say('Take the ship as a prize first.');
          return true;
        }
        this.nameInput = new TextInput(ship.name);
        this.notice = '';
        return true;
      case 's': {
        if (this.after || boarded) return true;
        const loc = this.location();
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
          if (r.ship) this.remember(r.ship);
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
          say(`Scuttle ${ship.name}? Its cargo and installed modules are lost (U uninstalls a module to keep it). Press X again.`);
          return true;
        }
        removeShip(game, actor, this.ship);
        game.bus.message(`You scuttle ${ship.name}.`, 'warning');
        say(`${ship.name} is scuttled.`);
        return true;
      }
      case 'Escape':
      case 'i':
        this.tryClose();
        return true;
      default:
        return false;
    }
  }

  private install(ship: Ship, h: HeldModule, index: number | null): void {
    const r = installModule(this.game.data, ship, h, index);
    if (r.ok) {
      this.held = this.held.filter((x) => x !== h);
      this.holdIndex = Math.min(this.holdIndex, Math.max(0, this.held.length - 1));
      if (this.held.length === 0) this.focus = 'ship';
    }
    this.notice = r.text;
  }

  /** Keys of the exit prompt: R revert, D discard, S sell, any other key goes back. */
  private onExitKey(k: KeyInput): boolean {
    const game = this.game;
    const ok = this.loadoutProblems().length === 0;
    switch (k.key) {
      case 'r':
        this.revert();
        return true;
      case 'd':
        if (this.held.length > 0 && ok) {
          const names = this.held.map((h) => moduleName(h.module, game.data)).join(', ');
          game.bus.message(`You discard ${this.held.length} uninstalled module${this.held.length === 1 ? '' : 's'}: ${names}.`, 'warning');
          this.held = [];
          this.close();
        }
        return true;
      case 's':
        if (this.held.length > 0 && ok && this.canSellHeld()) {
          const value = this.heldValue();
          game.state.player.credits += value;
          game.bus.message(`You sell ${this.held.length} uninstalled module${this.held.length === 1 ? '' : 's'} at the Outfitter for ${Math.round(value)} cr.`, 'good');
          this.held = [];
          this.close();
        }
        return true;
      default:
        this.exitPrompt = false;
        this.notice = '';
        return true;
    }
  }

  /** Puts each fleet ship back to its loadout at the start of the session; the hold empties. */
  private revert(): void {
    for (const s of this.fleet()) {
      const snap = this.snapshots.get(s);
      if (snap) restoreLoadout(s, snap);
    }
    this.held = [];
    this.focus = 'ship';
    const problems = this.loadoutProblems();
    if (problems.length > 0) {
      this.exitPrompt = false;
      this.notice = `The module changes are reverted, but: ${problems[0]}`;
      return;
    }
    this.game.bus.message('The module changes are reverted.');
    this.close();
  }

  private tryClose(): void {
    if (this.held.length > 0 || this.loadoutProblems().length > 0) {
      this.exitPrompt = true;
      this.notice = '';
      return;
    }
    this.close();
  }

  private close(): void {
    if (this.after) {
      const left = this.boarded().length;
      if (left > 0) this.game.bus.message(`You leave ${left} surrendered ship${left === 1 ? '' : 's'} behind.`);
      // A prize with its engines at 0 cannot move: a tug tows the fleet.
      towIfStranded(this.game, this.game.state.player);
    }
    this.app.pop();
  }

  help(): string[] {
    return [
      this.after ? 'AFTER THE BATTLE' : 'FLEET AND CARGO',
      '',
      'Left/Right, Tab   Select a ship (or click its name)',
      'Up/Down           Select a slot or a cargo line (or a hold module)',
      'U                 Uninstall the selected module into the fleet hold',
      'Enter             Install the selected hold module in the selected',
      '                  empty slot (from the hold list: in the smallest',
      '                  empty slot of the ship that takes it)',
      'H                 Switch between the ship list and the hold list',
      '1-8               Move the selected cargo or module to that ship',
      'F                 Make the selected ship the flagship',
      'N                 Rename the selected fleet ship (type, then Enter)',
      'J                 Join or Stay out: the ship fights in battles, or stays',
      '                  off the map (safe). Joined ships use command points',
      '                  (Small 1, Medium 2, Large 3, Capital 6; at most 6)',
      'B                 Balance fuel: move fuel between the fleet ships, so',
      '                  that all can go about the same distance (also in',
      '                  space; no fee, no time)',
      'S                 Sell the selected ship (at a Shipyard; not the',
      '                  flagship; no cargo)',
      'P, C              Take a surrendered ship as a prize; take its cargo',
      'X, X              Scuttle a fleet ship (after a battle)',
      'Esc               Back. With modules in the hold or a loadout that',
      '                  breaks the rules: R reverts all module changes;',
      '                  D discards the held modules (S sells them at an',
      '                  Outfitter)',
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
