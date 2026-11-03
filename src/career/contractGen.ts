// Contract boards (Section 14.3). Each Merchants' Guild and Bounty Guild
// posts new offers every `boardIntervalDays`; offers that the player did not
// accept go away. Offers come from the real state of the world within
// `candidateJumps` of the board: deficits, capital needs, input starvation,
// surpluses (Merchants' Guild), and security problems (Bounty Guild). Each
// offer shows its reason. Values are in data/contracts.json.
import type { Game } from '../core/game';
import { rng } from '../core/game';
import type { Rng } from '../core/rng';
import type { Board, Contract, FreightContract, Location, NamedBounty, Sector, SupplyContract, SweepContract } from '../core/types';
import type { GameData } from '../data';
import { allowedPirateTemplates, budgetRange, namedPirateTemplates, selectTemplate } from '../encounter/budget';
import { kRef } from '../econ/capital';
import { chainAlertsAt } from '../actor/knowledge';
import { econContext, type EconContext } from '../econ/context';
import { basePrice, midPrice, sellPrice } from '../econ/prices';
import { recipeOf } from '../econ/recipes';
import { createShipFromLoadout } from '../ship/loadout';
import { groupTu, loadoutTu, shipTu } from '../ship/threat';
import { locationCode } from '../world/codes';
import { securityLevel } from '../world/security';

/** A location's need of one commodity: a deficit, a capital need, or input starvation (Section 14.3). */
export interface Need {
  locId: number;
  commodity: string;
  /** 0-1 (capped: input starvation adds to a deficit). */
  severity: number;
  /** Tonnes that would close the gap. */
  tonnes: number;
  score: number;
  reason: string;
  /** A chain alert asks for it: boards post it first (owner, 2026-11-03). */
  alert: boolean;
}

export interface Surplus {
  locId: number;
  commodity: string;
  severity: number;
  tonnes: number;
}

export interface SecurityProblem {
  sectorId: number;
  severity: number;
  score: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function name(data: GameData, commodity: string): string {
  return data.commodityById.get(commodity)?.name ?? commodity;
}

function place(game: Game, loc: Location): string {
  return `${loc.name} (${locationCode(game.state.world, loc, game.data)})`;
}

function jumpsBetween(ctx: EconContext, a: number, b: number): number {
  return ctx.sectorJumps[a]?.[b] ?? Infinity;
}

/** Deficits, capital needs, and input starvation at one location (Section 14.3). */
export function needsAt(game: Game, loc: Location, ctx: EconContext = econContext(game.state.world, game.data)): Need[] {
  const { data } = game;
  const c = data.contracts;
  const needs = new Map<string, Need>();
  const recipe = loc.producer ? recipeOf(data, loc.producer) : null;
  const output = loc.production ? `output ${pct(loc.production.outputRatio)}` : null;
  const dailyOf = new Map<string, number>();
  const add = (commodity: string, severity: number, tonnes: number, daily: number, reason: string, alert = false) => {
    const old = needs.get(commodity);
    const sev = Math.min(1, Math.max(old?.severity ?? 0, severity));
    const t = Math.max(old?.tonnes ?? 0, tonnes);
    const d = Math.max(daily, dailyOf.get(commodity) ?? 0);
    dailyOf.set(commodity, d);
    needs.set(commodity, { locId: loc.id, commodity, severity: sev, tonnes: t, score: sev * d * basePrice(data, commodity) * loc.size, reason: old?.reason ?? reason, alert: alert || (old?.alert ?? false) });
  };
  // Deficit: a needed commodity (recipe input or population use) with stock < deficitStockShare x target.
  for (const [commodity, entry] of Object.entries(loc.market)) {
    const daily = ctx.dailyNeed.get(`${loc.id}:${commodity}`) ?? 0;
    if (daily <= 0 || entry.target <= 0 || entry.stock >= c.deficitStockShare * entry.target) continue;
    const mass = data.commodityById.get(commodity)?.massPerUnit ?? 1;
    const why = output ? `${place(game, loc)}: ${output}, needs ${name(data, commodity)}` : `${place(game, loc)}: ${name(data, commodity)} at ${pct(entry.stock / entry.target)} of need`;
    add(commodity, 1 - entry.stock / entry.target, (entry.target - entry.stock) * mass, daily, why);
  }
  if (recipe && loc.production) {
    // Capital need: installed Machinery K < capitalKShare x K_ref. Daily need: the most it installs in a day.
    const ref = kRef(loc, recipe);
    const k = loc.installedMachinery;
    if (ref > 0 && k < c.capitalKShare * ref && loc.market[recipe.softInput]) {
      const mass = data.commodityById.get(recipe.softInput)?.massPerUnit ?? 1;
      const daily = data.recipes.capital.installRatePerDay * ref;
      add(recipe.softInput, 1 - k / ref, (ref - k) * mass, daily, `${place(game, loc)}: ${output}, machinery ${pct(k / ref)}, needs ${name(data, recipe.softInput)}`);
    }
    // Input starvation adds 1 - inputFactor to the deficit severity of each hard input.
    if (loc.production.inputFactor < c.starvationInputFactor) {
      for (const input of recipe.inputs) {
        const entry = loc.market[input.commodity];
        if (!entry || entry.stock >= entry.target) continue;
        const old = needs.get(input.commodity);
        const mass = data.commodityById.get(input.commodity)?.massPerUnit ?? 1;
        const daily = ctx.dailyNeed.get(`${loc.id}:${input.commodity}`) ?? 0;
        const sev = (old ? old.severity : 0) + (1 - loc.production.inputFactor);
        needs.delete(input.commodity);
        add(input.commodity, sev, (entry.target - entry.stock) * mass, daily, old?.reason ?? `${place(game, loc)}: ${output}, short of ${name(data, input.commodity)}`);
      }
    }
  }
  // Chain alerts (the Merchants' Guild information) are needs too: the guild posts contracts to fix them.
  for (const a of chainAlertsAt(game.state.world, data, loc)) {
    const entry = a.commodity ? loc.market[a.commodity] : undefined;
    if (!a.commodity || !entry) continue;
    const mass = data.commodityById.get(a.commodity)?.massPerUnit ?? 1;
    const daily = Math.max(ctx.dailyNeed.get(`${loc.id}:${a.commodity}`) ?? 0, recipe && a.commodity === recipe.softInput ? data.recipes.capital.installRatePerDay * kRef(loc, recipe) : 0);
    const sev = loc.production && a.commodity !== undefined && recipe && recipe.inputs.some((i) => i.commodity === a.commodity) ? 1 - loc.production.outputRatio : 1 - entry.stock / Math.max(1e-9, entry.target);
    add(a.commodity, Math.max(0.1, sev), Math.max(0, entry.target - entry.stock) * mass, daily, `${a.text}`, true);
  }
  return [...needs.values()];
}

/** Surpluses of commodities that a location makes (Section 14.3). */
export function surplusesAt(game: Game, loc: Location): Surplus[] {
  const { data } = game;
  if (!loc.producer) return [];
  const out: Surplus[] = [];
  for (const o of recipeOf(data, loc.producer).outputs) {
    const entry = loc.market[o.commodity];
    if (!entry || entry.target <= 0 || entry.stock <= data.contracts.surplusStockShare * entry.target) continue;
    const mass = data.commodityById.get(o.commodity)?.massPerUnit ?? 1;
    out.push({ locId: loc.id, commodity: o.commodity, severity: entry.stock / entry.target - 1, tonnes: (entry.stock - entry.target) * mass });
  }
  return out;
}

/** A security problem: value <= baseline - securityBelowBaseline, or level <= securityMaxLevel (Section 14.3). */
export function securityProblem(sector: Sector, data: GameData): SecurityProblem | null {
  const c = data.contracts;
  const level = securityLevel(sector.securityValue, data);
  if (!(sector.securityValue <= sector.securityBaseline - c.securityBelowBaseline || level <= c.securityMaxLevel)) return null;
  const severity = Math.max(c.securityMinSeverity, (sector.securityBaseline - sector.securityValue) / c.securityDivisor);
  return { sectorId: sector.id, severity, score: severity * c.securityScore };
}

/** The size class for a quantity: the largest class <= tonnes, at least the smallest (Section 14.4). */
export function sizeFor(tonnes: number, data: GameData): GameData['contracts']['sizes'][number] {
  const sizes = [...data.contracts.sizes].sort((a, b) => a.tonnes - b.tonnes);
  let best = sizes[0] as (typeof sizes)[number];
  for (const s of sizes) if (s.tonnes <= tonnes + 1e-9) best = s;
  return best;
}

/** Lowest security level on the shortest path between two sectors. */
export function lowestLevelOnPath(ctx: EconContext, a: number, b: number, data: GameData): number {
  const path = ctx.sectorPaths[a]?.[b] ?? [a, b];
  return Math.min(...path.map((id) => securityLevel(ctx.world.sectors[id]?.securityValue ?? 0, data)));
}

function levelBonus(level: number, bonus: number): number {
  return 1 + bonus * (4 - level);
}

/** The nearest location that makes a commodity, and its jumps to `dest` (Infinity with none). */
export function nearestMaker(game: Game, dest: Location, commodity: string): { loc: Location | null; jumps: number } {
  const { data, state } = game;
  const ctx = econContext(state.world, data);
  let best: Location | null = null;
  let jumps = Infinity;
  for (const l of state.world.locations) {
    if (!l.producer || !recipeOf(data, l.producer).outputs.some((o) => o.commodity === commodity)) continue;
    const j = jumpsBetween(ctx, l.sectorId, dest.sectorId);
    if (j < jumps) {
      jumps = j;
      best = l;
    }
  }
  return { loc: best, jumps };
}

/**
 * The flat Supply fee (owner, 2026-11-03): tonnes x (feePerTonne + feePerTonneJump x jumps from the nearest maker)
 * x riskMult x (1 + urgencyPerSeverity x severity). It does not follow the value of the goods.
 */
export function supplyFee(game: Game, dest: Location, commodity: string, tonnes: number, severity: number): { fee: number; sourceJumps: number; riskMult: number } {
  const { data, state } = game;
  const ctx = econContext(state.world, data);
  const s = data.contracts.supply;
  const maker = nearestMaker(game, dest, commodity);
  const sourceJumps = Number.isFinite(maker.jumps) ? maker.jumps : data.contracts.candidateJumps;
  const lowest = maker.loc ? lowestLevelOnPath(ctx, maker.loc.sectorId, dest.sectorId, data) : securityLevel(state.world.sectors[dest.sectorId]?.securityValue ?? 0, data);
  const riskMult = 1 + s.riskPerLevel * (4 - lowest);
  return { fee: tonnes * (s.feePerTonne + s.feePerTonneJump * sourceJumps) * riskMult * (1 + s.urgencyPerSeverity * severity), sourceJumps, riskMult };
}

function supplyOffer(game: Game, id: number, board: Location, need: Need, sizeId?: string): SupplyContract {
  const { data, state } = game;
  const ctx = econContext(state.world, data);
  const dest = state.world.locations[need.locId] as Location;
  const size = sizeId ? (data.contracts.sizes.find((s) => s.id === sizeId) ?? sizeFor(need.tonnes, data)) : sizeFor(need.tonnes, data);
  const mass = data.commodityById.get(need.commodity)?.massPerUnit ?? 1;
  const entry = dest.market[need.commodity];
  const sell = entry ? sellPrice(entry, basePrice(data, need.commodity), data) : basePrice(data, need.commodity);
  const s = data.contracts.supply;
  const jumps = jumpsBetween(ctx, board.sectorId, dest.sectorId);
  const { fee, sourceJumps, riskMult } = supplyFee(game, dest, need.commodity, size.tonnes, need.severity);
  return {
    kind: 'supply',
    id,
    boardId: board.id,
    postedDay: state.day,
    reason: need.reason,
    destId: dest.id,
    commodity: need.commodity,
    sizeId: size.id,
    units: Math.round(size.tonnes / mass),
    delivered: 0,
    price: sell,
    fee,
    sourceJumps,
    riskMult,
    severity: need.severity,
    alert: need.alert,
    deadline: state.day + s.deadlineBase + s.deadlinePerJump * jumps,
  };
}

function freightOffer(game: Game, id: number, board: Location, from: Location, surplus: Surplus, to: Location, need: Need): FreightContract {
  const { data, state } = game;
  const ctx = econContext(state.world, data);
  const f = data.contracts.freight;
  const size = sizeFor(Math.min(surplus.tonnes, need.tonnes), data);
  const mass = data.commodityById.get(surplus.commodity)?.massPerUnit ?? 1;
  const units = Math.round(size.tonnes / mass);
  const entry = from.market[surplus.commodity];
  const value = units * (entry ? midPrice(entry, basePrice(data, surplus.commodity), data) : basePrice(data, surplus.commodity));
  const jumps = jumpsBetween(ctx, from.sectorId, to.sectorId);
  const riskMult = 1 + f.riskPerLevel * (4 - lowestLevelOnPath(ctx, from.sectorId, to.sectorId, data));
  return {
    kind: 'freight',
    id,
    boardId: board.id,
    postedDay: state.day,
    reason: `${place(game, from)}: surplus of ${name(data, surplus.commodity)}; ${need.reason}`,
    fromId: from.id,
    toId: to.id,
    commodity: surplus.commodity,
    sizeId: size.id,
    units,
    jumps,
    riskMult,
    cargoValue: value,
    deposit: f.depositShare * value,
    fee: size.tonnes * jumps * f.feePerTonneJump * riskMult + f.valueShare * value,
    pickedDay: null,
    deadline: state.day + f.pickupDeadlineBase + f.pickupDeadlinePerJump * jumpsBetween(ctx, board.sectorId, from.sectorId),
  };
}

/** Mean TU of one ship in the templates of a sector (Sweep reward, Section 14.5). */
export function averageShipTu(sector: Sector, data: GameData): number {
  const ships = allowedPirateTemplates(sector, data).flatMap((t) => t.ships);
  if (ships.length === 0) return 0;
  return ships.reduce((sum, id) => sum + loadoutTu(id, data), 0) / ships.length;
}

function sweepOffer(game: Game, id: number, board: Location, problem: SecurityProblem, r: Rng): SweepContract {
  const { data, state } = game;
  const sector = state.world.sectors[problem.sectorId] as Sector;
  const s = data.contracts.sweep;
  const ships = r.int(s.minShips, s.maxShips);
  const level = securityLevel(sector.securityValue, data);
  const why = sector.securityValue <= sector.securityBaseline - data.contracts.securityBelowBaseline ? `security ${Math.round(sector.securityValue)}, ${Math.round(sector.securityBaseline - sector.securityValue)} below its normal level` : `security level ${level}`;
  return {
    kind: 'sweep',
    id,
    boardId: board.id,
    postedDay: state.day,
    reason: `${sector.name}: ${why}`,
    sectorId: sector.id,
    ships,
    kills: 0,
    reward: ships * averageShipTu(sector, data) * s.rewardPerTu * levelBonus(level, s.levelBonus),
    deadline: null,
  };
}

/** A named pirate group (Section 14.6, Q-23): the template by tier-1 TU, the reward and threat with the upgraded group. */
export function namedOffer(game: Game, id: number, board: Location, sector: Sector, r: Rng): NamedBounty | null {
  const { data, state } = game;
  const n = data.contracts.named;
  const budget = budgetRange(sector, data)[1] * r.range(n.budgetMin, n.budgetMax);
  const templates = namedPirateTemplates(sector, data);
  const template = selectTemplate(templates, budget, r, data) ?? templates[0];
  if (!template) return null;
  const tuOf = (tier: 1 | 2 | 3) => groupTu(template.ships.map((l) => shipTu(createShipFromLoadout(data, l, 'n', 'n', tier), data)), data);
  let tier = n.tier as 1 | 2 | 3;
  let tu = tuOf(tier);
  if (tu >= n.tier3Tu && tier < 3) {
    tier = 3;
    tu = tuOf(3);
  }
  const p = data.names.pirate;
  const level = securityLevel(sector.securityValue, data);
  return {
    kind: 'named',
    id,
    boardId: board.id,
    postedDay: state.day,
    reason: `${sector.name}: ${template.name} (security level ${level})`,
    sectorId: sector.id,
    name: `${r.pick(p.captains)} ${r.pick(p.epithets)}, aboard the ${r.pick(p.ships)}`,
    templateId: template.id,
    ships: template.ships.map((loadoutId) => ({ loadoutId, tier })),
    tu,
    reward: tu * n.rewardPerTu * levelBonus(level, n.levelBonus),
    expiry: state.day + n.expiryDays,
  };
}

function isAdvanced(data: GameData, commodity: string): boolean {
  const tier = data.commodityById.get(commodity)?.tier;
  return tier === 'advanced' || tier === 'consumer';
}

interface Candidate {
  key: string[];
  score: number;
  advanced: boolean;
  alert?: boolean;
  build: (id: number) => Contract;
}

/** Weighted selection with no repeat of a location-commodity pair (Section 14.3 step 3). */
function pick(candidates: Candidate[], count: number, r: Rng, first: ((c: Candidate) => boolean)[] = []): Candidate[] {
  const chosen: Candidate[] = [];
  const used = new Set<string>();
  const free = (c: Candidate) => c.score > 0 && c.key.every((k) => !used.has(k)) && !chosen.includes(c);
  const take = (pool: Candidate[]) => {
    if (pool.length === 0 || chosen.length >= count) return;
    const c = r.weighted(pool, (x) => x.score);
    chosen.push(c);
    for (const k of c.key) used.add(k);
  };
  for (const rule of first) take(candidates.filter((c) => free(c) && rule(c)));
  while (chosen.length < count) {
    const pool = candidates.filter(free);
    if (pool.length === 0) break;
    take(pool);
  }
  return chosen;
}

/** A new Merchants' Guild board (Supply and Freight offers). */
export function merchantsBoard(game: Game, board: Location, r: Rng): Board {
  const { data, state } = game;
  const ctx = econContext(state.world, data);
  const c = data.contracts;
  const near = state.world.locations.filter((l) => jumpsBetween(ctx, board.sectorId, l.sectorId) <= c.candidateJumps);
  const needs = near.flatMap((l) => needsAt(game, l, ctx));
  const candidates: Candidate[] = [];
  for (const need of needs) {
    candidates.push({ key: [`${need.locId}:${need.commodity}`], score: need.score, advanced: isAdvanced(data, need.commodity), alert: need.alert, build: (id) => supplyOffer(game, id, board, need) });
  }
  // Freight: a surplus at A (within pickupJumps of the board) and a deficit of it at B, 1-3 jumps from A.
  for (const from of near.filter((l) => jumpsBetween(ctx, board.sectorId, l.sectorId) <= c.freight.pickupJumps)) {
    for (const s of surplusesAt(game, from)) {
      const dests = state.world.locations
        .filter((l) => {
          const j = jumpsBetween(ctx, from.sectorId, l.sectorId);
          return l.id !== from.id && j >= c.freight.destMinJumps && j <= c.freight.destMaxJumps;
        })
        .flatMap((l) => needsAt(game, l, ctx).filter((n) => n.commodity === s.commodity && (l.market[s.commodity]?.stock ?? Infinity) < c.deficitStockShare * (l.market[s.commodity]?.target ?? 0)));
      const need = dests.sort((a, b) => b.score - a.score)[0];
      if (!need) continue;
      const to = state.world.locations[need.locId] as Location;
      candidates.push({ key: [`${from.id}:${s.commodity}`, `${to.id}:${s.commodity}`], score: need.score, advanced: isAdvanced(data, s.commodity), alert: need.alert, build: (id) => freightOffer(game, id, board, from, s, to, need) });
    }
  }
  const count = r.int(c.offersMin, c.offersMax);
  // Chain alerts first (owner, 2026-11-03), then one Raw or Processed and one Advanced offer if possible.
  const alertRules = Array.from({ length: c.alertOffersPerBoard }, () => (x: Candidate) => x.alert === true);
  const chosen = pick(candidates, count, r, [...alertRules, (x) => !x.advanced, (x) => x.advanced]);
  const offers = chosen.map((x) => x.build(state.contracts.nextId++));
  // At least one Small offer if possible: the supply offer with the lowest score becomes Small.
  const small = data.contracts.sizes.reduce((a, b) => (b.tonnes < a.tonnes ? b : a));
  if (offers.length > 0 && !offers.some((o) => (o.kind === 'supply' || o.kind === 'freight') && o.sizeId === small.id)) {
    const supplies = chosen.map((x, i) => ({ x, o: offers[i] })).filter((p) => p.o?.kind === 'supply');
    const last = supplies.sort((a, b) => a.x.score - b.x.score)[0];
    if (last && last.o?.kind === 'supply') {
      const need = needs.find((n) => n.locId === (last.o as SupplyContract).destId && n.commodity === (last.o as SupplyContract).commodity);
      if (need) offers[offers.indexOf(last.o)] = supplyOffer(game, last.o.id, board, need, small.id);
    }
  }
  return { locationId: board.id, guild: 'merchants', day: state.day, offers };
}

/** A new Bounty Guild board: 2-4 named bounties and Sweeps, 3-6 offers in all. */
export function bountyBoard(game: Game, board: Location, r: Rng): Board {
  const { data, state } = game;
  const ctx = econContext(state.world, data);
  const c = data.contracts;
  const sectors = state.world.sectors.filter((s) => jumpsBetween(ctx, board.sectorId, s.id) <= c.candidateJumps);
  const offers: Contract[] = [];
  const namedSectors = sectors.filter((s) => securityLevel(s.securityValue, data) <= c.named.maxLevel);
  if (namedSectors.length > 0) {
    const n = r.int(c.named.perBoardMin, c.named.perBoardMax);
    for (let i = 0; i < n; i++) {
      const offer = namedOffer(game, state.contracts.nextId, board, r.pick(namedSectors), r);
      if (!offer) continue;
      state.contracts.nextId++;
      offers.push(offer);
    }
  }
  const total = r.int(c.offersMin, c.offersMax);
  const problems = sectors.map((s) => securityProblem(s, data)).filter((p): p is SecurityProblem => p !== null);
  const candidates: Candidate[] = problems.map((p) => ({ key: [`sector:${p.sectorId}`], score: p.score, advanced: false, build: (id) => sweepOffer(game, id, board, p, r) }));
  for (const x of pick(candidates, Math.max(0, total - offers.length), r)) offers.push(x.build(state.contracts.nextId++));
  return { locationId: board.id, guild: 'bounty', day: state.day, offers };
}

/** New boards at each guild when `boardIntervalDays` have passed (also at the career start). */
export function refreshBoards(game: Game, force = false): void {
  const { data, state } = game;
  const r = rng(game, 'contracts');
  const interval = data.contracts.boardIntervalDays;
  const boards: Board[] = [];
  for (const loc of state.world.locations) {
    for (const guild of ['merchants', 'bounty'] as const) {
      if (!loc.services.includes(guild === 'merchants' ? 'merchants_guild' : 'bounty_guild')) continue;
      const old = state.contracts.boards.find((b) => b.locationId === loc.id && b.guild === guild);
      if (old && !force && state.day - old.day < interval - 1e-9) {
        boards.push(old);
        continue;
      }
      boards.push(guild === 'merchants' ? merchantsBoard(game, loc, r) : bountyBoard(game, loc, r));
    }
  }
  state.contracts.boards = boards;
}
