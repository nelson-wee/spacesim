// Screen colors. All colors come from data/art/style.json (Claude Design,
// Section 18). This file only gives the named colors a use on screen.
import type { GameData, Style } from '../data';

export interface Palette {
  ui: {
    background: string;
    panel: string;
    raised: string;
    text: string;
    dim: string;
    bright: string;
    title: string;
    highlight: string;
    key: string;
    keyBg: string;
    good: string;
    warning: string;
    danger: string;
    border: string;
    borderHi: string;
    selectBg: string;
  };
  roles: { player: string; pirate: string; trader: string; patrol: string; neutral: string; cargoPod: string };
  techLevel: { '1': string; '2': string; '3': string };
  development: { core: string; middle: string; frontier: string };
  security: string[];
  map: { lane: string; orbit: string; jumpPoint: string; sun: string; star: string };
}

/** The value of a named color. Throws if the style has no such color. */
export function styleColor(style: Style, name: string): string {
  const value = style.colors[name];
  if (!value) throw new Error(`art/style.json: no color "${name}"`);
  return value;
}

/**
 * Color of a ship cell with a role code (h, a, b, e, w, s, c, r) for a side
 * (player, pirate, trader, patrol, neutral). "{side}" in the style takes the side.
 */
export function roleColor(style: Style, side: string, role: string): string {
  const rule = style.roles[role];
  if (typeof rule !== 'string') throw new Error(`art/style.json: no color rule for role "${role}"`);
  const sideColor = style.sides[side];
  if (!sideColor) throw new Error(`art/style.json: unknown side "${side}"`);
  return styleColor(style, rule.replace('{side}', sideColor));
}

function buildPalette(style: Style): Palette {
  const c = (name: string) => styleColor(style, name);
  const tech = style.tech.map(c);
  return {
    ui: {
      background: c('void'),
      panel: c('panel'),
      raised: c('raised'),
      text: c('base'),
      dim: c('dim'),
      bright: c('hi'),
      title: c('hi'),
      highlight: c('hi'),
      key: c('hi'),
      keyBg: c('keybg'),
      good: c('good'),
      warning: c('hot'),
      danger: c('bad'),
      border: c('frame'),
      borderHi: c('frameHi'),
      selectBg: c('select'),
    },
    roles: {
      player: c('player'),
      pirate: c('pirate'),
      trader: c('trader'),
      patrol: c('patrol'),
      neutral: c('neutral'),
      cargoPod: c('cargoPod'),
    },
    techLevel: { '1': tech[0] ?? '', '2': tech[1] ?? '', '3': tech[2] ?? '' },
    // Development sets the tech level (Section 6.4), so it uses the tech colors.
    development: { frontier: tech[0] ?? '', middle: tech[1] ?? '', core: tech[2] ?? '' },
    security: style.security.map(c),
    map: { lane: c('frame'), orbit: c('star'), jumpPoint: c('jump'), sun: c('sun'), star: c('starBright') },
  };
}

const cache = new WeakMap<GameData, Palette>();

export function palette(data: GameData): Palette {
  let p = cache.get(data);
  if (!p) {
    p = buildPalette(data.art.style);
    cache.set(data, p);
  }
  return p;
}

export function techColor(data: GameData, techLevel: number): string {
  const key = String(Math.min(3, Math.max(1, techLevel))) as '1' | '2' | '3';
  return palette(data).techLevel[key];
}

export function securityColor(data: GameData, level: number): string {
  const p = palette(data);
  return p.security[level] ?? p.ui.text;
}
