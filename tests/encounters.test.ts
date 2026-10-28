// Encounters, hail, loot, reinforcements, security, and notoriety (M5-ENC, M5-REIN, M5-LOOT, M5-SEC, M5-NOT).
import { describe, expect, it } from 'vitest';
import { addCargo, fleetUnits } from '../src/actor/cargo';
import { hunt, planSectorTrip, travelInSector } from '../src/actor/travel';
import { battleConsequences } from '../src/career/consequences';
import { addNotoriety, dockingRefusal, notorietyDay, notorietyLevel } from '../src/career/notoriety';
import { createBattle } from '../src/combat/battle';
import { generateCells } from '../src/combat/map';
import { reinforcementStep } from '../src/combat/reinforce';
import { applyOrder, resolveTurn } from '../src/combat/resolver';
import { destroyIfDead } from '../src/combat/rules';
import type { Battle, Effect } from '../src/combat/types';
import { type Game, wrapGame } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import { createRngState, Rng } from '../src/core/rng';
import type { Location, Sector } from '../src/core/types';
import { gameData } from '../src/data';
import { battleMapFor } from '../src/encounter/battleMap';
import {
  type Encounter,
  fleeSucceeds,
  hailOptions,
  payTribute,
  pirateBehavior,
  pirateEncounterOf,
  rollEncounter,
  takeCargo,
  traderEncounter,
} from '../src/encounter/encounter';
import { cargoSaleValue, sell } from '../src/services/market';
import { createShipFromLoadout } from '../src/ship/loadout';
import { changeSecurity, securityDay, securityLevel, securityTrend } from '../src/world/security';

const data = gameData();
const template = createGame(11, data).state;
const fresh = (): Game => wrapGame(structuredClone(template), data);
const startSector = (g: Game) => g.state.world.sectors[g.state.world.locations[g.state.world.startLocationId]!.sectorId]!;
const setLevel = (s: Sector, level: number) => {
  const min = data.security.levels.find((l) => l.level === level)!.min;
  s.securityValue = min + 10;
  s.securityBaseline = min + 10;
};
const pirate = (id: string) => data.templates.pirate.find((t) => t.id === id)!;

describe('pirates judge the odds (M5-ENC-04, Q-17)', () => {
  it('ratio >= 1.5 attacks, 0.75-1.49 demands tribute, below 0.75 avoids; boldness by level', () => {
    const g = fresh();
    const s = startSector(g);
    setLevel(s, 4);
    const actor = g.state.player;
    addCargo(actor, data, 'water', 5, 10);
    expect(pirateBehavior(100, actor, s, data).behavior).toBe('attack');
    expect(pirateBehavior(9, actor, s, data).behavior).toBe('tribute');
    expect(pirateBehavior(3, actor, s, data).behavior).toBe('avoid');
    setLevel(s, 0);
    expect(pirateBehavior(6, actor, s, data).ratio).toBeCloseTo(pirateBehavior(6, actor, { ...s, securityValue: 90 }, data).ratio * 1.25);
  });

  it('with no cargo, tribute pirates attack', () => {
    const g = fresh();
    const s = startSector(g);
    setLevel(s, 4);
    expect(pirateBehavior(9, g.state.player, s, data).behavior).toBe('attack');
  });

  it('hail options by encounter (Section 10.7, Q-16)', () => {
    const g = fresh();
    const s = startSector(g);
    const enc = pirateEncounterOf(pirate('lone_raider'), s, { x: 0, y: 0 }, g.state.player, data);
    expect(hailOptions({ ...enc, behavior: 'attack' })).toEqual(['fight', 'flee']);
    expect(hailOptions({ ...enc, behavior: 'tribute' })).toEqual(['fight', 'flee', 'pay']);
    expect(hailOptions({ ...enc, behavior: 'avoid' })).toEqual(['pursue', 'ignore']);
    expect(hailOptions({ ...enc, kind: 'trader' })).toEqual(['attack', 'ignore']);
    expect(hailOptions({ ...enc, kind: 'patrol', hostile: true })).toEqual(['fight', 'flee']);
  });
});

describe('encounter rolls and groups (M5-ENC-01 to 03, M5-ENC-11)', () => {
  it('on a trip: pirates, else traders 30%, else patrols 20% at level 2+; arrival rolls only pirates', () => {
    const g = fresh();
    const s = startSector(g);
    setLevel(s, 2);
    const rng = new Rng(createRngState(1, 'enc'));
    const counts: Record<string, number> = { pirate: 0, trader: 0, patrol: 0, none: 0 };
    for (let i = 0; i < 4000; i++) {
      const kind = rollEncounter('trip', s, { x: 0, y: 0 }, g.state.player, g.state.world.locations, rng, data)?.kind ?? 'none';
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    const lvl = data.security.levels[2]!;
    expect(counts.pirate! / 4000).toBeCloseTo(lvl.pirateChanceTrip, 1);
    expect(counts.trader! / 4000).toBeCloseTo((1 - lvl.pirateChanceTrip) * 0.3, 1);
    expect(counts.patrol! / 4000).toBeCloseTo((1 - lvl.pirateChanceTrip) * 0.7 * 0.2, 1);
    let other = 0;
    for (let i = 0; i < 500; i++) {
      const kind = rollEncounter('arrival', s, { x: 0, y: 0 }, g.state.player, g.state.world.locations, rng, data)?.kind;
      if (kind !== undefined && kind !== 'pirate') other++;
    }
    expect(other).toBe(0);
  });

  it('a trader has cargo from the local market; an escort at level <= 2 with Patrol AI and Escort Wasps', () => {
    const g = fresh();
    const s = startSector(g);
    setLevel(s, 1);
    const rng = new Rng(createRngState(2, 'enc'));
    const loc = g.state.world.locations[s.locationIds[0]!]!;
    const enc = traderEncounter(s, loc.pos, g.state.world.locations, rng, data);
    expect(enc.ships[0]!.ai).toBe('trader');
    expect(Object.keys(enc.ships[0]!.cargo).length).toBeGreaterThan(0);
    const escorts = enc.ships.slice(1);
    expect(escorts.length).toBeGreaterThan(0);
    for (const e of escorts) {
      expect(e.ai).toBe('patrol');
      expect(e.escortOf).toBe(0);
      expect(e.loadoutId).not.toBe('pirate_raider');
    }
    setLevel(s, 4);
    expect(traderEncounter(s, loc.pos, g.state.world.locations, rng, data).ships).toHaveLength(1);
  });

  it('a trip with encounters ON stops at the encounter point; Hunt passes 1 day and uses fuel', () => {
    const g = fresh();
    const s = startSector(g);
    setLevel(s, 0);
    const actor = g.state.player;
    const dest = s.locationIds.find((id) => id !== g.state.world.startLocationId)!;
    let enc = null;
    for (let i = 0; i < 30 && !enc; i++) {
      const copy = fresh();
      setLevel(startSector(copy), 0);
      copy.state.rng.encounter = createRngState(100 + i, 'encounter');
      const out = travelInSector(copy, copy.state.player, { kind: 'location', locationId: dest }, true);
      if (out.result === 'encounter') {
        enc = out.encounter;
        expect(copy.state.player.position.kind).toBe('space');
      }
    }
    expect(enc).not.toBeNull();
    actor.position = { kind: 'space', sectorId: s.id, x: 10, y: 10 };
    const day = g.state.day;
    const fuel = actor.fleet[0]!.fuel;
    const out = hunt(g, actor);
    expect(out.result === 'arrived' || out.result === 'encounter').toBe(true);
    expect(g.state.day).toBeCloseTo(day + 1);
    expect(actor.fleet[0]!.fuel).toBeLessThan(fuel);
    actor.position = { kind: 'docked', locationId: g.state.world.startLocationId };
    expect(hunt(g, actor).result).toBe('refused');
  });
});

describe('flee and tribute (Q-15, Q-17)', () => {
  it('flee succeeds if the flagship moves more than every enemy, else by chance', () => {
    const g = fresh();
    const s = startSector(g);
    const enc = pirateEncounterOf(pirate('lone_raider'), s, { x: 0, y: 0 }, g.state.player, data);
    const rng = new Rng(createRngState(3, 'x'));
    let wins = 0;
    for (let i = 0; i < 1000; i++) if (fleeSucceeds(g.state.player, enc, rng, data)) wins++;
    expect(wins / 1000).toBeCloseTo(data.encounters.fleeChance, 1);
    const slow: Encounter = { ...enc, ships: [{ ...enc.ships[0]!, loadoutId: 'heavy_freighter_trader' }] };
    expect(fleeSucceeds(g.state.player, slow, rng, data)).toBe(true);
  });

  it('tribute takes half (rounded down) of each commodity of the fullest ship', () => {
    const g = fresh();
    addCargo(g.state.player, data, 'water', 9, 10);
    expect(payTribute(g.state.player, data)).toBe(4);
    expect(fleetUnits(g.state.player, 'water')).toBe(5);
  });
});

describe('battle maps and loot (M5-ENC-10, M5-LOOT)', () => {
  it('the nearest location selects the template; else Open Space', () => {
    const g = fresh();
    const s = startSector(g);
    expect(battleMapFor(s, { x: -100, y: -100 }, g.state.world.locations, data).id).toBe('open_space');
    for (const id of s.locationIds) {
      const loc = g.state.world.locations[id] as Location;
      const t = battleMapFor(s, loc.pos, g.state.world.locations, data);
      if (loc.bodyType === 'gas_giant') expect(t.id).toBe('gas_giant_edge');
      if (['desert', 'volcanic', 'ice', 'mining_station'].includes(loc.bodyType)) expect(t.id).toBe('asteroid_field');
    }
  });

  it('templates: asteroid fields have more obstacles than open space; gas giant edge has a debris band', () => {
    const t = (id: string) => data.battleMaps.templates.find((x) => x.id === id)!;
    const share = (cells: string[], ch: string) => cells.join('').split('').filter((c) => c === ch).length / cells.join('').length;
    const rng = new Rng(createRngState(4, 'm'));
    const open = generateCells(data, rng, t('open_space'));
    const field = generateCells(data, rng, t('asteroid_field'));
    expect(share(field, '#')).toBeGreaterThan(share(open, '#') + share(open, ':'));
    const gas = generateCells(data, rng, t('gas_giant_edge'));
    const band = gas[0]!.split('').every((c) => c === ':') || gas[gas.length - 1]!.split('').every((c) => c === ':');
    expect(band).toBe(true);
  });

  it('a destroyed ship drops 30%-60% of its cargo as a pod; a ship collects it by moving onto it', () => {
    const b = createBattle(
      {
        player: [{ ship: createShipFromLoadout(data, 'start_shuttle', 'p', 'P'), ai: 'human' }],
        other: [{ ship: createShipFromLoadout(data, 'light_freighter_trader', 'o', 'O'), ai: 'trader' }],
        aggressor: 'player',
        rng: createRngState(5, 'combat'),
      },
      data,
    );
    b.cells = b.cells.map((r) => '.'.repeat(r.length));
    const t = b.ships[1]!;
    t.ship.cargo = { water: { units: 40, unitCost: 10 } };
    t.ship.hullHp = 0;
    const effects: Effect[] = [];
    destroyIfDead(t, effects, b, data);
    expect(b.pods).toHaveLength(1);
    const units = b.pods[0]!.cargo.water!.units;
    expect(units).toBeGreaterThanOrEqual(12);
    expect(units).toBeLessThanOrEqual(24);
    const me = b.ships[0]!;
    me.pos = { x: b.pods[0]!.pos.x - 3, y: b.pods[0]!.pos.y };
    expect(applyOrder(b, me, { kind: 'move', to: { x: b.pods[0]!.pos.x - 1, y: b.pods[0]!.pos.y } }, data, new Rng(createRngState(1, 'x')), effects)).toBeNull();
    expect(me.ship.cargo.water?.units ?? 0).toBeGreaterThan(0);
  });

  it('surrendered cargo goes into the fleet as far as it fits', () => {
    const g = fresh();
    const got = takeCargo(g.state.player, { iron_ore: { units: 1000, unitCost: 0 } }, data);
    expect(got.iron_ore).toBeGreaterThan(0);
    expect(got.iron_ore).toBeLessThan(1000);
  });

  it('a Pirate Haven buys all cargo at 70% of its sell price (Q-24)', () => {
    const g = fresh();
    const loc = g.state.world.locations.find((l) => l.kind === 'station')!;
    loc.services = ['market'];
    g.state.player.position = { kind: 'docked', locationId: loc.id };
    const id = data.commodities.find((c) => !loc.market[c.id])!.id;
    addCargo(g.state.player, data, id, 2, 1);
    expect(sell(g, g.state.player, loc, id, 1).ok).toBe(false);
    loc.bodyType = data.serviceRules.pirateHaven.bodyType;
    const value = cargoSaleValue(g.state.player, loc, id, data)!;
    expect(value).toBeGreaterThan(0);
    expect(sell(g, g.state.player, loc, id, 2).ok).toBe(true);
  });
});

describe('reinforcements (M5-REIN)', () => {
  function sectorBattle(level: number, aggressor: 'player' | 'other', otherAi: 'raider' | 'trader'): Battle {
    const min = data.security.levels.find((l) => l.level === level)!.min;
    return createBattle(
      {
        player: [{ ship: createShipFromLoadout(data, 'start_shuttle', 'p', 'P'), ai: 'attack' }],
        other: [{ ship: createShipFromLoadout(data, otherAi === 'raider' ? 'pirate_raider' : 'light_freighter_trader', 'o', 'O'), ai: otherAi }],
        aggressor,
        rng: createRngState(6, 'combat'),
        sectorId: 0,
        sector: { securityValue: min + 10, development: 'middle' },
      },
      data,
    );
  }

  it('none before turn 3; at most one group per type', () => {
    const b = sectorBattle(4, 'other', 'raider');
    const rng = new Rng(createRngState(7, 'x'));
    for (let i = 0; i < 50; i++) reinforcementStep(b, data, rng, []);
    expect(b.ships).toHaveLength(2);
    b.turn = 2;
    for (let i = 0; i < 200; i++) reinforcementStep(b, data, rng, []);
    expect(b.reinforced.patrol).toBe(true);
    const patrols = b.ships.filter((s) => s.faction === 'patrol');
    expect(patrols.length).toBeGreaterThan(0);
    expect(patrols.length).toBeLessThanOrEqual(3);
  });

  it('a patrol fights the pirates (player side); against a player who attacks a trader, it joins the trader', () => {
    const vsPirates = sectorBattle(4, 'other', 'raider');
    vsPirates.turn = 2;
    const rng = new Rng(createRngState(8, 'x'));
    while (!vsPirates.reinforced.patrol) reinforcementStep(vsPirates, data, rng, []);
    for (const s of vsPirates.ships.filter((x) => x.faction === 'patrol')) expect(s.side).toBe('player');
    const vsTrader = sectorBattle(4, 'player', 'trader');
    vsTrader.turn = 2;
    while (!vsTrader.reinforced.patrol) reinforcementStep(vsTrader, data, rng, []);
    for (const s of vsTrader.ships.filter((x) => x.faction === 'patrol')) expect(s.side).toBe('other');
  });

  it('pirate reinforcements only in Lawless and Low, only with pirates in the battle', () => {
    const rng = new Rng(createRngState(9, 'x'));
    const safe = sectorBattle(2, 'other', 'raider');
    safe.turn = 2;
    for (let i = 0; i < 300; i++) reinforcementStep(safe, data, rng, []);
    expect(safe.reinforced.pirate).toBe(false);
    const wild = sectorBattle(0, 'other', 'raider');
    wild.turn = 2;
    for (let i = 0; i < 300; i++) reinforcementStep(wild, data, rng, []);
    expect(wild.reinforced.pirate).toBe(true);
    const trader = sectorBattle(0, 'player', 'trader');
    trader.turn = 2;
    for (let i = 0; i < 300; i++) reinforcementStep(trader, data, rng, []);
    expect(trader.reinforced.pirate).toBe(false);
  });

  it('a full AI battle with reinforcements resolves', () => {
    let b = sectorBattle(0, 'other', 'raider');
    while (!b.result) b = resolveTurn(b, null, data).battle;
    expect(['win', 'loss', 'draw', 'fled']).toContain(b.result);
  });
});

describe('security and notoriety (M5-SEC, M5-NOT)', () => {
  it('changes of value and baseline; daily drift of 2% of the gap; trend', () => {
    const g = fresh();
    const s = startSector(g);
    s.securityValue = 50;
    s.securityBaseline = 50;
    changeSecurity(s, 'destroyPirate', data);
    expect(s.securityValue).toBe(53);
    expect(s.securityBaseline).toBe(50.5);
    changeSecurity(s, 'attackNonPirate', data);
    expect(s.securityValue).toBe(49);
    s.securityValue = 40;
    s.securityBaseline = 60;
    s.securityHistory = [];
    securityDay([s], data);
    expect(s.securityValue).toBeCloseTo(40.4);
    for (let i = 0; i < 40; i++) securityDay([s], data);
    expect(s.securityHistory).toHaveLength(data.security.trendDays);
    expect(securityTrend(s)).toBe(1);
  });

  it('a battle: pirate kills raise security and lower notoriety; non-pirate kills raise notoriety', () => {
    const g = fresh();
    const s = startSector(g);
    s.securityValue = 30;
    const actor = g.state.player;
    actor.notoriety = 20;
    const b = createBattle(
      {
        player: [{ ship: createShipFromLoadout(data, 'start_shuttle', 'p', 'P'), ai: 'human' }],
        other: [
          { ship: createShipFromLoadout(data, 'pirate_raider', 'o', 'O'), ai: 'raider' },
          { ship: createShipFromLoadout(data, 'light_freighter_trader', 't', 'T'), ai: 'trader' },
        ],
        aggressor: 'other',
        rng: createRngState(10, 'combat'),
        sectorId: s.id,
      },
      data,
    );
    b.ships[1]!.status = 'destroyed';
    b.ships[2]!.status = 'destroyed';
    battleConsequences(g, actor, b);
    expect(s.securityValue).toBe(33);
    expect(actor.notoriety).toBe(20 - 3 + 10);
  });

  it('levels; daily decay; docking refusal by level; Pirate Havens accept all', () => {
    const g = fresh();
    const actor = g.state.player;
    const s = startSector(g);
    const loc = g.state.world.locations[s.locationIds[0]!]!;
    setLevel(s, 4);
    expect(notorietyLevel(actor, data)).toBe('clean');
    expect(dockingRefusal(actor, loc, s, data)).toBeNull();
    addNotoriety(actor, 30, data);
    expect(notorietyLevel(actor, data)).toBe('suspect');
    expect(dockingRefusal(actor, loc, s, data)).not.toBeNull();
    setLevel(s, 3);
    expect(dockingRefusal(actor, loc, s, data)).toBeNull();
    addNotoriety(actor, 30, data);
    expect(notorietyLevel(actor, data)).toBe('wanted');
    expect(dockingRefusal(actor, loc, s, data)).not.toBeNull();
    expect(planSectorTrip(g, actor, { kind: 'location', locationId: loc.id }).possible).toBe(loc.id === g.state.world.startLocationId);
    const haven = { ...loc, bodyType: data.serviceRules.pirateHaven.bodyType };
    expect(dockingRefusal(actor, haven, s, data)).toBeNull();
    const n = actor.notoriety;
    notorietyDay(actor, data);
    expect(actor.notoriety).toBeCloseTo(n + data.balance.notoriety.perDay);
    addNotoriety(actor, 1000, data);
    expect(actor.notoriety).toBe(data.balance.notoriety.max);
    expect(securityLevel(s.securityValue, data)).toBe(3);
  });
});

describe('the defeat factions of encounters (M5-ENC-13)', () => {
  it('escorts are trader faction (a loss destroys); pursued pirates stay pirates', () => {
    const g = fresh();
    const s = startSector(g);
    setLevel(s, 1);
    const enc = traderEncounter(s, { x: 0, y: 0 }, g.state.world.locations, new Rng(createRngState(11, 'x')), data);
    for (const e of enc.ships) expect(e.faction).toBe('trader');
    const p = pirateEncounterOf(pirate('raider_pair'), s, { x: 0, y: 0 }, g.state.player, data);
    for (const e of p.ships) expect(e.faction).toBe('pirate');
  });
});
