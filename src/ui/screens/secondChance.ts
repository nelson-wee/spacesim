// The one-time second chance (owner, Q-52, M8-SC-01 to M8-SC-06): the offer
// box (Accept, Decline; the pirate offer can open the fleet screen first),
// the stuck message with Retire, and the runner that shows them.
import { econContext } from '../../econ/context';
import { retire } from '../../career/career';
import { acceptSecondChance, declineSecondChance, isStuck, raidPlan, reliefPlan } from '../../career/secondChance';
import type { Game } from '../../core/game';
import type { Term } from '../../render/display';
import { HEIGHT, WIDTH } from '../../render/display';
import { palette } from '../../render/palette';
import { report } from '../../services/common';
import { tradeInValue } from '../../services/shipyard';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { drawKeyHints, press } from '../widgets/clicks';
import { CareerEndScreen } from './careerEnd';
import { FleetScreen } from './fleet';
import { LocationScreen } from './location';
import { SectorMapScreen } from './sectorMap';

function box(t: Term, app: App, title: string, lines: string[], hints: [string, string, KeyInput][]): void {
  const ui = palette(app.data).ui;
  const w = 92;
  const h = lines.length + 6;
  const x = Math.floor((WIDTH - w) / 2);
  const y = Math.max(1, Math.floor((HEIGHT - h) / 2) - 4);
  t.box(x, y, w, h, ui.border, title, ui.title, 'modal');
  lines.forEach((l, i) => t.text(x + 3, y + 2 + i, l, ui.bright, undefined, w - 6));
  drawKeyHints(t, app.zones, x + 3, y + h - 2, hints, ui, app.press, 2);
}

/** The text of the offer, from the same plans that Accept uses. */
export function offerLines(game: Game): string[] {
  const { state, data } = game;
  const offer = state.career.secondChance.offer;
  if (!offer) return [];
  const loc = (id: number) => state.world.locations[id]?.name ?? '?';
  const debt = `You are in debt: ${Math.round(state.player.credits)} cr. You cannot buy cargo, modules, or contracts.`;
  if (offer.kind === 'relief') {
    const p = reliefPlan(game, offer.locationId);
    const rel = data.contracts.secondChance.relief;
    return [
      debt,
      '',
      "A Merchants' Guild agent has an offer, once:",
      '- The guild repairs and refuels all your ships, free. The debt stays.',
      `- Deliver ${rel.tonnes} t of ${p ? (data.commodityById.get(p.commodity)?.name ?? p.commodity) : '?'} (guild cargo, free) to ${p ? loc(p.destId) : '?'}`,
      `  in ${p ? rel.deadlineBase + rel.deadlinePerJump * p.jumps : '?'} days.`,
      '- Done: the guild clears your debt; standing +1.',
      `- Late, or the cargo is lost: the debt stays; standing ${data.contracts.standingFailed}.`,
    ];
  }
  const p = raidPlan(game, offer.locationId);
  const r = data.contracts.secondChance.raid;
  const flag = state.player.fleet[state.player.flagshipIndex];
  const ctx = econContext(state.world, data);
  const here = state.world.locations[offer.locationId];
  const sector = p ? state.world.sectors[p.sectorId] : undefined;
  const jumps = p && here && sector ? (ctx.sectorJumps[here.sectorId]?.[sector.id] ?? '?') : '?';
  return [
    debt,
    '',
    '"The pirates here like your nerve. They take your ship in trade for a raiding',
    'Wasp, and they have a job for you." This offer comes once.',
    `- ${flag?.name ?? 'Your flagship'} (with its modules, trade-in ${flag ? Math.round(tradeInValue(flag, data)) : 0} cr) goes to the pirates.`,
    `  You get a ${r.shipName}. Your other ships stay. The debt stays for now.`,
    `- Capture a trader in ${sector?.name ?? '?'} (${jumps} jumps) and bring it to ${p ? loc(p.havenId) : '?'}`,
    `  (Pirate Haven) in ${r.days} days. Attacks on traders raise notoriety.`,
    '- Done: the debt is cleared; you keep the sale of its cargo; the Haven sells',
    '  your ship back at its trade-in value. Else: you keep the Wasp and the debt.',
    'Cargo on the flagship moves to your other ships; what does not fit is lost.',
  ];
}

export class SecondChanceScreen implements Screen {
  readonly overlay = true;

  constructor(private readonly app: App) {}

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  render(t: Term): void {
    const offer = this.game.state.career.secondChance.offer;
    const hints: [string, string, KeyInput][] = [['Enter', 'Accept', press('Enter')], ['D', 'Decline', press('d')]];
    if (offer?.kind === 'pirate') hints.push(['I', 'Fleet screen first', press('i')]);
    box(t, this.app, offer?.kind === 'pirate' ? 'A pirate offer' : "Merchants' Guild relief", offerLines(this.game), hints);
  }

  onKey(k: KeyInput): boolean {
    const game = this.game;
    const offer = game.state.career.secondChance.offer;
    if (!offer) {
      this.app.pop();
      return true;
    }
    if (k.key === 'Enter') {
      const r = report(game, acceptSecondChance(game), 'good');
      if (r.ok) this.app.pop();
    } else if (k.key === 'd') {
      declineSecondChance(game);
      this.app.pop();
    } else if (k.key === 'i' && offer.kind === 'pirate') this.app.push(new FleetScreen(this.app));
    // The offer takes all keys: the player must answer.
    return true;
  }

  help(): string[] {
    return [
      'SECOND CHANCE',
      '',
      'Enter   Accept the offer',
      'D       Decline it (it does not come again)',
      'I       Pirate offer: open the fleet screen first, to move modules',
      '        and cargo off the flagship',
      '',
      'The offer comes once per career, the first time a tow leaves you in debt.',
    ];
  }
}

/** M8-SC-06: a later stuck state offers Retire; it does not force it. */
export class StuckScreen implements Screen {
  readonly overlay = true;

  constructor(private readonly app: App) {}

  render(t: Term): void {
    box(
      t,
      this.app,
      'You cannot trade any more',
      [
        'You have no cargo and one ship, and nothing to sell that would let you trade',
        'or travel again. You can wait for a contract payment or a bounty, or retire.',
      ],
      [['R', 'Retire', press('r')], ['Esc', 'Go on', press('Escape')]],
    );
  }

  onKey(k: KeyInput): boolean {
    const game = this.app.game;
    if (k.key === 'r' && game) {
      const end = retire(game);
      if (typeof end !== 'string') this.app.reset(new CareerEndScreen(this.app, game, end));
      else this.app.pop();
      return true;
    }
    if (k.key === 'Escape' || k.key === 'Enter') this.app.pop();
    return true;
  }

  help(): string[] {
    return ['STUCK', '', 'R    Retire: the career ends here', 'Esc  Go on with the career'];
  }
}

/**
 * Shows the offer and the stuck message on the sector map or the location
 * screen. Returns true while one of them is on top (no tutorial tip then).
 */
export function checkSecondChance(app: App): boolean {
  const game = app.game;
  const top = app.top;
  if (top instanceof SecondChanceScreen || top instanceof StuckScreen) return true;
  if (!game || !top || game.state.career.end) return false;
  if (!(top instanceof SectorMapScreen) && !(top instanceof LocationScreen)) return false;
  const sc = game.state.career.secondChance;
  if (sc.offer) {
    app.push(new SecondChanceScreen(app));
    return true;
  }
  if (game.state.player.position.kind !== 'docked') return false;
  const stuck = isStuck(game);
  if (!stuck) sc.stuckShown = false;
  else if (!sc.stuckShown) {
    sc.stuckShown = true;
    app.push(new StuckScreen(app));
    return true;
  }
  return false;
}
