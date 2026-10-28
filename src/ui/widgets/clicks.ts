// Click zones (Section 17.5: "Mouse: click to select map targets, menu items").
// Screens add a zone for each item that they draw; the App clears the zones
// before each render and runs the action of the zone under a click.
import type { Term } from '../../render/display';
import type { KeyInput } from '../input';

export interface ClickZone {
  x: number;
  y: number;
  w: number;
  h: number;
  action: () => void;
}

export class ClickZones {
  private list: ClickZone[] = [];

  clear(): void {
    this.list = [];
  }

  add(x: number, y: number, w: number, action: () => void, h = 1): void {
    if (w > 0 && h > 0) this.list.push({ x, y, w, h, action });
  }

  /** The zone under a cell. A zone added later is on top. */
  hit(x: number, y: number): ClickZone | undefined {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i] as ClickZone;
      if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return z;
    }
    return undefined;
  }
}

/** A key press, for a click on a key hint. */
export function press(key: string, shift = false): KeyInput {
  return { key, shift, ctrl: false };
}

export interface KeyHintColors {
  key: string;
  keyBg: string;
  text: string;
}

/**
 * Draws key hints ("B Buy 1   S Sell 1") from (x, y). A click on a hint does
 * the same as its key. Returns the end x.
 */
export function drawKeyHints(
  t: Term,
  zones: ClickZones,
  x: number,
  y: number,
  hints: readonly (readonly [label: string, text: string, key: KeyInput])[],
  colors: KeyHintColors,
  onPress: (k: KeyInput) => void,
  gap = 3,
): number {
  let cx = x;
  for (const [label, text, key] of hints) {
    const start = cx;
    cx = t.key(cx, y, label, colors.key, colors.keyBg);
    cx = t.text(cx, y, ` ${text}`, colors.text);
    zones.add(start, y, cx - start, () => onPress(key));
    cx += gap;
  }
  return cx;
}
