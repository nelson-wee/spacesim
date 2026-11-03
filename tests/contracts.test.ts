import { describe, expect, it } from 'vitest';
import { bountyBoard, lowestLevelOnPath, merchantsBoard, needsAt, securityProblem, sizeFor, supplyFee, surplusesAt } from '../src/career/contractGen';
import { chainAlertsAt } from '../src/actor/knowledge';
import { kRef } from '../src/econ/capital';
import { econContext } from '../src/econ/context';
import { recipeOf } from '../src/econ/recipes';
import { sellPrice, basePrice } from '../src/econ/prices';
import { type Game, passTime, wrapGame } from '../src/core/game';
import { createGame } from '../src/core/newGame';
import { createRngState, Rng } from '../src/core/rng';
import type { Location } from '../src/core/types';
import { gameData } from '../src/data';
import { securityLevel } from '../src/world/security';
import { acceptContract, acceptProblem, battleContracts, collectBounty, contractDay, deliverFreight, deliverSupply, namedEncounter, pickupFreight, standing } from '../src/career/contracts';
import { addCargo, fleetUnits } from '../src/actor/cargo';
import { createBattle } from '../src/combat/battle';
import { createShipFromLoadout } from '../src/ship/loadout';
import { shipTu } from '../src/ship/threat';
import type { Board, FreightContract, NamedBounty, SupplyContract, SweepContract } from '../src/core/types';
import { economyDay } from '../src/econ/economy';

const data = gameData();
const c = data.contracts;
const template = createGame(11, data).state;
const fresh = (): Game => wrapGame(structuredClone(template), data);
const rngOf = (n = 1) => new Rng(createRngState(n, 'contracts'));

describe('contract candidates (Section 14.3)', () => {
  it('deficit: a needed commodity below 60% of target; severity = 1 - stock / target', () => {
    const g = fresh();
    const ctx = econContext(g.state.world, data);
    const loc = g.state.world.locations.find((l) => Object.keys(l.market).some((k) => (ctx.dailyNeed.get(`${l.id}:${k}`) ?? 0) > 0)) as Location;
    const commodity = Object.keys(loc.market).find((k) => (ctx.dailyNeed.get(`${loc.id}:${k}`) ?? 0) > 0) as string;
    const entry = loc.market[commodity]!;
    entry.stock = 0.25 * entry.target;
    const need = needsAt(g, loc).find((n) => n.commodity === commodity)!;
    expect(need.severity).toBeGreaterThanOrEqual(0.75 - 1e-9);
    entry.stock = 0.7 * entry.target;
    if (!loc.production || loc.production.inputFactor >= c.starvationInputFactor) expect(needsAt(g, loc).some((n) => n.commodity === commodity)).toBe(false);
  });

  it('capital need: K < 75% of K_ref; severity = 1 - K / K_ref', () => {
    const g = fresh();
    const loc = g.state.world.locations.find((l) => l.producer && l.production && l.market[recipeOf(data, l.producer).softInput]) as Location;
    const recipe = recipeOf(data, loc.producer!);
    loc.installedMachinery = 0.5 * kRef(loc, recipe);
    loc.market[recipe.softInput]!.stock = loc.market[recipe.softInput]!.target;
    const need = needsAt(g, loc).find((n) => n.commodity === recipe.softInput)!;
    expect(need.severity).toBeCloseTo(0.5);
    expect(need.reason).toMatch(/machinery 50%/);
  });

  it('input starvation adds 1 - inputFactor to the deficit severity of a hard input (capped at 1)', () => {
    const g = fresh();
    const loc = g.state.world.locations.find((l) => l.producer && l.production && recipeOf(data, l.producer).inputs.length > 0) as Location;
    const input = recipeOf(data, loc.producer!).inputs[0]!.commodity;
    const entry = loc.market[input]!;
    entry.stock = 0.8 * entry.target;
    loc.production!.inputFactor = 0.4;
    const need = needsAt(g, loc).find((n) => n.commodity === input)!;
    expect(need.severity).toBeCloseTo(0.6);
    entry.stock = 0.3 * entry.target;
    expect(needsAt(g, loc).find((n) => n.commodity === input)!.severity).toBe(1);
  });

  it('surplus: a made commodity above 140% of target; severity = stock / target - 1', () => {
    const g = fresh();
    const loc = g.state.world.locations.find((l) => l.producer) as Location;
    const out = recipeOf(data, loc.producer!).outputs[0]!.commodity;
    loc.market[out]!.stock = 2 * loc.market[out]!.target;
    expect(surplusesAt(g, loc).find((s) => s.commodity === out)!.severity).toBeCloseTo(1);
  });

  it('security problem: value <= baseline - 10 or level <= 1; severity (baseline - value) / 50, at least 0.2; score x 1000', () => {
    const g = fresh();
    const s = g.state.world.sectors[0]!;
    s.securityBaseline = 70;
    s.securityValue = 45;
    const p = securityProblem(s, data)!;
    expect(p.severity).toBeCloseTo(0.5);
    expect(p.score).toBeCloseTo(500);
    s.securityValue = 69;
    expect(securityLevel(69, data) <= c.securityMaxLevel ? securityProblem(s, data) : null).toBeNull();
    s.securityValue = 5;
    s.securityBaseline = 5;
    expect(securityProblem(s, data)!.severity).toBe(c.securityMinSeverity);
  });

  it('size class: the largest class at or below the tonnes, at least Small', () => {
    expect(sizeFor(5, data).id).toBe('small');
    expect(sizeFor(29, data).id).toBe('small');
    expect(sizeFor(30, data).id).toBe('medium');
    expect(sizeFor(500, data).id).toBe('large');
  });
});

describe('boards (Section 14.3, 14.4)', () => {
  it('every Supply and Freight offer points to a real deficit at posting (exit check 2), on many boards and days', () => {
    const g = fresh();
    let checked = 0;
    for (let week = 0; week < 6; week++) {
      if (week > 0) passTime(g, 7);
      const ctx = econContext(g.state.world, data);
      for (const loc of g.state.world.locations.filter((l) => l.services.includes('merchants_guild'))) {
        const board = merchantsBoard(g, loc, rngOf(week * 100 + loc.id));
        expect(board.offers.length).toBeLessThanOrEqual(c.offersMax);
        const keys = new Set<string>();
        for (const o of board.offers) {
          if (o.kind !== 'supply' && o.kind !== 'freight') continue;
          const dest = g.state.world.locations[o.kind === 'supply' ? o.destId : o.toId]!;
          const need = needsAt(g, dest, ctx).find((n) => n.commodity === o.commodity);
          expect(need, `${o.reason}`).toBeDefined();
          const key = `${dest.id}:${o.commodity}`;
          expect(keys.has(key)).toBe(false);
          keys.add(key);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('supply offer: goods at the sell price, plus a flat fee (tonnes, jumps, risk, urgency); deadline = posting + 8 + 4 x jumps; units from the size class', () => {
    const g = fresh();
    const ctx = econContext(g.state.world, data);
    const loc = g.state.world.locations.find((l) => l.services.includes('merchants_guild')) as Location;
    const offer = merchantsBoard(g, loc, rngOf(3)).offers.find((o) => o.kind === 'supply');
    if (!offer || offer.kind !== 'supply') return;
    const dest = g.state.world.locations[offer.destId]!;
    const sell = sellPrice(dest.market[offer.commodity]!, basePrice(data, offer.commodity), data);
    expect(offer.price).toBeCloseTo(sell);
    const tonnes = c.sizes.find((x) => x.id === offer.sizeId)!.tonnes;
    expect(offer.fee).toBeCloseTo(tonnes * (c.supply.feePerTonne + c.supply.feePerTonneJump * offer.sourceJumps) * offer.riskMult * (1 + c.supply.urgencyPerSeverity * offer.severity));
    expect(offer.deadline).toBe(g.state.day + c.supply.deadlineBase + c.supply.deadlinePerJump * (ctx.sectorJumps[loc.sectorId]![dest.sectorId] as number));
    const size = c.sizes.find((s) => s.id === offer.sizeId)!;
    expect(offer.units).toBe(Math.round(size.tonnes / data.commodityById.get(offer.commodity)!.massPerUnit));
  });

  it('freight offer: deposit 25% of value; fee = tonnes x jumps x 4 x riskMult + 5% of value; riskMult from the lowest level on the path', () => {
    const g = fresh();
    const ctx = econContext(g.state.world, data);
    let found = false;
    for (const loc of g.state.world.locations.filter((l) => l.services.includes('merchants_guild'))) {
      for (let s = 0; s < 6 && !found; s++) {
        const o = merchantsBoard(g, loc, rngOf(s)).offers.find((x) => x.kind === 'freight');
        if (!o || o.kind !== 'freight') continue;
        found = true;
        const from = g.state.world.locations[o.fromId]!;
        const to = g.state.world.locations[o.toId]!;
        const risk = 1 + c.freight.riskPerLevel * (4 - lowestLevelOnPath(ctx, from.sectorId, to.sectorId, data));
        const tonnes = c.sizes.find((x) => x.id === o.sizeId)!.tonnes;
        expect(o.riskMult).toBeCloseTo(risk);
        expect(o.deposit).toBeCloseTo(c.freight.depositShare * o.cargoValue);
        expect(o.fee).toBeCloseTo(tonnes * o.jumps * c.freight.feePerTonneJump * risk + c.freight.valueShare * o.cargoValue);
        expect(o.jumps).toBeGreaterThanOrEqual(c.freight.destMinJumps);
        expect(o.jumps).toBeLessThanOrEqual(c.freight.destMaxJumps);
      }
    }
    expect(found).toBe(true);
  });

  it('bounty board: 2-4 named bounties in sectors with level <= 2; reward = TU x 150 x (1 + 0.25 x (4 - level)); expiry 28 days', () => {
    const g = fresh();
    const loc = g.state.world.locations.find((l) => l.services.includes('bounty_guild')) as Location;
    const board = bountyBoard(g, loc, rngOf(5));
    const named = board.offers.filter((o) => o.kind === 'named');
    expect(named.length).toBeGreaterThanOrEqual(c.named.perBoardMin);
    expect(named.length).toBeLessThanOrEqual(c.named.perBoardMax);
    for (const o of named) {
      if (o.kind !== 'named') continue;
      const level = securityLevel(g.state.world.sectors[o.sectorId]!.securityValue, data);
      expect(level).toBeLessThanOrEqual(c.named.maxLevel);
      expect(o.reward).toBeCloseTo(o.tu * c.named.rewardPerTu * (1 + c.named.levelBonus * (4 - level)));
      expect(o.expiry).toBe(g.state.day + c.named.expiryDays);
      expect(o.name).toMatch(/^\S+ .+, aboard the .+$/);
      expect(o.ships.every((s) => s.tier === (o.tu >= c.named.tier3Tu ? 3 : c.named.tier))).toBe(true);
    }
  });

  it('boards are made again every 7 days', () => {
    const g = createGame(11, data);
    const first = structuredClone(g.state.contracts.boards);
    passTime(g, 6);
    expect(g.state.contracts.boards).toEqual(first);
    passTime(g, 1);
    expect(g.state.contracts.boards[0]!.day).toBe(7);
  });
});


/** A game docked at `at` with one board that holds `offer`. */
function withOffer<T extends import('../src/core/types').Contract>(offer: T, at: number): Game {
  const g = fresh();
  const board: Board = { locationId: at, guild: offer.kind === 'supply' || offer.kind === 'freight' ? 'merchants' : 'bounty', day: g.state.day, offers: [offer] };
  g.state.contracts.boards = [board];
  g.state.player.position = { kind: 'docked', locationId: at };
  g.state.player.credits = 100000;
  g.state.player.fleet = [createShipFromLoadout(data, 'light_freighter_starter', 's1', 'S1')];
  return g;
}

function supply(destId: number, commodity = 'water', units = 10): SupplyContract {
  return { kind: 'supply', id: 900, boardId: destId, postedDay: 0, reason: 'test', destId, commodity, sizeId: 'small', units, delivered: 0, price: 50, fee: 0, sourceJumps: 1, riskMult: 1, severity: 0.5, alert: false, deadline: 20 };
}

describe('contract play (Sections 14.4-14.7)', () => {
  it('accept: at the board; not in debt; limits; Freight needs standing', () => {
    const at = template.world.locations[0]!.id;
    const g = withOffer(supply(at), at);
    g.state.player.credits = -1;
    expect(acceptContract(g, at, 900).ok).toBe(false);
    g.state.player.credits = 1000;
    g.state.player.position = { kind: 'docked', locationId: template.world.locations[1]!.id };
    expect(acceptContract(g, at, 900).ok).toBe(false);
    g.state.player.position = { kind: 'docked', locationId: at };
    g.state.contracts.active = [1, 2, 3, 4].map((i) => ({ ...supply(at), id: i }));
    expect(acceptProblem(g, supply(at))).toMatch(/4 Merchants/);
    g.state.contracts.active = [];
    expect(acceptContract(g, at, 900).ok).toBe(true);
    expect(g.state.contracts.active.length).toBe(1);
    expect(g.state.contracts.boards[0]!.offers.length).toBe(0);
    const fr: FreightContract = { kind: 'freight', id: 901, boardId: at, postedDay: 0, reason: 't', fromId: at, toId: at, commodity: 'water', sizeId: 'medium', units: 30, jumps: 1, riskMult: 1, cargoValue: 300, deposit: 75, fee: 200, pickedDay: null, deadline: 30 };
    expect(acceptProblem(g, fr)).toMatch(/standing 3/);
    g.state.contracts.completed = 3;
    expect(standing(g)).toBe(3);
    expect(acceptProblem(g, fr)).toBeNull();
    g.state.contracts.failed = 1;
    expect(standing(g)).toBe(1);
  });

  it('supply: partial deliveries are paid at once and go into the market stock; done adds standing; a late contract fails', () => {
    const dest = template.world.locations.find((l) => l.market.water)!;
    const g = withOffer(supply(dest.id), dest.id);
    acceptContract(g, dest.id, 900);
    const p = g.state.player;
    const stock = g.state.world.locations[dest.id]!.market.water!.stock;
    addCargo(p, data, 'water', 4, 10);
    const c0 = p.credits;
    expect(deliverSupply(g, 900).ok).toBe(true);
    expect(p.credits).toBeCloseTo(c0 + 4 * 50);
    expect(g.state.world.locations[dest.id]!.market.water!.stock).toBeCloseTo(stock + 4);
    addCargo(p, data, 'water', 20, 10);
    deliverSupply(g, 900);
    expect(fleetUnits(p, 'water')).toBeCloseTo(14);
    expect(g.state.contracts.active.length).toBe(0);
    expect(g.state.contracts.completed).toBe(1);
    const g2 = withOffer(supply(dest.id), dest.id);
    acceptContract(g2, dest.id, 900);
    g2.state.day = 21;
    contractDay(g2);
    expect(g2.state.contracts.failed).toBe(1);
    expect(g2.state.contracts.active.length).toBe(0);
  });

  it('freight: pickup takes A stock and the deposit; delivery pays fee and deposit into B; lost cargo fails the contract', () => {
    const a = template.world.locations.find((l) => (l.market.water?.stock ?? 0) > 100)!;
    const b = template.world.locations.find((l) => l.id !== a.id && l.market.water)!;
    const offer: FreightContract = { kind: 'freight', id: 902, boardId: a.id, postedDay: 0, reason: 't', fromId: a.id, toId: b.id, commodity: 'water', sizeId: 'small', units: 10, jumps: 2, riskMult: 1.3, cargoValue: 100, deposit: 25, fee: 150, pickedDay: null, deadline: 30 };
    const g = withOffer(offer, a.id);
    acceptContract(g, a.id, 902);
    const p = g.state.player;
    const aStock = g.state.world.locations[a.id]!.market.water!.stock;
    const c0 = p.credits;
    expect(pickupFreight(g, 902).ok).toBe(true);
    expect(g.state.world.locations[a.id]!.market.water!.stock).toBeCloseTo(aStock - 10);
    expect(p.credits).toBeCloseTo(c0 - 25);
    const c = g.state.contracts.active[0] as FreightContract;
    expect(c.deadline).toBe(g.state.day + data.contracts.freight.deadlineBase + data.contracts.freight.deadlinePerJump * 2);
    p.position = { kind: 'docked', locationId: b.id };
    const bStock = g.state.world.locations[b.id]!.market.water!.stock;
    expect(deliverFreight(g, 902).ok).toBe(true);
    expect(p.credits).toBeCloseTo(c0 + 150);
    expect(g.state.world.locations[b.id]!.market.water!.stock).toBeCloseTo(bStock + 10);
    // Lost cargo.
    const g2 = withOffer({ ...offer }, a.id);
    acceptContract(g2, a.id, 902);
    pickupFreight(g2, 902);
    for (const s of g2.state.player.fleet) s.cargo = {};
    contractDay(g2);
    expect(g2.state.contracts.failed).toBe(1);
  });

  function pirateBattle(g: Game, sectorId: number, beaten: number, namedId?: number) {
    const b = createBattle(
      {
        player: [{ ship: g.state.player.fleet[0]!, ai: 'human' }],
        other: Array.from({ length: beaten }, (_, i) => ({ ship: createShipFromLoadout(data, 'pirate_raider', `r${i}`, `R${i}`), ai: 'raider' as const })),
        aggressor: 'other',
        rng: createRngState(1, 'combat'),
        sectorId,
        namedId,
      },
      data,
    );
    for (const s of b.ships) if (s.side === 'other') s.status = 'destroyed';
    b.result = 'win';
    return b;
  }

  it('sweep: kills in its sector count; done pays the reward and raises the baseline by 2; at most 1 active', () => {
    const at = template.world.locations[0]!.id;
    const sectorId = template.world.locations[0]!.sectorId;
    const sw: SweepContract = { kind: 'sweep', id: 903, boardId: at, postedDay: 0, reason: 't', sectorId, ships: 3, kills: 0, reward: 5000, deadline: null };
    const g = withOffer(sw, at);
    acceptContract(g, at, 903);
    expect((g.state.contracts.active[0] as SweepContract).deadline).toBe(g.state.day + data.contracts.sweep.deadlineDays);
    expect(acceptProblem(g, { ...sw, id: 999 })).toMatch(/Sweep/);
    const base = g.state.world.sectors[sectorId]!.securityBaseline;
    const c0 = g.state.player.credits;
    battleContracts(g, pirateBattle(g, sectorId, 2));
    expect((g.state.contracts.active[0] as SweepContract).kills).toBe(2);
    battleContracts(g, pirateBattle(g, sectorId, 1));
    expect(g.state.contracts.active.length).toBe(0);
    expect(g.state.player.credits).toBeCloseTo(c0 + 5000);
    expect(g.state.world.sectors[sectorId]!.securityBaseline).toBeCloseTo(base + 2);
  });

  it('kill bounty: shipTU x 25 x (1 + 0.25 x (4 - level)), collected at a Bounty Guild; not for Wanted players', () => {
    const at = template.world.locations[0]!;
    const g = withOffer(supply(at.id), at.id);
    const sector = g.state.world.sectors[at.sectorId]!;
    const level = securityLevel(sector.securityValue, data);
    const b = pirateBattle(g, at.sectorId, 2);
    battleContracts(g, b);
    const tu = b.ships.filter((s) => s.side === 'other').reduce((sum, s) => sum + shipTu(s.ship, data), 0);
    expect(g.state.contracts.killBounty).toBeCloseTo(tu * 25 * (1 + 0.25 * (4 - level)));
    g.state.world.locations[at.id]!.services.push('bounty_guild');
    const c0 = g.state.player.credits;
    expect(collectBounty(g, g.state.world.locations[at.id]!).ok).toBe(true);
    expect(g.state.player.credits).toBeCloseTo(c0 + tu * 25 * (1 + 0.25 * (4 - level)));
    g.state.player.notoriety = data.balance.notoriety.wanted;
    battleContracts(g, pirateBattle(g, at.sectorId, 1));
    expect(g.state.contracts.killBounty).toBe(0);
  });

  it('named bounty: a guaranteed encounter in its sector; beaten: reward, security +5, baseline +1, notoriety -10; expiry', () => {
    const at = template.world.locations[0]!;
    const sector = template.world.sectors[at.sectorId]!;
    const nb: NamedBounty = { kind: 'named', id: 904, boardId: at.id, postedDay: 0, reason: 't', sectorId: sector.id, name: 'Oriel the Saltless, aboard the Low Tide', templateId: 'raider_pair', ships: [{ loadoutId: 'pirate_raider', tier: 2 }, { loadoutId: 'pirate_raider', tier: 2 }], tu: 30, reward: 7000, expiry: 28 };
    const g = withOffer(nb, at.id);
    acceptContract(g, at.id, 904);
    const s = g.state.world.sectors[sector.id]!;
    const enc = namedEncounter(g, s, { x: 1, y: 1 })!;
    expect(enc.namedId).toBe(904);
    expect(enc.ships.every((x) => x.tier === 2)).toBe(true);
    expect(namedEncounter(g, g.state.world.sectors.find((x) => x.id !== sector.id)!, { x: 1, y: 1 })).toBeNull();
    const v0 = s.securityValue;
    const b0 = s.securityBaseline;
    g.state.player.notoriety = 20;
    const c0 = g.state.player.credits;
    battleContracts(g, pirateBattle(g, sector.id, 2, 904));
    expect(g.state.player.credits).toBeGreaterThanOrEqual(c0 + 7000);
    expect(s.securityBaseline).toBeCloseTo(Math.min(100, b0 + 1));
    expect(s.securityValue).toBeCloseTo(Math.min(100, v0 + 5));
    expect(g.state.player.notoriety).toBeCloseTo(10);
    expect(g.state.career.stats.namedBounties).toBe(1);
    const g2 = withOffer({ ...nb }, at.id);
    acceptContract(g2, at.id, 904);
    g2.state.day = 29;
    contractDay(g2);
    expect(g2.state.contracts.active.length).toBe(0);
  });

  it('exit check 4: a completed Machinery Supply contract to a producer with low K increases its output', () => {
    const g = fresh();
    const loc = g.state.world.locations.find((l) => l.producer && l.market[recipeOf(data, l.producer).softInput] && kRef(l, recipeOf(data, l.producer)) > 0) as Location;
    const recipe = recipeOf(data, loc.producer!);
    loc.installedMachinery = 0.3 * kRef(loc, recipe);
    loc.market[recipe.softInput]!.stock = 0;
    const control = structuredClone(g.state);
    const units = 0.6 * kRef(loc, recipe);
    const c: SupplyContract = { ...supply(loc.id, recipe.softInput, Math.ceil(units)), id: 905 };
    g.state.contracts.active = [c];
    g.state.player.position = { kind: 'docked', locationId: loc.id };
    addCargo(g.state.player, data, recipe.softInput, Math.ceil(units), 0);
    g.state.player.fleet[0]!.cargo[recipe.softInput] = { units: Math.ceil(units), unitCost: 0 };
    expect(deliverSupply(g, 905).ok).toBe(true);
    const run = (state: typeof control) => {
      const game = wrapGame(state, data);
      const ctx = econContext(state.world, data);
      let out = 0;
      for (let d = 0; d < 30; d++) {
        economyDay(ctx, state.world.economy, new Rng(createRngState(d, 'economy')));
        out += state.world.locations[loc.id]!.production!.outputRatio;
      }
      void game;
      return out;
    };
    expect(run(g.state)).toBeGreaterThan(run(control));
  });
});

describe('Supply contracts v2 (owner, 2026-11-03)', () => {
  it('a chain alert is a need, and boards post it first', () => {
    const g = fresh();
    const board = g.state.world.locations.find((l) => l.services.includes('merchants_guild')) as Location;
    const ctx = econContext(g.state.world, data);
    const loc = g.state.world.locations.find((l) => l.sectorId === board.sectorId && (ctx.uses[l.id] ?? []).length > 0) as Location;
    const use = ctx.uses[loc.id]![0]!;
    loc.market[use.commodity]!.stock = 0;
    const alerts = chainAlertsAt(g.state.world, data, loc);
    expect(alerts.some((a) => a.commodity === use.commodity)).toBe(true);
    expect(needsAt(g, loc).find((n) => n.commodity === use.commodity)?.alert).toBe(true);
    for (let s = 0; s < 5; s++) {
      const offers = merchantsBoard(g, board, rngOf(s)).offers;
      expect(offers.some((o) => o.kind === 'supply' && o.alert)).toBe(true);
    }
  });

  it('the fee does not follow the value of the goods; low security raises it (risk pay); urgency raises it', () => {
    const g = fresh();
    const dest = g.state.world.locations.find((l) => l.market.water && l.market.electronics) as Location;
    const a = supplyFee(g, dest, 'water', 30, 0.5);
    const b = supplyFee(g, dest, 'electronics', 30, 0.5);
    expect(a.fee / (a.riskMult * (c.supply.feePerTonne + c.supply.feePerTonneJump * a.sourceJumps))).toBeCloseTo(b.fee / (b.riskMult * (c.supply.feePerTonne + c.supply.feePerTonneJump * b.sourceJumps)));
    expect(supplyFee(g, dest, 'water', 30, 1).fee).toBeGreaterThan(a.fee);
    for (const s of g.state.world.sectors) s.securityValue = 0;
    const risky = supplyFee(g, dest, 'water', 30, 0.5);
    expect(risky.riskMult).toBeCloseTo(1 + 4 * c.supply.riskPerLevel);
    expect(risky.fee).toBeGreaterThan(a.fee);
  });

  it('delivery pays the goods and the share of the fee', () => {
    const dest = template.world.locations.find((l) => l.market.water)!;
    const g = withOffer({ ...supply(dest.id), fee: 1000 }, dest.id);
    acceptContract(g, dest.id, 900);
    addCargo(g.state.player, data, 'water', 5, 1);
    const c0 = g.state.player.credits;
    deliverSupply(g, 900);
    expect(g.state.player.credits).toBeCloseTo(c0 + 5 * 50 + 1000 * 0.5);
  });
});

describe('Supply completion with perishable goods', () => {
  it('a Supply contract is done at completeShare of its units (Food spoils on the way)', () => {
    const dest = template.world.locations.find((l) => l.market.food)!;
    const g = withOffer({ ...supply(dest.id, 'food', 20) }, dest.id);
    acceptContract(g, dest.id, 900);
    addCargo(g.state.player, data, 'food', 19.7, 1);
    deliverSupply(g, 900);
    expect(g.state.contracts.active.length).toBe(0);
    expect(g.state.contracts.completed).toBe(1);
    const g2 = withOffer({ ...supply(dest.id, 'food', 20) }, dest.id);
    acceptContract(g2, dest.id, 900);
    addCargo(g2.state.player, data, 'food', 19, 1);
    deliverSupply(g2, 900);
    expect(g2.state.contracts.active.length).toBe(1);
  });
});
