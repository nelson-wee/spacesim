// Save and load (Section 17.7, M7-SAVE). A save is the GameState as JSON,
// with saveVersion and the seed. Only the UI touches localStorage
// (src/ui/saveStore.ts); this module is headless.
import type { GameData } from '../data';
import { type Game, wrapGame } from './game';
import { type GameState, SAVE_VERSION } from './types';

export function serializeGame(game: Game): string {
  return JSON.stringify(game.state);
}

/** A game from a save, or an error text (an unknown saveVersion, or a broken save). */
export function deserializeGame(text: string, data: GameData): Game | string {
  let state: GameState;
  try {
    state = JSON.parse(text) as GameState;
  } catch {
    return 'The save is damaged and cannot be loaded.';
  }
  if (typeof state !== 'object' || state === null || state.saveVersion !== SAVE_VERSION) {
    return `The save is from another version of the game (save version ${String((state as { saveVersion?: unknown } | null)?.saveVersion)}, game version ${SAVE_VERSION}). It cannot be loaded.`;
  }
  return wrapGame(state, data);
}
