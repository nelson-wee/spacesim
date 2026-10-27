// Background trade flow (Section 9.7): goods move from low prices to high
// prices between nearby locations, with no NPC agents.
import type { Location } from '../core/types';
import type { EconContext } from './context';
import type { DayReport } from './report';
import { basePrice, midPrice } from './prices';

/** securityFactor = base + perLevel x min(level A, level B): Lawless 0.2, Secure 1.0. */
export function securityFactor(levelA: number, levelB: number, ctx: EconContext): number {
  const e = ctx.data.balance.economy;
  return e.flowSecurityBase + e.flowSecurityPerLevel * Math.min(levelA, levelB);
}

/**
 * One flow from A to B, before the limits for all pairs:
 * min(κ x surplus_A x (price_B - price_A) / price_B x securityFactor, share x deficit_B).
 */
export function pairFlow(
  kappa: number,
  surplusA: number,
  deficitB: number,
  priceA: number,
  priceB: number,
  secFactor: number,
  deficitShare: number,
): number {
  if (priceB <= priceA || surplusA <= 0 || deficitB <= 0) return 0;
  return Math.min(kappa * surplusA * ((priceB - priceA) / priceB) * secFactor, deficitShare * deficitB);
}

/**
 * Runs the flows of one day. All flows use the prices and stocks at the start
 * of the step. The total flow out of a location is at most its surplus; the
 * total flow into a location is at most its deficit.
 */
export function runFlows(ctx: EconContext, sectorLevels: number[], report?: DayReport): void {
  const { world, data } = ctx;
  const e = data.balance.economy;
  for (const c of data.commodities) {
    const pairs = ctx.pairs.get(c.id) ?? [];
    if (pairs.length === 0) continue;
    const base = basePrice(data, c.id);
    const price = new Map<number, number>();
    const surplus = new Map<number, number>();
    const deficit = new Map<number, number>();
    for (const id of ctx.traders.get(c.id) ?? []) {
      const entry = (world.locations[id] as Location).market[c.id];
      if (!entry) continue;
      price.set(id, midPrice(entry, base, data));
      surplus.set(id, Math.max(0, entry.stock - e.surplusShareOfTarget * entry.target));
      deficit.set(id, Math.max(0, entry.target - entry.stock));
    }
    const flows: { from: number; to: number; qty: number }[] = [];
    const outTotal = new Map<number, number>();
    const inTotal = new Map<number, number>();
    for (const p of pairs) {
      const la = world.locations[p.a] as Location;
      const lb = world.locations[p.b] as Location;
      const sec = securityFactor(sectorLevels[la.sectorId] ?? 0, sectorLevels[lb.sectorId] ?? 0, ctx);
      for (const [from, to] of [
        [p.a, p.b],
        [p.b, p.a],
      ] as const) {
        const qty = pairFlow(
          p.kappa,
          surplus.get(from) ?? 0,
          deficit.get(to) ?? 0,
          price.get(from) ?? 0,
          price.get(to) ?? 0,
          sec,
          e.flowDeficitShare,
        );
        if (qty <= 0) continue;
        flows.push({ from, to, qty });
        outTotal.set(from, (outTotal.get(from) ?? 0) + qty);
        inTotal.set(to, (inTotal.get(to) ?? 0) + qty);
      }
    }
    for (const f of flows) {
      const outScale = Math.min(1, (surplus.get(f.from) ?? 0) / (outTotal.get(f.from) ?? 1));
      const inScale = Math.min(1, (deficit.get(f.to) ?? 0) / (inTotal.get(f.to) ?? 1));
      const qty = f.qty * Math.min(outScale, inScale);
      const src = (world.locations[f.from] as Location).market[c.id];
      const dst = (world.locations[f.to] as Location).market[c.id];
      if (!src || !dst || qty <= 0) continue;
      src.stock -= qty;
      dst.stock += qty;
      report?.add(f.from, c.id, 'flowOut', qty);
      report?.add(f.to, c.id, 'flowIn', qty);
    }
  }
}
