// Combat screen (Sections 13.1, 13.3, 13.6, 17.5, 18). The grid is 70 x 30;
// the right panel (30 x 40) shows the ship status, power list, heat bar, and
// target; the bottom 5 rows show the battle log. The player plans the turn:
// switch modules ON and OFF (number keys), move (cursor + Enter, or a click),
// and fire (F) at the target (Tab or a click), at the Hull or the Engines (A).
// The plan shows at once; E ends the turn and the resolver runs it. Effects
// from effects.json play after the turn; Space skips them.
import { defeatKind } from '../../career/defeat';
import { Rng } from '../../core/rng';
import { isActive, lineCells, lineOfFire, maskSize, pathTo, reachable, shipCells } from '../../combat/geometry';
import { applyOrder, hostile, resolveTurn, shipById } from '../../combat/resolver';
import {
  combatStats,
  drawOf,
  heatForecast,
  heatState,
  hitChance,
  isDirectWeapon,
  moduleAt,
  moduleSlots,
  isReserving,
  moveBudget,
  moveCost,
  overheatTurnsLeft,
  powerCeiling,
  powerFree,
  powerState,
  slotKey,
  spendPower,
} from '../../combat/rules';
import type { Aim, Battle, CombatShip, Effect, Order, SlotRef, Vec2 } from '../../combat/types';
import type { Game } from '../../core/game';
import type { Term } from '../../render/display';
import { HEIGHT, WIDTH } from '../../render/display';
import { buildTimeline, overlayAt, type Timeline } from '../../render/effects';
import { drawModuleIcon, moduleShort } from '../../render/icons';
import { palette, styleColor } from '../../render/palette';
import { type DamageState, drawArt } from '../../render/shipArt';
import { moduleValues } from '../../ship/modules';
import type { App, Screen } from '../app';
import type { KeyInput } from '../input';
import { drawKeyHints, press } from '../widgets/clicks';
import { fit } from '../widgets/text';

const PANEL_X = 70;
const HINT_Y = 31;
const LOG_Y = 35;
const LOG_ROWS = 5;
const POWER_KEYS = '1234567890';

/** Side color by AI kind (style.json `sides`). */
function sideOf(s: CombatShip): string {
  if (s.side === 'player') return 'player';
  return s.ai === 'trader' ? 'trader' : 'pirate';
}

export class CombatScreen implements Screen {
  private battle: Battle;
  private preview: Battle;
  private orders: Order[] = [];
  private cursor: Vec2;
  private targetId: number | null = null;
  private aim: Aim = 'hull';
  private notice = '';
  /** An overdraw waits for confirmation (Q-41): the order that the player must repeat. */
  private armed: 'move' | 'fire' | null = null;
  /** The order that the player repeated in this key press. */
  private confirmed: 'move' | 'fire' | null = null;
  private log: string[] = [];
  private timeline: Timeline | null = null;
  private animStart = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly app: App,
    battle: Battle,
    private readonly onEnd: (b: Battle) => void,
  ) {
    this.battle = battle;
    this.preview = structuredClone(battle);
    const me = this.me();
    this.cursor = { ...me.pos };
    this.targetId = this.foes()[0]?.id ?? null;
    this.log.push('Battle. Plan your turn: 1-0 power, arrows + Enter move, Tab target, F fire, E end turn.');
  }

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  /** The player's ship in the preview. */
  private me(): CombatShip {
    return shipById(this.preview, this.preview.playerId) as CombatShip;
  }

  private foes(): CombatShip[] {
    const me = this.me();
    return this.preview.ships.filter((s) => isActive(s) && hostile(me, s));
  }

  private target(): CombatShip | null {
    const t = this.targetId === null ? undefined : shipById(this.preview, this.targetId);
    return t && isActive(t) ? t : (this.foes()[0] ?? null);
  }

  /** Modules that draw power (the power list), in slot order. */
  private powerList(): SlotRef[] {
    const me = this.me();
    return moduleSlots(me).filter((slot) => {
      const m = moduleAt(me, slot);
      return m !== null && drawOf(m, this.game.data) > 0;
    });
  }

  /**
   * An order that needs more power than is free (available + capacitor) takes
   * power from reserved systems (Q-41). The player confirms it: the same
   * order again. Returns true if the order may go on.
   */
  private overdrawOk(kind: 'move' | 'fire', cost: number): boolean {
    const me = this.me();
    const data = this.game.data;
    const free = powerFree(me, data);
    if (cost <= free + 1e-9 || cost > powerCeiling(me, data) + 1e-9) return true;
    if (this.confirmed === kind) return true;
    this.armed = kind;
    const n = moduleSlots(me).filter((slot) => {
      const m = moduleAt(me, slot);
      return m !== null && m.on && isReserving(m, data) && !me.unpowered.includes(slotKey(slot));
    }).length;
    const what = n > 1 ? 'reserved systems (picked at random) lose' : 'the shields lose';
    this.notice = `${kind === 'move' ? 'The move' : 'The shots'} need${kind === 'move' ? 's' : ''} ${cost} power; ${Math.round(free * 10) / 10} is free. Then ${what} power until the end of the turn. ${kind === 'move' ? 'Enter' : 'F'} again to confirm.`;
    return false;
  }

  /** Text for modules that lost power in the preview (Q-41). */
  private unpoweredText(effects: Effect[]): string {
    const names = effects.filter((e) => e.kind === 'unpowered').map((e) => moduleShort(this.game.data, (e as { moduleId: string }).moduleId));
    return names.length > 0 ? ` Overdraw: ${names.join(', ')} without power until the end of the turn.` : '';
  }

  /** Applies a planned toggle or move to the preview, and keeps it for the turn. */
  private plan(order: Order): void {
    if (order.kind === 'move' && !this.overdrawOk('move', moveCost(this.me(), this.game.data))) return;
    const effects: Effect[] = [];
    const why = applyOrder(this.preview, this.me(), order, this.game.data, new Rng([1, 2, 3, 4]), effects);
    if (why) {
      this.notice = why;
      return;
    }
    this.orders.push(order);
    this.notice = (this.me().status === 'fled' ? 'Flee planned: press E to end the turn and leave the battle (U to undo).' : '') + this.unpoweredText(effects);
  }

  /**
   * Plans a move to `to`; if it is too far for this turn, the ship goes as far
   * as it can along the shortest path toward it.
   */
  private planMoveToward(to: Vec2): void {
    const me = this.me();
    const budget = moveBudget(me, this.game.data);
    if (budget <= 0) {
      this.notice = me.overheated ? this.offlineText() : me.ship.fuel <= 1e-9 ? 'No fuel: the ship cannot move.' : 'No movement left this turn.';
      return;
    }
    const path = pathTo(reachable(this.preview, me, budget * 8), to);
    if (!path) {
      this.notice = 'The ship cannot get there.';
      return;
    }
    const step = path[Math.min(budget, path.length - 1)] ?? me.pos;
    this.plan({ kind: 'move', to: step });
  }

  /** Plans a shot of each ready weapon at the target (resolved at the end of the turn). */
  private planFire(): void {
    const { data } = this.game;
    const me = this.me();
    const t = this.target();
    if (!t) return;
    if (me.overheated) {
      this.notice = this.offlineText();
      return;
    }
    const ready = moduleSlots(me).filter((slot) => {
      const m = moduleAt(me, slot);
      if (!m || !m.on || !isDirectWeapon(m, data) || me.fired.includes(slotKey(slot))) return false;
      const w = moduleValues(data, m);
      return hitChance(this.preview, me, w, t, w.area !== undefined ? 'hull' : this.aim, data) > 0;
    });
    // Shots pay power (Q-41): with no confirmation, only the shots that free power pays for.
    const allCost = ready.reduce((sum, slot) => sum + drawOf(moduleAt(me, slot) as NonNullable<ReturnType<typeof moduleAt>>, data), 0);
    const overdraw = this.overdrawOk('fire', allCost);
    const armedNotice = this.notice;
    const effects: Effect[] = [];
    const rng = new Rng([1, 2, 3, 4]);
    let n = 0;
    let unpaid = 0;
    for (const slot of ready) {
      const m = moduleAt(me, slot);
      if (!m) continue;
      const w = moduleValues(data, m);
      const cost = drawOf(m, data);
      if ((!overdraw && cost > powerFree(me, data) + 1e-9) || spendPower(me, cost, data, rng, effects)) {
        unpaid++;
        continue;
      }
      this.orders.push({ kind: 'fire', slot, target: t.id, aim: this.aim });
      me.fired.push(slotKey(slot));
      me.shotHeat += w.heatPerShot ?? 0;
      n++;
    }
    this.notice = n > 0 ? `${n} shot${n === 1 ? '' : 's'} planned at ${t.name}.` : unpaid > 0 ? 'Not sufficient power for a shot.' : 'No weapon can hit that target now.';
    if (unpaid > 0 && !overdraw) this.notice += ` ${armedNotice}`;
    this.notice += this.unpoweredText(effects);
    if (n > 0 && heatForecast(me, data) >= combatStats(me, data).heatCapacity) this.notice += ' WARNING: this turn overheats the ship (U to undo).';
  }

  private offlineText(): string {
    const n = overheatTurnsLeft(this.me(), this.game.data);
    return `Overheat: the ship is offline (no orders, no engines, no shields) for about ${n} more turn${n === 1 ? '' : 's'}. Press E.`;
  }

  private undo(): void {
    this.preview = structuredClone(this.battle);
    this.orders = [];
    this.notice = 'Plan cleared.';
  }

  private endTurn(): void {
    const { data } = this.game;
    const before = this.battle;
    const out = resolveTurn(before, this.orders, data);
    for (const r of out.refused) this.log.push(`Order refused: ${r}`);
    this.log.push(`Turn ${before.turn + 1}:`);
    for (const line of describe(out.effects, out.battle, data)) this.log.push(`  ${line}`);
    this.battle = out.battle;
    this.preview = structuredClone(out.battle);
    this.orders = [];
    this.notice = '';
    this.playEffects(out.effects);
    if (this.battle.result) this.log.push(resultText(this.battle));
  }

  private playEffects(effects: Effect[]): void {
    const tl = buildTimeline(effects, this.battle, this.game.data);
    if (tl.duration <= 0) return;
    this.timeline = tl;
    this.animStart = Date.now();
    const tick = () => {
      if (!this.timeline) return;
      if (Date.now() - this.animStart >= this.timeline.duration) this.timeline = null;
      this.app.render();
      if (this.timeline) this.timer = setTimeout(tick, 30);
    };
    this.timer = setTimeout(tick, 0);
  }

  private skipEffects(): void {
    this.timeline = null;
    if (this.timer) clearTimeout(this.timer);
  }

  render(t: Term): void {
    const { data } = this.game;
    const ui = palette(data).ui;
    const b = this.preview;
    const zones = this.app.zones;
    // Grid.
    const debris = styleColor(data.art.style, 'dim');
    for (let y = 0; y < b.height; y++) {
      for (let x = 0; x < b.width; x++) {
        const c = b.cells[y]?.[x] ?? '.';
        if (c === '#') t.put(x, y, '#', ui.text);
        else if (c === ':') t.put(x, y, ':', debris);
        else t.put(x, y, (x + y) % 6 === 0 ? '·' : ' ', ui.border);
      }
    }
    // Reachable anchors of the player ship.
    const me = this.me();
    const planning = !this.battle.result && !this.timeline;
    if (planning && isActive(me)) {
      const budget = moveBudget(me, data);
      if (budget > 0) for (const key of reachable(b, me, budget).steps.keys()) {
        const [x, y] = key.split(',').map(Number) as [number, number];
        t.put(x, y, '·', ui.dim, ui.raised);
      }
    }
    // Ships.
    for (const s of b.ships) this.drawShip(t, s);
    // Target brackets and line of fire.
    const tgt = this.target();
    if (tgt && isActive(me)) {
      const lof = lineOfFire(b, me, tgt);
      if (planning) for (const c of lineCells(lof.from, lof.to)) if (b.cells[c.y]?.[c.x] === '.') t.put(c.x, c.y, '·', lof.clear ? ui.borderHi : ui.danger);
      const cells = shipCells(tgt);
      const x0 = Math.min(...cells.map((c) => c.x)) - 1;
      const x1 = Math.max(...cells.map((c) => c.x)) + 1;
      const y0 = Math.min(...cells.map((c) => c.y)) - 1;
      const y1 = Math.max(...cells.map((c) => c.y)) + 1;
      for (const [x, y, ch] of [[x0, y0, '┌'], [x1, y0, '┐'], [x0, y1, '└'], [x1, y1, '┘']] as const) t.put(x, y, ch, ui.bright);
    }
    // Cursor.
    if (planning) {
      const under = b.cells[this.cursor.y]?.[this.cursor.x] ?? ' ';
      t.put(this.cursor.x, this.cursor.y, under === '.' ? '+' : under, ui.background, ui.bright);
    }
    // Effects on top.
    if (this.timeline) {
      for (const c of overlayAt(this.timeline, Date.now() - this.animStart)) {
        if (c.x >= 0 && c.y >= 0 && c.x < b.width && c.y < b.height) t.put(c.x, c.y, c.ch, c.fg);
      }
    }
    this.renderPanel(t);
    // Notice, keys, log.
    t.hline(30, 0, PANEL_X - 1, '─', ui.border);
    t.text(0, HINT_Y, fit(this.notice, PANEL_X - 1), ui.warning);
    if (this.battle.result) {
      t.text(0, HINT_Y + 1, fit(`${resultText(this.battle)} Press Enter to leave the battle.`, PANEL_X - 1), ui.title);
      drawKeyHints(t, zones, 0, HINT_Y + 2, [['Enter', 'Leave', press('Enter')]], ui, this.app.press);
    } else {
      drawKeyHints(
        t,
        zones,
        0,
        HINT_Y + 1,
        [
          ['Enter', 'Move', press('Enter')],
          ['Tab', 'Target', press('Tab')],
          ['F', 'Fire', press('f')],
          ['A', `Aim: ${this.aim === 'hull' ? 'Hull' : 'Engines'}`, press('a')],
        ],
        ui,
        this.app.press,
        2,
      );
      drawKeyHints(
        t,
        zones,
        0,
        HINT_Y + 2,
        [
          ['E', 'End turn', press('e')],
          ['U', 'Undo plan', press('u')],
          ['Space', 'Skip effects', press(' ')],
          ['?', 'Help', press('?')],
        ],
        ui,
        this.app.press,
        2,
      );
    }
    t.hline(LOG_Y - 1, 0, PANEL_X - 1, '─', ui.border);
    this.log.slice(-LOG_ROWS).forEach((l, i) => t.text(0, LOG_Y + i, fit(l, PANEL_X - 1), ui.text));
  }

  private drawShip(t: Term, s: CombatShip): void {
    const { data } = this.game;
    const art = data.art.ships.ships[s.ship.hullId];
    // A planned flee still shows the player's ship until the turn ends.
    const plannedFlee = s.id === this.preview.playerId && !this.battle.result;
    if (!art || (s.status === 'fled' && !plannedFlee)) return;
    // Pirates disable the player's ship; they do not destroy it (owner, 2026-10-28).
    const disabled = s.status === 'destroyed' && s.id === this.battle.playerId && defeatKind(this.battle) === 'disabled';
    if (s.status === 'destroyed' && !disabled) {
      for (const c of shipCells(s)) t.put(c.x, c.y, ',', styleColor(data.art.style, 'dim'));
      return;
    }
    const st = combatStats(s, data);
    const share = s.ship.hullHp / Math.max(1, st.maxHullHp);
    const state: DamageState = share < 1 / 3 ? 'critical' : share < 2 / 3 ? 'damaged' : 'normal';
    drawArt(t, data, art.battle, s.pos.x, s.pos.y, {
      side: sideOf(s),
      state: disabled ? 'critical' : state,
      mirrored: s.mirrored,
      hot: heatState(s, data, st) !== 'normal',
      enginesOff: disabled || st.engineCount === 0,
    });
    if (s.status === 'surrendered') {
      const mark = data.art.ships.surrenderMarker;
      t.put(s.pos.x, s.pos.y - 1, mark.glyph, styleColor(data.art.style, mark.fg));
    }
    // A click on a hostile ship selects it as the target.
    const me = this.me();
    if (hostile(me, s)) {
      const { w, h } = maskSize(s.mask);
      this.app.zones.add(s.pos.x, s.pos.y, w, () => {
        this.targetId = s.id;
      }, h);
    }
  }

  private renderPanel(t: Term): void {
    const { data } = this.game;
    const ui = palette(data).ui;
    const zones = this.app.zones;
    const me = this.me();
    const st = combatStats(me, data);
    const x = PANEL_X + 1;
    let y = 0;
    t.vline(PANEL_X, 0, HEIGHT - 1, '│', ui.border);
    const line = (text: string, fg: string = ui.text) => {
      t.text(x, y++, fit(text, WIDTH - x), fg);
    };
    line(`Turn ${this.preview.turn + 1}/${data.balance.combat.maxTurns}`, ui.title);
    line(me.name, ui.bright);
    line(`Hull ${Math.round(me.ship.hullHp)}/${st.maxHullHp}  Shield ${Math.round(me.shield)}/${st.shieldCapacity}`);
    line(`Armor ${st.armor}  Plating ${Math.round(me.ship.armorHp)}/${st.maxArmorHp}`);
    line(`Engine ${me.ship.engineValue.toFixed(0)}/${st.maxEngineValue}  Move ${moveBudget(me, data)}/${me.ship.fuel > 0 ? st.move : 0}`);
    line(`Maneuver ${Math.round(st.maneuver)}  Fuel ${me.ship.fuel.toFixed(1)}`);
    // Heat bar (style.json heat: cells, step, zones).
    const heat = data.art.style.heat;
    // The bar shows the heat at the end of this turn with the planned shots (Q-40 forecast).
    const now = (100 * me.heat) / Math.max(1, st.heatCapacity);
    const pct = (100 * heatForecast(me, data)) / Math.max(1, st.heatCapacity);
    t.text(x, y, 'Heat ', ui.dim);
    for (let i = 0; i < heat.cells; i++) {
      const lo = i * heat.step;
      const filled = pct > lo;
      const zone = lo >= (heat.zones.over?.[0] ?? 100) ? 'over' : lo >= (heat.zones.hot?.[0] ?? 70) ? 'hot' : 'normal';
      const fg = zone === 'over' ? color(data, 'over') : zone === 'hot' ? color(data, 'hot') : ui.good;
      const flash = zone === 'over' && filled && Math.floor((Date.now() * heat.flashHz) / 500) % 2 === 1;
      t.put(x + 5 + i, y, filled && !flash ? '█' : '·', filled ? fg : ui.dim);
    }
    const hotPct = 100 * data.balance.combat.hotShare;
    const label = me.overheated ? `OFF ${overheatTurnsLeft(me, data)}t` : `${Math.round(now)}>${Math.round(pct)}%`;
    t.text(x + 18, y++, label, me.overheated || pct >= 100 ? ui.danger : pct >= hotPct ? color(data, 'hot') : ui.text);
    line(`Cooling ${st.cooling}/turn`);
    // Power (Q-41): available (reserved) / max, + capacitor charge if the ship has one.
    const pw = powerState(me, data);
    const num = (v: number) => String(Math.round(v * 10) / 10);
    t.text(x, y, 'Power ', ui.dim);
    t.text(x + 6, y++, `${num(Math.max(0, pw.available))} (${num(pw.reserved)}) / ${num(pw.max)}${pw.capacity > 0 ? ` + ${num(pw.stored)}` : ''}`, pw.available <= 1e-9 ? ui.warning : ui.bright);
    y++;
    // Power list.
    const tgt = this.target();
    const states = data.art.modules.states;
    this.powerList().forEach((slot, i) => {
      const m = moduleAt(me, slot);
      if (!m) return;
      const key = POWER_KEYS[i] ?? ' ';
      const weapon = isDirectWeapon(m, data);
      const w = moduleValues(data, m);
      const chance = weapon && tgt ? hitChance(this.preview, me, w, tgt, w.area !== undefined ? 'hull' : this.aim, data) : 0;
      const cannot = weapon && m.on && (me.overheated || chance <= 0);
      const state = !m.on ? states.off : cannot ? states.cannot_fire : states.on;
      const rowY = y++;
      t.key(x, rowY, key, ui.key, ui.keyBg);
      t.put(x + 2, rowY, state?.glyph ?? '?', styleColor(data.art.style, state?.fg ?? 'hi'));
      drawModuleIcon(t, data, x + 4, rowY, m);
      t.text(x + 10, rowY, fit(moduleShort(data, m.moduleId), 11), m.on ? ui.text : ui.dim);
      const fired = me.fired.includes(slotKey(slot));
      const unpowered = me.unpowered.includes(slotKey(slot));
      const draw = drawOf(m, data);
      const kind = isReserving(m, data) ? 'res' : moduleValues(data, m).thrust !== undefined ? 'mv' : '';
      const info = unpowered ? 'no pwr' : weapon ? (fired ? 'planned' : m.on && chance > 0 ? `${Math.round(chance * 100)}% ${draw}p` : `-- ${draw}p`) : `${draw}p ${kind}`;
      t.text(x + 22, rowY, fit(info, 8), unpowered ? ui.danger : weapon && chance > 0 && !fired ? ui.good : ui.dim);
      zones.add(x, rowY, WIDTH - x, () => this.app.press(press(key)));
    });
    y++;
    // Target.
    if (tgt) {
      const ts = combatStats(tgt, data);
      line(`Target: ${tgt.name}`, ui.title);
      line(`Hull ${Math.round(tgt.ship.hullHp)}/${ts.maxHullHp}  Shield ${Math.round(tgt.shield)}/${ts.shieldCapacity}`);
      line(`Engine ${tgt.ship.engineValue.toFixed(0)}/${ts.maxEngineValue}  Maneuver ${Math.round(ts.maneuver)}`);
      const lof = lineOfFire(this.preview, me, tgt);
      line(`Distance ${lof.distance}${lof.clear ? '' : ' (blocked)'}${lof.debris ? ' debris' : ''}`, lof.clear ? ui.text : ui.danger);
      line(`Aim: ${this.aim === 'hull' ? 'Hull' : 'Engines (aimed shot)'}`, ui.dim);
    }
    y++;
    line('Ships', ui.dim);
    for (const s of this.preview.ships) {
      if (s.id === me.id) continue;
      const fg = s.side === 'player' ? ui.good : ui.danger;
      t.text(x, y, fit(`${s.id === tgt?.id ? '>' : ' '}${s.name}`, 18), isActive(s) ? fg : ui.dim);
      t.text(x + 19, y, fit(isActive(s) ? `${Math.round(s.ship.hullHp)} hp` : s.status, 10), ui.dim);
      if (isActive(s) && hostile(me, s)) zones.add(x, y, WIDTH - x, () => {
        this.targetId = s.id;
      });
      y++;
    }
  }

  onKey(k: KeyInput): boolean {
    if (k.key === ' ') {
      this.skipEffects();
      return true;
    }
    if (this.battle.result) {
      if (k.key === 'Enter') {
        this.skipEffects();
        this.onEnd(this.battle);
      }
      return true;
    }
    if (this.timeline) this.skipEffects();
    this.confirmed = this.armed;
    this.armed = null;
    const me = this.me();
    const i = POWER_KEYS.indexOf(k.key);
    if (k.key.length === 1 && i >= 0) {
      const slot = this.powerList()[i];
      const m = slot ? moduleAt(me, slot) : null;
      if (slot && m) this.plan({ kind: 'toggle', slot, on: !m.on });
      return true;
    }
    const step = k.shift ? 5 : 1;
    const moves: Record<string, Vec2> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const mv = moves[k.key];
    if (mv) {
      this.cursor = {
        x: Math.max(0, Math.min(this.preview.width - 1, this.cursor.x + mv.x)),
        y: Math.max(0, Math.min(this.preview.height - 1, this.cursor.y + mv.y)),
      };
      return true;
    }
    switch (k.key) {
      case 'Enter':
        this.planMoveToward(this.cursor);
        return true;
      case 'Tab': {
        const foes = this.foes();
        if (foes.length === 0) return true;
        const at = foes.findIndex((s) => s.id === this.targetId);
        this.targetId = (foes[(at + (k.shift ? foes.length - 1 : 1)) % foes.length] as CombatShip).id;
        return true;
      }
      case 'f':
        this.planFire();
        return true;
      case 'a':
        this.aim = this.aim === 'hull' ? 'engines' : 'hull';
        return true;
      case 'e':
        this.endTurn();
        return true;
      case 'u':
      case 'Backspace':
        this.undo();
        return true;
      case 'Escape':
        this.notice = 'To leave a battle, move to a map edge with an engine ON (flee).';
        return true;
      default:
        return false;
    }
  }

  /** A click on the grid: a reachable cell plans a move; any cell moves the cursor. */
  onClick(x: number, y: number): void {
    if (x >= this.preview.width || y >= this.preview.height || this.battle.result) return;
    this.confirmed = this.armed;
    this.armed = null;
    this.cursor = { x, y };
    const me = this.me();
    const budget = moveBudget(me, this.game.data);
    if (budget > 0) this.planMoveToward({ x, y });
  }

  help(): string[] {
    return [
      'COMBAT',
      '',
      '1-0          Switch a module ON or OFF (free)',
      'Arrows       Move the cursor (Shift: 5 cells)',
      'Enter/click  Move the ship (its left cell) to the cursor, or as far',
      '             as it can go toward it this turn',
      'Tab/click    Select the target ship',
      'F            Fire all weapons that can hit the target',
      'A            Aim at the Hull or the Engines (an aimed shot: high-',
      '             tracking weapons such as lasers aim best)',
      'E            End the turn (the enemy moves and fires)',
      'U            Clear the plan for this turn',
      'Space        Skip the effects',
      '',
      'Power: available (reserved) / max + capacitor. Shields reserve their',
      'draw. A move costs the engines\' draw (one time a turn); a shot costs',
      'the weapon\'s draw. Over the available power: the capacitor pays, then',
      'reserved systems lose power until the end of the turn (confirm).',
      'Flee: move onto a map edge cell with an engine ON.',
      'Heat: the bar shows the heat after this turn. Hot (70%+) gives -10%',
      'hit and half shield regen. Overheat (100%+) hurts the hull and takes',
      'the ship offline: no orders, engines, or shields until heat is 70%.',
      'An engine value of 0 stops the ship. Shots to the Engines lower it.',
    ];
  }
}

function color(data: import('../../data').GameData, name: string): string {
  return data.art.effects.colors[name] ?? styleColor(data.art.style, name);
}

export function resultText(b: Battle): string {
  switch (b.result) {
    case 'win':
      return 'Victory: the other side is destroyed, has surrendered, or has fled.';
    case 'loss':
      return defeatKind(b) === 'disabled' ? 'The pirates disable your ship.' : 'Your ship is destroyed.';
    case 'fled':
      return 'You flee from the battle.';
    case 'draw':
      return 'The battle ends in a draw: the sides separate.';
    default:
      return '';
  }
}

/** Short log lines for the effects of one turn. */
function describe(effects: Effect[], b: Battle, data: import('../../data').GameData): string[] {
  const name = (id: number) => b.ships.find((s) => s.id === id)?.name ?? '?';
  const out: string[] = [];
  for (const e of effects) {
    switch (e.kind) {
      case 'shot':
        out.push(`${name(e.shipId)} ${moduleShort(data, e.moduleId)} -> ${name(e.targetId)}: ${e.hit ? 'hit' : 'miss'}`);
        break;
      case 'flak':
        out.push(`${name(e.shipId)} fires flak.`);
        break;
      case 'shield':
        out.push(`  ${name(e.shipId)} shield -${e.amount.toFixed(0)}${e.broken ? ' (down)' : ''}`);
        break;
      case 'hull':
        out.push(`  ${name(e.shipId)} hull -${e.amount.toFixed(0)}`);
        break;
      case 'engine':
        out.push(`  ${name(e.shipId)} engine -${e.amount.toFixed(0)}`);
        break;
      case 'overheat':
        out.push(`${name(e.shipId)} overheats: hull -${e.amount.toFixed(0)}; engines, shields, and weapons offline.`);
        break;
      case 'online':
        out.push(`${name(e.shipId)} cools down and is back online.`);
        break;
      case 'unpowered':
        out.push(`${name(e.shipId)} overdraws power: ${moduleShort(data, e.moduleId)} has no power until the end of the turn.`);
        break;
      case 'destroy':
        out.push(`${name(e.shipId)} is ${e.shipId === b.playerId && defeatKind(b) === 'disabled' ? 'disabled' : 'destroyed'}.`);
        break;
      case 'flee':
        out.push(`${name(e.shipId)} flees.`);
        break;
      case 'surrender':
        out.push(`${name(e.shipId)} surrenders.`);
        break;
      default:
        break;
    }
  }
  return out;
}
