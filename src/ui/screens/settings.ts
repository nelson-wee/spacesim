// Settings (Q-48): opened from the title screen. One setting now: tutorial
// tips in new games.
import type { Term } from '../../render/display';
import { HEIGHT, WIDTH } from '../../render/display';
import { palette } from '../../render/palette';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { loadSettings, saveSettings, type Settings } from '../settings';
import { drawKeyHints, press } from '../widgets/clicks';

export class SettingsScreen implements Screen {
  readonly overlay = true;
  private settings: Settings = loadSettings();

  constructor(private readonly app: App) {}

  render(t: Term): void {
    const ui = palette(this.app.data).ui;
    const w = 50;
    const h = 9;
    const x = Math.floor((WIDTH - w) / 2);
    const y = Math.floor((HEIGHT - h) / 2);
    t.box(x, y, w, h, ui.border, 'Settings', ui.title, 'modal');
    t.key(x + 2, y + 2, 'T', ui.key, ui.keyBg);
    this.app.zones.add(x + 2, y + 2, w - 4, () => this.app.press(press('t')));
    t.text(x + 4, y + 2, 'Tutorial tips in new games: ', ui.text);
    t.text(x + 32, y + 2, this.settings.tutorial ? 'ON' : 'OFF', this.settings.tutorial ? ui.good : ui.dim);
    t.text(x + 4, y + 4, 'The setting stays in this browser.', ui.dim);
    drawKeyHints(t, this.app.zones, x + 2, y + h - 2, [['T', 'Change', press('t')], ['Esc', 'Back', press('Escape')]], ui, this.app.press);
  }

  onKey(k: KeyInput): boolean {
    if (k.key === 't' || k.key === 'Enter') {
      this.settings = { ...this.settings, tutorial: !this.settings.tutorial };
      saveSettings(this.settings);
      return true;
    }
    return false;
  }

  help(): string[] {
    return ['SETTINGS', '', 'T, Enter  Turn the tutorial tips ON or OFF for new games', 'Esc       Back to the title screen'];
  }
}
