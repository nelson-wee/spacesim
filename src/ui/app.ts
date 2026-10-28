// The screen stack and global keys. Screens read the game state and call
// simulation functions; they do not change the state themselves (G-11).
import type { Game } from '../core/game';
import type { GameData } from '../data';
import { Term } from '../render/display';
import { type KeyInput, isDebugKey } from './input';
import { ClickZones } from './widgets/clicks';

export interface Screen {
  render(t: Term): void;
  /** Returns true if the screen used the key. */
  onKey(k: KeyInput): boolean;
  onClick?(x: number, y: number): void;
  /** Help lines for this screen (`?`). */
  help(): string[];
  /** An overlay draws on top of the screen below it. */
  readonly overlay?: boolean;
}

export class App {
  game: Game | null = null;
  private stack: Screen[] = [];
  /** Set only in development builds (G-16). */
  debugScreen: ((app: App) => Screen) | null = null;
  /** Click zones of the screens on show; made again at each render. */
  readonly zones = new ClickZones();
  helpScreen: ((app: App, lines: string[]) => Screen) | null = null;

  constructor(
    readonly term: Term,
    readonly data: GameData,
  ) {}

  get top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  push(screen: Screen): void {
    this.stack.push(screen);
    this.render();
  }

  pop(): void {
    if (this.stack.length > 1) this.stack.pop();
    this.render();
  }

  /** Removes all screens and shows `screen`. */
  reset(screen: Screen): void {
    this.stack = [screen];
    this.render();
  }

  render(): void {
    this.term.clear();
    this.zones.clear();
    let first = this.stack.length - 1;
    while (first > 0 && this.stack[first]?.overlay) first--;
    for (let i = Math.max(0, first); i < this.stack.length; i++) {
      // An overlay takes the clicks: the screen below it gets none.
      if (this.stack[i]?.overlay) this.zones.clear();
      this.stack[i]?.render(this.term);
    }
  }

  handleKey(k: KeyInput): void {
    const top = this.top;
    if (!top) return;
    if (top.onKey(k)) {
      this.render();
      return;
    }
    if (k.key === 'Escape') {
      this.pop();
      return;
    }
    if (k.key === '?' && this.helpScreen) {
      this.push(this.helpScreen(this, top.help()));
      return;
    }
    if (isDebugKey(k) && this.debugScreen && this.game) {
      this.push(this.debugScreen(this));
    }
  }

  /** A click runs the click zone under it, or else the screen's own click handler. */
  handleClick(x: number, y: number): void {
    const zone = this.zones.hit(x, y);
    if (zone) zone.action();
    else this.top?.onClick?.(x, y);
    this.render();
  }

  /** For key hints: a click does the same as the key. */
  readonly press = (k: KeyInput): void => this.handleKey(k);
}
