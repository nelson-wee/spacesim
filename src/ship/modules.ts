// Module values with tier multipliers (Section 11.7).
import type { InstalledModule } from '../core/types';
import type { GameData, ModuleDef, ModuleValues } from '../data';

export function moduleDef(data: GameData, moduleId: string): ModuleDef {
  const def = data.moduleById.get(moduleId);
  if (!def) throw new Error(`Unknown module ${moduleId}`);
  return def;
}

/** Values of an installed module after tier multipliers. */
export function moduleValues(data: GameData, m: InstalledModule): ModuleValues {
  const def = moduleDef(data, m.moduleId);
  const base = def.sizes[m.size];
  if (!base) throw new Error(`Module ${m.moduleId} has no size ${m.size}`);
  const t = data.modules.tiers[String(m.tier) as '1' | '2' | '3'];
  const v: ModuleValues = { ...base };
  for (const stat of def.mainStats) {
    const key = stat as keyof ModuleValues;
    const value = v[key];
    if (typeof value === 'number') v[key] = value * t.main;
  }
  if (v.power !== undefined) v.power *= t.power;
  if (v.heatPerTurn !== undefined) v.heatPerTurn *= t.heat;
  if (v.heatPerShot !== undefined) v.heatPerShot *= t.heat;
  v.mass *= t.mass;
  v.price *= t.price;
  if (def.category === 'engine') v.fuelRate = data.modules.engineFuelRateByTier[String(m.tier) as '1' | '2' | '3'];
  return v;
}
