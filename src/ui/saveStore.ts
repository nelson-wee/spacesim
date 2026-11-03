// The one save slot in this browser's localStorage (Section 17.7). Each read
// and write can fail (private window, blocked storage): then there is no save.
import type { Game } from '../core/game';
import { deserializeGame, serializeGame } from '../core/save';
import type { GameData } from '../data';

const KEY = 'spacesim.save';

export function hasSave(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) != null;
  } catch {
    return false;
  }
}

/** Saves the game; returns false if storage is not available. */
export function saveGame(game: Game): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(KEY, serializeGame(game));
    return true;
  } catch {
    return false;
  }
}

/** The saved game, an error text, or null with no save. */
export function loadGame(data: GameData): Game | string | null {
  let text: string | null = null;
  try {
    text = globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
  return text === null ? null : deserializeGame(text, data);
}

export function clearSave(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // No storage: nothing to clear.
  }
}
