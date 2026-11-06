// Fleet combat (post-MVP P1, docs/requirements/P1-fleet-combat.md).
import { describe, expect, it } from 'vitest';
import { commandPointsUsed, fleetBattleSpecs, joinedShips, toggleJoin, wantsToJoin } from '../src/actor/fleetBattle';
import { autoStopReason } from '../src/combat/autoplay';
import { createBattle } from '../src/combat/battle';
import { resolveTurn } from '../src/combat/resolver';
import type { Battle } from '../src/combat/types';
import { finishBattle } from '../src/career/battleEnd';
import { type Game, wrapGame } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import { createRngState, Rng } from '../src/core/rng';
import type { Ship } from '../src/core/types';
import { gameData } from '../src/data';
import { fleeCargoLoss, fleetBudgetBonus, fleetTu, pirateBehavior } from '../src/encounter/encounter';
import { createShipFromLoadout } from '../src/ship/loadout';
import { travelStats } from '../src/ship/stats';

const data = gameData();
const template = createGame(5, data).state;

function game(...loadouts: string[]): Game {
  const g = wrapGame(structuredClone(template), data);
  const p = g.state.player;
  p.fleet = loadouts.map((l, i) => {
    // 'unarmed:<loadout>': the same ship with no weapons.
    const [id, unarmed] = l.startsWith('unarmed:') ? [l.slice(8), true] : [l, false];
    const ship = createShipFromLoadout(data, id, `ship-${i + 1}`, `S${i + 1}`);
    if (unarmed) ship.hardpoints = ship.hardpoints.map(() => null);
    ship.fuel = travelStats(ship, data).fuelCapacity;
    return ship;
  });
  p.flagshipIndex = 0;
  return g;
}

function battle(g: Game, enemies: string[], ai: 'raider' | 'patrol' = 'raider'): Battle {
  return createBattle(
    {
      player: fleetBattleSpecs(g.state.player, data),
      other: enemies.map((l, i) => ({ ship: createShipFromLoadout(data, l, `e${i}`, `E${i}`), ai, ...(ai === 'patrol' ? { faction: 'patrol' as const } : {}) })),
      aggressor: 'other',
      rng: createRngState(7, 'combat'),
    },
    data,
  );
}

describe('fleet setup (P1-FS)', () => {
  it('armed ships join by default; unarmed ships stay out; the flagship always joins', () => {
    const g = game('laser_gunship', 'laser_wasp', 'unarmed:light_freighter_starter');
    const p = g.state.player;
    expect(wantsToJoin(p.fleet[1] as Ship, data)).toBe(true);
    expect(wantsToJoin(p.fleet[2] as Ship, data)).toBe(false);
    expect(joinedShips(p, data).map((s) => s.id)).toEqual(['ship-1', 'ship-2']);
    expect(toggleJoin(p, 0, data).ok).toBe(false);
  });

  it('command points limit the joined ships; a Join over the limit is refused', () => {
    // Gunship (medium 2) + Corvette (large 3) = 5 of 6; a Light Freighter (large 3) does not fit.
    const g = game('laser_gunship', 'laser_corvette', 'unarmed:light_freighter_starter');
    const p = g.state.player;
    expect(commandPointsUsed(p, data)).toBe(5);
    const r = toggleJoin(p, 2, data);
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/command points/);
    expect(toggleJoin(p, 1, data).ok).toBe(true);
    expect(p.fleet[1]?.battle).toBe('stay');
    expect(toggleJoin(p, 2, data).ok).toBe(true);
    expect(joinedShips(p, data).map((s) => s.id)).toEqual(['ship-1', 'ship-3']);
  });
});

describe('fleet battles (P1-FB)', () => {
  it('joined ships start on the player side with the Wingman AI; stay-out ships are not on the map', () => {
    const g = game('laser_gunship', 'laser_wasp', 'unarmed:light_freighter_starter');
    const b = battle(g, ['pirate_raider']);
    const mine = b.ships.filter((s) => s.side === 'player');
    expect(mine.map((s) => s.ai)).toEqual(['human', 'wingman']);
    expect(mine[1]?.order).toEqual({ kind: 'attack', targetId: null });
    // Fleet ships keep their own fuel (no combat reserve).
    expect(mine[1]?.ship.fuel).toBe(g.state.player.fleet[1]?.fuel);
  });

  it('when the flagship is lost, the player commands the next fleet ship and the battle goes on', () => {
    const g = game('laser_gunship', 'laser_wasp');
    let b = battle(g, ['pirate_gunship']);
    const flag = b.ships.find((s) => s.id === b.playerId)!;
    flag.ship.hullHp = 0;
    flag.status = 'destroyed';
    b = resolveTurn(b, [], data).battle;
    const now = b.ships.find((s) => s.id === b.playerId)!;
    expect(now.ship.id).toBe('ship-2');
    expect(now.ai).toBe('human');
    expect(b.result).toBeNull();
    expect(b.log.join(' ')).toMatch(/takes command/);
  });

  it('Hold keeps a wingman in place; Retreat takes it to the edge, and it flees', () => {
    const g = game('laser_gunship', 'laser_wasp');
    let b = battle(g, ['pirate_raider']);
    const w = b.ships.find((s) => s.ai === 'wingman')!;
    w.order = { kind: 'hold' };
    const at = { ...w.pos };
    b = resolveTurn(b, [], data).battle;
    expect(b.ships.find((s) => s.id === w.id)!.pos).toEqual(at);
    b.ships.find((s) => s.id === w.id)!.order = { kind: 'retreat' };
    for (let i = 0; i < 12 && b.ships.find((s) => s.id === w.id)!.status === 'active' && !b.result; i++) b = resolveTurn(b, [], data).battle;
    expect(b.ships.find((s) => s.id === w.id)!.status).toBe('fled');
  });

  it('the result is fled when no fleet ship is active and one fled', () => {
    const g = game('laser_gunship', 'laser_wasp');
    let b = battle(g, ['pirate_gunship']);
    const [a, c] = b.ships.filter((s) => s.side === 'player');
    a!.status = 'destroyed';
    c!.status = 'fled';
    b = resolveTurn(b, [], data).battle;
    expect(b.result).toBe('fled');
  });

  it('after a win, each fleet ship keeps its damage; a ship lost to patrols is gone and the commanding ship is the new flagship', () => {
    const g = game('laser_gunship', 'laser_wasp');
    const b = battle(g, ['patrol_cutter'], 'patrol');
    const [flag, wing] = b.ships.filter((s) => s.side === 'player');
    flag!.ship.hullHp = 0;
    flag!.status = 'destroyed';
    wing!.ship.hullHp = 11;
    for (const s of b.ships) if (s.side === 'other') s.status = 'destroyed';
    b.playerId = wing!.id;
    b.result = 'win';
    finishBattle(g, g.state.player, b);
    const p = g.state.player;
    expect(p.fleet.map((s) => s.id)).toEqual(['ship-2']);
    expect(p.fleet[p.flagshipIndex]?.hullHp).toBe(11);
  });

  it('pirates disable a fleet ship (it stays, with some hull); a loss keeps the ships that stayed out', () => {
    const g = game('laser_gunship', 'laser_wasp');
    const b = battle(g, ['pirate_raider']);
    const wing = b.ships.find((s) => s.ai === 'wingman')!;
    wing.ship.hullHp = 0;
    wing.status = 'destroyed';
    for (const s of b.ships) if (s.side === 'other') s.status = 'destroyed';
    b.result = 'win';
    finishBattle(g, g.state.player, b);
    const ship = g.state.player.fleet.find((s) => s.id === 'ship-2')!;
    expect(ship.hullHp).toBeCloseTo(travelStats(ship, data).maxHullHp * data.balance.combat.disabledHullShare);

    // Lost to patrols: both joined ships are destroyed; the freighter that stayed out is the new flagship.
    const g2 = game('laser_gunship', 'laser_wasp', 'unarmed:light_freighter_starter');
    const b2 = battle(g2, ['patrol_cutter'], 'patrol');
    for (const s of b2.ships) if (s.side === 'player') s.status = 'destroyed';
    b2.result = 'loss';
    expect(finishBattle(g2, g2.state.player, b2)).toBe('flagshipLost');
    expect(g2.state.player.fleet.map((s) => s.id)).toEqual(['ship-3']);
  });

  it('after a flee from pirates, only ships that stayed out lose cargo', () => {
    const g = game('laser_gunship', 'laser_wasp', 'unarmed:light_freighter_starter');
    const p = g.state.player;
    for (const s of p.fleet) s.cargo = { food: { units: 10, unitCost: 1 } };
    const loss = fleeCargoLoss(p, new Rng(createRngState(1, 'x')), data, new Set(['ship-1', 'ship-2']));
    expect(loss?.ship.id).toBe('ship-3');
  });

  it('auto until stops when a fleet ship is lost', () => {
    const g = game('laser_gunship', 'laser_wasp');
    const before = battle(g, ['pirate_gunship', 'pirate_gunship']);
    const out = resolveTurn(before, [], data);
    out.battle.ships.find((s) => s.ai === 'wingman')!.status = 'destroyed';
    out.battle.result = null;
    expect(autoStopReason(before, out, data)).toBe('fleet');
  });
});

describe('encounters with a fleet (P1-FE)', () => {
  it('a fleet that fights draws stronger pirates (half of the other ships TU) and changes the odds', () => {
    const one = game('laser_gunship');
    const two = game('laser_gunship', 'laser_gunship');
    expect(fleetBudgetBonus(one.state.player, data)).toBe(0);
    expect(fleetBudgetBonus(two.state.player, data)).toBeGreaterThan(0);
    expect(fleetTu(two.state.player, data)).toBeGreaterThan(fleetTu(one.state.player, data));
    const s = two.state.world.sectors[0]!;
    expect(pirateBehavior(30, two.state.player, s, data).ratio).toBeLessThan(pirateBehavior(30, one.state.player, s, data).ratio);
    // A ship that stays out does not count.
    two.state.player.fleet[1]!.battle = 'stay';
    expect(fleetBudgetBonus(two.state.player, data)).toBe(0);
  });
});
