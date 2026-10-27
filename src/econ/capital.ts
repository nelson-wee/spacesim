// Installed machinery: capital (Section 9.5).
import type { Location } from '../core/types';
import type { GameData, Recipe } from '../data';

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

/** Machinery that the producer wants to install today (before stock limits). */
export function installWant(loc: Location, recipe: Recipe, data: GameData): number {
  const c = data.recipes.capital;
  const ref = kRef(loc, recipe);
  return Math.min(c.installRatePerDay * ref, Math.max(0, c.maxInstallRatio * ref - loc.installedMachinery));
}

/**
 * Moves Machinery from the market stock into K (up to the daily install rate
 * and the maximum K), then applies wear. Returns the units installed.
 */
export function installAndWear(loc: Location, recipe: Recipe, data: GameData): number {
  const entry = loc.market.machinery;
  const install = Math.min(installWant(loc, recipe, data), entry ? Math.max(0, entry.stock) : 0);
  if (entry) entry.stock -= install;
  loc.installedMachinery += install;
  loc.installedMachinery *= 1 - data.recipes.capital.machineryWear;
  return install;
}
