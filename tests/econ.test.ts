import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Location, MarketEntry } from '../src/core/types';
import { gameData } from '../src/data';
import { capitalFactor, installAndWear, kRef, nominalBatches } from '../src/econ/capital';
import { createEconContext } from '../src/econ/context';
import { economyDay } from '../src/econ/economy';
import { capacityFactor, runCarriers, transitDays, transportCost } from '../src/econ/carriers';
import { priceGradient } from '../src/econ/gradient';
import { inputTrickle, offMapExport, regionBalance } from '../src/econ/offmap';
import { buyPrice, midPrice, priceAt, quoteBuy, quoteSell, sellPrice, stockAtPriceFactor } from '../src/econ/prices';
import { produce, recipeOf } from '../src/econ/recipes';
import { generateWorld } from '../src/world/generator';

const data = gameData();
const e = data.balance.economy;
const value = (items: { commodity: string; qty: number }[]) =>
  items.reduce((s, i) => s + i.qty * (data.commodityById.get(i.commodity)?.basePrice ?? 0), 0);

function producer(id: string, size = 2): Location {
  const r = recipeOf(data, id);
  const loc: Location = {
    id: 0,
    sectorId: 0,
    name: 'Test',
    kind: 'station',
    bodyType: 'industrial_station',
    pos: { x: 0, y: 0 },
    ring: 0,
    size,
    techLevel: 3,
    gravity: 0,
    producer: id,
    production: null,
    population: 0,
    installedMachinery: 0,
    market: {},
    services: [],
  };
  for (const q of [...r.inputs, ...r.outputs]) loc.market[q.commodity] = { stock: 0, target: 100, history: [] };
  loc.market.machinery = { stock: 0, target: 10, history: [] };
  loc.installedMachinery = kRef(loc, r);
  return loc;
}

describe('recipes (Section 9.1, 9.3)', () => {
  it.each(data.recipes.recipes.filter((r) => r.inputs.length > 0).map((r) => [r.producer, r] as const))(
    'value rule: outputs of %s are worth at least 1.3x the inputs',
    (_id, r) => {
      expect(value(r.outputs)).toBeGreaterThanOrEqual(1.3 * value(r.inputs));
    },
  );

  it('output = batches x inputFactor x capitalFactor x securityMult x eventMult', () => {
    const loc = producer('smelter');
    const r = recipeOf(data, 'smelter');
    const batches = nominalBatches(loc, r);
    loc.market.iron_ore!.stock = 1000;
    loc.market.hydrogen!.stock = 1000;
    const res = produce(loc, r, 1.1, 1);
    const cap = capitalFactor(loc.installedMachinery, kRef(loc, r));
    expect(cap).toBeCloseTo(0.9);
    expect(res.inputFactor).toBe(1);
    expect(res.batches).toBeCloseTo(batches * 0.9 * 1.1);
    expect(loc.market.alloys!.stock).toBeCloseTo(batches * 0.9 * 1.1);
    expect(loc.market.iron_ore!.stock).toBeCloseTo(1000 - 2 * batches * 0.9 * 1.1);
  });

  it('inputFactor is the smallest stock / required, at most 1', () => {
    const loc = producer('smelter');
    const r = recipeOf(data, 'smelter');
    const want = nominalBatches(loc, r) * 0.9;
    loc.market.iron_ore!.stock = 2 * want * 0.5; // half of the ore
    loc.market.hydrogen!.stock = 1000;
    const res = produce(loc, r, 1, 1);
    expect(res.inputFactor).toBeCloseTo(0.5);
    expect(res.outputRatio).toBeCloseTo(0.9 * 0.5);
  });

  it('no hard input gives no output', () => {
    const loc = producer('agri_world');
    loc.market.water!.stock = 0;
    expect(produce(loc, recipeOf(data, 'agri_world'), 1, 1).batches).toBe(0);
  });

  it('a producer with no hard inputs has inputFactor 1', () => {
    const res = produce(producer('ice_mine'), recipeOf(data, 'ice_mine'), 1, 1);
    expect(res.inputFactor).toBe(1);
    expect(res.batches).toBeGreaterThan(0);
  });
});

describe('installed machinery (Section 9.5)', () => {
  it('capitalFactor: 0.6 at K = 0, 0.9 at K = K_ref, up to 1.2', () => {
    expect(capitalFactor(0, 10)).toBeCloseTo(0.6);
    expect(capitalFactor(10, 10)).toBeCloseTo(0.9);
    expect(capitalFactor(1e9, 10)).toBeCloseTo(1.2);
  });

  it.each(data.recipes.recipes.map((r) => [r.producer, r] as const))(
    'wear rule: daily wear cost of %s is below 20% of its daily output value',
    (_id, r) => {
      const machinery = data.commodityById.get('machinery')!.basePrice;
      const wearCost = data.recipes.capital.machineryWear * r.machineryPerBatch * machinery;
      expect(wearCost).toBeLessThan(0.2 * value(r.outputs));
    },
  );

  it('installs up to 10% of K_ref a day, until K = 1.5 K_ref, then wears', () => {
    const loc = producer('ore_mine');
    const r = recipeOf(data, 'ore_mine');
    const ref = kRef(loc, r);
    loc.market.machinery!.stock = 100;
    const installed = installAndWear(loc, r, data);
    expect(installed).toBeCloseTo(0.1 * ref);
    expect(loc.installedMachinery).toBeCloseTo(1.1 * ref * (1 - data.recipes.capital.machineryWear));
    for (let i = 0; i < 50; i++) installAndWear(loc, r, data);
    expect(loc.installedMachinery).toBeLessThanOrEqual(1.5 * ref);
    expect(loc.installedMachinery).toBeGreaterThan(1.45 * ref);
  });
});

describe('prices (Section 9.10)', () => {
  it('stockAtPriceFactor is the inverse of the price formula', () => {
    const stock = stockAtPriceFactor(100, 1.5, data);
    expect(priceAt(10, 100, stock, data)).toBeCloseTo(15);
    expect(stockAtPriceFactor(100, e.priceClampMin, data)).toBe(Infinity);
    expect(stockAtPriceFactor(100, e.priceClampMax, data)).toBe(0);
  });

  const entry = (stock: number, target = 100): MarketEntry => ({ stock, target, history: [] });

  it('price = base x clamp((target / max(stock, 1)) ^ k, 0.3, 3.0)', () => {
    expect(priceAt(100, 100, 100, data)).toBeCloseTo(100);
    expect(priceAt(100, 100, 50, data)).toBeCloseTo(100 * 2 ** e.priceExponent);
    expect(priceAt(100, 100, 0, data)).toBeCloseTo(100 * e.priceClampMax);
    expect(priceAt(100, 100, 1e6, data)).toBeCloseTo(100 * e.priceClampMin);
  });

  it('buy and sell prices have the spread', () => {
    const m = entry(100);
    expect(buyPrice(m, 100, data)).toBeCloseTo(midPrice(m, 100, data) * (1 + e.spread / 2));
    expect(sellPrice(m, 100, data)).toBeCloseTo(midPrice(m, 100, data) * (1 - e.spread / 2));
  });

  it('quotes go unit by unit: large trades get worse prices', () => {
    const m = entry(100);
    const one = quoteBuy(m, 100, 1, data);
    const many = quoteBuy(m, 100, 50, data);
    expect(many.average).toBeGreaterThan(one.average);
    expect(quoteSell(m, 100, 50, data).average).toBeLessThan(quoteSell(m, 100, 1, data).average);
    expect(m.stock).toBe(100);
  });
});

describe('background carriers (DECISIONS.md, M2; replaces Section 9.7)', () => {
  const c = e.carriers;

  /** A world where only two locations trade Water: a full source and an empty sink. */
  function twoMarkets(seed: number, jumps: number) {
    const w = generateWorld(seed, data);
    const ctx = createEconContext(w, data);
    const pair = (() => {
      for (const a of w.locations) for (const b of w.locations) {
        if (a.id !== b.id && ctx.sectorJumps[a.sectorId]?.[b.sectorId] === jumps) return [a, b] as const;
      }
      return null;
    })();
    if (!pair) throw new Error('no pair');
    const [src, dst] = pair;
    for (const l of w.locations) delete l.market.water;
    src.market.water = { stock: 2000, target: 1000, history: [] };
    dst.market.water = { stock: 0, target: 1000, history: [] };
    // Only these two markets take part, so other commodities do not use the capacity.
    ctx.traders.clear();
    ctx.traders.set('water', [src.id, dst.id]);
    w.economy.shipments = [];
    return { w, ctx, src, dst };
  }
  const levels = (w: { sectors: unknown[] }, level = 4) => w.sectors.map(() => level);

  it('capacity: 0.2 of sectorCapacityTonnes when Lawless, 1.0 when Secure', () => {
    const ctx = createEconContext(generateWorld(3, data), data);
    expect(capacityFactor(0, ctx)).toBeCloseTo(0.2);
    expect(capacityFactor(4, ctx)).toBeCloseTo(1.0);
  });

  it('transport cost and transit days grow with jumps', () => {
    const ctx = createEconContext(generateWorld(3, data), data);
    expect(transportCost(1, 2, 0, ctx)).toBeCloseTo(c.costPerTonne + 2 * c.costPerTonneJump);
    expect(transportCost(0.2, 0, 400, ctx)).toBeCloseTo(0.2 * c.costPerTonne);
    expect(transportCost(0.2, 2, 400, ctx)).toBeCloseTo(0.2 * (c.costPerTonne + 2 * c.costPerTonneJump) + 400 * 2 * c.riskPerJump);
    expect(transitDays(3, ctx)).toBe(c.transitDays + 3 * c.transitDaysPerJump);
  });

  it('moves goods from a cheap source to a dear sink; they arrive after the transit days', () => {
    const { w, ctx, src, dst } = twoMarkets(3, 1);
    runCarriers(ctx, w.economy, levels(w));
    const sent = 2000 - src.market.water!.stock;
    expect(sent).toBeGreaterThan(0);
    // dailyShare of min(surplus above half target, room up to the break-even stock at the sink).
    const buy = buyPrice({ stock: 2000, target: 1000, history: [] }, 10, data);
    const breakEven = (buy * (1 + c.minMargin) + transportCost(1, 1, buy, ctx)) / (1 - e.spread / 2) / 10;
    // The sink's use during the transit days adds room.
    const room = stockAtPriceFactor(1000, breakEven, data) + (ctx.dailyNeed.get(`${dst.id}:water`) ?? 0) * transitDays(1, ctx);
    expect(sent).toBeCloseTo(c.dailyShare * Math.min(2000 - e.surplusShareOfTarget * 1000, room));
    expect(dst.market.water!.stock).toBe(0);
    const arrive = w.economy.shipments[0]!.arriveDay;
    expect(arrive).toBe(w.economy.days + transitDays(1, ctx));
    w.economy.days = arrive;
    runCarriers(ctx, w.economy, levels(w));
    expect(dst.market.water!.stock).toBeCloseTo(sent);
  });

  it('counts goods in transit, so it does not send too much', () => {
    const { w, ctx, src } = twoMarkets(3, 1);
    for (let i = 0; i < 5; i++) runCarriers(ctx, w.economy, levels(w));
    const sent = 2000 - src.market.water!.stock;
    // Never more than the export limit of the sink (exportStockRatio x target).
    expect(sent).toBeLessThanOrEqual(e.exportStockRatio * 1000 + 1e-6);
    expect(sent).toBeLessThan(1000);
  });

  it('no route beyond maxJumps', () => {
    const w = generateWorld(3, data);
    const ctx = createEconContext(w, data);
    const far = Math.max(...ctx.sectorJumps.flat());
    if (far <= c.maxJumps) return;
    const { w: w2, ctx: ctx2, src } = twoMarkets(3, c.maxJumps + 1);
    runCarriers(ctx2, w2.economy, levels(w2));
    expect(src.market.water!.stock).toBe(2000);
  });

  it('no route if the margin after transport cost is below minMargin', () => {
    const { w, ctx, src, dst } = twoMarkets(3, 1);
    // Both near target: almost no price gap.
    src.market.water!.stock = 1100;
    dst.market.water!.stock = 950;
    runCarriers(ctx, w.economy, levels(w));
    expect(src.market.water!.stock).toBe(1100);
  });

  it('low security limits the tonnes per day', () => {
    const { w, ctx, src } = twoMarkets(3, 1);
    src.market.water!.stock = 1e6;
    w.locations.find((l) => l.market.water && l.id !== src.id)!.market.water!.target = 1e6;
    runCarriers(ctx, w.economy, levels(w, 0));
    const sent = 1e6 - src.market.water!.stock;
    expect(sent).toBeCloseTo(c.sectorCapacityTonnes * capacityFactor(0, ctx));
  });
});

describe('off-map rules (Section 9.8)', () => {
  it('each producer gets a share of its hard inputs each day', () => {
    const w = generateWorld(5, data);
    const ctx = createEconContext(w, data);
    const smelter = ctx.producers.find((l) => l.producer === 'smelter')!;
    const before = smelter.market.iron_ore!.stock;
    inputTrickle(ctx);
    const need = 2 * nominalBatches(smelter, recipeOf(data, 'smelter'));
    expect(smelter.market.iron_ore!.stock - before).toBeCloseTo(e.offMapInputShare * need);
  });

  it('region balance starts after a full window out of range, and stops inside the stop limits', () => {
    const w = generateWorld(5, data);
    const ctx = createEconContext(w, data);
    const econ = w.economy;
    econ.region.water = { supply: [], demand: [], outOfRangeDays: 0, balancing: null };
    for (let d = 0; d < e.balanceWindowDays; d++) regionBalance(ctx, econ, new Map([['water', 50]]), new Map([['water', 100]]));
    expect(econ.region.water.balancing).toBe('add');
    for (let d = 0; d < e.balanceWindowDays; d++) regionBalance(ctx, econ, new Map([['water', 100]]), new Map([['water', 100]]));
    expect(econ.region.water.balancing).toBeNull();
  });

  it('off-map export removes a share of stock above the export limit (DECISIONS.md)', () => {
    const w = generateWorld(5, data);
    const ctx = createEconContext(w, data);
    const loc = w.locations.find((l) => l.market.water)!;
    const m = loc.market.water!;
    m.stock = m.target * (e.exportStockRatio + 1);
    offMapExport(ctx);
    expect(m.stock).toBeCloseTo(m.target * (e.exportStockRatio + 1 - e.exportShare));
  });
});

describe('economy runs (Section 9.6)', () => {
  it('no stock goes below 0 in 200 days', () => {
    const w = generateWorld(7, data);
    const ctx = createEconContext(w, data);
    const rng = Rng.fromSeed(7, 'economy');
    for (let d = 0; d < 200; d++) {
      economyDay(ctx, w.economy, rng);
      for (const l of w.locations) for (const m of Object.values(l.market)) expect(m.stock).toBeGreaterThanOrEqual(0);
    }
  });

  it('the same seed gives the same prices on day 200', () => {
    const run = () => {
      const w = generateWorld(11, data);
      const ctx = createEconContext(w, data);
      const rng = Rng.fromSeed(11, 'economy');
      for (let d = 0; d < 200; d++) economyDay(ctx, w.economy, rng);
      return w.locations.map((l) => Object.values(l.market).map((m) => m.history.at(-1)));
    };
    expect(run()).toEqual(run());
  });

  it('each market keeps its recent prices for trend arrows', () => {
    const w = generateWorld(13, data);
    for (const l of w.locations) for (const m of Object.values(l.market)) expect(m.history.length).toBe(e.historyDays);
  });
});

describe('price gradient (Section 9.13, Q-34)', () => {
  const samples = (entries: [string, number[]][]) => new Map(entries);

  it('compares each advanced commodity only where Core and Frontier both trade it', () => {
    const g = priceGradient(
      samples([
        ['iron_ore:core', [1.2]],
        ['iron_ore:frontier', [0.9]],
        ['machinery:core', [1.0]],
        ['machinery:frontier', [1.5]],
        // Electronics only in the Core: not compared, so its high price does not count.
        ['electronics:core', [3.0, 3.0, 3.0]],
      ]),
      data,
    );
    expect(g.advancedCompared).toEqual(['machinery']);
    expect(g.advancedRatio).toBeCloseTo(1 / 1.5);
    expect(g.pass).toBe(true);
  });

  it('fails when raw goods are cheaper in the Core or advanced goods dearer', () => {
    const g = priceGradient(
      samples([
        ['water:core', [0.8]],
        ['water:frontier', [1.0]],
        ['machinery:core', [2.0]],
        ['machinery:frontier', [1.0]],
      ]),
      data,
    );
    expect(g.pass).toBe(false);
    expect(g.problems).toHaveLength(2);
  });
});
