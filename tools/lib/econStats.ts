// Statistics of a headless economy run, for the checks of Section 9.13.
import type { Location, World } from '../../src/core/types';
import type { GameData } from '../../src/data';
import { basePrice, buyPrice, midPrice, rawPriceFactor, sellPrice } from '../../src/econ/prices';
import type { DayReport } from '../../src/econ/report';
import { sectorJumps } from '../../src/world/assign';

export { median } from '../../src/econ/gradient';

/** Best route margin (sellPrice_B - buyPrice_A) / buyPrice_A between sectors minJumps..maxJumps apart. */
export function bestMargin(
  world: World,
  data: GameData,
  jumps: number[][],
  commodity: string,
  minJumps: number,
  maxJumps: number,
  inBand?: [number, number],
): number {
  const base = basePrice(data, commodity);
  const traders = world.locations.filter((l) => l.market[commodity]);
  let best = -Infinity;
  for (const a of traders) {
    const ea = a.market[commodity];
    if (!ea) continue;
    const buy = buyPrice(ea, base, data);
    for (const b of traders) {
      const d = jumps[a.sectorId]?.[b.sectorId] ?? Infinity;
      if (d < minJumps || d > maxJumps) continue;
      const eb = b.market[commodity];
      if (!eb) continue;
      const margin = (sellPrice(eb, base, data) - buy) / buy;
      if (inBand) {
        if (margin >= inBand[0] && margin <= inBand[1]) return margin;
      } else if (margin > best) best = margin;
    }
  }
  return inBand ? NaN : best;
}

export class EconStats {
  days = 0;
  readonly jumps: number[][];
  /** Per commodity: market-days at the price clamp, and all market-days. */
  readonly clampDays = new Map<string, number>();
  readonly clampLow = new Map<string, number>();
  readonly marketDays = new Map<string, number>();
  negativeStock = 0;
  /** Longest low-output run of each producer. */
  readonly lowStreak = new Map<number, number>();
  readonly longestLow = new Map<number, number>();
  /** price / base samples: key `${commodity}:${development}` (gradient check, Q-34). */
  readonly factors = new Map<string, number[]>();
  /** Price samples per commodity and development level. */
  readonly prices = new Map<string, number[]>();
  /** Days with a route of 1-3 jumps and margin >= 25%, per commodity. */
  readonly routeDays = new Map<string, number>();
  /** Days with a raw-goods route of 1-2 jumps and margin in 40%-80%. */
  readonly rawBandDays = new Map<string, number>();

  constructor(
    readonly world: World,
    readonly data: GameData,
    readonly warmup: number,
  ) {
    this.jumps = sectorJumps(world);
  }

  record(_report?: DayReport): void {
    const { world, data } = this;
    const g = data.balance.generator;
    const e = data.balance.economy;
    this.days++;
    for (const loc of world.locations) {
      if (loc.producer) {
        const low = (loc.production?.outputRatio ?? 0) < g.lowOutputShare;
        const n = low ? (this.lowStreak.get(loc.id) ?? 0) + 1 : 0;
        this.lowStreak.set(loc.id, n);
        this.longestLow.set(loc.id, Math.max(this.longestLow.get(loc.id) ?? 0, n));
      }
      const dev = world.sectors[loc.sectorId]?.development ?? 'core';
      for (const [c, entry] of Object.entries(loc.market)) {
        if (entry.stock < 0) this.negativeStock++;
        if (this.days <= this.warmup) continue;
        const raw = rawPriceFactor(entry.target, entry.stock, data);
        this.marketDays.set(c, (this.marketDays.get(c) ?? 0) + 1);
        if (raw >= e.priceClampMax || raw <= e.priceClampMin) this.clampDays.set(c, (this.clampDays.get(c) ?? 0) + 1);
        if (raw <= e.priceClampMin) this.clampLow.set(c, (this.clampLow.get(c) ?? 0) + 1);
        const base = basePrice(data, c);
        const price = midPrice(entry, base, data);
        push(this.factors, `${c}:${dev}`, price / base);
        // Every 5th day is enough for the price report.
        if (this.days % 5 === 0) push(this.prices, `${c}:${dev}`, price);
      }
    }
    if (this.days <= this.warmup) return;
    for (const c of data.commodities) {
      if (bestMargin(world, data, this.jumps, c.id, 1, 3) >= 0.25) inc(this.routeDays, c.id);
      if (c.tier === 'raw' && !Number.isNaN(bestMargin(world, data, this.jumps, c.id, 1, 2, [0.4, 0.8]))) inc(this.rawBandDays, c.id);
    }
  }

  get measuredDays(): number {
    return Math.max(0, this.days - this.warmup);
  }

  producerName(id: number): string {
    const l = this.world.locations[id] as Location;
    return `${l.name} (${l.producer})`;
  }
}

function push(map: Map<string, number[]>, key: string, value: number): void {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  list.push(value);
}

function inc(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}
