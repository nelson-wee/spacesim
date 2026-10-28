// The game state. It is one plain object that JSON can save and load (G-10).
// Derived ship stats are not stored here (G-12).
import type { Development, SlotSize, Tier } from '../data';
import type { Knowledge } from '../actor/knowledge';
import type { RngStreams } from './rng';

export const SAVE_VERSION = 4;

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

export interface EconomyState {
  days: number;
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
 * actor wakes at `locationId` with a new copy of `ship` and `credits`.
 */
export interface InsurancePolicy {
  locationId: number;
  day: number;
  /** The insured hull and loadout (no cargo). */
  ship: Ship;
  /** Credits after the premium. */
  credits: number;
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
}

export type LogKind = 'info' | 'good' | 'warning' | 'danger';

export interface LogEntry {
  day: number;
  text: string;
  kind: LogKind;
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
}
