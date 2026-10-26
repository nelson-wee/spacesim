// The status bar (row 0) and the short log (bottom rows).
import { displayDay } from '../../core/clock';
import type { Game } from '../../core/game';
import type { LogKind } from '../../core/types';
import type { Term } from '../../render/display';
import { WIDTH } from '../../render/display';
import { travelStats } from '../../ship/stats';
import { LOG_LINES, LOG_Y, STATUS_Y } from '../layout';
import { placeName } from './text';

export function formatCredits(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} cr`;
}

export function logColor(game: Game, kind: LogKind): string {
  const ui = game.data.art.palette.ui;
  return kind === 'good' ? ui.good : kind === 'warning' ? ui.warning : kind === 'danger' ? ui.danger : ui.text;
}

export function drawStatusBar(t: Term, game: Game): void {
  const { state, data } = game;
  const ui = data.art.palette.ui;
  const actor = state.player;
  let x = 0;
  const part = (label: string, value: string, color: string = ui.bright) => {
    x = t.text(x, STATUS_Y, label, ui.dim);
    x = t.text(x, STATUS_Y, value, color);
    x = t.text(x, STATUS_Y, '  ', ui.dim);
  };
  part('Day ', `${displayDay(state.day)} (${state.day.toFixed(1)})`);
  part('Credits ', formatCredits(actor.credits), actor.credits < 0 ? ui.danger : ui.bright);
  const fuel = actor.fleet
    .map((s) => `${s.fuel.toFixed(1)}/${travelStats(s, data).fuelCapacity}`)
    .join(' ');
  part('Fuel ', fuel);
  part('', placeName(game, actor.position), ui.title);
  t.hline(STATUS_Y + 1, 0, WIDTH - 1, '─', ui.border);
}

export function drawRecentLog(t: Term, game: Game): void {
  const ui = game.data.art.palette.ui;
  t.hline(LOG_Y - 1, 0, WIDTH - 1, '─', ui.border);
  const entries = game.state.log.slice(-LOG_LINES);
  entries.forEach((e, i) => {
    const prefix = `D${displayDay(e.day)} `;
    t.text(0, LOG_Y + i, prefix, ui.dim);
    t.text(prefix.length, LOG_Y + i, e.text, logColor(game, e.kind), undefined, WIDTH - prefix.length);
  });
}
