import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Location, MarketEntry } from '../src/core/types';
import { gameData } from '../src/data';
import { capitalFactor, installAndWear, kRef, nominalBatches } from '../src/econ/capital';
import { createEconContext } from '../src/econ/context';
import { economyDay } from '../src/econ/economy';
import { pairFlow, securityFactor } from '../src/econ/flow';
import { priceGradient } from '../src/econ/gradient';
import { inputTrickle, offMapExport, regionBalance } from '../src/econ/offmap';
import { buyPrice, midPrice, priceAt, quoteBuy, quoteSell, sellPrice } from '../src/econ/prices';
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
    relays: {},
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

describe('background flow (Section 9.7)', () => {
  it('securityFactor: 0.2 Lawless, 1.0 Secure, uses the lower level', () => {
    const ctx = createEconContext(generateWorld(3, data), data);
    expect(securityFactor(0, 4, ctx)).toBeCloseTo(0.2);
    expect(securityFactor(4, 4, ctx)).toBeCloseTo(1.0);
    expect(securityFactor(2, 3, ctx)).toBeCloseTo(0.6);
  });

  it('flow = min(κ x surplus x gap x security, share x deficit)', () => {
    expect(pairFlow(0.05, 100, 1000, 10, 20, 1, 0.1)).toBeCloseTo(0.05 * 100 * 0.5);
    expect(pairFlow(0.05, 10000, 10, 10, 20, 1, 0.1)).toBeCloseTo(1);
  });

  it('no flow when the destination price is not higher', () => {
    expect(pairFlow(0.05, 100, 100, 20, 20, 1, 0.1)).toBe(0);
    expect(pairFlow(0.05, 100, 100, 20, 10, 1, 0.1)).toBe(0);
  });

  it('κ is 0 for sectors more than one lane apart', () => {
    const w = generateWorld(3, data);
    const ctx = createEconContext(w, data);
    for (const pairs of ctx.pairs.values()) {
      for (const p of pairs) {
        const a = w.locations[p.a]!.sectorId;
        const b = w.locations[p.b]!.sectorId;
        const lane = w.lanes.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
        expect(a === b || lane).toBe(true);
      }
    }
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
