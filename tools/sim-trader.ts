// Greedy trader bot on many seeds (M3-TOOL-01 to 03, exit check 1).
// Reports the day of the first hull upgrade on each seed, and profit per day
// over time. With --encounters, trips roll encounters (M5-TOOL-04) and the bot
// uses a careful policy (tools/lib/encounterBot.ts).
// Usage: npm run sim-trader -- [seeds] [firstSeed] [maxDays] [--verbose] [--encounters] [--override=json]
import { travelStats } from '../src/ship/stats';
import { knowsLocation } from '../src/actor/knowledge';
import { createGame } from '../src/core/newGame';
import { dataWithOverride } from './lib/override';
import { type BotOptions, botTurn, netWorth, newBotState } from './lib/traderBot';
import { encounterPolicy, newEncounterLog } from './lib/encounterBot';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const verbose = process.argv.includes('--verbose');
const withEncounters = process.argv.includes('--encounters');
const total = newEncounterLog();
const seeds = Number(args[0] ?? 20);
const firstSeed = Number(args[1] ?? 1);
const maxDays = Number(args[2] ?? 150);
const data = dataWithOverride(process.argv);
const opts: BotOptions = { targetHull: 'light_freighter', targetLoadout: 'light_freighter_starter', reserve: 2000, maxJumps: 3 };
const WINDOW = 30;
/** Exit check 1: upgrade by this day (Q-36). */
const DEADLINE = 150;

const pad = (v: string | number, n: number) => String(v).padStart(n);
let inWindow = 0;
let trips = 0;
const upgradeDays: number[] = [];
const windowRates: number[][] = [];
const started = Date.now();
console.log(`Trader bot: ${seeds} seeds from ${firstSeed}, up to ${maxDays} days. Target: ${opts.targetHull}, reserve ${opts.reserve} cr.`);
console.log(`${'seed'.padStart(5)}${pad('upgrade', 9)}${pad('trips', 7)}${pad('credits', 9)}  profit per day in ${WINDOW}-day windows`);
for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
  const game = createGame(seed, data);
  const bot = newBotState();
  const log = newEncounterLog();
  const seedOpts: BotOptions = withEncounters ? { ...opts, onEncounter: encounterPolicy(game, game.state.player, log) } : opts;
  const worth: number[] = [netWorth(game.state.player)];
  let guard = 0;
  while (game.state.day < maxDays && guard++ < 5000) {
    botTurn(game, bot, seedOpts);
    while (worth.length <= Math.floor(game.state.day)) worth.push(netWorth(game.state.player));
    if (bot.upgradeDay !== null && game.state.day > Math.max(bot.upgradeDay + WINDOW, 120)) break;
  }
  const rates: number[] = [];
  for (let d = WINDOW; d < worth.length; d += WINDOW) rates.push(((worth[d] as number) - (worth[d - WINDOW] as number)) / WINDOW);
  windowRates.push(rates);
  trips += bot.trips;
  const up = bot.upgradeDay;
  if (up !== null) upgradeDays.push(up);
  if (up !== null && up >= 60 && up <= 120) inWindow++;
  const ship = game.state.player.fleet[0];
  console.log(
    `${pad(seed, 5)}${pad(up === null ? '-' : up.toFixed(0), 9)}${pad(bot.trips, 7)}${pad(Math.round(game.state.player.credits), 9)}  ${rates.map((r) => pad(Math.round(r), 5)).join('')}${ship ? `   ${ship.hullId} cargo ${travelStats(ship, data).cargoCapacity} t` : ''}`,
  );
  if (verbose) for (const e of bot.events) console.log(`      day ${e.day.toFixed(1)}: ${e.text}`);
  if (withEncounters) {
    console.log(`      encounters ${log.encounters} (pirates ${log.pirates}): paid ${log.paid}, fled ${log.fled}, battles ${log.battles} (won ${log.results.win}, disabled ${log.results.disabled})`);
    for (const k of ['encounters', 'pirates', 'paid', 'fled', 'battles'] as const) total[k] += log[k];
    for (const k of Object.keys(log.results) as (keyof typeof log.results)[]) total.results[k] += log.results[k];
  }
  if (up === null) {
    const w = game.state.world;
    const yards = w.locations.filter((l) => l.services.includes('shipyard'));
    const known = yards.filter((l) => knowsLocation(game.state.player, l));
    console.log(`      no upgrade: ${yards.length} Shipyards in the region, ${known.length} known (${known.map((l) => l.name).join(', ')})`);
  }
}
// Seeds with no upgrade count as later than all others.
const sorted = [...upgradeDays, ...new Array<number>(seeds - upgradeDays.length).fill(Infinity)].sort((a, b) => a - b);
const median = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] as number) : NaN;
const first = windowRates.map((r) => r[0] ?? 0).sort((a, b) => a - b);
console.log(`\nUpgrade on ${upgradeDays.length}/${seeds} seeds by day ${maxDays}.`);
console.log(`Shuttle profit per day, first ${WINDOW} days: median ${Math.round(first[Math.floor(first.length / 2)] ?? 0)} cr (monitor: 100-250 on a good raw-goods route, Section 22).`);
// Exit check 1 (Q-36, owner 2026-10-28): median upgrade day in 60-120, and 15 of 20 seeds upgrade by day 150.
const need = Math.ceil(seeds * 0.75);
const byDeadline = upgradeDays.filter((d) => d <= DEADLINE).length;
const medianOk = median >= 60 && median <= 120;
console.log(
  `${medianOk && byDeadline >= need ? 'PASS' : 'FAIL'}  Light Freighter: median day ${Number.isNaN(median) ? '-' : median.toFixed(0)} (need 60-120); bought by day ${DEADLINE} on ${byDeadline}/${seeds} seeds (need ${need}).`,
);
console.log(`NOTE  Bought between day 60 and day 120 on ${inWindow}/${seeds} seeds (report).`);
if (withEncounters) {
  console.log(
    `NOTE  Encounters ON: ${total.encounters} encounters (${total.pirates} pirates) on ${trips} trips (one per ${(trips / Math.max(1, total.pirates)).toFixed(1)} trips for pirates; Section 22: 1 per 3-4 trips at security 1-2); tribute ${total.paid}, fled ${total.fled}, battles ${total.battles} (won ${total.results.win}, disabled ${total.results.disabled}, destroyed ${total.results.gameOver + total.results.cloned}).`,
  );
}
console.log(`Run time ${((Date.now() - started) / 1000).toFixed(1)} s.`);
