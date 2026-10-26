import { describe, expect, it } from 'vitest';
import type { World } from '../src/core/types';
import { gameData } from '../src/data';
import { generateWorld } from '../src/world/generator';
import { mapDistance, segmentsCross } from '../src/world/geometry';
import { securityLevel } from '../src/world/security';
import { jumpDistances } from '../src/world/topology';

const data = gameData();
const b = data.balance;
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);
const worlds: [number, World][] = SEEDS.map((s) => [s, generateWorld(s, data)]);

function laneCount(w: World, id: number): number {
  return w.lanes.filter((l) => l.a === id || l.b === id).length;
}

describe('generator determinism (M1-GEN-14)', () => {
  it('the same seed gives a deep-equal world', () => {
    expect(generateWorld(1234, data)).toEqual(generateWorld(1234, data));
  });

  it('different seeds give different worlds', () => {
    const a = generateWorld(1, data);
    const c = generateWorld(2, data);
    expect(a.sectors.map((s) => s.pos)).not.toEqual(c.sectors.map((s) => s.pos));
  });
});

describe.each(worlds)('generator rules, seed %i', (_seed, w) => {
  it('step 1: sector count, area, and minimum distance (M1-GEN-01)', () => {
    expect(w.sectors).toHaveLength(b.world.sectorCount);
    expect(w.sectors.length).toBeGreaterThanOrEqual(b.world.sectorCountMin);
    expect(w.sectors.length).toBeLessThanOrEqual(b.world.sectorCountMax);
    for (const s of w.sectors) {
      expect(s.pos.x).toBeGreaterThanOrEqual(0);
      expect(s.pos.x).toBeLessThan(b.world.regionWidth);
      expect(s.pos.y).toBeGreaterThanOrEqual(0);
      expect(s.pos.y).toBeLessThan(b.world.regionHeight);
      for (const t of w.sectors) {
        if (t.id !== s.id) expect(mapDistance(s.pos, t.pos, b.world.cellAspect)).toBeGreaterThanOrEqual(b.world.minSectorDistance);
      }
    }
  });

  it('step 1: all sectors are connected (M1-GEN-02)', () => {
    const jumps = jumpDistances(w.sectors.length, w.lanes.map((l) => [l.a, l.b]), 0);
    expect(jumps.every(Number.isFinite)).toBe(true);
  });

  it('step 1: each sector has 1 to 4 lanes and no lanes cross (M1-GEN-03, M1-GEN-04)', () => {
    for (const s of w.sectors) {
      expect(laneCount(w, s.id)).toBeGreaterThanOrEqual(b.world.minLanesPerSector);
      expect(laneCount(w, s.id)).toBeLessThanOrEqual(b.world.maxLanesPerSector);
    }
    for (const l1 of w.lanes) {
      for (const l2 of w.lanes) {
        if (l1.id >= l2.id) continue;
        const p = w.sectors[l1.a]!.pos;
        const q = w.sectors[l1.b]!.pos;
        const r = w.sectors[l2.a]!.pos;
        const t = w.sectors[l2.b]!.pos;
        expect(segmentsCross(p, q, r, t), `lanes ${l1.id} and ${l2.id} cross`).toBe(false);
      }
      expect(l1.a).not.toBe(l1.b);
    }
  });

  it('step 1: names are unique (M1-GEN-05)', () => {
    const names = [...w.sectors.map((s) => s.name), ...w.locations.map((l) => l.name)];
    expect(new Set(names).size).toBe(names.length);
  });

  it('step 2: development by jumps, with Middle and Frontier present (M1-GEN-06, M1-GEN-07)', () => {
    const core = w.sectors[w.coreSectorId]!;
    expect(core.jumpsFromCore).toBe(0);
    expect(core.development).toBe('core');
    expect(w.sectors.some((s) => s.development === 'middle')).toBe(true);
    expect(w.sectors.some((s) => s.development === 'frontier')).toBe(true);
    const fixed = w.sectors.filter((s) => {
      const expected = s.jumpsFromCore <= 1 ? 'core' : s.jumpsFromCore === 2 ? 'middle' : 'frontier';
      return expected !== s.development;
    });
    // Only the Section 6.4 step 3 fix can change a level: at most 2 sectors.
    expect(fixed.length).toBeLessThanOrEqual(2);
  });

  it('step 2: the core is the sector nearest to the map center (M1-GEN-06)', () => {
    const center = { x: (b.world.regionWidth - 1) / 2, y: (b.world.regionHeight - 1) / 2 };
    const d = (id: number) => mapDistance(w.sectors[id]!.pos, center, b.world.cellAspect);
    for (const s of w.sectors) expect(d(w.coreSectorId)).toBeLessThanOrEqual(d(s.id));
  });

  it('step 2: tech level by development (M1-GEN-08)', () => {
    for (const loc of w.locations) {
      const sector = w.sectors[loc.sectorId]!;
      expect(loc.techLevel).toBe(b.world.techByDevelopment[sector.development]);
    }
  });

  it('step 2: security baseline formula (M1-GEN-09)', () => {
    const sb = data.security.baseline;
    for (const s of w.sectors) {
      const center = sb.core - sb.perJump * s.jumpsFromCore;
      expect(s.securityBaseline).toBeGreaterThanOrEqual(Math.max(sb.min, Math.round(center - sb.jitter)));
      expect(s.securityBaseline).toBeLessThanOrEqual(Math.min(sb.max, Math.max(sb.min, Math.round(center + sb.jitter))));
      expect(s.securityValue).toBe(s.securityBaseline);
      expect(securityLevel(s.securityValue, data)).toBeGreaterThanOrEqual(0);
    }
  });

  it('step 3: 3 to 6 bodies, 1 to 4 planets, 1 to 3 stations (M1-GEN-10)', () => {
    const m = b.sectorMap;
    for (const s of w.sectors) {
      const locs = s.locationIds.map((id) => w.locations[id]!);
      const planets = locs.filter((l) => l.kind === 'planet').length;
      expect(locs.length).toBeGreaterThanOrEqual(m.bodiesMin);
      expect(locs.length).toBeLessThanOrEqual(m.bodiesMax);
      expect(planets).toBeGreaterThanOrEqual(m.planetsMin);
      expect(planets).toBeLessThanOrEqual(m.planetsMax);
      expect(locs.length - planets).toBeGreaterThanOrEqual(m.stationsMin);
      expect(locs.length - planets).toBeLessThanOrEqual(m.stationsMax);
      for (const l of locs) {
        expect(l.sectorId).toBe(s.id);
        expect(l.pos.x).toBeGreaterThanOrEqual(0);
        expect(l.pos.x).toBeLessThan(m.width);
        expect(l.pos.y).toBeGreaterThanOrEqual(0);
        expect(l.pos.y).toBeLessThan(m.height);
      }
    }
  });

  it('step 3: planet types are allowed for the development level, gravity from data (M1-GEN-11, M1-GEN-13)', () => {
    for (const l of w.locations) {
      if (l.kind === 'station') {
        expect(l.gravity).toBe(0);
        continue;
      }
      const type = data.planetTypeById.get(l.bodyType)!;
      expect(type).toBeDefined();
      expect(type.weights[w.sectors[l.sectorId]!.development]).toBeGreaterThan(0);
      expect(l.gravity).toBe(type.gravity);
      expect(l.producer).toBeNull();
      expect(l.population).toBe(0);
    }
  });

  it('step 3: one jump point for each lane, on the outer ring, toward the other sector (M1-GEN-12)', () => {
    const aspect = b.world.cellAspect;
    const center = { x: Math.floor(b.sectorMap.width / 2), y: Math.floor(b.sectorMap.height / 2) };
    expect(w.jumpPoints).toHaveLength(w.lanes.length * 2);
    for (const s of w.sectors) {
      expect(s.jumpPointIds).toHaveLength(laneCount(w, s.id));
      for (const id of s.jumpPointIds) {
        const jp = w.jumpPoints[id]!;
        const r = mapDistance(jp.pos, center, aspect) / aspect;
        expect(Math.abs(r - b.sectorMap.jumpRingRadius)).toBeLessThan(1.5);
        // The jump point is on the side of the sector that it connects to.
        const to = w.sectors[jp.toSectorId]!;
        const dir = { x: to.pos.x - s.pos.x, y: to.pos.y - s.pos.y };
        const jpDir = { x: jp.pos.x - center.x, y: (jp.pos.y - center.y) * aspect };
        expect(dir.x * jpDir.x + dir.y * aspect * jpDir.y).toBeGreaterThan(0);
      }
    }
  });

  it('the start location is in the core sector (M1-GEN-15)', () => {
    expect(w.locations[w.startLocationId]!.sectorId).toBe(w.coreSectorId);
  });
});
