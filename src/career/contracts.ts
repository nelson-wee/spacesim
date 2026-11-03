// Contract play (Sections 14.4-14.7): accept an offer at its board, deliver
// Supply cargo, pick up and deliver Freight, count Sweep kills, meet and beat
// named pirates, and collect kill bounties. Deadlines and expiry run each day.
// A completed contract changes the world: goods go into real market stock,
// and pirate kills change real security. All functions are headless.
import { addCargo, fleetFreeTonnes, fleetUnits, removeCargo } from '../actor/cargo';
import type { Battle } from '../combat/types';
import type { Game } from '../core/game';
import type { Actor, Contract, FreightContract, Location, NamedBounty, Sector, SupplyContract, Vec } from '../core/types';
import type { GameData } from '../data';
import { type Encounter, isWanted, pirateBehavior } from '../encounter/encounter';
import { DEBT_TEXT, done, inDebt, refused, type ServiceResult } from '../services/common';
import { shipTu } from '../ship/threat';
import { changeSecurity, securityLevel } from '../world/security';
import { addNotoriety } from './notoriety';

/** Merchants' Guild standing (Section 14.4): completed - 2 x failed, at least 0. */
export function standing(game: Game): number {
  const c = game.state.contracts;
  const d = game.data.contracts;
  return Math.max(0, c.completed * d.standingCompleted + c.failed * d.standingFailed);
}

function isMerchants(c: Contract): boolean {
  return c.kind === 'supply' || c.kind === 'freight';
}

function loc(game: Game, id: number): Location {
  return game.state.world.locations[id] as Location;
}

function docked(actor: Actor): number | null {
  return actor.position.kind === 'docked' ? actor.position.locationId : null;
}

function name(data: GameData, commodity: string): string {
  return data.commodityById.get(commodity)?.name ?? commodity;
}

/** Why the player cannot accept this offer now, or null (Sections 14.4, 14.7, 8.6). */
export function acceptProblem(game: Game, offer: Contract): string | null {
  const { data, state } = game;
  const actor = state.player;
  const limits = data.contracts.limits;
  if (inDebt(actor)) return DEBT_TEXT;
  if (state.contracts.active.some((c) => c.id === offer.id)) return 'You have this contract already.';
  const active = state.contracts.active;
  if (isMerchants(offer) && active.filter(isMerchants).length >= limits.merchants) return `You have ${limits.merchants} Merchants' Guild contracts already.`;
  if (offer.kind === 'named' && active.filter((c) => c.kind === 'named').length >= limits.named) return `You have ${limits.named} named bounties already.`;
  if (offer.kind === 'sweep' && active.filter((c) => c.kind === 'sweep').length >= limits.sweep) return 'You have a Sweep contract already.';
  if (offer.kind === 'freight') {
    const need = data.contracts.sizes.find((s) => s.id === offer.sizeId)?.standing ?? 0;
    if (standing(game) < need) return `This Freight contract needs standing ${need} (you have ${standing(game)}).`;
  }
  if (offer.kind === 'named' && state.day > offer.expiry) return 'This bounty has expired.';
  return null;
}

/** Accepts an offer of a board where the player is docked. */
export function acceptContract(game: Game, boardLocationId: number, offerId: number): ServiceResult {
  const { state, data } = game;
  if (docked(state.player) !== boardLocationId) return refused('Dock at the guild to accept a contract.');
  const board = state.contracts.boards.find((b) => b.locationId === boardLocationId && b.offers.some((o) => o.id === offerId));
  const offer = board?.offers.find((o) => o.id === offerId);
  if (!board || !offer) return refused('There is no such offer.');
  const why = acceptProblem(game, offer);
  if (why) return refused(why);
  board.offers = board.offers.filter((o) => o.id !== offerId);
  if (offer.kind === 'sweep') offer.deadline = state.day + data.contracts.sweep.deadlineDays;
  state.contracts.active.push(offer);
  return done(`You accept the contract: ${offer.reason}.`);
}

function complete(game: Game, c: Contract, text: string): void {
  const s = game.state.contracts;
  s.active = s.active.filter((x) => x.id !== c.id);
  if (isMerchants(c)) s.completed++;
  const career = game.state.career;
  if (c.kind === 'supply' || c.kind === 'freight') career.stats.contractsCompleted++;
  if (c.kind === 'named') career.stats.namedBounties++;
  if (c.kind === 'sweep') career.stats.sweeps++;
  game.bus.message(text, 'good');
}

function fail(game: Game, c: Contract, text: string): void {
  const s = game.state.contracts;
  s.active = s.active.filter((x) => x.id !== c.id);
  if (isMerchants(c)) {
    s.failed++;
    game.state.career.stats.contractsFailed++;
  }
  game.bus.message(text, 'danger');
}

/**
 * Delivers Supply cargo at the destination: partial deliveries are paid at once
 * (the goods at the contract price, and the share of the flat fee); the goods
 * go into the market stock (Section 14.4).
 */
export function deliverSupply(game: Game, contractId: number): ServiceResult {
  const { state, data } = game;
  const actor = state.player;
  const c = state.contracts.active.find((x): x is SupplyContract => x.id === contractId && x.kind === 'supply');
  if (!c) return refused('There is no such Supply contract.');
  if (docked(actor) !== c.destId) return refused(`Deliver at ${loc(game, c.destId).name}.`);
  // The last delivery may top up to all units; the contract is done at completeShare (perishable goods).
  const units = Math.min(c.units - c.delivered, fleetUnits(actor, c.commodity));
  if (units <= 1e-9) return refused(`You have no ${name(data, c.commodity)} to deliver.`);
  removeCargo(actor, c.commodity, units);
  const dest = loc(game, c.destId);
  const entry = dest.market[c.commodity];
  if (entry) entry.stock += units;
  // The goods at the contract price, and the flat fee in step with the units (owner, 2026-11-03).
  const pay = units * c.price + (c.fee * units) / c.units;
  actor.credits += pay;
  c.delivered += units;
  state.career.stats.cargoTradedTonnes += units * (data.commodityById.get(c.commodity)?.massPerUnit ?? 1);
  const text = `You deliver ${Math.round(units)} ${name(data, c.commodity)} to ${dest.name} for ${Math.round(pay)} cr.`;
  if (c.delivered >= c.units * data.contracts.supply.completeShare - 1e-6) complete(game, c, `Supply contract done: ${text}`);
  return done(text);
}

/** Picks up Freight cargo at A: it leaves A's stock; the deposit is paid (Section 14.4). */
export function pickupFreight(game: Game, contractId: number): ServiceResult {
  const { state, data } = game;
  const actor = state.player;
  const c = state.contracts.active.find((x): x is FreightContract => x.id === contractId && x.kind === 'freight');
  if (!c) return refused('There is no such Freight contract.');
  if (c.pickedDay !== null) return refused('You have this cargo already.');
  if (docked(actor) !== c.fromId) return refused(`Pick up the cargo at ${loc(game, c.fromId).name}.`);
  const mass = data.commodityById.get(c.commodity)?.massPerUnit ?? 1;
  if (fleetFreeTonnes(actor, data) < c.units * mass - 1e-6) return refused(`You need ${Math.round(c.units * mass)} t of free cargo space.`);
  if (actor.credits < c.deposit - 1e-9) return refused(`You need ${Math.round(c.deposit)} cr for the deposit.`);
  const entry = loc(game, c.fromId).market[c.commodity];
  const units = Math.min(c.units, Math.max(0, entry?.stock ?? 0));
  if (units <= 1e-9) return refused(`${loc(game, c.fromId).name} has no ${name(data, c.commodity)} now.`);
  if (entry) entry.stock -= units;
  c.units = units;
  actor.credits -= c.deposit;
  addCargo(actor, data, c.commodity, units, 0);
  const f = data.contracts.freight;
  c.pickedDay = state.day;
  c.deadline = state.day + f.deadlineBase + f.deadlinePerJump * c.jumps;
  return done(`You load ${Math.round(units)} ${name(data, c.commodity)} and pay a deposit of ${Math.round(c.deposit)} cr. Deliver to ${loc(game, c.toId).name} by day ${Math.floor(c.deadline) + 1}.`);
}

/** Delivers Freight cargo at B: the fee and the deposit are paid; the cargo goes into B's stock. */
export function deliverFreight(game: Game, contractId: number): ServiceResult {
  const { state, data } = game;
  const actor = state.player;
  const c = state.contracts.active.find((x): x is FreightContract => x.id === contractId && x.kind === 'freight');
  if (!c) return refused('There is no such Freight contract.');
  if (c.pickedDay === null) return refused(`Pick up the cargo at ${loc(game, c.fromId).name} first.`);
  if (docked(actor) !== c.toId) return refused(`Deliver at ${loc(game, c.toId).name}.`);
  if (fleetUnits(actor, c.commodity) < c.units - 1e-6) return refused(`You do not have all ${Math.round(c.units)} ${name(data, c.commodity)}.`);
  removeCargo(actor, c.commodity, c.units);
  const entry = loc(game, c.toId).market[c.commodity];
  if (entry) entry.stock += c.units;
  actor.credits += c.fee + c.deposit;
  state.career.stats.cargoTradedTonnes += c.units * (data.commodityById.get(c.commodity)?.massPerUnit ?? 1);
  complete(game, c, `Freight contract done: you deliver ${Math.round(c.units)} ${name(data, c.commodity)} to ${loc(game, c.toId).name}. Fee ${Math.round(c.fee)} cr; deposit back.`);
  return done('Freight delivered.');
}

/**
 * Daily contract checks: deadlines and expiry; Freight cargo that is no longer
 * in the fleet (lost to pirates) fails the contract (Section 14.4). A failed
 * Freight contract also takes back what is left of its cargo.
 */
export function contractDay(game: Game): void {
  const { state, data } = game;
  const actor = state.player;
  for (const c of [...state.contracts.active]) {
    if (c.kind === 'supply' && state.day > c.deadline) {
      fail(game, c, `Supply contract failed: ${c.reason}. Standing ${data.contracts.standingFailed}.`);
    } else if (c.kind === 'freight') {
      const lost = c.pickedDay !== null && fleetUnits(actor, c.commodity) < c.units - 1e-6;
      if (state.day > c.deadline || lost) {
        if (c.pickedDay !== null) removeCargo(actor, c.commodity, c.units);
        fail(game, c, `Freight contract failed${lost ? ' (cargo lost)' : ''}: the deposit is lost. Standing ${data.contracts.standingFailed}.`);
      }
    } else if (c.kind === 'sweep' && c.deadline !== null && state.day > c.deadline) {
      state.contracts.active = state.contracts.active.filter((x) => x.id !== c.id);
      game.bus.message(`Sweep contract ended: ${c.kills} of ${c.ships} pirates in ${state.world.sectors[c.sectorId]?.name ?? '?'}.`, 'warning');
    } else if (c.kind === 'named' && state.day > c.expiry) {
      state.contracts.active = state.contracts.active.filter((x) => x.id !== c.id);
      game.bus.message(`Named bounty expired: ${c.name}.`, 'warning');
    }
  }
}

function levelBonus(sector: Sector | undefined, bonus: number, data: GameData): number {
  return 1 + bonus * (4 - securityLevel(sector?.securityValue ?? 0, data));
}

/** The guaranteed encounter with a named group (Section 14.6): on arrival in its sector or on Hunt there. */
export function namedEncounter(game: Game, sector: Sector, point: Vec): Encounter | null {
  const { state, data } = game;
  const c = state.contracts.active.find((x): x is NamedBounty => x.kind === 'named' && x.sectorId === sector.id && state.day <= x.expiry);
  if (!c) return null;
  const { behavior, ratio } = pirateBehavior(c.tu, state.player, sector, data);
  return {
    kind: 'pirate',
    sectorId: sector.id,
    point,
    name: c.name,
    ships: c.ships.map((s) => ({ loadoutId: s.loadoutId, tier: s.tier, ai: 'raider', faction: 'pirate', escortOf: null, cargo: {} })),
    groupTu: c.tu,
    behavior,
    ratio,
    hostile: true,
    namedId: c.id,
  };
}

/**
 * After a battle: kill bounties for pirate ships destroyed or captured (not
 * while Wanted), Sweep kills in the contract sector, and a named group beaten
 * (all its ships destroyed or surrendered). Sweep and named rewards are paid
 * at once; kill bounties wait at the Bounty Guilds (Section 14.6).
 */
export function battleContracts(game: Game, b: Battle): void {
  const { state, data } = game;
  const sector = b.sectorId === null ? undefined : state.world.sectors[b.sectorId];
  const beaten = b.ships.filter((s) => s.side === 'other' && s.faction === 'pirate' && (s.status === 'destroyed' || s.status === 'surrendered'));
  if (beaten.length === 0) return;
  const k = data.contracts.kill;
  if (!isWanted(state.player, data)) {
    const bounty = beaten.reduce((sum, s) => sum + shipTu(s.ship, data), 0) * k.rewardPerTu * levelBonus(sector, k.levelBonus, data);
    state.contracts.killBounty += bounty;
    game.bus.message(`Kill bounty: ${Math.round(bounty)} cr to collect at a Bounty Guild.`, 'good');
  }
  for (const c of [...state.contracts.active]) {
    if (c.kind === 'sweep' && sector && c.sectorId === sector.id) {
      c.kills += beaten.length;
      if (c.kills >= c.ships) {
        state.player.credits += c.reward;
        changeSecurity(sector, data.contracts.sweep.change, data);
        complete(game, c, `Sweep contract done in ${sector.name}: ${Math.round(c.reward)} cr.`);
      }
    }
    if (c.kind === 'named' && b.namedId === c.id && b.result === 'win') {
      state.player.credits += c.reward;
      const s = state.world.sectors[c.sectorId];
      if (s) changeSecurity(s, data.contracts.named.change, data);
      addNotoriety(state.player, data.contracts.named.notoriety, data);
      complete(game, c, `Named bounty done: ${c.name}. Reward ${Math.round(c.reward)} cr.`);
    }
  }
}

/** Pays the kill bounties at a Bounty Guild (Section 14.6). Wanted players are not paid. */
export function collectBounty(game: Game, location: Location): ServiceResult {
  const { state, data } = game;
  if (docked(state.player) !== location.id || !location.services.includes('bounty_guild')) return refused('Collect kill bounties at a Bounty Guild.');
  if (isWanted(state.player, data)) return refused('The Bounty Guild does not pay Wanted captains.');
  const owed = state.contracts.killBounty;
  if (owed <= 1e-9) return refused('You have no kill bounty to collect.');
  state.player.credits += owed;
  state.contracts.killBounty = 0;
  return done(`You collect ${Math.round(owed)} cr of kill bounties.`);
}
