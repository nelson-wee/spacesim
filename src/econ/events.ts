// Market events (Section 9.11, data/events.json): Shortage (population use x
// useMult of one commodity at one location), Boom and Strike (batches x
// batchMult at one producer), Pirate Surge (a security change in one sector,
// at once). At most `maxActive` events; each economy day rolls for a new one
// (tick step 8). Headless: the game tick logs new events.
import type { Rng } from '../core/rng';
import type { EconomyState, Location, MarketEvent } from '../core/types';
import type { GameData } from '../data';
import { changeSecurity } from '../world/security';
import type { EconContext } from './context';

/** Use multiplier of a Shortage at a location for a commodity (1 with no event). */
export function useMult(economy: EconomyState, locId: number, commodity: string, data: GameData): number {
  let mult = 1;
  for (const e of economy.events) {
    if (e.kind === 'shortage' && e.locationId === locId && e.commodity === commodity) mult *= data.events.kinds.find((k) => k.id === 'shortage')?.useMult ?? 1;
  }
  return mult;
}

/** Batch multiplier of a Boom or a Strike at a producer (1 with no event). */
export function batchMult(economy: EconomyState, loc: Location, data: GameData): number {
  let mult = 1;
  for (const e of economy.events) {
    if ((e.kind === 'boom' || e.kind === 'strike') && e.locationId === loc.id) mult *= data.events.kinds.find((k) => k.id === e.kind)?.batchMult ?? 1;
  }
  return mult;
}

/** Ends old events and rolls for a new one. Returns the new event, or null. */
export function eventsDay(ctx: EconContext, economy: EconomyState, rng: Rng): MarketEvent | null {
  const { world, data } = ctx;
  const ev = data.events;
  economy.events = economy.events.filter((e) => e.endDay > economy.days);
  if (economy.events.length >= ev.maxActive || !rng.chance(ev.dailyChance)) return null;
  const kind = rng.weighted(ev.kinds, (k) => k.weight);
  const days = kind.maxDays > 0 ? rng.int(kind.minDays, kind.maxDays) : 0;
  const base = { id: economy.nextEventId, kind: kind.id, startDay: economy.days, endDay: economy.days + days };
  let event: MarketEvent | null = null;
  if (kind.id === 'shortage') {
    const places = world.locations.filter((l) => (ctx.uses[l.id] ?? []).length > 0);
    if (places.length === 0) return null;
    const loc = rng.pick(places);
    event = { ...base, locationId: loc.id, commodity: rng.pick(ctx.uses[loc.id] ?? []).commodity };
  } else if (kind.id === 'boom' || kind.id === 'strike') {
    const free = ctx.producers.filter((l) => !economy.events.some((e) => e.locationId === l.id));
    if (free.length === 0) return null;
    event = { ...base, locationId: rng.pick(free).id };
  } else {
    const sector = rng.pick(world.sectors);
    if (kind.change) changeSecurity(sector, kind.change, data);
    event = { ...base, sectorId: sector.id };
  }
  economy.nextEventId++;
  if (event.endDay > economy.days) economy.events.push(event);
  return event;
}

/** A log line for an event. */
export function eventText(e: MarketEvent, world: { locations: Location[]; sectors: { name: string }[] }, data: GameData): string {
  const kind = data.events.kinds.find((k) => k.id === e.kind)?.name ?? e.kind;
  const loc = e.locationId !== undefined ? world.locations[e.locationId] : undefined;
  const days = e.endDay - e.startDay;
  if (e.kind === 'shortage') return `${kind}: ${loc?.name ?? '?'} uses twice as much ${data.commodityById.get(e.commodity ?? '')?.name ?? e.commodity} (${days} days).`;
  if (e.kind === 'boom') return `${kind}: ${loc?.name ?? '?'} makes 50% more (${days} days).`;
  if (e.kind === 'strike') return `${kind}: ${loc?.name ?? '?'} makes nothing (${days} days).`;
  return `${kind}: pirates gather in ${e.sectorId !== undefined ? (world.sectors[e.sectorId]?.name ?? '?') : '?'}. Security falls.`;
}
