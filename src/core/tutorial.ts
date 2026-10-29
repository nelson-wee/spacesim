// Changes to the tutorial progress (Q-48). The UI calls these functions; it
// does not write GameState itself (G-11). No simulation rule reads the tutorial.
import type { GameState, TutorialPlan } from './types';

export function setTutorialOn(state: GameState, on: boolean): void {
  state.tutorial.on = on;
}

export function markTipSeen(state: GameState, id: string): void {
  if (!state.tutorial.seen.includes(id)) state.tutorial.seen.push(id);
}

export function setTutorialPlan(state: GameState, plan: TutorialPlan | null): void {
  state.tutorial.plan = plan;
}
