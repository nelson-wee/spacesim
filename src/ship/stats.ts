// Derived ship stats (Sections 11.3 and 11.4). Calculate them again each time;
// do not store them (G-12). M3 adds power, heat, shields, and the other stats.
import type { Ship } from '../core/types';
import type { GameData } from '../data';
import { hullDef } from './hull';
import { installedModules } from './loadout';
import { moduleDef, moduleValues } from './modules';

export interface Motion {
  twr: number;
  speedIdx: number;
  agility: number;
  /** Cells per combat turn. */
  move: number;
  /** 0 to 100. */
  maneuver: number;
}

/** Speed and maneuverability from thrust and mass (Section 11.4, option B). */
export function motion(thrust: number, mass: number, thrusterMult: number, mRef: number): Motion {
  if (thrust <= 0 || mass <= 0) return { twr: 0, speedIdx: 0, agility: 0, move: 0, maneuver: 0 };
  const twr = thrust / mass;
  const speedIdx = twr * (mRef / mass) ** (1 / 6);
  const agility = twr * (mRef / mass) ** (1 / 3) * thrusterMult;
  // The curve is below 7 in theory; floating point can reach 7 at very high speedIdx.
  const move = Math.min(6, Math.floor(1 + 6 * (1 - Math.exp(-speedIdx))));
  const maneuver = (100 * agility * agility) / (agility * agility + 1);
  return { twr, speedIdx, agility, move, maneuver };
}

export interface ShipStats extends Motion {
  hullMass: number;
  moduleMass: number;
  cargoMass: number;
  mass: number;
  cargoCapacity: number;
  fuelCapacity: number;
  /** Thrust of engines that are ON, after engineStackFalloff. */
  thrust: number;
  engineCount: number;
  /** Thrust-weighted average of the installed engines (Section 8.2). */
  engineFuelRate: number;
  thrusterMult: number;
}

export interface StatsOptions {
  /** Outside combat, all engines are ON (Section 11.5). */
  allEnginesOn?: boolean;
}

export function cargoMass(ship: Ship, data: GameData): number {
  let mass = 0;
  for (const [commodityId, lot] of Object.entries(ship.cargo)) {
    const c = data.commodityById.get(commodityId);
    if (!c) throw new Error(`Unknown commodity ${commodityId} in cargo`);
    mass += lot.units * c.massPerUnit;
  }
  return mass;
}

export function shipStats(ship: Ship, data: GameData, options: StatsOptions = {}): ShipStats {
  const hull = hullDef(data, ship.hullId);
  let moduleMass = 0;
  let cargoCapacity = 0;
  let fuelCapacity = 0;
  let thrusterBonus = 0;
  const engineThrusts: number[] = [];
  let fuelRateWeighted = 0;
  let installedThrust = 0;
  for (const m of installedModules(ship)) {
    const v = moduleValues(data, m);
    const category = moduleDef(data, m.moduleId).category;
    moduleMass += v.mass;
    cargoCapacity += v.cargoCapacity ?? 0;
    fuelCapacity += v.fuelCapacity ?? 0;
    if (category === 'engine') {
      const thrust = v.thrust ?? 0;
      installedThrust += thrust;
      fuelRateWeighted += thrust * (v.fuelRate ?? 1);
      if (m.on || options.allEnginesOn) engineThrusts.push(thrust);
    }
    if (category === 'thrusters' && m.on) thrusterBonus += v.agilityBonus ?? 0;
  }
  // Each extra engine gives falloff^(n-1) of its thrust. The strongest engine counts first.
  const falloff = data.balance.ship.engineStackFalloff;
  const thrust = engineThrusts.sort((a, b) => b - a).reduce((sum, t, i) => sum + t * falloff ** i, 0);
  const cMass = cargoMass(ship, data);
  const mass = hull.mass + moduleMass + cMass;
  const thrusterMult = 1 + thrusterBonus;
  const m = ship.engineValue > 0 ? motion(thrust, mass, thrusterMult, data.balance.ship.mRef) : motion(0, mass, 1, 1);
  return {
    ...m,
    hullMass: hull.mass,
    moduleMass,
    cargoMass: cMass,
    mass,
    cargoCapacity,
    fuelCapacity,
    thrust,
    engineCount: engineThrusts.length,
    engineFuelRate: installedThrust > 0 ? fuelRateWeighted / installedThrust : 0,
    thrusterMult,
  };
}

/** Stats for travel outside combat: all engines ON. */
export function travelStats(ship: Ship, data: GameData): ShipStats {
  return shipStats(ship, data, { allEnginesOn: true });
}
