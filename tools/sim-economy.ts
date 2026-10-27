// Headless economy test (Section 9.13). Runs the economy with no player and
// fixed security, and checks the acceptance rules.
// Usage: npm run sim-economy -- [days] [seeds] [firstSeed] [--csv=dir] [--quiet]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Rng } from '../src/core/rng';
import type { Location, World } from '../src/core/types';
import type { GameData } from '../src/data';
import { dataWithOverride } from './lib/override';
import { createEconContext } from '../src/econ/context';
import { type EconomyDayOptions, economyDay } from '../src/econ/economy';
import { priceGradient } from '../src/econ/gradient';
import { basePrice, midPrice } from '../src/econ/prices';
import { recipeOf } from '../src/econ/recipes';
import { DayReport } from '../src/econ/report';
import { generateWorld } from '../src/world/generator';
import { EconStats, median } from './lib/econStats';

const data = dataWithOverride(process.argv);
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name: string) => process.argv.find((a) => a.startsWith(`--${name}`))?.split('=')[1];
const days = Number(args[0] ?? 1000);
const seeds = Number(args[1] ?? 20);
const firstSeed = Number(args[2] ?? 1);
const csvDir = flag('csv');
const quiet = process.argv.includes('--quiet');
const WARMUP = 50;
/** Clamp check (DECISIONS.md, M2): report above CLAMP_NOTE, fail above CLAMP_SYSTEMIC. */
const CLAMP_NOTE = 0.2;
const CLAMP_SYSTEMIC = 0.5;

interface Runner {
  world: World;
  run: (n: number, report?: (r: DayReport) => void, options?: EconomyDayOptions) => void;
}

function runner(world: World, seed: number, rngState?: Rng): Runner {
  const ctx = createEconContext(world, data);
  const rng = rngState ?? Rng.fromSeed(seed, 'economy');
  return {
    world,
    run(n, report, options) {
      for (let i = 0; i < n; i++) {
        const r = report ? new DayReport() : undefined;
        economyDay(ctx, world.economy, rng, r, options);
        if (r && report) report(r);
      }
    },
  };
}

function clone(world: World): World {
  return JSON.parse(JSON.stringify(world)) as World;
}

const CSV_HEADER = 'day,location,sector,development,commodity,stock,target,price,produced,consumed,flowIn,flowOut,offMap,installedMachinery';

function csvRows(world: World, day: number, r: DayReport): string[] {
  const rows: string[] = [];
  for (const loc of world.locations) {
    const sector = world.sectors[loc.sectorId];
    for (const [c, entry] of Object.entries(loc.market)) {
      const row = r.get(loc.id, c);
      rows.push(
        [
          day,
          JSON.stringify(loc.name),
          JSON.stringify(sector?.name ?? ''),
          sector?.development ?? '',
          c,
          entry.stock.toFixed(2),
          entry.target.toFixed(2),
          midPrice(entry, basePrice(data, c), data).toFixed(2),
          (row?.produced ?? 0).toFixed(3),
          (row?.consumed ?? 0).toFixed(3),
          (row?.flowIn ?? 0).toFixed(3),
          (row?.flowOut ?? 0).toFixed(3),
          (row?.offMap ?? 0).toFixed(3),
          loc.installedMachinery.toFixed(3),
        ].join(','),
      );
    }
  }
  return rows;
}

/** Chain shock: stop Iron Ore output in one sector for 30 days; watch Alloys prices next door. */
function chainShock(world: World, seed: number): { rise: number; recoverDays: number; sector: string } | null {
  const oreSectors = new Set(world.locations.filter((l) => l.producer === 'ore_mine').map((l) => l.sectorId));
  // The sector with the most ore output.
  const sid = [...oreSectors].sort(
    (a, b) =>
      world.locations.filter((l) => l.sectorId === b && l.producer === 'ore_mine').reduce((s, l) => s + l.size, 0) -
      world.locations.filter((l) => l.sectorId === a && l.producer === 'ore_mine').reduce((s, l) => s + l.size, 0),
  )[0];
  if (sid === undefined) return null;
  const neighbours = new Set(world.lanes.flatMap((l) => (l.a === sid ? [l.b] : l.b === sid ? [l.a] : [])));
  const watch = world.locations.filter((l) => neighbours.has(l.sectorId) && l.market.alloys);
  if (watch.length === 0) return null;
  const alloyPrice = (w: World) => {
    const list = watch.map((l) => (w.locations[l.id] as Location).market.alloys).filter((e) => e !== undefined);
    return list.reduce((s, e) => s + midPrice(e, basePrice(data, 'alloys'), data), 0) / list.length;
  };
  const r = runner(world, seed + 7000);
  r.run(100);
  let normal = 0;
  for (let i = 0; i < 30; i++) {
    r.run(1);
    normal += alloyPrice(world) / 30;
  }
  const stop: EconomyDayOptions = { eventMult: (l) => (l.sectorId === sid && l.producer === 'ore_mine' ? 0 : 1) };
  let peak = normal;
  for (let i = 0; i < 30; i++) {
    r.run(1, undefined, stop);
    peak = Math.max(peak, alloyPrice(world));
  }
  let recoverDays = -1;
  for (let i = 1; i <= 120; i++) {
    r.run(1);
    peak = i <= 10 ? Math.max(peak, alloyPrice(world)) : peak;
    if (recoverDays < 0 && i > 1 && Math.abs(alloyPrice(world) / normal - 1) <= 0.1) recoverDays = i;
  }
  return { rise: peak / normal - 1, recoverDays, sector: world.sectors[sid]?.name ?? '?' };
}

/** Capital: deliver 10 Machinery to a Frontier mine with K = K_ref; compare output with a control run. */
function capitalTest(world: World, seed: number): { higherDays: number; mine: string } | null {
  const mine = world.locations.find((l) => l.producer?.endsWith('_mine') && world.sectors[l.sectorId]?.development === 'frontier');
  if (!mine) return null;
  const warm = runner(world, seed + 9000);
  warm.run(100);
  const recipe = recipeOf(data, mine.producer as string);
  const kref = recipe.machineryPerBatch * recipe.batchesPerSize * mine.size;
  // "K = K_ref": the mine has no spare Machinery (it would install it at once).
  mine.installedMachinery = kref;
  if (mine.market.machinery) mine.market.machinery.stock = 0;
  const control = clone(world);
  const rngA = Rng.fromSeed(seed, 'capital');
  const rngB = Rng.fromSeed(seed, 'capital');
  const entry = mine.market.machinery;
  if (entry) entry.stock += 10;
  const a = runner(world, seed, rngA);
  const b = runner(control, seed, rngB);
  // Machinery installs after production, so the first day is the same in both runs.
  a.run(1);
  b.run(1);
  let higherDays = 0;
  for (let d = 0; d < 180; d++) {
    a.run(1);
    b.run(1);
    const outA = (world.locations[mine.id] as Location).production?.outputRatio ?? 0;
    const outB = (control.locations[mine.id] as Location).production?.outputRatio ?? 0;
    if (outA > outB * 1.005) higherDays++;
    else break;
  }
  return { higherDays, mine: `${mine.name} (${mine.producer})` };
}

interface SeedResult {
  seed: number;
  stats: EconStats;
  shock: ReturnType<typeof chainShock>;
  capital: ReturnType<typeof capitalTest>;
}

function runSeed(seed: number): SeedResult {
  const world = generateWorld(seed, data);
  const stats = new EconStats(world, data, WARMUP);
  const csv: string[] = csvDir ? [CSV_HEADER] : [];
  const r = runner(world, seed);
  for (let day = 1; day <= days; day++) {
    r.run(1, (rep) => {
      stats.record(rep);
      if (csvDir) csv.push(...csvRows(world, day, rep));
    });
  }
  if (csvDir) {
    mkdirSync(csvDir, { recursive: true });
    writeFileSync(join(csvDir, `economy-seed-${seed}.csv`), `${csv.join('\n')}\n`);
  }
  return { seed, stats, shock: chainShock(generateWorld(seed, data), seed), capital: capitalTest(generateWorld(seed, data), seed) };
}

function check(name: string, passCount: number, total: number, detail = ''): boolean {
  const pass = passCount === total;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${passCount}/${total} seeds${detail ? `  (${detail})` : ''}`);
  return pass;
}

function report(results: SeedResult[], d: GameData): void {
  const devs = ['frontier', 'middle', 'core'] as const;
  console.log(`\nPrices per commodity (min / median / max), after ${WARMUP} warm-up days:`);
  console.log(`${'commodity'.padEnd(14)}${devs.map((x) => x.padEnd(24)).join('')}`);
  for (const c of d.commodities) {
    const cells = devs.map((dev) => {
      const all = results.flatMap((r) => r.stats.prices.get(`${c.id}:${dev}`) ?? []);
      if (all.length === 0) return '-'.padEnd(24);
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of all) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      return `${lo.toFixed(0)} / ${median(all).toFixed(0)} / ${hi.toFixed(0)}`.padEnd(24);
    });
    console.log(`${c.id.padEnd(14)}${cells.join('')}`);
  }

  console.log('\nChecks (Section 9.13):');
  const n = results.length;
  // Clamp (soft check, DECISIONS.md): price gaps are good for trade. A commodity at the clamp on
  // more than CLAMP_NOTE of its market-days is only reported; more than CLAMP_SYSTEMIC is a
  // systemic problem (most markets of the commodity are empty or full) and fails.
  const clampNotes: string[] = [];
  const clampFails: string[] = [];
  const clampPass = results.filter((r) => {
    let ok = true;
    for (const c of d.commodities) {
      const days = Math.max(1, r.stats.marketDays.get(c.id) ?? 0);
      const share = (r.stats.clampDays.get(c.id) ?? 0) / days;
      const low = (r.stats.clampLow.get(c.id) ?? 0) / days;
      const text = `s${r.seed}:${c.id} ${(share * 100).toFixed(0)}% (low ${(low * 100).toFixed(0)}%)`;
      if (share > CLAMP_SYSTEMIC) {
        ok = false;
        clampFails.push(text);
      } else if (share > CLAMP_NOTE) clampNotes.push(text);
    }
    return ok;
  }).length;
  check(`No systemic clamp: no commodity at the price clamp on more than ${CLAMP_SYSTEMIC * 100}% of market-days`, clampPass, n, clampFails.slice(0, 8).join(', '));
  console.log(`NOTE  At the clamp on more than ${CLAMP_NOTE * 100}% of market-days: ${clampNotes.length} commodity-seeds of ${n * d.commodities.length}${clampNotes.length ? ` (${clampNotes.slice(0, 8).join(', ')})` : ''}`);
  check('No stock below 0', results.filter((r) => r.stats.negativeStock === 0).length, n);
  const lowFails: string[] = [];
  const lowPass = results.filter((r) => {
    const bad = [...r.stats.longestLow].filter(([, v]) => v > 60);
    for (const [id, v] of bad) lowFails.push(`s${r.seed}:${r.stats.producerName(id)} ${v}d`);
    return bad.length === 0;
  }).length;
  check('No producer below 30% output for more than 60 days in a row', lowPass, n, lowFails.slice(0, 6).join(', '));
  const gradFails: string[] = [];
  const gradPass = results.filter((r) => {
    const g = priceGradient(r.stats.factors, d);
    if (!g.pass) gradFails.push(`s${r.seed}: ${g.problems.join(', ')}`);
    return g.pass;
  }).length;
  check('Gradient: raw costs more in Core; advanced costs less in Core, per commodity (Q-34)', gradPass, n, gradFails.slice(0, 4).join('; '));
  const routeFails: string[] = [];
  const routePass = results.filter((r) => {
    let ok = true;
    for (const c of d.commodities) {
      const share = (r.stats.routeDays.get(c.id) ?? 0) / Math.max(1, r.stats.measuredDays);
      if (share < 0.6) {
        ok = false;
        routeFails.push(`s${r.seed}:${c.id} ${(share * 100).toFixed(0)}%`);
      }
    }
    return ok;
  }).length;
  check('Each commodity: a 1-3 jump route with margin >= 25% on >= 60% of days', routePass, n, routeFails.slice(0, 8).join(', '));
  const bandFails: string[] = [];
  const bandPass = results.filter((r) => {
    let ok = true;
    for (const c of d.commodities.filter((x) => x.tier === 'raw')) {
      const share = (r.stats.rawBandDays.get(c.id) ?? 0) / Math.max(1, r.stats.measuredDays);
      if (share < 0.5) {
        ok = false;
        bandFails.push(`s${r.seed}:${c.id} ${(share * 100).toFixed(0)}%`);
      }
    }
    return ok;
  }).length;
  check('Raw goods: a 1-2 jump route with margin 40%-80% on >= 50% of days', bandPass, n, bandFails.slice(0, 8).join(', '));
  const shockPass = results.filter((r) => r.shock && r.shock.rise >= 0.3 && r.shock.recoverDays >= 0 && r.shock.recoverDays <= 60).length;
  check(
    'Chain shock: Alloys next door rise >= 30%, back within 10% in 60 days',
    shockPass,
    n,
    results.map((r) => (r.shock ? `s${r.seed} +${(r.shock.rise * 100).toFixed(0)}% ${r.shock.recoverDays}d` : `s${r.seed} n/a`)).slice(0, 8).join(', '),
  );
  const capPass = results.filter((r) => r.capital && r.capital.higherDays >= 60).length;
  check(
    'Capital: 10 Machinery to a Frontier mine keeps output higher for >= 60 days',
    capPass,
    n,
    results.map((r) => (r.capital ? `s${r.seed} ${r.capital.higherDays}d` : `s${r.seed} n/a`)).slice(0, 8).join(', '),
  );
}

const started = Date.now();
const results: SeedResult[] = [];
for (let s = firstSeed; s < firstSeed + seeds; s++) {
  results.push(runSeed(s));
  if (!quiet) process.stdout.write('.');
}
console.log(`\nsim-economy: ${days} days x ${seeds} seeds (first ${firstSeed}), ${((Date.now() - started) / 1000).toFixed(1)} s`);
report(results, data);
