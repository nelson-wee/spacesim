// The screen stack and global keys. Screens read the game state and call
// simulation functions; they do not change the state themselves (G-11).
import type { Game } from '../core/game';
import type { GameData } from '../data';
import { Term } from '../render/display';
import { type KeyInput, isDebugKey } from './input';

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
    let first = this.stack.length - 1;
    while (first > 0 && this.stack[first]?.overlay) first--;
    for (let i = Math.max(0, first); i < this.stack.length; i++) this.stack[i]?.render(this.term);
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

  handleClick(x: number, y: number): void {
    this.top?.onClick?.(x, y);
    this.render();
  }
}
