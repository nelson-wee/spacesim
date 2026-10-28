// Region map (Sections 17.1 and 17.2): sectors, lanes, security, and the
// player position. A jump to a connected sector starts here.
import { actorPlace, jump, planJump, planSectorTrip, travelInSector } from '../../actor/travel';
import type { Game } from '../../core/game';
import type { JumpPoint, Sector } from '../../core/types';
import type { Term } from '../../render/display';
import { palette, securityColor, threatBandColor } from '../../render/palette';
import { lineCells } from '../../world/geometry';
import { securityLevelInfo, securityTrend } from '../../world/security';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { LOG_Y, MAP_H, MAP_W, MAP_X, MAP_Y, PANEL_W, PANEL_X } from '../layout';
import { drawKeyHints, press } from '../widgets/clicks';
import { drawRecentLog, drawStatusBar } from '../widgets/statusBar';
import { days, fit, fuelLine } from '../widgets/text';
import { LogScreen } from './log';
import { HailScreen } from './hail';
import { budgetRange, threatBand } from '../../encounter/budget';

export class RegionMapScreen implements Screen {
  private selectedSectorId: number | null = null;

  constructor(private readonly app: App) {}

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  private currentSectorId(): number {
    return actorPlace(this.game, this.game.state.player).sectorId;
  }

  /** Jump points of the current sector, in key order 1-4. */
  private exits(): JumpPoint[] {
    const { world } = this.game.state;
    return (world.sectors[this.currentSectorId()]?.jumpPointIds ?? []).map((id) => world.jumpPoints[id] as JumpPoint);
  }

  render(t: Term): void {
    const game = this.game;
    const { data, state } = game;
    const pal = palette(data);
    const icons = data.art.icons.map;
    drawStatusBar(t, game);
    t.vline(MAP_X + MAP_W, MAP_Y, MAP_Y + MAP_H - 1, '│', pal.ui.border);
    const sectors = state.world.sectors;
    const at = (x: number, y: number, ch: string, fg: string, bg?: string) => t.put(MAP_X + x, MAP_Y + y, ch, fg, bg);

    for (const lane of state.world.lanes) {
      const a = sectors[lane.a] as Sector;
      const b = sectors[lane.b] as Sector;
      for (const c of lineCells(a.pos, b.pos).slice(1, -1)) at(c.x, c.y, icons.lane, pal.map.lane);
    }
    // Names first, so that sector glyphs and security numbers stay on top.
    for (const s of sectors) {
      const sel = s.id === this.selectedSectorId;
      const name = s.name.slice(0, 9);
      at(s.pos.x + 2, s.pos.y, ' ', pal.ui.dim);
      for (let i = 0; i < name.length; i++) at(s.pos.x + 3 + i, s.pos.y, name[i] as string, sel ? pal.ui.highlight : pal.ui.dim);
    }
    const current = this.currentSectorId();
    const exits = this.exits();
    const band = data.art.style.threatBand;
    for (const s of sectors) {
      const level = securityLevelInfo(s.securityValue, data).level;
      const sel = s.id === this.selectedSectorId;
      at(s.pos.x, s.pos.y, icons.sector, pal.map.sun, sel ? pal.ui.selectBg : undefined);
      at(s.pos.x + 1, s.pos.y, String(level), securityColor(data, level));
      // Security trend over 30 days (M5-SEC-03) and the threat band under the name (M5-THREAT-08, Q-18).
      const trend = securityTrend(s);
      if (trend !== 0) at(s.pos.x + 2, s.pos.y, trend > 0 ? '↑' : '↓', trend > 0 ? pal.ui.good : pal.ui.danger);
      const skulls = threatBand(s, data);
      const bandFg = threatBandColor(data.art.style, skulls);
      for (let i = 0; i < band.width; i++) at(s.pos.x + 3 + i, s.pos.y + 1, i < skulls ? band.glyph : band.empty, i < skulls ? bandFg : pal.ui.dim);
      // Left of the sector: @ for the player's sector, or the key for a jump to it.
      const exitIndex = exits.findIndex((j) => j.toSectorId === s.id);
      if (exitIndex >= 0) at(s.pos.x - 1, s.pos.y, String(exitIndex + 1), pal.ui.key, pal.ui.keyBg);
      if (s.id === current) at(s.pos.x - 1, s.pos.y, icons.player, pal.roles.player);
    }

    this.renderPanel(t);
    drawRecentLog(t, game);
  }

  private renderPanel(t: Term): void {
    const game = this.game;
    const { data, state } = game;
    const pal = palette(data);
    const x = PANEL_X;
    let y = 2;
    const line = (text: string, fg: string = pal.ui.text) => {
      t.text(x, y, text, fg, undefined, PANEL_W);
      y++;
    };
    const keyLine = (key: string, text: string) => {
      const k = key.length === 1 ? press(key.toLowerCase()) : press(key);
      this.app.zones.add(x, y, PANEL_W, () => this.app.press(k));
      t.key(x, y, key, pal.ui.key, pal.ui.keyBg);
      t.text(x + 6, y, text, pal.ui.text, undefined, PANEL_W - 6);
      y++;
    };

    line('Region map', pal.ui.title);
    line('* sector  0-4 security level', pal.ui.dim);
    line('↑↓ security trend (30 days)', pal.ui.dim);
    line('!!!·· threat band (1-5)', pal.ui.dim);
    line('1-4 jump key  @ you are here', pal.ui.dim);
    y++;
    line('Jumps from here', pal.ui.dim);
    this.exits().forEach((jp, i) => {
      const to = state.world.sectors[jp.toSectorId] as Sector;
      const sel = to.id === this.selectedSectorId;
      this.app.zones.add(x, y, PANEL_W, () => {
        this.selectedSectorId = to.id;
      });
      t.text(x, y, String(i + 1), pal.ui.key, pal.ui.keyBg);
      t.text(x + 2, y, fit(to.name, 12), sel ? pal.ui.highlight : pal.ui.text);
      t.text(x + 15, y, `lane ${state.world.lanes[jp.laneId]?.length.toFixed(1) ?? '?'}`, pal.ui.dim);
      y++;
    });
    y++;

    const sel = this.selectedSectorId === null ? null : state.world.sectors[this.selectedSectorId];
    if (sel) {
      const sec = securityLevelInfo(sel.securityValue, data);
      line(`Sector ${sel.name} (${sel.code})`, pal.ui.highlight);
      line(`Development: ${sel.development}`, pal.development[sel.development]);
      const trend = securityTrend(sel);
      line(`Security ${sec.level} ${sec.name} (${Math.round(sel.securityValue)}) ${trend > 0 ? '↑ rising' : trend < 0 ? '↓ falling' : 'flat'}`, securityColor(data, sec.level));
      const [lo, hi] = budgetRange(sel, data);
      line(`Threat band ${threatBand(sel, data)}: pirate groups ${Math.round(lo)}-${Math.round(hi)} TU`, pal.ui.text);
      line(`Baseline ${Math.round(sel.securityBaseline)}, jumps from core ${sel.jumpsFromCore}`, pal.ui.dim);
      line(`Locations: ${sel.locationIds.length}`, pal.ui.dim);
      y++;
      const exit = this.exits().find((j) => j.toSectorId === sel.id);
      if (sel.id === this.currentSectorId()) {
        line('You are in this sector.', pal.ui.dim);
      } else if (!exit) {
        line('No lane from your sector.', pal.ui.dim);
      } else {
        const player = state.player;
        const atExit = player.position.kind === 'jumpPoint' && player.position.jumpPointId === exit.id;
        const toJp = atExit ? null : planSectorTrip(game, player, { kind: 'jumpPoint', jumpPointId: exit.id });
        const jumpPlan = planJump(game, player, exit.id);
        const i = jumpPlan.lowestRangeShip;
        const need = (toJp?.fuelNeed[i] ?? 0) + (jumpPlan.fuelNeed[i] ?? 0);
        const have = player.fleet[i]?.fuel ?? 0;
        if (toJp) line(`To jump point: ${days(toJp.days)}`);
        line(`Jump: ${days(jumpPlan.days)}, lane ${jumpPlan.distance.toFixed(1)}`);
        line(fuelLine(have, need, player.fleet.length > 1 ? player.fleet[i]?.name : undefined));
        if (have < need) {
          line('WARNING: fuel is not sufficient.', pal.ui.warning);
          line('The fleet will need a tow.', pal.ui.warning);
        }
        keyLine('Enter', 'Jump (via the jump point)');
      }
    } else {
      line('Select a sector: 1-4, Tab,', pal.ui.dim);
      line('or click it on the map.', pal.ui.dim);
    }

    y = Math.max(y + 1, LOG_Y - 4);
    keyLine('Esc', 'Sector map');
    drawKeyHints(t, this.app.zones, x, y++, [['L', 'Log', press('l')], ['?', 'Help', press('?')]], pal.ui, this.app.press, 2);
  }

  onKey(k: KeyInput): boolean {
    const game = this.game;
    const exits = this.exits();
    const n = Number(k.key);
    if (k.key.length === 1 && n >= 1 && n <= 4) {
      const jp = exits[n - 1];
      if (jp) this.selectedSectorId = jp.toSectorId;
      return true;
    }
    switch (k.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        // Step through the sectors that a lane connects to.
        const ids = exits.map((j) => j.toSectorId);
        const now = this.selectedSectorId === null ? -1 : ids.indexOf(this.selectedSectorId);
        const step = k.key === 'ArrowDown' ? 1 : ids.length - 1;
        this.selectedSectorId = ids[now < 0 ? 0 : (now + step) % ids.length] ?? this.selectedSectorId;
        return true;
      }
      case 'Tab': {
        const count = game.state.world.sectors.length;
        const step = k.shift ? count - 1 : 1;
        this.selectedSectorId = this.selectedSectorId === null ? this.currentSectorId() : (this.selectedSectorId + step) % count;
        return true;
      }
      case 'Enter':
        this.travelToSelected();
        return true;
      case 'l':
        this.app.push(new LogScreen(this.app));
        return true;
      case 'm':
        this.app.pop();
        return true;
      default:
        return false;
    }
  }

  /** Travel to the jump point (if needed), then jump. Stops after a tow. */
  private travelToSelected(): void {
    const game = this.game;
    const player = game.state.player;
    const exit = this.exits().find((j) => j.toSectorId === this.selectedSectorId);
    if (!exit) return;
    const atExit = player.position.kind === 'jumpPoint' && player.position.jumpPointId === exit.id;
    if (!atExit) {
      const out = travelInSector(game, player, { kind: 'jumpPoint', jumpPointId: exit.id }, true);
      if (out.result === 'encounter') {
        this.app.pop();
        this.app.push(new HailScreen(this.app, out.encounter));
        return;
      }
      if (out.result !== 'arrived') {
        if (out.result === 'refused') game.bus.message(out.reason, 'warning');
        return;
      }
    }
    const out = jump(game, player, true);
    if (out.result === 'refused') game.bus.message(out.reason, 'warning');
    this.app.pop();
    if (out.result === 'encounter') this.app.push(new HailScreen(this.app, out.encounter));
  }

  onClick(x: number, y: number): void {
    const mx = x - MAP_X;
    const my = y - MAP_Y;
    const s = this.game.state.world.sectors.find((c) => Math.abs(c.pos.x - mx) <= 1 && c.pos.y === my);
    if (s) this.selectedSectorId = s.id;
  }

  help(): string[] {
    return [
      'REGION MAP',
      '',
      '1-4      Select a sector that a lane connects to',
      'Up/Down  Step through the sectors that a lane connects to',
      'Tab      Select the next sector (Shift+Tab: back)',
      'Click    Select a sector on the map',
      'Enter    Go to the jump point and jump to the selected sector',
      'Esc, M   Back to the sector map',
      'L        Log',
      '',
      'Each * is a sector. The number after it is its security',
      'level: 0 Lawless, 1 Low, 2 Medium, 3 High, 4 Secure.',
      'A yellow number before a sector is the key for a jump to it.',
      '@ shows your sector.',
    ];
  }
}
