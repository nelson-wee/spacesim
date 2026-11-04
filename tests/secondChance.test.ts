// The one-time second chance (owner, Q-52, M8-SC-01 to M8-SC-06).
import { describe, expect, it } from 'vitest';
import { towFleet } from '../src/actor/fuel';
import {
  acceptSecondChance,
  buyBack,
  declineSecondChance,
  deliverRelief,
  isStuck,
  namedShipId,
  noteTow,
  raidArrival,
  raidBattle,
  raidEncounter,
  raidPlan,
  reliefPlan,
} from '../src/career/secondChance';
import { takePrize } from '../src/career/prize';
import { contractDay } from '../src/career/contracts';
import { createBattle } from '../src/combat/battle';
import { type Game, wrapGame } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import type { Location, RaidContract, ReliefContract } from '../src/core/types';
import { gameData } from '../src/data';
import { createShipFromLoadout } from '../src/ship/loadout';
import { travelStats } from '../src/ship/stats';
import { securityLevel } from '../src/world/security';

const data = gameData();
const template = createGame(11, data).state;
const fresh = (): Game => wrapGame(structuredClone(template), data);
// Seed 4 has a Pirate Haven and low-security sectors (seed 11 has none).
const lawless = createGame(4, data).state;
const freshLawless = (): Game => wrapGame(structuredClone(lawless), data);
const level = (g: Game, l: Location) => securityLevel(g.state.world.sectors[l.sectorId]!.securityValue, data);

function dockAt(g: Game, l: Location): void {
  g.state.player.position = { kind: 'docked', locationId: l.id };
}

describe('second chance (M8-SC)', () => {
  it('the start ship is named Fresh Start (M8-SC-05)', () => {
    expect(template.player.fleet[0]!.name).toBe('Fresh Start');
  });

  it('trigger: the first tow into debt shows one offer; relief at level 2-4; Decline uses it (M8-SC-01)', () => {
    const g = fresh();
    const p = g.state.player;
    const loc = g.state.world.locations.find((l) => level(g, l) >= 2 && reliefPlan(g, l.id))!;
    p.credits = 100;
    noteTow(g, p, loc.id);
    expect(g.state.career.secondChance.offer).toBeNull();
    p.credits = -500;
    noteTow(g, p, loc.id);
    expect(g.state.career.secondChance.offer).toEqual({ kind: 'relief', locationId: loc.id });
    expect(g.state.career.secondChance.used).toBe(true);
    declineSecondChance(g);
    noteTow(g, p, loc.id);
    expect(g.state.career.secondChance.offer).toBeNull();
  });

  it('with no Pirate Haven in range, a lawless tow gets the guild relief instead', () => {
    const g = fresh();
    const p = g.state.player;
    const loc = g.state.world.locations.find((l) => reliefPlan(g, l.id))!;
    const sector = g.state.world.sectors[loc.sectorId]!;
    sector.securityValue = 0;
    // Each world has a Haven now (owner, 2026-11-04): remove it for this test.
    for (const l of g.state.world.locations) if (l.bodyType === 'pirate_haven') l.bodyType = 'habitat';
    p.credits = -500;
    noteTow(g, p, loc.id);
    expect(raidPlan(g, loc.id)).toBeNull();
    expect(g.state.career.secondChance.offer?.kind).toBe('relief');
  });

  it('relief with a full hold: the guild sells cargo here to make room; no repair if nothing fits', () => {
    const g = fresh();
    const p = g.state.player;
    const loc = g.state.world.locations.find((l) => level(g, l) >= 2 && reliefPlan(g, l.id))!;
    dockAt(g, loc);
    const plan = reliefPlan(g, loc.id)!;
    const other = Object.keys(loc.market).find((c) => c !== plan.commodity)!;
    const ship = p.fleet[0]!;
    const cap = travelStats(ship, data).cargoCapacity;
    ship.cargo = { [other]: { units: cap / data.commodityById.get(other)!.massPerUnit, unitCost: 1 } };
    p.credits = -800;
    noteTow(g, p, loc.id);
    expect(acceptSecondChance(g).ok).toBe(true);
    expect(p.credits).toBeGreaterThan(-800);
    expect(ship.cargo[plan.commodity]!.units * data.commodityById.get(plan.commodity)!.massPerUnit).toBeCloseTo(data.contracts.secondChance.relief.tonnes);
  });

  it('a tow into debt sets the offer (towFleet)', () => {
    const g = fresh();
    const p = g.state.player;
    const start = g.state.world.locations[g.state.world.startLocationId]!;
    p.credits = -1000;
    p.fleet[0]!.fuel = 0;
    towFleet(g, p, start.sectorId, start.pos);
    expect(g.state.career.secondChance.offer).not.toBeNull();
  });

  it('guild relief: free repair and refuel, guild cargo, done clears the debt; late fails (M8-SC-02)', () => {
    const g = fresh();
    const p = g.state.player;
    const loc = g.state.world.locations.find((l) => level(g, l) >= 2 && reliefPlan(g, l.id))!;
    dockAt(g, loc);
    const ship = p.fleet[0]!;
    ship.hullHp = 1;
    ship.fuel = 0;
    p.credits = -800;
    noteTow(g, p, loc.id);
    expect(acceptSecondChance(g).ok).toBe(true);
    const s = travelStats(ship, data);
    expect(ship.hullHp).toBe(s.maxHullHp);
    expect(ship.fuel).toBe(s.fuelCapacity);
    expect(p.credits).toBe(-800);
    const c = g.state.contracts.active.find((x): x is ReliefContract => x.kind === 'relief')!;
    expect(c.units * data.commodityById.get(c.commodity)!.massPerUnit).toBeCloseTo(data.contracts.secondChance.relief.tonnes);
    expect(ship.cargo[c.commodity]!.unitCost).toBe(0);
    // Done at the destination.
    dockAt(g, g.state.world.locations[c.destId]!);
    const completed = g.state.contracts.completed;
    expect(deliverRelief(g, c.id).ok).toBe(true);
    expect(p.credits).toBe(0);
    expect(g.state.contracts.completed).toBe(completed + 1);
    expect(g.state.contracts.active.some((x) => x.kind === 'relief')).toBe(false);

    // Late: the debt stays; a failed contract.
    const g2 = fresh();
    dockAt(g2, loc);
    g2.state.player.credits = -800;
    noteTow(g2, g2.state.player, loc.id);
    acceptSecondChance(g2);
    const c2 = g2.state.contracts.active.find((x): x is ReliefContract => x.kind === 'relief')!;
    g2.state.day = c2.deadline + 1;
    contractDay(g2);
    expect(g2.state.contracts.failed).toBe(1);
    expect(g2.state.player.credits).toBe(-800);
    expect(g2.state.player.fleet[0]!.cargo[c2.commodity]).toBeUndefined();
  });

  it('pirate offer: Wasp trade, target encounter, capture, delivery at the Haven, buyback (M8-SC-03, M8-SC-04)', () => {
    const g = freshLawless();
    const p = g.state.player;
    const loc = g.state.world.locations.find((l) => level(g, l) <= 1 && raidPlan(g, l.id));
    expect(loc).toBeDefined();
    dockAt(g, loc!);
    p.fleet.push(createShipFromLoadout(data, 'light_freighter_starter', 'ship-x', 'Mule'));
    p.fleet[0]!.cargo = { water: { units: 5, unitCost: 10 } };
    const original = structuredClone(p.fleet[0]!);
    p.credits = -600;
    noteTow(g, p, loc!.id);
    expect(g.state.career.secondChance.offer?.kind).toBe('pirate');
    expect(acceptSecondChance(g).ok).toBe(true);
    expect(p.fleet[p.flagshipIndex]!.hullId).toBe('wasp');
    expect(p.fleet[1]!.cargo.water!.units).toBeCloseTo(5);
    expect(p.credits).toBe(-600);
    const c = g.state.contracts.active.find((x): x is RaidContract => x.kind === 'raid')!;
    const sector = g.state.world.sectors[c.sectorId]!;
    const enc = raidEncounter(g, sector, { x: 1, y: 1 })!;
    expect(enc.namedId).toBe(c.id);
    expect(enc.ships[0]!.loadoutId).toBe(c.targetLoadout);
    // Capture: the target surrenders; take it as a prize.
    const target = createShipFromLoadout(data, c.targetLoadout, namedShipId(c.id, 0), c.targetName);
    target.cargo = { food: { units: 10, unitCost: 5 } };
    const b = createBattle({ player: [{ ship: structuredClone(p.fleet[0]!), ai: 'human' }], other: [{ ship: target, ai: 'trader', faction: 'trader' }], aggressor: 'player', rng: [1, 2, 3, 4] }, data);
    const cs = b.ships.find((s) => s.side === 'other')!;
    cs.status = 'surrendered';
    raidBattle(g, c.id, b.ships);
    expect(takePrize(g, p, cs).ok).toBe(true);
    expect(c.prizeShipId).not.toBeNull();
    // At the Haven: the pirates take the vessel; the debt is cleared; the buyback is offered.
    const haven = g.state.world.locations[c.havenId]!;
    dockAt(g, haven);
    expect(raidArrival(g)).toBe(true);
    expect(p.credits).toBeGreaterThanOrEqual(0);
    expect(p.fleet.some((s) => s.id === c.prizeShipId)).toBe(false);
    const bb = g.state.career.secondChance.buyback!;
    expect(bb.locationId).toBe(haven.id);
    expect(bb.ship.hullId).toBe(original.hullId);
    p.credits = bb.price - 1;
    expect(buyBack(g).ok).toBe(false);
    p.credits = bb.price + 10;
    expect(buyBack(g).ok).toBe(true);
    expect(p.fleet.some((s) => s.hullId === original.hullId && s.name === original.name)).toBe(true);
    expect(p.credits).toBeCloseTo(10);
    expect(g.state.career.secondChance.buyback).toBeNull();
  });

  it('a destroyed target fails the pirate job; the Wasp and the debt stay', () => {
    const g = freshLawless();
    const p = g.state.player;
    const loc = g.state.world.locations.find((l) => level(g, l) <= 1 && raidPlan(g, l.id))!;
    dockAt(g, loc);
    p.credits = -600;
    noteTow(g, p, loc.id);
    acceptSecondChance(g);
    const c = g.state.contracts.active.find((x): x is RaidContract => x.kind === 'raid')!;
    const target = createShipFromLoadout(data, c.targetLoadout, namedShipId(c.id, 0), c.targetName);
    const b = createBattle({ player: [{ ship: structuredClone(p.fleet[0]!), ai: 'human' }], other: [{ ship: target, ai: 'trader', faction: 'trader' }], aggressor: 'player', rng: [1, 2, 3, 4] }, data);
    b.ships.find((s) => s.side === 'other')!.status = 'destroyed';
    raidBattle(g, c.id, b.ships);
    expect(g.state.contracts.active.some((x) => x.kind === 'raid')).toBe(false);
    expect(p.fleet[0]!.hullId).toBe('wasp');
    expect(p.credits).toBe(-600);
    expect(g.state.career.secondChance.buyback).toBeNull();
  });

  it('stuck: debt, no cargo, one ship, no module that can come out (M8-SC-06)', () => {
    const g = fresh();
    const p = g.state.player;
    p.credits = -100;
    expect(isStuck(g)).toBe(false); // the shuttle can sell its laser or shield
    const ship = p.fleet[0]!;
    ship.cargo = {};
    ship.hardpoints = ship.hardpoints.map(() => null);
    ship.internal = ship.internal.map((m) => (m && (m.moduleId === 'engine' || m.moduleId === 'reactor') ? m : null));
    expect(isStuck(g)).toBe(true);
    p.credits = 0;
    expect(isStuck(g)).toBe(false);
  });
});
