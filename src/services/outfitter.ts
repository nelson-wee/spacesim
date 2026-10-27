// Outfitter (Sections 7.3, 7.4, 11.1, Q-13). Buys, sells, and installs modules
// on one selected ship. Tiers up to the tech level are for sale (Pirate Havens:
// tiers 1 to 3 at 130%). A removed module is sold at 60% (no module storage).
// While credits are below 0, the actor cannot buy modules (Section 8.6).
import type { Game } from '../core/game';
import type { Actor, InstalledModule, Location, Ship } from '../core/types';
import type { GameData, SlotSize, Tier } from '../data';
import { moduleDef, moduleValues } from '../ship/modules';
import { fitProblem, type SlotKind } from '../ship/rules';
import { cargoMass, travelStats } from '../ship/stats';
import { DEBT_TEXT, done, inDebt, maxSaleTier, refused, salePriceMult, type ServiceResult, serviceProblem } from './common';

export interface ModuleOffer {
  moduleId: string;
  size: SlotSize;
  tier: Tier;
  price: number;
}

const TIERS: Tier[] = [1, 2, 3];
const SIZES: SlotSize[] = ['S', 'M', 'L'];

/** Modules for sale at a location, in data order, then size, then tier. */
export function moduleOffers(location: Location, data: GameData): ModuleOffer[] {
  const maxTier = maxSaleTier(location, data);
  const mult = salePriceMult(location, data);
  const offers: ModuleOffer[] = [];
  for (const def of data.modules.modules) {
    for (const size of SIZES) {
      if (!def.sizes[size]) continue;
      for (const tier of TIERS) {
        if (tier > maxTier) continue;
        offers.push({ moduleId: def.id, size, tier, price: moduleValues(data, { moduleId: def.id, size, tier, on: true }).price * mult });
      }
    }
  }
  return offers;
}

/** The Outfitter pays this share of the module price (Q-13). */
export function moduleSellValue(m: InstalledModule, data: GameData): number {
  return moduleValues(data, m).price * data.serviceRules.moduleSellShare;
}

function slots(ship: Ship, kind: SlotKind): (InstalledModule | null)[] {
  return kind === 'hardpoint' ? ship.hardpoints : ship.internal;
}

export interface OutfitResult extends ServiceResult {
  credits: number;
}

/** Buys a module and installs it in an empty slot of one ship. */
export function buyModule(
  game: Game,
  actor: Actor,
  location: Location,
  shipIndex: number,
  kind: SlotKind,
  slotIndex: number,
  offer: Omit<ModuleOffer, 'price'>,
): OutfitResult {
  const { data } = game;
  const problem = serviceProblem(actor, location, 'outfitter', data);
  if (problem) return { ...refused(problem), credits: 0 };
  if (inDebt(actor)) return { ...refused(DEBT_TEXT), credits: 0 };
  const ship = actor.fleet[shipIndex];
  if (!ship) return { ...refused('There is no such ship.'), credits: 0 };
  const sale = moduleOffers(location, data).find((o) => o.moduleId === offer.moduleId && o.size === offer.size && o.tier === offer.tier);
  if (!sale) return { ...refused(`${location.name} does not sell this module.`), credits: 0 };
  const fit = fitProblem(ship, kind, slotIndex, offer.moduleId, offer.size, data);
  if (fit) return { ...refused(fit), credits: 0 };
  if (actor.credits < sale.price - 1e-9) return { ...refused('You do not have sufficient credits.'), credits: 0 };
  const m: InstalledModule = { moduleId: offer.moduleId, size: offer.size, tier: offer.tier, on: true };
  slots(ship, kind)[slotIndex] = m;
  // New armor plating comes at full HP. A new fuel tank comes empty.
  ship.armorHp += moduleValues(data, m).armorHp ?? 0;
  actor.credits -= sale.price;
  return { ...done(`You install ${moduleName(m, data)} on ${ship.name} for ${Math.round(sale.price)} cr.`), credits: -sale.price };
}

/** Why a module cannot come out, or null. */
export function removeProblem(ship: Ship, kind: SlotKind, slotIndex: number, data: GameData): string | null {
  const m = slots(ship, kind)[slotIndex];
  if (!m) return 'The slot is empty.';
  const lost = moduleValues(data, m).cargoCapacity ?? 0;
  if (lost > 0 && cargoMass(ship, data) > travelStats(ship, data).cargoCapacity - lost + 1e-9) {
    return 'Sell or move cargo first: it does not fit without this module.';
  }
  return null;
}

/** Removes a module and sells it. Fuel and armor HP above the new maximum are lost. */
export function sellModule(game: Game, actor: Actor, location: Location, shipIndex: number, kind: SlotKind, slotIndex: number): OutfitResult {
  const { data } = game;
  const problem = serviceProblem(actor, location, 'outfitter', data);
  if (problem) return { ...refused(problem), credits: 0 };
  const ship = actor.fleet[shipIndex];
  if (!ship) return { ...refused('There is no such ship.'), credits: 0 };
  const why = removeProblem(ship, kind, slotIndex, data);
  if (why) return { ...refused(why), credits: 0 };
  const m = slots(ship, kind)[slotIndex] as InstalledModule;
  const value = moduleSellValue(m, data);
  slots(ship, kind)[slotIndex] = null;
  const s = travelStats(ship, data);
  ship.fuel = Math.min(ship.fuel, s.fuelCapacity);
  ship.armorHp = Math.min(ship.armorHp, s.maxArmorHp);
  actor.credits += value;
  return { ...done(`You sell ${moduleName(m, data)} for ${Math.round(value)} cr.`), credits: value };
}

/** Sets a module ON or OFF for travel (Section 11.5). Engines stay ON for travel. */
export function setModuleOn(ship: Ship, kind: SlotKind, slotIndex: number, on: boolean): boolean {
  const m = slots(ship, kind)[slotIndex];
  if (!m) return false;
  m.on = on;
  return true;
}

export function moduleName(m: Pick<InstalledModule, 'moduleId' | 'size' | 'tier'>, data: GameData): string {
  return `${moduleDef(data, m.moduleId).name} ${m.size}${m.tier > 1 ? ` T${m.tier}` : ''}`;
}
