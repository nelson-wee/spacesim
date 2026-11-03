// Shipyard (Sections 7.4, 11.1, Q-14). Buys a hull. The old hull is traded
// in at 60% of the hull price and 60% of each module price. The new hull has
// an empty loadout. The trade-in is blocked while the old ship has cargo.
// While credits are below 0, the actor cannot buy hulls (Section 8.6).
// M6 (Section 11.9): a bought hull can also join the fleet with an empty
// loadout, and a non-flagship ship with no cargo sells at its trade-in value.
import type { Game } from '../core/game';
import type { Actor, Location, Ship } from '../core/types';
import { type GameData, type Hull, slotSizes } from '../data';
import { addShip, newShipName, removeShip } from '../actor/fleet';
import { hullDef, maxEngineValue } from '../ship/hull';
import { installedModules } from '../ship/loadout';
import { moduleValues } from '../ship/modules';
import { DEBT_TEXT, done, inDebt, maxSaleTier, refused, salePriceMult, type ServiceResult, serviceProblem } from './common';

export interface HullOffer {
  hullId: string;
  price: number;
}

/** Hulls for sale: player hulls with tech <= the sale tier of the location. */
export function hullOffers(location: Location, data: GameData): HullOffer[] {
  const maxTier = maxSaleTier(location, data);
  const mult = salePriceMult(location, data);
  return data.hulls
    .filter((h) => !h.enemyOnly && h.price !== null && h.tech !== null && h.tech <= maxTier)
    .map((h) => ({ hullId: h.id, price: (h.price as number) * mult }));
}

/** 60% of the hull price and 60% of each module price (Section 11.1). */
export function tradeInValue(ship: Ship, data: GameData): number {
  const share = data.serviceRules.tradeInShare;
  const hull = hullDef(data, ship.hullId).price ?? 0;
  const modules = installedModules(ship).reduce((sum, m) => sum + moduleValues(data, m).price, 0);
  return share * (hull + modules);
}

/** A new hull with an empty loadout, full HP, and no fuel. */
export function emptyShip(hull: Hull, id: string, name: string, data: GameData): Ship {
  return {
    id,
    name,
    hullId: hull.id,
    hardpoints: slotSizes(hull.hardpoints).map(() => null),
    internal: slotSizes(hull.internal).map(() => null),
    cargo: {},
    fuel: 0,
    hullHp: hull.hp,
    armorHp: 0,
    engineValue: maxEngineValue(hull, data),
  };
}

export interface HullQuote {
  price: number;
  tradeIn: number;
  /** Price after trade-in. Below 0 means the actor gets credits. */
  net: number;
}

export function quoteHull(actor: Actor, shipIndex: number, location: Location, hullId: string, data: GameData): HullQuote | null {
  const offer = hullOffers(location, data).find((o) => o.hullId === hullId);
  const ship = actor.fleet[shipIndex];
  if (!offer || !ship) return null;
  const tradeIn = tradeInValue(ship, data);
  return { price: offer.price, tradeIn, net: offer.price - tradeIn };
}

export interface HullResult extends ServiceResult {
  net: number;
}

/** Buys a hull and trades in the ship at `shipIndex` (in M3, the only ship). */
export function buyHull(game: Game, actor: Actor, location: Location, shipIndex: number, hullId: string): HullResult {
  const { data } = game;
  const problem = serviceProblem(actor, location, 'shipyard', data);
  if (problem) return { ...refused(problem), net: 0 };
  if (inDebt(actor)) return { ...refused(DEBT_TEXT), net: 0 };
  const old = actor.fleet[shipIndex];
  if (!old) return { ...refused('There is no such ship.'), net: 0 };
  const q = quoteHull(actor, shipIndex, location, hullId, data);
  if (!q) return { ...refused(`${location.name} does not sell this hull.`), net: 0 };
  if (old.hullId === hullId && installedModules(old).length === 0) return { ...refused('You already have this hull.'), net: 0 };
  if (Object.values(old.cargo).some((lot) => lot.units > 1e-9)) return { ...refused(`Sell the cargo of ${old.name} first.`), net: 0 };
  if (actor.credits < q.net - 1e-9) return { ...refused('You do not have sufficient credits.'), net: 0 };
  const hull = hullDef(data, hullId);
  actor.fleet[shipIndex] = emptyShip(hull, old.id, old.name, data);
  actor.credits -= q.net;
  return {
    ...done(`You trade in ${old.name} for ${Math.round(q.tradeIn)} cr and buy a ${hull.name} for ${Math.round(q.price)} cr. Fit an engine, a reactor if needed, and a fuel tank.`),
    net: q.net,
  };
}

/** Buys a hull that joins the fleet with an empty loadout and no fuel (M6-FLEET-02). */
export function buyShip(game: Game, actor: Actor, location: Location, hullId: string): HullResult {
  const { data } = game;
  const problem = serviceProblem(actor, location, 'shipyard', data);
  if (problem) return { ...refused(problem), net: 0 };
  if (inDebt(actor)) return { ...refused(DEBT_TEXT), net: 0 };
  const offer = hullOffers(location, data).find((o) => o.hullId === hullId);
  if (!offer) return { ...refused(`${location.name} does not sell this hull.`), net: 0 };
  if (actor.credits < offer.price - 1e-9) return { ...refused('You do not have sufficient credits.'), net: 0 };
  if (actor.fleet.length >= data.balance.fleet.maxFleetSize) return { ...refused(`Your fleet is full (${data.balance.fleet.maxFleetSize} ships).`), net: 0 };
  const hull = hullDef(data, hullId);
  const ship = emptyShip(hull, `ship-${game.state.nextId++}`, newShipName(actor, hull.name), data);
  const full = addShip(game, actor, ship);
  if (full) return { ...refused(full), net: 0 };
  actor.credits -= offer.price;
  return {
    ...done(`You buy a ${hull.name} for ${Math.round(offer.price)} cr. ${ship.name} joins the fleet. Fit an engine, a reactor if needed, and a fuel tank.`),
    net: offer.price,
  };
}

/** Sells a non-flagship ship with no cargo at its trade-in value (M6-FLEET-03, Q-14). */
export function sellShip(game: Game, actor: Actor, location: Location, shipIndex: number): HullResult {
  const { data } = game;
  const problem = serviceProblem(actor, location, 'shipyard', data);
  if (problem) return { ...refused(problem), net: 0 };
  const ship = actor.fleet[shipIndex];
  if (!ship) return { ...refused('There is no such ship.'), net: 0 };
  if (shipIndex === actor.flagshipIndex) return { ...refused('You cannot sell the flagship. Select another flagship first.'), net: 0 };
  if (Object.values(ship.cargo).some((lot) => lot.units > 1e-9)) return { ...refused(`Move or sell the cargo of ${ship.name} first.`), net: 0 };
  const value = tradeInValue(ship, data);
  removeShip(game, actor, shipIndex);
  actor.credits += value;
  return { ...done(`You sell ${ship.name} for ${Math.round(value)} cr.`), net: -value };
}
