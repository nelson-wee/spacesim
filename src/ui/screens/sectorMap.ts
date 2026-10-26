// Sector map (Sections 17.1 and 17.2): star, orbit rings, locations, jump
// points, and the player. Travel in the sector and jumps start here.
import {
  actorPlace,
  type Destination,
  jump,
  planJump,
  planSectorTrip,
  type TripPlan,
  travelInSector,
} from '../../actor/travel';
import type { Game } from '../../core/game';
import type { JumpPoint, Location, Vec } from '../../core/types';
import type { Term } from '../../render/display';
import { techColor, securityColor } from '../../render/palette';
import { quoteRefuel, refuelFleet } from '../../services/refuel';
import { ringPoint } from '../../world/geometry';
import { locationTypeName } from '../../world/location';
import { securityLevelInfo } from '../../world/security';
import { sectorCenter } from '../../world/bodies';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { LOG_Y, MAP_H, MAP_W, MAP_X, MAP_Y, PANEL_W, PANEL_X } from '../layout';
import { drawRecentLog, drawStatusBar, formatCredits } from '../widgets/statusBar';
import { days, fit, fuelLine } from '../widgets/text';
import { LogScreen } from './log';
import { RegionMapScreen } from './regionMap';

const LOCATION_KEYS = 'abcdef';
const JUMP_KEYS = '1234';

export class SectorMapScreen implements Screen {
  private selected: Destination | null = null;

  constructor(private readonly app: App) {}

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  private sectorId(): number {
    return actorPlace(this.game, this.game.state.player).sectorId;
  }

  private locations(): Location[] {
    const { world } = this.game.state;
    return (world.sectors[this.sectorId()]?.locationIds ?? []).map((id) => world.locations[id] as Location);
  }

  private jumpPoints(): JumpPoint[] {
    const { world } = this.game.state;
    return (world.sectors[this.sectorId()]?.jumpPointIds ?? []).map((id) => world.jumpPoints[id] as JumpPoint);
  }

  private isSelected(dest: Destination): boolean {
    const s = this.selected;
    if (!s) return false;
    if (s.kind === 'location' && dest.kind === 'location') return s.locationId === dest.locationId;
    if (s.kind === 'jumpPoint' && dest.kind === 'jumpPoint') return s.jumpPointId === dest.jumpPointId;
    return false;
  }

  render(t: Term): void {
    const game = this.game;
    const { data } = game;
    const pal = data.art.palette;
    const icons = data.art.icons.map;
    drawStatusBar(t, game);
    t.vline(MAP_X + MAP_W, MAP_Y, MAP_Y + MAP_H - 1, '│', pal.ui.border);

    const aspect = data.balance.world.cellAspect;
    const center = sectorCenter(data);
    const at = (p: Vec, ch: string, fg: string, bg?: string) => t.put(MAP_X + p.x, MAP_Y + p.y, ch, fg, bg);

    // Orbit rings.
    for (const r of data.balance.sectorMap.bodyRingRadii) {
      const steps = Math.ceil(r * aspect * 8);
      for (let i = 0; i < steps; i++) at(ringPoint(center, r, (i / steps) * Math.PI * 2, aspect), icons.orbit, pal.map.orbit);
    }
    const sector = game.state.world.sectors[this.sectorId()];
    if (!sector) return;
    at(center, icons.star, pal.stars[sector.star] ?? pal.ui.bright);

    // Jump points and locations, with their keys.
    this.jumpPoints().forEach((jp, i) => {
      const sel = this.isSelected({ kind: 'jumpPoint', jumpPointId: jp.id });
      at(jp.pos, icons.jumpPoint, pal.map.jumpPoint, sel ? pal.ui.selectBg : undefined);
      at({ x: jp.pos.x + 1, y: jp.pos.y }, JUMP_KEYS[i] ?? '?', pal.ui.key);
    });
    this.locations().forEach((loc, i) => {
      const glyph = loc.kind === 'station' ? icons.station : loc.size >= 2 ? icons.planetLarge : icons.planetSmall;
      const sel = this.isSelected({ kind: 'location', locationId: loc.id });
      at(loc.pos, glyph, techColor(data, loc.techLevel), sel ? pal.ui.selectBg : undefined);
      at({ x: loc.pos.x + 1, y: loc.pos.y }, LOCATION_KEYS[i] ?? '?', pal.ui.key);
    });

    // The player.
    const place = actorPlace(game, game.state.player);
    const p = game.state.player.position;
    at(p.kind === 'space' ? { x: Math.round(place.point.x), y: Math.round(place.point.y) } : { x: place.point.x - 1, y: place.point.y }, icons.player, pal.roles.player);

    this.renderPanel(t);
    drawRecentLog(t, game);
  }

  private renderPanel(t: Term): void {
    const game = this.game;
    const { data, state } = game;
    const pal = data.art.palette;
    const sector = state.world.sectors[this.sectorId()];
    if (!sector) return;
    let y = 2;
    const x = PANEL_X;
    const line = (text: string, fg: string = pal.ui.text) => {
      t.text(x, y, text, fg, undefined, PANEL_W);
      y++;
    };
    const keyLine = (key: string, text: string, fg: string = pal.ui.text) => {
      t.text(x, y, fit(key, 6), pal.ui.key);
      t.text(x + 6, y, text, fg, undefined, PANEL_W - 6);
      y++;
    };

    line(`Sector ${sector.name}`, pal.ui.title);
    const sec = securityLevelInfo(sector.securityValue, data);
    t.text(x, y, `${cap(sector.development)} `, pal.development[sector.development]);
    t.text(x + sector.development.length + 1, y, `Security ${sec.level} ${sec.name} (${Math.round(sector.securityValue)})`, securityColor(data, sec.level));
    y += 2;

    line('Locations', pal.ui.dim);
    this.locations().forEach((loc, i) => {
      const sel = this.isSelected({ kind: 'location', locationId: loc.id });
      t.text(x, y, LOCATION_KEYS[i] ?? '?', pal.ui.key);
      t.text(x + 2, y, fit(loc.name, 11), sel ? pal.ui.highlight : techColor(data, loc.techLevel));
      t.text(x + 14, y, locationTypeName(loc, data), pal.ui.dim, undefined, PANEL_W - 14);
      y++;
    });
    y++;
    line('Jump points', pal.ui.dim);
    this.jumpPoints().forEach((jp, i) => {
      const sel = this.isSelected({ kind: 'jumpPoint', jumpPointId: jp.id });
      const to = state.world.sectors[jp.toSectorId];
      const lane = state.world.lanes[jp.laneId];
      t.text(x, y, JUMP_KEYS[i] ?? '?', pal.ui.key);
      t.text(x + 2, y, fit(`to ${to?.name ?? '?'}`, 16), sel ? pal.ui.highlight : pal.ui.text);
      t.text(x + 19, y, `lane ${lane?.length.toFixed(1) ?? '?'}`, pal.ui.dim);
      y++;
    });
    y++;

    // Selected target and its plan.
    const player = state.player;
    if (this.selected) {
      const plan = planSectorTrip(game, player, this.selected);
      line(`Target: ${plan.destinationName}`, pal.ui.highlight);
      if (!plan.possible) line(plan.reason ?? 'Not possible.', pal.ui.dim);
      else this.planLines(plan, line);
      if (plan.possible) keyLine('Enter', 'Go there');
    } else {
      line('Select a target: a-f or 1-4,', pal.ui.dim);
      line('or click it on the map.', pal.ui.dim);
    }

    y = Math.max(y + 1, LOG_Y - 7);
    if (player.position.kind === 'jumpPoint') {
      const jplan = planJump(game, player);
      if (jplan.possible) {
        keyLine('J', `Jump to ${jplan.destinationName} (${days(jplan.days)})`);
        if (!jplan.enoughFuel) line('  Fuel is not sufficient!', pal.ui.warning);
      }
    }
    if (player.position.kind === 'docked') {
      const loc = state.world.locations[player.position.locationId] as Location;
      const q = quoteRefuel(game, player, loc);
      keyLine('R', q.units > 0 ? `Refuel ${q.units.toFixed(1)} for ${formatCredits(q.cost)}` : 'Refuel (tanks are full)');
    }
    keyLine('M', 'Region map');
    keyLine('L', 'Log    ? Help');
  }

  private planLines(plan: TripPlan, line: (text: string, fg?: string) => void): void {
    const pal = this.game.data.art.palette;
    const i = plan.lowestRangeShip;
    const ship = this.game.state.player.fleet[i];
    const need = plan.fuelNeed[i] ?? 0;
    const have = plan.fuelHave[i] ?? 0;
    line(`Distance ${plan.distance.toFixed(1)}   Time ${days(plan.days)}`);
    line(fuelLine(have, need, this.game.state.player.fleet.length > 1 ? ship?.name : undefined));
    if (!plan.enoughFuel) {
      line('WARNING: fuel is not sufficient.', pal.ui.warning);
      line('The fleet will need a tow.', pal.ui.warning);
    }
  }

  onKey(k: KeyInput): boolean {
    const game = this.game;
    const player = game.state.player;
    const li = LOCATION_KEYS.indexOf(k.key);
    if (k.key.length === 1 && li >= 0) {
      const loc = this.locations()[li];
      if (loc) this.selected = { kind: 'location', locationId: loc.id };
      return true;
    }
    const ji = JUMP_KEYS.indexOf(k.key);
    if (k.key.length === 1 && ji >= 0) {
      const jp = this.jumpPoints()[ji];
      if (jp) this.selected = { kind: 'jumpPoint', jumpPointId: jp.id };
      return true;
    }
    switch (k.key) {
      case 'Enter':
        if (this.selected) {
          const out = travelInSector(game, player, this.selected);
          if (out.result === 'refused') game.bus.message(out.reason, 'warning');
          this.selected = null;
        }
        return true;
      case 'j': {
        if (player.position.kind !== 'jumpPoint') {
          game.bus.message('Go to a jump point first.', 'warning');
          return true;
        }
        const out = jump(game, player);
        if (out.result === 'refused') game.bus.message(out.reason, 'warning');
        this.selected = null;
        return true;
      }
      case 'r':
        refuelFleet(game, player);
        return true;
      case 'm':
        this.app.push(new RegionMapScreen(this.app));
        return true;
      case 'l':
        this.app.push(new LogScreen(this.app));
        return true;
      case 'Escape':
        if (!this.selected) return false;
        this.selected = null;
        return true;
      default:
        return false;
    }
  }

  onClick(x: number, y: number): void {
    const mx = x - MAP_X;
    const my = y - MAP_Y;
    if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return;
    const near = (p: Vec) => Math.abs(p.x - mx) <= 1 && Math.abs(p.y - my) <= 0;
    const loc = this.locations().find((l) => near(l.pos));
    if (loc) {
      this.selected = { kind: 'location', locationId: loc.id };
      return;
    }
    const jp = this.jumpPoints().find((j) => near(j.pos));
    if (jp) this.selected = { kind: 'jumpPoint', jumpPointId: jp.id };
  }

  help(): string[] {
    return [
      'SECTOR MAP',
      '',
      'a-f      Select a location',
      '1-4      Select a jump point',
      'Click    Select a target on the map',
      'Enter    Travel to the target (and dock at a location)',
      'J        Jump to the next sector (at a jump point)',
      'R        Refuel all ships (when docked)',
      'M        Region map',
      'L        Log',
      'Esc      Clear the target',
      '',
      'Travel uses time and fuel. Docking at a planet uses fuel',
      '(gravity). If fuel goes to 0, a tug tows the fleet to the',
      'nearest location, and you pay a recovery fee.',
    ];
  }
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
