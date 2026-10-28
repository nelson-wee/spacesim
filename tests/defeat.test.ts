// Pirate defeat (disable, all cargo lost) and Clone Insurance (owner, 2026-10-28).
import { describe, expect, it } from 'vitest';
import { addCargo, fleetUnits } from '../src/actor/cargo';
import { applyDefeat, defeatKind } from '../src/career/defeat';
import { applyToShip, createBattle } from '../src/combat/battle';
import type { AiKind, Battle, Faction } from '../src/combat/types';
import { type Game, wrapGame } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import { createRngState } from '../src/core/rng';
import type { Location } from '../src/core/types';
import { gameData } from '../src/data';
import { buyInsurance, claimInsurance, insuredValue, quoteInsurance } from '../src/services/insurance';
import { createShipFromLoadout } from '../src/ship/loadout';
import { travelStats } from '../src/ship/stats';
import { securityLevel } from '../src/world/security';

const data = gameData();
const template = createGame(11, data).state;

function setup(pick: (l: Location) => boolean = (l) => l.kind === 'station'): { game: Game; loc: Location } {
  const game = wrapGame(structuredClone(template), data);
  const loc = game.state.world.locations.find(pick);
  if (!loc) throw new Error('no location');
  loc.services = data.services.map((s) => s.id);
  game.state.player.position = { kind: 'docked', locationId: loc.id };
  return { game, loc };
}

/** A lost battle: the player's flagship against enemies, with hull 0. */
function lostBattle(game: Game, enemies: { ai: AiKind; faction?: Faction }[]): Battle {
  const flag = game.state.player.fleet[0]!;
  const b = createBattle(
    {
      player: [{ ship: flag, ai: 'human' }],
      other: enemies.map((e, i) => ({ ship: createShipFromLoadout(data, 'pirate_raider', `o${i}`, 'O'), ai: e.ai, faction: e.faction })),
      aggressor: 'other',
      rng: createRngState(3, 'combat'),
    },
    data,
  );
  const me = b.ships.find((s) => s.id === b.playerId)!;
  me.ship.hullHp = 0;
  me.status = 'destroyed';
  b.result = 'loss';
  return b;
}

describe('defeat kind', () => {
  it('Raider AI ships are pirates; a patrol or a mixed group destroys', () => {
    const { game } = setup();
    expect(defeatKind(lostBattle(game, [{ ai: 'raider' }, { ai: 'raider' }]))).toBe('disabled');
    expect(defeatKind(lostBattle(game, [{ ai: 'attack', faction: 'patrol' }]))).toBe('destroyed');
    expect(defeatKind(lostBattle(game, [{ ai: 'raider' }, { ai: 'attack', faction: 'patrol' }]))).toBe('destroyed');
    // An escort with pirate-style ships but Patrol behavior is not a pirate.
    expect(defeatKind(lostBattle(game, [{ ai: 'raider', faction: 'trader' }]))).toBe('destroyed');
  });
});

describe('pirates disable the ship', () => {
  it('takes all cargo, keeps the ship with a share of hull, and tows it', () => {
    const { game } = setup();
    const actor = game.state.player;
    addCargo(actor, data, 'water', 10, 12);
    actor.insurance = null;
    const b = lostBattle(game, [{ ai: 'raider' }]);
    applyToShip(b, actor.fleet[0]!);
    expect(applyDefeat(game, actor, b)).toBe('disabled');
    expect(fleetUnits(actor, 'water')).toBe(0);
    expect(actor.fleet).toHaveLength(1);
    const ship = actor.fleet[0]!;
    expect(ship.hullHp).toBeCloseTo(travelStats(ship, data).maxHullHp * data.balance.combat.disabledHullShare);
    expect(actor.position.kind).toBe('docked');
  });
});

describe('Clone Insurance', () => {
  it('the premium share goes down as security goes up', () => {
    const shares = data.serviceRules.insurance.premiumShare;
    for (let i = 1; i < shares.length; i++) expect(shares[i]!).toBeLessThan(shares[i - 1]!);
    const { game, loc } = setup();
    const ship = game.state.player.fleet[0]!;
    const sector = game.state.world.sectors[loc.sectorId]!;
    const q = quoteInsurance(game, loc, ship);
    expect(q.value).toBeCloseTo(insuredValue(ship, data));
    expect(q.share).toBe(shares[securityLevel(sector.securityValue, data)]);
    sector.securityValue = 0;
    expect(quoteInsurance(game, loc, ship).share).toBe(shares[0]);
  });

  it('buy: pays the premium and stores the ship and the credits after the premium', () => {
    const { game, loc } = setup();
    const actor = game.state.player;
    const q = quoteInsurance(game, loc, actor.fleet[0]!);
    const before = actor.credits;
    const r = buyInsurance(game, actor, loc);
    expect(r.ok).toBe(true);
    expect(actor.credits).toBeCloseTo(before - q.premium);
    expect(actor.insurance?.credits).toBeCloseTo(before - q.premium);
    expect(actor.insurance?.locationId).toBe(loc.id);
    expect(actor.insurance?.ship.cargo).toEqual({});
  });

  it('buy is refused in debt, without credits, and where there is no service', () => {
    const { game, loc } = setup();
    const actor = game.state.player;
    actor.credits = -1;
    expect(buyInsurance(game, actor, loc).ok).toBe(false);
    actor.credits = 0;
    expect(buyInsurance(game, actor, loc).ok).toBe(false);
    actor.credits = 1e6;
    loc.services = loc.services.filter((s) => s !== 'insurance');
    expect(buyInsurance(game, actor, loc).ok).toBe(false);
    expect(actor.insurance).toBeNull();
  });

  it('only stations have the service', () => {
    const game = wrapGame(structuredClone(template), data);
    for (const l of game.state.world.locations) expect(l.services.includes('insurance')).toBe(l.kind === 'station');
  });

  it('destroyed with a policy: wake at the station with the insured ship and credits', () => {
    const { game, loc } = setup();
    const actor = game.state.player;
    buyInsurance(game, actor, loc);
    const insured = actor.insurance!.credits;
    const hullId = actor.fleet[0]!.hullId;
    // Later: the actor moves away, earns credits, and loads cargo.
    const other = game.state.world.locations.find((l) => l.id !== loc.id)!;
    actor.position = { kind: 'docked', locationId: other.id };
    actor.credits = insured + 5000;
    addCargo(actor, data, 'water', 5, 10);
    const b = lostBattle(game, [{ ai: 'attack', faction: 'patrol' }]);
    applyToShip(b, actor.fleet[0]!);
    expect(applyDefeat(game, actor, b)).toBe('cloned');
    expect(actor.position).toEqual({ kind: 'docked', locationId: loc.id });
    expect(actor.credits).toBeCloseTo(insured);
    expect(actor.insurance).toBeNull();
    const ship = actor.fleet[0]!;
    expect(ship.hullId).toBe(hullId);
    expect(ship.cargo).toEqual({});
    const s = travelStats(ship, data);
    expect(ship.hullHp).toBe(s.maxHullHp);
    expect(ship.fuel).toBe(s.fuelCapacity);
  });

  it('destroyed without a policy: game over', () => {
    const { game } = setup();
    const actor = game.state.player;
    expect(claimInsurance(game, actor)).toBeNull();
    const b = lostBattle(game, [{ ai: 'attack', faction: 'patrol' }]);
    expect(applyDefeat(game, actor, b)).toBe('gameOver');
  });
});
