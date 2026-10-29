// Auto-battles for the Section 13.9 pairings (M4-TOOL-01, M4-TOOL-02). Both
// sides use the AI (the player side: Attack AI, Q-25) and default loadouts.
// Q-42 (owner, 2026-10-28): the laser Wasp check now shows that a dedicated
// light fighter beats the multipurpose Shuttle (head to head, and against a
// Raider by a margin); Laser Wasp vs 2 Raiders is a report.
// Q-46 (owner, 2026-10-29): the TU calibration and the median battle length
// are reports, not checks (TU does not account for loadout matchups).
// Usage: npm run sim-combat -- [battles] [--override=json] [--trace=pairing]
import { createRngState } from '../src/core/rng';
import { createBattle } from '../src/combat/battle';
import { resolveTurn } from '../src/combat/resolver';
import type { AiKind, Battle } from '../src/combat/types';
import { createShipFromLoadout } from '../src/ship/loadout';
import { dataWithOverride } from './lib/override';
import { templateTu } from '../src/encounter/budget';
import { loadoutTu } from '../src/ship/threat';

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
  /** Target band that is only reported (Q-46): it does not fail the run. */
  reportBand?: [number, number];
  /** Pass if the win rate is at least this much above the win rate of another pairing. */
  above?: { id: string; by: number };
  /** AI of the player side (default Attack, Q-25). */
  playerAi?: AiKind;
  /** TU calibration (Section 10.9): print the TU of both sides. */
  tu?: boolean;
}

const PAIRINGS: Pairing[] = [
  { id: 'shuttle-raider', name: 'Starting Shuttle vs 1 Pirate Raider', player: ['start_shuttle'], other: ['pirate_raider'], otherAi: 'raider', band: [0.4, 0.6] },
  { id: 'wasp-shuttle', name: 'Laser Wasp vs Starting Shuttle (Attack AI)', player: ['laser_wasp'], other: ['start_shuttle'], otherAi: 'attack', band: [0.7, 1] },
  { id: 'wasp-raider', name: 'Laser Wasp vs 1 Pirate Raider', player: ['laser_wasp'], other: ['pirate_raider'], otherAi: 'raider', above: { id: 'shuttle-raider', by: 0.2 } },
  { id: 'wasp-2raiders', name: 'Laser Wasp vs 2 Pirate Raiders (report; brief band 50%-70%)', player: ['laser_wasp'], other: ['pirate_raider', 'pirate_raider'], otherAi: 'raider' },
  // Section 13.9: each weapon family has a role (the better build wins more often against the same enemy).
  { id: 'bgun-wasps', name: 'Ballistic Gunship vs 3 Raiders (Wasp-heavy enemy)', player: ['ballistic_gunship'], other: ['pirate_raider', 'pirate_raider', 'pirate_raider'], otherAi: 'raider' },
  { id: 'lgun-wasps', name: 'Laser Gunship vs 3 Raiders: lasers win more often', player: ['laser_gunship'], other: ['pirate_raider', 'pirate_raider', 'pirate_raider'], otherAi: 'raider', above: { id: 'bgun-wasps', by: 0.01 } },
  { id: 'lcor-frig', name: 'Laser Corvette vs Pirate Frigate', player: ['laser_corvette'], other: ['pirate_frigate'], otherAi: 'raider' },
  { id: 'bcor-frig', name: 'Ballistic Corvette vs Pirate Frigate: ballistics win more often', player: ['ballistic_corvette'], other: ['pirate_frigate'], otherAi: 'raider', above: { id: 'lcor-frig', by: 0.01 } },
  { id: 'lfrig-bs', name: 'Laser Frigate vs Battleship', player: ['laser_frigate'], other: ['battleship'], otherAi: 'raider' },
  { id: 'tfrig-bs', name: 'Torpedo Frigate vs Battleship: torpedoes win more often', player: ['torpedo_frigate'], other: ['battleship'], otherAi: 'raider', above: { id: 'lfrig-bs', by: 0.01 } },
  // Section 10.9 TU calibration (report, Q-46): a single ship against a group of equal TU (±10%); target 35%-65%. Both sides use the Attack AI.
  { id: 'tu-1', name: 'TU: Pirate Gunship vs Raider Pack', player: ['pirate_gunship'], other: ['pirate_raider', 'pirate_raider', 'pirate_raider'], otherAi: 'attack', reportBand: [0.35, 0.65], tu: true },
  { id: 'tu-2', name: 'TU: Patrol Cutter vs Raider Pack', player: ['patrol_cutter'], other: ['pirate_raider', 'pirate_raider', 'pirate_raider'], otherAi: 'attack', reportBand: [0.35, 0.65], tu: true },
  { id: 'tu-3', name: 'TU: Pirate Corvette vs Gunship + Raider', player: ['pirate_corvette'], other: ['pirate_gunship', 'pirate_raider'], otherAi: 'attack', reportBand: [0.35, 0.65], tu: true },
  { id: 'tu-4', name: 'TU: Pirate Frigate vs Gunship Escort', player: ['pirate_frigate'], other: ['pirate_gunship', 'pirate_raider', 'pirate_raider'], otherAi: 'attack', reportBand: [0.35, 0.65], tu: true },
  { id: 'tu-5', name: 'TU: Battleship vs Frigate + Gunship + Raider', player: ['battleship'], other: ['pirate_frigate', 'pirate_gunship', 'pirate_raider'], otherAi: 'attack', reportBand: [0.35, 0.65], tu: true },
  { id: 'shuttle-3raiders', name: 'Starting Shuttle vs 3 Pirate Raiders (report)', player: ['start_shuttle'], other: ['pirate_raider', 'pirate_raider', 'pirate_raider'], otherAi: 'raider' },
  { id: 'gunship-trader', name: 'Laser Gunship vs Light Freighter trader (report)', player: ['laser_gunship'], other: ['light_freighter_trader'], otherAi: 'trader' },
];

const priority = (loadoutId: string) => data.loadoutById.get(loadoutId)?.powerPriority;

function run(p: Pairing, n: number, i: number): Battle {
  let b = createBattle(
    {
      player: p.player.map((l, k) => ({ ship: createShipFromLoadout(data, l, `p${k}`, `Player ${k + 1}`), ai: p.playerAi ?? 'attack', powerPriority: priority(l) })),
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
  const inBand = (r: [number, number]) => win >= r[0] && win <= r[1];
  const verdict = p.band ? (inBand(p.band) ? 'PASS' : 'FAIL') : p.above ? (win >= base - 1e-9 ? 'PASS' : 'FAIL') : 'NOTE';
  if (verdict === 'FAIL') fails++;
  const need = p.band
    ? ` (need ${pct(p.band[0])}-${pct(p.band[1])})`
    : p.above
      ? ` (need ${pct(base)}+: ${p.above.id} + ${pct(p.above.by)})`
      : p.reportBand
        ? ` (target ${pct(p.reportBand[0])}-${pct(p.reportBand[1])}: ${inBand(p.reportBand) ? 'in' : 'out of'} band)`
        : '';
  const tuText = p.tu ? ` [TU ${loadoutTu(p.player[0] ?? '', data).toFixed(1)} vs ${templateTu({ ships: p.other }, data).toFixed(1)}]` : '';
  console.log(
    `${verdict}  ${p.name}${tuText}: win ${pct(win)}${need}, loss ${pct(count.loss / battles)}, player fled ${pct(count.fled / battles)}, draw ${pct(count.draw / battles)}; wins by surrender ${count.surrender}, enemy fled ${count.enemyFled}; median ${median} turns`,
  );
}
// Q-46: the median battle length is a report (target 4-10 turns, Section 13.9).
const outside = lengths.filter((m) => m < 4 || m > 10).length;
console.log(`NOTE  Median battle length (target 4-10 turns, Section 13.9; report, Q-46): ${lengths.join(', ')}; ${outside} pairing(s) outside the target`);
console.log(fails === 0 ? 'All checks of this milestone pass.' : `${fails} check(s) fail.`);
