// Fleet and cargo screen (Section 17.1): for each ship, the portrait,
// loadout, derived stats, fuel, and cargo with the purchase price per unit.
import type { Game } from '../../core/game';
import type { Ship } from '../../core/types';
import type { Term } from '../../render/display';
import { HEIGHT } from '../../render/display';
import { drawModuleIcon, moduleShort } from '../../render/icons';
import { palette } from '../../render/palette';
import { drawArt } from '../../render/shipArt';
import { checkLoadout } from '../../ship/rules';
import { travelStats } from '../../ship/stats';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { drawStatusBar } from '../widgets/statusBar';
import { fit } from '../widgets/text';

export class FleetScreen implements Screen {
  private ship = 0;

  constructor(private readonly app: App) {}

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  render(t: Term): void {
    const game = this.game;
    const { data } = game;
    const ui = palette(data).ui;
    const actor = game.state.player;
    drawStatusBar(t, game);
    this.ship = Math.min(this.ship, actor.fleet.length - 1);
    t.text(0, 2, 'Fleet and cargo', ui.title);
    actor.fleet.forEach((s, i) => {
      t.text(20 + i * 22, 2, fit(`${i === actor.flagshipIndex ? '*' : ' '}${s.name}`, 20), i === this.ship ? ui.bright : ui.dim, i === this.ship ? ui.selectBg : undefined);
    });
    t.hline(3, 0, 99, '─', ui.border);
    const ship = actor.fleet[this.ship] as Ship;
    const s = travelStats(ship, data);
    const hull = data.hullById.get(ship.hullId);
    t.text(0, 4, `${ship.name}: ${hull?.name ?? ship.hullId} (${hull?.sizeClass ?? ''})`, ui.title);
    const art = data.art.ships.ships[ship.hullId];
    if (art) drawArt(t, data, art.portrait, 1, 5, { side: 'player' });

    // Loadout.
    let y = 14;
    t.text(0, y++, 'Loadout', ui.dim);
    const mods: [string, Ship['internal'][number]][] = [
      ...ship.hardpoints.map((m, i) => [`H${i + 1}`, m] as [string, Ship['internal'][number]]),
      ...ship.internal.map((m, i) => [`I${i + 1}`, m] as [string, Ship['internal'][number]]),
    ];
    for (const [label, m] of mods) {
      t.text(0, y, label, ui.dim);
      if (m) {
        drawModuleIcon(t, data, 4, y, m);
        t.text(10, y, fit(moduleShort(data, m.moduleId), 16), m.on ? ui.text : ui.dim);
        t.text(27, y, m.on ? 'ON' : 'OFF', m.on ? ui.good : ui.dim);
      } else t.text(4, y, '- empty -', ui.dim);
      y++;
    }

    // Derived stats.
    const x = 40;
    y = 4;
    const stat = (label: string, value: string) => {
      t.text(x, y, fit(label, 14), ui.dim);
      t.text(x + 14, y++, value, ui.text);
    };
    stat('Mass', `${s.mass.toFixed(1)} t (cargo ${s.cargoMass.toFixed(1)} t)`);
    stat('TWR / agility', `${s.twr.toFixed(2)} / ${s.agility.toFixed(2)}`);
    stat('Move / maneuver', `${s.move} / ${Math.round(s.maneuver)}`);
    stat('Power', `${s.powerDraw}/${s.powerSupply} (all ON ${s.powerDrawAll})`);
    stat('Heat', `+${s.heatPerTurn.toFixed(0)}/turn, cooling ${s.cooling}, capacity ${s.heatCapacity}`);
    stat('Shields', `${s.shieldCapacity} (regen ${s.shieldRegen})`);
    stat('Hull / armor', `${Math.round(ship.hullHp)}/${s.maxHullHp} HP, armor ${s.armor}, plating ${Math.round(ship.armorHp)}/${s.maxArmorHp}`);
    stat('Engine value', `${ship.engineValue.toFixed(0)}/${s.maxEngineValue}`);
    stat('Durability', String(s.durability));
    stat('Fuel', `${ship.fuel.toFixed(1)}/${s.fuelCapacity}, ${s.fuelPerJump.toFixed(1)} per jump`);
    stat('Cargo', `${s.cargoMass.toFixed(1)}/${s.cargoCapacity} t`);
    const check = checkLoadout(ship, data);
    for (const e of check.errors) t.text(x, y++, fit(e, 60), ui.danger);
    for (const w of check.warnings) t.text(x, y++, fit(w, 60), ui.warning);

    // Cargo.
    y++;
    t.text(x, y++, 'Cargo            Units   Mass   Paid/unit', ui.dim);
    const lots = Object.entries(ship.cargo);
    if (lots.length === 0) t.text(x, y++, 'Empty', ui.dim);
    for (const [c, lot] of lots) {
      const com = data.commodityById.get(c);
      t.text(x, y, fit(com?.name ?? c, 16), ui.text);
      t.text(x + 16, y, lot.units.toFixed(1).padStart(6), ui.bright);
      t.text(x + 23, y, (lot.units * (com?.massPerUnit ?? 0)).toFixed(1).padStart(6), ui.text);
      t.text(x + 30, y++, String(Math.round(lot.unitCost)).padStart(9), ui.text);
    }
    let kx = 0;
    for (const [key, text] of [['[ ]', 'Ship'], ['Esc', 'Back']] as const) {
      kx = t.key(kx, HEIGHT - 1, key, ui.key, ui.keyBg);
      kx = t.text(kx, HEIGHT - 1, ` ${text}  `, ui.text);
    }
  }

  onKey(k: KeyInput): boolean {
    const n = this.game.state.player.fleet.length;
    if (k.key === '[') this.ship = Math.max(0, this.ship - 1);
    else if (k.key === ']') this.ship = Math.min(n - 1, this.ship + 1);
    else if (k.key === 'i') this.app.pop();
    else return false;
    return true;
  }

  help(): string[] {
    return ['FLEET AND CARGO', '', '[ ]   Select a ship', 'Esc   Back', '', 'Select a flagship, move cargo, and sell ships come with fleets (M6).'];
  }
}
