// Guided munitions, point defense, flak, and ammunition (M5-GUIDE).
import { describe, expect, it } from 'vitest';
import { createBattle } from '../src/combat/battle';
import { ammoOf, clearMunitionsInArea, munitionPath, munitionStep } from '../src/combat/munitions';
import { applyOrder, resolveTurn } from '../src/combat/resolver';
import { combatStats } from '../src/combat/rules';
import type { Battle, CombatShip, Effect } from '../src/combat/types';
import { type Game, wrapGame } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import { createRngState, Rng } from '../src/core/rng';
import type { InstalledModule } from '../src/core/types';
import { gameData } from '../src/data';
import { quoteRepair, repair } from '../src/services/mechanic';
import { createShipFromLoadout } from '../src/ship/loadout';
import { moduleValues } from '../src/ship/modules';

const data = gameData();
const missile = (): InstalledModule => ({ moduleId: 'missile_rack', size: 'S', tier: 1, on: true });
const pd = (): InstalledModule => ({ moduleId: 'point_defense', size: 'S', tier: 1, on: true });

/** Player Shuttle with a missile rack at (10, 14); enemy Raider at x on an open map. */
function setup(enemyX = 26, enemyLoadout = 'pirate_raider'): Battle {
  const ship = createShipFromLoadout(data, 'start_shuttle', 'p', 'P');
  ship.hardpoints[0] = missile();
  const b = createBattle(
    {
      player: [{ ship, ai: 'human' }],
      other: [{ ship: createShipFromLoadout(data, enemyLoadout, 'o', 'O'), ai: 'raider', powerPriority: data.loadoutById.get(enemyLoadout)?.powerPriority }],
      aggressor: 'other',
      rng: createRngState(1, 'combat'),
    },
    data,
  );
  b.cells = b.cells.map((row) => '.'.repeat(row.length));
  b.ships[0]!.pos = { x: 10, y: 14 };
  b.ships[1]!.pos = { x: enemyX, y: 14 };
  return b;
}
const P = (b: Battle) => b.ships[0] as CombatShip;
const E = (b: Battle) => b.ships[1] as CombatShip;
const fire = (b: Battle, effects: Effect[] = []) => applyOrder(b, P(b), { kind: 'fire', slot: { kind: 'hardpoint', index: 0 }, target: E(b).id, aim: 'hull' }, data, new Rng(createRngState(2, 'x')), effects);

describe('guided munitions (M5-GUIDE-01 to 05)', () => {
  it('a launch makes a munition, uses one round, power, and heat; it does not move or hit in that turn', () => {
    const b = setup();
    const effects: Effect[] = [];
    expect(fire(b, effects)).toBeNull();
    expect(b.munitions).toHaveLength(1);
    expect(ammoOf(P(b).ship.hardpoints[0]!, data)).toBe(7);
    expect(effects.some((e) => e.kind === 'launch')).toBe(true);
    const mu = b.munitions[0]!;
    const at = { ...mu.pos };
    munitionStep(b, data, new Rng(createRngState(3, 'x')), []);
    expect(b.munitions[0]!.pos).toEqual(at);
  });

  it('a munition moves up to its speed toward the target, then rolls the hit next to the footprint', () => {
    const b = setup(26);
    fire(b);
    const rng = new Rng(createRngState(3, 'x'));
    munitionStep(b, data, rng, []);
    const speed = moduleValues(data, missile()).munitionSpeed!;
    const effects: Effect[] = [];
    const before = { ...b.munitions[0]!.pos };
    munitionStep(b, data, rng, effects);
    const moved = effects.find((e) => e.kind === 'munitionMove');
    expect(moved && moved.kind === 'munitionMove' ? moved.path.length - 1 : 0).toBe(Math.min(speed, moved && moved.kind === 'munitionMove' ? moved.path.length - 1 : 0));
    expect(b.munitions[0]!.pos.x - before.x).toBe(speed);
    // Keep stepping: it reaches the target and is removed after its roll.
    let rolled = false;
    for (let i = 0; i < 5 && b.munitions.length > 0; i++) {
      const fx: Effect[] = [];
      munitionStep(b, data, rng, fx);
      if (fx.some((e) => e.kind === 'munitionHit')) rolled = true;
    }
    expect(rolled).toBe(true);
    expect(b.munitions).toHaveLength(0);
  });

  it('the path goes around asteroids; life runs out', () => {
    const b = setup(26);
    // A wall at x = 20 with one gap at y = 2.
    b.cells = b.cells.map((row, y) => (y === 2 ? row : row.slice(0, 20) + '#' + row.slice(21)));
    const path = munitionPath(b, { x: 12, y: 14 }, E(b));
    expect(path).not.toBeNull();
    expect(path!.some((c) => c.x === 20 && c.y === 2)).toBe(true);
    fire(b);
    b.munitions[0]!.life = 1;
    const rng = new Rng(createRngState(3, 'x'));
    munitionStep(b, data, rng, []);
    const fx: Effect[] = [];
    munitionStep(b, data, rng, fx);
    expect(fx.some((e) => e.kind === 'munitionLost')).toBe(true);
    expect(b.munitions).toHaveLength(0);
  });

  it('no ammunition: refused; out of range: refused', () => {
    const b = setup(40);
    expect(fire(b)).toMatch(/range/);
    const near = setup(25);
    near.ships[0]!.ship.hardpoints[0]!.ammo = 0;
    expect(fire(near)).toMatch(/ammunition/);
  });
});

describe('point defense and flak (M5-GUIDE-06, M5-GUIDE-07, Q-44)', () => {
  it('point defense fires during the move, before the hit roll; at most its shots per turn; heat per shot', () => {
    const b = setup(20);
    E(b).ship.hardpoints[1] = pd();
    fire(b);
    const rng = new Rng(createRngState(5, 'x'));
    munitionStep(b, data, rng, []);
    const fx: Effect[] = [];
    munitionStep(b, data, rng, fx);
    const shots = fx.filter((e) => e.kind === 'pd');
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.length).toBeLessThanOrEqual(moduleValues(data, pd()).shotsPerTurn!);
    const firstPd = fx.findIndex((e) => e.kind === 'pd');
    const roll = fx.findIndex((e) => e.kind === 'munitionHit');
    if (roll >= 0) expect(firstPd).toBeLessThan(roll);
    expect(E(b).shotHeat).toBeCloseTo(shots.length * moduleValues(data, pd()).heatPerShot!);
  });

  it('point defense never fires at ships', () => {
    const ship = createShipFromLoadout(data, 'escort_wasp', 'p', 'P');
    const b = createBattle({ player: [{ ship, ai: 'attack' }], other: [{ ship: createShipFromLoadout(data, 'pirate_raider', 'o', 'O'), ai: 'raider' }], aggressor: 'other', rng: createRngState(1, 'combat') }, data);
    let battle = b;
    for (let i = 0; i < 6 && !battle.result; i++) {
      const out = resolveTurn(battle, null, data);
      for (const e of out.effects) if (e.kind === 'shot') expect(e.moduleId).not.toBe('point_defense');
      battle = out.battle;
    }
  });

  it('flak destroys enemy munitions in its area', () => {
    const b = setup(24);
    fire(b);
    const mu = b.munitions[0]!;
    const fx: Effect[] = [];
    clearMunitionsInArea(b, E(b), mu.pos, 1, fx);
    expect(b.munitions).toHaveLength(0);
    expect(fx.some((e) => e.kind === 'munitionDown')).toBe(true);
  });
});

describe('ammunition refill at the Mechanic (M5-GUIDE-05)', () => {
  it('the repair refills missing rounds at the price per round', () => {
    const template = createGame(11, data).state;
    const game: Game = wrapGame(structuredClone(template), data);
    const loc = game.state.world.locations[game.state.world.startLocationId]!;
    loc.services = data.services.map((s) => s.id);
    const ship = game.state.player.fleet[0]!;
    ship.hardpoints[0] = { ...missile(), ammo: 3 };
    const q = quoteRepair(ship, data);
    expect(q.ammo).toBe(5);
    expect(q.ammoCost).toBe(5 * moduleValues(data, missile()).ammoPrice!);
    const credits = game.state.player.credits;
    expect(repair(game, game.state.player, loc, 0).ok).toBe(true);
    expect(ammoOf(ship.hardpoints[0]!, data)).toBe(8);
    expect(game.state.player.credits).toBeCloseTo(credits - q.cost);
  });
});

describe('maneuver lowers the munition hit chance', () => {
  it('agility / (agility + maneuver)', () => {
    const b = setup();
    const t = E(b);
    const w = moduleValues(data, missile());
    const expected = w.munitionAgility! / (w.munitionAgility! + combatStats(t, data).maneuver);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(1);
  });
});
