// Keyboard input (Section 17.5). Keyboard first; all actions have a key.

export interface KeyInput {
  /** KeyboardEvent.key. Single letters are lower case. */
  key: string;
  shift: boolean;
  ctrl: boolean;
}

export function toKeyInput(e: KeyboardEvent): KeyInput {
  const key = e.key.length === 1 && /[A-Za-z]/.test(e.key) ? e.key.toLowerCase() : e.key;
  return { key, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
}

export function isDebugKey(k: KeyInput): boolean {
  return k.key === 'F12' || k.key === '`' || k.key === '~';
}

/** A small input field for digits. */
export class DigitInput {
  value: string;

  constructor(
    initial = '',
    readonly maxLength = 10,
  ) {
    this.value = initial;
  }

  /** Returns 'enter' or 'cancel' when the input ends, 'edit' when it changes, or null. */
  handle(k: KeyInput): 'enter' | 'cancel' | 'edit' | null {
    if (k.key === 'Enter') return 'enter';
    if (k.key === 'Escape') return 'cancel';
    if (k.key === 'Backspace') {
      this.value = this.value.slice(0, -1);
      return 'edit';
    }
    if (/^[0-9]$/.test(k.key) && this.value.length < this.maxLength) {
      this.value += k.key;
      return 'edit';
    }
    return null;
  }
}
