// Installed machinery: capital (Section 9.5).
import type { Location } from '../core/types';
import type { GameData, Recipe } from '../data';
import { basePrice, midPrice } from './prices';

export function nominalBatches(loc: Location, recipe: Recipe): number {
  return recipe.batchesPerSize * loc.size;
}

/** K_ref = machineryPerBatch x batches. */
export function kRef(loc: Location, recipe: Recipe): number {
  return recipe.machineryPerBatch * nominalBatches(loc, recipe);
}

/** 0.6 + 0.6 x K / (K + K_ref): 60% at K = 0, 90% at K = K_ref, up to 120%. */
export function capitalFactor(k: number, kReference: number): number {
  if (kReference <= 0) return 1.2;
  return 0.6 + (0.6 * k) / (k + kReference);
}

/** Local mid price of a commodity at a location; base price if the location does not trade it. */
function localPrice(loc: Location, commodity: string, data: GameData): number {
  const base = basePrice(data, commodity);
  const entry = loc.market[commodity];
  return entry ? midPrice(entry, base, data) : base;
}

/** Value added of one batch at local prices: outputs minus hard inputs. */
export function valueAdded(loc: Location, recipe: Recipe, data: GameData): number {
  let value = 0;
  for (const o of recipe.outputs) value += o.qty * localPrice(loc, o.commodity, data);
  for (const i of recipe.inputs) value -= i.qty * localPrice(loc, i.commodity, data);
  return value;
}

/**
 * Target installed machinery K* (DECISIONS.md, M2: replaces "until K = 1.5 x K_ref").
 * One more unit of K adds batches x valueAdded x 0.6 x K_ref / (K + K_ref)^2 a day
 * and costs machineryPrice x (wear + requiredReturn) a day. K* is the K where the
 * two are equal. Dear Machinery or cheap outputs give a lower K*; valuable
 * outputs give a higher one. There is no upper limit: diminishing returns limit K.
 */
export function capitalTarget(loc: Location, recipe: Recipe, data: GameData): number {
  const c = data.recipes.capital;
  const ref = kRef(loc, recipe);
  const value = valueAdded(loc, recipe, data);
  const machinery = localPrice(loc, recipe.softInput, data);
  if (ref <= 0 || value <= 0 || machinery <= 0) return 0;
  const k = Math.sqrt((0.6 * nominalBatches(loc, recipe) * value * ref) / (machinery * (c.machineryWear + c.requiredReturn))) - ref;
  return Math.max(0, k);
}

/** Machinery that the producer wants to install today (before stock limits): toward K*, at most the install rate. */
export function installWant(loc: Location, recipe: Recipe, data: GameData): number {
  const c = data.recipes.capital;
  const ref = kRef(loc, recipe);
  return Math.min(c.installRatePerDay * ref, Math.max(0, capitalTarget(loc, recipe, data) - loc.installedMachinery));
}

/**
 * Moves Machinery from the market stock into K (up to the daily install rate
 * and K*), then applies wear. Returns the units installed.
 */
export function installAndWear(loc: Location, recipe: Recipe, data: GameData): number {
  const entry = loc.market.machinery;
  const install = Math.min(installWant(loc, recipe, data), entry ? Math.max(0, entry.stock) : 0);
  if (entry) entry.stock -= install;
  loc.installedMachinery += install;
  loc.installedMachinery *= 1 - data.recipes.capital.machineryWear;
  return install;
}
