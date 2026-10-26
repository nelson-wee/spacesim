// Schemas for all files in /data. Each file is checked when it loads (G-18).
// Files that a later milestone fills are empty objects now.
import { z } from 'zod';

const nonNeg = z.number().min(0);
const pos = z.number().positive();
const prob = z.number().min(0).max(1);

export const developmentSchema = z.enum(['core', 'middle', 'frontier']);
export const slotSizeSchema = z.enum(['S', 'M', 'L']);
export const tierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
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
      sizeClass: z.enum(['small', 'medium', 'large', 'capital']),
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
export const artShipsSchema = z.object({
  source: z.string(),
  mirrorSwaps: z.record(glyph, glyph),
  ships: z.record(z.string(), z.array(z.string()).min(1)),
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
export const artPaletteSchema = z.object({
  source: z.string(),
  ui: z.object({
    background: color,
    text: color,
    dim: color,
    bright: color,
    title: color,
    highlight: color,
    key: color,
    good: color,
    warning: color,
    danger: color,
    border: color,
    selectBg: color,
  }),
  roles: z.object({ player: color, pirate: color, trader: color, patrol: color, neutral: color, cargoPod: color }),
  techLevel: z.object({ '1': color, '2': color, '3': color }),
  stars: z.record(z.string(), color),
  development: z.object({ core: color, middle: color, frontier: color }),
  security: z.array(color).length(5),
  map: z.object({ lane: color, orbit: color, jumpPoint: color }),
});
export const artEffectsSchema = z.object({ source: z.string(), effects: z.object({}).strict() });
