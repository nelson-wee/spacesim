// Generator report (Section 6.11): generates many seeds and prints the
// blueprint ratios, rule results, repairs, retries, and station use.
// Usage: npm run gen-report -- [seedCount] [firstSeed] [--verbose]
import { dataWithOverride } from './lib/override';
import { computeBlueprint } from '../src/world/blueprint';
import { supplyRatios } from '../src/world/assign';
import { type GenerationAttempt, GenerationError, generateWorldWithLog } from '../src/world/generator';
import { nominalSupplyDemand } from '../src/world/assign';

const data = dataWithOverride(process.argv);
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const verbose = process.argv.includes('--verbose');
const count = Number(args[0] ?? 100);
const first = Number(args[1] ?? 1);

let passTwo = 0;
let errors = 0;
const triesHist = new Map<number, number>();
const ruleFails = new Map<string, number>();
const repairKinds = new Map<string, number>();
const ratioWorst = new Map<string, number[]>();
const stationUse = new Map<string, number>();
const started = Date.now();

function note(attempts: GenerationAttempt[]): void {
  for (const a of attempts) {
    for (const r of a.rules) if (!r.pass) ruleFails.set(r.id, (ruleFails.get(r.id) ?? 0) + 1);
    for (const rep of a.repairs) {
      const kind = rep.split(' ').slice(0, 2).join(' ');
      repairKinds.set(kind, (repairKinds.get(kind) ?? 0) + 1);
    }
  }
}

for (let seed = first; seed < first + count; seed++) {
  try {
    const t0 = Date.now();
    const { world, attempts } = generateWorldWithLog(seed, data);
    note(attempts);
    const tries = attempts.length;
    triesHist.set(tries, (triesHist.get(tries) ?? 0) + 1);
    if (tries <= 2) passTwo++;
    for (const [c, r] of Object.entries(supplyRatios(world, data))) (ratioWorst.get(c) ?? ratioWorst.set(c, []).get(c))?.push(r);
    for (const l of world.locations) if (l.kind === 'station') stationUse.set(l.bodyType, (stationUse.get(l.bodyType) ?? 0) + 1);
    if (verbose) {
      const bp = computeBlueprint(world, data);
      console.log(
        `seed ${seed}: tries ${tries}, repairs ${world.generator.repairs}, ${Date.now() - t0} ms, producers ${world.locations.filter((l) => l.producer).length}/${world.locations.length}`,
      );
      console.log(`  blueprint counts: ${Object.entries(bp.counts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      for (const a of attempts) {
        const failed = a.rules.filter((r) => !r.pass).map((r) => `${r.id} (${r.detail})`);
        console.log(`  try seed ${a.seed}: ${a.pass ? 'PASS' : 'FAIL'}; repairs: ${a.repairs.join(', ') || 'none'}; failed: ${failed.join(' | ') || 'none'}`);
      }
    }
  } catch (err) {
    errors++;
    triesHist.set(99, (triesHist.get(99) ?? 0) + 1);
    if (!(err instanceof GenerationError)) throw err;
    note(err.attempts);
    if (verbose) {
      console.log(`seed ${seed}: NO WORLD after ${err.attempts.length} tries`);
      for (const a of err.attempts.slice(0, 3)) {
        const failed = a.rules.filter((r) => !r.pass).map((r) => `${r.id} (${r.detail})`);
        console.log(`  try seed ${a.seed}: repairs: ${a.repairs.join(', ') || 'none'}; failed: ${failed.join(' | ')}`);
      }
      const w = err.lastWorld;
      if (w) {
        const sd = nominalSupplyDemand(w, data);
        const counts = new Map<string, string[]>();
        for (const l of w.locations) if (l.producer) (counts.get(l.producer) ?? counts.set(l.producer, []).get(l.producer))?.push(String(l.size));
        console.log(`  last world producers (sizes): ${[...counts].map(([k, v]) => `${k} [${v.join(',')}]`).join('; ')}`);
        console.log(`  supply/demand: ${data.commodities.map((c) => `${c.id} ${(sd.supply[c.id] ?? 0).toFixed(1)}/${(sd.demand[c.id] ?? 0).toFixed(1)}`).join('; ')}`);
      }
    }
  }
}

const ms = Date.now() - started;
console.log(`\nGenerator report: seeds ${first}..${first + count - 1}, ${ms} ms (${(ms / count).toFixed(0)} ms per seed)`);
console.log(`Tries: ${[...triesHist].sort((a, b) => a[0] - b[0]).map(([t, n]) => `${t === 99 ? 'error' : t}: ${n}`).join(', ')}`);
console.log(`Rule failures (all tries): ${[...ruleFails].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
console.log(`Repairs: ${[...repairKinds].map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
console.log(`Stations: ${[...stationUse].map(([k, v]) => `${k} ${v}`).join(', ')}`);
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? NaN;
console.log(`Supply/demand ratio (median, min, max): ${[...ratioWorst].map(([c, v]) => `${c} ${med(v).toFixed(2)} [${Math.min(...v).toFixed(2)}, ${Math.max(...v).toFixed(2)}]`).join('; ')}`);
const pass = passTwo >= Math.ceil(0.95 * count);
console.log(`Check (Section 6.11): ${passTwo} of ${count} seeds pass with 2 tries or fewer (need ${Math.ceil(0.95 * count)}): ${pass ? 'PASS' : 'FAIL'}`);
if (errors > 0) console.log(`Errors: ${errors}`);
