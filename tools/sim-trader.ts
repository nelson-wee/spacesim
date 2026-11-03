// Greedy trader bot on many seeds (M3-TOOL-01 to 03, exit check 1).
// Reports the day of the first hull upgrade on each seed, and profit per day
// over time. With --encounters, trips roll encounters (M5-TOOL-04) and the bot
// uses a careful policy (tools/lib/encounterBot.ts).
// With --fleet (M6-TOOL-01): fleets of 1, 2, and 4 Light Freighters trade on
// the same seeds; the tool compares profit per day after upkeep (M6 exit
// check 5; Section 22 monitor: a second freighter adds 30%-60%, a fourth
// 10%-25%).
// Usage: npm run sim-trader -- [seeds] [firstSeed] [maxDays] [--verbose] [--encounters] [--fleet] [--override=json]
import { travelStats } from '../src/ship/stats';
import { knowsLocation } from '../src/actor/knowledge';
import { createGame } from '../src/core/newGame';
import { dataWithOverride } from './lib/override';
import { type BotOptions, botTurn, netWorth, newBotState } from './lib/traderBot';
import { encounterPolicy, newEncounterLog } from './lib/encounterBot';
import { createShipFromLoadout } from '../src/ship/loadout';
import { upkeepPerDay } from '../src/actor/fleet';

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

/** M6-TOOL-01: profit per day after upkeep for fleets of 1, 2, and 4 Light Freighters on the same seeds. */
function fleetRun(): void {
  const sizes = [1, 2, 4];
  const credits = 20000;
  const perSize: number[][] = sizes.map(() => []);
  console.log(`Fleet comparison: ${seeds} seeds from ${firstSeed}, ${maxDays} days, fleets of ${sizes.join(', ')} x ${opts.targetLoadout}, ${credits} cr at the start.`);
  console.log(`${'seed'.padStart(5)}${sizes.map((n) => pad(`${n} ship${n > 1 ? 's' : ''}`, 10)).join('')}   profit per day after upkeep`);
  for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
    const row: number[] = [];
    sizes.forEach((n, k) => {
      const game = createGame(seed, data);
      const p = game.state.player;
      p.fleet = Array.from({ length: n }, (_, i) => createShipFromLoadout(data, opts.targetLoadout, `ship-${i + 1}`, `Freighter ${i + 1}`));
      p.flagshipIndex = 0;
      p.credits = credits;
      const bot = newBotState();
      bot.upgradeDay = 0;
      const log = newEncounterLog();
      const seedOpts: BotOptions = withEncounters ? { ...opts, onEncounter: encounterPolicy(game, p, log) } : opts;
      const start = netWorth(p);
      let guard = 0;
      while (game.state.day < maxDays && guard++ < 5000) botTurn(game, bot, seedOpts);
      const rate = (netWorth(p) - start) / game.state.day;
      row.push(rate);
      perSize[k]?.push(rate);
      if (verbose) console.log(`      ${n} ships: upkeep ${Math.round(upkeepPerDay(p, data))}/day, trips ${bot.trips}, fleet ${p.fleet.length}`);
    });
    console.log(`${pad(seed, 5)}${row.map((r) => pad(Math.round(r), 10)).join('')}`);
  }
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] ?? 0;
  const [one, two, four] = perSize.map(med) as [number, number, number];
  const better = (perSize[1] ?? []).filter((r, i) => r > (perSize[0]?.[i] ?? Infinity)).length;
  const gain2 = one > 0 ? two / one - 1 : NaN;
  const gain4 = two > 0 ? four / two - 1 : NaN;
  console.log(`
Median profit per day after upkeep: 1 ship ${Math.round(one)}, 2 ships ${Math.round(two)}, 4 ships ${Math.round(four)}.`);
  console.log(`${two > one ? 'PASS' : 'FAIL'}  M6 exit check 5: a 2-ship fleet earns more per day than 1 ship after upkeep (median; ${better}/${seeds} seeds).`);
  console.log(`NOTE  Second freighter: ${(gain2 * 100).toFixed(0)}% more (monitor 30%-60%). Ships 3 and 4: ${(gain4 * 100).toFixed(0)}% more than 2 ships, about ${((gain4 / 2) * 100).toFixed(0)}% for each ship (monitor for the fourth ship: 10%-25%).`);
  console.log(`Run time ${((Date.now() - started) / 1000).toFixed(1)} s.`);
}
let inWindow = 0;
let trips = 0;
const upgradeDays: number[] = [];
const windowRates: number[][] = [];
const started = Date.now();
if (process.argv.includes('--fleet')) {
  fleetRun();
  process.exit(0);
}
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
