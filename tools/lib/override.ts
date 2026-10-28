// Tuning sweeps: --override='{"balance":{"economy":{"carriers":{"minMargin":0.3}}}}' deep-merges
// into the raw data files before the checks; items in id lists merge by id. For tools only.
import { buildGameData, type GameData, RAW_DATA, type RawData } from '../../src/data';

function merge(target: unknown, patch: unknown): unknown {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return patch;
  // A patch object on an array of items with ids changes items by id: {"hulls":{"hulls":{"wasp":{"basePower":2}}}}.
  if (Array.isArray(target)) {
    return target.map((item: unknown) => {
      const id = (item as { id?: unknown })?.id;
      return typeof id === 'string' && id in patch ? merge(item, (patch as Record<string, unknown>)[id]) : item;
    });
  }
  const out: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) out[k] = merge(out[k], v);
  return out;
}

export function dataWithOverride(argv: string[]): GameData {
  const arg = argv.find((a) => a.startsWith('--override='));
  if (!arg) return buildGameData(RAW_DATA);
  const patch = JSON.parse(arg.slice('--override='.length)) as Partial<Record<keyof RawData, unknown>>;
  return buildGameData(merge(structuredClone(RAW_DATA), patch) as RawData);
}
