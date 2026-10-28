import { describe, expect, it } from 'vitest';
import { chainAlerts, emptyKnowledge, hasLivePrices, knowsLocation, observe, priceView, sectorsWithin } from '../src/actor/knowledge';
import { estimatePath, fleetWithCargo, pathBetween } from '../src/actor/paths';
import { routeValue } from '../src/actor/routes';
import { type Game, passTime, wrapGame } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import type { Location } from '../src/core/types';
import { gameData } from '../src/data';
import { buyPrice, sellPrice } from '../src/econ/prices';
import { recipeOf } from '../src/econ/recipes';
import { locationCode } from '../src/world/codes';

const data = gameData();
const template = createGame(11, data).state;

function fresh(): Game {
  return wrapGame(structuredClone(template), data);
}

function dockAt(game: Game, loc: Location): void {
  game.state.player.position = { kind: 'docked', locationId: loc.id };
  observe(game, game.state.player);
}

const locs = (game: Game) => game.state.world.locations;
const noGuild = (l: Location) => !l.services.includes('merchants_guild');

describe('map knowledge (M3-INFO-03, M3-INFO-04)', () => {
  it('the player knows the start sector at the start, and a sector after a visit', () => {
    const game = fresh();
    const p = game.state.player;
    const start = locs(game)[game.state.world.startLocationId]!;
    expect(p.knowledge.knownSectors).toContain(start.sectorId);
    // Forget the Guild information of the start, then visit a sector with no Guild.
    p.knowledge = emptyKnowledge();
    const far = locs(game).find((l) => !p.knowledge.knownSectors.includes(l.sectorId) && noGuild(l))!;
    expect(knowsLocation(p, far)).toBe(false);
    dockAt(game, far);
    expect(knowsLocation(p, far)).toBe(true);
  });

  it('a Merchants\' Guild gives the locations of all sectors within 2 jumps', () => {
    const game = fresh();
    const p = game.state.player;
    p.knowledge.knownSectors = [];
    const guild = locs(game).find((l) => l.services.includes('merchants_guild'))!;
    dockAt(game, guild);
    const range = sectorsWithin(game.state.world, data, guild.sectorId, 2);
    expect(range.length).toBeGreaterThan(1);
    for (const s of range) expect(p.knowledge.knownSectors).toContain(s);
  });
});

describe('price information (M3-INFO-01, M3-INFO-02, M3-SVC-11)', () => {
  it('docked: live; after leaving: the last known price with its day; never seen: unknown', () => {
    const game = fresh();
    const p = game.state.player;
    p.knowledge = emptyKnowledge();
    const a = locs(game).find((l) => noGuild(l) && l.market.water)!;
    const b = locs(game).find((l) => noGuild(l) && l.id !== a.id && l.sectorId !== a.sectorId && l.market.water && !p.knowledge.markets[l.id])!;
    p.position = { kind: 'space', sectorId: a.sectorId, x: 0, y: 0 };
    expect(priceView(game, p, b, 'water').source).toBe('unknown');
    dockAt(game, a);
    const live = priceView(game, p, a, 'water');
    expect(live.source).toBe('live');
    expect(live.buy).toBeCloseTo(buyPrice(a.market.water!, 10, data));
    const day = game.state.day;
    dockAt(game, b);
    passTime(game, 5);
    a.market.water!.stock *= 0.5;
    const known = priceView(game, p, a, 'water');
    expect(known.source).toBe('known');
    expect(known.day).toBeCloseTo(day);
    expect(known.buy).not.toBeCloseTo(buyPrice(a.market.water!, 10, data));
  });

  it('a Guild gives live prices within 2 jumps, with a trend arrow, and not farther', () => {
    const game = fresh();
    const p = game.state.player;
    const guild = locs(game).find((l) => l.services.includes('merchants_guild'))!;
    passTime(game, 20);
    dockAt(game, guild);
    const range = new Set(sectorsWithin(game.state.world, data, guild.sectorId, 2));
    const inside = locs(game).find((l) => range.has(l.sectorId) && l.id !== guild.id && l.market.food)!;
    const outside = locs(game).find((l) => !range.has(l.sectorId));
    expect(hasLivePrices(game, p, inside)).toBe(true);
    const v = priceView(game, p, inside, 'food');
    expect(v.source).toBe('live');
    expect(v.sell).toBeCloseTo(sellPrice(inside.market.food!, 30, data));
    expect(['up', 'down', 'flat']).toContain(v.trend);
    if (outside) expect(hasLivePrices(game, p, outside)).toBe(false);
  });

  it('chain alerts show a producer with low output and its cause', () => {
    const game = fresh();
    const loc = locs(game).find((l) => l.producer !== null && recipeOf(data, l.producer).inputs.length > 0)!;
    const input = recipeOf(data, loc.producer!).inputs[0]!.commodity;
    loc.production = { outputRatio: 0.4, inputFactor: 0, capitalFactor: 1 };
    loc.market[input]!.stock = 0;
    const alerts = chainAlerts(game.state.world, data, [loc.sectorId]);
    const name = data.commodityById.get(input)!.name;
    const code = locationCode(game.state.world, loc, data);
    expect(alerts.map((a) => a.text)).toContain(`${code} ${loc.name} ${loc.producer!.replace(/_/g, ' ')}: no ${name}, output 40%`);
  });
});

describe('route planner (M3-UI-09, M3-UI-13)', () => {
  function routeSetup() {
    const game = fresh();
    const p = game.state.player;
    const sector = game.state.world.sectors.find((s) => s.locationIds.filter((id) => locs(game)[id]!.market.water).length >= 2)!;
    const [a, b] = sector.locationIds.map((id) => locs(game)[id]!).filter((l) => l.market.water);
    dockAt(game, a!);
    p.knowledge.markets[b!.id] = { day: 0, prices: { water: { stock: 10, target: 1000, trend: null } } };
    a!.market.water!.stock = 1e6;
    a!.market.water!.target = 1e6;
    return { game, p, a: a!, b: b! };
  }

  it('profit per day = (profit - fuel cost) / trip days; cargo-limited with credits', () => {
    const { game, p, a, b } = routeSetup();
    p.credits = 1e6;
    const r = routeValue(game, p, a, b, 'water')!;
    expect(r).not.toBeNull();
    expect(r.limitedBy).toBe('cargo');
    expect(r.units).toBe(30);
    const path = pathBetween(game.state.world, data, a, b)!;
    const est = estimatePath(path, fleetWithCargo(p, data, 'water', 30), data);
    expect(r.days).toBeCloseTo(est.days);
    expect(r.profitPerDay).toBeCloseTo((r.profit - r.fuelCost) / r.days);
    expect(r.profit).toBeCloseTo(r.saleValue - r.buyCost);
  });

  it('capital-limited when credits do not fill the hold', () => {
    const { game, p, a, b } = routeSetup();
    p.credits = 100;
    const r = routeValue(game, p, a, b, 'water')!;
    expect(r.limitedBy).toBe('capital');
    expect(r.units).toBeLessThan(30);
    expect(r.buyCost).toBeLessThanOrEqual(100);
  });

  it('a path across sectors has a jump for each lane, and ends at the destination', () => {
    const game = fresh();
    const w = game.state.world;
    const a = w.locations[0]!;
    const b = w.locations.find((l) => l.sectorId !== a.sectorId)!;
    const path = pathBetween(w, data, a, b)!;
    expect(path.jumps).toBeGreaterThan(0);
    expect(path.steps.filter((s) => s.kind === 'jump').length).toBe(path.jumps);
    expect(path.steps[path.steps.length - 1]).toEqual({ kind: 'go', dest: { kind: 'location', locationId: b.id } });
  });
});
