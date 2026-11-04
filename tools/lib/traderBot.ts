// A greedy trader bot (M3-TOOL-01, M3-TOOL-02). The bot is an Actor (the
// game's player actor). It uses the same services, travel, and information
// rules as the player: it plans with its known prices only.
// Each turn at a docked location:
// 1. Sell the cargo where the plan said, or where the sale makes a profit.
// 2. Buy the target hull when it can pay for the hull, its trader loadout,
//    and keep trade capital. If it can pay but is not at a Shipyard, it goes
//    to the nearest known Shipyard.
// 3. Refuel.
// 4. Take the best known route by profit per day. If the route starts at a
//    different location, go there first. With free cargo space left (a
//    fleet), also load other commodities from here that sell with a profit at
//    the same destination.
// 5. With no route: explore the nearest known location with no prices, or a
//    sector next to a known sector. With nothing to explore: wait 1 day.
import { deliverRelief } from '../../src/career/secondChance';
import type { ReliefContract } from '../../src/core/types';
import { checkLoadout, fitProblem } from '../../src/ship/rules';
import { securityLevel } from '../../src/world/security';
import { fleetUnitCost, fleetUnits } from '../../src/actor/cargo';
import { knowsLocation } from '../../src/actor/knowledge';
import { type EncounterHandler, estimatePath, followPath, pathBetween } from '../../src/actor/paths';
import { bestRoutes, type RouteValue } from '../../src/actor/routes';
import { nearestLocation } from '../../src/actor/fuel';
import { actorPlace, travelInSector, jump } from '../../src/actor/travel';
import type { Game } from '../../src/core/game';
import type { Actor, Location } from '../../src/core/types';
import { transitDays, transportCost } from '../../src/econ/carriers';
import { econContext } from '../../src/econ/context';
import { sellPrice } from '../../src/econ/prices';
import { hasService } from '../../src/services/common';
import { buy, sell, sellEntryOf } from '../../src/services/market';
import { buyModule, moduleOffers, sellModule } from '../../src/services/outfitter';
import { lowestLevelOnPath } from '../../src/career/contractGen';
import { refuel } from '../../src/services/refuel';
import { buyHull, quoteHull } from '../../src/services/shipyard';
import { wait } from '../../src/services/wait';
import { type ContractLog, type ContractPolicy, contractGoods, contractTurn } from './contractBot';
import { mapDistance } from '../../src/world/geometry';

export interface BotOptions {
  /** Hull to buy, and the loadout to fit on it. */
  targetHull: string;
  targetLoadout: string;
  /** Credits to keep for trade after the upgrade. */
  reserve: number;
  maxJumps: number;
  /** Encounters ON (M5-TOOL-04): the policy for each encounter. */
  onEncounter?: EncounterHandler;
  /** Supply contracts ON (M7-TOOL-02): the log of valued and accepted offers. */
  contracts?: ContractLog;
  /** A careful trader: no routes through sectors below this security level (default 0: all routes). */
  minSecurity?: number;
  /** How the bot takes Supply contracts (default 'best'). */
  contractPolicy?: ContractPolicy;
  /** On a contract trip, fill the rest of the hold with trade goods for the same destination. */
  contractFill?: boolean;
}

export interface BotEvent {
  day: number;
  text: string;
}

export interface BotState {
  plan: RouteValue | null;
  upgradeDay: number | null;
  events: BotEvent[];
  trips: number;
}

export function newBotState(): BotState {
  return { plan: null, upgradeDay: null, events: [], trips: 0 };
}

function here(game: Game, actor: Actor): Location {
  if (actor.position.kind !== 'docked') throw new Error('The bot is not docked');
  return game.state.world.locations[actor.position.locationId] as Location;
}

/** Cost of the modules of a loadout at a location (null if the Outfitter does not sell one of them). */
function outfitCost(game: Game, loc: Location, loadoutId: string): number | null {
  const l = game.data.loadoutById.get(loadoutId);
  if (!l || !hasService(loc, 'outfitter')) return null;
  const offers = moduleOffers(loc, game.data);
  let cost = 0;
  for (const slot of [...l.hardpoints, ...l.internal]) {
    if (!slot) continue;
    const o = offers.find((x) => x.moduleId === slot.moduleId && x.size === slot.size && x.tier === slot.tier);
    if (!o) return null;
    cost += o.price;
  }
  return cost;
}

/** Credits needed at a location to buy the target hull and its loadout, after trade-in. */
function upgradeCost(game: Game, actor: Actor, loc: Location, opts: BotOptions): number | null {
  if (!hasService(loc, 'shipyard')) return null;
  const q = quoteHull(actor, 0, loc, opts.targetHull, game.data);
  const outfit = outfitCost(game, loc, opts.targetLoadout);
  if (!q || outfit === null) return null;
  return q.net + outfit;
}

function upgrade(game: Game, actor: Actor, loc: Location, opts: BotOptions, bot: BotState): void {
  const r = buyHull(game, actor, loc, 0, opts.targetHull);
  if (!r.ok) return;
  const l = game.data.loadoutById.get(opts.targetLoadout);
  if (!l) throw new Error(`Unknown loadout ${opts.targetLoadout}`);
  l.hardpoints.forEach((slot, i) => {
    if (slot) buyModule(game, actor, loc, 0, 'hardpoint', i, slot);
  });
  l.internal.forEach((slot, i) => {
    if (slot) buyModule(game, actor, loc, 0, 'internal', i, slot);
  });
  bot.upgradeDay = game.state.day;
  bot.events.push({ day: game.state.day, text: `Upgrade to ${opts.targetHull} at ${loc.name}` });
}

function sellCargo(game: Game, actor: Actor, loc: Location, bot: BotState): void {
  const commodities = new Set(actor.fleet.flatMap((s) => Object.keys(s.cargo)));
  const keep = contractGoods(game);
  for (const c of commodities) {
    if (keep.has(c)) continue;
    const entry = loc.market[c];
    if (!entry) continue;
    const atPlan = bot.plan !== null && bot.plan.toId === loc.id && bot.plan.commodity === c;
    const price = sellPrice(entry, game.data.commodityById.get(c)?.basePrice ?? 0, game.data);
    // Cargo with no plan (for example, goods left after a Supply contract ended) is sold, at a loss if necessary.
    if (atPlan || price > fleetUnitCost(actor, c) || bot.plan === null) {
      const cost = fleetUnits(actor, c) * fleetUnitCost(actor, c);
      const r = sell(game, actor, loc, c, fleetUnits(actor, c));
      if (r.ok) bot.events.push({ day: game.state.day, text: `  sold ${r.units.toFixed(1)} ${c} at ${loc.name}: ${Math.round(r.total)} (paid ${Math.round(cost)}, ${Math.round(r.total - cost)})` });
    }
  }
}

/** The nearest known location that matches, by trip days with the fleet now. */
function nearest(game: Game, actor: Actor, from: Location, match: (l: Location) => boolean): Location | null {
  let best: Location | null = null;
  let bestDays = Infinity;
  for (const l of game.state.world.locations) {
    if (l.id === from.id || !knowsLocation(actor, l) || !match(l)) continue;
    const p = pathBetween(game.state.world, game.data, from, l);
    if (!p) continue;
    const d = estimatePath(p, actor.fleet, game.data).days;
    if (d < bestDays) {
      bestDays = d;
      best = l;
    }
  }
  return best;
}

let encounterHandler: EncounterHandler | undefined;

function goTo(game: Game, actor: Actor, from: Location, to: Location, stopAfterJumpInto?: number): boolean {
  const p = pathBetween(game.state.world, game.data, from, to);
  if (!p) return false;
  const out = followPath(game, actor, p, stopAfterJumpInto, encounterHandler);
  return out.result !== 'refused';
}

/** Explores: a known location with no prices, or a sector next to a known sector. */
function explore(game: Game, actor: Actor, loc: Location, minSecurity = 0): boolean {
  const { world } = game.state;
  const { data } = game;
  const ctx = econContext(world, data);
  const safeTo = (sectorId: number) => minSecurity === 0 || lowestLevelOnPath(ctx, loc.sectorId, sectorId, data) >= minSecurity;
  const target = nearest(game, actor, loc, (l) => actor.knowledge.markets[l.id] === undefined && safeTo(l.sectorId));
  if (target) return goTo(game, actor, loc, target);
  const jumps = ctx.sectorJumps[loc.sectorId] ?? [];
  const unknown = world.sectors
    .filter((s) => !actor.knowledge.knownSectors.includes(s.id) && safeTo(s.id))
    .sort((a, b) => (jumps[a.id] ?? Infinity) - (jumps[b.id] ?? Infinity) || a.id - b.id)[0];
  if (!unknown) return false;
  // Plan on lanes and jump points only: stop after the jump into the new sector.
  const any = world.locations[unknown.locationIds[0] as number] as Location;
  if (!goTo(game, actor, loc, any, unknown.id)) return false;
  if (actor.position.kind === 'docked') return true;
  // Now at a jump point in the new sector, whose locations are now known: dock at the nearest one.
  if (actor.position.kind !== 'jumpPoint') return true;
  const jp = world.jumpPoints[actor.position.jumpPointId];
  if (!jp) return false;
  const aspect = data.balance.world.cellAspect;
  const near = (world.sectors[unknown.id]?.locationIds ?? [])
    .map((id) => world.locations[id] as Location)
    .sort((a, b) => mapDistance(jp.pos, a.pos, aspect) - mapDistance(jp.pos, b.pos, aspect))[0];
  if (!near) return false;
  return travelInSector(game, actor, { kind: 'location', locationId: near.id }).result !== 'refused';
}

/**
 * The first module (Section 11.8): a second engine in the free internal slot
 * of the starting ship, when the bot can pay for it and keep trade capital.
 */
function firstModule(game: Game, actor: Actor, loc: Location, opts: BotOptions, bot: BotState): void {
  const ship = actor.fleet[0];
  if (!ship || ship.hullId === opts.targetHull || !hasService(loc, 'outfitter')) return;
  if (ship.internal.filter((m) => m?.moduleId === 'engine').length >= 2) return;
  const offer = moduleOffers(loc, game.data).find((o) => o.moduleId === 'engine' && o.size === 'S' && o.tier === 1);
  const slot = ship.internal.findIndex((m) => m === null);
  if (!offer || slot < 0 || actor.credits < offer.price + opts.reserve) return;
  const r = buyModule(game, actor, loc, 0, 'internal', slot, offer);
  if (r.ok) bot.events.push({ day: game.state.day, text: `Second engine at ${loc.name}` });
}

/**
 * Profit per day that the bot expects. Background carriers close a gap that
 * is larger than their cost on the route, in about their transit time. So on
 * a long trip, the bot expects the margin to move toward the carrier cost:
 * weight 1 - exp(-trip days / carrier transit days).
 */
function expectedPerDay(game: Game, r: RouteValue): number {
  const ctx = econContext(game.state.world, game.data);
  const mass = game.data.commodityById.get(r.commodity)?.massPerUnit ?? 1;
  const unitBuy = r.units > 0 ? r.buyCost / r.units : 0;
  const carrierGap = r.units * transportCost(mass, r.jumps, unitBuy, ctx);
  const w = 1 - Math.exp(-r.days / transitDays(r.jumps, ctx));
  const profit = r.profit - w * Math.max(0, r.profit - carrierGap);
  return (profit - r.fuelCost) / r.days;
}

/** Loads other commodities for the same destination into the free cargo space, best profit first. */
export function fillHold(game: Game, actor: Actor, loc: Location, main: Pick<RouteValue, 'toId' | 'commodity'>, opts: Pick<BotOptions, 'maxJumps'>, bot: BotState): void {
  // Each commodity one time: the known price of a commodity does not show the bot's own buy.
  const bought = new Set([main.commodity]);
  for (let i = 0; i < 4; i++) {
    const extra = bestRoutes(game, actor, { hereId: loc.id, fromHere: true, maxJumps: opts.maxJumps, limit: 20 })
      .filter((r) => r.toId === main.toId && !bought.has(r.commodity) && r.fuelOk && r.profit - r.fuelCost > 0)
      .sort((a, b) => b.profit - a.profit)[0];
    if (!extra) return;
    bought.add(extra.commodity);
    const r = buy(game, actor, loc, extra.commodity, extra.units);
    if (!r.ok) return;
    bot.events.push({ day: game.state.day, text: `  also ${r.units} ${extra.commodity} (profit ${Math.round(extra.profit)})` });
  }
}

/**
 * With no credits and no cargo, the bot cannot trade (Section 8.6: debt
 * blocks purchases). It sells a weapon or a shield module at an Outfitter to
 * get trade capital again, as a player can.
 */
function sellForCapital(game: Game, actor: Actor, loc: Location, bot: BotState): void {
  if (actor.credits > 300 || actor.fleet.some((s) => Object.keys(s.cargo).length > 0) || !hasService(loc, 'outfitter')) return;
  for (const [i, ship] of actor.fleet.entries()) {
    for (const kind of ['hardpoint', 'internal'] as const) {
      const slots = kind === 'hardpoint' ? ship.hardpoints : ship.internal;
      const idx = slots.findIndex((m) => m !== null && ['laser', 'ballistic', 'guided', 'shield', 'flak', 'pointDefense'].includes(game.data.moduleById.get(m.moduleId)?.category ?? ''));
      if (idx < 0) continue;
      const r = sellModule(game, actor, loc, i, kind, idx);
      if (r.ok) {
        bot.events.push({ day: game.state.day, text: `Sold a module for trade capital at ${loc.name}` });
        return;
      }
    }
  }
  // With no capital and no weapon or shield left: any module that the loadout can do without, except cargo racks (a fuel tank).
  for (const [i, ship] of actor.fleet.entries()) {
    for (const kind of ['hardpoint', 'internal'] as const) {
      const slots = kind === 'hardpoint' ? ship.hardpoints : ship.internal;
      for (let idx = 0; idx < slots.length; idx++) {
        const mod = slots[idx];
        // Not the cargo rack: a trader needs its hold.
        if (!mod || game.data.moduleById.get(mod.moduleId)?.category === 'cargo') continue;
        const copy = structuredClone(ship);
        (kind === 'hardpoint' ? copy.hardpoints : copy.internal)[idx] = null;
        if (checkLoadout(copy, game.data).errors.length > 0) continue;
        if (sellModule(game, actor, loc, i, kind, idx).ok) {
          bot.events.push({ day: game.state.day, text: `Sold a module to pay the debt at ${loc.name}` });
          return;
        }
      }
    }
  }
}

/** A ship with no fuel tank (sold for capital) gets one back when the credits allow: the hull fuel alone is too little for most jumps. */
function refitFuelTank(game: Game, actor: Actor, loc: Location, bot: BotState): void {
  if (!hasService(loc, 'outfitter') || actor.credits < 1500) return;
  const data = game.data;
  for (const [i, ship] of actor.fleet.entries()) {
    if (ship.internal.some((m) => m && data.moduleById.get(m.moduleId)?.category === 'fuel')) continue;
    const offers = moduleOffers(loc, data).filter((o) => o.moduleId === 'fuel_tank' && o.tier === 1).sort((a, b) => b.price - a.price);
    for (const o of offers) {
      const slot = ship.internal.findIndex((m, idx) => m === null && fitProblem(ship, 'internal', idx, o.moduleId, o.size, data) === null);
      if (slot >= 0 && o.price < actor.credits - 500 && buyModule(game, actor, loc, i, 'internal', slot, o).ok) {
        bot.events.push({ day: game.state.day, text: `Bought a fuel tank at ${loc.name}` });
        return;
      }
    }
  }
}

/** One bot turn at a docked location. */
export function botTurn(game: Game, bot: BotState, opts: BotOptions): void {
  encounterHandler = opts.onEncounter;
  const actor = game.state.player;
  if (actor.position.kind !== 'docked') {
    // After an encounter battle the bot is in space or at a jump point: dock at the nearest location.
    const place = actorPlace(game, actor);
    const near = nearestLocation(game, place.sectorId, place.point, actor).location;
    let out = travelInSector(game, actor, { kind: 'location', locationId: near.id });
    // A refusal (notoriety): try the other locations of the sector, then leave by the nearest jump point.
    const sector = game.state.world.sectors[place.sectorId];
    for (const id of sector?.locationIds ?? []) {
      if ((actor.position as { kind: string }).kind === 'docked') break;
      out = travelInSector(game, actor, { kind: 'location', locationId: id });
    }
    if ((actor.position as { kind: string }).kind !== 'docked') {
      for (const jpId of sector?.jumpPointIds ?? []) {
        if (actor.position.kind !== 'jumpPoint') travelInSector(game, actor, { kind: 'jumpPoint', jumpPointId: jpId });
        if (actor.position.kind === 'jumpPoint' && jump(game, actor).result !== 'refused') return;
      }
      throw new Error(`The bot cannot dock or leave the sector (${out.result})`);
    }
  }
  const loc = here(game, actor);
  sellCargo(game, actor, loc, bot);
  bot.plan = null;
  // Guild relief (second chance): deliver it first.
  const relief = game.state.contracts.active.find((c): c is ReliefContract => c.kind === 'relief');
  if (relief) {
    if (relief.destId === loc.id) deliverRelief(game, relief.id);
    else {
      refuel(game, actor, loc);
      if (goTo(game, actor, loc, game.state.world.locations[relief.destId] as Location)) {
        bot.trips++;
        return;
      }
    }
  }
  const fill = opts.contractFill ? (at: Location, main: { toId: number; commodity: string }) => fillHold(game, actor, at, main, opts, bot) : undefined;
  // The upgrade comes before contracts: open Supply contracts (owner, 2026-11-03) do not end
  // on a deadline, so a bot with contracts would otherwise never stop to buy the ship.
  if (bot.upgradeDay === null && actor.fleet[0]?.hullId !== opts.targetHull) {
    const cost = upgradeCost(game, actor, loc, opts);
    const empty = actor.fleet.every((ship) => Object.keys(ship.cargo).length === 0);
    if (cost !== null && actor.credits >= cost + opts.reserve && empty) {
      upgrade(game, actor, loc, opts, bot);
    } else if (cost === null) {
      // Can the bot pay at the nearest known Shipyard? Estimate with this location's prices.
      const yard = nearest(game, actor, loc, (l) => hasService(l, 'shipyard') && upgradeCost(game, actor, l, opts) !== null);
      const yardCost = yard ? upgradeCost(game, actor, yard, opts) : null;
      if (yard && yardCost !== null && actor.credits >= yardCost + opts.reserve && empty) {
        refuel(game, actor, loc);
        if (goTo(game, actor, loc, yard)) {
          bot.trips++;
          return;
        }
      }
    }
  }

  if (opts.contracts && contractTurn(game, actor, opts.contracts, opts.maxJumps, opts.onEncounter, opts.minSecurity, opts.contractPolicy, fill)) {
    // The trip can end in space after an encounter; the next turn docks first.
    if (actor.position.kind === 'docked') refuel(game, actor, here(game, actor));
    bot.trips++;
    return;
  }

  firstModule(game, actor, loc, opts, bot);
  refitFuelTank(game, actor, loc, bot);
  sellForCapital(game, actor, loc, bot);
  refuel(game, actor, loc);
  const ctx = econContext(game.state.world, game.data);
  // In a sector below the bot's minimum (after a tow), any route out is accepted: the bot must leave.
  const hereLevel = securityLevel(game.state.world.sectors[loc.sectorId]?.securityValue ?? 0, game.data);
  const minSecurity = opts.minSecurity && hereLevel >= opts.minSecurity ? opts.minSecurity : 0;
  const safe = (r: RouteValue) => {
    if (!minSecurity) return true;
    const from = game.state.world.locations[r.fromId] as Location;
    const to = game.state.world.locations[r.toId] as Location;
    return lowestLevelOnPath(ctx, loc.sectorId, from.sectorId, game.data) >= minSecurity && lowestLevelOnPath(ctx, from.sectorId, to.sectorId, game.data) >= minSecurity;
  };
  const route = bestRoutes(game, actor, { maxJumps: opts.maxJumps, limit: 20 })
    .filter((r) => r.fuelOk && safe(r))
    .map((r) => ({ r, score: expectedPerDay(game, r) }))
    .sort((a, b) => b.score - a.score)[0]?.r;
  if (route) {
    if (route.fromId === loc.id) {
      const r = buy(game, actor, loc, route.commodity, route.units);
      if (r.ok) {
        bot.plan = route;
        const to = game.state.world.locations[route.toId] as Location;
        bot.events.push({
          day: game.state.day,
          text: `${route.units} ${route.commodity} ${loc.name} -> ${to.name} (${route.jumps} j): buy ${Math.round(route.buyCost)}, profit ${Math.round(route.profit)}, fuel ${Math.round(route.fuelCost)}, ${route.days.toFixed(2)} d, ${Math.round(route.profitPerDay)}/d, ${route.limitedBy}`,
        });
        fillHold(game, actor, loc, route, opts, bot);
        bot.trips++;
        goTo(game, actor, loc, game.state.world.locations[route.toId] as Location);
        return;
      }
    } else {
      bot.trips++;
      goTo(game, actor, loc, game.state.world.locations[route.fromId] as Location);
      return;
    }
  }
  // Cargo that this location does not buy (left from a trip that an encounter cut short): take it to the nearest buyer.
  const held = Object.keys(Object.assign({}, ...actor.fleet.map((sh) => sh.cargo)));
  const stuck = held.find((c) => !sellEntryOf(loc, c, game.data));
  if (stuck) {
    const safeTo = (l: Location) => !minSecurity || lowestLevelOnPath(ctx, loc.sectorId, l.sectorId, game.data) >= minSecurity;
    const buyer = nearest(game, actor, loc, (l) => sellEntryOf(l, stuck, game.data) !== undefined && safeTo(l));
    if (buyer && goTo(game, actor, loc, buyer)) {
      bot.trips++;
      return;
    }
  }
  if (explore(game, actor, loc, minSecurity)) return;
  wait(game, actor, loc, 1);
}

/** Credits plus cargo at its purchase price. */
export function netWorth(actor: Actor): number {
  let cargo = 0;
  for (const s of actor.fleet) for (const lot of Object.values(s.cargo)) cargo += lot.units * lot.unitCost;
  return actor.credits + cargo;
}
