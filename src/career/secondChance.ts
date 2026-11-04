// The one-time second chance (owner, Q-52, M8-SC-01 to M8-SC-06;
// docs/proposals/second-chance.md). The first time a tow docks the fleet and
// the credits are below 0, the game offers help once:
//   security level 2-4 at the tow location: a guild relief contract (free
//   repair and refuel; deliver 10 t of guild cargo; done clears the debt);
//   level 0-1: a pirate offer (the flagship is traded for a raiding Wasp;
//   capture a spawned trader and deliver it to a Pirate Haven; done clears
//   the debt; then the Haven sells the original ship back).
// If the offer that fits cannot be made (no destination, no target sector, or
// no Pirate Haven in range), the other one is used; if neither fits, no offer
// shows and the second chance stays unused. Headless.
import { addCargo, fleetFreeTonnes, fleetUnits, removeCargo } from '../actor/cargo';
import { addShip, removeShip } from '../actor/fleet';
import { moveCargo } from '../actor/fleetManage';
import { rng } from '../core/game';
import type { Game } from '../core/game';
import type { Actor, Location, RaidContract, ReliefContract, Sector, Ship, Vec } from '../core/types';
import type { CombatShip } from '../combat/types';
import { econContext } from '../econ/context';
import { type Encounter, traderEncounter } from '../encounter/encounter';
import { basePrice, quoteSell } from '../econ/prices';
import { DEBT_TEXT, done, inDebt, isPirateHaven, refused, type ServiceResult } from '../services/common';
import { sellEntryOf, sellShare } from '../services/market';
import { tradeInValue } from '../services/shipyard';
import { createShipFromLoadout } from '../ship/loadout';
import { checkLoadout } from '../ship/rules';
import { travelStats } from '../ship/stats';
import { securityLevel } from '../world/security';
import { needsAt } from './contractGen';

/** Moves all cargo of one ship to the other fleet ships as far as it fits; returns the units that do not fit. */
function moveCargoToFleet(actor: Actor, from: Ship, data: Game['data']): number {
  for (const to of actor.fleet) {
    if (to === from) continue;
    for (const [id, lot] of Object.entries(from.cargo)) moveCargo(data, from, to, id, lot.units);
  }
  return Object.values(from.cargo).reduce((sum, l) => sum + l.units, 0);
}

function jumps(game: Game, a: number, b: number): number {
  return econContext(game.state.world, game.data).sectorJumps[a]?.[b] ?? Infinity;
}

function locOf(game: Game, id: number): Location {
  return game.state.world.locations[id] as Location;
}

function comName(game: Game, id: string): string {
  return game.data.commodityById.get(id)?.name ?? id;
}

export interface ReliefPlan {
  destId: number;
  commodity: string;
  jumps: number;
}

/**
 * Where the relief cargo goes: a raw commodity that a location 0-1 jumps away
 * needs (the contract generator's needs, highest score first); if none, a
 * location in range that trades a raw commodity. Not the tow location.
 */
export function reliefPlan(game: Game, fromId: number): ReliefPlan | null {
  const { data, state } = game;
  const from = locOf(game, fromId);
  const raw = data.commodities.filter((c) => c.tier === 'raw').map((c) => c.id);
  const near = state.world.locations.filter((l) => l.id !== fromId && jumps(game, from.sectorId, l.sectorId) <= data.contracts.secondChance.relief.maxJumps);
  let best: (ReliefPlan & { score: number }) | null = null;
  for (const l of near) {
    for (const n of needsAt(game, l)) {
      if (!raw.includes(n.commodity)) continue;
      if (!best || n.score > best.score) best = { destId: l.id, commodity: n.commodity, jumps: jumps(game, from.sectorId, l.sectorId), score: n.score };
    }
  }
  if (best) return { destId: best.destId, commodity: best.commodity, jumps: best.jumps };
  for (const l of near) {
    const c = raw.find((id) => l.market[id]);
    if (c) return { destId: l.id, commodity: c, jumps: jumps(game, from.sectorId, l.sectorId) };
  }
  return null;
}

export interface RaidPlan {
  sectorId: number;
  havenId: number;
}

/** The target sector (1-2 jumps, security level 2 or lower, nearest first) and the nearest Pirate Haven (3 jumps or less). */
export function raidPlan(game: Game, fromId: number): RaidPlan | null {
  const { data, state } = game;
  const r = data.contracts.secondChance.raid;
  const from = locOf(game, fromId);
  const sectors = state.world.sectors
    .filter((s) => {
      const j = jumps(game, from.sectorId, s.id);
      return j >= r.minJumps && j <= r.maxJumps && securityLevel(s.securityValue, data) <= r.maxLevel && s.locationIds.length > 0;
    })
    .sort((a, b) => jumps(game, from.sectorId, a.id) - jumps(game, from.sectorId, b.id) || a.id - b.id);
  const havens = state.world.locations
    .filter((l) => isPirateHaven(l, data) && jumps(game, from.sectorId, l.sectorId) <= r.havenMaxJumps)
    .sort((a, b) => jumps(game, from.sectorId, a.sectorId) - jumps(game, from.sectorId, b.sectorId) || a.id - b.id);
  const sector = sectors[0];
  const haven = havens[0];
  return sector && haven ? { sectorId: sector.id, havenId: haven.id } : null;
}

/**
 * M8-SC-01: called after a tow docks the fleet. The first time the player is
 * in debt after a tow, an offer waits for the answer (the UI shows it).
 */
export function noteTow(game: Game, actor: Actor, locationId: number): void {
  const sc = game.state.career.secondChance;
  if (actor !== game.state.player || sc.used || actor.credits >= 0 || game.state.career.end) return;
  const { data } = game;
  const loc = locOf(game, locationId);
  const level = securityLevel(game.state.world.sectors[loc.sectorId]?.securityValue ?? 0, data);
  const relief = reliefPlan(game, locationId) !== null;
  const pirate = raidPlan(game, locationId) !== null;
  const want: 'relief' | 'pirate' = level >= data.contracts.secondChance.reliefMinLevel ? 'relief' : 'pirate';
  const kind = want === 'relief' ? (relief ? 'relief' : pirate ? 'pirate' : null) : pirate ? 'pirate' : relief ? 'relief' : null;
  if (!kind) return;
  sc.used = true;
  sc.offer = { kind, locationId };
}

/** M8-SC-01: Decline. The career goes on; the second chance is used. */
export function declineSecondChance(game: Game): void {
  game.state.career.secondChance.offer = null;
  game.bus.message('You decline the offer. You are on your own.', 'warning');
}

/** M8-SC-01: Accept the offer that waits. */
export function acceptSecondChance(game: Game): ServiceResult {
  const sc = game.state.career.secondChance;
  const offer = sc.offer;
  if (!offer) return refused('There is no offer.');
  const r = offer.kind === 'relief' ? acceptRelief(game, offer.locationId) : acceptPirate(game, offer.locationId);
  if (r.ok) sc.offer = null;
  return r;
}

/** Free full repair (hull, armor, engine value) and full refuel of all fleet ships. */
function repairAndRefuel(game: Game, actor: Actor): void {
  for (const ship of actor.fleet) {
    const s = travelStats(ship, game.data);
    ship.hullHp = s.maxHullHp;
    ship.armorHp = s.maxArmorHp;
    ship.engineValue = s.maxEngineValue;
    ship.fuel = s.fuelCapacity;
  }
}

function acceptRelief(game: Game, fromId: number): ServiceResult {
  const { data, state } = game;
  const actor = state.player;
  const plan = reliefPlan(game, fromId);
  if (!plan) return refused('The guild has no relief task here.');
  const rel = data.contracts.secondChance.relief;
  const mass = data.commodityById.get(plan.commodity)?.massPerUnit ?? 1;
  repairAndRefuel(game, actor);
  // The guild cargo, free (purchase price 0); as much as fits.
  const units = Math.min(rel.tonnes, fleetFreeTonnes(actor, data)) / mass;
  if (units <= 1e-6) return refused('Your fleet has no free cargo space for the guild cargo.');
  addCargo(actor, data, plan.commodity, units, 0);
  const c: ReliefContract = {
    kind: 'relief',
    id: state.contracts.nextId++,
    boardId: fromId,
    postedDay: state.day,
    reason: `${comName(game, plan.commodity)} for ${locOf(game, plan.destId).name}`,
    destId: plan.destId,
    commodity: plan.commodity,
    units,
    delivered: 0,
    deadline: state.day + rel.deadlineBase + rel.deadlinePerJump * plan.jumps,
  };
  state.contracts.active.push(c);
  return done(`The Merchants' Guild repairs and refuels your fleet and loads ${Math.round(units * mass)} t of ${comName(game, plan.commodity)}. Deliver it to ${locOf(game, plan.destId).name}; the guild then clears your debt.`);
}

function acceptPirate(game: Game, fromId: number): ServiceResult {
  const { data, state } = game;
  const actor = state.player;
  const plan = raidPlan(game, fromId);
  if (!plan) return refused('The pirates have no job here.');
  const r = data.contracts.secondChance.raid;
  const flag = actor.fleet[actor.flagshipIndex];
  if (!flag) return refused('You have no ship.');
  // The flagship's cargo moves to the other ships as far as it fits; the rest is lost.
  const lost = moveCargoToFleet(actor, flag, data);
  const wasp = createShipFromLoadout(data, r.loadoutId, `ship-${state.nextId++}`, r.shipName);
  wasp.fuel = travelStats(wasp, data).fuelCapacity;
  state.career.secondChance.traded = { ship: structuredClone(flag), price: tradeInValue(flag, data) };
  actor.fleet[actor.flagshipIndex] = wasp;
  // The haven and the target sector become known.
  const k = actor.knowledge.knownSectors;
  for (const id of [plan.sectorId, locOf(game, plan.havenId).sectorId]) if (!k.includes(id)) k.push(id);
  const names = r.targetNames;
  const targetName = names[rng(game, 'contracts').int(0, names.length - 1)] as string;
  const c: RaidContract = {
    kind: 'raid',
    id: state.contracts.nextId++,
    boardId: fromId,
    postedDay: state.day,
    reason: `capture the ${targetName}`,
    sectorId: plan.sectorId,
    havenId: plan.havenId,
    deadline: state.day + r.days,
    targetName,
    targetLoadout: r.targetLoadout,
    prizeShipId: null,
  };
  state.contracts.active.push(c);
  const lostText = lost > 1e-6 ? ` ${Math.round(lost)} units of cargo do not fit in your other ships and are lost.` : '';
  return done(`The pirates take ${flag.name} and give you a ${r.shipName}.${lostText} Capture the ${targetName} in ${state.world.sectors[plan.sectorId]?.name ?? '?'} and bring it to ${locOf(game, plan.havenId).name}.`);
}

/** M8-SC-02: deliver relief cargo at the destination. Done clears the debt (credits 0 if below 0). */
export function deliverRelief(game: Game, contractId: number): ServiceResult {
  const { state, data } = game;
  const actor = state.player;
  const c = state.contracts.active.find((x): x is ReliefContract => x.id === contractId && x.kind === 'relief');
  if (!c) return refused('There is no such relief contract.');
  if (actor.position.kind !== 'docked' || actor.position.locationId !== c.destId) return refused(`Deliver at ${locOf(game, c.destId).name}.`);
  const units = Math.min(fleetUnits(actor, c.commodity), c.units - c.delivered);
  if (units <= 1e-9) return refused(`You have no ${comName(game, c.commodity)} to deliver.`);
  removeCargo(actor, c.commodity, units);
  const entry = locOf(game, c.destId).market[c.commodity];
  if (entry) entry.stock += units;
  c.delivered += units;
  if (c.delivered < c.units - 1e-6) return done(`You deliver ${Math.round(units)} ${comName(game, c.commodity)}. ${Math.round(c.units - c.delivered)} to go.`);
  actor.credits = Math.max(0, actor.credits);
  finish(game, c, true);
  state.contracts.completed++;
  state.career.stats.contractsCompleted++;
  return done(`Relief contract done. The Merchants' Guild clears your debt. ${data.contracts.standingCompleted > 0 ? 'Standing +1.' : ''}`.trim());
}

function finish(game: Game, c: ReliefContract | RaidContract, ok: boolean, text?: string): void {
  game.state.contracts.active = game.state.contracts.active.filter((x) => x.id !== c.id);
  if (text) game.bus.message(text, ok ? 'good' : 'danger');
}

/** Each day: deadlines and lost cargo (M8-SC-02, M8-SC-03). */
export function secondChanceDay(game: Game): void {
  const { state } = game;
  for (const c of [...state.contracts.active]) {
    if (c.kind === 'relief') {
      const lost = fleetUnits(state.player, c.commodity) < c.units - c.delivered - 1e-6;
      if (state.day > c.deadline || lost) {
        removeCargo(state.player, c.commodity, c.units - c.delivered);
        state.contracts.failed++;
        state.career.stats.contractsFailed++;
        finish(game, c, false, `Relief contract failed${lost ? ' (the cargo is lost)' : ''}. The debt stays. Standing ${game.data.contracts.standingFailed}.`);
      }
    } else if (c.kind === 'raid') {
      if (raidArrival(game)) continue;
      if (state.day > c.deadline) failRaid(game, c, `The pirate job is over: ${game.data.contracts.secondChance.raid.days} days passed. You keep the Wasp; the debt stays.`);
    }
  }
}

function failRaid(game: Game, c: RaidContract, text: string): void {
  game.state.career.secondChance.traded = null;
  finish(game, c, false, text);
}

/** M8-SC-03: the guaranteed target encounter on arrival in the sector or on Hunt there. */
export function raidEncounter(game: Game, sector: Sector, point: Vec): Encounter | null {
  const { state, data } = game;
  const c = state.contracts.active.find((x): x is RaidContract => x.kind === 'raid' && x.sectorId === sector.id && x.prizeShipId === null && state.day <= x.deadline);
  if (!c) return null;
  const enc = traderEncounter(sector, point, state.world.locations, rng(game, 'encounter'), data);
  const main = enc.ships[0];
  if (main) main.loadoutId = c.targetLoadout;
  return { ...enc, name: c.targetName, namedId: c.id };
}

/** The battle ship ids of a named or raid group (ui/combatStart.ts): `named-<contract id>-<index>`. */
export function namedShipId(contractId: number, index: number): string {
  return `named-${contractId}-${index}`;
}

/** After a battle with the raid target: a target that was destroyed or got away fails the job. */
export function raidBattle(game: Game, namedId: number | null, ships: CombatShip[]): void {
  const c = game.state.contracts.active.find((x): x is RaidContract => x.kind === 'raid' && x.id === namedId);
  if (!c) return;
  const target = ships.find((s) => s.side === 'other' && s.ship.id === namedShipId(c.id, 0));
  if (!target) return;
  if (target.status === 'destroyed') failRaid(game, c, `The ${c.targetName} is destroyed. The pirate job fails; you keep the Wasp, and the debt stays.`);
  else if (target.status === 'fled') failRaid(game, c, `The ${c.targetName} gets away. The pirate job fails; you keep the Wasp, and the debt stays.`);
  else if (target.status === 'surrendered') game.bus.message(`The ${c.targetName} surrenders. Take it as a prize and bring it to ${locOf(game, c.havenId).name}.`, 'good');
}

/** M8-SC-03: a prize from the raid target (career/prize.ts). */
export function notePrize(game: Game, cs: CombatShip, prize: Ship): void {
  const c = game.state.contracts.active.find((x): x is RaidContract => x.kind === 'raid' && x.prizeShipId === null && cs.ship.id === namedShipId(x.id, 0));
  if (c) c.prizeShipId = prize.id;
}

/**
 * M8-SC-03: docked at the Pirate Haven with the captured vessel in the fleet.
 * The pirates take the vessel; its cargo is sold at the Haven for the player;
 * the debt is cleared; the Haven offers the original ship back (M8-SC-04).
 * Returns true if the job is done.
 */
export function raidArrival(game: Game): boolean {
  const { state, data } = game;
  const actor = state.player;
  if (actor.position.kind !== 'docked') return false;
  const here = actor.position.locationId;
  const c = state.contracts.active.find((x): x is RaidContract => x.kind === 'raid' && x.havenId === here && x.prizeShipId !== null);
  if (!c) return false;
  const index = actor.fleet.findIndex((s) => s.id === c.prizeShipId);
  const vessel = actor.fleet[index];
  if (!vessel) return false;
  const haven = locOf(game, here);
  let sale = 0;
  for (const [id, lot] of Object.entries(vessel.cargo)) {
    const entry = sellEntryOf(haven, id, data);
    if (!entry || lot.units <= 1e-9) continue;
    sale += quoteSell(entry, basePrice(data, id), lot.units, data).total * sellShare(haven, data);
    entry.stock += lot.units;
  }
  vessel.cargo = {};
  if (actor.fleet.length > 1) removeShip(game, actor, index);
  actor.credits = Math.max(0, actor.credits) + sale;
  const traded = state.career.secondChance.traded;
  if (traded) state.career.secondChance.buyback = { locationId: here, ship: traded.ship, price: traded.price };
  state.career.secondChance.traded = null;
  finish(game, c, true, `The pirates take the ${c.targetName}; the debt is cleared.${sale > 0 ? ` Its cargo sells for ${Math.round(sale)} cr.` : ''}${traded ? ` ${haven.name} offers ${traded.ship.name} back for ${Math.round(traded.price)} cr (B on the location screen).` : ''}`);
  return true;
}

/** M8-SC-04: buy the original ship back at the Pirate Haven. */
export function buyBack(game: Game): ServiceResult {
  const { state } = game;
  const actor = state.player;
  const b = state.career.secondChance.buyback;
  if (!b) return refused('There is no ship to buy back.');
  if (actor.position.kind !== 'docked' || actor.position.locationId !== b.locationId) return refused(`Buy it back at ${locOf(game, b.locationId).name}.`);
  if (inDebt(actor)) return refused(DEBT_TEXT);
  if (actor.credits < b.price - 1e-9) return refused(`You need ${Math.round(b.price)} cr.`);
  const ship = structuredClone(b.ship);
  ship.id = `ship-${state.nextId++}`;
  const full = addShip(game, actor, ship);
  if (full) return refused(`${full} Sell or scuttle a ship first.`);
  actor.credits -= b.price;
  state.career.secondChance.buyback = null;
  return done(`You buy ${ship.name} back for ${Math.round(b.price)} cr. F on the fleet screen makes it the flagship.`);
}

/**
 * M8-SC-06: stuck = in debt, no cargo, one ship, no module that can come out
 * with the loadout still valid, and no second-chance contract active.
 */
export function isStuck(game: Game): boolean {
  const { state, data } = game;
  const actor = state.player;
  if (actor.credits >= 0 || actor.fleet.length !== 1) return false;
  if (state.contracts.active.some((c) => c.kind === 'relief' || c.kind === 'raid')) return false;
  if (state.career.secondChance.offer) return false;
  const ship = actor.fleet[0] as Ship;
  if (Object.values(ship.cargo).some((l) => l.units > 1e-6)) return false;
  for (const kind of ['hardpoints', 'internal'] as const) {
    for (let i = 0; i < ship[kind].length; i++) {
      const m = ship[kind][i];
      if (!m) continue;
      const copy = structuredClone(ship);
      copy[kind][i] = null;
      if (checkLoadout(copy, data).errors.length === 0) return false;
    }
  }
  return true;
}
