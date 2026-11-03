// Autosave (Section 17.7): each time the player docks (an arrival or a tow).
import type { Game } from '../core/game';
import { saveGame } from './saveStore';

export class SaveRunner {
  private game: Game | null = null;
  private unsubscribe: (() => void) | null = null;

  /** Listens to the bus of the current game (the App calls this before each render). */
  attach(game: Game | null): void {
    if (game === this.game) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.game = game;
    if (!game) return;
    this.unsubscribe = game.bus.on((e) => {
      if ((e.type === 'arrived' || e.type === 'towed') && e.actorId === game.state.player.id && game.state.career.end === null) saveGame(game);
    });
  }
}
