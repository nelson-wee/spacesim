// Simulation messages for the UI and the log. The bus is not part of
// GameState; it lives only at runtime.
import type { LogKind } from './types';

export type GameEvent =
  | { type: 'message'; text: string; kind: LogKind }
  | { type: 'newDay'; day: number }
  | { type: 'arrived'; actorId: string; locationId: number }
  | { type: 'jumped'; actorId: string; fromSectorId: number; toSectorId: number }
  | { type: 'towed'; actorId: string; locationId: number; fee: number }
  /** A market buy or sell; `profit` is the sale value less the purchase cost (0 for a buy). */
  | { type: 'traded'; actorId: string; side: 'buy' | 'sell'; locationId: number; commodity: string; units: number; total: number; profit: number };

type Handler = (event: GameEvent) => void;

export class EventBus {
  private handlers: Handler[] = [];

  on(handler: Handler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  emit(event: GameEvent): void {
    for (const handler of this.handlers) handler(event);
  }

  message(text: string, kind: LogKind = 'info'): void {
    this.emit({ type: 'message', text, kind });
  }
}
