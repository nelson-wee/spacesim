// Guild contracts against open-market trade (owner question, 2026-11-03).
// The same seeds run with three trader policies:
//   trade: open-market routes only;
//   best:  a Supply contract only when it pays more per day than the best
//          known open-market route of similar length;
//   first: any profitable Supply contract first, chain alerts first.
// Reports net worth over time (early game: Shuttle, few credits), the first
// hull upgrade, contracts, and whether chain alerts end: for each alert
// contract that the bot completes, and for alert offers that it saw and did
// not take, is the alert gone `FOLLOW_DAYS` later?
// With --fill, a contract trip also carries trade goods for the same destination.
// Usage: npm run sim-contracts -- [seeds] [firstSeed] [days] [--policy=trade|best|first] [--fill]
import { chainAlertsAt } from '../src/actor/knowledge';
import { createGame } from '../src/core/newGame';
import type { Game } from '../src/core/game';
import { dataWithOverride } from './lib/override';
import { type ContractPolicy, newContractLog } from './lib/contractBot';
import { type BotOptions, botTurn, newBotState } from './lib/traderBot';
import { careerScore } from '../src/career/career';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const seeds = Number(args[0] ?? 10);
const firstSeed = Number(args[1] ?? 1);
const days = Number(args[2] ?? 150);
const only = process.argv.find((a) => a.startsWith('--policy='))?.split('=')[1];
const data = dataWithOverride(process.argv);
const FOLLOW_DAYS = 14;
const CHECKPOINTS = [15, 30, 60, 90, 120, 150, 240, 365].filter((d) => d <= days);
const policies: ('trade' | ContractPolicy)[] = only ? [only as 'trade' | ContractPolicy] : ['trade', 'best', 'first'];

interface Follow {
  destId: number;
  commodity: string;
  due: number;
  served: boolean;
}

interface Run {
  worth: number[];
  upgrade: number | null;
  done: number;
  failed: number;
  alertDone: number;
  served: { gone: number; total: number };
  unserved: { gone: number; total: number };
  worldAlerts: number;
}

function alertActive(game: Game, destId: number, commodity: string): boolean {
  const loc = game.state.world.locations[destId];
  return loc ? chainAlertsAt(game.state.world, data, loc).some((a) => a.commodity === commodity) : false;
}

function run(seed: number, policy: 'trade' | ContractPolicy): Run {
  const game = createGame(seed, data);
  const bot = newBotState();
  const clog = newContractLog();
  const opts: BotOptions = { targetHull: 'light_freighter', targetLoadout: 'light_freighter_starter', reserve: 2000, maxJumps: 3, ...(policy === 'trade' ? {} : { contracts: clog, contractPolicy: policy, contractFill: process.argv.includes('--fill') }) };
  const worth: number[] = [];
  const follows: Follow[] = [];
  const seen = new Set<string>();
  const served = { gone: 0, total: 0 };
  const unserved = { gone: 0, total: 0 };
  let nDeliveries = 0;
  let nUnserved = 0;
  let guard = 0;
  while (game.state.day < days && guard++ < 20000) {
    botTurn(game, bot, opts);
    while (worth.length < CHECKPOINTS.length && game.state.day >= (CHECKPOINTS[worth.length] as number)) worth.push(careerScore(game));
    for (const d of clog.deliveries.slice(nDeliveries)) if (d.alert) follows.push({ destId: d.destId, commodity: d.commodity, due: d.day + FOLLOW_DAYS, served: true });
    nDeliveries = clog.deliveries.length;
    for (const u of clog.unserved.slice(nUnserved)) {
      const key = `${u.destId}:${u.commodity}:${Math.floor(u.day / 7)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      follows.push({ destId: u.destId, commodity: u.commodity, due: u.day + FOLLOW_DAYS, served: false });
    }
    nUnserved = clog.unserved.length;
    for (const f of follows.filter((x) => x.due <= game.state.day)) {
      const gone = !alertActive(game, f.destId, f.commodity);
      const box = f.served ? served : unserved;
      box.total++;
      if (gone) box.gone++;
    }
    for (let i = follows.length - 1; i >= 0; i--) if ((follows[i] as Follow).due <= game.state.day) follows.splice(i, 1);
  }
  while (worth.length < CHECKPOINTS.length) worth.push(careerScore(game));
  const worldAlerts = game.state.world.locations.reduce((n, l) => n + chainAlertsAt(game.state.world, data, l).length, 0);
  return {
    worth,
    upgrade: bot.upgradeDay,
    done: game.state.contracts.completed,
    failed: game.state.contracts.failed,
    alertDone: clog.deliveries.filter((d) => d.alert).length,
    served,
    unserved,
    worldAlerts,
  };
}

const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.floor((s.length - 1) / 2)] as number) : NaN;
};
const started = Date.now();
console.log(`sim-contracts: ${seeds} seeds from ${firstSeed}, ${days} days; policies ${policies.join(', ')}; alert follow-up ${FOLLOW_DAYS} days.`);
const all = new Map<string, Run[]>();
for (const p of policies) all.set(p, []);
for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
  const cells: string[] = [];
  for (const p of policies) {
    const r = run(seed, p);
    all.get(p)?.push(r);
    cells.push(`${p} ${r.worth.map((w) => Math.round(w / 1000)).join('/')}k up ${r.upgrade === null ? '-' : r.upgrade.toFixed(0)} c ${r.done}/${r.failed}`);
  }
  console.log(`seed ${seed}: ${cells.join(' | ')}`);
}
console.log(`\nNet worth at days ${CHECKPOINTS.join(', ')} (median, cr); profit per day in each window:`);
for (const p of policies) {
  const runs = all.get(p) ?? [];
  const at = CHECKPOINTS.map((_, i) => med(runs.map((r) => r.worth[i] as number)));
  const start = data.balance.start.credits;
  const windows = at.map((w, i) => (w - (i === 0 ? start : (at[i - 1] as number))) / ((CHECKPOINTS[i] as number) - (i === 0 ? 0 : (CHECKPOINTS[i - 1] as number))));
  const ups = runs.map((r) => r.upgrade).filter((u): u is number => u !== null);
  const s = runs.reduce((a, r) => ({ gone: a.gone + r.served.gone, total: a.total + r.served.total }), { gone: 0, total: 0 });
  const u = runs.reduce((a, r) => ({ gone: a.gone + r.unserved.gone, total: a.total + r.unserved.total }), { gone: 0, total: 0 });
  const pct = (x: { gone: number; total: number }) => (x.total ? `${Math.round((100 * x.gone) / x.total)}% of ${x.total}` : '-');
  console.log(
    `${p.padEnd(6)} worth ${at.map((w) => Math.round(w).toLocaleString('en-US')).join(' / ')}; per day ${windows.map((w) => Math.round(w)).join(' / ')}; upgrade median day ${ups.length ? Math.round(med(ups)) : '-'} (${ups.length}/${runs.length})`,
  );
  if (p !== 'trade') {
    console.log(
      `       contracts done ${runs.reduce((a, r) => a + r.done, 0)}, failed ${runs.reduce((a, r) => a + r.failed, 0)}, alert contracts done ${runs.reduce((a, r) => a + r.alertDone, 0)}; alert gone ${FOLLOW_DAYS} days later: served ${pct(s)}, not served ${pct(u)}`,
    );
  }
  console.log(`       chain alerts in the world at the end: median ${med(runs.map((r) => r.worldAlerts))}`);
}
console.log(`Run time ${((Date.now() - started) / 1000).toFixed(0)} s.`);
