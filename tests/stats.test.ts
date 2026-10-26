import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data';
import { createShipFromLoadout } from '../src/ship/loadout';
import { motion, shipStats, travelStats } from '../src/ship/stats';

const data = gameData();
const mRef = data.balance.ship.mRef;

// Section 11.4 reference table: thrust, mass (t), TWR, agility, maneuver, move.
const REFERENCE: [string, number, number, number, number, number, number][] = [
  ['Wasp, 1 x S engine', 30, 15, 2.0, 1.75, 75, 6],
  ['Wasp, 2 x S engine', 60, 17, 3.53, 2.96, 90, 6],
  ['Starting Shuttle, empty', 30, 28, 1.07, 0.76, 37, 4],
  ['Starting Shuttle, 20 t cargo', 30, 48, 0.62, 0.37, 12, 3],
  ['Shuttle, 2 x S engine, 20 t cargo', 60, 50, 1.2, 0.7, 33, 4],
  ['Gunship, 1 x M', 80, 48, 1.67, 0.99, 49, 5],
  ['Gunship, 1 x M + 1 x S', 110, 50, 2.2, 1.29, 62, 5],
  ['Light Freighter, 1 x M, laden', 80, 68, 1.18, 0.62, 28, 4],
  ['Corvette, 1 x L', 200, 104, 1.92, 0.88, 44, 5],
  ['Heavy Freighter, 1 x L, laden', 200, 156, 1.28, 0.51, 21, 4],
  ['Frigate, 2 x L', 400, 232, 1.72, 0.6, 27, 4],
  ['Battleship, 4 x L', 800, 654, 1.22, 0.3, 8, 3],
];

describe('speed and maneuver formulas (Section 11.4)', () => {
  it.each(REFERENCE)('%s', (_name, thrust, mass, twr, agility, maneuver, move) => {
    const m = motion(thrust, mass, 1, mRef);
    expect(m.twr).toBeCloseTo(twr, 1);
    expect(Math.abs(m.agility - agility)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(Math.round(m.maneuver) - maneuver)).toBeLessThanOrEqual(1);
    expect(m.move).toBe(move);
  });

  it('no thrust gives move 0 and maneuver 0', () => {
    expect(motion(0, 28, 1, mRef)).toMatchObject({ move: 0, maneuver: 0 });
  });

  it('move is never more than 6', () => {
    expect(motion(100000, 1, 1, mRef).move).toBe(6);
  });
});

describe('starting ship stats (M1-SHIP-05)', () => {
  const ship = () => createShipFromLoadout(data, 'start_shuttle', 's', 'test');

  it('empty: mass 28 t, TWR 1.07, move 4, cargo 30 t, fuel 30', () => {
    const s = travelStats(ship(), data);
    expect(s.mass).toBe(28);
    expect(s.twr).toBeCloseTo(1.07, 2);
    expect(s.move).toBe(4);
    expect(s.cargoCapacity).toBe(30);
    expect(s.fuelCapacity).toBe(30);
    expect(s.engineFuelRate).toBe(1);
  });

  it('with 20 t cargo: mass 48 t, move 3', () => {
    const sh = ship();
    sh.cargo.iron_ore = { units: 20, unitCost: 15 };
    const s = travelStats(sh, data);
    expect(s.cargoMass).toBe(20);
    expect(s.mass).toBe(48);
    expect(s.move).toBe(3);
  });

  it('cargo mass uses mass per unit', () => {
    const sh = ship();
    sh.cargo.electronics = { units: 50, unitCost: 400 };
    expect(travelStats(sh, data).cargoMass).toBeCloseTo(10);
  });

  it('starts with full fuel and full HP', () => {
    const sh = ship();
    expect(sh.fuel).toBe(30);
    expect(sh.hullHp).toBe(40);
    expect(sh.engineValue).toBe(8);
  });

  it('an engine that is OFF gives no thrust, except in travel stats', () => {
    const sh = ship();
    sh.internal[0]!.on = false;
    expect(shipStats(sh, data).move).toBe(0);
    expect(travelStats(sh, data).move).toBe(4);
  });

  it('engine value 0 gives move 0', () => {
    const sh = ship();
    sh.engineValue = 0;
    expect(travelStats(sh, data)).toMatchObject({ move: 0, maneuver: 0 });
  });

  it('a second S engine gives the Section 11.4 row', () => {
    const sh = ship();
    sh.internal[3] = { moduleId: 'engine', size: 'S', tier: 1, on: true };
    sh.cargo.iron_ore = { units: 20, unitCost: 15 };
    const s = travelStats(sh, data);
    expect(s.mass).toBe(50);
    expect(s.thrust).toBe(60);
    expect(s.move).toBe(4);
    expect(Math.round(s.maneuver)).toBe(33);
  });
});
