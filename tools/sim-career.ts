// Headless full careers (M7-TOOL-03, M7 exit check 5): the trader bot plays
// to day `career.days` with encounters (AI combat for the player side) and
// Supply contracts. Each career must end with no errors. Reports the score,
// the title, and the Section 22 monitor (good trader net worth at the end:
// 250,000-600,000 cr).
// Usage: npm run sim-career -- [seeds] [firstSeed]
import { careerSummary, endCareer } from '../src/career/career';
import { createGame } from '../src/core/newGame';
import { dataWithOverride } from './lib/override';
import { newContractLog } from './lib/contractBot';
import { encounterPolicy, newEncounterLog } from './lib/encounterBot';
import { type BotOptions, botTurn, newBotState } from './lib/traderBot';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seeds = Number(args[0] ?? 3);
const firstSeed = Number(args[1] ?? 1);
const verbose = process.argv.includes('--verbose');
const data = dataWithOverride(process.argv);
const days = data.balance.career.days;
const started = Date.now();
let errors = 0;
const scores: number[] = [];
console.log(`sim-career: ${seeds} careers from seed ${firstSeed}, to day ${days}.`);
for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
  const t0 = Date.now();
  try {
    const game = createGame(seed, data);
    const log = newEncounterLog();
    const clog = newContractLog();
    const opts: BotOptions = { targetHull: 'light_freighter', targetLoadout: 'light_freighter_starter', reserve: 2000, maxJumps: 3, onEncounter: encounterPolicy(game, game.state.player, log), contracts: clog, minSecurity: 2 };
    const bot = newBotState();
    let guard = 0;
    while (game.state.day < days && game.state.career.end === null && guard++ < 50000) botTurn(game, bot, opts);
    const end = game.state.career.end ?? endCareer(game, 'day');
    scores.push(end.score);
    const st = game.state.career.stats;
    console.log(
      `seed ${seed}: ${end.reason} on day ${Math.floor(end.day) + 1}; net worth ${Math.round(end.score).toLocaleString('en-US')} cr; ${end.title}${end.secondTitles.length ? ` (${end.secondTitles.join(', ')})` : ''}; ` +
        `jumps ${st.jumps}, cargo ${Math.round(st.cargoTradedTonnes)} t, battles won ${st.battlesWon} of ${log.battles}, contracts ${st.contractsCompleted} done / ${st.contractsFailed} failed; ${((Date.now() - t0) / 1000).toFixed(0)} s`,
    );
    if (verbose) for (const l of careerSummary(game, end)) console.log(`    ${l}`);
  } catch (err) {
    errors++;
    console.log(`seed ${seed}: ERROR ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  }
}
const sorted = [...scores].sort((a, b) => a - b);
const median = sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
console.log(`${errors === 0 ? 'PASS' : 'FAIL'}  M7 exit check 5: ${seeds - errors}/${seeds} careers reach their end with no errors.`);
console.log(`NOTE  Net worth at the end: median ${Math.round(median).toLocaleString('en-US')} cr (Section 22 monitor for a good trader: 250,000-600,000).`);
console.log(`Run time ${((Date.now() - started) / 1000).toFixed(0)} s.`);
