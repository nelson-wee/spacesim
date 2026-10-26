// Colors come from data/art/palette.json (Section 18). No colors in code.
import type { GameData, Palette } from '../data';

export function palette(data: GameData): Palette {
  return data.art.palette;
}

export function techColor(data: GameData, techLevel: number): string {
  const key = String(Math.min(3, Math.max(1, techLevel))) as '1' | '2' | '3';
  return data.art.palette.techLevel[key];
}

export function securityColor(data: GameData, level: number): string {
  return data.art.palette.security[level] ?? data.art.palette.ui.text;
}

export function starColor(data: GameData, star: string): string {
  return data.art.palette.stars[star] ?? data.art.palette.ui.bright;
}
