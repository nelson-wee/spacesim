// Loads and checks all data files. The simulation reads tuning values only
// from here (G-04). The same code runs in the browser and in Node.
import type { z } from 'zod';
import balanceJson from '../../data/balance.json';
import battleMapsJson from '../../data/battleMaps.json';
import bodyTypesJson from '../../data/bodyTypes.json';
import commoditiesJson from '../../data/commodities.json';
import contractsJson from '../../data/contracts.json';
import encountersJson from '../../data/encounters.json';
import eventsJson from '../../data/events.json';
import hullsJson from '../../data/hulls.json';
import loadoutsJson from '../../data/loadouts.json';
import modulesJson from '../../data/modules.json';
import namesJson from '../../data/names.json';
import populationJson from '../../data/population.json';
import producerTypesJson from '../../data/producerTypes.json';
import recipesJson from '../../data/recipes.json';
import securityJson from '../../data/security.json';
import servicesJson from '../../data/services.json';
import templatesJson from '../../data/templates.json';
import artEffectsJson from '../../data/art/effects.json';
import artIconsJson from '../../data/art/icons.json';
import artShipsJson from '../../data/art/ships.json';
import artStyleJson from '../../data/art/style.json';
import * as S from './schemas';

export type Balance = z.infer<typeof S.balanceSchema>;
export type Commodity = z.infer<typeof S.commoditiesSchema>['commodities'][number];
export type Recipe = z.infer<typeof S.recipesSchema>['recipes'][number];
export type ProducerType = z.infer<typeof S.producerTypesSchema>['producerTypes'][number];
export type PlanetType = z.infer<typeof S.bodyTypesSchema>['planets'][number];
export type StationType = z.infer<typeof S.bodyTypesSchema>['stations'][number];
export type SecurityLevel = z.infer<typeof S.securitySchema>['levels'][number];
export type Hull = z.infer<typeof S.hullsSchema>['hulls'][number];
export type ModuleDef = z.infer<typeof S.modulesSchema>['modules'][number];
export type ModuleValues = z.infer<typeof S.moduleValuesSchema>;
export type Loadout = z.infer<typeof S.loadoutsSchema>['loadouts'][number];
export type LoadoutSlot = Loadout['internal'][number];
export type Development = z.infer<typeof S.developmentSchema>;
export type SlotSize = z.infer<typeof S.slotSizeSchema>;
export type Tier = z.infer<typeof S.tierSchema>;
export type Style = z.infer<typeof S.artStyleSchema>;
export type Icons = z.infer<typeof S.artIconsSchema>;
export type ShipArt = z.infer<typeof S.artShipsSchema>;

export interface RawData {
  balance: unknown;
  commodities: unknown;
  recipes: unknown;
  producerTypes: unknown;
  population: unknown;
  bodyTypes: unknown;
  security: unknown;
  names: unknown;
  hulls: unknown;
  modules: unknown;
  loadouts: unknown;
  services: unknown;
  events: unknown;
  encounters: unknown;
  templates: unknown;
  contracts: unknown;
  battleMaps: unknown;
  artShips: unknown;
  artEffects: unknown;
  artIcons: unknown;
  artStyle: unknown;
}

export interface GameData {
  balance: Balance;
  commodities: Commodity[];
  commodityById: Map<string, Commodity>;
  recipes: z.infer<typeof S.recipesSchema>;
  recipeByProducer: Map<string, Recipe>;
  producerTypes: ProducerType[];
  population: z.infer<typeof S.populationSchema>;
  bodyTypes: z.infer<typeof S.bodyTypesSchema>;
  planetTypeById: Map<string, PlanetType>;
  stationTypeById: Map<string, StationType>;
  security: z.infer<typeof S.securitySchema>;
  names: z.infer<typeof S.namesSchema>;
  hulls: Hull[];
  hullById: Map<string, Hull>;
  modules: z.infer<typeof S.modulesSchema>;
  moduleById: Map<string, ModuleDef>;
  loadoutById: Map<string, Loadout>;
  art: {
    ships: ShipArt;
    icons: Icons;
    style: Style;
    effects: z.infer<typeof S.artEffectsSchema>;
  };
}

export const RAW_DATA: RawData = {
  balance: balanceJson,
  commodities: commoditiesJson,
  recipes: recipesJson,
  producerTypes: producerTypesJson,
  population: populationJson,
  bodyTypes: bodyTypesJson,
  security: securityJson,
  names: namesJson,
  hulls: hullsJson,
  modules: modulesJson,
  loadouts: loadoutsJson,
  services: servicesJson,
  events: eventsJson,
  encounters: encountersJson,
  templates: templatesJson,
  contracts: contractsJson,
  battleMaps: battleMapsJson,
  artShips: artShipsJson,
  artEffects: artEffectsJson,
  artIcons: artIconsJson,
  artStyle: artStyleJson,
};

function parse<T extends z.ZodType>(file: string, schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Data file ${file} is not valid:\n${issues}`);
  }
  return result.data;
}

function byId<T>(items: readonly T[], key: (item: T) => string, file: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const id = key(item);
    if (map.has(id)) throw new Error(`Data file ${file}: duplicate id "${id}"`);
    map.set(id, item);
  }
  return map;
}

const SIZE_ORDER: Record<SlotSize, number> = { S: 0, M: 1, L: 2 };
export function sizeFits(moduleSize: SlotSize, slotSize: SlotSize): boolean {
  return SIZE_ORDER[moduleSize] <= SIZE_ORDER[slotSize];
}

/** Slot sizes of a hull, in slot order (S slots, then M, then L). */
export function slotSizes(counts: { S: number; M: number; L: number }): SlotSize[] {
  const sizes: SlotSize[] = [];
  for (const size of ['S', 'M', 'L'] as const) for (let i = 0; i < counts[size]; i++) sizes.push(size);
  return sizes;
}

/** Checks the links between files. Returns a list of problems. */
export function checkReferences(data: GameData): string[] {
  const problems: string[] = [];
  const b = data.balance;
  if (b.world.sectorCount < b.world.sectorCountMin || b.world.sectorCount > b.world.sectorCountMax) {
    problems.push('balance.world.sectorCount is outside sectorCountMin..sectorCountMax');
  }
  for (const r of data.recipes.recipes) {
    for (const q of [...r.inputs, ...r.outputs]) {
      if (!data.commodityById.has(q.commodity)) problems.push(`recipe ${r.producer}: unknown commodity ${q.commodity}`);
    }
    if (!data.commodityById.has(r.softInput)) problems.push(`recipe ${r.producer}: unknown soft input ${r.softInput}`);
  }
  const hostIds = new Set([...data.planetTypeById.keys(), ...data.stationTypeById.keys()]);
  for (const p of data.producerTypes) {
    if (!data.recipeByProducer.has(p.id)) problems.push(`producerTypes: ${p.id} has no recipe`);
    for (const h of p.hosts) if (!hostIds.has(h)) problems.push(`producerTypes: ${p.id} has unknown host ${h}`);
  }
  for (const u of data.population.use) {
    if (!data.commodityById.has(u.commodity)) problems.push(`population: unknown commodity ${u.commodity}`);
  }
  for (const m of data.modules.modules) {
    const sizes = Object.keys(m.sizes);
    if (sizes.length === 0) problems.push(`module ${m.id}: no sizes`);
  }
  for (const l of data.loadoutById.values()) {
    const hull = data.hullById.get(l.hullId);
    if (!hull) {
      problems.push(`loadout ${l.id}: unknown hull ${l.hullId}`);
      continue;
    }
    const groups: [string, LoadoutSlot[], SlotSize[], 'internal' | 'hardpoint'][] = [
      ['hardpoints', l.hardpoints, slotSizes(hull.hardpoints), 'hardpoint'],
      ['internal', l.internal, slotSizes(hull.internal), 'internal'],
    ];
    for (const [name, slots, sizes, slotType] of groups) {
      if (slots.length !== sizes.length) {
        problems.push(`loadout ${l.id}: ${name} has ${slots.length} slots, hull has ${sizes.length}`);
        continue;
      }
      slots.forEach((slot, i) => {
        if (!slot) return;
        const def = data.moduleById.get(slot.moduleId);
        if (!def) return problems.push(`loadout ${l.id}: unknown module ${slot.moduleId}`);
        if (def.slot !== slotType) problems.push(`loadout ${l.id}: ${slot.moduleId} cannot go in a ${slotType} slot`);
        if (!def.sizes[slot.size]) problems.push(`loadout ${l.id}: ${slot.moduleId} has no size ${slot.size}`);
        if (!sizeFits(slot.size, sizes[i] as SlotSize)) {
          problems.push(`loadout ${l.id}: ${slot.moduleId} ${slot.size} does not fit slot ${i} (${sizes[i]})`);
        }
      });
    }
  }
  if (!data.loadoutById.has(b.start.loadoutId)) problems.push(`balance.start.loadoutId: unknown ${b.start.loadoutId}`);
  problems.push(...checkArt(data));
  return problems;
}

/** Color names that a style value refers to. "{side}" stands for each side. */
function styleColorNames(style: Style, value: string): string[] {
  if (!value.includes('{side}')) return [value];
  return Object.values(style.sides).map((side) => value.replace('{side}', side));
}

/** Checks the art files against each other and against the game data. */
export function checkArt(data: GameData): string[] {
  const problems: string[] = [];
  const { ships, style } = data.art;
  const hasColor = (name: string) => name in style.colors;
  for (const h of data.hulls) {
    const art = ships.ships[h.id];
    if (!art) problems.push(`art/ships.json: no art for hull ${h.id}`);
    else if (art.sizeClass !== h.sizeClass) {
      problems.push(`art/ships.json: ${h.id} size class ${art.sizeClass}, hulls.json says ${h.sizeClass}`);
    }
  }
  for (const id of Object.keys(ships.ships)) if (!data.hullById.has(id)) problems.push(`art/ships.json: unknown hull ${id}`);
  const refs: [string, string][] = [
    ...style.security.map((c, i): [string, string] => [`security[${i}]`, c]),
    ...style.tech.map((c, i): [string, string] => [`tech[${i}]`, c]),
    ...Object.entries(style.tiers).map(([k, v]): [string, string] => [`tiers.${k}`, v[1]]),
    ...Object.entries(style.sides).map(([k, v]): [string, string] => [`sides.${k}`, v]),
  ];
  for (const [key, value] of Object.entries(style.roles)) {
    if (typeof value === 'string') for (const c of styleColorNames(style, value)) refs.push([`roles.${key}`, c]);
    else for (const [k, v] of Object.entries(value)) refs.push([`roles.${key}.${k}`, v]);
  }
  for (const [where, name] of refs) if (!hasColor(name)) problems.push(`art/style.json: ${where} names unknown color "${name}"`);
  for (const t of new Set(data.commodities.map((c) => c.tier))) {
    if (!style.tiers[t]) problems.push(`art/style.json: no tier style for "${t}"`);
  }
  // The ship art repeats the role colors of the style; they must agree.
  for (const [role, value] of Object.entries(ships.roleColors)) {
    if (style.roles[role] !== value) problems.push(`art: role "${role}" is "${value}" in ships.yaml, "${String(style.roles[role])}" in style.json`);
  }
  if (ships.surrenderMarker.fg && !hasColor(ships.surrenderMarker.fg)) {
    problems.push(`art/ships.json: surrender marker color "${ships.surrenderMarker.fg}" is unknown`);
  }
  return problems;
}

export function buildGameData(raw: RawData): GameData {
  const commodities = parse('commodities.json', S.commoditiesSchema, raw.commodities).commodities;
  const recipes = parse('recipes.json', S.recipesSchema, raw.recipes);
  const bodyTypes = parse('bodyTypes.json', S.bodyTypesSchema, raw.bodyTypes);
  const hulls = parse('hulls.json', S.hullsSchema, raw.hulls).hulls;
  const modules = parse('modules.json', S.modulesSchema, raw.modules);
  const loadouts = parse('loadouts.json', S.loadoutsSchema, raw.loadouts).loadouts;
  parse('services.json', S.plannedSchema, raw.services);
  parse('events.json', S.plannedSchema, raw.events);
  parse('encounters.json', S.plannedSchema, raw.encounters);
  parse('templates.json', S.plannedSchema, raw.templates);
  parse('contracts.json', S.plannedSchema, raw.contracts);
  parse('battleMaps.json', S.plannedSchema, raw.battleMaps);

  const data: GameData = {
    balance: parse('balance.json', S.balanceSchema, raw.balance),
    commodities,
    commodityById: byId(commodities, (c) => c.id, 'commodities.json'),
    recipes,
    recipeByProducer: byId(recipes.recipes, (r) => r.producer, 'recipes.json'),
    producerTypes: parse('producerTypes.json', S.producerTypesSchema, raw.producerTypes).producerTypes,
    population: parse('population.json', S.populationSchema, raw.population),
    bodyTypes,
    planetTypeById: byId(bodyTypes.planets, (p) => p.id, 'bodyTypes.json'),
    stationTypeById: byId(bodyTypes.stations, (s) => s.id, 'bodyTypes.json'),
    security: parse('security.json', S.securitySchema, raw.security),
    names: parse('names.json', S.namesSchema, raw.names),
    hulls,
    hullById: byId(hulls, (h) => h.id, 'hulls.json'),
    modules,
    moduleById: byId(modules.modules, (m) => m.id, 'modules.json'),
    loadoutById: byId(loadouts, (l) => l.id, 'loadouts.json'),
    art: {
      ships: parse('art/ships.json', S.artShipsSchema, raw.artShips),
      icons: parse('art/icons.json', S.artIconsSchema, raw.artIcons),
      style: parse('art/style.json', S.artStyleSchema, raw.artStyle),
      effects: parse('art/effects.json', S.artEffectsSchema, raw.artEffects),
    },
  };
  const problems = checkReferences(data);
  if (problems.length > 0) throw new Error(`Data links are not valid:\n  ${problems.join('\n  ')}`);
  return data;
}

let cached: GameData | null = null;

/** The checked game data. Loads once. */
export function gameData(): GameData {
  cached ??= buildGameData(RAW_DATA);
  return cached;
}

export function hydrogenBasePrice(data: GameData): number {
  const h = data.commodityById.get('hydrogen');
  if (!h) throw new Error('commodities.json: no hydrogen');
  return h.basePrice;
}
