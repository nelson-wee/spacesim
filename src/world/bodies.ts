// Generator step 3: star, orbit rings, bodies, and jump points (Section 6.5).
import type { Rng } from '../core/rng';
import type { JumpPoint, Location, Sector, Vec } from '../core/types';
import type { GameData } from '../data';
import { mapDistance, ringAngleToward, ringPoint } from './geometry';
import { createLocation } from './location';
import { makeUniqueName } from './names';

export function sectorCenter(data: GameData): Vec {
  const m = data.balance.sectorMap;
  return { x: Math.floor(m.width / 2), y: Math.floor(m.height / 2) };
}

/** One jump point for each lane, on the outer ring, at the angle of the lane on the region map. */
export function placeJumpPoints(
  sector: Sector,
  lanes: { id: number; a: number; b: number }[],
  sectors: Sector[],
  firstId: number,
  data: GameData,
): JumpPoint[] {
  const aspect = data.balance.world.cellAspect;
  const m = data.balance.sectorMap;
  const center = sectorCenter(data);
  const points: JumpPoint[] = [];
  for (const lane of lanes) {
    if (lane.a !== sector.id && lane.b !== sector.id) continue;
    const toSectorId = lane.a === sector.id ? lane.b : lane.a;
    const to = sectors[toSectorId] as Sector;
    let angle = ringAngleToward(to.pos.x - sector.pos.x, to.pos.y - sector.pos.y, aspect);
    let pos = ringPoint(center, m.jumpRingRadius, angle, aspect);
    // Move a little along the ring if another jump point is too near.
    for (let i = 0; i < 40 && points.some((p) => mapDistance(p.pos, pos, aspect) < m.minJumpPointDistance); i++) {
      angle += 0.1;
      pos = ringPoint(center, m.jumpRingRadius, angle, aspect);
    }
    points.push({ id: firstId + points.length, sectorId: sector.id, laneId: lane.id, toSectorId, pos });
  }
  return points;
}

interface BodySpot {
  kind: 'planet' | 'station';
  pos: Vec;
  ring: number;
}

function placeBodySpots(rng: Rng, kinds: ('planet' | 'station')[], jumpPoints: JumpPoint[], data: GameData): BodySpot[] | null {
  const aspect = data.balance.world.cellAspect;
  const m = data.balance.sectorMap;
  const center = sectorCenter(data);
  const spots: BodySpot[] = [];
  for (const kind of kinds) {
    let placed = false;
    for (let attempt = 0; attempt < m.bodyPlacementAttempts && !placed; attempt++) {
      const ring = rng.int(0, m.bodyRingRadii.length - 1);
      const pos = ringPoint(center, m.bodyRingRadii[ring] as number, rng.range(0, Math.PI * 2), aspect);
      const clear =
        spots.every((s) => mapDistance(s.pos, pos, aspect) >= m.minBodyDistance) &&
        jumpPoints.every((j) => mapDistance(j.pos, pos, aspect) >= m.minJumpPointDistance);
      if (clear) {
        spots.push({ kind, pos, ring });
        placed = true;
      }
    }
    if (!placed) return null;
  }
  return spots;
}

/** Bodies of one sector: 3 to 6, with 1 to 4 planets and 1 to 3 station slots. */
export function placeBodies(
  rng: Rng,
  sector: Sector,
  jumpPoints: JumpPoint[],
  firstId: number,
  usedNames: Set<string>,
  data: GameData,
): Location[] {
  const m = data.balance.sectorMap;
  const total = rng.int(m.bodiesMin, m.bodiesMax);
  const planets = rng.int(Math.max(m.planetsMin, total - m.stationsMax), Math.min(m.planetsMax, total - m.stationsMin));
  const kinds = rng.shuffle([
    ...new Array<'planet'>(planets).fill('planet'),
    ...new Array<'station'>(total - planets).fill('station'),
  ]);
  let spots: BodySpot[] | null = null;
  for (let tryNo = 0; tryNo < 20 && !spots; tryNo++) spots = placeBodySpots(rng, kinds, jumpPoints, data);
  if (!spots) throw new Error(`World generator: cannot place bodies in sector ${sector.name}. Check balance.sectorMap.`);

  const techLevel = data.balance.world.techByDevelopment[sector.development];
  return spots.map((spot, i) => {
    const bodyType =
      spot.kind === 'planet'
        ? rng.weighted(data.bodyTypes.planets, (p) => p.weights[sector.development]).id
        : 'station_slot';
    return createLocation(
      {
        id: firstId + i,
        sectorId: sector.id,
        name: makeUniqueName(rng, data, 'location', usedNames),
        kind: spot.kind,
        bodyType,
        pos: spot.pos,
        ring: spot.ring,
        techLevel,
      },
      data,
    );
  });
}
