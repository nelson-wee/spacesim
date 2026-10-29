// Ship report (Sections 11.4, 8.7, 10.5, 10.6, M5-TOOL-01): derived stats and
// threat units of all default loadouts, the Section 11.4 reference rows, the
// fuel checks, the TU reference values, and the template TU. Usage: npm run ship-report
import { gameData } from '../src/data';
import { createShipFromLoadout } from '../src/ship/loadout';
import { checkLoadout } from '../src/ship/rules';
import { motion, travelStats } from '../src/ship/stats';
import { durability, firepower, loadoutTu } from '../src/ship/threat';
import { templateTu } from '../src/encounter/budget';

const data = gameData();
const pad = (v: string | number, n: number) => String(v).padStart(n);

console.log('Default loadouts (empty; laden = full cargo):');
console.log(
  `${'loadout'.padEnd(26)}${pad('mass', 6)}${pad('laden', 7)}${pad('TWR', 6)}${pad('agil', 6)}${pad('man', 5)}${pad('move', 5)}${pad('power', 11)}${pad('mv+all', 7)}${pad('heat', 6)}${pad('cool', 5)}${pad('fuel', 6)}${pad('f/jump', 8)}${pad('cargo', 6)}${pad('durab', 7)}${pad('TU', 7)}  rules`,
);
let invalid = 0;
for (const l of data.loadoutById.values()) {
  const ship = createShipFromLoadout(data, l.id, 'r', l.name);
  const s = travelStats(ship, data);
  const check = checkLoadout(ship, data);
  if (check.errors.length > 0) invalid++;
  const laden = s.mass + s.cargoCapacity;
  console.log(
    `${l.id.padEnd(26)}${pad(s.mass.toFixed(0), 6)}${pad(laden.toFixed(0), 7)}${pad(s.twr.toFixed(2), 6)}${pad(s.agility.toFixed(2), 6)}${pad(Math.round(s.maneuver), 5)}${pad(s.move, 5)}${pad(`${s.powerSupply - s.powerReserve}(${s.powerReserve})/${s.powerSupply}`, 11)}${pad(s.powerMove + s.powerWeapons, 7)}${pad(s.heatPerTurn.toFixed(0), 6)}${pad(s.cooling, 5)}${pad(s.fuelCapacity, 6)}${pad(s.fuelPerJump.toFixed(1), 8)}${pad(s.cargoCapacity, 6)}${pad(s.durability, 7)}${pad(loadoutTu(l.id, data).toFixed(1), 7)}  ${check.errors.length ? `INVALID: ${check.errors.join(' ')}` : check.warnings.length ? 'power warning' : 'ok'}`,
  );
}
console.log(`${invalid === 0 ? 'PASS' : 'FAIL'}  All default loadouts are valid (${data.loadoutById.size - invalid}/${data.loadoutById.size})`);

// Section 11.4: "These rows test the formulas at the masses shown" (DECISIONS.md, M3).
const ENGINE = { S: 30, M: 80, L: 200 } as const;
const ROWS: [string, (keyof typeof ENGINE)[], number, number, number, number, number][] = [
  ['Wasp, 1 x S engine', ['S'], 15, 2.0, 1.75, 75, 6],
  ['Wasp, 2 x S engine', ['S', 'S'], 17, 3.53, 2.96, 90, 6],
  ['Starting Shuttle, empty', ['S'], 28, 1.07, 0.76, 37, 4],
  ['Starting Shuttle, 20 t cargo', ['S'], 48, 0.62, 0.37, 12, 3],
  ['Shuttle, 2 x S engine, 20 t cargo', ['S', 'S'], 50, 1.2, 0.7, 33, 4],
  ['Gunship, 1 x M', ['M'], 48, 1.67, 0.99, 49, 5],
  ['Gunship, 1 x M + 1 x S', ['M', 'S'], 50, 2.2, 1.29, 62, 5],
  ['Light Freighter, 1 x M, laden', ['M'], 68, 1.18, 0.62, 28, 4],
  ['Corvette, 1 x L', ['L'], 104, 1.92, 0.88, 44, 5],
  ['Heavy Freighter, 1 x L, laden', ['L'], 156, 1.28, 0.51, 21, 4],
  ['Frigate, 2 x L', ['L', 'L'], 232, 1.72, 0.6, 27, 4],
  ['Battleship, 4 x L', ['L', 'L', 'L', 'L'], 654, 1.22, 0.3, 8, 3],
];
console.log('\nSection 11.4 reference rows (engines and mass from the table):');
let rowFails = 0;
for (const [name, engines, mass, twr, agility, maneuver, move] of ROWS) {
  const thrust = engines.reduce((s, e) => s + ENGINE[e], 0);
  const m = motion(thrust, mass, 1, data.balance.ship.mRef);
  const ok =
    Math.abs(m.twr - twr) <= 0.01 && Math.abs(m.agility - agility) <= 0.01 && Math.abs(Math.round(m.maneuver) - maneuver) <= 1 && Math.abs(m.move - move) <= 1;
  if (!ok) rowFails++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(36)} mass ${pad(mass, 4)}  TWR ${m.twr.toFixed(2)} (${twr})  agility ${m.agility.toFixed(2)} (${agility})  maneuver ${Math.round(m.maneuver)} (${maneuver})  move ${m.move} (${move})`,
  );
}
console.log(`${rowFails === 0 ? 'PASS' : 'FAIL'}  Reference values of Section 11.4 (+-1)`);

// Section 8.7 fuel checks.
const shuttle = createShipFromLoadout(data, data.balance.start.loadoutId, 's', 'Shuttle');
const empty = travelStats(shuttle, data);
const range = empty.fuelCapacity / empty.fuelPerJump;
const t = data.balance.travel;
const hfLaden = t.referenceLaneLength * 156 ** t.fuelMassExponent * t.kJump;
const ratio = hfLaden / empty.fuelPerJump;
console.log('\nFuel (Section 8.7, Q-01):');
console.log(`${range >= 4 && range <= 6 ? 'PASS' : 'FAIL'}  Starting ship range: ${range.toFixed(2)} jumps on a full tank, empty (need 4-6)`);
console.log(
  `${ratio >= 2.8 && ratio <= 3.2 ? 'PASS' : 'FAIL'}  Fuel per jump: empty Shuttle ${empty.fuelPerJump.toFixed(2)}, laden Heavy Freighter (156 t) ${hfLaden.toFixed(2)}, ratio ${ratio.toFixed(2)} (about 3)`,
);

// Section 10.5 reference values (M5-TOOL-01, ±10%) and Section 10.6 template TU.
console.log('');
console.log('Threat units (Section 10.5; Raider = 10 TU):');
const TU_REF: Record<string, number> = {
  start_shuttle: 9,
  pirate_raider: 10,
  light_freighter_trader: 13,
  heavy_freighter_trader: 28,
  pirate_gunship: 37,
  patrol_cutter: 38,
  pirate_corvette: 57,
  pirate_frigate: 76,
  battleship: 154,
};
let tuFails = 0;
for (const [id, ref] of Object.entries(TU_REF)) {
  const ship = createShipFromLoadout(data, id, 'r', id);
  const tu = loadoutTu(id, data);
  const ok = Math.abs(tu / ref - 1) <= 0.1;
  if (!ok) tuFails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id.padEnd(24)} TU ${tu.toFixed(1).padStart(6)} (ref ${ref})  durability ${durability(ship, data)}  firepower ${firepower(ship, data).toFixed(1)}`);
}
console.log(`${tuFails === 0 ? 'PASS' : 'FAIL'}  TU reference values (Section 10.9, ±10%)`);
console.log('');
console.log('Hulls (TU of the default loadout):');
for (const h of data.hulls) console.log(`  ${h.id.padEnd(18)} ${h.defaultLoadout.padEnd(24)} TU ${loadoutTu(h.defaultLoadout, data).toFixed(1)}`);
console.log('');
console.log('Templates (Section 10.6, TU calculated):');
const TEMPLATE_REF: Record<string, number> = { lone_raider: 10, raider_pair: 23, gunship: 37, raider_pack: 39, gunship_escort: 74, frigate: 76, corvette_pack: 100, frigate_group: 194, battle_group: 298 };
for (const t of data.templates.pirate) {
  const tu = templateTu(t, data);
  const ref = TEMPLATE_REF[t.id];
  console.log(`  pirate  ${t.name.padEnd(20)} TU ${tu.toFixed(1).padStart(6)}${ref ? ` (brief ${ref})` : ''}  ${t.ships.join(', ')}`);
}
for (const t of data.templates.patrol) console.log(`  patrol  ${t.name.padEnd(20)} TU ${templateTu(t, data).toFixed(1).padStart(6)}  ${t.ships.join(', ')}`);
