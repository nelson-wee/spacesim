// Text for places and plans.
import type { Game } from '../../core/game';
import type { Position } from '../../core/types';

export function placeName(game: Game, p: Position): string {
  const { world } = game.state;
  if (p.kind === 'docked') {
    const loc = world.locations[p.locationId];
    const sector = loc ? world.sectors[loc.sectorId] : undefined;
    return `Docked at ${loc?.name ?? '?'} (${sector?.name ?? '?'})`;
  }
  if (p.kind === 'jumpPoint') {
    const jp = world.jumpPoints[p.jumpPointId];
    const here = jp ? world.sectors[jp.sectorId] : undefined;
    const to = jp ? world.sectors[jp.toSectorId] : undefined;
    return `${here?.name ?? '?'}: jump point to ${to?.name ?? '?'}`;
  }
  return `In space (${world.sectors[p.sectorId]?.name ?? '?'})`;
}

export function days(value: number): string {
  return `${value.toFixed(1)} days`;
}

/** Cuts or pads text to a width. */
export function fit(text: string, width: number): string {
  return text.length > width ? text.slice(0, width) : text.padEnd(width);
}

/** Fuel before and after a trip, for the ship with the lowest range. */
export function fuelLine(have: number, need: number, shipName?: string): string {
  const text = `Fuel ${have.toFixed(1)} -> ${Math.max(0, have - need).toFixed(1)}`;
  return shipName ? `${text} (${shipName})` : text;
}
