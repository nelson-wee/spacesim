// Threat budget and template selection (Sections 10.5, 10.6, 10.8, Q-04, Q-18).
// The world sets enemy strength: sector security and development level give
// the budget. The player's ship does not change it (M5-THREAT-04).
import type { Rng } from '../core/rng';
import type { Sector } from '../core/types';

/** What the budget needs from a sector (a battle keeps only this, Section 13.5). */
export type SectorLike = Pick<Sector, 'securityValue' | 'development'>;
import type { GameData } from '../data';
import type { TemplateDef } from '../data/schemas';
import { groupTu, loadoutTu } from '../ship/threat';
import { securityLevel } from '../world/security';

export function sectorLevel(sector: SectorLike, data: GameData): number {
  return securityLevel(sector.securityValue, data);
}

/** securityBase[level] x devMult[development] (the budget without the random factor). */
export function budgetMid(sector: SectorLike, data: GameData): number {
  const b = data.security.pirateBudget;
  return (b.securityBase[sectorLevel(sector, data)] ?? 0) * b.devMult[sector.development];
}

/** The budget range: mid x random limits, each at least the minimum. */
export function budgetRange(sector: SectorLike, data: GameData): [number, number] {
  const b = data.security.pirateBudget;
  const mid = budgetMid(sector, data);
  return [Math.max(b.min, mid * b.random[0]), Math.max(b.min, mid * b.random[1])];
}

export function pirateBudget(sector: SectorLike, rng: Rng, data: GameData): number {
  const b = data.security.pirateBudget;
  return Math.max(b.min, budgetMid(sector, data) * rng.range(b.random[0], b.random[1]));
}

export function patrolBudget(sector: SectorLike, rng: Rng, data: GameData): number {
  const p = data.security.patrolBudget;
  return (p.base[sectorLevel(sector, data)] ?? 0) * rng.range(p.random[0], p.random[1]);
}

/** Threat band 1 to 5 of a TU value (Q-18 limits). */
export function bandOf(tu: number, data: GameData): number {
  const limits = data.security.threatBand.limits;
  const i = limits.findIndex((l) => tu <= l);
  return i < 0 ? limits.length + 1 : i + 1;
}

/** Threat band 1 to 5 from the budget midpoint (Q-18). */
export function threatBand(sector: SectorLike, data: GameData): number {
  return bandOf(budgetMid(sector, data), data);
}

const tuCache = new WeakMap<GameData, Map<string, number>>();

/** Group TU of a template (calculated from its ships, not typed). */
export function templateTu(t: Pick<TemplateDef, 'ships'>, data: GameData): number {
  let cache = tuCache.get(data);
  if (!cache) {
    cache = new Map();
    tuCache.set(data, cache);
  }
  const key = t.ships.join(',');
  let tu = cache.get(key);
  if (tu === undefined) {
    tu = groupTu(
      t.ships.map((id) => loadoutTu(id, data)),
      data,
    );
    cache.set(key, tu);
  }
  return tu;
}

/** Pirate templates allowed in a sector (placement rules; named-only templates are not for normal encounters). */
export function allowedPirateTemplates(sector: SectorLike, data: GameData): TemplateDef[] {
  const level = sectorLevel(sector, data);
  return data.templates.pirate.filter(
    (t) =>
      !t.namedOnly &&
      (t.maxSecurity === undefined || level <= t.maxSecurity) &&
      !(t.notCore && sector.development === 'core') &&
      (t.development === undefined || t.development.includes(sector.development)),
  );
}

/**
 * Section 10.6 selection: templates with TU <= budget; of those, keep TU >=
 * 0.5 x budget, or if none, the most expensive one; select at random with
 * weight = TU. Returns null if no template fits the budget.
 */
export function selectTemplate(templates: TemplateDef[], budget: number, rng: Rng, data: GameData): TemplateDef | null {
  const fit = templates.filter((t) => templateTu(t, data) <= budget + 1e-9);
  if (fit.length === 0) return null;
  let pool = fit.filter((t) => templateTu(t, data) >= 0.5 * budget - 1e-9);
  if (pool.length === 0) {
    const best = fit.reduce((a, b) => (templateTu(b, data) > templateTu(a, data) ? b : a));
    pool = [best];
  }
  return rng.weighted(pool, (t) => templateTu(t, data));
}

/** A pirate group for a sector: the budget, then a template (Lone Raider if nothing fits). */
export function pirateGroup(sector: SectorLike, rng: Rng, data: GameData): { budget: number; template: TemplateDef } {
  const budget = pirateBudget(sector, rng, data);
  const allowed = allowedPirateTemplates(sector, data);
  const template = selectTemplate(allowed, budget, rng, data) ?? (allowed[0] as TemplateDef);
  return { budget, template };
}

/** A patrol group (Q-04 interim: the pirate selection rule on the patrol budget). Null in Lawless sectors. */
export function patrolGroup(sector: SectorLike, rng: Rng, data: GameData): { budget: number; template: TemplateDef } | null {
  const budget = patrolBudget(sector, rng, data);
  if (budget <= 0) return null;
  const template = selectTemplate(data.templates.patrol, budget, rng, data) ?? data.templates.patrol[0];
  return template ? { budget, template } : null;
}
