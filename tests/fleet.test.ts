import { describe, expect, it } from 'vitest';
import { addCargo, fleetUnits, loadingOrder } from '../src/actor/cargo';
import { accrueUpkeep, payUpkeep, removeShip, setFlagship, upkeepPerDay } from '../src/actor/fleet';
import { fleetProblems, moveAllCargo, moveCargo, moveModule } from '../src/actor/fleetManage';
import { towFleet } from '../src/actor/fuel';
import { planSectorTrip, travelInSector } from '../src/actor/travel';
import { buy, sell } from '../src/services/market';
import { refuel } from '../src/services/refuel';
import { finishBattle } from '../src/career/battleEnd';
import { applyDefeat } from '../src/career/defeat';
import { takePrize, surrenderedShips } from '../src/career/prize';
import { createBattle } from '../src/combat/battle';
import { resolveTurn } from '../src/combat/resolver';
import { combatStats } from '../src/combat/rules';
import type { Battle, CombatShip } from '../src/combat/types';
import { type Game, passTime, wrapGame } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import { createRngState, Rng } from '../src/core/rng';
import type { Location, Ship } from '../src/core/types';
import { gameData } from '../src/data';
import { fleeCargoLoss, rollEncounter } from '../src/encounter/encounter';
import { buyInsurance } from '../src/services/insurance';
import { buyShip, sellShip, tradeInValue } from '../src/services/shipyard';
import { wait } from '../src/services/wait';
import { createShipFromLoadout } from '../src/ship/loadout';
import { travelStats } from '../src/ship/stats';

const data = gameData();
const template = createGame(11, data).state;

function setup(): { game: Game; loc: Location } {
  const game = wrapGame(structuredClone(template), data);
  const loc = game.state.world.locations.find((l) => l.techLevel >= 2) as Location;
  loc.services = data.services.map((s) => s.id);
  game.state.player.position = { kind: 'docked', locationId: loc.id };
  game.state.player.credits = 1e6;
  return { game, loc };
}

const ship = (loadout: string, name = loadout): Ship => createShipFromLoadout(data, loadout, name, name);

function withFleet(loadouts: string[]): { game: Game; loc: Location } {
  const s = setup();
  s.game.state.player.fleet = loadouts.map((l, i) => ship(l, `S${i}`));
  s.game.state.player.flagshipIndex = 0;
  return s;
}

describe('fleet rules (M6-FLEET)', () => {
  it('buy: a hull joins the fleet with an empty loadout; the fleet has at most maxFleetSize ships', () => {
    const { game, loc } = setup();
    const p = game.state.player;
    const r = buyShip(game, p, loc, 'light_freighter');
    expect(r.ok).toBe(true);
    expect(p.fleet.length).toBe(2);
    const s = p.fleet[1]!;
    expect(s.hullId).toBe('light_freighter');
    expect([...s.internal, ...s.hardpoints].every((m) => m === null)).toBe(true);
    expect(p.flagshipIndex).toBe(0);
    buyShip(game, p, loc, 'light_freighter');
    buyShip(game, p, loc, 'light_freighter');
    expect(p.fleet.length).toBe(data.balance.fleet.maxFleetSize);
    expect(buyShip(game, p, loc, 'light_freighter').text).toMatch(/full/);
    p.credits = -1;
    expect(buyShip(game, p, loc, 'shuttle').ok).toBe(false);
  });

  it('sell: only a non-flagship ship with no cargo, at its trade-in value', () => {
    const { game, loc } = withFleet(['start_shuttle', 'light_freighter_starter']);
    const p = game.state.player;
    expect(sellShip(game, p, loc, 0).ok).toBe(false);
    p.fleet[1]!.cargo.water = { units: 2, unitCost: 1 };
    expect(sellShip(game, p, loc, 1).ok).toBe(false);
    delete p.fleet[1]!.cargo.water;
    const value = tradeInValue(p.fleet[1]!, data);
    const before = p.credits;
    expect(sellShip(game, p, loc, 1).ok).toBe(true);
    expect(p.fleet.length).toBe(1);
    expect(p.credits).toBeCloseTo(before + value);
  });

  it('flagship: select another ship only when docked; removing the flagship makes the next ship the flagship', () => {
    const { game } = withFleet(['start_shuttle', 'light_freighter_starter', 'laser_wasp']);
    const p = game.state.player;
    expect(setFlagship(game, p, 2)).toBeNull();
    expect(p.flagshipIndex).toBe(2);
    p.position = { kind: 'space', sectorId: 0, x: 1, y: 1 };
    expect(setFlagship(game, p, 0)).toMatch(/location/);
    p.flagshipIndex = 1;
    removeShip(game, p, 1);
    expect(p.fleet[p.flagshipIndex]!.name).toBe('S2');
    removeShip(game, p, 0);
    expect(p.fleet[p.flagshipIndex]!.name).toBe('S2');
    expect(removeShip(game, p, 0)).toBeNull();
  });

  it('travel: the slowest ship sets the time; each ship uses its own fuel; departure needs each ship to pass the rules', () => {
    const { game } = withFleet(['light_freighter_starter', 'start_shuttle']);
    const p = game.state.player;
    const dest = game.state.world.locations.find((l) => l.sectorId === game.state.world.locations[(p.position as { locationId: number }).locationId]!.sectorId && l.id !== (p.position as { locationId: number }).locationId)!;
    const both = planSectorTrip(game, p, { kind: 'location', locationId: dest.id });
    const slow = Math.min(...p.fleet.map((s) => travelStats(s, data).move));
    const fast = Math.max(...p.fleet.map((s) => travelStats(s, data).move));
    expect(slow).toBeLessThan(fast);
    p.fleet = [p.fleet[0]!];
    const alone = planSectorTrip(game, p, { kind: 'location', locationId: dest.id });
    expect(both.days).toBeGreaterThan(alone.days);
    expect(both.fuelNeed.length).toBe(2);
    expect(both.fuelNeed[0]).not.toBeCloseTo(both.fuelNeed[1]!);
    p.fleet.push({ ...ship('light_freighter_starter', 'Empty'), internal: [] as never[], hardpoints: [] as never[] });
    p.fleet[1]!.internal = p.fleet[1]!.internal.map(() => null);
    expect(planSectorTrip(game, p, { kind: 'location', locationId: dest.id }).possible).toBe(false);
  });

  it('exit check 1: a fleet of 4 ships travels, trades, and refuels', () => {
    const { game, loc } = withFleet(['light_freighter_starter', 'light_freighter_starter', 'start_shuttle', 'light_freighter_starter']);
    const p = game.state.player;
    const commodity = Object.keys(loc.market).find((c) => (loc.market[c]?.stock ?? 0) > 50) as string;
    expect(buy(game, p, loc, commodity, 1e9).ok).toBe(true);
    expect(p.fleet.filter((s) => Object.keys(s.cargo).length > 0).length).toBeGreaterThan(1);
    const dest = game.state.world.locations.find((l) => l.sectorId === loc.sectorId && l.id !== loc.id) as Location;
    expect(travelInSector(game, p, { kind: 'location', locationId: dest.id }).result).toBe('arrived');
    expect(p.fleet.every((s) => s.fuel < travelStats(s, data).fuelCapacity)).toBe(true);
    dest.services = data.services.map((s) => s.id);
    expect(refuel(game, p, dest).ok).toBe(true);
    expect(p.fleet.every((s) => s.fuel >= travelStats(s, data).fuelCapacity - 1e-6)).toBe(true);
    expect(sell(game, p, dest, commodity, 1e9).ok || dest.market[commodity] === undefined).toBe(true);
  });

  it('tow: the full fleet moves; the fee is paid for each ship with 0 fuel', () => {
    const { game } = withFleet(['start_shuttle', 'light_freighter_starter', 'light_freighter_starter']);
    const p = game.state.player;
    p.position = { kind: 'space', sectorId: 0, x: 5, y: 5 };
    p.fleet[1]!.fuel = 0;
    const one = towFleet(game, p, 0, { x: 5, y: 5 });
    expect(one.towedShips).toBe(1);
    expect(p.position.kind).toBe('docked');
    p.position = { kind: 'space', sectorId: 0, x: 5, y: 5 };
    p.fleet[1]!.fuel = 0;
    p.fleet[2]!.fuel = 0;
    const two = towFleet(game, p, 0, { x: 5, y: 5 });
    expect(two.towedShips).toBe(2);
    expect(two.fee).toBeGreaterThan(one.fee);
  });

  it('cargo: fleet capacity; loading order puts the flagship last; cargo moves between ships as far as it fits', () => {
    const { game } = withFleet(['start_shuttle', 'light_freighter_starter']);
    const p = game.state.player;
    expect(loadingOrder(p, data)[1]).toBe(p.fleet[0]);
    addCargo(p, data, 'water', 10, 5);
    expect(p.fleet[1]!.cargo.water?.units).toBe(10);
    expect(p.fleet[0]!.cargo.water).toBeUndefined();
    const r = moveCargo(data, p.fleet[1]!, p.fleet[0]!, 'water', 4);
    expect(r.ok).toBe(true);
    expect(p.fleet[0]!.cargo.water).toEqual({ units: 4, unitCost: 5 });
    expect(fleetUnits(p, 'water')).toBe(10);
    expect(moveCargo(data, p.fleet[1]!, p.fleet[0]!, 'water', 1e9).ok).toBe(true);
    // The Shuttle hold is small: the rest stays.
    expect(fleetUnits(p, 'water')).toBeCloseTo(10);
    expect(moveCargo(data, p.fleet[0]!, p.fleet[0]!, 'water', 1).ok).toBe(false);
  });

  it('modules move into a free slot of the right type and size; a module that holds cargo cannot leave a full hold', () => {
    const { game } = withFleet(['start_shuttle', 'light_freighter_starter']);
    const p = game.state.player;
    const src = p.fleet[1]!;
    const idx = src.hardpoints.findIndex((m) => m !== null);
    const moved = src.hardpoints[idx]!;
    const dst = p.fleet[0]!;
    dst.hardpoints = dst.hardpoints.map(() => null);
    const r = moveModule(data, src, 'hardpoint', idx, dst);
    expect(r.ok).toBe(true);
    expect(src.hardpoints[idx]).toBeNull();
    expect(dst.hardpoints).toContainEqual(moved);
    expect(moveModule(data, src, 'hardpoint', idx, dst).ok).toBe(false);
    const rack = src.internal.findIndex((m) => m?.moduleId === 'cargo_rack');
    if (rack >= 0) {
      addCargo(p, data, 'water', 1e6, 1);
      expect(moveModule(data, src, 'internal', rack, dst).ok).toBe(false);
    }
  });

  it('fleet problems list ships that break the required-module rules', () => {
    const { game } = withFleet(['start_shuttle', 'light_freighter_starter']);
    const p = game.state.player;
    expect(fleetProblems(p.fleet, data)).toEqual([]);
    p.fleet[1]!.internal = p.fleet[1]!.internal.map(() => null);
    expect(fleetProblems(p.fleet, data)[0]).toMatch(/^S1: /);
  });

  it('upkeep: each non-flagship ship pays upkeepPerShip x size points a day, at each dock and at Wait; debt is possible', () => {
    const { game, loc } = withFleet(['start_shuttle', 'light_freighter_starter']);
    const p = game.state.player;
    const per = data.balance.fleet.upkeepPerShip * data.balance.fleet.sizePoints.large;
    expect(upkeepPerDay(p, data)).toBeCloseTo(per);
    p.upkeepDay = game.state.day;
    const before = p.credits;
    expect(wait(game, p, loc, 3).ok).toBe(true);
    expect(p.credits).toBeCloseTo(before - 3 * per);
    // A ship counts only for its own days: accrue before the fleet changes.
    passTime(game, 2);
    accrueUpkeep(game, p);
    p.fleet.push(ship('light_freighter_starter', 'S2'));
    passTime(game, 1);
    p.credits = 0;
    expect(payUpkeep(game, p)).toBeCloseTo(2 * per + 1 * 2 * per);
    expect(p.credits).toBeLessThan(0);
    // The flagship pays no upkeep.
    p.fleet = [p.fleet[0]!];
    expect(upkeepPerDay(p, data)).toBe(0);
  });

  it('encounters: pirate chance x (1 + 0.1 x (fleet size - 1))', () => {
    const { game } = withFleet(['start_shuttle', 'light_freighter_starter', 'light_freighter_starter', 'laser_wasp']);
    const p = game.state.player;
    const sector = game.state.world.sectors[0]!;
    const seen: number[] = [];
    const fake = { chance: (x: number) => (seen.push(x), false) } as unknown as Rng;
    rollEncounter('arrival', sector, { x: 1, y: 1 }, p, game.state.world.locations, fake, data);
    const four = seen[0]!;
    seen.length = 0;
    p.fleet = [p.fleet[0]!];
    rollEncounter('arrival', sector, { x: 1, y: 1 }, p, game.state.world.locations, fake, data);
    expect(four).toBeCloseTo(Math.min(1, seen[0]! * 1.3));
  });
});

/** A battle of the player's flagship against one ship; the other ship can be made to surrender. */
function battleWith(game: Game, loadout: string, faction: 'pirate' | 'trader' = 'pirate'): Battle {
  const p = game.state.player;
  const enemy = ship(loadout, 'Enemy');
  enemy.cargo.water = { units: 5, unitCost: 3 };
  return createBattle(
    {
      player: [{ ship: p.fleet[p.flagshipIndex]!, ai: 'human' }],
      other: [{ ship: enemy, ai: faction === 'pirate' ? 'raider' : 'trader', faction }],
      aggressor: 'other',
      rng: createRngState(3, 'combat'),
    },
    data,
  );
}

describe('fleet in combat (M6-FCMB)', () => {
  it('forced surrender: engine value 0 and hull at or below 20% surrenders with no roll, also a patrol', () => {
    const { game } = withFleet(['laser_gunship']);
    for (const ai of ['raider', 'patrol'] as const) {
      const b = battleWith(game, 'pirate_raider');
      const e = b.ships[1] as CombatShip;
      e.ai = ai;
      e.moraleRolled = true;
      e.ship.engineValue = 0;
      e.ship.hullHp = combatStats(e, data).maxHullHp * data.balance.combat.forcedSurrenderHull;
      const out = resolveTurn(b, [], data).battle;
      expect(out.ships[1]!.status).toBe('surrendered');
    }
    const b = battleWith(game, 'pirate_raider');
    const e = b.ships[1] as CombatShip;
    e.ai = 'patrol';
    e.ship.engineValue = 0;
    e.ship.hullHp = combatStats(e, data).maxHullHp * 0.3;
    expect(resolveTurn(b, [], data).battle.ships[1]!.status).toBe('active');
  });

  it('flee from pirates: they take 50% of the cargo of one random non-flagship ship', () => {
    const { game } = withFleet(['laser_wasp', 'light_freighter_starter']);
    const p = game.state.player;
    addCargo(p, data, 'water', 20, 1);
    const loss = fleeCargoLoss(p, new Rng(createRngState(1, 'encounter')), data);
    expect(loss?.ship).toBe(p.fleet[1]);
    expect(fleetUnits(p, 'water')).toBeCloseTo(10);
    p.fleet = [p.fleet[0]!];
    expect(fleeCargoLoss(p, new Rng(createRngState(1, 'encounter')), data)).toBeNull();
  });

  it('flagship destroyed: the next ship is the flagship, the career goes on; last ship: insurance or game over', () => {
    const { game, loc } = withFleet(['laser_wasp', 'light_freighter_starter']);
    const p = game.state.player;
    const b = battleWith(game, 'patrol_cutter', 'trader');
    b.ships[0]!.ship.hullHp = 0;
    b.ships[0]!.status = 'destroyed';
    b.result = 'loss';
    expect(applyDefeat(game, p, b)).toBe('flagshipLost');
    expect(p.fleet.length).toBe(1);
    expect(p.fleet[p.flagshipIndex]!.name).toBe('S1');
    expect(applyDefeat(game, p, b)).toBe('gameOver');
    const g2 = withFleet(['laser_wasp']);
    buyInsurance(g2.game, g2.game.state.player, g2.loc);
    expect(applyDefeat(g2.game, g2.game.state.player, b)).toBe('cloned');
    void loc;
  });

  it('prize: loadout, damage, cargo, 25% fuel; notoriety for a non-pirate; no capital ships; not with a full fleet', () => {
    const { game } = withFleet(['laser_gunship']);
    const p = game.state.player;
    const b = battleWith(game, 'light_freighter_trader', 'trader');
    const e = b.ships[1] as CombatShip;
    e.status = 'surrendered';
    e.ship.hullHp = 7;
    expect(surrenderedShips(b)).toEqual([e]);
    const n0 = p.notoriety;
    const r = takePrize(game, p, e);
    expect(r.ok).toBe(true);
    const prize = p.fleet[1]!;
    expect(prize.hullHp).toBe(7);
    expect(prize.cargo.water).toEqual({ units: 5, unitCost: 0 });
    expect(prize.fuel).toBeCloseTo(travelStats(prize, data).fuelCapacity * data.balance.fleet.prizeFuelShare);
    expect(prize.hardpoints).toEqual(e.ship.hardpoints);
    expect(p.notoriety).toBeCloseTo(n0 + data.balance.notoriety.prizeNonPirate);
    const big = battleWith(game, 'battleship');
    big.ships[1]!.status = 'surrendered';
    expect(takePrize(game, p, big.ships[1]!).ok).toBe(false);
    p.fleet.push(ship('laser_wasp', 'a'), ship('laser_wasp', 'b'));
    const pr = battleWith(game, 'pirate_raider');
    expect(takePrize(game, p, pr.ships[1]!).text).toMatch(/full/);
  });

  it('boarding: manual boarding leaves the surrendered cargo for the after-battle screen; auto takes it', () => {
    for (const boarding of ['auto', 'manual'] as const) {
      const { game } = withFleet(['laser_gunship', 'light_freighter_starter']);
      const p = game.state.player;
      const b = battleWith(game, 'pirate_raider');
      b.ships[1]!.status = 'surrendered';
      b.result = 'win';
      finishBattle(game, p, b, { boarding });
      expect(fleetUnits(p, 'water')).toBeCloseTo(boarding === 'auto' ? 5 : 0);
      if (boarding === 'manual') {
        expect(moveAllCargo(data, b.ships[1]!.ship, p.fleet[1]!, true)).toBeCloseTo(5);
        expect(p.fleet[1]!.cargo.water?.unitCost).toBe(0);
      }
    }
  });
});
