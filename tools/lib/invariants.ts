// State checks for the play-test bots (M8 play test). Each check returns a
// short problem text; an empty list means the state is sound. The checks
// cover values that must stay finite and in range whatever the player does.
import type { Game } from '../../src/core/game';
import type { Ship } from '../../src/core/types';
import { checkLoadout, slotSizesOf } from '../../src/ship/rules';
import { travelStats } from '../../src/ship/stats';

const EPS = 1e-6;
const bad = (x: unknown) => typeof x !== 'number' || !Number.isFinite(x);

function shipProblems(game: Game, ship: Ship, where: string): string[] {
  const { data } = game;
  const out: string[] = [];
  const s = travelStats(ship, data);
  if (bad(ship.fuel) || ship.fuel < -EPS) out.push(`${where}: fuel ${ship.fuel}`);
  else if (ship.fuel > s.fuelCapacity + EPS) out.push(`${where}: fuel ${ship.fuel.toFixed(2)} above capacity ${s.fuelCapacity}`);
  if (bad(ship.hullHp) || ship.hullHp < -EPS || ship.hullHp > s.maxHullHp + EPS) out.push(`${where}: hull ${ship.hullHp}/${s.maxHullHp}`);
  if (bad(ship.armorHp) || ship.armorHp < -EPS || ship.armorHp > s.maxArmorHp + EPS) out.push(`${where}: armor ${ship.armorHp}/${s.maxArmorHp}`);
  if (bad(ship.engineValue) || ship.engineValue < -EPS || ship.engineValue > s.maxEngineValue + EPS) out.push(`${where}: engine ${ship.engineValue}/${s.maxEngineValue}`);
  for (const [id, lot] of Object.entries(ship.cargo)) {
    if (!data.commodityById.has(id)) out.push(`${where}: unknown cargo ${id}`);
    if (bad(lot.units) || lot.units < -EPS) out.push(`${where}: cargo ${id} units ${lot.units}`);
    if (bad(lot.unitCost) || lot.unitCost < -EPS) out.push(`${where}: cargo ${id} unit cost ${lot.unitCost}`);
  }
  if (s.cargoMass > s.cargoCapacity + 1e-3) out.push(`${where}: cargo ${s.cargoMass.toFixed(2)} t above capacity ${s.cargoCapacity} t`);
  for (const kind of ['hardpoint', 'internal'] as const) {
    const list = kind === 'hardpoint' ? ship.hardpoints : ship.internal;
    const n = slotSizesOf(ship, kind, data).length;
    if (list.length > n) out.push(`${where}: ${list.length} ${kind} entries for ${n} slots`);
    list.forEach((m, i) => {
      if (m && !data.moduleById.has(m.moduleId)) out.push(`${where}: unknown module ${m.moduleId} in ${kind} ${i}`);
    });
  }
  return out;
}

export function checkInvariants(game: Game, lastDay: number): string[] {
  const { state, data } = game;
  const out: string[] = [];
  const p = state.player;
  if (bad(state.day) || state.day < lastDay - EPS) out.push(`day ${state.day} after ${lastDay}`);
  if (bad(p.credits)) out.push(`credits ${p.credits}`);
  if (bad(p.notoriety) || p.notoriety < -EPS) out.push(`notoriety ${p.notoriety}`);
  if (p.fleet.length < 1 && state.career.end === null) out.push('empty fleet with the career on');
  if (p.fleet.length > data.balance.fleet.maxFleetSize) out.push(`fleet ${p.fleet.length} above ${data.balance.fleet.maxFleetSize}`);
  if (p.fleet.length > 0 && (p.flagshipIndex < 0 || p.flagshipIndex >= p.fleet.length)) out.push(`flagship index ${p.flagshipIndex} of ${p.fleet.length}`);
  const ids = new Set<string>();
  p.fleet.forEach((s, i) => {
    if (ids.has(s.id)) out.push(`duplicate ship id ${s.id}`);
    ids.add(s.id);
    out.push(...shipProblems(game, s, `ship ${i} ${s.name}`));
  });
  // A docked fleet can be in a broken loadout state only with a ship that was never fitted (a new hull) or after a loss.
  if (p.position.kind !== 'docked' && state.career.end === null) {
    for (const s of p.fleet) {
      const e = checkLoadout(s, data).errors.filter((x) => !x.startsWith('Cargo'));
      if (e.length > 0 && s.fuel > EPS) out.push(`in space with a broken loadout: ${s.name}: ${e[0]}`);
    }
  }
  const pos = p.position;
  if (pos.kind === 'docked' && !state.world.locations[pos.locationId]) out.push(`docked at missing location ${pos.locationId}`);
  if (pos.kind === 'jumpPoint' && !state.world.jumpPoints[pos.jumpPointId]) out.push(`at missing jump point ${pos.jumpPointId}`);
  if (pos.kind === 'space' && (!state.world.sectors[pos.sectorId] || bad(pos.x) || bad(pos.y))) out.push(`in space at a bad place ${JSON.stringify(pos)}`);
  for (const l of state.world.locations) {
    for (const [id, e] of Object.entries(l.market)) {
      if (bad(e.stock) || e.stock < -EPS) out.push(`market ${l.name} ${id} stock ${e.stock}`);
      if (bad(e.target) || e.target < 0) out.push(`market ${l.name} ${id} target ${e.target}`);
    }
  }
  for (const s of state.world.sectors) if (bad(s.securityValue) || s.securityValue < -EPS || s.securityValue > 100 + EPS) out.push(`sector ${s.name} security ${s.securityValue}`);
  const cids = new Set<number>();
  for (const c of [...state.contracts.active, ...state.contracts.boards.flatMap((b) => b.offers)]) {
    if (cids.has(c.id)) out.push(`duplicate contract id ${c.id} (${c.kind})`);
    cids.add(c.id);
  }
  if (bad(state.contracts.killBounty) || state.contracts.killBounty < -EPS) out.push(`kill bounty ${state.contracts.killBounty}`);
  const sc = state.career.secondChance;
  if (sc.offer && !sc.used) out.push('second-chance offer with used = false');
  if (sc.traded && !state.contracts.active.some((c) => c.kind === 'raid')) out.push('traded ship with no pirate job');
  return out;
}
