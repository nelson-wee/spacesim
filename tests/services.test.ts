import { describe, expect, it } from 'vitest';
import { addCargo, fleetUnits, loadingOrder } from '../src/actor/cargo';
import { fuelUnitPrice } from '../src/actor/fuel';
import { type Game, passTime, wrapGame } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import type { Location } from '../src/core/types';
import { gameData } from '../src/data';
import { buyPrice, quoteBuy, quoteSell } from '../src/econ/prices';
import { createShipFromLoadout } from '../src/ship/loadout';
import { moduleValues } from '../src/ship/modules';
import { travelStats } from '../src/ship/stats';
import { maxSaleTier, salePriceMult } from '../src/services/common';
import { buy, buyLimit, sell } from '../src/services/market';
import { quoteRepair, repair } from '../src/services/mechanic';
import { buyModule, moduleOffers, moduleSellValue, sellModule } from '../src/services/outfitter';
import { quoteRefuel, refuel } from '../src/services/refuel';
import { buyHull, hullOffers, tradeInValue } from '../src/services/shipyard';
import { wait } from '../src/services/wait';

const data = gameData();
const template = createGame(11, data).state;

/** A fresh game, docked at `loc` with all services. */
function setup(pick: (l: Location) => boolean = () => true): { game: Game; loc: Location } {
  const game = wrapGame(structuredClone(template), data);
  const loc = game.state.world.locations.find(pick);
  if (!loc) throw new Error('no location');
  loc.services = data.services.map((s) => s.id);
  game.state.player.position = { kind: 'docked', locationId: loc.id };
  return { game, loc };
}

const player = (game: Game) => game.state.player;
const flag = (game: Game) => game.state.player.fleet[0]!;

describe('quotes with part units', () => {
  it('a part unit pays its share of the next unit price', () => {
    const e = { stock: 50, target: 100, history: [] };
    const two = quoteBuy(e, 100, 2, data).total;
    const three = quoteBuy(e, 100, 3, data).total;
    expect(quoteBuy(e, 100, 2.5, data).total).toBeCloseTo(two + (three - two) / 2);
    expect(quoteSell(e, 100, 0.5, data).total).toBeCloseTo(quoteSell(e, 100, 1, data).total / 2);
  });
});

describe('market (M3-SVC-04, M3-SVC-05)', () => {
  it('a buy pays the unit-by-unit quote, removes stock, and adds cargo', () => {
    const { game, loc } = setup((l) => (l.market.water?.stock ?? 0) > 100);
    const entry = loc.market.water!;
    const stock = entry.stock;
    const credits = player(game).credits;
    const q = quoteBuy(entry, 10, 10, data);
    const r = buy(game, player(game), loc, 'water', 10);
    expect(r.ok).toBe(true);
    expect(r.units).toBe(10);
    expect(entry.stock).toBeCloseTo(stock - 10);
    expect(player(game).credits).toBeCloseTo(credits - q.total);
    expect(flag(game).cargo.water?.units).toBe(10);
    expect(flag(game).cargo.water?.unitCost).toBeCloseTo(q.average);
  });

  it('a buy is limited by free cargo tonnes, credits, and stock', () => {
    const { game, loc } = setup((l) => (l.market.water?.stock ?? 0) > 100);
    player(game).credits = 1e9;
    const cap = travelStats(flag(game), data).cargoCapacity;
    expect(buyLimit(player(game), loc, 'water', data).limitedBy).toBe('cargo');
    expect(buy(game, player(game), loc, 'water', 1000).units).toBe(cap);
    expect(buy(game, player(game), loc, 'water', 1).ok).toBe(false);

    const g2 = setup((l) => (l.market.water?.stock ?? 0) > 100);
    player(g2.game).credits = 50;
    const lim = buyLimit(player(g2.game), g2.loc, 'water', data);
    expect(lim.limitedBy).toBe('credits');
    const r = buy(g2.game, player(g2.game), g2.loc, 'water', 1000);
    expect(r.units).toBe(lim.byCredits);
    expect(player(g2.game).credits).toBeGreaterThanOrEqual(0);
    expect(player(g2.game).credits).toBeLessThan(buyPrice(g2.loc.market.water!, 10, data) * 1.01);

    const g3 = setup((l) => (l.market.water?.stock ?? 0) > 100);
    player(g3.game).credits = 1e9;
    g3.loc.market.water!.stock = 7.5;
    expect(buyLimit(player(g3.game), g3.loc, 'water', data)).toMatchObject({ units: 7, limitedBy: 'stock' });
  });

  it('a sale pays the unit-by-unit quote and adds stock; it pays a debt first', () => {
    const { game, loc } = setup((l) => l.market.water !== undefined);
    const entry = loc.market.water!;
    flag(game).cargo.water = { units: 12.5, unitCost: 5 };
    player(game).credits = -100;
    const stock = entry.stock;
    const q = quoteSell(entry, 10, 12.5, data);
    const r = sell(game, player(game), loc, 'water', 100);
    expect(r.units).toBeCloseTo(12.5);
    expect(entry.stock).toBeCloseTo(stock + 12.5);
    expect(player(game).credits).toBeCloseTo(-100 + q.total);
    expect(flag(game).cargo.water).toBeUndefined();
    expect(r.text).toMatch(/debt/);
  });

  it('cannot buy or sell a commodity that the location does not trade', () => {
    const { game, loc } = setup((l) => l.market.medicine === undefined);
    expect(buy(game, player(game), loc, 'medicine', 1).ok).toBe(false);
    flag(game).cargo.medicine = { units: 1, unitCost: 1 };
    expect(sell(game, player(game), loc, 'medicine', 1).ok).toBe(false);
  });

  it('cargo goes to the ship with the most thrust first, the flagship last (Section 11.9)', () => {
    const { game } = setup();
    const p = player(game);
    const fast = createShipFromLoadout(data, 'heavy_freighter_trader', 'g', 'Fast');
    const slow = createShipFromLoadout(data, 'light_freighter_trader', 'f', 'Slow');
    p.fleet.push(slow, fast);
    const order = loadingOrder(p, data).map((s) => s.name);
    const tf = travelStats(fast, data).thrust;
    const ts = travelStats(slow, data).thrust;
    expect(order[order.length - 1]).toBe(flag(game).name);
    expect(tf).toBeGreaterThan(ts);
    expect(order[0]).toBe('Fast');
    const first = fast;
    const cap = travelStats(first, data).cargoCapacity;
    const left = addCargo(p, data, 'iron_ore', cap + 5, 15);
    expect(left).toBe(0);
    expect(first.cargo.iron_ore?.units).toBeCloseTo(cap);
    expect(fleetUnits(p, 'iron_ore')).toBeCloseTo(cap + 5);
    expect(flag(game).cargo.iron_ore).toBeUndefined();
  });
});

describe('refuel (M3-SVC-03, Q-02)', () => {
  it('fuel price is the local Hydrogen buy price / fuelPerHydrogen', () => {
    const { loc } = setup((l) => l.market.hydrogen !== undefined);
    expect(fuelUnitPrice(data, loc)).toBeCloseTo(buyPrice(loc.market.hydrogen!, 25, data) / data.balance.fuel.fuelPerHydrogen);
  });

  it('refuel fills all fleet ships and removes Hydrogen from the stock', () => {
    const { game, loc } = setup((l) => (l.market.hydrogen?.stock ?? 0) > 200);
    const p = player(game);
    const second = createShipFromLoadout(data, 'start_shuttle', 's2', 'Two');
    p.fleet.push(second);
    flag(game).fuel = 10;
    second.fuel = 0;
    p.credits = 1e6;
    const entry = loc.market.hydrogen!;
    const stock = entry.stock;
    const fph = data.balance.fuel.fuelPerHydrogen;
    const q = quoteRefuel(game, p, loc);
    expect(q.units).toBeCloseTo(20 + 30);
    const r = refuel(game, p, loc);
    expect(r.ok).toBe(true);
    expect(flag(game).fuel).toBeCloseTo(30);
    expect(second.fuel).toBeCloseTo(30);
    expect(entry.stock).toBeCloseTo(stock - 50 / fph);
    expect(r.cost).toBeCloseTo(quoteBuy({ ...entry, stock }, 25, 50 / fph, data).total);
  });

  it('refuel buys only what the credits pay for', () => {
    const { game, loc } = setup((l) => (l.market.hydrogen?.stock ?? 0) > 200);
    const p = player(game);
    flag(game).fuel = 0;
    p.credits = 30;
    const r = refuel(game, p, loc);
    expect(r.ok).toBe(true);
    expect(p.credits).toBeCloseTo(0, 6);
    expect(flag(game).fuel).toBeGreaterThan(0);
    expect(flag(game).fuel).toBeLessThan(30);
  });
});

describe('mechanic (M3-SVC-06)', () => {
  it('repairs hull, engine value, and armor HP for a price per point', () => {
    const { game, loc } = setup();
    const p = player(game);
    const ship = flag(game);
    const s = travelStats(ship, data);
    ship.hullHp = s.maxHullHp - 10;
    ship.engineValue = s.maxEngineValue - 2;
    const m = data.serviceRules.mechanic;
    const q = quoteRepair(ship, data);
    expect(q.cost).toBeCloseTo(10 * m.hullPerPoint + 2 * m.enginePerPoint);
    const credits = p.credits;
    expect(repair(game, p, loc, 0).ok).toBe(true);
    expect(ship.hullHp).toBe(s.maxHullHp);
    expect(ship.engineValue).toBeCloseTo(s.maxEngineValue);
    expect(p.credits).toBeCloseTo(credits - q.cost);
  });
});

describe('outfitter (M3-SVC-07, M3-SVC-09, M3-SVC-10)', () => {
  it('sells tiers up to the tech level; Pirate Havens sell tiers 1-3 at 130%', () => {
    const { loc } = setup((l) => l.techLevel === 1 && l.bodyType !== 'pirate_haven');
    expect(Math.max(...moduleOffers(loc, data).map((o) => o.tier))).toBe(1);
    const haven = { ...loc, bodyType: 'pirate_haven' };
    expect(maxSaleTier(haven, data)).toBe(3);
    expect(salePriceMult(haven, data)).toBe(1.3);
    const e = moduleOffers(haven, data).find((o) => o.moduleId === 'engine' && o.size === 'S' && o.tier === 1)!;
    expect(e.price).toBeCloseTo(moduleValues(data, { moduleId: 'engine', size: 'S', tier: 1, on: true }).price * 1.3);
  });

  it('buys and installs a module in a free slot; sells it at 60%', () => {
    const { game, loc } = setup();
    const p = player(game);
    const credits = p.credits;
    const engine = { moduleId: 'engine', size: 'S' as const, tier: 1 as const };
    const price = moduleValues(data, { ...engine, on: true }).price * salePriceMult(loc, data);
    const r = buyModule(game, p, loc, 0, 'internal', 3, engine);
    expect(r.ok).toBe(true);
    expect(flag(game).internal[3]?.moduleId).toBe('engine');
    expect(p.credits).toBeCloseTo(credits - price);
    expect(buyModule(game, p, loc, 0, 'internal', 3, engine).text).toMatch(/not empty/);
    const back = moduleSellValue(flag(game).internal[3]!, data);
    expect(back).toBeCloseTo(0.6 * moduleValues(data, { ...engine, on: true }).price);
    expect(sellModule(game, p, loc, 0, 'internal', 3).ok).toBe(true);
    expect(flag(game).internal[3]).toBeNull();
    expect(p.credits).toBeCloseTo(credits - price + back);
  });

  it('cannot buy modules in debt; cannot remove a cargo rack that holds cargo', () => {
    const { game, loc } = setup();
    const p = player(game);
    p.credits = -1;
    expect(buyModule(game, p, loc, 0, 'internal', 3, { moduleId: 'engine', size: 'S', tier: 1 }).text).toMatch(/debt/);
    p.credits = 1000;
    const rack = flag(game).internal.findIndex((m) => m?.moduleId === 'cargo_rack');
    flag(game).cargo.iron_ore = { units: 5, unitCost: 15 };
    expect(sellModule(game, p, loc, 0, 'internal', rack).ok).toBe(false);
  });

  it('removing a fuel tank removes the fuel above the new capacity', () => {
    const { game, loc } = setup();
    const tank = flag(game).internal.findIndex((m) => m?.moduleId === 'fuel_tank');
    expect(sellModule(game, player(game), loc, 0, 'internal', tank).ok).toBe(true);
    expect(flag(game).fuel).toBe(travelStats(flag(game), data).fuelCapacity);
  });
});

describe('shipyard (M3-SVC-08, Q-14)', () => {
  it('trade-in is 60% of the hull price and 60% of each module price', () => {
    const ship = createShipFromLoadout(data, 'start_shuttle', 'x', 'x');
    const modules = [...ship.internal, ...ship.hardpoints].reduce((s, m) => s + (m ? moduleValues(data, m).price : 0), 0);
    expect(tradeInValue(ship, data)).toBeCloseTo(0.6 * (6000 + modules));
  });

  it('buys a hull with an empty loadout; blocked with cargo and in debt', () => {
    const { game, loc } = setup((l) => l.techLevel >= 1);
    const p = player(game);
    expect(hullOffers(loc, data).some((o) => o.hullId === 'light_freighter')).toBe(true);
    expect(hullOffers(loc, data).some((o) => o.hullId === 'battleship')).toBe(false);
    p.credits = 1e6;
    flag(game).cargo.water = { units: 1, unitCost: 1 };
    expect(buyHull(game, p, loc, 0, 'light_freighter').ok).toBe(false);
    delete flag(game).cargo.water;
    p.credits = -5;
    expect(buyHull(game, p, loc, 0, 'light_freighter').text).toMatch(/debt/);
    p.credits = 1e6;
    const tradeIn = tradeInValue(flag(game), data);
    const r = buyHull(game, p, loc, 0, 'light_freighter');
    expect(r.ok).toBe(true);
    expect(p.credits).toBeCloseTo(1e6 - 20000 * salePriceMult(loc, data) + tradeIn);
    expect(flag(game).hullId).toBe('light_freighter');
    expect([...flag(game).internal, ...flag(game).hardpoints].every((m) => m === null)).toBe(true);
    expect(travelStats(flag(game), data).move).toBe(0);
  });

  it('tech level limits the hulls for sale', () => {
    const { loc } = setup((l) => l.techLevel === 1 && l.bodyType !== 'pirate_haven');
    expect(hullOffers(loc, data).every((o) => (data.hullById.get(o.hullId)?.tech ?? 9) <= 1)).toBe(true);
  });
});

describe('wait and Food loss (M3-SVC-13, M3-SVC-14)', () => {
  it('wait passes 1 to 30 whole days and the economy runs', () => {
    const { game, loc } = setup();
    const day = game.state.day;
    const econDays = game.state.world.economy.days;
    expect(wait(game, player(game), loc, 0).ok).toBe(false);
    expect(wait(game, player(game), loc, 31).ok).toBe(false);
    expect(wait(game, player(game), loc, 5).ok).toBe(true);
    expect(game.state.day).toBeCloseTo(day + 5);
    expect(game.state.world.economy.days).toBe(econDays + 5);
  });

  it('Food in cargo loses 1% a day; other goods do not', () => {
    const { game } = setup();
    flag(game).cargo.food = { units: 10, unitCost: 30 };
    flag(game).cargo.water = { units: 10, unitCost: 10 };
    passTime(game, 3);
    expect(flag(game).cargo.food?.units).toBeCloseTo(10 * 0.99 ** 3);
    expect(flag(game).cargo.water?.units).toBe(10);
  });
});
