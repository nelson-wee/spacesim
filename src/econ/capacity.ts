// Production capacity follows the price of the output (owner; DECISIONS.md, M2).
// There is no upper or lower limit. A producer whose output sells above its
// base price grows; one whose output sells below it shrinks. Growth also needs
// the inputs: a producer that is short of inputs does not grow.
import type { Location } from '../core/types';
import type { GameData } from '../data';
import { basePrice, midPrice } from './prices';
import { recipeOf } from './recipes';

/** Output price at the producer's market against base price (outputs weighted by base value). */
export function outputPriceFactor(loc: Location, data: GameData): number {
  const recipe = recipeOf(data, loc.producer as string);
  let local = 0;
  let base = 0;
  for (const o of recipe.outputs) {
    const b = basePrice(data, o.commodity);
    const entry = loc.market[o.commodity];
    local += o.qty * (entry ? midPrice(entry, b, data) : b);
    base += o.qty * b;
  }
  return base > 0 ? local / base : 1;
}

/** Daily change signal: clamp(output price factor - 1, -1, 1). */
export function capacitySignal(loc: Location, data: GameData): number {
  return Math.max(-1, Math.min(1, outputPriceFactor(loc, data) - 1));
}

/**
 * Changes the capacity of each producer by changeRate x signal; growth is also
 * multiplied by the input factor of the last production day. Growth uses at
 * least restartCapacity as its base, so a producer that shrank to almost
 * nothing can grow again when its output becomes dear.
 */
export function updateCapacity(producers: Location[], data: GameData): void {
  const c = data.balance.economy.capacity;
  for (const loc of producers) {
    const signal = capacitySignal(loc, data);
    if (signal > 0) {
      const inputs = loc.production?.inputFactor ?? 1;
      loc.capacity += c.changeRate * signal * inputs * Math.max(loc.capacity, c.restartCapacity);
    } else {
      loc.capacity = Math.max(0, loc.capacity + c.changeRate * signal * loc.capacity);
    }
  }
}
