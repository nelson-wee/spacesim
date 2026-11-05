// Codex (Section 17.1, M8-UI-01): the production chain and, for each
// commodity, its tier, who makes it, and who buys it. All text comes from
// recipes.json, population.json, and commodities.json, not from fixed lists.
// The chain shows the commodities by tier; the selected commodity is bright,
// its inputs (what makes it) are green, and the goods that use it are amber.
import type { Game } from '../../core/game';
import type { GameData } from '../../data';
import type { Term } from '../../render/display';
import { HEIGHT } from '../../render/display';
import { palette } from '../../render/palette';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { drawKeyHints, press } from '../widgets/clicks';
import { drawStatusBar } from '../widgets/statusBar';
import { fit } from '../widgets/text';

const TIERS = ['raw', 'processed', 'advanced', 'consumer'] as const;

const WHO: Record<string, string> = {
  all: 'all populations',
  resident: 'resident populations (not station crews)',
  noAtmosphere: 'populations with no breathable air',
  coreResident: 'residents in core sectors',
  outsideCore: 'populations outside the core',
};

function name(data: GameData, id: string): string {
  return data.commodityById.get(id)?.name ?? id;
}

/** Codex lines for one commodity (headless: tests read them). */
export function codexEntry(data: GameData, id: string): { madeBy: string[]; usedBy: string[]; inputs: string[]; products: string[] } {
  const recipes = data.recipes.recipes;
  const madeBy: string[] = [];
  const usedBy: string[] = [];
  const inputs = new Set<string>();
  const products = new Set<string>();
  for (const r of recipes) {
    const ins = r.inputs.map((i) => `${i.qty} ${name(data, i.commodity)}`);
    const outs = r.outputs.map((o) => `${o.qty} ${name(data, o.commodity)}`);
    const text = `${r.name}: ${ins.length ? ins.join(' + ') : 'nothing'} -> ${outs.join(' + ')} (needs ${name(data, r.softInput)} as machines)`;
    if (r.outputs.some((o) => o.commodity === id)) {
      madeBy.push(text);
      for (const i of r.inputs) inputs.add(i.commodity);
    }
    if (r.inputs.some((i) => i.commodity === id)) {
      usedBy.push(text);
      for (const o of r.outputs) products.add(o.commodity);
    }
    if (r.softInput === id) usedBy.push(`${r.name}: installs it as machines (more output)`);
  }
  for (const u of data.population.use) if (u.commodity === id) usedBy.push(`Population: ${WHO[u.who] ?? u.who}, ${u.perUnitPerDay} per unit a day`);
  for (const [station, list] of Object.entries(data.population.stationUse)) {
    for (const u of list) if (u.commodity === id) usedBy.push(`${data.bodyTypes.stations.find((b) => b.id === station)?.name ?? station}: ${u.perSizePerDay} per size a day`);
  }
  return { madeBy, usedBy, inputs: [...inputs], products: [...products] };
}

export class CodexScreen implements Screen {
  private row = 0;

  constructor(private readonly app: App) {}

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  private ids(): string[] {
    const list = this.game.data.commodities;
    return TIERS.flatMap((t) => list.filter((c) => c.tier === t).map((c) => c.id));
  }

  render(t: Term): void {
    const game = this.game;
    const { data } = game;
    const ui = palette(data).ui;
    drawStatusBar(t, game);
    const ids = this.ids();
    this.row = Math.min(this.row, ids.length - 1);
    const sel = ids[this.row] as string;
    const entry = codexEntry(data, sel);
    t.text(0, 2, 'Codex: the production chain', ui.title);
    t.hline(3, 0, 99, '─', ui.border);

    // The chain: one column per tier; arrows between the columns.
    const colW = 22;
    TIERS.forEach((tier, ci) => {
      const x = ci * (colW + 3);
      t.text(x, 5, tier.toUpperCase(), ui.dim);
      if (ci > 0) t.text(x - 3, 7, '->', ui.dim);
      data.commodities
        .filter((c) => c.tier === tier)
        .forEach((c, i) => {
          const y = 6 + i;
          const isSel = c.id === sel;
          const fg = isSel ? ui.bright : entry.inputs.includes(c.id) ? ui.good : entry.products.includes(c.id) ? ui.warning : ui.text;
          const index = ids.indexOf(c.id);
          if (isSel) t.fill(x, y, colW, 1, ui.selectBg);
          t.text(x, y, fit(`${isSel ? '>' : ' '} ${c.name}`, colW), fg, isSel ? ui.selectBg : undefined);
          this.app.zones.add(x, y, colW, () => {
            this.row = index;
          });
        });
    });
    t.text(0, 12, 'Green: made from.  Amber: goes into.  Machinery (Advanced) is the machines of all producers.', ui.dim);

    // Details of the selected commodity.
    const c = data.commodityById.get(sel);
    let y = 14;
    t.text(0, y++, `${c?.name ?? sel}`, ui.title);
    t.text(0, y++, `Tier ${c?.tier ?? '?'}; base price ${c?.basePrice ?? '?'} cr; ${c?.massPerUnit ?? '?'} t per unit${c && c.perishablePerDay > 0 ? `; loses ${(c.perishablePerDay * 100).toFixed(0)}% a day in cargo` : ''}`, ui.text);
    y++;
    t.text(0, y++, 'Made by', ui.dim);
    for (const line of entry.madeBy.length ? entry.madeBy : ['No producer makes it.']) t.text(2, y++, fit(line, 97), ui.good);
    y++;
    t.text(0, y++, 'Bought by', ui.dim);
    for (const line of (entry.usedBy.length ? entry.usedBy : ['Nobody uses it.']).slice(0, HEIGHT - 4 - y)) t.text(2, y++, fit(line, 97), ui.warning);

    drawKeyHints(t, this.app.zones, 0, HEIGHT - 2, [['Up/Down', 'Commodity', press('ArrowDown')], ['Esc', 'Back', press('Escape')]], ui, this.app.press, 2);
  }

  onKey(k: KeyInput): boolean {
    const n = this.ids().length;
    switch (k.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        this.row = (this.row + n - 1) % n;
        return true;
      case 'ArrowDown':
      case 'ArrowRight':
        this.row = (this.row + 1) % n;
        return true;
      case 'x':
        this.app.pop();
        return true;
      default:
        return false;
    }
  }

  help(): string[] {
    return [
      'CODEX',
      '',
      'Up/Down    Select a commodity (or click it)',
      'Esc, X     Back',
      '',
      'Each producer turns inputs into outputs and uses Machinery as its',
      'machines. Populations and some stations buy goods each day. A',
      "commodity that a location needs and does not get makes a deficit:",
      "the Merchants' Guild posts contracts for deficits.",
    ];
  }
}
