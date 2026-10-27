// Production capacity follows prices (owner; DECISIONS.md, M2). There is no
// upper or lower limit. Two signals, and the smaller one rules:
// - demand: the output price at the producer against `growthPriceFactor` x base;
// - profit: output value against unit cost (inputs and capital at replacement cost).
// So a producer grows only when its output is dear AND it covers its costs, and
// it shrinks when its output is cheap OR its inputs cost more than its output
// earns. Growth also needs the inputs: a producer short of inputs does not grow.
import type { Location } from '../core/types';
import type { GameData } from '../data';
import { localPricer } from './capital';
import type { InputPricer } from './costs';
import { basePrice, midPrice } from './prices';
import { recipeOf } from './recipes';

function localPrice(loc: Location, commodity: string, data: GameData): number {
  const base = basePrice(data, commodity);
  const entry = loc.market[commodity];
  return entry ? midPrice(entry, base, data) : base;
}

/** Output price at the producer's market against base price (outputs weighted by base value). */
export function outputPriceFactor(loc: Location, data: GameData): number {
  const recipe = recipeOf(data, loc.producer as string);
  let local = 0;
  let base = 0;
  for (const o of recipe.outputs) {
    local += o.qty * localPrice(loc, o.commodity, data);
    base += o.qty * basePrice(data, o.commodity);
  }
  return base > 0 ? local / base : 1;
}

/**
 * Output value of one batch (local prices) against its unit cost, minus 1. Unit cost =
 * hard inputs + machineryPerBatch x machineryPrice x (wear + requiredReturn), with
 * inputs and Machinery at `inputPrice` (the economy uses replacement costs, costs.ts).
 */
export function profitMargin(loc: Location, data: GameData, inputPrice: InputPricer = localPricer(data)): number {
  const recipe = recipeOf(data, loc.producer as string);
  const c = data.recipes.capital;
  let value = 0;
  for (const o of recipe.outputs) value += o.qty * localPrice(loc, o.commodity, data);
  let cost = recipe.machineryPerBatch * inputPrice(loc, recipe.softInput) * (c.machineryWear + c.requiredReturn);
  for (const i of recipe.inputs) cost += i.qty * inputPrice(loc, i.commodity);
  return cost > 0 ? value / cost - 1 : Infinity;
}

/** Daily change signal: clamp(min(demand signal, profit signal), -1, 1). */
export function capacitySignal(loc: Location, data: GameData, inputPrice: InputPricer = localPricer(data)): number {
  const demand = outputPriceFactor(loc, data) / data.balance.economy.capacity.growthPriceFactor - 1;
  return Math.max(-1, Math.min(1, Math.min(demand, profitMargin(loc, data, inputPrice))));
}

/**
 * Changes the capacity of each producer by changeRate x signal; growth is also
 * multiplied by the input factor of the last production day. Growth uses at
 * least restartCapacity as its base, so a producer that shrank to almost
 * nothing can grow again when its output becomes dear.
 */
export function updateCapacity(producers: Location[], data: GameData, inputPrice: InputPricer = localPricer(data)): void {
  const c = data.balance.economy.capacity;
  for (const loc of producers) {
    const signal = capacitySignal(loc, data, inputPrice);
    if (signal > 0) {
      const inputs = loc.production?.inputFactor ?? 1;
      loc.capacity += c.changeRate * signal * inputs * Math.max(loc.capacity, c.restartCapacity);
    } else {
      loc.capacity = Math.max(0, loc.capacity + c.changeRate * signal * loc.capacity);
    }
  }
}
