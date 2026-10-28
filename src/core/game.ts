// The runtime game context: state, data, and event bus. Simulation functions
// take a Game. Only `state` is saved.
import { decayCargo } from '../actor/cargo';
import type { GameData } from '../data';
import { econContext } from '../econ/context';
import { economyDay } from '../econ/economy';
import { advanceClock } from './clock';
import { EventBus } from './eventBus';
import { Rng, type StreamName } from './rng';
import type { GameState } from './types';
import { notorietyDay } from '../career/notoriety';
import { securityDay } from '../world/security';

export interface Game {
  state: GameState;
  data: GameData;
  bus: EventBus;
}

/** Maximum entries in the message log. Older entries are removed. */
const LOG_LIMIT = 2000;

/** Makes a Game around a state, and connects the event bus to the log. */
export function wrapGame(state: GameState, data: GameData): Game {
  const bus = new EventBus();
  bus.on((event) => {
    if (event.type !== 'message') return;
    state.log.push({ day: state.day, text: event.text, kind: event.kind });
    if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
  });
  return { state, data, bus };
}

/** A view on one RNG stream of the state. */
export function rng(game: Game, stream: StreamName): Rng {
  return new Rng(game.state.rng[stream]);
}

export function newId(game: Game, prefix: string): string {
  game.state.nextId += 1;
  return `${prefix}-${game.state.nextId}`;
}

/** Things that happen once per day: the economy tick (Section 9.6) and Food loss in cargo (Section 9.1). */
function dailyTick(game: Game, day: number): void {
  const { world } = game.state;
  economyDay(econContext(world, game.data), world.economy, rng(game, 'economy'));
  decayCargo(game.state.player, game.data);
  // Security drift and notoriety decay (M5-SEC-02, M5-NOT-01).
  securityDay(world.sectors, game.data);
  notorietyDay(game.state.player, game.data);
  game.bus.emit({ type: 'newDay', day });
}

/** Moves time forward. Runs the daily tick for each whole day that passes. */
export function passTime(game: Game, days: number): void {
  advanceClock(game.state, days, (day) => dailyTick(game, day));
}
