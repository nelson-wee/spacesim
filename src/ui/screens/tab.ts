// One tab of the Location screen (Section 17.1: one tab for each service).
import type { Game } from '../../core/game';
import type { Location } from '../../core/types';
import type { Term } from '../../render/display';
import type { KeyInput } from '../input';
import type { ClickZones } from '../widgets/clicks';

/** The content area of the Location screen. */
export const TAB_Y = 5;
export const TAB_H = 30;

export interface TabContext {
  game: Game;
  location: Location;
  /** Click zones of this render. */
  zones: ClickZones;
  /** Does the same as a key press (for clicks on key hints). */
  press: (k: KeyInput) => void;
}

export interface LocationTab {
  readonly serviceId: string;
  readonly title: string;
  render(t: Term, ctx: TabContext): void;
  /** Returns true if the tab used the key. Left/Right that the tab does not use switch the tab. */
  onKey(k: KeyInput, ctx: TabContext): boolean;
  help(): string[];
}
