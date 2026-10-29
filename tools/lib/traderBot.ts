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
//    different location, go there first.
// 5. With no route: explore the nearest known location with no prices, or a
//    sector next to a known sector. With nothing to explore: wait 1 day.
import { fleetUnitCost, fleetUnits } from '../../src/actor/cargo';
import { knowsLocation } from '../../src/actor/knowledge';
import { type EncounterHandler, estimatePath, followPath, pathBetween } from '../../src/actor/paths';
import { bestRoutes, type RouteValue } from '../../src/actor/routes';
import { nearestLocation } from '../../src/actor/fuel';
import { actorPlace, travelInSector } from '../../src/actor/travel';
import type { Game } from '../../src/core/game';
import type { Actor, Location } from '../../src/core/types';
import { transitDays, transportCost } from '../../src/econ/carriers';
import { econContext } from '../../src/econ/context';
import { sellPrice } from '../../src/econ/prices';
import { hasService } from '../../src/services/common';
import { buy, sell } from '../../src/services/market';
import { buyModule, moduleOffers } from '../../src/services/outfitter';
import { refuel } from '../../src/services/refuel';
import { buyHull, quoteHull } from '../../src/services/shipyard';
import { wait } from '../../src/services/wait';
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
  for (const c of commodities) {
    const entry = loc.market[c];
    if (!entry) continue;
    const atPlan = bot.plan !== null && bot.plan.toId === loc.id && bot.plan.commodity === c;
    const price = sellPrice(entry, game.data.commodityById.get(c)?.basePrice ?? 0, game.data);
    if (atPlan || price > fleetUnitCost(actor, c)) {
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
function explore(game: Game, actor: Actor, loc: Location): boolean {
  const target = nearest(game, actor, loc, (l) => actor.knowledge.markets[l.id] === undefined);
  if (target) return goTo(game, actor, loc, target);
  const { world } = game.state;
  const { data } = game;
  const jumps = econContext(world, data).sectorJumps[loc.sectorId] ?? [];
  const unknown = world.sectors
    .filter((s) => !actor.knowledge.knownSectors.includes(s.id))
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

/** One bot turn at a docked location. */
export function botTurn(game: Game, bot: BotState, opts: BotOptions): void {
  encounterHandler = opts.onEncounter;
  const actor = game.state.player;
  if (actor.position.kind !== 'docked') {
    // After an encounter battle the bot is in space or at a jump point: dock at the nearest location.
    const place = actorPlace(game, actor);
    const near = nearestLocation(game, place.sectorId, place.point, actor).location;
    const out = travelInSector(game, actor, { kind: 'location', locationId: near.id });
    if ((actor.position as { kind: string }).kind !== 'docked') throw new Error(`The bot cannot dock (${out.result})`);
  }
  const loc = here(game, actor);
  sellCargo(game, actor, loc, bot);
  bot.plan = null;

  if (bot.upgradeDay === null && actor.fleet[0]?.hullId !== opts.targetHull) {
    const cost = upgradeCost(game, actor, loc, opts);
    const empty = actor.fleet.every((ship) => Object.keys(ship.cargo).length === 0);
    if (cost !== null && actor.credits >= cost + opts.reserve && empty) {
      upgrade(game, actor, loc, opts, bot);
    } else if (cost === null) {
      // Can the bot pay at the nearest known Shipyard? Estimate with this location's prices.
      const yard = nearest(game, actor, loc, (l) => hasService(l, 'shipyard') && upgradeCost(game, actor, l, opts) !== null);
      const yardCost = yard ? upgradeCost(game, actor, yard, opts) : null;
      if (yard && yardCost !== null && actor.credits >= yardCost + opts.reserve) {
        refuel(game, actor, loc);
        if (goTo(game, actor, loc, yard)) {
          bot.trips++;
          return;
        }
      }
    }
  }

  firstModule(game, actor, loc, opts, bot);
  refuel(game, actor, loc);
  const route = bestRoutes(game, actor, { maxJumps: opts.maxJumps, limit: 20 })
    .filter((r) => r.fuelOk)
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
  if (explore(game, actor, loc)) return;
  wait(game, actor, loc, 1);
}

/** Credits plus cargo at its purchase price. */
export function netWorth(actor: Actor): number {
  let cargo = 0;
  for (const s of actor.fleet) for (const lot of Object.values(s.cargo)) cargo += lot.units * lot.unitCost;
  return actor.credits + cargo;
}
