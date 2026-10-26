// Region map (Sections 17.1 and 17.2): sectors, lanes, security, and the
// player position. A jump to a connected sector starts here.
import { actorPlace, jump, planJump, planSectorTrip, travelInSector } from '../../actor/travel';
import type { Game } from '../../core/game';
import type { JumpPoint, Sector } from '../../core/types';
import type { Term } from '../../render/display';
import { securityColor, starColor } from '../../render/palette';
import { lineCells } from '../../world/geometry';
import { securityLevelInfo } from '../../world/security';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { LOG_Y, MAP_H, MAP_W, MAP_X, MAP_Y, PANEL_W, PANEL_X } from '../layout';
import { drawRecentLog, drawStatusBar } from '../widgets/statusBar';
import { days, fit, fuelLine } from '../widgets/text';
import { LogScreen } from './log';

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
    const pal = data.art.palette;
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
    for (const s of sectors) {
      const level = securityLevelInfo(s.securityValue, data).level;
      const sel = s.id === this.selectedSectorId;
      at(s.pos.x, s.pos.y, icons.sector, starColor(data, s.star), sel ? pal.ui.selectBg : undefined);
      at(s.pos.x + 1, s.pos.y, String(level), securityColor(data, level));
      // Left of the sector: @ for the player's sector, or the key for a jump to it.
      const exitIndex = exits.findIndex((j) => j.toSectorId === s.id);
      if (exitIndex >= 0) at(s.pos.x - 1, s.pos.y, String(exitIndex + 1), pal.ui.key);
      if (s.id === current) at(s.pos.x - 1, s.pos.y, icons.player, pal.roles.player);
    }

    this.renderPanel(t);
    drawRecentLog(t, game);
  }

  private renderPanel(t: Term): void {
    const game = this.game;
    const { data, state } = game;
    const pal = data.art.palette;
    const x = PANEL_X;
    let y = 2;
    const line = (text: string, fg: string = pal.ui.text) => {
      t.text(x, y, text, fg, undefined, PANEL_W);
      y++;
    };
    const keyLine = (key: string, text: string) => {
      t.text(x, y, fit(key, 6), pal.ui.key);
      t.text(x + 6, y, text, pal.ui.text, undefined, PANEL_W - 6);
      y++;
    };

    line('Region map', pal.ui.title);
    line('* sector  0-4 security level', pal.ui.dim);
    line('1-4 jump key  @ you are here', pal.ui.dim);
    y++;
    line('Jumps from here', pal.ui.dim);
    this.exits().forEach((jp, i) => {
      const to = state.world.sectors[jp.toSectorId] as Sector;
      const sel = to.id === this.selectedSectorId;
      t.text(x, y, String(i + 1), pal.ui.key);
      t.text(x + 2, y, fit(to.name, 12), sel ? pal.ui.highlight : pal.ui.text);
      t.text(x + 15, y, `lane ${state.world.lanes[jp.laneId]?.length.toFixed(1) ?? '?'}`, pal.ui.dim);
      y++;
    });
    y++;

    const sel = this.selectedSectorId === null ? null : state.world.sectors[this.selectedSectorId];
    if (sel) {
      const sec = securityLevelInfo(sel.securityValue, data);
      line(`Sector ${sel.name}`, pal.ui.highlight);
      line(`Development: ${sel.development}`, pal.development[sel.development]);
      line(`Security ${sec.level} ${sec.name} (${Math.round(sel.securityValue)})`, securityColor(data, sec.level));
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
    keyLine('L', 'Log    ? Help');
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
      const out = travelInSector(game, player, { kind: 'jumpPoint', jumpPointId: exit.id });
      if (out.result !== 'arrived') {
        if (out.result === 'refused') game.bus.message(out.reason, 'warning');
        return;
      }
    }
    const out = jump(game, player);
    if (out.result === 'refused') game.bus.message(out.reason, 'warning');
    this.app.pop();
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
