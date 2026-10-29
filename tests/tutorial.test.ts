import { afterEach, describe, expect, it } from 'vitest';
import { followPath, pathBetween } from '../src/actor/paths';
import type { Game } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import { markTipSeen, setTutorialOn, setTutorialPlan } from '../src/core/tutorial';
import type { GameEvent } from '../src/core/eventBus';
import type { Location } from '../src/core/types';
import { gameData } from '../src/data';
import { buy, sell } from '../src/services/market';
import { loadSettings, saveSettings } from '../src/ui/settings';
import { firstTradePlan, goalLine, nextTip, tipLines, wrap } from '../src/ui/tutorial';

const data = gameData();
const SEEDS = [1, 7, 11, 23, 42];

function withPlan(seed: number): Game {
  const g = createGame(seed, data, { tutorial: true });
  setTutorialPlan(g.state, firstTradePlan(g));
  return g;
}

/** Buy at the plan's start, travel, and sell at its end (the start location must be the plan's start). */
function doFirstTrade(g: Game, plan = g.state.tutorial.plan): void {
  if (!plan) throw new Error('no plan');
  const loc = (id: number) => g.state.world.locations[id] as Location;
  const start = g.state.player.position;
  if (start.kind !== 'docked') throw new Error('not docked');
  if (start.locationId !== plan.fromId) {
    const p = pathBetween(g.state.world, data, loc(start.locationId), loc(plan.fromId));
    if (!p) throw new Error('no path');
    followPath(g, g.state.player, p);
  }
  buy(g, g.state.player, loc(plan.fromId), plan.commodity, plan.units);
  const path = pathBetween(g.state.world, data, loc(plan.fromId), loc(plan.toId));
  if (!path) throw new Error('no path');
  followPath(g, g.state.player, path);
  sell(g, g.state.player, loc(plan.toId), plan.commodity, 1e9);
}

describe('tutorial (Q-48)', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('a new game has the tutorial OFF unless the setting asks for it', () => {
    expect(createGame(1, data).state.tutorial).toEqual({ on: false, seen: [], plan: null });
    expect(createGame(1, data, { tutorial: true }).state.tutorial.on).toBe(true);
  });

  it('tips show in data order, one time each, and none when the tutorial is OFF', () => {
    const g = createGame(1, data, { tutorial: true });
    expect(nextTip(g, 'sectorMap')?.id).toBe('welcome');
    markTipSeen(g.state, 'welcome');
    expect(nextTip(g, 'sectorMap')?.id).toBe('firstTrade');
    markTipSeen(g.state, 'firstTrade');
    expect(nextTip(g, 'sectorMap')).toBeNull();
    expect(nextTip(g, 'market')?.id).toBe('market');
    setTutorialOn(g.state, false);
    expect(nextTip(g, 'market')).toBeNull();
  });

  it('each trigger has a tip, and tip ids are unique', () => {
    const triggers = new Set(data.tutorial.tips.map((t) => t.trigger));
    for (const t of ['sectorMap', 'location', 'market', 'bought', 'regionMap', 'sold', 'hail', 'combat', 'defeat']) expect(triggers.has(t as never)).toBe(true);
    const ids = data.tutorial.tips.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the first-trade plan is a profitable best route near the start, and it does not change the game state', () => {
    for (const seed of SEEDS) {
      const g = createGame(seed, data, { tutorial: true });
      const before = structuredClone(g.state);
      const plan = firstTradePlan(g);
      expect(g.state).toEqual(before);
      expect(plan).not.toBeNull();
      expect(plan!.profit).toBeGreaterThan(0);
      expect(plan!.sell).toBeGreaterThan(plan!.buy);
      expect(plan!.units).toBeGreaterThan(0);
    }
  });

  it('tip text: all fields are filled, and each line fits in the tip box (60 characters)', () => {
    for (const seed of SEEDS) {
      const g = withPlan(seed);
      for (const tip of data.tutorial.tips) {
        for (const line of tipLines(g, tip, { profitSold: 12345 })) {
          expect(line).not.toMatch(/\{\w+\}/);
          expect(line.length).toBeLessThanOrEqual(60);
        }
      }
    }
    const g = createGame(1, data, { tutorial: true });
    const tip = data.tutorial.tips.find((t) => t.id === 'firstTrade')!;
    expect(tipLines(g, tip)).toEqual(tip.noPlanLines);
  });

  it('goal line: buy, then sell, then no goal after the first sale', () => {
    const g = withPlan(11);
    const plan = g.state.tutorial.plan!;
    const name = data.commodityById.get(plan.commodity)!.name;
    expect(goalLine(g)).toMatch(new RegExp(`^Buy ${name} at `));
    const loc = g.state.world.locations[plan.fromId] as Location;
    if (g.state.player.position.kind === 'docked' && g.state.player.position.locationId === plan.fromId) {
      buy(g, g.state.player, loc, plan.commodity, 1);
      expect(goalLine(g)).toMatch(new RegExp(`^Sell ${name} at `));
    }
    markTipSeen(g.state, 'sold');
    expect(goalLine(g)).toBeNull();
    setTutorialOn(g.state, false);
    expect(goalLine(g)).toBeNull();
  });

  it('market events: a buy and a sell with the profit', () => {
    const g = withPlan(11);
    const plan = g.state.tutorial.plan!;
    const events: GameEvent[] = [];
    g.bus.on((e) => events.push(e));
    doFirstTrade(g);
    const traded = events.filter((e) => e.type === 'traded');
    expect(traded[0]).toMatchObject({ side: 'buy', commodity: plan.commodity, profit: 0 });
    const sale = traded.find((e) => e.type === 'traded' && e.side === 'sell');
    expect(sale).toBeDefined();
    const bought = traded[0];
    // Profit = sale value less the purchase cost of the units sold (some food can spoil on the way).
    if (sale?.type === 'traded' && bought?.type === 'traded') expect(sale.profit).toBeCloseTo(sale.total - sale.units * (bought.total / bought.units), 6);
  });

  it('the same seed and the same actions give the same game state with the tutorial ON and OFF', () => {
    for (const seed of [11, 42]) {
      const on = withPlan(seed);
      const off = createGame(seed, data);
      const plan = on.state.tutorial.plan!;
      markTipSeen(on.state, 'welcome');
      doFirstTrade(on, plan);
      doFirstTrade(off, plan);
      expect({ ...on.state, tutorial: null }).toEqual({ ...off.state, tutorial: null });
    }
  });

  it('settings: default ON with no storage; a saved value comes back; bad storage gives the default', () => {
    expect(loadSettings()).toEqual({ tutorial: true });
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    saveSettings({ tutorial: false });
    expect(loadSettings()).toEqual({ tutorial: false });
    store.set('spacesim.settings', 'not json');
    expect(loadSettings()).toEqual({ tutorial: true });
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSettings()).toEqual({ tutorial: true });
    expect(() => saveSettings({ tutorial: false })).not.toThrow();
  });

  it('wrap breaks text at spaces', () => {
    expect(wrap('Sell Food at Kestrel Station (KS-2).', 20)).toEqual(['Sell Food at Kestrel', 'Station (KS-2).']);
  });
});
