// Fleet screen module flow (owner, 2026-11-03): uninstall into the fleet hold,
// install from it, and the exit rules (revert, discard, sell).
import { describe, expect, it } from 'vitest';
import { type Game, wrapGame } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import { gameData } from '../src/data';
import { createShipFromLoadout } from '../src/ship/loadout';
import type { App } from '../src/ui/app';
import type { KeyInput } from '../src/ui/input';
import { FleetScreen } from '../src/ui/screens/fleet';

const data = gameData();
const template = createGame(11, data).state;
const key = (k: string): KeyInput => ({ key: k, shift: false, ctrl: false });

function setup(services: string[] = []): { game: Game; screen: FleetScreen; popped: () => number } {
  const game = wrapGame(structuredClone(template), data);
  const p = game.state.player;
  const loc = game.state.world.locations[game.state.world.startLocationId]!;
  loc.services = [...new Set([...loc.services.filter((s) => s !== 'outfitter'), ...services])];
  p.position = { kind: 'docked', locationId: loc.id };
  p.fleet = [createShipFromLoadout(data, 'start_shuttle', 'a', 'A'), createShipFromLoadout(data, 'light_freighter_starter', 'b', 'B')];
  p.flagshipIndex = 0;
  let pops = 0;
  const app = { game, zones: { add() {} }, press() {}, pop: () => pops++ } as unknown as App;
  return { game, screen: new FleetScreen(app), popped: () => pops };
}

/** Selects the first internal slot that holds a module of this id. */
function selectModule(screen: FleetScreen, game: Game, ship: number, moduleId: string): void {
  const s = game.state.player.fleet[ship]!;
  const hp = s.hardpoints.length;
  const i = s.internal.findIndex((m) => m?.moduleId === moduleId);
  for (let n = 0; n < 40; n++) screen.onKey(key('ArrowUp'));
  for (let n = 0; n < hp + i; n++) screen.onKey(key('ArrowDown'));
}

describe('fleet screen: module hold (owner, 2026-11-03)', () => {
  it('uninstall then install on another ship; the screen closes when the hold is empty and the loadouts pass', () => {
    const { game, screen, popped } = setup();
    const [a, b] = game.state.player.fleet as [import('../src/core/types').Ship, import('../src/core/types').Ship];
    const count = (s: typeof a, id: string) => s.internal.filter((m) => m?.moduleId === id).length;
    // Make room on B (its internal slots are full), then move A's shield generator to B.
    screen.onKey(key('ArrowRight'));
    selectModule(screen, game, 1, 'fuel_tank');
    screen.onKey(key('u'));
    screen.onKey(key('ArrowLeft'));
    selectModule(screen, game, 0, 'shield_generator');
    screen.onKey(key('u'));
    expect(count(a, 'shield_generator')).toBe(0);
    screen.onKey(key('ArrowRight'));
    screen.onKey(key('h'));
    screen.onKey(key('Enter'));
    expect(count(b, 'shield_generator')).toBe(1);
    // The fuel tank is still in the hold: Esc asks first.
    screen.onKey(key('Escape'));
    expect(popped()).toBe(0);
    screen.onKey(key('Escape'));
    // Install the fuel tank on A (the hold list keeps the focus; smallest empty slot).
    screen.onKey(key('ArrowLeft'));
    screen.onKey(key('Enter'));
    expect(count(a, 'fuel_tank')).toBe(2);
    screen.onKey(key('Escape'));
    expect(popped()).toBe(1);
  });

  it('Esc with a held module or a broken loadout asks first; R reverts all module changes', () => {
    const { game, screen, popped } = setup();
    const a = game.state.player.fleet[0]!;
    const before = structuredClone(a.internal);
    selectModule(screen, game, 0, 'engine');
    screen.onKey(key('u'));
    screen.onKey(key('Escape'));
    expect(popped()).toBe(0);
    // D is refused: ship A has no engine (it passed at the start).
    screen.onKey(key('d'));
    expect(popped()).toBe(0);
    screen.onKey(key('r'));
    expect(popped()).toBe(1);
    expect(a.internal).toEqual(before);
  });

  it('D discards held modules with a warning when the loadouts pass; S sells them at an Outfitter', () => {
    const { game, screen, popped } = setup();
    const a = game.state.player.fleet[0]!;
    selectModule(screen, game, 0, 'shield_generator');
    screen.onKey(key('u'));
    screen.onKey(key('Escape'));
    screen.onKey(key('d'));
    expect(popped()).toBe(1);
    expect(a.internal.some((m) => m?.moduleId === 'shield_generator')).toBe(false);
    expect(game.state.log.at(-1)?.text ?? '').toMatch(/discard/);

    const s2 = setup(['outfitter']);
    const credits = s2.game.state.player.credits;
    selectModule(s2.screen, s2.game, 0, 'shield_generator');
    s2.screen.onKey(key('u'));
    s2.screen.onKey(key('Escape'));
    s2.screen.onKey(key('s'));
    expect(s2.popped()).toBe(1);
    expect(s2.game.state.player.credits).toBeGreaterThan(credits);
  });

  it('a new hull with no modules does not stop the screen from closing (docked)', () => {
    const game = wrapGame(structuredClone(template), data);
    const p = game.state.player;
    p.position = { kind: 'docked', locationId: game.state.world.startLocationId };
    const b = createShipFromLoadout(data, 'light_freighter_starter', 'b', 'B');
    b.internal = b.internal.map(() => null);
    b.hardpoints = b.hardpoints.map(() => null);
    p.fleet.push(b);
    let closed = 0;
    const s = new FleetScreen({ game, zones: { add() {} }, press() {}, pop: () => closed++ } as unknown as App);
    s.onKey(key('Escape'));
    expect(closed).toBe(1);
  });
});
