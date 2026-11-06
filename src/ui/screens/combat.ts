// Combat screen (Sections 13.1, 13.3, 13.6, 17.5, 18). The grid is 70 x 30;
// the right panel (30 x 40) shows the ship status, power list, heat bar, and
// target; the bottom 5 rows show the battle log. The player plans the turn:
// switch modules ON and OFF (number keys), move (cursor + Enter, or a click),
// and fire (F) at the target (Tab or a click), at the Hull or the Engines (A).
// The plan shows at once; E ends the turn and the resolver runs it. Effects
// from effects.json play after the turn; Space skips them.
import type { TutorialTrigger } from '../../data/schemas';
import { defeatKind } from '../../career/defeat';
import { ammoOf, guidedHitChance, inLaunchRange, isGuided } from '../../combat/munitions';
import { Rng } from '../../core/rng';
import { isActive, isFleetShip, lineCells, lineOfFire, maskSize, pathTo, reachable, shipCells } from '../../combat/geometry';
import { applyOrder, hostile, resolveTurn, shipById } from '../../combat/resolver';
import { AUTO_STOP_TEXT, autoResolve, autoStopReason, autoSummary, autoTurn } from '../../combat/autoplay';
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
import type { Aim, Battle, CombatShip, Effect, Order, SlotRef, Vec2, WingOrder } from '../../combat/types';
import type { Game } from '../../core/game';
import type { Term } from '../../render/display';
import { HEIGHT, WIDTH } from '../../render/display';
import { applyOverlay, buildTimeline, effectColor, effectVersion, overlayAt, persistCells, renderOps, sideOf, type Timeline } from '../../render/effects';
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
  /** The battle before the turn that the timeline plays (the ships' look until their move or end). */
  private before: Battle | null = null;
  private animStart = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Auto until (Q-47): the AI plays turn after turn until a stop reason or a key. */
  private auto = false;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  /** Auto-resolve waits for a second R. */
  private resolveArmed = false;
  /** The orders box (P1-UI-02) and its selected fleet ship. */
  private ordersOpen = false;
  private orderIndex = 0;

  constructor(
    private readonly app: App,
    battle: Battle,
    private readonly onEnd: (b: Battle) => void,
    options: { autoResolve?: boolean } = {},
  ) {
    this.battle = battle;
    this.preview = structuredClone(battle);
    const me = this.me();
    this.cursor = { ...me.pos };
    this.targetId = this.foes()[0]?.id ?? null;
    this.log.push('Battle. Plan your turn: 1-0 power, arrows + Enter move, Tab target, F fire, E end turn.');
    if (options.autoResolve) this.resolveAll();
  }

  tutorialTriggers(): TutorialTrigger[] {
    return ['combat'];
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
      if (!m || !m.on || me.fired.includes(slotKey(slot))) return false;
      return this.weaponChance(m, t) > 0;
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

  /** Hit chance of a weapon against `t` now; guided weapons: in launch range with ammunition, the munition hit roll. */
  private weaponChance(m: NonNullable<ReturnType<typeof moduleAt>>, t: CombatShip): number {
    const data = this.game.data;
    const me = this.me();
    const w = moduleValues(data, m);
    if (isGuided(m, data)) return ammoOf(m, data) > 0 && inLaunchRange(me, w, t) ? guidedHitChance(w, t, data) : 0;
    if (!isDirectWeapon(m, data)) return 0;
    return hitChance(this.preview, me, w, t, w.area !== undefined ? 'hull' : this.aim, data);
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
    this.showTurn(this.battle, resolveTurn(this.battle, this.orders, this.game.data));
  }

  /** Mode A (Q-47): the AI plans this turn for the player's ship; the plan is not used. */
  private autoTurnOnce(): void {
    this.showTurn(this.battle, autoTurn(this.battle, this.game.data), ' (auto)');
  }

  /** Mode B (Q-47): one auto turn, then the next one after its effects, until a stop reason. */
  private autoStep(): void {
    this.autoTimer = null;
    if (!this.auto || this.battle.result) {
      this.auto = false;
      return;
    }
    const { data } = this.game;
    const before = this.battle;
    const out = autoTurn(before, data);
    this.showTurn(before, out, ' (auto)');
    const reason = autoStopReason(before, out, data);
    if (reason) {
      this.auto = false;
      if (reason !== 'end') {
        this.notice = AUTO_STOP_TEXT[reason];
        this.log.push(AUTO_STOP_TEXT[reason]);
      }
      return;
    }
    this.notice = 'Auto until: press any key to stop.';
    this.autoTimer = setTimeout(() => {
      this.autoStep();
      this.app.render();
    }, (this.timeline?.duration ?? 0) + data.balance.combat.auto.turnDelayMs);
  }

  private stopAuto(): void {
    this.auto = false;
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.autoTimer = null;
    this.notice = 'Auto stops. You have control.';
  }

  /** Mode C (Q-47): the battle resolves at once; the log shows a summary. */
  private resolveAll(): void {
    const start = this.battle;
    const out = autoResolve(start, this.game.data);
    this.battle = out.battle;
    this.preview = structuredClone(out.battle);
    this.orders = [];
    this.skipEffects();
    for (const line of autoSummary(start, out.battle)) this.log.push(line);
    this.notice = '';
    if (this.battle.result) this.log.push(resultText(this.battle));
  }

  private showTurn(before: Battle, out: ReturnType<typeof resolveTurn>, tag = ''): void {
    const { data } = this.game;
    for (const r of out.refused) this.log.push(`Order refused: ${r}`);
    this.log.push(`Turn ${before.turn + 1}${tag}:`);
    for (const line of describe(out.effects, out.battle, data)) this.log.push(`  ${line}`);
    this.battle = out.battle;
    this.preview = structuredClone(out.battle);
    this.orders = [];
    this.notice = '';
    this.playEffects(out.effects, before);
    if (this.battle.result) this.log.push(resultText(this.battle));
  }

  private playEffects(effects: Effect[], before: Battle): void {
    const tl = buildTimeline(effects, this.battle, this.game.data, before);
    this.before = before;
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
    // Cells that are not empty (soft effect cells do not paint them): asteroids, debris, ships, pods, munitions.
    const solid = new Set<string>();
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if ((b.cells[y]?.[x] ?? '.') !== '.') solid.add(`${x},${y}`);
    // Move preview (effects v0.2 move_preview): the reachable anchors on the moveBg color.
    const me = this.me();
    const planning = !this.battle.result && !this.timeline;
    if (planning && isActive(me)) {
      const budget = moveBudget(me, data);
      const bg = effectColor(data, 'moveBg');
      if (budget > 0) for (const key of reachable(b, me, budget).steps.keys()) {
        const [x, y] = key.split(',').map(Number) as [number, number];
        if (solid.has(key)) continue;
        t.put(x, y, (x + y) % 6 === 0 ? '·' : ' ', ui.border, bg);
      }
    }
    // Cargo pods (Section 13.7).
    for (const pod of b.pods) {
      t.put(pod.pos.x, pod.pos.y, '$', color(data, 'cargoPod'));
      solid.add(`${pod.pos.x},${pod.pos.y}`);
    }
    // Ships, then guided munitions (the glyph of the effect's "persist", turned toward the target).
    for (const s of b.ships) this.drawShip(t, s, solid);
    if (planning) this.drawPlannedMove(t, solid);
    for (const mu of b.munitions) {
      if (this.timeline?.movingMunitions.includes(mu.id)) continue;
      const v = effectVersion(data, mu.moduleId === 'torpedo_tube' ? 'torpedo_move' : 'missile_move', mu.tier);
      const proj = ((v?.persist?.o as { k?: string; g?: string; fg?: string }[] | undefined) ?? []).find((o) => o.k === 'proj');
      const target = b.ships.find((s) => s.id === mu.targetId);
      const left = target ? target.pos.x < mu.pos.x : mu.side !== 'player';
      const glyphs = Array.from(proj?.g ?? '►').map((g) => (left ? g.replace('►', '◄') : g));
      const fg = color(data, proj?.fg ?? 'guided');
      // The head is on the munition cell; a body glyph (torpedo) is behind it.
      glyphs.reverse().forEach((g, k) => {
        t.put(mu.pos.x + (left ? k : -k), mu.pos.y, g, fg);
        solid.add(`${mu.pos.x + (left ? k : -k)},${mu.pos.y}`);
      });
    }
    // Target brackets and line of fire.
    const tgt = this.target();
    if (tgt && isActive(me) && !this.timeline) {
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
      applyOverlay(overlayAt(this.timeline, Date.now() - this.animStart), (x, y) => solid.has(`${x},${y}`), (c) => {
        if (c.x >= 0 && c.y >= 0 && c.x < b.width && c.y < b.height) t.put(c.x, c.y, c.ch, c.fg);
      });
    }
    if (this.ordersOpen) this.renderOrders(t);
    this.renderPanel(t);
    // Notice, keys, log.
    t.hline(30, 0, PANEL_X - 1, '─', ui.border);
    t.text(0, HINT_Y, fit(this.notice, PANEL_X - 1), ui.warning);
    if (this.battle.result) {
      // M6-UI-04: surrendered ships can be boarded (prize, cargo) after the battle.
      const board = this.battle.result === 'win' && this.battle.ships.some((s) => s.side === 'other' && s.status === 'surrendered');
      t.text(0, HINT_Y + 1, fit(`${resultText(this.battle)} Press Enter to ${board ? 'board the surrendered ships (prize, cargo)' : 'leave the battle'}.`, PANEL_X - 1), ui.title);
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
          ['A', `Aim ${this.aim === 'hull' ? 'Hull' : 'Engines'}`, press('a')],
          ['Space', 'Skip', press(' ')],
          ['?', 'Help', press('?')],
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
          ['U', 'Undo', press('u')],
          ...(this.wingmen().length > 0 ? ([['O', 'Orders', press('o')]] as [string, string, KeyInput][]) : []),
          ['T', 'Auto turn', press('t')],
          ['Shift+T', 'Auto until', press('t', true)],
          ['R', 'Resolve', press('r')],
        ],
        ui,
        this.app.press,
        2,
      );
    }
    t.hline(LOG_Y - 1, 0, PANEL_X - 1, '─', ui.border);
    this.log.slice(-LOG_ROWS).forEach((l, i) => t.text(0, LOG_Y + i, fit(l, PANEL_X - 1), ui.text));
  }

  /**
   * Draws a ship. While the turn's effects play: a ship that moves shows at
   * its start cell until its move starts (the effect draws it while it
   * moves); a ship that is destroyed, flees, or surrenders shows as it was
   * until that effect starts; a reinforcement shows when its arrival ends.
   */
  private drawShip(t: Term, s0: CombatShip, solid: Set<string>): void {
    const { data } = this.game;
    let s = s0;
    const a = this.timeline?.ships[s0.id];
    if (this.timeline && a) {
      const now = Date.now() - this.animStart;
      if ((a.appearAt !== undefined && now < a.appearAt) || a.hidden.some(([from, to]) => now >= from && now < to)) return;
      const old = this.before?.ships.find((x) => x.id === s0.id);
      const pos = a.path && a.moveStart !== undefined && now < a.moveStart ? (a.path[0] ?? s0.pos) : s0.pos;
      s = old && a.settleAt !== undefined && now < a.settleAt ? { ...old, pos } : { ...s0, pos };
    }
    const art = data.art.ships.ships[s.ship.hullId];
    // A planned flee still shows the player's ship until the turn ends.
    const plannedFlee = s.id === this.preview.playerId && !this.battle.result;
    if (!art || (s.status === 'fled' && !plannedFlee)) return;
    // Pirates disable the player's ship; they do not destroy it (owner, 2026-10-28).
    const disabled = s.status === 'destroyed' && (s.id === this.battle.playerId || isFleetShip(s)) && defeatKind(this.battle) === 'disabled';
    if (s.status === 'destroyed' && !disabled) {
      // Debris: the "persist" of the destroy effect (effects v0.2).
      const size = data.hullById.get(s.ship.hullId)?.sizeClass;
      const id = size === 'capital' ? 'destroy_capital' : size === 'small' ? 'destroy_small' : 'destroy_medium';
      for (const c of persistCells(data, id, s, this.preview.width, this.preview.height)) t.put(c.x, c.y, c.ch, c.fg);
      return;
    }
    for (const c of shipCells(s)) solid.add(`${c.x},${c.y}`);
    const st = combatStats(s, data);
    const share = s.ship.hullHp / Math.max(1, st.maxHullHp);
    const state: DamageState = share < 1 / 3 ? 'critical' : share < 2 / 3 ? 'damaged' : 'normal';
    drawArt(t, data, art.battle, s.pos.x, s.pos.y, {
      // A surrendered ship shows in neutral colors (effects v0.2 surrender).
      side: s.status === 'surrendered' ? 'neutral' : sideOf(s),
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

  /**
   * Move preview (effects v0.2 move_preview): after a planned move, the ship
   * shows at its planned cell; a ghost in playerDeep stays at the start cell,
   * and a dotted path in playerDeep goes from the start to the planned cell.
   */
  private drawPlannedMove(t: Term, solid: Set<string>): void {
    const { data } = this.game;
    const now = shipById(this.battle, this.battle.playerId);
    const me = this.me();
    if (!now || !isActive(me) || (now.pos.x === me.pos.x && now.pos.y === me.pos.y)) return;
    const path = pathTo(reachable(this.battle, now, Math.max(1, moveBudget(now, data))), me.pos) ?? [now.pos, me.pos];
    const ghost = renderOps([{ k: 'ship', key: now.ship.hullId, x: now.pos.x, y: now.pos.y, mirror: now.mirrored, ghost: 'playerDeep' }], { data, paths: {} });
    const { w, h } = maskSize(now.mask);
    const dx = now.mirrored ? -1 : w;
    const dy = Math.floor((h - 1) / 2);
    const dots = renderOps([{ k: 'line', path: 'mv', set: 'dot', fg: 'playerDeep', dx, dy, i0: 1, soft: 1 }], { data, paths: { mv: path } });
    applyOverlay([...ghost.filter((c) => !solid.has(`${c.x},${c.y}`)), ...dots], (x, y) => solid.has(`${x},${y}`), (c) => t.put(c.x, c.y, c.ch, c.fg));
  }

  /** The player's other fleet ships in the battle (Wingman AI, P1-FB-02). */
  private wingmen(): CombatShip[] {
    return this.preview.ships.filter((s) => isFleetShip(s) && s.id !== this.preview.playerId && isActive(s));
  }

  /** Sets an order on a fleet ship (P1-FB-03): free, at once, on the battle and on the plan. */
  private setOrder(shipId: number, order: WingOrder): void {
    for (const b of [this.battle, this.preview]) {
      const s = b.ships.find((x) => x.id === shipId);
      if (s) s.order = structuredClone(order);
    }
  }

  /** Keys of the orders box (P1-UI-02). */
  private onOrderKey(k: KeyInput): boolean {
    const list = this.wingmen();
    const ship = list[this.orderIndex];
    if (!ship || k.key === 'Escape' || k.key === 'o' || k.key === 'Enter') {
      this.ordersOpen = false;
      return true;
    }
    switch (k.key) {
      case 'ArrowUp':
        this.orderIndex = (this.orderIndex + list.length - 1) % list.length;
        return true;
      case 'ArrowDown':
      case 'Tab':
        this.orderIndex = (this.orderIndex + 1) % list.length;
        return true;
      case 'a': {
        const t = this.target();
        this.setOrder(ship.id, { kind: 'attack', targetId: t?.id ?? null });
        this.notice = `${ship.name}: attack ${t ? t.name : 'the nearest enemy'}.`;
        return true;
      }
      case 'g':
        this.setOrder(ship.id, { kind: 'guard' });
        this.notice = `${ship.name}: guard ${this.me().name}.`;
        return true;
      case 'h':
        this.setOrder(ship.id, { kind: 'hold' });
        this.notice = `${ship.name}: hold position.`;
        return true;
      case 'r':
        this.setOrder(ship.id, { kind: 'retreat' });
        this.notice = `${ship.name}: retreat to the map edge and leave the battle.`;
        return true;
      default:
        return true;
    }
  }

  /** The orders box: each fleet ship with its hull and order (P1-UI-02). */
  private renderOrders(t: Term): void {
    const { data } = this.game;
    const ui = palette(data).ui;
    const list = this.wingmen();
    const w = 58;
    const h = list.length + 6;
    const x0 = 4;
    const y0 = 3;
    t.box(x0, y0, w, h, ui.border, 'Fleet orders', ui.title, 'modal');
    list.forEach((s, i) => {
      const sel = i === this.orderIndex;
      const bg = sel ? ui.selectBg : undefined;
      const st = combatStats(s, data);
      const o = s.order ?? { kind: 'attack' as const, targetId: null };
      const target = o.kind === 'attack' && o.targetId !== null ? this.preview.ships.find((x) => x.id === o.targetId) : undefined;
      const text = o.kind === 'attack' ? `Attack ${target && isActive(target) ? target.name : 'nearest'}` : ORDER_NAME[o.kind];
      if (bg) t.fill(x0 + 2, y0 + 2 + i, w - 4, 1, bg);
      t.text(x0 + 2, y0 + 2 + i, fit(`${sel ? '>' : ' '} ${s.name}`, 22), ui.bright, bg);
      t.text(x0 + 25, y0 + 2 + i, fit(`${Math.round(s.ship.hullHp)}/${st.maxHullHp}`, 9), ui.text, bg);
      t.text(x0 + 35, y0 + 2 + i, fit(text, w - 37), ui.highlight, bg);
      this.app.zones.add(x0 + 2, y0 + 2 + i, w - 4, () => {
        this.orderIndex = i;
      });
    });
    drawKeyHints(
      t,
      this.app.zones,
      x0 + 2,
      y0 + h - 2,
      [
        ['A', 'Attack target', press('a')],
        ['G', 'Guard', press('g')],
        ['H', 'Hold', press('h')],
        ['R', 'Retreat', press('r')],
        ['Esc', 'Close', press('Escape')],
      ],
      ui,
      this.app.press,
      1,
    );
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
      const guided = isGuided(m, data);
      const weapon = isDirectWeapon(m, data) || guided;
      const chance = weapon && tgt ? this.weaponChance(m, tgt) : 0;
      const noAmmo = guided && ammoOf(m, data) <= 0;
      const cannot = weapon && m.on && (me.overheated || chance <= 0);
      const state = !m.on ? states.off : noAmmo ? states.no_ammo : cannot ? states.cannot_fire : states.on;
      const rowY = y++;
      t.key(x, rowY, key, ui.key, ui.keyBg);
      t.put(x + 2, rowY, state?.glyph ?? '?', styleColor(data.art.style, state?.fg ?? 'hi'));
      drawModuleIcon(t, data, x + 4, rowY, m);
      t.text(x + 10, rowY, fit(moduleShort(data, m.moduleId), 11), m.on ? ui.text : ui.dim);
      const fired = me.fired.includes(slotKey(slot));
      const unpowered = me.unpowered.includes(slotKey(slot));
      const draw = drawOf(m, data);
      const kind = isReserving(m, data) ? 'res' : moduleValues(data, m).thrust !== undefined ? 'mv' : '';
      const ammo = guided ? ` a${ammoOf(m, data)}` : ` ${draw}p`;
      const info = unpowered ? 'no pwr' : noAmmo ? 'no ammo' : weapon ? (fired ? 'planned' : m.on && chance > 0 ? `${Math.round(chance * 100)}%${ammo}` : `--${ammo}`) : `${draw}p ${kind}`;
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
      // Fleet ships (P1-UI-01): hull and order.
      const order = isFleetShip(s) && isActive(s) && s.order ? ` ${ORDER_SHORT[s.order.kind]}` : '';
      t.text(x + 19, y, fit(isActive(s) ? `${Math.round(s.ship.hullHp)} hp${order}` : s.status, 12), ui.dim);
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
    // Any other key stops "auto until" (Q-47).
    if (this.auto) {
      this.stopAuto();
      return true;
    }
    const resolveArmed = this.resolveArmed;
    this.resolveArmed = false;
    if (this.battle.result) {
      if (k.key === 'Enter') {
        this.skipEffects();
        this.onEnd(this.battle);
      }
      return true;
    }
    if (this.timeline) this.skipEffects();
    if (this.ordersOpen) return this.onOrderKey(k);
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
      case 'o':
        if (this.wingmen().length === 0) this.notice = 'No other fleet ship is in the battle. Set Join on the fleet screen (J).';
        else {
          this.ordersOpen = true;
          this.orderIndex = Math.min(this.orderIndex, this.wingmen().length - 1);
        }
        return true;
      case 'a':
        this.aim = this.aim === 'hull' ? 'engines' : 'hull';
        return true;
      case 'e':
        this.endTurn();
        return true;
      case 't':
        if (k.shift) {
          this.auto = true;
          this.autoStep();
        } else this.autoTurnOnce();
        return true;
      case 'r':
        if (resolveArmed) this.resolveAll();
        else {
          this.resolveArmed = true;
          this.notice = 'Auto-resolve: the AI plays the battle to its end at once. Press R again to confirm.';
        }
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
    const auto = this.game.data.balance.combat.auto;
    const pct = (x: number) => `${Math.round(x * 100)}%`;
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
      'T            Auto turn: the AI plays this turn for you (your plan',
      '             is not used)',
      'Shift+T      Auto until: the AI plays turn after turn. It stops when',
      `             your hull falls below ${pct(auto.stopHull)}, your ship gets Hot, help`,
      '             arrives, a munition comes at you, or you press a key',
      'R, R         Auto-resolve: the AI plays the battle to its end at once',
      'O            Fleet orders (with other fleet ships in the battle):',
      '             Up/Down a ship; A attack the target, G guard your ship,',
      '             H hold position, R retreat and leave; free, at once.',
      '             If your ship is lost or flees, you command the next one.',
      'The AI fights like a careful captain: it keeps the best range, does',
      `not overheat, and flees to an edge below ${pct(auto.retreatHull)} hull.`,
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

const ORDER_SHORT: Record<WingOrder['kind'], string> = { attack: 'Atk', guard: 'Grd', hold: 'Hld', retreat: 'Ret' };
const ORDER_NAME: Record<WingOrder['kind'], string> = { attack: 'Attack', guard: 'Guard', hold: 'Hold', retreat: 'Retreat' };

function color(data: import('../../data').GameData, name: string): string {
  return effectColor(data, name);
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
      case 'launch':
        out.push(`${name(e.shipId)} launches a ${moduleShort(data, e.moduleId)} munition.`);
        break;
      case 'munitionHit':
        out.push(`${moduleShort(data, e.moduleId)} munition -> ${name(e.targetId)}: ${e.hit ? 'hit' : 'miss'}`);
        break;
      case 'pd':
        out.push(`${name(e.shipId)} point defense: ${e.hit ? 'hit' : 'miss'}`);
        break;
      case 'reinforce':
        out.push(`${e.faction === 'patrol' ? 'A patrol' : 'Pirate reinforcements'} arrive${e.faction === 'patrol' ? 's' : ''}: ${e.shipIds.length} ship${e.shipIds.length === 1 ? '' : 's'} on the ${e.side === 'player' ? 'your' : 'enemy'} side.`);
        break;
      case 'pod':
        out.push(`  ${name(e.shipId)} drops a cargo pod ($).`);
        break;
      case 'collect':
        out.push(`${name(e.shipId)} collects ${e.units} units of cargo.`);
        break;
      case 'munitionDown':
        out.push('  A munition is destroyed.');
        break;
      case 'munitionLost':
        out.push('  A munition burns out.');
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
