// Seeded random numbers. One generator type (sfc32), with one named stream
// for each system (Q-08). Stream state is a plain number array that lives in
// GameState, so save and load keep the sequence.

export const STREAM_NAMES = ['world', 'economy', 'encounter', 'combat', 'contracts', 'ui'] as const;
export type StreamName = (typeof STREAM_NAMES)[number];
export type RngState = [number, number, number, number];
export type RngStreams = Record<StreamName, RngState>;

// cyrb128 string hash: four 32-bit values from a string.
function hash128(text: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

// Advances the state in place and returns a value in [0, 1).
function sfc32(s: RngState): number {
  const a = s[0];
  const b = s[1];
  const c = s[2];
  const d = s[3];
  const t = (((a + b) | 0) + d) | 0;
  s[3] = (d + 1) | 0;
  s[0] = b ^ (b >>> 9);
  s[1] = (c + (c << 3)) | 0;
  const c2 = (c << 21) | (c >>> 11);
  s[2] = (c2 + t) | 0;
  return (t >>> 0) / 4294967296;
}

export function createRngState(seed: number, streamName: string): RngState {
  const state = hash128(`${seed >>> 0}:${streamName}`);
  // Discard the first values, so that similar seeds give different sequences.
  for (let i = 0; i < 15; i++) sfc32(state);
  return state;
}

export function createStreams(seed: number): RngStreams {
  const streams = {} as RngStreams;
  for (const name of STREAM_NAMES) streams[name] = createRngState(seed, name);
  return streams;
}

// A view on one stream state. It changes the state array in place.
export class Rng {
  constructor(readonly state: RngState) {}

  static fromSeed(seed: number, streamName: string): Rng {
    return new Rng(createRngState(seed, streamName));
  }

  /** Float in [0, 1). */
  next(): number {
    return sfc32(this.state);
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max], both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Random item with weight. Items with weight 0 or less are never selected. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const item of items) total += Math.max(0, weight(item));
    if (total <= 0) throw new Error('Rng.weighted: no positive weight');
    let roll = this.next() * total;
    for (const item of items) {
      const w = Math.max(0, weight(item));
      if (roll < w) return item;
      roll -= w;
    }
    // Floating point: return the last item with a positive weight.
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i] as T;
      if (weight(item) > 0) return item;
    }
    throw new Error('Rng.weighted: unreachable');
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }
}
