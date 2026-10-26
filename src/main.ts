// Browser entry point.
import fontUrl from 'jetbrains-mono/fonts/webfonts/JetBrainsMono-Regular.woff2?url';
import { gameData } from './data';
import { createDisplay, Term } from './render/display';
import { palette } from './render/palette';
import { App } from './ui/app';
import { toKeyInput } from './ui/input';
import { HelpScreen } from './ui/screens/help';
import { TitleScreen } from './ui/screens/title';

/** Loads the style font before the display measures it. */
async function loadFont(family: string): Promise<void> {
  try {
    const face = new FontFace(family, `url(${fontUrl})`);
    document.fonts.add(await face.load());
  } catch (err) {
    // The game still runs with a fallback monospace font.
    console.warn(`Font ${family} did not load`, err);
  }
}

async function main(): Promise<void> {
  const data = gameData();
  const style = data.art.style;
  const ui = palette(data).ui;
  await loadFont(style.cell.font);
  document.body.style.background = ui.background;
  const display = createDisplay(style, ui.background, ui.text);
  const container = display.getContainer();
  if (!container) throw new Error('rot.js display has no container');
  document.getElementById('app')?.appendChild(container);

  const app = new App(new Term(display, ui.background, style.frame), data);
  app.helpScreen = (a, lines) => new HelpScreen(a, lines);
  if (import.meta.env.DEV) {
    const { DebugScreen } = await import('./ui/screens/debug');
    app.debugScreen = (a) => new DebugScreen(a);
  }

  window.addEventListener('keydown', (e) => {
    // Keep keys for the game; let the browser have Ctrl/Cmd shortcuts.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (['Tab', 'Backspace', 'Enter', ' ', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', '/', '?', 'F12', '`'].includes(e.key)) {
      e.preventDefault();
    }
    app.handleKey(toKeyInput(e));
  });
  container.addEventListener('click', (e) => {
    const [x, y] = display.eventToPosition(e as MouseEvent);
    if (x >= 0 && y >= 0) app.handleClick(x, y);
  });

  app.reset(new TitleScreen(app));
}

void main();
