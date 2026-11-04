// A random player for the play test (M8): each turn it does one action that
// the screens allow where the fleet is, with random arguments. It finds
// states that the careful bots never reach. All randomness comes from a
// seeded Rng stream of the tool (not the game's own streams).
import { fleetUnits } from '../../src/actor/cargo';
import { removeShip, renameShip, setFlagship } from '../../src/actor/fleet';
import { type HeldModule, installModule, moveAllCargo, moveCargo, moveModule, uninstallModule } from '../../src/actor/fleetManage';
import { actorPlace, hunt, jump, travelInSector } from '../../src/actor/travel';
import { finishBattle } from '../../src/career/battleEnd';
import { retire } from '../../src/career/career';
import { attackNonPirate } from '../../src/career/consequences';
import { acceptContract, collectBounty, deliverFreight, deliverSupply, pickupFreight } from '../../src/career/contracts';
import { surrenderedShips, takePrize } from '../../src/career/prize';
import { acceptSecondChance, buyBack, declineSecondChance, deliverRelief, isStuck } from '../../src/career/secondChance';
import { createBattle } from '../../src/combat/battle';
import { resolveTurn } from '../../src/combat/resolver';
import type { Game } from '../../src/core/game';
import { rng as gameRng } from '../../src/core/game';
import type { Rng } from '../../src/core/rng';
import type { Location } from '../../src/core/types';
import { battleMapFor } from '../../src/encounter/battleMap';
import { type Encounter, fleeCargoLoss, fleeSucceeds, payTribute } from '../../src/encounter/encounter';
import { hasService } from '../../src/services/common';
import { buyInsurance } from '../../src/services/insurance';
import { buy, buyLimit, sell } from '../../src/services/market';
import { repair } from '../../src/services/mechanic';
import { buyModule, moduleOffers, sellModule, setModuleOn } from '../../src/services/outfitter';
import { refuel } from '../../src/services/refuel';
import { buyHull, buyShip, hullOffers, sellShip } from '../../src/services/shipyard';
import { wait } from '../../src/services/wait';
import { createShipFromLoadout } from '../../src/ship/loadout';
import { slotSizesOf } from '../../src/ship/rules';

export interface ChaosLog {
  actions: Record<string, number>;
  battles: number;
  prizes: number;
  last: string[];
}

export function newChaosLog(): ChaosLog {
  return { actions: {}, battles: 0, prizes: 0, last: [] };
}

function note(log: ChaosLog, game: Game, text: string): void {
  const key = text.split(':')[0] as string;
  log.actions[key] = (log.actions[key] ?? 0) + 1;
  log.last.push(`d${game.state.day.toFixed(1)} ${text}`);
  if (log.last.length > 12) log.last.shift();
}

/** A battle with the AI on both sides; the player may then take prizes. */
export function playBattle(game: Game, enc: Encounter, aggressor: 'player' | 'other', r: Rng, log: ChaosLog): void {
  const { data, state } = game;
  const actor = state.player;
  const flag = actor.fleet[actor.flagshipIndex];
  if (!flag) return;
  const sector = state.world.sectors[enc.sectorId];
  let b = createBattle(
    {
      player: [{ ship: flag, ai: r.chance(0.5) ? 'attack' : 'human' }],
      other: enc.ships.map((s, i) => {
        const id = enc.namedId !== undefined ? `named-${enc.namedId}-${i}` : `e${i}`;
        const ship = createShipFromLoadout(data, s.loadoutId, id, s.loadoutId, s.tier);
        ship.cargo = structuredClone(s.cargo);
        return { ship, ai: s.ai, faction: s.faction, escortOf: s.escortOf ?? undefined, powerPriority: data.loadoutById.get(s.loadoutId)?.powerPriority };
      }),
      aggressor,
      rng: state.rng.combat,
      map: sector ? battleMapFor(sector, enc.point, state.world.locations, data) : undefined,
      sectorId: enc.sectorId,
      sector: sector ? { securityValue: sector.securityValue, development: sector.development } : undefined,
      namedId: enc.namedId,
    },
    data,
  );
  let guard = 0;
  while (!b.result && guard++ < 200) b = resolveTurn(b, null, data).battle;
  if (!b.result) throw new Error('battle did not end in 200 turns');
  log.battles++;
  const boarded = b.result === 'win' ? surrenderedShips(b) : [];
  finishBattle(game, actor, b, { boarding: 'manual' });
  if (state.career.end) return;
  for (const cs of boarded) {
    if (r.chance(0.5)) {
      if (takePrize(game, actor, cs).ok) log.prizes++;
    } else for (const s of [...actor.fleet]) moveAllCargo(data, cs.ship, s, true);
  }
  // After a battle the player can scuttle a ship (fleet screen).
  if (actor.fleet.length > 1 && r.chance(0.05)) removeShip(game, actor, r.int(0, actor.fleet.length - 1));
}

function handleEncounter(game: Game, enc: Encounter, r: Rng, log: ChaosLog, peaceful: boolean): void {
  const actor = game.state.player;
  const hostile = (enc.kind === 'pirate' && enc.behavior === 'attack') || (enc.kind === 'patrol' && enc.hostile);
  const roll = r.int(0, 3);
  if (enc.kind === 'trader' || (enc.kind === 'patrol' && !enc.hostile)) {
    if ((roll === 0 && !peaceful) || enc.namedId !== undefined) {
      attackNonPirate(game, actor, enc.sectorId);
      note(log, game, `attack: ${enc.name}`);
      playBattle(game, enc, 'player', r, log);
    } else note(log, game, `ignore: ${enc.name}`);
    return;
  }
  if (enc.kind === 'pirate' && enc.behavior === 'tribute' && roll === 0) {
    payTribute(actor, game.data);
    note(log, game, 'tribute');
    return;
  }
  if ((hostile || enc.behavior === 'tribute') && roll === 1) {
    if (fleeSucceeds(actor, enc, gameRng(game, 'encounter'), game.data)) {
      fleeCargoLoss(actor, gameRng(game, 'encounter'), game.data);
      note(log, game, 'flee: ok');
      return;
    }
    note(log, game, 'flee: failed');
    playBattle(game, enc, 'other', r, log);
    return;
  }
  if (!hostile && enc.behavior !== 'tribute' && roll >= 2) {
    note(log, game, `ignore: ${enc.name}`);
    return;
  }
  note(log, game, `fight: ${enc.name}`);
  playBattle(game, enc, hostile ? 'other' : 'player', r, log);
}

function docked(game: Game): Location | null {
  const p = game.state.player.position;
  return p.kind === 'docked' ? (game.state.world.locations[p.locationId] ?? null) : null;
}

/** One random action. Returns false when the career ended. */
export function chaosTurn(game: Game, r: Rng, log: ChaosLog, peaceful = false): boolean {
  const { state, data } = game;
  const actor = state.player;
  if (state.career.end) return false;
  const sc = state.career.secondChance;
  if (sc.offer) {
    if (r.chance(0.7)) note(log, game, `second chance accept: ${acceptSecondChance(game).text}`);
    else {
      declineSecondChance(game);
      note(log, game, 'second chance decline');
    }
    return true;
  }
  const loc = docked(game);
  // The stuck message offers Retire (M8-SC-06): a player takes it.
  if (loc && isStuck(game)) {
    const end = retire(game);
    note(log, game, `retire (stuck): ${typeof end === 'string' ? end : end.reason}`);
    return !state.career.end;
  }
  const place = actorPlace(game, actor);
  const sector = state.world.sectors[place.sectorId];
  const travelTo = (dest: Parameters<typeof travelInSector>[2]) => {
    const out = travelInSector(game, actor, dest, true);
    note(log, game, `travel: ${out.result}`);
    if (out.result === 'encounter') handleEncounter(game, out.encounter, r, log, peaceful);
  };
  if (!loc) {
    const roll = r.int(0, 9);
    if (roll < 2 && actor.position.kind !== 'jumpPoint') {
      const out = hunt(game, actor);
      note(log, game, `hunt: ${out.result}`);
      if (out.result === 'encounter') handleEncounter(game, out.encounter, r, log, peaceful);
    } else if (roll < 4 && actor.position.kind === 'jumpPoint') {
      const out = jump(game, actor, true);
      note(log, game, `jump: ${out.result}`);
      if (out.result === 'encounter') handleEncounter(game, out.encounter, r, log, peaceful);
    } else if (roll < 6 && sector && sector.jumpPointIds.length) {
      // A player who cannot dock (refusals) can leave by a jump point; with too little fuel a tug comes.
      travelTo({ kind: 'jumpPoint', jumpPointId: r.pick(sector.jumpPointIds) });
    } else if (sector) travelTo({ kind: 'location', locationId: r.pick(sector.locationIds) });
    return !state.career.end;
  }
  const ship = r.pick(actor.fleet);
  const si = actor.fleet.indexOf(ship);
  const roll = r.int(0, 29);
  const has = (id: string) => hasService(loc, id);
  if (roll <= 3) {
    const ids = Object.keys(loc.market);
    const c = r.pick(ids);
    const max = buyLimit(actor, loc, c, data).units;
    note(log, game, `buy: ${buy(game, actor, loc, c, r.chance(0.5) ? max : r.range(0, max)).ok}`);
  } else if (roll <= 6) {
    const held = Object.keys(Object.assign({}, ...actor.fleet.map((s) => s.cargo)));
    if (held.length) {
      const c = r.pick(held);
      note(log, game, `sell: ${sell(game, actor, loc, c, r.chance(0.5) ? fleetUnits(actor, c) : r.range(0, fleetUnits(actor, c))).ok}`);
    }
  } else if (roll === 7) note(log, game, `refuel: ${refuel(game, actor, loc).ok}`);
  else if (roll === 8 && has('mechanic')) note(log, game, `repair: ${repair(game, actor, loc, si).ok}`);
  else if ((roll === 9 || (peaceful && !actor.insurance)) && has('insurance')) note(log, game, `insure: ${buyInsurance(game, actor, loc).ok}`);
  else if (roll === 10 && has('outfitter')) {
    const kind = r.chance(0.4) ? 'hardpoint' : 'internal';
    const sizes = slotSizesOf(ship, kind, data);
    if (sizes.length) {
      const i = r.int(0, sizes.length - 1);
      const offers = moduleOffers(loc, data).filter((o) => data.moduleById.get(o.moduleId)?.slot === kind);
      if ((kind === 'hardpoint' ? ship.hardpoints : ship.internal)[i]) note(log, game, `sell module: ${sellModule(game, actor, loc, si, kind, i).ok}`);
      else if (offers.length) note(log, game, `buy module: ${buyModule(game, actor, loc, si, kind, i, r.pick(offers)).ok}`);
    }
  } else if (roll === 11) {
    const kind = r.chance(0.4) ? 'hardpoint' : 'internal';
    const list = kind === 'hardpoint' ? ship.hardpoints : ship.internal;
    const i = list.findIndex((m) => m !== null);
    if (i >= 0) setModuleOn(ship, kind, i, !list[i]?.on);
    note(log, game, 'toggle module');
  } else if (roll === 12 && has('shipyard')) {
    const offers = hullOffers(loc, data);
    if (offers.length) {
      const o = r.pick(offers);
      note(log, game, r.chance(0.5) ? `buy ship: ${buyShip(game, actor, loc, o.hullId).ok}` : `trade-in hull: ${buyHull(game, actor, loc, si, o.hullId).ok}`);
    }
  } else if (roll === 13 && has('shipyard') && actor.fleet.length > 1) note(log, game, `sell ship: ${sellShip(game, actor, loc, si).ok}`);
  else if (roll === 14) note(log, game, `wait: ${wait(game, actor, loc, r.int(1, 7)).ok}`);
  else if (roll === 15) {
    const offers = state.contracts.boards.filter((b) => b.locationId === loc.id).flatMap((b) => b.offers);
    if (offers.length) note(log, game, `accept: ${acceptContract(game, loc.id, r.pick(offers).id).ok}`);
  } else if (roll === 16) {
    for (const c of [...state.contracts.active]) {
      if (c.kind === 'supply') deliverSupply(game, c.id);
      if (c.kind === 'freight') {
        pickupFreight(game, c.id);
        deliverFreight(game, c.id);
      }
      if (c.kind === 'relief') deliverRelief(game, c.id);
    }
    note(log, game, 'deliver');
  } else if (roll === 17 && has('bounty_guild')) note(log, game, `collect: ${collectBounty(game, loc).ok}`);
  else if (roll === 18 && actor.fleet.length > 1) {
    const to = r.pick(actor.fleet);
    const c = Object.keys(ship.cargo)[0];
    if (c && r.chance(0.5)) note(log, game, `move cargo: ${moveCargo(data, ship, to, c, r.range(0, ship.cargo[c]?.units ?? 0)).ok}`);
    else {
      const kind = r.chance(0.4) ? 'hardpoint' : 'internal';
      const list = kind === 'hardpoint' ? ship.hardpoints : ship.internal;
      const i = list.findIndex((m) => m !== null);
      if (i >= 0) note(log, game, `move module: ${moveModule(data, ship, kind, i, to).ok}`);
    }
  } else if (roll === 19) {
    // A fleet screen session: uninstall some modules, then install them anywhere (or discard if none fits).
    const held: HeldModule[] = [];
    for (let k = 0; k < r.int(1, 3); k++) {
      const s = r.pick(actor.fleet);
      const kind = r.chance(0.4) ? 'hardpoint' : 'internal';
      const list = kind === 'hardpoint' ? s.hardpoints : s.internal;
      const idx = list.map((m, j) => (m ? j : -1)).filter((j) => j >= 0);
      if (!idx.length) continue;
      const out = uninstallModule(data, s, kind, r.pick(idx));
      if (out.held) held.push(out.held);
    }
    for (const h of held) for (const s of r.shuffle([...actor.fleet])) if (installModule(data, s, h).ok) break;
    note(log, game, `fleet hold: ${held.length}`);
  } else if (roll === 20 && actor.fleet.length > 1) note(log, game, `flagship: ${setFlagship(game, actor, r.int(0, actor.fleet.length - 1)) ?? 'ok'}`);
  else if (roll === 21) note(log, game, `rename: ${renameShip(actor, si, r.pick(['Mule', 'Kite', 'Dusty-1', "O'Hara", 'A.B', '  x  ', '']) + r.int(0, 9)) ?? 'ok'}`);
  else if (roll === 22 && sc.buyback) note(log, game, `buy back: ${buyBack(game).ok}`);
  else if (roll === 23 && state.day > 650 && r.chance(0.05)) {
    const end = retire(game);
    note(log, game, `retire: ${typeof end === 'string' ? end : end.reason}`);
    return !state.career.end;
  } else if (roll <= 26 && sector) {
    travelTo({ kind: 'location', locationId: r.pick(sector.locationIds) });
  } else if (sector && sector.jumpPointIds.length) {
    travelTo({ kind: 'jumpPoint', jumpPointId: r.pick(sector.jumpPointIds) });
    if (state.player.position.kind === 'jumpPoint' && r.chance(0.8)) {
      const out = jump(game, actor, true);
      note(log, game, `jump: ${out.result}`);
      if (out.result === 'encounter') handleEncounter(game, out.encounter, r, log, peaceful);
    }
  }
  return !state.career.end;
}
