// Travel in a sector and jumps between sectors (Sections 8.2 to 8.4, 8.6).
import { type Game, passTime } from '../core/game';
import type { Actor, JumpPoint, Lane, Location, Vec } from '../core/types';
import type { GameData } from '../data';
import { checkLoadout } from '../ship/rules';
import { mapDistance } from '../world/geometry';
import { fleetMove, fleetTravelStats } from './fleet';
import { dockFuel, jumpFuel, sectorTripFuel, towFleet } from './fuel';
import { observe } from './knowledge';

export type Destination = { kind: 'location'; locationId: number } | { kind: 'jumpPoint'; jumpPointId: number };

export interface TripPlan {
  kind: 'sector' | 'jump';
  /** False if the fleet cannot start this trip. `reason` says why. */
  possible: boolean;
  reason?: string;
  destinationName: string;
  distance: number;
  days: number;
  /** Fuel that each ship needs, travel plus docking. */
  fuelNeed: number[];
  fuelHave: number[];
  /** True if each ship has sufficient fuel. The UI only warns (Section 8.6). */
  enoughFuel: boolean;
  /** Index of the ship with the lowest range (fuel left after the trip, as a share of its need). */
  lowestRangeShip: number;
}

export type TripOutcome =
  | { result: 'arrived'; days: number }
  | { result: 'towed'; days: number; fee: number; locationId: number; soldValue: number }
  | { result: 'refused'; reason: string };

/** Sector and point of an actor. */
export function actorPlace(game: Game, actor: Actor): { sectorId: number; point: Vec } {
  const { world } = game.state;
  const p = actor.position;
  if (p.kind === 'docked') {
    const loc = world.locations[p.locationId] as Location;
    return { sectorId: loc.sectorId, point: loc.pos };
  }
  if (p.kind === 'jumpPoint') {
    const jp = world.jumpPoints[p.jumpPointId] as JumpPoint;
    return { sectorId: jp.sectorId, point: jp.pos };
  }
  return { sectorId: p.sectorId, point: { x: p.x, y: p.y } };
}

function destinationPlace(game: Game, dest: Destination): { sectorId: number; point: Vec; name: string; gravity: number } {
  const { world } = game.state;
  if (dest.kind === 'location') {
    const loc = world.locations[dest.locationId];
    if (!loc) throw new Error(`Unknown location ${dest.locationId}`);
    return { sectorId: loc.sectorId, point: loc.pos, name: loc.name, gravity: loc.gravity };
  }
  const jp = world.jumpPoints[dest.jumpPointId];
  if (!jp) throw new Error(`Unknown jump point ${dest.jumpPointId}`);
  const to = world.sectors[jp.toSectorId];
  return { sectorId: jp.sectorId, point: jp.pos, name: `Jump point to ${to?.name ?? '?'}`, gravity: 0 };
}

function lowestRange(need: number[], have: number[]): number {
  let index = 0;
  let best = Infinity;
  need.forEach((n, i) => {
    const ratio = n > 0 ? (have[i] as number) / n : Infinity;
    if (ratio < best) {
      best = ratio;
      index = i;
    }
  });
  return index;
}

function refusedPlan(kind: 'sector' | 'jump', name: string, reason: string, actor: Actor): TripPlan {
  const have = actor.fleet.map((s) => s.fuel);
  return {
    kind,
    possible: false,
    reason,
    destinationName: name,
    distance: 0,
    days: 0,
    fuelNeed: have.map(() => 0),
    fuelHave: have,
    enoughFuel: true,
    lowestRangeShip: 0,
  };
}

/** The first required-module rule (Section 11.2) that a fleet ship breaks, or null. */
function loadoutBlock(actor: Actor, data: GameData): string | null {
  for (const ship of actor.fleet) {
    const error = checkLoadout(ship, data).errors[0];
    if (error) return `${ship.name}: ${error}`;
  }
  return null;
}

function isAt(actor: Actor, dest: Destination): boolean {
  const p = actor.position;
  return (
    (dest.kind === 'location' && p.kind === 'docked' && p.locationId === dest.locationId) ||
    (dest.kind === 'jumpPoint' && p.kind === 'jumpPoint' && p.jumpPointId === dest.jumpPointId)
  );
}

/** Plan of a trip in the current sector (Section 8.2). Docking fuel is part of a trip to a location. */
export function planSectorTrip(game: Game, actor: Actor, dest: Destination): TripPlan {
  const { data } = game;
  const here = actorPlace(game, actor);
  const there = destinationPlace(game, dest);
  if (there.sectorId !== here.sectorId) return refusedPlan('sector', there.name, 'That is in a different sector.', actor);
  if (isAt(actor, dest)) return refusedPlan('sector', there.name, 'You are already there.', actor);
  const blocked = loadoutBlock(actor, data);
  if (blocked) return refusedPlan('sector', there.name, blocked, actor);
  const stats = fleetTravelStats(actor, data);
  const move = fleetMove(stats);
  if (move <= 0) return refusedPlan('sector', there.name, 'A ship in the fleet cannot move (no engine thrust).', actor);
  const distance = mapDistance(here.point, there.point, data.balance.world.cellAspect);
  const days = distance / (data.balance.travel.cruiseFactor * move);
  const fuelNeed = stats.map(
    (s) => sectorTripFuel(distance, s, data) + (dest.kind === 'location' ? dockFuel(there.gravity, s, data) : 0),
  );
  const fuelHave = actor.fleet.map((s) => s.fuel);
  return {
    kind: 'sector',
    possible: true,
    destinationName: there.name,
    distance,
    days,
    fuelNeed,
    fuelHave,
    enoughFuel: fuelNeed.every((n, i) => (fuelHave[i] as number) >= n),
    lowestRangeShip: lowestRange(fuelNeed, fuelHave),
  };
}

/**
 * The lane and the arrival jump point for a jump from `fromJumpPointId`, or
 * from the actor's jump point if no id is given.
 */
export function jumpRoute(
  game: Game,
  actor: Actor,
  fromJumpPointId?: number,
): { lane: Lane; from: JumpPoint; to: JumpPoint } | null {
  const id = fromJumpPointId ?? (actor.position.kind === 'jumpPoint' ? actor.position.jumpPointId : undefined);
  if (id === undefined) return null;
  const { world } = game.state;
  const from = world.jumpPoints[id];
  if (!from) throw new Error(`Unknown jump point ${id}`);
  const lane = world.lanes[from.laneId] as Lane;
  const to = world.jumpPoints.find((j) => j.laneId === lane.id && j.sectorId === from.toSectorId);
  if (!to) throw new Error(`Lane ${lane.id} has no jump point in sector ${from.toSectorId}`);
  return { lane, from, to };
}

/**
 * Plan of a jump (Section 8.3) from the jump point where the fleet is. With
 * `fromJumpPointId`, the plan is for a jump from that jump point (the fleet
 * must travel there first).
 */
export function planJump(game: Game, actor: Actor, fromJumpPointId?: number): TripPlan {
  const { data } = game;
  const route = jumpRoute(game, actor, fromJumpPointId);
  if (!route) return refusedPlan('jump', '?', 'You must be at a jump point to jump.', actor);
  const name = game.state.world.sectors[route.to.sectorId]?.name ?? '?';
  const blocked = loadoutBlock(actor, data);
  if (blocked) return refusedPlan('jump', name, blocked, actor);
  const stats = fleetTravelStats(actor, data);
  const move = fleetMove(stats);
  if (move <= 0) return refusedPlan('jump', name, 'A ship in the fleet cannot move (no engine thrust).', actor);
  const distance = route.lane.length;
  const fuelNeed = stats.map((s) => jumpFuel(distance, s, data));
  const fuelHave = actor.fleet.map((s) => s.fuel);
  return {
    kind: 'jump',
    possible: true,
    destinationName: name,
    distance,
    days: distance / (data.balance.travel.jumpFactor * move),
    fuelNeed,
    fuelHave,
    enoughFuel: fuelNeed.every((n, i) => (fuelHave[i] as number) >= n),
    lowestRangeShip: lowestRange(fuelNeed, fuelHave),
  };
}

/**
 * Share of the trip that the fleet completes before the first ship has no
 * fuel (1 = full trip). Each ship uses its own fuel.
 */
function completedShare(need: number[], have: number[]): number {
  let share = 1;
  need.forEach((n, i) => {
    if (n > 0) share = Math.min(share, (have[i] as number) / n);
  });
  return Math.max(0, share);
}

/** Uses `share` of each ship's need. The ship that limits the trip goes to exactly 0. */
function useFuel(actor: Actor, need: number[], share: number): void {
  actor.fleet.forEach((ship, i) => {
    const used = (need[i] as number) * share;
    ship.fuel = Math.max(0, ship.fuel - used);
    if (ship.fuel < 1e-9) ship.fuel = 0;
  });
}

/** Travel in the current sector. If fuel goes to 0, the fleet stops and is towed (Q-11). */
export function travelInSector(game: Game, actor: Actor, dest: Destination): TripOutcome {
  const { data } = game;
  const plan = planSectorTrip(game, actor, dest);
  if (!plan.possible) return { result: 'refused', reason: plan.reason ?? 'Not possible.' };
  // Keep the last live prices of the location that the fleet leaves.
  observe(game, actor);
  const here = actorPlace(game, actor);
  const there = destinationPlace(game, dest);
  const stats = fleetTravelStats(actor, data);
  const travelNeed = stats.map((s) => sectorTripFuel(plan.distance, s, data));
  const share = completedShare(travelNeed, plan.fuelHave);

  if (share < 1) {
    useFuel(actor, travelNeed, share);
    passTime(game, plan.days * share);
    const stop = {
      x: here.point.x + (there.point.x - here.point.x) * share,
      y: here.point.y + (there.point.y - here.point.y) * share,
    };
    actor.position = { kind: 'space', sectorId: here.sectorId, x: stop.x, y: stop.y };
    observe(game, actor);
    const tow = towFleet(game, actor, here.sectorId, stop);
    return { result: 'towed', days: plan.days * share, fee: tow.fee, locationId: tow.location.id, soldValue: tow.soldValue };
  }

  useFuel(actor, travelNeed, 1);
  passTime(game, plan.days);
  observe(game, actor);
  if (dest.kind === 'jumpPoint') {
    actor.position = { kind: 'jumpPoint', jumpPointId: dest.jumpPointId };
    const jp = game.state.world.jumpPoints[dest.jumpPointId];
    const toName = jp ? game.state.world.sectors[jp.toSectorId]?.name : undefined;
    game.bus.message(`You arrive at the jump point to ${toName ?? '?'}.`);
    return { result: 'arrived', days: plan.days };
  }

  // Docking (Section 8.4). A ship that cannot pay the dock fuel goes to 0 and is towed.
  const dockNeed = stats.map((s) => dockFuel(there.gravity, s, data));
  const dockShare = completedShare(dockNeed, actor.fleet.map((s) => s.fuel));
  useFuel(actor, dockNeed, Math.min(1, dockShare));
  if (dockShare < 1) {
    actor.position = { kind: 'space', sectorId: there.sectorId, x: there.point.x, y: there.point.y };
    const tow = towFleet(game, actor, there.sectorId, there.point);
    return { result: 'towed', days: plan.days, fee: tow.fee, locationId: tow.location.id, soldValue: tow.soldValue };
  }
  actor.position = { kind: 'docked', locationId: dest.locationId };
  observe(game, actor);
  game.bus.message(`You dock at ${plan.destinationName}.`);
  game.bus.emit({ type: 'arrived', actorId: actor.id, locationId: dest.locationId });
  return { result: 'arrived', days: plan.days };
}

/** Jump to the connected sector. If fuel goes to 0 in the lane, the fleet is towed to the destination sector (Q-12). */
export function jump(game: Game, actor: Actor): TripOutcome {
  const plan = planJump(game, actor);
  if (!plan.possible) return { result: 'refused', reason: plan.reason ?? 'Not possible.' };
  const route = jumpRoute(game, actor);
  if (!route) return { result: 'refused', reason: 'You must be at a jump point to jump.' };
  const share = completedShare(plan.fuelNeed, plan.fuelHave);
  useFuel(actor, plan.fuelNeed, Math.min(1, share));
  const days = plan.days * Math.min(1, share);
  passTime(game, days);
  game.bus.emit({ type: 'jumped', actorId: actor.id, fromSectorId: route.from.sectorId, toSectorId: route.to.sectorId });

  if (share < 1) {
    const rest = (1 - share) * route.lane.length;
    const tow = towFleet(game, actor, route.to.sectorId, route.to.pos, rest);
    return { result: 'towed', days, fee: tow.fee, locationId: tow.location.id, soldValue: tow.soldValue };
  }
  actor.position = { kind: 'jumpPoint', jumpPointId: route.to.id };
  observe(game, actor);
  game.bus.message(`You jump to ${plan.destinationName}. The trip takes ${days.toFixed(1)} days.`);
  return { result: 'arrived', days };
}
