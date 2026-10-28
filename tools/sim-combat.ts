// Auto-battles for the Section 13.9 pairings (M4-TOOL-01, M4-TOOL-02). Both
// sides use the AI (the player side: Attack AI, Q-25) and default loadouts.
// Q-42 (owner, 2026-10-28): the laser Wasp check now shows that a dedicated
// light fighter beats the multipurpose Shuttle (head to head, and against a
// Raider by a margin); Laser Wasp vs 2 Raiders is a report.
// Usage: npm run sim-combat -- [battles] [--override=json] [--trace=pairing]
import { createRngState } from '../src/core/rng';
import { createBattle } from '../src/combat/battle';
import { resolveTurn } from '../src/combat/resolver';
import type { AiKind, Battle } from '../src/combat/types';
import { createShipFromLoadout } from '../src/ship/loadout';
import { dataWithOverride } from './lib/override';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const battles = Number(args[0] ?? 500);
const trace = process.argv.find((a) => a.startsWith('--trace='))?.slice('--trace='.length);
const data = dataWithOverride(process.argv);

interface Pairing {
  id: string;
  name: string;
  player: string[];
  other: string[];
  otherAi: AiKind;
  /** Pass band for the player win rate, if this milestone checks it. */
  band?: [number, number];
  /** Pass if the win rate is at least this much above the win rate of another pairing. */
  above?: { id: string; by: number };
}

const PAIRINGS: Pairing[] = [
  { id: 'shuttle-raider', name: 'Starting Shuttle vs 1 Pirate Raider', player: ['start_shuttle'], other: ['pirate_raider'], otherAi: 'raider', band: [0.4, 0.6] },
  { id: 'wasp-shuttle', name: 'Laser Wasp vs Starting Shuttle (Attack AI)', player: ['laser_wasp'], other: ['start_shuttle'], otherAi: 'attack', band: [0.7, 1] },
  { id: 'wasp-raider', name: 'Laser Wasp vs 1 Pirate Raider', player: ['laser_wasp'], other: ['pirate_raider'], otherAi: 'raider', above: { id: 'shuttle-raider', by: 0.2 } },
  { id: 'wasp-2raiders', name: 'Laser Wasp vs 2 Pirate Raiders (report; brief band 50%-70%)', player: ['laser_wasp'], other: ['pirate_raider', 'pirate_raider'], otherAi: 'raider' },
  { id: 'shuttle-3raiders', name: 'Starting Shuttle vs 3 Pirate Raiders (report)', player: ['start_shuttle'], other: ['pirate_raider', 'pirate_raider', 'pirate_raider'], otherAi: 'raider' },
  { id: 'gunship-3raiders', name: 'Laser Gunship vs 3 Pirate Raiders (report)', player: ['laser_gunship'], other: ['pirate_raider', 'pirate_raider', 'pirate_raider'], otherAi: 'raider' },
  { id: 'gunship-trader', name: 'Laser Gunship vs Light Freighter trader (report)', player: ['laser_gunship'], other: ['light_freighter_trader'], otherAi: 'trader' },
];

const priority = (loadoutId: string) => data.loadoutById.get(loadoutId)?.powerPriority;

function run(p: Pairing, n: number, i: number): Battle {
  let b = createBattle(
    {
      player: p.player.map((l, k) => ({ ship: createShipFromLoadout(data, l, `p${k}`, `Player ${k + 1}`), ai: 'attack', powerPriority: priority(l) })),
      other: p.other.map((l, k) => ({ ship: createShipFromLoadout(data, l, `o${k}`, `${data.loadoutById.get(l)?.name ?? l} ${k + 1}`), ai: p.otherAi, powerPriority: priority(l) })),
      aggressor: p.otherAi === 'trader' ? 'player' : 'other',
      rng: createRngState(n * 7919 + i, 'combat'),
    },
    data,
  );
  while (!b.result) {
    const out = resolveTurn(b, null, data);
    if (trace === p.id && i === 0) {
      for (const e of out.effects) if (e.kind !== 'move') console.log(`  t${b.turn} ${JSON.stringify(e)}`);
      const pl = out.battle.ships.map((s) => `${s.name}: hull ${s.ship.hullHp.toFixed(0)} sh ${s.shield.toFixed(0)} heat ${s.heat.toFixed(0)} ${s.status}`);
      console.log(`  after t${b.turn}: ${pl.join(' | ')}`);
    }
    b = out.battle;
  }
  return b;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
let fails = 0;
const lengths: number[] = [];
const winRates = new Map<string, number>();
console.log(`sim-combat: ${battles} battles per pairing.`);
for (const p of PAIRINGS) {
  const count = { win: 0, loss: 0, fled: 0, draw: 0, surrender: 0, enemyFled: 0 };
  const turns: number[] = [];
  for (let i = 0; i < battles; i++) {
    const b = run(p, PAIRINGS.indexOf(p), i);
    count[b.result as 'win' | 'loss' | 'fled' | 'draw']++;
    if (b.result === 'win') {
      if (b.ships.some((s) => s.side === 'other' && s.status === 'surrendered')) count.surrender++;
      if (b.ships.some((s) => s.side === 'other' && s.status === 'fled')) count.enemyFled++;
    }
    turns.push(b.turn);
  }
  turns.sort((a, b) => a - b);
  const median = turns[Math.floor(turns.length / 2)] ?? 0;
  lengths.push(median);
  const win = count.win / battles;
  winRates.set(p.id, win);
  const base = p.above ? (winRates.get(p.above.id) ?? 0) + p.above.by : 0;
  const verdict = p.band ? (win >= p.band[0] && win <= p.band[1] ? 'PASS' : 'FAIL') : p.above ? (win >= base - 1e-9 ? 'PASS' : 'FAIL') : 'NOTE';
  if (verdict === 'FAIL') fails++;
  const need = p.band ? ` (need ${pct(p.band[0])}-${pct(p.band[1])})` : p.above ? ` (need ${pct(base)}+: ${p.above.id} + ${pct(p.above.by)})` : '';
  console.log(
    `${verdict}  ${p.name}: win ${pct(win)}${need}, loss ${pct(count.loss / battles)}, player fled ${pct(count.fled / battles)}, draw ${pct(count.draw / battles)}; wins by surrender ${count.surrender}, enemy fled ${count.enemyFled}; median ${median} turns`,
  );
}
const allIn = lengths.every((m) => m >= 4 && m <= 10);
console.log(`${allIn ? 'NOTE' : 'NOTE'}  Median battle length 4-10 turns (monitor): ${lengths.join(', ')}`);
console.log(fails === 0 ? 'All checks of this milestone pass.' : `${fails} check(s) fail.`);
