// What a board shows for each offer (Section 14.8): type, reason, route with
// jumps, lowest security level and threat band on the route, tonnes, reward,
// deadline, and an estimate of profit per day for the current fleet. Headless.
import { priceView } from '../actor/knowledge';
import { estimatePath, pathBetween } from '../actor/paths';
import type { Game } from '../core/game';
import type { Contract, Location } from '../core/types';
import { threatBand } from '../encounter/budget';
import { econContext } from '../econ/context';
import { securityLevel } from '../world/security';
import { supplyRoom } from './contractGen';
import { travelStats } from '../ship/stats';

export interface OfferView {
  type: string;
  route: string;
  jumps: number;
  lowestLevel: number;
  band: number;
  /** Supply: the tonnes the destination needs now. */
  tonnes: number;
  /** Supply: the pay for one hold (the need, as far as the fleet carries it). */
  reward: number;
  /** Last day (game day number shown to the player), or null (a Supply offer: maxDays from acceptance). */
  deadline: number | null;
  /** Estimated profit per day for the current fleet, or null if it cannot be estimated. */
  perDay: number | null;
}

const TYPE: Record<Contract['kind'], string> = { supply: 'Supply', freight: 'Freight', sweep: 'Sweep', named: 'Named bounty' };

function locOf(game: Game, id: number): Location {
  return game.state.world.locations[id] as Location;
}

/** Trip days for the fleet between two locations (Infinity with no path). */
function tripDays(game: Game, from: Location, to: Location): number {
  if (from.id === to.id) return 0;
  const p = pathBetween(game.state.world, game.data, from, to);
  return p ? estimatePath(p, game.state.player.fleet, game.data).days : Infinity;
}

/** The known seller with the lowest buy price of a commodity, and that price. */
function bestKnownSource(game: Game, commodity: string): { loc: Location; buy: number } | null {
  let best: { loc: Location; buy: number } | null = null;
  for (const l of game.state.world.locations) {
    const v = priceView(game, game.state.player, l, commodity);
    if (v.source === 'unknown' || !l.market[commodity]) continue;
    if (best === null || v.buy < best.buy) best = { loc: l, buy: v.buy };
  }
  return best;
}

export function offerView(game: Game, offer: Contract): OfferView {
  const { state, data } = game;
  const ctx = econContext(state.world, data);
  const here = state.player.position.kind === 'docked' ? locOf(game, state.player.position.locationId) : locOf(game, offer.boardId);
  const sectors = (ids: number[]) => ids.map((id) => state.world.sectors[id]).filter((s) => s !== undefined);
  const routeInfo = (stops: Location[]) => {
    let jumps = 0;
    const path: number[] = [stops[0]?.sectorId ?? here.sectorId];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1] as Location;
      const b = stops[i] as Location;
      jumps += ctx.sectorJumps[a.sectorId]?.[b.sectorId] ?? 0;
      path.push(...(ctx.sectorPaths[a.sectorId]?.[b.sectorId] ?? [b.sectorId]));
    }
    const list = sectors([...new Set(path)]);
    return {
      jumps,
      lowestLevel: Math.min(...list.map((s) => securityLevel(s.securityValue, data))),
      band: Math.max(...list.map((s) => threatBand(s, data))),
    };
  };
  const mass = (c: string) => data.commodityById.get(c)?.massPerUnit ?? 1;
  if (offer.kind === 'supply') {
    const dest = locOf(game, offer.destId);
    const m = mass(offer.commodity);
    // Open quantity (owner, 2026-11-03): the need now, as far as the fleet can carry it.
    const need = supplyRoom(game, offer);
    const hold = state.player.fleet.reduce((sum, s) => sum + travelStats(s, data).cargoCapacity, 0) / m;
    const units = Math.min(need, hold);
    const reward = units * (offer.price + offer.feePerTonne * m);
    // Buy at the cheapest known seller, then go to the destination.
    const source = bestKnownSource(game, offer.commodity);
    const buy = source?.buy ?? null;
    const days = (source ? tripDays(game, here, source.loc) + tripDays(game, source.loc, dest) : tripDays(game, here, dest)) + 1;
    return {
      type: TYPE.supply,
      route: `${here.name} -> ${dest.name}`,
      ...routeInfo([here, dest]),
      tonnes: need * m,
      reward,
      deadline: offer.acceptedDay === null ? null : offer.acceptedDay + data.contracts.supply.maxDays,
      perDay: buy === null || !Number.isFinite(days) ? null : (reward - units * buy) / days,
    };
  }
  if (offer.kind === 'freight') {
    const a = locOf(game, offer.fromId);
    const b = locOf(game, offer.toId);
    const days = (offer.pickedDay === null ? tripDays(game, here, a) : 0) + tripDays(game, offer.pickedDay === null ? a : here, b) + 1;
    return {
      type: TYPE.freight,
      route: offer.pickedDay === null ? `${a.name} -> ${b.name}` : `${here.name} -> ${b.name}`,
      ...routeInfo(offer.pickedDay === null ? [here, a, b] : [here, b]),
      tonnes: offer.units * mass(offer.commodity),
      reward: offer.fee,
      deadline: offer.deadline,
      perDay: Number.isFinite(days) ? offer.fee / days : null,
    };
  }
  const sector = state.world.sectors[offer.sectorId];
  const target = sector ? locOf(game, sector.locationIds[0] as number) : here;
  const extra = offer.kind === 'sweep' ? offer.ships : 2;
  const days = tripDays(game, here, target) + extra;
  return {
    type: TYPE[offer.kind],
    route: `${here.name} -> ${sector?.name ?? '?'}`,
    ...routeInfo([here, target]),
    tonnes: 0,
    reward: offer.reward,
    deadline: offer.kind === 'sweep' ? offer.deadline : offer.expiry,
    perDay: Number.isFinite(days) && days > 0 ? offer.reward / days : null,
  };
}
