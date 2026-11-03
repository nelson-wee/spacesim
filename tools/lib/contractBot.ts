// Supply contracts for the trader bot (M7-TOOL-02, Section 14.9 check 3).
// At a Merchants' Guild, the bot values each Supply offer: buy the units at
// the cheapest known seller, carry them to the destination, and get the
// contract price. It compares that profit per day with the best known
// open-market route of similar length (0.5x to 2x the days), and records the
// ratio. It accepts the best offer when it pays more than that route, then
// buys, carries, and delivers.
import { fleetFreeTonnes, fleetUnits } from '../../src/actor/cargo';
import { upkeepPerDay } from '../../src/actor/fleet';
import { fuelUnitPrice } from '../../src/actor/fuel';
import { priceView } from '../../src/actor/knowledge';
import { type EncounterHandler, estimatePath, followPath, pathBetween } from '../../src/actor/paths';
import { bestRoutes } from '../../src/actor/routes';
import { acceptContract, deliverSupply } from '../../src/career/contracts';
import { lowestLevelOnPath } from '../../src/career/contractGen';
import { econContext } from '../../src/econ/context';
import type { Game } from '../../src/core/game';
import type { Actor, Location, SupplyContract } from '../../src/core/types';
import { basePrice, quoteBuy } from '../../src/econ/prices';
import { buy } from '../../src/services/market';

export interface ContractLog {
  /** Contract profit per day / best open-market profit per day of similar length, for each valued offer. */
  ratios: number[];
  accepted: number;
  delivered: number;
}

export function newContractLog(): ContractLog {
  return { ratios: [], accepted: 0, delivered: 0 };
}

interface SupplyValue {
  source: Location;
  units: number;
  days: number;
  perDay: number;
}

function loc(game: Game, id: number): Location {
  return game.state.world.locations[id] as Location;
}

/** Profit per day of a Supply offer for the fleet now, or null if no known seller or no path. */
export function supplyValue(game: Game, actor: Actor, here: Location, c: SupplyContract): SupplyValue | null {
  const { data, state } = game;
  const dest = loc(game, c.destId);
  const mass = data.commodityById.get(c.commodity)?.massPerUnit ?? 1;
  let best: SupplyValue | null = null;
  for (const l of state.world.locations) {
    if (l.id === dest.id || !l.market[c.commodity]) continue;
    const view = priceView(game, actor, l, c.commodity);
    if (view.source === 'unknown') continue;
    const units = Math.min(c.units - c.delivered, Math.floor(fleetFreeTonnes(actor, data) / mass), Math.floor(actor.credits / Math.max(1, view.buy)));
    if (units <= 0) continue;
    const toSource = l.id === here.id ? null : pathBetween(state.world, data, here, l);
    const trip = pathBetween(state.world, data, l, dest);
    if ((l.id !== here.id && !toSource) || !trip) continue;
    const a = toSource ? estimatePath(toSource, actor.fleet, data) : { days: 0, totalFuel: 0 };
    const b = estimatePath(trip, actor.fleet, data);
    const days = a.days + b.days;
    if (!(days > 0 && days < Infinity)) continue;
    const entry = { ...(l.market[c.commodity] as NonNullable<Location['market'][string]>) };
    const cost = quoteBuy(entry, basePrice(data, c.commodity), units, data).total;
    const fuel = (a.totalFuel + b.totalFuel) * fuelUnitPrice(data, here);
    const perDay = (units * c.price - cost - fuel - upkeepPerDay(actor, data) * days) / days;
    if (!best || perDay > best.perDay) best = { source: l, units, days, perDay };
  }
  return best;
}

/** The best known open-market profit per day for a trip of about `days` (0.5x to 2x). */
function openMarketPerDay(game: Game, actor: Actor, days: number, maxJumps: number): number | null {
  const routes = bestRoutes(game, actor, { maxJumps, limit: 40 }).filter((r) => r.fuelOk && r.days >= 0.5 * days && r.days <= 2 * days);
  return routes.length ? Math.max(...routes.map((r) => r.profitPerDay)) : null;
}

function goTo(game: Game, actor: Actor, from: Location, to: Location, onEncounter?: EncounterHandler): boolean {
  const p = pathBetween(game.state.world, game.data, from, to);
  return p ? followPath(game, actor, p, undefined, onEncounter).result !== 'refused' : false;
}

/** The commodities that the bot keeps for its Supply contract (it must not sell them on the way). */
export function contractGoods(game: Game): Set<string> {
  return new Set(game.state.contracts.active.filter((c): c is SupplyContract => c.kind === 'supply').map((c) => c.commodity));
}

/** One contract step at a docked location. Returns true if the bot acted (and the turn is over). */
export function contractTurn(game: Game, actor: Actor, log: ContractLog, maxJumps: number, onEncounter?: EncounterHandler, minSecurity = 0): boolean {
  const { state } = game;
  const here = loc(game, (actor.position as { locationId: number }).locationId);
  let c = state.contracts.active.find((x): x is SupplyContract => x.kind === 'supply');
  if (c && c.destId === here.id && fleetUnits(actor, c.commodity) > 0) {
    if (deliverSupply(game, c.id).ok) log.delivered++;
    c = state.contracts.active.find((x): x is SupplyContract => x.kind === 'supply');
  }
  if (!c && here.services.includes('merchants_guild')) {
    const board = state.contracts.boards.find((b) => b.locationId === here.id && b.guild === 'merchants');
    let pick: { c: SupplyContract; v: SupplyValue; ratio: number } | null = null;
    for (const o of board?.offers ?? []) {
      if (o.kind !== 'supply') continue;
      const v = supplyValue(game, actor, here, o);
      if (!v || v.perDay <= 0) continue;
      const open = openMarketPerDay(game, actor, v.days, maxJumps);
      if (open === null || open <= 0) continue;
      const ratio = v.perDay / open;
      log.ratios.push(ratio);
      // Accept only an offer that the fleet can finish in one trip before its deadline.
      const ctx = econContext(state.world, game.data);
      const dest = loc(game, o.destId);
      const safe = minSecurity === 0 || (lowestLevelOnPath(ctx, here.sectorId, v.source.sectorId, game.data) >= minSecurity && lowestLevelOnPath(ctx, v.source.sectorId, dest.sectorId, game.data) >= minSecurity);
      const fits = safe && v.units >= o.units - o.delivered && state.day + v.days + 1 <= o.deadline;
      if (fits && ratio > 1 && (!pick || v.perDay > pick.v.perDay)) pick = { c: o, v, ratio };
    }
    if (pick && acceptContract(game, here.id, pick.c.id).ok) {
      log.accepted++;
      c = pick.c;
    }
  }
  if (!c) return false;
  const left = c.units - c.delivered;
  if (fleetUnits(actor, c.commodity) >= left - 1e-6) return goTo(game, actor, here, loc(game, c.destId), onEncounter);
  const v = supplyValue(game, actor, here, c);
  if (!v) return false;
  if (v.source.id === here.id) {
    buy(game, actor, here, c.commodity, Math.min(left - fleetUnits(actor, c.commodity), v.units));
    return goTo(game, actor, here, loc(game, c.destId), onEncounter);
  }
  return goTo(game, actor, here, v.source, onEncounter);
}
