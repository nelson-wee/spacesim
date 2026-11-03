// Active contracts (Section 14, key G on the sector map and the location
// screen): each contract with its route, progress, reward, and deadline. At
// the right location: D delivers Supply or Freight cargo, P picks up Freight
// cargo. The kill bounty to collect shows at the bottom.
import { deliverFreight, deliverSupply, pickupFreight, standing } from '../../career/contracts';
import { offerView } from '../../career/contractView';
import { displayDay } from '../../core/clock';
import type { Game } from '../../core/game';
import type { Contract } from '../../core/types';
import type { Term } from '../../render/display';
import { HEIGHT } from '../../render/display';
import { palette } from '../../render/palette';
import { report } from '../../services/common';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { drawKeyHints, press } from '../widgets/clicks';
import { drawStatusBar, formatCredits } from '../widgets/statusBar';
import { fit } from '../widgets/text';

/** The detail line of a contract: what to do next. */
export function contractTask(game: Game, c: Contract): string {
  const { world } = game.state;
  const name = (id: number) => world.locations[id]?.name ?? '?';
  const com = (id: string) => game.data.commodityById.get(id)?.name ?? id;
  if (c.kind === 'supply') {
    const m = game.data.commodityById.get(c.commodity)?.massPerUnit ?? 1;
    return `Deliver ${com(c.commodity)} to ${name(c.destId)} until the need ends: ${Math.round(c.price + c.feePerTonne * m)} cr per unit (${Math.round(c.price)} goods + ${Math.round(c.feePerTonne)} cr/t fee${c.riskMult > 1.01 ? `, risk x${c.riskMult.toFixed(1)}` : ''}${c.alert ? ', chain alert' : ''}). Delivered ${Math.round(c.delivered)}.`;
  }
  if (c.kind === 'freight') {
    return c.pickedDay === null
      ? `Pick up ${c.units} ${com(c.commodity)} at ${name(c.fromId)} (deposit ${Math.round(c.deposit)} cr), deliver to ${name(c.toId)}.`
      : `Deliver ${Math.round(c.units)} ${com(c.commodity)} to ${name(c.toId)}: fee ${Math.round(c.fee)} cr and the deposit back.`;
  }
  if (c.kind === 'sweep') return `Destroy or capture pirates in ${world.sectors[c.sectorId]?.name ?? '?'}: ${c.kills} of ${c.ships}. Hunt (H) finds them.`;
  return `Find ${c.name} in ${world.sectors[c.sectorId]?.name ?? '?'}: arrive in the sector or Hunt there.`;
}

export class ContractsScreen implements Screen {
  private row = 0;
  private notice = '';

  constructor(private readonly app: App) {}

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  render(t: Term): void {
    const game = this.game;
    const ui = palette(game.data).ui;
    const s = game.state.contracts;
    drawStatusBar(t, game);
    t.text(0, 2, 'Contracts', ui.title);
    t.text(12, 2, `Merchants' Guild standing ${standing(game)} (${s.completed} done, ${s.failed} failed)`, ui.dim);
    t.hline(3, 0, 99, '─', ui.border);
    this.row = Math.min(this.row, Math.max(0, s.active.length - 1));
    if (s.active.length === 0) t.text(0, 5, 'No active contracts. The Merchants\' Guild and the Bounty Guild post offers every 7 days.', ui.dim);
    let y = 5;
    s.active.forEach((c, i) => {
      const v = offerView(game, c);
      const sel = i === this.row;
      const bg = sel ? ui.selectBg : undefined;
      if (bg) t.fill(0, y, 100, 3, bg);
      this.app.zones.add(0, y, 100, () => {
        this.row = i;
      });
      const dl = v.deadline === null ? '' : `  by day ${displayDay(v.deadline)}${game.state.day > v.deadline - 3 ? ' (soon!)' : ''}`;
      t.text(0, y, fit(`${v.type}: ${c.reason}`, 99), sel ? ui.bright : ui.text, bg);
      t.text(2, y + 1, fit(contractTask(game, c), 97), ui.text, bg);
      t.text(2, y + 2, fit(`${v.route}, ${v.jumps} jumps, security ${v.lowestLevel}, threat ${v.band}; reward ${formatCredits(v.reward)}${dl}`, 97), ui.dim, bg);
      y += 4;
    });
    if (s.killBounty > 0) t.text(0, HEIGHT - 5, `Kill bounty to collect at a Bounty Guild: ${formatCredits(s.killBounty)}.`, ui.good);
    t.text(0, HEIGHT - 4, fit(this.notice, 99), ui.warning);
    drawKeyHints(t, this.app.zones, 0, HEIGHT - 2, [['Up/Down', 'Select', press('ArrowDown')], ['D', 'Deliver', press('d')], ['P', 'Pick up', press('p')], ['Esc', 'Back', press('Escape')]], ui, this.app.press, 2);
  }

  onKey(k: KeyInput): boolean {
    const game = this.game;
    const active = game.state.contracts.active;
    const c = active[this.row];
    switch (k.key) {
      case 'ArrowUp':
        this.row = Math.max(0, this.row - 1);
        return true;
      case 'ArrowDown':
        this.row = Math.min(Math.max(0, active.length - 1), this.row + 1);
        return true;
      case 'd':
        if (c?.kind === 'supply') this.notice = report(game, deliverSupply(game, c.id), 'good').text;
        else if (c?.kind === 'freight') this.notice = report(game, deliverFreight(game, c.id), 'good').text;
        else this.notice = 'Select a Supply or Freight contract.';
        return true;
      case 'p':
        this.notice = c?.kind === 'freight' ? report(game, pickupFreight(game, c.id), 'good').text : 'Select a Freight contract.';
        return true;
      case 'g':
        this.app.pop();
        return true;
      default:
        return false;
    }
  }

  help(): string[] {
    return [
      'CONTRACTS',
      '',
      'Up/Down  Select a contract',
      'D        Deliver Supply or Freight cargo (docked at the destination)',
      'P        Pick up Freight cargo (docked at the pickup location)',
      'Esc, G   Back',
      '',
      'Supply: buy the goods anywhere; each delivery is paid at once, per',
      'tonne. It ends when the need ends (done at 10 t or more); it cannot fail.',
      'Freight: the guild supplies the cargo; you pay a deposit at pickup',
      'and get it back with the fee. A late or lost delivery fails.',
      'A failed Merchants\' Guild contract costs 2 standing.',
      'Sweep and named bounties pay when done; kill bounties at a Bounty Guild.',
    ];
  }
}
