import { describe, expect, it } from 'vitest';
import type { World } from '../src/core/types';
import { gameData } from '../src/data';
import { tradesAll } from '../src/econ/markets';
import { hasResidentPopulation, populationFor } from '../src/econ/population';
import { recipeOf } from '../src/econ/recipes';
import { computeBlueprint } from '../src/world/blueprint';
import { ensurePlanetHosts, supplyAtFloor } from '../src/world/assign';
import type { Blueprint } from '../src/world/blueprint';
import { generateWorld, generateWorldWithLog } from '../src/world/generator';
import { Rng } from '../src/core/rng';
import { hasService } from '../src/world/placeServices';

const data = gameData();
const g = data.balance.generator;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const worlds: [number, World][] = SEEDS.map((s) => [s, generateWorld(s, data)]);

describe('generator steps 4-9: determinism (M2-GEN-19)', () => {
  it('the same seed gives the same world after repairs and retries', () => {
    expect(generateWorld(17, data)).toEqual(generateWorld(17, data));
  });

  it('the log records tries, repairs, and rule results (M2-GEN-17)', () => {
    const { world, attempts } = generateWorldWithLog(17, data);
    expect(world.generator.tries).toBe(attempts.length);
    expect(attempts.at(-1)?.pass).toBe(true);
    expect(Object.values(world.generator.rules).every(Boolean)).toBe(true);
  });
});

describe('blueprint (M2-GEN-01 to M2-GEN-04)', () => {
  it('counts are at least the minimum for each producer type', () => {
    const bp = computeBlueprint(worlds[0]![1], data);
    for (const r of data.recipes.recipes) expect(bp.counts[r.producer]).toBeGreaterThanOrEqual(g.minProducersPerType);
  });

  it('count = ceil(batches / (batchesPerSize x average size)), at least the minimum', () => {
    const bp = computeBlueprint(worlds[0]![1], data);
    for (const r of data.recipes.recipes) {
      const expected = Math.max(g.minProducersPerType, Math.ceil((bp.batches[r.producer] ?? 0) / (r.batchesPerSize * g.averageSize)));
      expect(bp.counts[r.producer]).toBe(expected);
    }
  });
});

describe('host planets and supply floor (DECISIONS.md, M2)', () => {
  it('changes donor planets to Gas Giants when the blueprint needs more hosts', () => {
    const w = structuredClone(worlds[0]![1]);
    for (const l of w.locations) {
      l.producer = null;
      if (l.bodyType === 'gas_giant') l.bodyType = 'ice';
    }
    const blueprint = { counts: { gas_skimmer: 3 } } as unknown as Blueprint;
    const changes = ensurePlanetHosts(w, blueprint, Rng.fromSeed(1, 'world'), data);
    expect(changes.length).toBe(3);
    expect(w.locations.filter((l) => l.bodyType === 'gas_giant').length).toBe(3);
    for (const l of w.locations.filter((x) => x.bodyType === 'gas_giant')) expect(l.gravity).toBe(0);
  });

  it('the floor exemption needs main makers at minimum size and minimum count', () => {
    const w = structuredClone(worlds[0]![1]);
    const mines = w.locations.filter((l) => l.producer === 'ore_mine');
    for (const l of mines) l.size = g.sizeMin;
    expect(supplyAtFloor(w, data, 'iron_ore')).toBe(mines.length <= g.minProducersPerType);
    mines[0]!.size = g.sizeMin + 1;
    expect(supplyAtFloor(w, data, 'iron_ore')).toBe(false);
  });
});

describe.each(worlds)('world rules, seed %i', (_seed, w) => {
  it('all validation rules pass (Section 6.10)', () => {
    expect(Object.entries(w.generator.rules).filter(([, pass]) => !pass)).toEqual([]);
  });

  it('producers stand only on bodies and development levels that may host them (Section 7.2)', () => {
    for (const l of w.locations) {
      if (!l.producer) continue;
      const p = data.producerTypes.find((t) => t.id === l.producer)!;
      expect(p.hosts).toContain(l.bodyType);
      expect(p.development).toContain(w.sectors[l.sectorId]!.development);
    }
  });

  it('each producer type has at least the minimum count', () => {
    for (const r of data.recipes.recipes) {
      expect(w.locations.filter((l) => l.producer === r.producer).length).toBeGreaterThanOrEqual(g.minProducersPerType);
    }
  });

  it('each commodity has producers in at least 2 sectors', () => {
    for (const c of data.commodities) {
      const sectors = new Set(
        w.locations.filter((l) => l.producer && recipeOf(data, l.producer).outputs.some((o) => o.commodity === c.id)).map((l) => l.sectorId),
      );
      expect(sectors.size, c.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('Rare Element Mines are only in Frontier sectors; at least 2 Frontier sectors (Q-07)', () => {
    for (const l of w.locations.filter((x) => x.producer === 'rare_element_mine')) {
      expect(w.sectors[l.sectorId]!.development).toBe('frontier');
    }
    expect(w.sectors.filter((s) => s.development === 'frontier').length).toBeGreaterThanOrEqual(g.minFrontierSectors);
  });

  it('station placement: outposts in baseline 50+, havens in baseline 30 or less, Trade Hubs not Frontier', () => {
    for (const l of w.locations) {
      const s = w.sectors[l.sectorId]!;
      if (l.bodyType === 'military_outpost') expect(s.securityBaseline).toBeGreaterThanOrEqual(50);
      if (l.bodyType === 'pirate_haven') expect(s.securityBaseline).toBeLessThanOrEqual(30);
      if (l.bodyType === 'trade_hub') expect(s.development).not.toBe('frontier');
      if (l.kind === 'station') expect(l.bodyType).not.toBe('station_slot');
    }
  });

  it('services: 2+ shipyards (one tech 3), 3+ outfitters, 2+ Merchants Guilds, 2+ Bounty Guilds', () => {
    const count = (id: string) => w.locations.filter((l) => hasService(l, id)).length;
    expect(count('shipyard')).toBeGreaterThanOrEqual(2);
    expect(w.locations.some((l) => hasService(l, 'shipyard') && l.techLevel >= 3)).toBe(true);
    expect(count('outfitter')).toBeGreaterThanOrEqual(3);
    expect(count('merchants_guild')).toBeGreaterThanOrEqual(2);
    expect(count('bounty_guild')).toBeGreaterThanOrEqual(2);
    for (const l of w.locations) {
      expect(l.services).toContain('refuel');
      expect(l.services).toContain('market');
    }
  });

  it('the start location is in the core sector, with an Outfitter and a Merchants Guild', () => {
    const start = w.locations[w.startLocationId]!;
    expect(start.sectorId).toBe(w.coreSectorId);
    expect(hasService(start, 'outfitter')).toBe(true);
    expect(hasService(start, 'merchants_guild')).toBe(true);
  });

  it('markets: Trade Hubs trade all 12 commodities, Hydrogen everywhere (Q-03)', () => {
    for (const l of w.locations) {
      if (tradesAll(l, data)) expect(Object.keys(l.market).length).toBe(12);
      expect(l.market.hydrogen).toBeDefined();
    }
  });

  it('sizes are 1 to 3; population follows body type and size (Section 9.4)', () => {
    for (const l of w.locations) {
      expect(l.size).toBeGreaterThanOrEqual(g.sizeMin);
      expect(l.size).toBeLessThanOrEqual(g.sizeMax);
      expect(l.population).toBe(populationFor(l.bodyType, l.size, data));
      if (hasResidentPopulation(l.bodyType)) expect(l.population).toBeGreaterThan(data.population.unitsPerSize.crew * l.size);
    }
  });

  it('relay commodities are in the market with a stock of relayTargetDays of their flow', () => {
    for (const l of w.locations) {
      for (const [c, daily] of Object.entries(l.relays)) {
        const m = l.market[c];
        expect(m, `${l.name} ${c}`).toBeDefined();
        expect(m!.target).toBeGreaterThanOrEqual(daily * data.balance.economy.relayTargetDays - 1e-9);
      }
    }
  });

  it('targets are at least the minimum target stock (Q-05)', () => {
    for (const l of w.locations) {
      for (const [c, m] of Object.entries(l.market)) expect(m.target).toBeGreaterThanOrEqual(data.balance.economy.minTargetStock[c]!);
    }
  });
});
