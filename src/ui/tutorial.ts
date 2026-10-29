// Tutorial logic (Q-48, docs/proposals/tutorial.md): which tip is next, the
// tip text with its fields, the first-trade plan, and the goal line. No DOM:
// tests use it directly. It reads the game state; it writes nothing.
import { fleetUnits } from '../actor/cargo';
import { bestRoutes } from '../actor/routes';
import type { Game } from '../core/game';
import type { Location, TutorialPlan } from '../core/types';
import type { TutorialTip, TutorialTrigger } from '../data/schemas';
import { locationCode } from '../world/codes';

/** The best route for a first trade: from here if possible, else from a known location near here (3 jumps or fewer). */
export function firstTradePlan(game: Game): TutorialPlan | null {
  const actor = game.state.player;
  const here = actor.position.kind === 'docked' ? actor.position.locationId : undefined;
  if (here === undefined) return null;
  const route =
    bestRoutes(game, actor, { hereId: here, fromHere: true, maxJumps: 3, limit: 1 })[0] ??
    bestRoutes(game, actor, { hereId: here, fromHere: false, maxJumps: 3, limit: 1 })[0];
  if (!route || route.units <= 0) return null;
  return {
    commodity: route.commodity,
    fromId: route.fromId,
    toId: route.toId,
    units: Math.floor(route.units),
    buy: route.buyCost / route.units,
    sell: route.saleValue / route.units,
    profit: route.profit,
  };
}

/** The next tip for a trigger: the first tip in tutorial.json order that the player has not seen. */
export function nextTip(game: Game, trigger: TutorialTrigger): TutorialTip | null {
  const t = game.state.tutorial;
  if (!t.on) return null;
  return game.data.tutorial.tips.find((tip) => tip.trigger === trigger && !t.seen.includes(tip.id)) ?? null;
}

function placeText(game: Game, id: number): string {
  const loc = game.state.world.locations[id] as Location | undefined;
  return loc ? `${loc.name} (${locationCode(game.state.world, loc, game.data)})` : '?';
}

const round = (x: number) => Math.round(x).toLocaleString('en-US');

/** The lines of a tip, with its fields filled. A tip with `noPlanLines` uses them when there is no plan. */
export function tipLines(game: Game, tip: TutorialTip, extra: { profitSold?: number } = {}): string[] {
  const plan = game.state.tutorial.plan;
  const lines = !plan && tip.noPlanLines ? tip.noPlanLines : tip.lines;
  const fields: Record<string, string> = {
    commodity: plan ? (game.data.commodityById.get(plan.commodity)?.name ?? plan.commodity) : '',
    buyAt: plan ? placeText(game, plan.fromId) : '',
    sellAt: plan ? placeText(game, plan.toId) : '',
    buy: plan ? round(plan.buy) : '',
    sell: plan ? round(plan.sell) : '',
    units: plan ? round(plan.units) : '',
    profit: plan ? round(plan.profit) : '',
    profitSold: round(extra.profitSold ?? 0),
  };
  return lines.map((l) => l.replace(/\{(\w+)\}/g, (all, key: string) => fields[key] ?? all));
}

/** The goal line for the first trade, or null when there is no goal (tutorial OFF, no plan, or the first sale is done). */
export function goalLine(game: Game): string | null {
  const t = game.state.tutorial;
  if (!t.on || !t.plan || t.seen.includes('sold')) return null;
  const actor = game.state.player;
  const name = game.data.commodityById.get(t.plan.commodity)?.name ?? t.plan.commodity;
  if (fleetUnits(actor, t.plan.commodity) > 1e-9) return `Sell ${name} at ${placeText(game, t.plan.toId)}.`;
  const holds = actor.fleet.some((s) => Object.values(s.cargo).some((lot) => lot.units > 1e-9));
  if (holds) return 'Sell your cargo where it pays more (Trade Ledger: T).';
  return `Buy ${name} at ${placeText(game, t.plan.fromId)}.`;
}

/** Text lines of `text`, each `width` characters or fewer, broken at spaces. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}
