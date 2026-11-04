// Play test (M8, owner 2026-11-04): many bot careers in different play
// styles, with state checks after each turn and save/load round trips, to
// catch bugs that the balance tools do not show.
//   trader:     careful trader (no routes below security 2), contracts, flees pirates.
//   reckless:   trader on all routes, no contracts.
//   contractor: Supply contracts first, with trade goods in the rest of the hold.
//   pirate:     trades on all routes, attacks lone traders in sectors of security level 2 or lower, takes prizes; flees hostile patrols.
//   chaos:      random actions everywhere (tools/lib/chaosBot.ts).
//   calm:       random actions, but no attacks on traders and patrols, and Clone Insurance when it can.
// Each problem is reported once, with the style, seed, day, and the last actions.
// Usage: npx tsx tools/sim-playtest.ts [seeds] [firstSeed] [days] [--style=a,b] [--verbose]
import { securityLevel } from '../src/world/security';
import { finishBattle } from '../src/career/battleEnd';
import { endCareer } from '../src/career/career';
import { attackNonPirate } from '../src/career/consequences';
import { acceptSecondChance } from '../src/career/secondChance';
import type { Game } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import { Rng } from '../src/core/rng';
import { deserializeGame, serializeGame } from '../src/core/save';
import type { Encounter } from '../src/encounter/encounter';
import { type ChaosLog, chaosTurn, newChaosLog, playBattle } from './lib/chaosBot';
import { newContractLog } from './lib/contractBot';
import { encounterPolicy, newEncounterLog } from './lib/encounterBot';
import { checkInvariants } from './lib/invariants';
import { dataWithOverride } from './lib/override';
import { type BotOptions, botTurn, newBotState } from './lib/traderBot';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seeds = Number(args[0] ?? 10);
const firstSeed = Number(args[1] ?? 1);
const data = dataWithOverride(process.argv);
const days = Number(args[2] ?? data.balance.career.days);
const ALL = ['trader', 'reckless', 'contractor', 'pirate', 'chaos', 'calm'] as const;
type Style = (typeof ALL)[number];
const styles = (process.argv.find((a) => a.startsWith('--style='))?.split('=')[1]?.split(',') ?? ALL) as Style[];
const verbose = process.argv.includes('--verbose');

interface Problem {
  key: string;
  count: number;
  first: string;
}
const problems = new Map<string, Problem>();
function report(kind: string, text: string, where: string, last: string[]): void {
  const key = `${kind}: ${text.replace(/-?\d+(\.\d+)?(e-?\d+)?/g, '#')}`;
  const p = problems.get(key);
  if (p) p.count++;
  else problems.set(key, { key, count: 1, first: `${where}\n      last: ${last.slice(-6).join(' | ')}` });
}

interface Result {
  style: Style;
  seed: number;
  end: string;
  day: number;
  score: number;
  steps: number;
  secondChance: string;
  battles: number;
  prizes: number;
}

function run(style: Style, seed: number): Result {
  let game: Game = createGame(seed, data);
  const r = Rng.fromSeed(seed, `playtest-${style}`);
  const clog: ChaosLog = newChaosLog();
  const elog = newEncounterLog();
  const bot = newBotState();
  // The pirate attacks non-pirates; pirates and hostile patrols: fight.
  // The pirate attacks lone traders (the hail shows the escort), fights pirates that attack, and flees hostile patrols.
  const careful = encounterPolicy(game, game.state.player, elog);
  const pirateHandler = (enc: Encounter): 'continue' | 'stop' => {
    const sector = game.state.world.sectors[enc.sectorId];
    const lawless = sector !== undefined && securityLevel(sector.securityValue, data) <= 2;
    if (enc.kind === 'trader' && enc.ships.length === 1 && lawless) {
      attackNonPirate(game, game.state.player, enc.sectorId);
      playBattle(game, enc, 'player', r, clog);
      return 'stop';
    }
    if (enc.kind === 'pirate' && enc.behavior === 'attack') {
      playBattle(game, enc, 'other', r, clog);
      return 'stop';
    }
    return careful(enc);
  };
  const opts = (): BotOptions => {
    const base: BotOptions = { targetHull: 'light_freighter', targetLoadout: 'light_freighter_starter', reserve: 2000, maxJumps: 3 };
    if (style === 'trader') return { ...base, onEncounter: encounterPolicy(game, game.state.player, elog), contracts: newContractLog(), minSecurity: 2 };
    if (style === 'reckless') return { ...base, onEncounter: encounterPolicy(game, game.state.player, elog) };
    if (style === 'contractor') return { ...base, onEncounter: encounterPolicy(game, game.state.player, elog), contracts: newContractLog(), contractPolicy: 'first', contractFill: true };
    return { ...base, onEncounter: pirateHandler };
  };
  let o = opts();
  const where = () => `${style} seed ${seed} day ${game.state.day.toFixed(1)}`;
  let lastDay = 0;
  let steps = 0;
  let stuckSince = 0;
  let lastProgress = 0;
  let sc = 'none';
  let lastCredits = game.state.player.credits;
  let creditsDay = 0;
  let idle = false;
  try {
    while (game.state.day < days && game.state.career.end === null && steps < 60000) {
      steps++;
      // The bots do not answer the second-chance offer themselves: accept it (the chaos bot decides on its own).
      const offer = game.state.career.secondChance.offer;
      if (offer && style !== 'chaos' && style !== 'calm') {
        const res = acceptSecondChance(game);
        sc = `${offer.kind} day ${Math.floor(game.state.day)} ${res.ok ? 'accepted' : `refused: ${res.text}`}`;
        clog.last.push(`second chance ${sc}`);
        if (!res.ok) game.state.career.secondChance.offer = null;
      }
      if (style === 'chaos' || style === 'calm') {
        if (offer) sc = `${offer.kind} day ${Math.floor(game.state.day)}`;
        chaosTurn(game, r, clog, style === 'calm');
      } else {
        botTurn(game, bot, o);
        clog.last.push(`d${game.state.day.toFixed(1)} bot turn ${game.state.player.position.kind}`);
        if (clog.last.length > 12) clog.last.shift();
      }
      for (const p of checkInvariants(game, lastDay)) report('state', p, where(), clog.last);
      if (game.state.day > lastProgress + 1e-9) {
        lastProgress = game.state.day;
        stuckSince = steps;
      } else if (steps - stuckSince > 400) {
        report('stuck', `no time passes for 400 turns (${game.state.player.position.kind})`, where(), clog.last);
        break;
      }
      lastDay = game.state.day;
      // Idle: the credits do not change for 120 days (a bot that stopped trading).
      if (Math.abs(game.state.player.credits - lastCredits) > 1e-6) {
        lastCredits = game.state.player.credits;
        creditsDay = game.state.day;
      } else if (!idle && game.state.day - creditsDay > 120) {
        idle = true;
        const pl = game.state.player;
        const at = pl.position.kind === 'docked' ? game.state.world.locations[pl.position.locationId]?.name : pl.position.kind;
        const detail = `credits ${Math.round(pl.credits)}, notoriety ${Math.round(pl.notoriety)}, at ${at}, fleet ${pl.fleet.map((x) => `${x.hullId} fuel ${x.fuel.toFixed(1)} cargo ${Object.keys(x.cargo).join('+') || '-'}`).join('; ')}`;
        report('idle', `credits unchanged for 120 days (${pl.position.kind})`, `${where()} ${detail}`, clog.last);
      }
      // Save and load: the round trip keeps the state, and the game goes on from the loaded copy.
      if (steps % 40 === 0) {
        const text = serializeGame(game);
        const loaded = deserializeGame(text, data);
        if (typeof loaded === 'string') report('save', loaded, where(), clog.last);
        else {
          if (serializeGame(loaded) !== text) report('save', 'round trip changes the state', where(), clog.last);
          game = loaded;
          bot.plan = null;
          o = opts();
        }
      }
    }
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    report('crash', `${e.message} @ ${(e.stack ?? '').split('\n')[1]?.trim() ?? ''}`, where(), clog.last);
  }
  const end = game.state.career.end ?? (game.state.day >= days ? endCareer(game, 'day') : null);
  return {
    style,
    seed,
    end: end ? end.reason : `stopped (${steps} turns)`,
    day: game.state.day,
    score: end?.score ?? 0,
    steps,
    secondChance: sc,
    battles: clog.battles + elog.battles,
    prizes: clog.prizes,
  };
}

const started = Date.now();
console.log(`sim-playtest: ${seeds} seeds from ${firstSeed}, ${days} days, styles ${styles.join(', ')}.`);
const results: Result[] = [];
for (const style of styles) {
  for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
    const res = run(style, seed);
    results.push(res);
    if (verbose) console.log(`  ${style} seed ${seed}: ${res.end} day ${res.day.toFixed(0)}, score ${Math.round(res.score)}, battles ${res.battles}, prizes ${res.prizes}, second chance ${res.secondChance}, ${res.steps} turns`);
  }
  const mine = results.filter((x) => x.style === style);
  const ends: Record<string, number> = {};
  for (const x of mine) ends[x.end.split(' (')[0] as string] = (ends[x.end.split(' (')[0] as string] ?? 0) + 1;
  const sorted = mine.map((x) => x.score).sort((a, b) => a - b);
  console.log(
    `${style.padEnd(10)} ends ${JSON.stringify(ends)}; median score ${Math.round(sorted[Math.floor((sorted.length - 1) / 2)] ?? 0)}; battles ${mine.reduce((s, x) => s + x.battles, 0)}, prizes ${mine.reduce((s, x) => s + x.prizes, 0)}; second chance ${mine.filter((x) => x.secondChance !== 'none').length}/${mine.length}`,
  );
}
console.log(`\nProblems (${problems.size} kinds):`);
for (const p of [...problems.values()].sort((a, b) => b.count - a.count)) console.log(`  ${p.count}x ${p.key}\n      first: ${p.first}`);
console.log(`${problems.size === 0 ? 'PASS' : 'FAIL'}  play test: ${results.length} careers, ${problems.size} kinds of problems.`);
console.log(`Run time ${((Date.now() - started) / 1000).toFixed(0)} s.`);
