// Browser entry point.
import { gameData } from './data';
import { createDisplay, Term } from './render/display';
import { App } from './ui/app';
import { toKeyInput } from './ui/input';
import { HelpScreen } from './ui/screens/help';
import { TitleScreen } from './ui/screens/title';

async function main(): Promise<void> {
  const data = gameData();
  const ui = data.art.palette.ui;
  const display = createDisplay(ui.background, ui.text);
  const container = display.getContainer();
  if (!container) throw new Error('rot.js display has no container');
  document.getElementById('app')?.appendChild(container);

  const app = new App(new Term(display, ui.background), data);
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
