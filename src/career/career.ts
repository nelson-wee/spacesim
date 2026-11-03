// Career end, score, and titles (Section 16). The career ends at day
// `career.days`, at "Retire" at any location, or when the last ship is lost
// with no Clone Insurance. Score (net worth) = credits + fleetValueShare x
// hull and module prices of all fleet ships + cargo at local prices; if the
// last ship is lost, only the credits count. Headless.
import type { Game } from '../core/game';
import type { CareerEnd, Location } from '../core/types';
import { basePrice, sellPrice } from '../econ/prices';
import { insuredValue } from '../services/insurance';
import { securityLevel } from '../world/security';
import { displayDay } from '../core/clock';

/** Net worth now (Section 16). `lost`: the last ship is lost, so only the credits count. */
export function careerScore(game: Game, lost = false): number {
  const { state, data } = game;
  const actor = state.player;
  if (lost) return actor.credits;
  const here = actor.position.kind === 'docked' ? (state.world.locations[actor.position.locationId] as Location) : null;
  const ships = actor.fleet.reduce((sum, s) => sum + insuredValue(s, data), 0) * data.balance.career.fleetValueShare;
  let cargo = 0;
  for (const s of actor.fleet) {
    for (const [c, lot] of Object.entries(s.cargo)) {
      const entry = here?.market[c];
      cargo += lot.units * (entry ? sellPrice(entry, basePrice(data, c), data) : basePrice(data, c));
    }
  }
  return actor.credits + ships + cargo;
}

/** The title and the second titles for a score (Section 16). */
export function careerTitles(game: Game, score: number): { title: string; secondTitles: string[] } {
  const { state, data } = game;
  const c = data.balance.career;
  let title = c.titles[0]?.name ?? '';
  for (const t of c.titles) if (score >= t.min) title = t.name;
  if (state.player.notoriety >= c.dreadPirateNotoriety) title = c.dreadPirateTitle;
  const secondTitles: string[] = [];
  if (state.career.stats.namedBounties >= c.pirateHunterBounties) secondTitles.push(c.pirateHunterTitle);
  state.world.sectors.forEach((s, i) => {
    const start = state.career.stats.startLevels[i] ?? 0;
    if (start <= c.wardenFromLevel && securityLevel(s.securityValue, data) >= c.wardenToLevel) secondTitles.push(`${c.wardenTitle} ${s.name}`);
  });
  return { title, secondTitles };
}

/** Ends the career (once) and returns the result. */
export function endCareer(game: Game, reason: CareerEnd['reason']): CareerEnd {
  const career = game.state.career;
  if (career.end) return career.end;
  const score = careerScore(game, reason === 'lost');
  const { title, secondTitles } = careerTitles(game, score);
  career.end = { reason, day: game.state.day, score, title, secondTitles };
  return career.end;
}

/** True when the career reaches its last day. */
export function careerDue(game: Game): boolean {
  return game.state.career.end === null && game.state.day >= game.data.balance.career.days;
}

/** Retire at a location (Section 16). */
export function retire(game: Game): CareerEnd | string {
  if (game.state.player.position.kind !== 'docked') return 'You can retire only at a location.';
  return endCareer(game, 'retire');
}

const REASON: Record<CareerEnd['reason'], string> = {
  day: 'The career reaches its last day.',
  retire: 'You retire.',
  lost: 'Your last ship is lost, and you have no Clone Insurance.',
};

/** The career summary (Section 16, M7-CAR-05). */
export function careerSummary(game: Game, end: CareerEnd): string[] {
  const { state, data } = game;
  const st = state.career.stats;
  const lines = [
    REASON[end.reason],
    '',
    `Days: ${displayDay(end.day)}`,
    `Net worth: ${Math.round(end.score).toLocaleString('en-US')} cr${end.reason === 'lost' ? ' (credits only)' : ''}`,
    `Jumps: ${st.jumps}`,
    `Cargo traded: ${Math.round(st.cargoTradedTonnes).toLocaleString('en-US')} t`,
    `Battles won: ${st.battlesWon}`,
    `Ships captured: ${st.shipsCaptured}`,
    `Bounties: ${st.namedBounties} named, ${st.sweeps} sweeps`,
    `Contracts: ${st.contractsCompleted} done, ${st.contractsFailed} failed`,
    '',
    'Security change per sector:',
  ];
  state.world.sectors.forEach((s, i) => {
    const from = st.startSecurity[i] ?? s.securityValue;
    const d = s.securityValue - from;
    if (Math.abs(d) >= 1) lines.push(`  ${s.name}: ${Math.round(from)} -> ${Math.round(s.securityValue)} (level ${st.startLevels[i] ?? '?'} -> ${securityLevel(s.securityValue, data)})`);
  });
  if (lines[lines.length - 1] === 'Security change per sector:') lines.push('  No sector changed by 1 point or more.');
  return lines;
}
