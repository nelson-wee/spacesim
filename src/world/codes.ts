// Technical names (owner, 2026-10-28; DECISIONS.md, M3). A sector has a
// unique 3-letter code ("SEL"). A location's code is the sector code, the
// type code from bodyTypes.json (planets: one capital letter; stations: two
// small letters), and a number by orbit from the star when the sector has
// more than one location of that type: "SEL-O2", "SEL-pr", "SEL-th".
import type { Location, Sector, World } from '../core/types';
import type { GameData } from '../data';

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U', 'Y']);

/** Candidate codes for a name, best first: first 3 letters, then first letter + 2 consonants, then other letters. */
function candidates(name: string): string[] {
  const letters = Array.from(name.toUpperCase()).filter((c) => c >= 'A' && c <= 'Z');
  const first = letters[0] ?? 'X';
  const rest = letters.slice(1);
  const out: string[] = [];
  if (letters.length >= 3) out.push(letters.slice(0, 3).join(''));
  const consonants = rest.filter((c) => !VOWELS.has(c));
  for (let i = 0; i < consonants.length; i++) for (let j = i + 1; j < consonants.length; j++) out.push(first + consonants[i] + consonants[j]);
  for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) out.push(first + rest[i] + rest[j]);
  return out;
}

/** Gives each sector a unique 3-letter code, in sector order. */
export function assignSectorCodes(sectors: Sector[]): void {
  const used = new Set<string>();
  for (const s of sectors) {
    let code = candidates(s.name).find((c) => !used.has(c));
    // Last resort: the first letter and a number.
    for (let n = 1; code === undefined; n++) {
      const c = `${s.name.charAt(0).toUpperCase() || 'X'}${String(n).padStart(2, '0')}`;
      if (!used.has(c)) code = c;
    }
    used.add(code);
    s.code = code;
  }
}

/** Type code of a location from bodyTypes.json. */
export function typeCode(loc: Location, data: GameData): string {
  const t = loc.kind === 'planet' ? data.planetTypeById.get(loc.bodyType) : data.stationTypeById.get(loc.bodyType);
  return t?.code ?? '?';
}

/** Type code and number ("O2", "pr"): the number counts from the star, only for a type with more than one location in the sector. */
export function shortCode(world: World, loc: Location, data: GameData): string {
  const sector = world.sectors[loc.sectorId];
  const same = (sector?.locationIds ?? [])
    .map((id) => world.locations[id] as Location)
    .filter((l) => l.bodyType === loc.bodyType)
    .sort((a, b) => a.ring - b.ring || a.id - b.id);
  const code = typeCode(loc, data);
  return same.length > 1 ? `${code}${same.indexOf(loc) + 1}` : code;
}

/** The technical name of a location: "SEL-O2". */
export function locationCode(world: World, loc: Location, data: GameData): string {
  return `${world.sectors[loc.sectorId]?.code ?? '???'}-${shortCode(world, loc, data)}`;
}
