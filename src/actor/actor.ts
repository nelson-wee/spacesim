// Actors (Section 4.2). The player is one actor. Later, NPC agents are actors too.
import type { Actor, Position, Ship } from '../core/types';

export function createActor(id: string, name: string, fleet: Ship[], credits: number, position: Position): Actor {
  if (fleet.length === 0) throw new Error('An actor needs at least one ship');
  return { id, name, fleet, flagshipIndex: 0, credits, notoriety: 0, position };
}
