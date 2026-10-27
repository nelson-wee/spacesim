// The core-frontier price gradient (Section 9.13, Section 6.10; Q-34).
import type { GameData } from '../data';

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export interface GradientResult {
  /** Median price factor (price / base) of all raw-goods samples. */
  rawCore: number;
  rawFrontier: number;
  /** Median over advanced commodities of (Core median / Frontier median); null if none is in both. */
  advancedRatio: number | null;
  /** Advanced commodities that both Core and Frontier markets trade. */
  advancedCompared: string[];
  pass: boolean;
  problems: string[];
}

/**
 * Raw goods: the median price factor in Core is higher than in Frontier.
 * Advanced goods (Q-34): for each advanced commodity that Core and Frontier
 * markets both trade, divide the Core median by the Frontier median; the
 * median of these ratios is below 1. `samples` holds price factors keyed
 * `${commodity}:${development}`.
 */
export function priceGradient(samples: Map<string, number[]>, data: GameData): GradientResult {
  const raw = (dev: string) =>
    median(data.commodities.filter((c) => c.tier === 'raw').flatMap((c) => samples.get(`${c.id}:${dev}`) ?? []));
  const rawCore = raw('core');
  const rawFrontier = raw('frontier');
  const ratios: number[] = [];
  const advancedCompared: string[] = [];
  for (const c of data.commodities.filter((x) => x.tier === 'advanced')) {
    const core = samples.get(`${c.id}:core`) ?? [];
    const frontier = samples.get(`${c.id}:frontier`) ?? [];
    if (core.length === 0 || frontier.length === 0) continue;
    advancedCompared.push(c.id);
    ratios.push(median(core) / median(frontier));
  }
  const advancedRatio = ratios.length > 0 ? median(ratios) : null;
  const problems: string[] = [];
  if (!(rawCore > rawFrontier)) problems.push(`raw core ${rawCore.toFixed(2)} <= frontier ${rawFrontier.toFixed(2)}`);
  if (advancedRatio !== null && !(advancedRatio < 1)) {
    problems.push(`advanced core/frontier ${advancedRatio.toFixed(2)} >= 1 (${advancedCompared.join(', ')})`);
  }
  return { rawCore, rawFrontier, advancedRatio, advancedCompared, pass: problems.length === 0, problems };
}
