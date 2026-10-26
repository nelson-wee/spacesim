import { describe, expect, it } from 'vitest';
import { travelInSector } from '../src/actor/travel';
import { createGame } from '../src/core/newGame';
import { SAVE_VERSION } from '../src/core/types';

describe('GameState (G-10, M1-CORE-07)', () => {
  it('survives a JSON round trip with no change', () => {
    const game = createGame(321);
    const sector = game.state.world.sectors[game.state.world.locations[game.state.world.startLocationId]!.sectorId]!;
    travelInSector(game, game.state.player, { kind: 'jumpPoint', jumpPointId: sector.jumpPointIds[0]! });
    const copy = JSON.parse(JSON.stringify(game.state));
    expect(copy).toEqual(game.state);
  });

  it('contains the seed, the save version, and a fleet', () => {
    const { state } = createGame(5);
    expect(state.seed).toBe(5);
    expect(state.saveVersion).toBe(SAVE_VERSION);
    expect(Array.isArray(state.player.fleet)).toBe(true);
    expect(state.player.fleet).toHaveLength(1);
    expect(state.player.credits).toBe(2000);
    expect(state.player.position).toEqual({ kind: 'docked', locationId: state.world.startLocationId });
  });

  it('the same seed gives the same new game', () => {
    expect(createGame(77).state).toEqual(createGame(77).state);
  });
});
