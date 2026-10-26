// Headless report on generator steps 1-3 and starting ship range, for many
// seeds. M2 replaces this with gen-report.ts (Section 6.11).
// Usage: npm run world-report -- [seedCount] [firstSeed]
import { jumpFuel, sectorTripFuel } from '../src/actor/fuel';
import { gameData } from '../src/data';
import { createShipFromLoadout } from '../src/ship/loadout';
import { travelStats } from '../src/ship/stats';
import { generateWorld } from '../src/world/generator';

const data = gameData();
const count = Number(process.argv[2] ?? 100);
const first = Number(process.argv[3] ?? 1);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

const laneLengths: number[] = [];
const lanesPerWorld: number[] = [];
const resamples: number[] = [];
const devCounts = { core: [] as number[], middle: [] as number[], frontier: [] as number[] };
const bodies: number[] = [];
const started = Date.now();

for (let seed = first; seed < first + count; seed++) {
  const world = generateWorld(seed, data);
  lanesPerWorld.push(world.lanes.length);
  resamples.push(world.generator.topologyResamples);
  for (const l of world.lanes) laneLengths.push(l.length);
  for (const dev of ['core', 'middle', 'frontier'] as const) {
    devCounts[dev].push(world.sectors.filter((s) => s.development === dev).length);
  }
  for (const s of world.sectors) bodies.push(s.locationIds.length);
}

const ship = createShipFromLoadout(data, data.balance.start.loadoutId, 'report', 'report');
const stats = travelStats(ship, data);
const meanLane = laneLengths.reduce((a, b) => a + b, 0) / laneLengths.length;
const fuelPerJump = jumpFuel(meanLane, stats, data);

console.log(`Seeds ${first}..${first + count - 1} (${Date.now() - started} ms)`);
console.log(`Lanes per world: median ${median(lanesPerWorld)}, min ${Math.min(...lanesPerWorld)}, max ${Math.max(...lanesPerWorld)}`);
console.log(
  `Lane length: mean ${meanLane.toFixed(1)}, median ${median(laneLengths).toFixed(1)}, min ${Math.min(...laneLengths).toFixed(1)}, max ${Math.max(...laneLengths).toFixed(1)}`,
);
console.log(`Topology resamples: max ${Math.max(...resamples)}`);
for (const dev of ['core', 'middle', 'frontier'] as const) {
  console.log(`${dev.padEnd(8)} sectors: median ${median(devCounts[dev])}, min ${Math.min(...devCounts[dev])}, max ${Math.max(...devCounts[dev])}`);
}
console.log(`Bodies per sector: min ${Math.min(...bodies)}, max ${Math.max(...bodies)}`);
console.log(
  `Starting ship: mass ${stats.mass} t, move ${stats.move}, fuel ${stats.fuelCapacity}, fuel per mean jump ${fuelPerJump.toFixed(2)}, jumps on a full tank ${(stats.fuelCapacity / fuelPerJump).toFixed(2)}`,
);
console.log(`Starting ship: fuel for a 30-unit sector trip ${sectorTripFuel(30, stats, data).toFixed(2)}`);
console.log(
  `Mean jump time ${(meanLane / (data.balance.travel.jumpFactor * stats.move)).toFixed(2)} days, 30-unit trip ${(30 / (data.balance.travel.cruiseFactor * stats.move)).toFixed(2)} days`,
);
