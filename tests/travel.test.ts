import { describe, expect, it } from 'vitest';
import { recoveryFee, fullTankPrice, massFactor } from '../src/actor/fuel';
import { jump, jumpRoute, planJump, planSectorTrip, travelInSector } from '../src/actor/travel';
import type { Game } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import type { Location, Ship } from '../src/core/types';
import { gameData, hydrogenBasePrice } from '../src/data';
import { createShipFromLoadout } from '../src/ship/loadout';
import { travelStats } from '../src/ship/stats';
import { generateWorld } from '../src/world/generator';
import { mapDistance } from '../src/world/geometry';

const data = gameData();
const t = data.balance.travel;
const aspect = data.balance.world.cellAspect;

function setup(seed = 7) {
  const game = createGame(seed, data);
  const player = game.state.player;
  const start = game.state.world.locations[game.state.world.startLocationId]!;
  const sector = game.state.world.sectors[start.sectorId]!;
  const others = sector.locationIds.map((id) => game.state.world.locations[id]!).filter((l) => l.id !== start.id);
  return { game, player, start, sector, others };
}

function ship(game: Game, i = 0): Ship {
  return game.state.player.fleet[i]!;
}

/** First seed where the start sector has a planet with gravity above 0, other than the start. */
function setupWithGravityTarget() {
  for (let seed = 1; seed < 200; seed++) {
    const s = setup(seed);
    const target = s.others.find((l) => l.gravity > 0);
    if (target) return { ...s, target };
  }
  throw new Error('no seed with a gravity target');
}

describe('travel in a sector (Section 8.2, 8.4)', () => {
  it('time and fuel follow the formulas, and the ship docks', () => {
    const { game, player, start, target } = setupWithGravityTarget();
    const stats = travelStats(ship(game), data);
    const distance = mapDistance(start.pos, target.pos, aspect);
    const plan = planSectorTrip(game, player, { kind: 'location', locationId: target.id });
    expect(plan.possible).toBe(true);
    expect(plan.distance).toBeCloseTo(distance);
    expect(plan.days).toBeCloseTo(distance / (t.cruiseFactor * stats.move));
    const travelFuel = distance * massFactor(stats.mass, data) * t.kSector * stats.engineFuelRate;
    const dockFuel = target.gravity * massFactor(stats.mass, data) * t.kDock;
    expect(dockFuel).toBeGreaterThan(0);
    expect(plan.fuelNeed[0]).toBeCloseTo(travelFuel + dockFuel);

    const fuelBefore = ship(game).fuel;
    const out = travelInSector(game, player, { kind: 'location', locationId: target.id });
    expect(out.result).toBe('arrived');
    expect(ship(game).fuel).toBeCloseTo(fuelBefore - travelFuel - dockFuel);
    expect(player.position).toEqual({ kind: 'docked', locationId: target.id });
    expect(game.state.day).toBeCloseTo(plan.days);
  });

  it('docking at a station uses no fuel (gravity 0)', () => {
    for (let seed = 1; seed < 100; seed++) {
      const { game, player, others } = setup(seed);
      const station = others.find((l) => l.kind === 'station');
      if (!station) continue;
      const plan = planSectorTrip(game, player, { kind: 'location', locationId: station.id });
      const stats = travelStats(ship(game), data);
      expect(plan.fuelNeed[0]).toBeCloseTo(plan.distance * massFactor(stats.mass, data) * t.kSector);
      return;
    }
    throw new Error('no station target found');
  });

  it('a trip to a different sector or to the same place is refused', () => {
    const { game, player, start } = setup();
    const otherSectorLoc = game.state.world.locations.find((l) => l.sectorId !== start.sectorId)!;
    expect(planSectorTrip(game, player, { kind: 'location', locationId: otherSectorLoc.id }).possible).toBe(false);
    expect(planSectorTrip(game, player, { kind: 'location', locationId: start.id }).possible).toBe(false);
  });

  it('the economy tick runs once for each whole day', () => {
    const { game, player, sector } = setup();
    let ticks = 0;
    game.bus.on((e) => {
      if (e.type === 'newDay') ticks++;
    });
    travelInSector(game, player, { kind: 'jumpPoint', jumpPointId: sector.jumpPointIds[0]! });
    jump(game, player);
    expect(ticks).toBe(Math.floor(game.state.day));
  });
});

describe('jumps (Section 8.3)', () => {
  it('a jump needs a jump point', () => {
    const { game, player } = setup();
    expect(planJump(game, player).possible).toBe(false);
    expect(jump(game, player).result).toBe('refused');
  });

  it('time, fuel, and arrival point follow the formulas', () => {
    const { game, player, sector } = setup();
    travelInSector(game, player, { kind: 'jumpPoint', jumpPointId: sector.jumpPointIds[0]! });
    const route = jumpRoute(game, player)!;
    const stats = travelStats(ship(game), data);
    const plan = planJump(game, player);
    expect(plan.days).toBeCloseTo(route.lane.length / (t.jumpFactor * stats.move));
    const fuel = route.lane.length * massFactor(stats.mass, data) * t.kJump * stats.engineFuelRate;
    expect(plan.fuelNeed[0]).toBeCloseTo(fuel);
    const before = ship(game).fuel;
    const dayBefore = game.state.day;
    expect(jump(game, player).result).toBe('arrived');
    expect(ship(game).fuel).toBeCloseTo(before - fuel);
    expect(game.state.day - dayBefore).toBeCloseTo(plan.days);
    expect(player.position).toEqual({ kind: 'jumpPoint', jumpPointId: route.to.id });
    const arrival = game.state.world.jumpPoints[route.to.id]!;
    expect(arrival.sectorId).toBe(route.from.toSectorId);
    expect(arrival.toSectorId).toBe(route.from.sectorId);
  });

  it('the starting ship does 4 to 6 jumps on a full tank, on lanes of average length (M1-TRV-11)', () => {
    const lengths = Array.from({ length: 100 }, (_, i) => generateWorld(i + 1, data).lanes.map((l) => l.length)).flat();
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const s = travelStats(createShipFromLoadout(data, 'start_shuttle', 'x', 'x'), data);
    const perJump = mean * massFactor(s.mass, data) * t.kJump * s.engineFuelRate;
    const jumps = s.fuelCapacity / perJump;
    expect(jumps).toBeGreaterThanOrEqual(4);
    expect(jumps).toBeLessThanOrEqual(6);
  });
});

describe('fleets (Section 8.2)', () => {
  it('the slowest ship sets the time; each ship uses its own fuel', () => {
    const { game, player, sector } = setup();
    const heavy = createShipFromLoadout(data, 'start_shuttle', 'ship-2', 'Heavy');
    heavy.cargo.iron_ore = { units: 30, unitCost: 15 };
    player.fleet.push(heavy);
    const s0 = travelStats(ship(game, 0), data);
    const s1 = travelStats(heavy, data);
    expect(s1.move).toBeLessThan(s0.move);
    const plan = planSectorTrip(game, player, { kind: 'jumpPoint', jumpPointId: sector.jumpPointIds[0]! });
    expect(plan.days).toBeCloseTo(plan.distance / (t.cruiseFactor * s1.move));
    expect(plan.fuelNeed[1]).toBeGreaterThan(plan.fuelNeed[0]!);
    expect(plan.fuelNeed[1]! / plan.fuelNeed[0]!).toBeCloseTo(massFactor(s1.mass, data) / massFactor(s0.mass, data));
  });
});

describe('out of fuel and tow (Section 8.6)', () => {
  function farTarget(game: Game, startId: number): Location {
    const start = game.state.world.locations[startId]!;
    const sector = game.state.world.sectors[start.sectorId]!;
    const locs = sector.locationIds.map((id) => game.state.world.locations[id]!).filter((l) => l.id !== start.id);
    return locs.reduce((a, b) =>
      mapDistance(start.pos, a.pos, aspect) > mapDistance(start.pos, b.pos, aspect) ? a : b,
    );
  }

  it('the UI warns, the trip still starts, and the ship stops and is towed', () => {
    const { game, player, start } = setup();
    const target = farTarget(game, start.id);
    const plan = planSectorTrip(game, player, { kind: 'location', locationId: target.id });
    ship(game).fuel = plan.fuelNeed[0]! * 0.3;
    const plan2 = planSectorTrip(game, player, { kind: 'location', locationId: target.id });
    expect(plan2.enoughFuel).toBe(false);
    expect(plan2.possible).toBe(true);
    const credits = player.credits;
    const out = travelInSector(game, player, { kind: 'location', locationId: target.id });
    expect(out.result).toBe('towed');
    if (out.result !== 'towed') return;
    // Stopped part of the way: less time than the full trip.
    expect(game.state.day).toBeLessThan(plan.days);
    expect(player.position.kind).toBe('docked');
    const cap = travelStats(ship(game), data).fuelCapacity;
    expect(ship(game).fuel).toBeCloseTo(cap * data.balance.recovery.fuelShareAfterTow);
    expect(player.credits).toBeCloseTo(credits - out.fee);
    expect(out.fee).toBeGreaterThan(data.balance.recovery.base);
  });

  it('recovery fee formula uses the full-tank price', () => {
    const s = createShipFromLoadout(data, 'start_shuttle', 'x', 'x');
    const r = data.balance.recovery;
    const tank = 30 * (hydrogenBasePrice(data) / data.balance.fuel.fuelPerHydrogen);
    expect(fullTankPrice(s, data)).toBeCloseTo(tank);
    expect(recoveryFee(s, 12, data)).toBeCloseTo(r.base + r.perDistance * 12 + r.fullTankShare * tank);
  });

  it('cargo pays the fee when credits are not sufficient', () => {
    const { game, player, sector } = setup();
    player.credits = 0;
    ship(game).cargo.iron_ore = { units: 25, unitCost: 15 };
    ship(game).fuel = 0;
    const out = travelInSector(game, player, { kind: 'jumpPoint', jumpPointId: sector.jumpPointIds[0]! });
    expect(out.result).toBe('towed');
    if (out.result !== 'towed') return;
    const price = data.commodityById.get('iron_ore')!.basePrice;
    const sold = Math.min(25, Math.ceil(out.fee / price));
    expect(ship(game).cargo.iron_ore?.units ?? 0).toBe(25 - sold);
    expect(player.credits).toBeCloseTo(sold * price - out.fee);
  });

  it('credits go below 0 when credits and cargo are not sufficient (debt)', () => {
    const { game, player, sector } = setup();
    player.credits = 50;
    ship(game).fuel = 0;
    const out = travelInSector(game, player, { kind: 'jumpPoint', jumpPointId: sector.jumpPointIds[0]! });
    expect(out.result).toBe('towed');
    if (out.result !== 'towed') return;
    expect(player.credits).toBeCloseTo(50 - out.fee);
    expect(player.credits).toBeLessThan(0);
  });

  it('the full fleet is towed; the fee is paid only for ships with 0 fuel', () => {
    const { game, player, sector } = setup();
    const second = createShipFromLoadout(data, 'start_shuttle', 'ship-2', 'Second');
    player.fleet.push(second);
    ship(game, 0).fuel = 0;
    const credits = player.credits;
    const out = travelInSector(game, player, { kind: 'jumpPoint', jumpPointId: sector.jumpPointIds[0]! });
    expect(out.result).toBe('towed');
    if (out.result !== 'towed') return;
    expect(second.fuel).toBe(30);
    const loc = game.state.world.locations[out.locationId]!;
    expect(player.position).toEqual({ kind: 'docked', locationId: loc.id });
    expect(credits - player.credits).toBeCloseTo(out.fee);
    // One fee: the trip did not start, so the distance is from the start location to the nearest location (itself).
    expect(out.fee).toBeCloseTo(recoveryFee(ship(game, 0), 0, data));
  });

  it('fuel that runs out in a lane tows the fleet to the destination sector (Q-12)', () => {
    const { game, player, sector } = setup();
    travelInSector(game, player, { kind: 'jumpPoint', jumpPointId: sector.jumpPointIds[0]! });
    const route = jumpRoute(game, player)!;
    const plan = planJump(game, player);
    ship(game).fuel = plan.fuelNeed[0]! / 2;
    const out = jump(game, player);
    expect(out.result).toBe('towed');
    if (out.result !== 'towed') return;
    const loc = game.state.world.locations[out.locationId]!;
    expect(loc.sectorId).toBe(route.to.sectorId);
    const near = mapDistance(route.to.pos, loc.pos, aspect);
    expect(out.fee).toBeCloseTo(recoveryFee(ship(game), near + route.lane.length / 2, data));
  });
});
