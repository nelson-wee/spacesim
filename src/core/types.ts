// The game state. It is one plain object that JSON can save and load (G-10).
// Derived ship stats are not stored here (G-12).
import type { Development, SlotSize, Tier } from '../data';
import type { RngStreams } from './rng';

export const SAVE_VERSION = 1;

export interface Vec {
  x: number;
  y: number;
}

export interface Sector {
  id: number;
  name: string;
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
  population: number;
  installedMachinery: number;
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
  generator: { seedUsed: number; tries: number; topologyResamples: number };
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

export interface Actor {
  id: string;
  name: string;
  fleet: Ship[];
  flagshipIndex: number;
  credits: number;
  notoriety: number;
  position: Position;
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
