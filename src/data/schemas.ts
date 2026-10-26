// Schemas for all files in /data. Each file is checked when it loads (G-18).
// Files that a later milestone fills are empty objects now.
import { z } from 'zod';

const nonNeg = z.number().min(0);
const pos = z.number().positive();
const prob = z.number().min(0).max(1);

export const developmentSchema = z.enum(['core', 'middle', 'frontier']);
export const slotSizeSchema = z.enum(['S', 'M', 'L']);
export const tierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export const sizeClassSchema = z.enum(['small', 'medium', 'large', 'capital']);
const slotCountsSchema = z.object({ S: z.number().int().min(0), M: z.number().int().min(0), L: z.number().int().min(0) });

export const balanceSchema = z.object({
  world: z.object({
    sectorCount: z.number().int(),
    sectorCountMin: z.number().int(),
    sectorCountMax: z.number().int(),
    regionWidth: z.number().int().positive(),
    regionHeight: z.number().int().positive(),
    regionMarginX: z.number().int().min(0),
    regionMarginY: z.number().int().min(0),
    minSectorDistance: pos,
    minLanesPerSector: z.number().int().min(1),
    maxLanesPerSector: z.number().int().min(1),
    sectorPlacementAttempts: z.number().int().positive(),
    topologyResamples: z.number().int().positive(),
    cellAspect: pos,
    coreMaxJumps: z.number().int().min(0),
    middleMaxJumps: z.number().int().min(0),
    techByDevelopment: z.object({ core: z.number().int(), middle: z.number().int(), frontier: z.number().int() }),
    defaultLocationSize: z.number().int().min(1).max(3),
  }),
  sectorMap: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    bodyRingRadii: z.array(pos).min(1),
    jumpRingRadius: pos,
    minBodyDistance: nonNeg,
    minJumpPointDistance: nonNeg,
    bodyPlacementAttempts: z.number().int().positive(),
    bodiesMin: z.number().int().positive(),
    bodiesMax: z.number().int().positive(),
    planetsMin: z.number().int().min(0),
    planetsMax: z.number().int().min(0),
    stationsMin: z.number().int().min(0),
    stationsMax: z.number().int().min(0),
  }),
  travel: z.object({
    cruiseFactor: pos,
    jumpFactor: pos,
    kSector: nonNeg,
    kJump: nonNeg,
    kDock: nonNeg,
    fuelMassExponent: pos,
  }),
  ship: z.object({ mRef: pos, engineStackFalloff: z.number().min(0).max(1), engineValueShare: prob }),
  fuel: z.object({ fuelPerHydrogen: pos }),
  recovery: z.object({ base: nonNeg, perDistance: nonNeg, fullTankShare: prob, fuelShareAfterTow: prob }),
  fleet: z.object({ maxFleetSize: z.number().int().min(1) }),
  start: z.object({ credits: z.number(), loadoutId: z.string(), shipName: z.string() }),
});

export const commoditiesSchema = z.object({
  commodities: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        tier: z.enum(['raw', 'processed', 'advanced', 'consumer']),
        basePrice: pos,
        massPerUnit: pos,
        perishablePerDay: prob,
      }),
    )
    .length(12),
});

const qtySchema = z.object({ commodity: z.string(), qty: pos });
export const recipesSchema = z.object({
  capital: z.object({ machineryWear: prob, installRatePerDay: prob, maxInstallRatio: pos }),
  recipes: z.array(
    z.object({
      producer: z.string(),
      name: z.string(),
      class: z.enum(['extractor', 'processor', 'advanced']),
      inputs: z.array(qtySchema),
      outputs: z.array(qtySchema).min(1),
      softInput: z.string(),
      batchesPerSize: pos,
      machineryPerBatch: pos,
    }),
  ),
});

export const producerTypesSchema = z.object({
  producerTypes: z.array(
    z.object({ id: z.string(), hosts: z.array(z.string()).min(1), development: z.array(developmentSchema).min(1) }),
  ),
});

export const populationSchema = z.object({
  use: z.array(
    z.object({ commodity: z.string(), perUnitPerDay: nonNeg, who: z.enum(['all', 'noAtmosphere', 'core']) }),
  ),
  unitsPerSize: z.object({ terran: nonNeg, ocean: nonNeg, habitat: nonNeg, crew: nonNeg }),
});

export const bodyTypesSchema = z.object({
  planets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      weights: z.object({ frontier: nonNeg, middle: nonNeg, core: nonNeg }),
      gravity: nonNeg,
      atmosphere: z.boolean(),
    }),
  ),
  stations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      development: z.array(developmentSchema).min(1),
      minBaselineSecurity: nonNeg.optional(),
      maxBaselineSecurity: nonNeg.optional(),
    }),
  ),
  stars: z.array(z.object({ id: z.string(), weight: pos })).min(1),
});

export const securitySchema = z.object({
  baseline: z.object({ core: nonNeg, perJump: nonNeg, jitter: nonNeg, min: nonNeg, max: nonNeg }),
  levels: z
    .array(
      z.object({
        level: z.number().int(),
        name: z.string(),
        min: nonNeg,
        pirateChanceArrival: prob,
        pirateChanceTrip: prob,
        patrolPerTurn: prob,
        piratePerTurn: prob,
        economyMult: pos,
      }),
    )
    .length(5),
});

const syllablesSchema = z.object({
  start: z.array(z.string()).min(1),
  middle: z.array(z.string()).min(1),
  end: z.array(z.string()).min(1),
});
export const namesSchema = z.object({
  sector: syllablesSchema,
  location: syllablesSchema,
  nameAttempts: z.number().int().positive(),
  middleChance: prob,
});

export const hullsSchema = z.object({
  hulls: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      hp: pos,
      armor: nonNeg,
      basePower: nonNeg,
      mass: pos,
      heatCapacity: pos,
      baseCooling: nonNeg,
      hardpoints: slotCountsSchema,
      internal: slotCountsSchema,
      sizeClass: sizeClassSchema,
      tech: z.number().int().min(1).max(3).nullable(),
      price: pos.nullable(),
      enemyOnly: z.boolean(),
    }),
  ),
});

// Tier-1 values for one module size. Each module category uses some fields.
export const moduleValuesSchema = z
  .object({
    mass: nonNeg,
    price: nonNeg,
    power: nonNeg.optional(),
    heatPerTurn: nonNeg.optional(),
    thrust: nonNeg.optional(),
    fuelRate: pos.optional(),
    powerOutput: nonNeg.optional(),
    shieldCapacity: nonNeg.optional(),
    shieldRegen: nonNeg.optional(),
    cargoCapacity: nonNeg.optional(),
    fuelCapacity: nonNeg.optional(),
    armor: nonNeg.optional(),
    armorHp: nonNeg.optional(),
    heatCapacity: nonNeg.optional(),
    cooling: nonNeg.optional(),
    agilityBonus: nonNeg.optional(),
    damage: nonNeg.optional(),
    range: nonNeg.optional(),
    tracking: nonNeg.optional(),
    vsShield: nonNeg.optional(),
    vsHull: nonNeg.optional(),
    armorPierce: nonNeg.optional(),
    heatPerShot: nonNeg.optional(),
  })
  .strict();

const tierMultSchema = z.object({ main: pos, power: pos, heat: pos, mass: pos, price: pos });
export const modulesSchema = z.object({
  tiers: z.object({ '1': tierMultSchema, '2': tierMultSchema, '3': tierMultSchema }),
  engineFuelRateByTier: z.object({ '1': pos, '2': pos, '3': pos }),
  modules: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slot: z.enum(['internal', 'hardpoint']),
      category: z.enum([
        'engine',
        'reactor',
        'shield',
        'cargo',
        'fuel',
        'armor',
        'heatSink',
        'radiator',
        'thrusters',
        'laser',
        'ballistic',
        'guided',
        'pointDefense',
      ]),
      mainStats: z.array(z.string()),
      sizes: z.object({
        S: moduleValuesSchema.optional(),
        M: moduleValuesSchema.optional(),
        L: moduleValuesSchema.optional(),
      }),
    }),
  ),
});

const loadoutSlotSchema = z.object({ moduleId: z.string(), size: slotSizeSchema, tier: tierSchema }).nullable();
export const loadoutsSchema = z.object({
  loadouts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      hullId: z.string(),
      hardpoints: z.array(loadoutSlotSchema),
      internal: z.array(loadoutSlotSchema),
      powerPriority: z.array(z.string()),
    }),
  ),
});

// Filled in later milestones (M2: services; M5: encounters, templates, battleMaps; M7: events, contracts).
export const plannedSchema = z.object({}).strict();

const glyph = z.string().length(1);
const grid = z.array(z.string()).min(1);
const artViewSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  glyphs: grid,
  roles: grid,
  glyphsDamaged: grid,
  glyphsCritical: grid,
  flicker: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])),
});
/** data/art/ships.json: generated from data/art/ships.yaml by tools/import-art.ts. */
export const artShipsSchema = z.object({
  source: z.string(),
  mirrorSwaps: z.record(glyph, glyph),
  roleColors: z.record(z.string(), z.string()),
  damageRule: z.object({
    order: z.array(z.unknown()),
    damaged: prob,
    critical: prob,
    dim: z.object({ damaged: prob, critical: prob, changed: prob }),
  }),
  damageStep: z.record(glyph, glyph),
  damageStepBox: glyph,
  surrenderMarker: z.object({ glyph, fg: z.string(), at: z.string(), blinkMs: z.tuple([pos, pos]) }),
  ships: z.record(
    z.string(),
    z.object({
      sizeClass: sizeClassSchema,
      battle: artViewSchema,
      portrait: artViewSchema.extend({ slotCount: z.number().int().min(0), slots: z.array(z.string()) }),
    }),
  ),
});
export const artIconsSchema = z.object({
  source: z.string(),
  map: z.object({
    sector: glyph,
    star: glyph,
    planetSmall: glyph,
    planetLarge: glyph,
    station: glyph,
    jumpPoint: glyph,
    player: glyph,
    orbit: glyph,
    lane: glyph,
  }),
});
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** data/art/style.json: Claude Design output. Colors are named; other parts refer to the names. */
export const artStyleSchema = z.object({
  cell: z.object({
    w: z.number().int().positive(),
    h: z.number().int().positive(),
    font: z.string(),
    fontSize: pos,
    ligatures: z.boolean(),
  }),
  colors: z.record(z.string(), color),
  sides: z.record(z.string(), z.string()),
  roles: z.record(z.string(), z.union([z.string(), z.record(z.string(), z.string())])),
  security: z.array(z.string()).length(5),
  threatBand: z.object({ width: z.number().int().positive(), glyph, empty: glyph, color: z.string() }),
  tiers: z.record(z.string(), z.tuple([z.string(), z.string()])),
  tech: z.array(z.string()).length(3),
  heat: z.object({
    cells: z.number().int().positive(),
    step: pos,
    zones: z.record(z.string(), z.tuple([z.number(), z.number()])),
    flashHz: pos,
  }),
  frame: z.object({
    single: z.string().length(6),
    modal: z.string().length(6),
    padding: z.number().int().min(0),
    titlePrefix: z.string(),
  }),
});
export const artEffectsSchema = z.object({ source: z.string(), effects: z.object({}).strict() });
