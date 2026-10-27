// Location screen (Section 17.1): one tab for each service at this location.
// F opens the fleet screen, T the Trade Ledger, W waits (Section 8.8).
import type { Game } from '../../core/game';
import type { Location } from '../../core/types';
import type { Term } from '../../render/display';
import { palette, techColor } from '../../render/palette';
import { report } from '../../services/common';
import { wait } from '../../services/wait';
import { locationTypeName } from '../../world/location';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { drawRecentLog, drawStatusBar } from '../widgets/statusBar';
import { FleetScreen } from './fleet';
import { LogScreen } from './log';
import { MarketTab } from './marketTab';
import { OutfitterTab } from './outfitterTab';
import { BountyTab, GuildTab, MechanicTab, RefuelTab, ShipyardTab } from './serviceTabs';
import type { LocationTab } from './tab';
import { TradeLedgerScreen } from './tradeLedger';

function makeTab(serviceId: string): LocationTab | null {
  switch (serviceId) {
    case 'market':
      return new MarketTab();
    case 'refuel':
      return new RefuelTab();
    case 'mechanic':
      return new MechanicTab();
    case 'outfitter':
      return new OutfitterTab();
    case 'shipyard':
      return new ShipyardTab();
    case 'merchants_guild':
      return new GuildTab();
    case 'bounty_guild':
      return new BountyTab();
    default:
      return null;
  }
}

/** Tab order: the Market first, then services.json order. */
function tabsFor(location: Location, game: Game): LocationTab[] {
  const ids = game.data.services.map((s) => s.id);
  return [...ids.filter((id) => id === 'market'), ...ids.filter((id) => id !== 'market')]
    .filter((id) => location.services.includes(id))
    .map((id) => makeTab(id))
    .filter((t): t is LocationTab => t !== null);
}

export class LocationScreen implements Screen {
  private readonly tabs: LocationTab[];
  private tab = 0;

  constructor(
    private readonly app: App,
    private readonly locationId: number,
  ) {
    this.tabs = tabsFor(this.location, this.game);
  }

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  private get location(): Location {
    return this.game.state.world.locations[this.locationId] as Location;
  }

  render(t: Term): void {
    const game = this.game;
    const { data } = game;
    const ui = palette(data).ui;
    const loc = this.location;
    drawStatusBar(t, game);
    const sector = game.state.world.sectors[loc.sectorId];
    let x = t.text(0, 2, loc.name, techColor(data, loc.techLevel));
    x = t.text(x, 2, `  ${locationTypeName(loc, data)}  Tech ${loc.techLevel}  ${sector?.name ?? ''}`, ui.dim);
    x = 0;
    this.tabs.forEach((tab, i) => {
      const label = ` ${i + 1} ${tab.title} `;
      x = t.text(x, 3, label, i === this.tab ? ui.bright : ui.dim, i === this.tab ? ui.selectBg : undefined) + 1;
    });
    let kx = 70;
    for (const [key, text] of [['I', 'Fleet'], ['T', 'Ledger'], ['W', 'Wait']] as const) {
      kx = t.key(kx, 2, key, ui.key, ui.keyBg);
      kx = t.text(kx, 2, ` ${text}  `, ui.text);
    }
    t.hline(4, 0, 99, '─', ui.border);
    const tab = this.tabs[this.tab];
    if (tab) tab.render(t, { game, location: loc });
    drawRecentLog(t, game);
  }

  onKey(k: KeyInput): boolean {
    const game = this.game;
    const player = game.state.player;
    if (player.position.kind !== 'docked' || player.position.locationId !== this.locationId) {
      this.app.pop();
      return true;
    }
    const tab = this.tabs[this.tab];
    if (tab?.onKey(k, { game, location: this.location })) return true;
    if (/^[1-9]$/.test(k.key)) {
      const i = Number(k.key) - 1;
      if (i < this.tabs.length) this.tab = i;
      return true;
    }
    switch (k.key) {
      case 'Tab':
        this.tab = (this.tab + (k.shift ? this.tabs.length - 1 : 1)) % Math.max(1, this.tabs.length);
        return true;
      case 'i':
        this.app.push(new FleetScreen(this.app));
        return true;
      case 't':
        this.app.push(new TradeLedgerScreen(this.app));
        return true;
      case 'w':
        report(game, wait(game, player, this.location, k.shift ? 7 : 1));
        return true;
      case 'l':
        this.app.push(new LogScreen(this.app));
        return true;
      default:
        return false;
    }
  }

  help(): string[] {
    const tab = this.tabs[this.tab];
    return [
      'LOCATION',
      '',
      '1-9, Tab   Select a service tab',
      'I          Fleet and cargo',
      'T          Trade Ledger',
      'W          Wait 1 day (Shift+W: 7 days). The economy runs.',
      'L          Log',
      'Esc        Back to the sector map',
      '',
      ...(tab ? tab.help() : []),
    ];
  }
}
