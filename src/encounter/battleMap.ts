// Battle map template by the place of the encounter (Section 13.1, M5-ENC-10):
// the nearest location within `nearDistance` selects the template by its
// body type; jump points and open space far from bodies give the default.
import type { Location, Sector, Vec } from '../core/types';
import type { GameData } from '../data';
import type { BattleMapTemplate } from '../data/schemas';
import { mapDistance } from '../world/geometry';

export function battleMapFor(sector: Sector, point: Vec, locations: Location[], data: GameData): BattleMapTemplate {
  const maps = data.battleMaps;
  const fallback = maps.templates.find((t) => t.id === maps.default) as BattleMapTemplate;
  let nearest: Location | undefined;
  let best = maps.nearDistance;
  for (const id of sector.locationIds) {
    const loc = locations[id];
    if (!loc) continue;
    const d = mapDistance(point, loc.pos, data.balance.world.cellAspect);
    if (d <= best) {
      best = d;
      nearest = loc;
    }
  }
  if (!nearest) return fallback;
  const near = nearest;
  const match = maps.templates.find((t) => (near.kind === 'planet' ? t.nearPlanets : t.nearStations)?.includes(near.bodyType));
  return match ?? fallback;
}
