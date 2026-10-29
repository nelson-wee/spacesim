// Shows tutorial tips (Q-48). After each key, click, and screen change, the
// App calls check(): the top screen names its triggers (Screen.tutorialTriggers),
// and market events give 'bought' and 'sold'. The first unseen tip for a
// trigger shows on top; the next one shows when it closes.
import type { Game } from '../core/game';
import { markTipSeen, setTutorialPlan } from '../core/tutorial';
import type { TutorialTrigger } from '../data/schemas';
import type { App } from './app';
import { TipScreen } from './screens/tip';
import { firstTradePlan, nextTip, tipLines } from './tutorial';

export class TutorialRunner {
  private game: Game | null = null;
  private unsubscribe: (() => void) | null = null;
  /** Triggers from events, in the order they occurred. */
  private pending: TutorialTrigger[] = [];
  private profitSold = 0;

  /** A trigger from outside the screens (the end of a battle). */
  notify(trigger: TutorialTrigger): void {
    if (!this.pending.includes(trigger)) this.pending.push(trigger);
  }

  private attach(game: Game | null): void {
    if (game === this.game) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pending = [];
    this.game = game;
    if (!game) return;
    this.unsubscribe = game.bus.on((e) => {
      if (e.type !== 'traded' || e.actorId !== game.state.player.id) return;
      if (e.side === 'buy') this.notify('bought');
      else if (e.profit > 0) {
        this.profitSold = e.profit;
        this.notify('sold');
      }
    });
  }

  check(app: App): void {
    this.attach(app.game);
    const game = app.game;
    const top = app.top;
    if (!game || !top || top instanceof TipScreen) return;
    if (!game.state.tutorial.on) {
      this.pending = [];
      return;
    }
    const triggers = [...this.pending, ...(top.tutorialTriggers?.() ?? [])];
    for (const trigger of triggers) {
      const tip = nextTip(game, trigger);
      if (!tip) {
        this.pending = this.pending.filter((p) => p !== trigger);
        continue;
      }
      if (tip.id === 'firstTrade' && !game.state.tutorial.plan) setTutorialPlan(game.state, firstTradePlan(game));
      markTipSeen(game.state, tip.id);
      // An event trigger can have one more tip: it stays pending until nextTip gives null.
      app.push(new TipScreen(app, tip, tipLines(game, tip, { profitSold: this.profitSold })));
      return;
    }
  }
}
