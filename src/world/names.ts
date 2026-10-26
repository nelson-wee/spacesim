// Names from syllable tables (Section 6.3, data/names.json).
import type { Rng } from '../core/rng';
import type { GameData } from '../data';

type Table = GameData['names']['sector'];

export function makeName(rng: Rng, table: Table, middleChance: number): string {
  let name = rng.pick(table.start);
  if (rng.chance(middleChance)) name += rng.pick(table.middle);
  name += rng.pick(table.end);
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/** A name that is not in `used`. Adds it to `used`. */
export function makeUniqueName(rng: Rng, data: GameData, kind: 'sector' | 'location', used: Set<string>): string {
  const table = data.names[kind];
  for (let i = 0; i < data.names.nameAttempts; i++) {
    const name = makeName(rng, table, data.names.middleChance);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  // The tables are too small for this world: add a number.
  const base = makeName(rng, table, data.names.middleChance);
  let n = 2;
  while (used.has(`${base} ${n}`)) n++;
  const name = `${base} ${n}`;
  used.add(name);
  return name;
}
