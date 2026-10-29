// Viewer settings (Q-48): kept in this browser's localStorage, not in the game
// state. Each read and write can fail (private window, blocked storage); then
// the defaults apply.
export interface Settings {
  /** Tutorial tips in new games. */
  tutorial: boolean;
}

const KEY = 'spacesim.settings';
const DEFAULTS: Settings = { tutorial: true };

export function loadSettings(): Settings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const value = JSON.parse(raw) as Partial<Settings>;
    return { tutorial: typeof value.tutorial === 'boolean' ? value.tutorial : DEFAULTS.tutorial };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage is not available: the setting lasts until the page closes.
  }
}
