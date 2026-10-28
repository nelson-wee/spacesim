// Derived ship stats (Sections 10.5, 11.3 to 11.6). Calculate them again each
// time; do not store them (G-12).
import type { Ship } from '../core/types';
import type { GameData } from '../data';
import { hullDef, maxEngineValue } from './hull';
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
  /** Hull base power + reactors (Section 11.5). */
  powerSupply: number;
  /** Draw of the modules that are ON (engines ON when `allEnginesOn`). */
  powerDraw: number;
  /** Draw if all modules are ON (the Outfitter's "combat power if all ON"). */
  powerDrawAll: number;
  /** Draw of all engines (the required-module rule, Section 11.2). */
  enginePowerDraw: number;
  /** Power as actions (Q-41): draw reserved each turn by modules ON in `reserveCategories` (shields, thrusters, point defense). */
  powerReserve: number;
  /** Power of a turn with a move: the draw of the engines that are ON. */
  powerMove: number;
  /** Power to fire each weapon that is ON one time. */
  powerWeapons: number;
  /** Capacitor capacity (stored power). */
  capacitorCapacity: number;
  /** Hull + Heat Sinks; hull + Radiators; heat per turn of modules ON (Section 11.6). */
  heatCapacity: number;
  cooling: number;
  heatPerTurn: number;
  shieldCapacity: number;
  shieldRegen: number;
  /** Hull armor + Armor Plating armor. */
  armor: number;
  maxHullHp: number;
  maxArmorHp: number;
  maxEngineValue: number;
  /** hullHP + armorPlatingHP + shieldCapacity + 10 x armor, at full repair (Section 10.5). */
  durability: number;
  /** Fuel for one jump on a lane of `travel.referenceLaneLength`, at the current mass. */
  fuelPerJump: number;
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
  let powerSupply = hull.basePower;
  let powerDraw = 0;
  let powerDrawAll = 0;
  let enginePowerDraw = 0;
  let powerReserve = 0;
  let powerMove = 0;
  let powerWeapons = 0;
  let capacitorCapacity = 0;
  const reserveCategories = data.balance.combat.reserveCategories;
  let heatCapacity = hull.heatCapacity;
  let cooling = hull.baseCooling;
  let heatPerTurn = 0;
  let shieldCapacity = 0;
  let shieldRegen = 0;
  let armor = hull.armor;
  let maxArmorHp = 0;
  for (const m of installedModules(ship)) {
    const v = moduleValues(data, m);
    const category = moduleDef(data, m.moduleId).category;
    const on = m.on || (options.allEnginesOn === true && category === 'engine');
    moduleMass += v.mass;
    cargoCapacity += v.cargoCapacity ?? 0;
    fuelCapacity += v.fuelCapacity ?? 0;
    powerSupply += v.powerOutput ?? 0;
    powerDrawAll += v.power ?? 0;
    heatCapacity += v.heatCapacity ?? 0;
    cooling += v.cooling ?? 0;
    armor += v.armor ?? 0;
    maxArmorHp += v.armorHp ?? 0;
    capacitorCapacity += v.capacitorCapacity ?? 0;
    if (on) {
      powerDraw += v.power ?? 0;
      if (reserveCategories.includes(category)) powerReserve += v.power ?? 0;
      else if (category === 'engine') powerMove += v.power ?? 0;
      else if (category === 'laser' || category === 'ballistic' || category === 'guided') powerWeapons += v.power ?? 0;
      heatPerTurn += v.heatPerTurn ?? 0;
      shieldCapacity += v.shieldCapacity ?? 0;
      shieldRegen += v.shieldRegen ?? 0;
    }
    if (category === 'engine') {
      const thrust = v.thrust ?? 0;
      installedThrust += thrust;
      enginePowerDraw += v.power ?? 0;
      fuelRateWeighted += thrust * (v.fuelRate ?? 1);
      if (on) engineThrusts.push(thrust);
    }
    if (category === 'thrusters' && on) thrusterBonus += v.agilityBonus ?? 0;
  }
  // Each extra engine gives falloff^(n-1) of its thrust. The strongest engine counts first.
  const falloff = data.balance.ship.engineStackFalloff;
  const thrust = engineThrusts.sort((a, b) => b - a).reduce((sum, t, i) => sum + t * falloff ** i, 0);
  const cMass = cargoMass(ship, data);
  const mass = hull.mass + moduleMass + cMass;
  const thrusterMult = 1 + thrusterBonus;
  const m = ship.engineValue > 0 ? motion(thrust, mass, thrusterMult, data.balance.ship.mRef) : motion(0, mass, 1, 1);
  const engineFuelRate = installedThrust > 0 ? fuelRateWeighted / installedThrust : 0;
  const t = data.balance.travel;
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
    engineFuelRate,
    thrusterMult,
    powerSupply,
    powerDraw,
    powerDrawAll,
    enginePowerDraw,
    powerReserve,
    powerMove,
    powerWeapons,
    capacitorCapacity,
    heatCapacity,
    cooling,
    heatPerTurn,
    shieldCapacity,
    shieldRegen,
    armor,
    maxHullHp: hull.hp,
    maxArmorHp,
    maxEngineValue: maxEngineValue(hull, data),
    durability: hull.hp + maxArmorHp + shieldCapacity + 10 * armor,
    fuelPerJump: t.referenceLaneLength * mass ** t.fuelMassExponent * t.kJump * engineFuelRate,
  };
}

/** Stats for travel outside combat: all engines ON. */
export function travelStats(ship: Ship, data: GameData): ShipStats {
  return shipStats(ship, data, { allEnginesOn: true });
}
