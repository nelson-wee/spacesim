// Production with recipes (Section 9.3).
import type { Location } from '../core/types';
import type { GameData, Recipe } from '../data';
import { capitalFactor, kRef, nominalBatches } from './capital';

export function recipeOf(data: GameData, producer: string): Recipe {
  const r = data.recipeByProducer.get(producer);
  if (!r) throw new Error(`No recipe for producer ${producer}`);
  return r;
}

export interface ProductionResult {
  /** Batches made today. */
  batches: number;
  outputRatio: number;
  inputFactor: number;
  capitalFactor: number;
  /** Inputs that the producer wanted at full input supply (for region demand). */
  inputWant: { commodity: string; qty: number }[];
  inputsUsed: { commodity: string; qty: number }[];
  outputs: { commodity: string; qty: number }[];
}

/**
 * output = batches x inputFactor x capitalFactor x securityMult x eventMult.
 * inputFactor = min over hard inputs of stock / required, at most 1. The
 * required amount is for the batches after capital, security, and events.
 * Changes the market stock of the location.
 */
export function produce(loc: Location, recipe: Recipe, securityMult: number, eventMult: number): ProductionResult {
  const batches = nominalBatches(loc, recipe);
  const cap = capitalFactor(loc.installedMachinery, kRef(loc, recipe));
  const want = batches * cap * securityMult * eventMult;
  let inputFactor = 1;
  for (const input of recipe.inputs) {
    const required = input.qty * want;
    const stock = Math.max(0, loc.market[input.commodity]?.stock ?? 0);
    if (required > 0) inputFactor = Math.min(inputFactor, stock / required);
  }
  if (want <= 0) inputFactor = 0;
  const made = want * inputFactor;
  const inputsUsed = recipe.inputs.map((i) => ({ commodity: i.commodity, qty: i.qty * made }));
  const outputs = recipe.outputs.map((o) => ({ commodity: o.commodity, qty: o.qty * made }));
  for (const u of inputsUsed) {
    const entry = loc.market[u.commodity];
    if (entry) entry.stock = Math.max(0, entry.stock - u.qty);
  }
  for (const o of outputs) {
    const entry = loc.market[o.commodity];
    if (entry) entry.stock += o.qty;
  }
  return {
    batches: made,
    outputRatio: batches > 0 ? made / batches : 0,
    inputFactor,
    capitalFactor: cap,
    inputWant: recipe.inputs.map((i) => ({ commodity: i.commodity, qty: i.qty * want })),
    inputsUsed,
    outputs,
  };
}
