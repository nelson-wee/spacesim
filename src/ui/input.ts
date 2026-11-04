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

/** A small input field for a name: letters (Shift: capitals), digits, space, and - ' . */
export class TextInput {
  value: string;

  constructor(
    initial = '',
    readonly maxLength = 20,
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
    if (k.key.length === 1 && /^[a-z0-9 '.-]$/i.test(k.key) && this.value.length < this.maxLength) {
      this.value += k.shift && /[a-z]/.test(k.key) ? k.key.toUpperCase() : k.key;
      return 'edit';
    }
    return null;
  }
}
