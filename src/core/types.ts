// The game state. It is one plain object that JSON can save and load (G-10).
// Derived ship stats are not stored here (G-12).
import type { Development, SlotSize, Tier } from '../data';
import type { Knowledge } from '../actor/knowledge';
import type { RngStreams } from './rng';

export const SAVE_VERSION = 6;

export interface Vec {
  x: number;
  y: number;
}

export interface Sector {
  id: number;
  name: string;
  /** Unique 3-letter code for technical names (src/world/codes.ts). */
  code: string;
  /** Cell on the region map. */
  pos: Vec;
  star: string;
  development: Development;
  jumpsFromCore: number;
  securityBaseline: number;
  securityValue: number;
  /** Security value at the end of each of the last `trendDays` days, oldest first (M5-SEC-03). */
  securityHistory: number[];
  locationIds: number[];
  jumpPointIds: number[];
}

export interface Lane {
  id: number;
  a: number;
  b: number;
  /** Distance on the region map (aspect corrected). */
  length: number;
}

export interface JumpPoint {
  id: number;
  sectorId: number;
  laneId: number;
  toSectorId: number;
  /** Cell on the sector map. */
  pos: Vec;
}

export interface MarketEntry {
  stock: number;
  target: number;
  /** Mid price of the last days, oldest first (Section 9.12 trend arrows). */
  history: number[];
}

/** The last production day of a producer (Section 9.3). */
export interface ProductionState {
  /** Output batches / nominal batches (batchesPerSize x size). */
  outputRatio: number;
  inputFactor: number;
  capitalFactor: number;
}

/** Region supply and demand of one commodity, for the off-map balance (Section 9.8, Q-06). */
export interface RegionCommodityStats {
  /** Daily supply (production and off-map additions) of the last days. */
  supply: number[];
  /** Daily wanted use (population, inputs, machinery install, off-map removals) of the last days. */
  demand: number[];
  /** Days in a row with the ratio outside the start limits. */
  outOfRangeDays: number;
  balancing: 'add' | 'remove' | null;
}

/** Goods that background carriers move; they arrive at `to` on `arriveDay` (DECISIONS.md, M2). */
export interface Shipment {
  to: number;
  commodity: string;
  qty: number;
  arriveDay: number;
}

/** A market event (Section 9.11): active from startDay until endDay (economy days). */
export interface MarketEvent {
  id: number;
  kind: 'shortage' | 'boom' | 'strike' | 'pirateSurge';
  startDay: number;
  endDay: number;
  locationId?: number;
  commodity?: string;
  sectorId?: number;
}

export interface EconomyState {
  days: number;
  events: MarketEvent[];
  nextEventId: number;
  /** The newest event of the last economy day (the game tick logs it), or null. */
  newEvent: MarketEvent | null;
  region: Record<string, RegionCommodityStats>;
  /** Carrier goods in transit. */
  shipments: Shipment[];
}

export interface Location {
  id: number;
  sectorId: number;
  name: string;
  kind: 'planet' | 'station';
  /** Planet type id or station type id (data/bodyTypes.json). */
  bodyType: string;
  /** Cell on the sector map. */
  pos: Vec;
  ring: number;
  size: number;
  techLevel: number;
  gravity: number;
  producer: string | null;
  /** Last production day, for producers. */
  production: ProductionState | null;
  population: number;
  installedMachinery: number;
  /** Production capacity: multiplies the batches; grows and shrinks with profit (DECISIONS.md, M2). Starts at 1. */
  capacity: number;
  market: Record<string, MarketEntry>;
  services: string[];
}

export interface World {
  sectors: Sector[];
  lanes: Lane[];
  jumpPoints: JumpPoint[];
  locations: Location[];
  coreSectorId: number;
  startLocationId: number;
  economy: EconomyState;
  generator: GeneratorLog;
}

export interface GeneratorLog {
  seedUsed: number;
  tries: number;
  repairs: number;
  topologyResamples: number;
  /** Rule results of the last validation (rule id -> pass). */
  rules: Record<string, boolean>;
}

export interface InstalledModule {
  moduleId: string;
  size: SlotSize;
  tier: Tier;
  on: boolean;
  /** Guided weapons (M5-GUIDE-05): rounds left; missing = full. */
  ammo?: number;
}

export interface CargoLot {
  units: number;
  /** Average purchase price per unit. */
  unitCost: number;
}

export interface Ship {
  id: string;
  name: string;
  hullId: string;
  /** Aligned with the hull hardpoint slots (S, then M, then L). */
  hardpoints: (InstalledModule | null)[];
  /** Aligned with the hull internal slots (S, then M, then L). */
  internal: (InstalledModule | null)[];
  cargo: Record<string, CargoLot>;
  fuel: number;
  hullHp: number;
  armorHp: number;
  engineValue: number;
}

export type Position =
  | { kind: 'docked'; locationId: number }
  | { kind: 'jumpPoint'; jumpPointId: number }
  | { kind: 'space'; sectorId: number; x: number; y: number };

/**
 * Clone Insurance (owner, 2026-10-28). If the last ship is destroyed, the
 * actor wakes at `locationId` with a new copy of `ship`. Credits do not change.
 */
export interface InsurancePolicy {
  locationId: number;
  day: number;
  /** The insured hull and loadout (no cargo). */
  ship: Ship;
  premium: number;
}

export interface Actor {
  id: string;
  name: string;
  fleet: Ship[];
  flagshipIndex: number;
  credits: number;
  notoriety: number;
  position: Position;
  /** Known prices and map knowledge (Section 9.12). */
  knowledge: Knowledge;
  insurance: InsurancePolicy | null;
  /** Upkeep is counted up to this day (Section 11.9). */
  upkeepDay: number;
  /** Upkeep counted but not paid yet: it is paid at the next dock. */
  upkeepOwed: number;
  /** The destination of a trip that had its encounter roll (Section 10.4: one roll per trip); null after arrival. */
  tripRolled?: string | null;
}

export type LogKind = 'info' | 'good' | 'warning' | 'danger';

export interface LogEntry {
  day: number;
  text: string;
  kind: LogKind;
}

/** Contracts (Section 14). A board offer and an accepted contract use the same object. */
interface ContractBase {
  id: number;
  /** The location of the board that posted it. */
  boardId: number;
  postedDay: number;
  /** Why the world needs it, for example "Vashti Ice Mine: output 65%, needs Machinery" (Section 14.1). */
  reason: string;
}

/**
 * A Supply contract (owner, 2026-11-03): open quantity, paid per tonne
 * delivered, up to what the destination still needs. It lasts until the need
 * ends (the deficit or the chain alert goes away), at most `supply.maxDays`
 * days after acceptance (owner, Q-53 (c)).
 */
export interface SupplyContract extends ContractBase {
  kind: 'supply';
  destId: number;
  commodity: string;
  /** Units delivered so far. */
  delivered: number;
  /** Goods price per unit: the destination sell price at posting, fixed. */
  price: number;
  /** The flat fee per tonne delivered (by jumps, risk, urgency, and chain alert). */
  feePerTonne: number;
  /** Jumps from the nearest maker of the commodity to the destination, and the risk multiplier on that path. */
  sourceJumps: number;
  riskMult: number;
  severity: number;
  /** True if a chain alert asked for it. */
  alert: boolean;
  /** The day of acceptance (null while it is an offer). */
  acceptedDay: number | null;
}

export interface FreightContract extends ContractBase {
  kind: 'freight';
  fromId: number;
  toId: number;
  commodity: string;
  sizeId: string;
  units: number;
  jumps: number;
  riskMult: number;
  cargoValue: number;
  deposit: number;
  fee: number;
  /** Null until the player picks the cargo up at `fromId`. */
  pickedDay: number | null;
  /** The pickup deadline before pickup; the delivery deadline after it. */
  deadline: number;
}

export interface SweepContract extends ContractBase {
  kind: 'sweep';
  sectorId: number;
  ships: number;
  kills: number;
  reward: number;
  /** Set at acceptance (acceptance + deadlineDays); null on the board. */
  deadline: number | null;
}

export interface NamedShip {
  loadoutId: string;
  tier: Tier;
}

export interface NamedBounty extends ContractBase {
  kind: 'named';
  sectorId: number;
  /** "Oriel the Saltless, aboard the Low Tide". */
  name: string;
  templateId: string;
  ships: NamedShip[];
  tu: number;
  reward: number;
  expiry: number;
}

export type Contract = SupplyContract | FreightContract | SweepContract | NamedBounty;

export interface Board {
  locationId: number;
  guild: 'merchants' | 'bounty';
  day: number;
  offers: Contract[];
}

export interface ContractState {
  boards: Board[];
  active: Contract[];
  /** Merchants' Guild standing counts (Section 14.4: standing = completed - 2 x failed, at least 0). */
  completed: number;
  failed: number;
  /** Kill bounty credits to collect at a Bounty Guild (Section 14.6). */
  killBounty: number;
  nextId: number;
}

/** Career statistics, recorded from the career start (Section 16, M7-CAR-05). */
export interface CareerStats {
  jumps: number;
  cargoTradedTonnes: number;
  battlesWon: number;
  shipsCaptured: number;
  namedBounties: number;
  sweeps: number;
  contractsCompleted: number;
  contractsFailed: number;
  /** Security value and level of each sector at the career start. */
  startSecurity: number[];
  startLevels: number[];
}

export interface CareerEnd {
  reason: 'day' | 'retire' | 'lost';
  day: number;
  score: number;
  title: string;
  secondTitles: string[];
}

export interface CareerState {
  stats: CareerStats;
  end: CareerEnd | null;
}

/** The first-trade plan of the tutorial (Q-48): a best route at the career start. */
export interface TutorialPlan {
  commodity: string;
  fromId: number;
  toId: number;
  units: number;
  /** Average price per unit to buy and to sell. */
  buy: number;
  sell: number;
  profit: number;
}

/** Tutorial progress (Q-48). Only the UI reads it; no simulation rule uses it. */
export interface TutorialState {
  on: boolean;
  /** Ids of the tips that the player has seen. */
  seen: string[];
  plan: TutorialPlan | null;
}

export interface GameState {
  saveVersion: number;
  seed: number;
  /** Days since the career start. Keeps fractions (Section 8.1). */
  day: number;
  rng: RngStreams;
  world: World;
  player: Actor;
  log: LogEntry[];
  nextId: number;
  tutorial: TutorialState;
  contracts: ContractState;
  career: CareerState;
}
