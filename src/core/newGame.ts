// A new career (Section 11.8): world from the seed, starting ship, credits.
import { createActor } from '../actor/actor';
import { observe } from '../actor/knowledge';
import { type GameData, gameData } from '../data';
import { createShipFromLoadout } from '../ship/loadout';
import { generateWorld } from '../world/generator';
import { type Game, wrapGame } from './game';
import { createStreams, Rng } from './rng';
import { type GameState, SAVE_VERSION } from './types';

/** `tutorial`: the title screen setting (Q-48); tools and tests start with it OFF. */
export function createGame(seed: number, data: GameData = gameData(), options: { tutorial?: boolean } = {}): Game {
  const cleanSeed = seed >>> 0;
  const streams = createStreams(cleanSeed);
  const world = generateWorld(cleanSeed, data, new Rng(streams.world));
  const start = data.balance.start;
  const ship = createShipFromLoadout(data, start.loadoutId, 'ship-1', start.shipName);
  const player = createActor('player', 'Captain', [ship], start.credits, {
    kind: 'docked',
    locationId: world.startLocationId,
  });
  const state: GameState = {
    saveVersion: SAVE_VERSION,
    seed: cleanSeed,
    day: 0,
    rng: streams,
    world,
    player,
    log: [],
    nextId: 1,
    tutorial: { on: options.tutorial ?? false, seen: [], plan: null },
  };
  const game = wrapGame(state, data);
  observe(game, player);
  const loc = world.locations[world.startLocationId];
  game.bus.message(`Day 1. Your ship, the ${ship.name}, is docked at ${loc?.name ?? '?'}. Seed: ${cleanSeed}.`, 'good');
  return game;
}
