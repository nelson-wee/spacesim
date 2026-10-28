// Sector map (Sections 17.1 and 17.2): star, orbit rings, locations, jump
// points, and the player. Travel in the sector and jumps start here.
import {
  actorPlace,
  type Destination,
  jump,
  planJump,
  planSectorTrip,
  type TripPlan,
  hunt,
  travelInSector,
} from '../../actor/travel';
import { knowsLocation, priceView } from '../../actor/knowledge';
import type { Game } from '../../core/game';
import type { JumpPoint, Location, Vec } from '../../core/types';
import type { Term } from '../../render/display';
import { palette, securityColor, techColor } from '../../render/palette';
import { report } from '../../services/common';
import { marketRole } from '../../services/market';
import { quoteRefuel, refuel } from '../../services/refuel';
import { ringPoint } from '../../world/geometry';
import { shortCode } from '../../world/codes';
import { locationTypeName } from '../../world/location';
import { securityLevelInfo } from '../../world/security';
import { sectorCenter } from '../../world/bodies';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { LOG_Y, MAP_H, MAP_W, MAP_X, MAP_Y, PANEL_W, PANEL_X } from '../layout';
import { drawKeyHints, press } from '../widgets/clicks';
import { drawRecentLog, drawStatusBar, formatCredits } from '../widgets/statusBar';
import { days, fit, fuelLine } from '../widgets/text';
import { FleetScreen } from './fleet';
import { LocationScreen } from './location';
import { LogScreen } from './log';
import { TradeLedgerScreen } from './tradeLedger';
import { RegionMapScreen } from './regionMap';
import { HailScreen } from './hail';

const LOCATION_KEYS = 'abcdef';
const JUMP_KEYS = '1234';

export class SectorMapScreen implements Screen {
  private selected: Destination | null = null;
  /** Route view: the selected commodity, or null. */
  private routeCommodity: string | null = null;

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
    const pal = palette(data);
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
    at(center, icons.star, pal.map.sun);

    // Jump points and locations, with their keys.
    this.jumpPoints().forEach((jp, i) => {
      const sel = this.isSelected({ kind: 'jumpPoint', jumpPointId: jp.id });
      at(jp.pos, icons.jumpPoint, pal.map.jumpPoint, sel ? pal.ui.selectBg : undefined);
      at({ x: jp.pos.x + 1, y: jp.pos.y }, JUMP_KEYS[i] ?? '?', pal.ui.key, pal.ui.keyBg);
    });
    this.locations().forEach((loc, i) => {
      const glyph = loc.kind === 'station' ? icons.station : loc.size >= 2 ? icons.planetLarge : icons.planetSmall;
      const sel = this.isSelected({ kind: 'location', locationId: loc.id });
      at(loc.pos, glyph, techColor(data, loc.techLevel), sel ? pal.ui.selectBg : undefined);
      at({ x: loc.pos.x + 1, y: loc.pos.y }, LOCATION_KEYS[i] ?? '?', pal.ui.key, pal.ui.keyBg);
    });

    if (this.routeCommodity) this.renderRouteView(t, this.routeCommodity);

    // The player.
    const place = actorPlace(game, game.state.player);
    const p = game.state.player.position;
    at(p.kind === 'space' ? { x: Math.round(place.point.x), y: Math.round(place.point.y) } : { x: place.point.x - 1, y: place.point.y }, icons.player, pal.roles.player);

    this.renderPanel(t);
    drawRecentLog(t, game);
  }

  /**
   * Route view (Section 17.2): each known location shows its known price of one
   * commodity, colored by its difference from the average known price. "+"
   * marks a location that makes it; "-" a location that needs it.
   */
  private renderRouteView(t: Term, commodity: string): void {
    const game = this.game;
    const { data } = game;
    const ui = palette(data).ui;
    const actor = game.state.player;
    const views = game.state.world.locations
      .map((l) => priceView(game, actor, l, commodity))
      .filter((v) => v.source !== 'unknown');
    const avg = views.length ? views.reduce((s, v) => s + v.mid, 0) / views.length : 0;
    t.text(MAP_X + 1, MAP_Y, `Route view: ${data.commodityById.get(commodity)?.name ?? commodity}  (V next, Shift+V off)`, ui.bright);
    for (const loc of this.locations()) {
      if (!knowsLocation(actor, loc)) continue;
      const v = priceView(game, actor, loc, commodity);
      if (v.source === 'unknown' || !loc.market[commodity]) continue;
      const role = marketRole(loc, commodity, data);
      const mark = role === 'sells' ? '+' : role === 'buys' ? '-' : ' ';
      const price = role === 'sells' ? v.buy : v.sell;
      const diff = avg > 0 ? v.mid / avg - 1 : 0;
      const color = diff <= -0.15 ? ui.good : diff >= 0.15 ? ui.danger : ui.text;
      t.text(MAP_X + loc.pos.x + 3, MAP_Y + loc.pos.y, `${mark}${Math.round(price)}`, color);
    }
  }

  private renderPanel(t: Term): void {
    const game = this.game;
    const { data, state } = game;
    const pal = palette(data);
    const sector = state.world.sectors[this.sectorId()];
    if (!sector) return;
    let y = 2;
    const x = PANEL_X;
    const line = (text: string, fg: string = pal.ui.text) => {
      t.text(x, y, text, fg, undefined, PANEL_W);
      y++;
    };
    const zones = this.app.zones;
    const keyLine = (key: string, text: string, fg: string = pal.ui.text) => {
      // A click on the line does the same as its key.
      const k = key.length === 1 ? press(key.toLowerCase()) : press(key);
      zones.add(x, y, PANEL_W, () => this.app.press(k));
      t.key(x, y, key, pal.ui.key, pal.ui.keyBg);
      t.text(x + 6, y, text, fg, undefined, PANEL_W - 6);
      y++;
    };

    line(`Sector ${sector.name} (${sector.code})`, pal.ui.title);
    const sec = securityLevelInfo(sector.securityValue, data);
    t.text(x, y, `${cap(sector.development)} `, pal.development[sector.development]);
    t.text(x + sector.development.length + 1, y, `Security ${sec.level} ${sec.name} (${Math.round(sector.securityValue)})`, securityColor(data, sec.level));
    y += 2;

    line('Locations', pal.ui.dim);
    this.locations().forEach((loc, i) => {
      const sel = this.isSelected({ kind: 'location', locationId: loc.id });
      zones.add(x, y, PANEL_W, () => {
        this.selected = { kind: 'location', locationId: loc.id };
      });
      t.text(x, y, LOCATION_KEYS[i] ?? '?', pal.ui.key, pal.ui.keyBg);
      t.text(x + 2, y, fit(loc.name, 10), sel ? pal.ui.highlight : techColor(data, loc.techLevel));
      t.text(x + 13, y, fit(shortCode(state.world, loc, data), 4), pal.ui.bright);
      t.text(x + 17, y, locationTypeName(loc, data), pal.ui.dim, undefined, PANEL_W - 17);
      y++;
    });
    y++;
    line('Jump points', pal.ui.dim);
    this.jumpPoints().forEach((jp, i) => {
      const sel = this.isSelected({ kind: 'jumpPoint', jumpPointId: jp.id });
      const to = state.world.sectors[jp.toSectorId];
      const lane = state.world.lanes[jp.laneId];
      zones.add(x, y, PANEL_W, () => {
        this.selected = { kind: 'jumpPoint', jumpPointId: jp.id };
      });
      t.text(x, y, JUMP_KEYS[i] ?? '?', pal.ui.key, pal.ui.keyBg);
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

    y = Math.max(y + 1, LOG_Y - 10);
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
    if (player.position.kind === 'docked') keyLine('O', 'Location services');
    else keyLine('H', 'Hunt pirates (1 day)');
    drawKeyHints(t, zones, x, y++, [['I', 'Fleet', press('i')], ['T', 'Trade Ledger', press('t')]], pal.ui, this.app.press, 2);
    keyLine('V', 'Route view');
    keyLine('M', 'Region map');
    drawKeyHints(t, zones, x, y++, [['L', 'Log', press('l')], ['?', 'Help', press('?')]], pal.ui, this.app.press, 2);
  }

  private planLines(plan: TripPlan, line: (text: string, fg?: string) => void): void {
    const pal = palette(this.game.data);
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
          const out = travelInSector(game, player, this.selected, true);
          if (out.result === 'refused') game.bus.message(out.reason, 'warning');
          if (out.result === 'encounter') {
            // Keep the target: after the encounter, Enter goes on with the trip.
            this.app.push(new HailScreen(this.app, out.encounter));
            return true;
          }
          this.selected = null;
        }
        if (player.position.kind === 'docked') this.app.push(new LocationScreen(this.app, player.position.locationId));
        return true;
      case 'o':
        if (player.position.kind === 'docked') this.app.push(new LocationScreen(this.app, player.position.locationId));
        else game.bus.message('You are not docked.', 'warning');
        return true;
      case 'i':
        this.app.push(new FleetScreen(this.app));
        return true;
      case 't':
        this.app.push(new TradeLedgerScreen(this.app));
        return true;
      case 'ArrowUp':
      case 'ArrowDown': {
        // Step through the targets in panel order: locations, then jump points.
        const targets: Destination[] = [
          ...this.locations().map((l) => ({ kind: 'location', locationId: l.id }) as Destination),
          ...this.jumpPoints().map((j) => ({ kind: 'jumpPoint', jumpPointId: j.id }) as Destination),
        ];
        const now = targets.findIndex((d) => this.isSelected(d));
        const step = k.key === 'ArrowDown' ? 1 : targets.length - 1;
        this.selected = targets[now < 0 ? (k.key === 'ArrowDown' ? 0 : targets.length - 1) : (now + step) % targets.length] ?? null;
        return true;
      }
      case 'v': {
        // Route view (Section 17.2): cycle through the commodities, then off.
        const ids = game.data.commodities.map((c) => c.id);
        const i = this.routeCommodity === null ? 0 : ids.indexOf(this.routeCommodity) + 1;
        this.routeCommodity = k.shift ? null : (ids[i] ?? null);
        return true;
      }
      case 'j': {
        if (player.position.kind !== 'jumpPoint') {
          game.bus.message('Go to a jump point first.', 'warning');
          return true;
        }
        const out = jump(game, player, true);
        if (out.result === 'refused') game.bus.message(out.reason, 'warning');
        if (out.result === 'encounter') this.app.push(new HailScreen(this.app, out.encounter));
        this.selected = null;
        return true;
      }
      case 'h': {
        // Hunt (Section 8.8): 1 day in space, pirates come 3 times as often.
        const out = hunt(game, player);
        if (out.result === 'refused') game.bus.message(out.reason, 'warning');
        if (out.result === 'encounter') this.app.push(new HailScreen(this.app, out.encounter));
        return true;
      }
      case 'r':
        if (player.position.kind === 'docked') {
          report(game, refuel(game, player, game.state.world.locations[player.position.locationId] as Location));
        } else game.bus.message('You can refuel only at a location.', 'warning');
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
      'Up/Down  Step through the locations and jump points',
      'Click    A location or jump point (map or list), or a key line',
      '1-4      Select a jump point',
      'Click    Select a target on the map',
      'Enter    Travel to the target (and dock at a location)',
      'J        Jump to the next sector (at a jump point)',
      'H        Hunt: wait 1 day in space; pirates come 3 times as often',
      'R        Refuel all ships (when docked)',
      'O        Location services (when docked); Enter also opens them',
      'I        Fleet and cargo',
      'T        Trade Ledger',
      'V        Route view: prices of one commodity (Shift+V: off)',
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
