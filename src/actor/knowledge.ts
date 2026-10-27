// Price information and map knowledge (Sections 9.12, 14.4). There is no
// information decay:
// - Docked location: live prices.
// - Merchants' Guild: live prices for all locations within 2 jumps, a 14-day
//   trend arrow for each price, and chain alerts.
// - Other locations: the last known price, with the day it was known.
// - No information: unknown.
// The player knows all sectors and lanes from the start. The player knows the
// locations of a sector after the first visit, or from a Guild within 2 jumps.
// A snapshot keeps stock and target, so the route planner can quote unit by unit.
import type { Game } from '../core/game';
import type { Actor, Location, MarketEntry, World } from '../core/types';
import type { GameData } from '../data';
import { econContext } from '../econ/context';
import { basePrice, buyPrice, midPrice, sellPrice } from '../econ/prices';
import { recipeOf } from '../econ/recipes';

export type Trend = 'up' | 'down' | 'flat';

export interface KnownPrice {
  stock: number;
  target: number;
  /** 14-day trend, if a Merchants' Guild gave it. */
  trend: Trend | null;
}

export interface KnownMarket {
  /** Day the information was live. */
  day: number;
  prices: Record<string, KnownPrice>;
}

export interface ChainAlert {
  locationId: number;
  text: string;
}

export interface Knowledge {
  /** Last known market of each location (key: location id). */
  markets: Record<string, KnownMarket>;
  /** Sectors that the actor visited or got from a Guild: their locations are known. */
  knownSectors: number[];
  /** Chain alerts of the last Merchants' Guild visit. */
  alerts: ChainAlert[];
  alertsDay: number | null;
}

export function emptyKnowledge(): Knowledge {
  return { markets: {}, knownSectors: [], alerts: [], alertsDay: null };
}

/** Sector jumps from the Guild that give live prices. */
export function guildRange(data: GameData): number {
  return data.serviceRules.guildRangeJumps;
}

export function trendOf(entry: MarketEntry, days: number): Trend {
  const h = entry.history;
  if (h.length < 2) return 'flat';
  const now = h[h.length - 1] as number;
  const then = h[Math.max(0, h.length - 1 - days)] as number;
  const change = then > 0 ? now / then - 1 : 0;
  return change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat';
}

function snapshot(loc: Location, day: number, withTrend: boolean, data: GameData): KnownMarket {
  const prices: Record<string, KnownPrice> = {};
  for (const [c, entry] of Object.entries(loc.market)) {
    prices[c] = { stock: entry.stock, target: entry.target, trend: withTrend ? trendOf(entry, data.serviceRules.trendDays) : null };
  }
  return { day, prices };
}

function addSector(k: Knowledge, sectorId: number): void {
  if (!k.knownSectors.includes(sectorId)) k.knownSectors.push(sectorId);
}

/** Sectors within `jumps` jumps of a sector. */
export function sectorsWithin(world: World, data: GameData, sectorId: number, jumps: number): number[] {
  const row = econContext(world, data).sectorJumps[sectorId] ?? [];
  return world.sectors.filter((s) => (row[s.id] ?? Infinity) <= jumps).map((s) => s.id);
}

/**
 * Chain alerts (Sections 9.4, 14.4) for the locations in `sectorIds`: a
 * producer with low output and its cause, and population deficits.
 */
export function chainAlerts(world: World, data: GameData, sectorIds: number[]): ChainAlert[] {
  const a = data.serviceRules.alerts;
  const ctx = econContext(world, data);
  const alerts: ChainAlert[] = [];
  const sectors = new Set(sectorIds);
  for (const loc of world.locations) {
    if (!sectors.has(loc.sectorId)) continue;
    const p = loc.production;
    if (loc.producer && p && p.outputRatio < a.lowOutputRatio) {
      const r = recipeOf(data, loc.producer);
      const type = loc.producer.replace(/_/g, ' ');
      let cause = 'low security';
      if (p.inputFactor < 1 - 1e-6) {
        // The hard input with the lowest stock against its need.
        const worst = r.inputs
          .map((i) => ({ c: i.commodity, ratio: (loc.market[i.commodity]?.stock ?? 0) / Math.max(1e-9, ctx.dailyNeed.get(`${loc.id}:${i.commodity}`) ?? 1) }))
          .sort((x, y) => x.ratio - y.ratio)[0];
        const name = worst ? (data.commodityById.get(worst.c)?.name ?? worst.c) : 'inputs';
        cause = p.inputFactor < 0.05 ? `no ${name}` : `low ${name}`;
      } else if (p.capitalFactor < 1 - 1e-6) cause = 'low Machinery';
      else if (loc.capacity < 1 - 1e-6) cause = 'low capacity';
      alerts.push({ locationId: loc.id, text: `${loc.name} ${type}: ${cause}, output ${Math.round(p.outputRatio * 100)}%` });
    }
    for (const u of ctx.uses[loc.id] ?? []) {
      const entry = loc.market[u.commodity];
      if (!entry || u.amount <= 0) continue;
      if (entry.stock < u.amount * a.deficitDays) {
        alerts.push({ locationId: loc.id, text: `${loc.name}: short of ${data.commodityById.get(u.commodity)?.name ?? u.commodity}` });
      }
    }
  }
  return alerts;
}

/**
 * Updates the actor's knowledge from where it is now. Call it on arrival, after
 * a jump, after a tow, and each day while docked.
 */
export function observe(game: Game, actor: Actor): void {
  const { world } = game.state;
  const { data } = game;
  const k = actor.knowledge;
  const p = actor.position;
  const sectorId =
    p.kind === 'docked'
      ? (world.locations[p.locationId] as Location).sectorId
      : p.kind === 'jumpPoint'
        ? (world.jumpPoints[p.jumpPointId]?.sectorId ?? 0)
        : p.sectorId;
  addSector(k, sectorId);
  if (p.kind !== 'docked') return;
  const here = world.locations[p.locationId] as Location;
  const day = game.state.day;
  if (here.services.includes('merchants_guild')) {
    const sectors = sectorsWithin(world, data, here.sectorId, guildRange(data));
    for (const s of sectors) {
      addSector(k, s);
      for (const id of world.sectors[s]?.locationIds ?? []) k.markets[id] = snapshot(world.locations[id] as Location, day, true, data);
    }
    k.alerts = chainAlerts(world, data, sectors);
    k.alertsDay = day;
  } else {
    k.markets[here.id] = snapshot(here, day, false, data);
  }
}

export function knowsLocation(actor: Actor, loc: Location): boolean {
  return actor.knowledge.knownSectors.includes(loc.sectorId);
}

export type PriceSource = 'live' | 'known' | 'unknown';

export interface PriceView {
  source: PriceSource;
  /** Day of the information (now for live prices). */
  day: number | null;
  buy: number;
  sell: number;
  mid: number;
  trend: Trend | null;
  /** Stock and target, for unit-by-unit quotes. */
  entry: MarketEntry | null;
}

/** True if the actor sees live prices of this location now. */
export function hasLivePrices(game: Game, actor: Actor, loc: Location): boolean {
  const p = actor.position;
  if (p.kind !== 'docked') return false;
  if (p.locationId === loc.id) return true;
  const here = game.state.world.locations[p.locationId] as Location;
  if (!here.services.includes('merchants_guild')) return false;
  return sectorsWithin(game.state.world, game.data, here.sectorId, guildRange(game.data)).includes(loc.sectorId);
}

/** What the actor knows of one price (Section 9.12, M3-INFO-02). */
export function priceView(game: Game, actor: Actor, loc: Location, commodity: string): PriceView {
  const { data } = game;
  const unknown: PriceView = { source: 'unknown', day: null, buy: 0, sell: 0, mid: 0, trend: null, entry: null };
  const live = loc.market[commodity];
  const base = basePrice(data, commodity);
  if (hasLivePrices(game, actor, loc)) {
    if (!live) return unknown;
    const known = actor.knowledge.markets[loc.id]?.prices[commodity];
    return {
      source: 'live',
      day: game.state.day,
      buy: buyPrice(live, base, data),
      sell: sellPrice(live, base, data),
      mid: midPrice(live, base, data),
      trend: known?.trend ?? null,
      entry: live,
    };
  }
  const km = actor.knowledge.markets[loc.id];
  const kp = km?.prices[commodity];
  if (!km || !kp) return unknown;
  const entry: MarketEntry = { stock: kp.stock, target: kp.target, history: [] };
  return {
    source: 'known',
    day: km.day,
    buy: buyPrice(entry, base, data),
    sell: sellPrice(entry, base, data),
    mid: midPrice(entry, base, data),
    trend: kp.trend,
    entry,
  };
}
