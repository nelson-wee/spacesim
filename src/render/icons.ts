// Commodity tier marks and module icons (Section 18). Letters, glyphs, and
// colors come from data/art/style.json and data/art/modules.json.
import type { InstalledModule } from '../core/types';
import type { GameData } from '../data';
import type { Term } from './display';
import { palette, styleColor, techColor } from './palette';

export interface TierMark {
  letter: string;
  color: string;
}

/** Tier letter and color of a commodity tier (style.json `tiers`). */
export function tierMark(data: GameData, tier: string): TierMark {
  const entry = data.art.style.tiers[tier] as [string, string] | undefined;
  if (!entry) return { letter: '?', color: palette(data).ui.text };
  return { letter: entry[0], color: styleColor(data.art.style, entry[1]) };
}

export const TIER_ORDER = ['raw', 'processed', 'advanced', 'consumer'];

/** Commodities in tier order, then data order. */
export function byTier(data: GameData, ids: string[]): string[] {
  const order = new Map(data.commodities.map((c, i) => [c.id, i]));
  const tierOf = (id: string) => TIER_ORDER.indexOf(data.commodityById.get(id)?.tier ?? '');
  return [...ids].sort((a, b) => tierOf(a) - tierOf(b) || (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/**
 * Draws a module icon: family mark, two glyphs, size letter (`hi`), tier digit
 * (tech color). Five cells. An OFF module uses the `off` state color.
 */
export function drawModuleIcon(t: Term, data: GameData, x: number, y: number, m: Pick<InstalledModule, 'moduleId' | 'size' | 'tier'> & { on?: boolean }): number {
  const art = data.art.modules;
  const style = data.art.style;
  const def = art.modules.find((a) => a.id === m.moduleId);
  const ui = palette(data).ui;
  if (!def) return t.text(x, y, '?????', ui.dim);
  const family = art.families[def.family];
  const off = m.on === false ? art.states.off : undefined;
  t.text(x, y, family?.mark ?? ' ', styleColor(style, off?.icon_fg ?? family?.fg ?? 'dim'));
  t.text(x + 1, y, def.glyph, styleColor(style, off?.icon_fg ?? def.fg));
  t.text(x + 3, y, m.size, ui.bright);
  return t.text(x + 4, y, String(m.tier), techColor(data, m.tier));
}

/** Short module name from modules.json, or the data name. */
export function moduleShort(data: GameData, moduleId: string): string {
  return data.art.modules.modules.find((a) => a.id === moduleId)?.short ?? data.moduleById.get(moduleId)?.name ?? moduleId;
}
