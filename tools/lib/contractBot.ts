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
import { lowestLevelOnPath, supplyRoom } from '../../src/career/contractGen';
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
  /** Completed deliveries (for the chain alert follow-up in sim-contracts). */
  deliveries: { destId: number; commodity: string; day: number; alert: boolean }[];
  /** Alert offers that the bot saw on a board and did not take. */
  unserved: { destId: number; commodity: string; day: number }[];
}

export function newContractLog(): ContractLog {
  return { ratios: [], accepted: 0, delivered: 0, deliveries: [], unserved: [] };
}

/**
 * 'best': accept an offer only if it pays more per day than the best known
 * open-market route of similar length (a greedy trader). 'first': accept any
 * offer that makes a profit, chain alerts first (a guild-minded trader).
 */
export type ContractPolicy = 'best' | 'first';

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
    // Perishable goods: buy a little more; keep 10% of the credits for price moves; no more than the stock there.
    const extra = (data.commodityById.get(c.commodity)?.perishablePerDay ?? 0) > 0 ? 1.05 : 1;
    const stock = Math.floor(l.market[c.commodity]?.stock ?? 0);
    const units = Math.min(Math.floor(supplyRoom(game, c) * extra), Math.floor(fleetFreeTonnes(actor, data) / mass), Math.floor((0.9 * actor.credits) / Math.max(1, view.buy)), stock);
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
    const perDay = (units * (c.price + c.feePerTonne * mass) - cost - fuel - upkeepPerDay(actor, data) * days) / days;
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
  const keep = game.state.contracts.active.filter((c): c is SupplyContract => c.kind === 'supply' && supplyRoom(game, c) > 0).map((c) => c.commodity);
  // Guild relief cargo (second chance) is not for sale.
  for (const c of game.state.contracts.active) if (c.kind === 'relief') keep.push(c.commodity);
  return new Set(keep);
}

/** One contract step at a docked location. Returns true if the bot acted (and the turn is over). */
export function contractTurn(
  game: Game,
  actor: Actor,
  log: ContractLog,
  maxJumps: number,
  onEncounter?: EncounterHandler,
  minSecurity = 0,
  policy: ContractPolicy = 'best',
  fill?: (here: Location, main: { toId: number; commodity: string }) => void,
): boolean {
  const { state } = game;
  const here = loc(game, (actor.position as { locationId: number }).locationId);
  let c = state.contracts.active.find((x): x is SupplyContract => x.kind === 'supply');
  if (c && c.destId === here.id && fleetUnits(actor, c.commodity) > 0) {
    const done = c;
    if (deliverSupply(game, c.id).ok) {
      log.delivered++;
      if (!state.contracts.active.includes(done)) log.deliveries.push({ destId: done.destId, commodity: done.commodity, day: state.day, alert: done.alert });
    }
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
      // Accept an offer worth one trip (open quantity: at least 5 t).
      const ctx = econContext(state.world, game.data);
      const dest = loc(game, o.destId);
      const safe = minSecurity === 0 || (lowestLevelOnPath(ctx, here.sectorId, v.source.sectorId, game.data) >= minSecurity && lowestLevelOnPath(ctx, v.source.sectorId, dest.sectorId, game.data) >= minSecurity);
      const fits = safe && v.units * (game.data.commodityById.get(o.commodity)?.massPerUnit ?? 1) >= 5;
      const wanted = policy === 'first' ? v.perDay > 0 : ratio > 1;
      const better = (x: SupplyContract, xv: SupplyValue) =>
        !pick || (policy === 'first' ? Number(x.alert) - Number(pick.c.alert) || xv.perDay - pick.v.perDay : xv.perDay - pick.v.perDay) > 0;
      if (fits && wanted && better(o, v)) pick = { c: o, v, ratio };
    }
    for (const o of board?.offers ?? []) if (o.kind === 'supply' && o.alert && o !== pick?.c) log.unserved.push({ destId: o.destId, commodity: o.commodity, day: state.day });
    if (pick && acceptContract(game, here.id, pick.c.id).ok) {
      log.accepted++;
      c = pick.c;
    }
  }
  if (!c) return false;
  // Open quantity: carry what the fleet holds to the destination; at the destination with goods left, the need is full for now.
  if (fleetUnits(actor, c.commodity) > 1e-6) return c.destId === here.id ? false : goTo(game, actor, here, loc(game, c.destId), onEncounter);
  const v = supplyValue(game, actor, here, c);
  if (!v) return false;
  if (v.source.id === here.id) {
    buy(game, actor, here, c.commodity, Math.max(0, v.units - fleetUnits(actor, c.commodity)));
    // Fill the rest of the hold with trade goods for the same destination, as a player would.
    if (fill) fill(here, { toId: c.destId, commodity: c.commodity });
    return goTo(game, actor, here, loc(game, c.destId), onEncounter);
  }
  return goTo(game, actor, here, v.source, onEncounter);
}
