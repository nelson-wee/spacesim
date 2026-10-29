// Hail screen (Section 17.1 (10), M5-ENC-09): the encounter text, the other
// group with its threat band, and the options with keys (Section 10.7, Q-15,
// Q-16, Q-17). An option resolves the encounter or starts a battle.
import type { TutorialTrigger } from '../../data/schemas';
import { massFactor } from '../../actor/fuel';
import { attackNonPirate } from '../../career/consequences';
import type { Game } from '../../core/game';
import { rng } from '../../core/game';
import type { Term } from '../../render/display';
import { HEIGHT, WIDTH } from '../../render/display';
import { palette, threatBandColor } from '../../render/palette';
import { battleMapFor } from '../../encounter/battleMap';
import { bandOf, threatBand } from '../../encounter/budget';
import type { Ship } from '../../core/types';
import { type Encounter, flagshipTu, fleeSucceeds, type HailOption, hailOptions, payTribute } from '../../encounter/encounter';
import { travelStats } from '../../ship/stats';
import type { App, Screen } from '../app';
import { startBattle } from '../combatStart';
import type { KeyInput } from '../input';
import { drawKeyHints, press } from '../widgets/clicks';

const LABEL: Record<HailOption, [string, string]> = {
  fight: ['F', 'Fight'],
  flee: ['L', 'Flee'],
  pay: ['P', 'Pay tribute'],
  pursue: ['U', 'Pursue'],
  ignore: ['I', 'Ignore'],
  attack: ['A', 'Attack'],
};

export class HailScreen implements Screen {
  readonly overlay = true;

  constructor(
    private readonly app: App,
    private readonly enc: Encounter,
  ) {}

  tutorialTriggers(): TutorialTrigger[] {
    return ['hail'];
  }

  private get game(): Game {
    if (!this.app.game) throw new Error('No game');
    return this.app.game;
  }

  private text(): string[] {
    const e = this.enc;
    const sector = this.game.state.world.sectors[e.sectorId];
    const where = sector ? ` in ${sector.name}` : '';
    if (e.kind === 'pirate') {
      if (e.behavior === 'attack') return [`Pirates${where}: ${e.name}. They attack!`, 'They are much stronger than your flagship.'];
      if (e.behavior === 'tribute') return [`Pirates${where}: ${e.name}.`, 'They demand tribute: half of the cargo of your fullest ship.'];
      return [`Pirates${where}: ${e.name}.`, 'They see your guns and turn away.'];
    }
    if (e.kind === 'trader') return [`A trader${where}: ${e.name}.`, 'It goes on its way.'];
    if (e.hostile) return [`A patrol${where}: ${e.name}.`, 'You are Wanted. The patrol attacks!'];
    return [`A patrol${where}: ${e.name}.`, 'The patrol checks your ship and lets you go.'];
  }

  render(t: Term): void {
    const { data } = this.game;
    const ui = palette(data).ui;
    const w = 64;
    const h = 18;
    const x = Math.floor((WIDTH - w) / 2);
    const y = Math.floor((HEIGHT - h) / 2);
    t.box(x, y, w, h, ui.border, 'Hail', ui.title, 'modal');
    let row = y + 2;
    for (const line of this.text()) t.text(x + 2, row++, line, ui.bright, undefined, w - 4);
    row++;
    // The group, with each ship's TU.
    for (const s of this.enc.ships) {
      const name = data.loadoutById.get(s.loadoutId)?.name ?? s.loadoutId;
      const role = s.escortOf !== null ? ' (escort)' : '';
      t.text(x + 4, row++, `${name}${role}`, ui.text, undefined, 40);
    }
    // Threat band of the group (style.json threatBand), and the sector band.
    const band = data.art.style.threatBand;
    const sector = this.game.state.world.sectors[this.enc.sectorId];
    const level = Math.min(band.width, bandOf(this.enc.groupTu, data));
    t.text(x + 2, ++row, 'Threat ', ui.dim);
    for (let i = 0; i < band.width; i++) t.put(x + 9 + i, row, i < level ? band.glyph : band.empty, i < level ? threatBandColor(data.art.style, level) : ui.dim);
    const flagTu = flagshipTu(this.game.state.player, data);
    t.text(x + 16, row, `${Math.round(this.enc.groupTu)} TU against your ${Math.round(flagTu)} TU${sector ? `; sector band ${threatBand(sector, data)}` : ''}`, ui.dim);
    row += 2;
    const keys = hailOptions(this.enc).map((o) => {
      const [key, label] = LABEL[o];
      return [key, label, press(key.toLowerCase())] as [string, string, KeyInput];
    });
    if (hailOptions(this.enc).includes('fight')) keys.splice(1, 0, ['R', 'Auto-resolve', press('r')]);
    drawKeyHints(t, this.app.zones, x + 2, y + h - 2, keys, ui, this.app.press);
  }

  onKey(k: KeyInput): boolean {
    // Auto-resolve (Q-47): Fight, and the AI plays the battle to its end at once.
    if (k.key === 'r' && hailOptions(this.enc).includes('fight')) {
      this.choose('fight', true);
      return true;
    }
    const option = hailOptions(this.enc).find((o) => LABEL[o][0].toLowerCase() === k.key.toLowerCase());
    // Esc does not close the hail: the player must select an option.
    if (!option) return k.key === 'Escape';
    this.choose(option);
    return true;
  }

  private choose(option: HailOption, autoResolve = false): void {
    const game = this.game;
    const { data, state } = game;
    const player = state.player;
    const enc = this.enc;
    const sector = state.world.sectors[enc.sectorId];
    const map = sector ? battleMapFor(sector, enc.point, state.world.locations, data) : undefined;
    const enemies = enc.ships.map((s) => ({ loadoutId: s.loadoutId, ai: s.ai, faction: s.faction, escortOf: s.escortOf, cargo: s.cargo }));
    const battle = (opts: { aggressor: 'player' | 'other'; enemyFirst?: boolean; evade?: boolean; intro: string }) => {
      this.app.pop();
      startBattle(
        this.app,
        opts.evade ? enemies.map((e) => ({ ...e, ai: 'evader' as const })) : enemies,
        { aggressor: opts.aggressor, enemyFirst: opts.enemyFirst, map, sectorId: enc.sectorId, intro: `${opts.intro} Map: ${map?.name ?? 'Open Space'}.`, autoResolve },
      );
    };
    switch (option) {
      case 'fight':
        battle({ aggressor: 'other', intro: `Battle with ${enc.name}.` });
        return;
      case 'attack':
        attackNonPirate(game, player, enc.sectorId);
        battle({ aggressor: 'player', intro: `You attack ${enc.name}.` });
        return;
      case 'pursue':
        battle({ aggressor: 'player', evade: true, intro: `You pursue ${enc.name}. They run for the edge.` });
        return;
      case 'flee': {
        if (fleeSucceeds(player, enc, rng(game, 'encounter'), data)) {
          for (const ship of player.fleet) ship.fuel = Math.max(0, ship.fuel - fleeFuelOf(game, ship));
          game.bus.message('You flee. They do not catch you.', 'good');
          this.app.pop();
          return;
        }
        game.bus.message('You cannot get away!', 'danger');
        battle({ aggressor: 'other', enemyFirst: true, intro: `${enc.name} catches you. The enemy acts first.` });
        return;
      }
      case 'pay': {
        const units = payTribute(player, data);
        game.bus.message(`You pay tribute: ${units} units of cargo. The pirates let you go.`, 'warning');
        this.app.pop();
        return;
      }
      case 'ignore':
        game.bus.message(enc.kind === 'pirate' ? 'You let the pirates go.' : 'You go on your way.');
        this.app.pop();
        return;
    }
  }

  help(): string[] {
    return [
      'HAIL',
      '',
      'Pirates compare their group with your flagship.',
      'Much stronger: they attack (Fight, Flee).',
      'About equal: they demand tribute (Fight, Flee, Pay).',
      'Weaker: they turn away (Pursue, Ignore).',
      '',
      'Flee works if your flagship is faster than all of them;',
      'else it is a 50% chance. If it fails, they act first.',
      'Attack on a trader or patrol: notoriety +15, security -4.',
      'R: Fight, and the AI plays the battle for you at once (auto-resolve).',
    ];
  }
}

/** Flee fuel of one ship (Section 8.5: mass^fuelMassExponent x kFlee). */
function fleeFuelOf(game: Game, ship: Ship): number {
  return massFactor(travelStats(ship, game.data).mass, game.data) * game.data.balance.combat.kFlee;
}
