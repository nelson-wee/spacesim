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
    /** Lane length for "fuel per jump" in ship stats and reports (M1 world report: mean lane 18.7). */
    referenceLaneLength: pos,
  }),
  ship: z.object({ mRef: pos, engineStackFalloff: z.number().min(0).max(1), engineValueShare: prob }),
  /** Tactical combat (Sections 8.5, 11.6, 12.3, 13). */
  /**
   * Threat units (Section 10.5): TU = referenceTu x rawThreat / rawThreat(referenceLoadout);
   * firepower uses trackFactor at `trackManeuver` (guided: munition agility), flak `flakTrackFactor`,
   * `ammoFactor` by module id; groupTU = sum x (1 + groupBonus x (count - 1)).
   */
  /** Section 15 and Q-21: notoriety 0 to max; levels Suspect and Wanted; changes per event and per day. */
  notoriety: z.object({
    max: pos,
    suspect: nonNeg,
    wanted: nonNeg,
    attackNonPirate: z.number(),
    destroyNonPirate: z.number(),
    aggressorWhenPatrolArrives: z.number(),
    pirateKilledOrCaptured: z.number(),
    /** A prize ship from a non-pirate (Section 13.7). */
    prizeNonPirate: z.number(),
    perDay: z.number(),
  }),
  threat: z.object({
    referenceLoadout: z.string(),
    referenceTu: pos,
    trackManeuver: pos,
    flakTrackFactor: prob,
    ammoFactor: z.record(z.string(), prob),
    groupBonus: nonNeg,
  }),
  combat: z.object({
    gridWidth: z.number().int().positive(),
    gridHeight: z.number().int().positive(),
    /**
     * Multipliers on the Section 11.7 and 12.2 tables (DECISIONS.md, M4): weapon damage against
     * ships (not point defense); heat per turn of modules ON (idle) and heat per shot (Q-40). Threat units do not change.
     */
    damageScale: pos,
    idleHeatScale: pos,
    shotHeatScale: pos,
    maxTurns: z.number().int().positive(),
    /** Hit chance (Section 12.3): BASE_ACC, range penalty, clamp. */
    baseAccuracy: pos,
    rangePenalty: prob,
    hitMin: prob,
    hitMax: prob,
    /** Heat (Section 11.6): Hot from hotShare of capacity; hit factor and shield regeneration when Hot. */
    hotShare: prob,
    hotHitFactor: prob,
    hotShieldRegen: prob,
    /** An overheated ship is back online when its heat is at or below this share of capacity (Q-40). */
    overheatRecoverShare: prob,
    debrisFactor: prob,
    /**
     * Power as actions (Q-41): modules of these categories reserve their draw each turn while ON;
     * engines cost their draw for a turn with a move; each shot costs the weapon's draw.
     */
    reserveCategories: z.array(z.string()),
    /** Shots at a module (the Engines): hit x tracking / (tracking + moduleAimTracking) (Q-40). */
    moduleAimTracking: pos,
    /** Fuel: mass^fuelMassExponent x kCombat per turn with an engine ON; x kFlee for a flee (Section 8.5). */
    kCombat: nonNeg,
    kFlee: nonNeg,
    /** AI ships start a battle with at least this fuel (a Wasp has no fuel tank). */
    npcFuelReserve: nonNeg,
    /** AI: the wanted distance is this share of the shortest range of its weapons that are ON. */
    bestRangeShare: prob,
    /** Raider AI retreats below this hull share (Section 13.8). */
    retreatHull: prob,
    /** Morale (Section 13.8): roll once when hull falls below moraleHull or the engine value is 0. */
    moraleHull: prob,
    /** A destroyed ship drops this share range of its cargo as one pod (Section 13.7). */
    podShare: z.tuple([prob, prob]),
    /** A ship that pirates disable keeps this share of its max hull HP (owner, 2026-10-28). */
    disabledHullShare: prob,
    surrenderChance: z.object({ trader: prob, evader: prob, raider: prob, patrol: prob, attack: prob }),
    /**
     * Auto-battle (Q-47): the player's ship flees below retreatHull (Balanced doctrine);
     * "auto until" stops when the hull falls below stopHull, at Hot heat, at a reinforcement,
     * or at a munition launched at the player; turnDelayMs between auto turns on the screen.
     */
    auto: z.object({ retreatHull: prob, stopHull: prob, turnDelayMs: z.number().int().min(0) }),
    /** Q-50: an NPC ship with engine value 0 and hull at or below this share surrenders with no roll. */
    forcedSurrenderHull: prob,
    /**
     * Map (Section 13.1): random fill and cellular steps (rot.js Map.Cellular; fill 0.42 gives
     * about 11% obstacles), share of clusters that are debris clouds. Each side starts at
     * `startColumn` cells from its edge; the band of startAreaHalfWidth cells around it is open.
     */
    map: z.object({
      fill: prob,
      iterations: z.number().int().min(0),
      debrisShare: prob,
      startColumn: z.number().int().min(1),
      startAreaHalfWidth: z.number().int().min(0),
    }),
  }),
  fuel: z.object({ fuelPerHydrogen: pos }),
  recovery: z.object({ base: nonNeg, perDistance: nonNeg, fullTankShare: prob, fuelShareAfterTow: prob }),
  /**
   * Fleet (Section 11.9): upkeep per day of each non-flagship ship = upkeepPerShip x size points of
   * its hull size class; a prize ship gets prizeFuelShare of its tank; when the flagship flees from
   * pirates, they take fleeCargoShare of the cargo of one random non-flagship ship.
   */
  fleet: z.object({
    maxFleetSize: z.number().int().min(1),
    upkeepPerShip: nonNeg,
    sizePoints: z.object({ small: nonNeg, medium: nonNeg, large: nonNeg, capital: nonNeg }),
    prizeFuelShare: prob,
    fleeCargoShare: prob,
  }),
  economy: z.object({
    priceExponent: pos,
    priceClampMin: pos,
    priceClampMax: pos,
    spread: prob,
    targetDays: pos,
    inputTargetDays: pos,
    planetTargetMult: pos,
    tradeHubTargetDays: pos,
    minTargetStock: z.record(z.string(), nonNeg),
    /** A source keeps this share of its target; carriers take only the stock above it. */
    surplusShareOfTarget: nonNeg,
    offMapInputShare: prob,
    offMapBalance: prob,
    /**
     * Production capacity (DECISIONS.md, M2): each day a producer's capacity changes by
     * changeRate x clamp(min(output price / (growthPriceFactor x base) - 1, output value /
     * unit cost - 1), -1, 1). Growth uses at least restartCapacity, so a closed producer
     * can start again. A lower growthPriceFactor gives a lower general price level.
     */
    capacity: z.object({ changeRate: prob, restartCapacity: nonNeg, growthPriceFactor: pos }),
    balanceWindowDays: z.number().int().positive(),
    balanceStartLow: pos,
    balanceStartHigh: pos,
    balanceStopLow: pos,
    balanceStopHigh: pos,
    noiseShare: prob,
    historyDays: z.number().int().positive(),
    /**
     * Multiplies all daily amounts: recipe batches, population use, and station use
     * (applied at data load). Prices and supply/demand ratios do not change.
     */
    volumeScale: pos,
    /** Background carriers (DECISIONS.md, M2: replaces the §9.7 flow formula). */
    carriers: z.object({
      maxJumps: z.number().int().min(0),
      /** Carriers take a route only if (sell - buy - transport cost) / buy is at least this. */
      minMargin: nonNeg,
      /** Transport cost in credits per tonne: once per shipment, and for each jump. */
      costPerTonne: nonNeg,
      costPerTonneJump: nonNeg,
      /** Risk and insurance for each jump, as a share of the buy price (far routes need larger gaps). */
      riskPerJump: nonNeg,
      /** Cost of the capital in transit, as a share of the buy price per transit day. */
      capitalCostPerDay: nonNeg,
      /** Share of the open surplus or deficit that carriers move on one day. */
      dailyShare: prob,
      /** Tonnes per day that carriers can move through one sector at security level 4. */
      sectorCapacityTonnes: nonNeg,
      /** Capacity multiplier: base + perLevel x security level (Lawless 0.2, Secure 1.0). */
      securityBase: nonNeg,
      securityPerLevel: nonNeg,
      /** Days in transit: transitDays + transitDaysPerJump x jumps. */
      transitDays: z.number().int().min(0),
      transitDaysPerJump: z.number().int().min(0),
    }),
  }),
  generator: z.object({
    maxTries: z.number().int().positive(),
    maxRepairs: z.number().int().min(0),
    sizePasses: z.number().int().positive(),
    sizeMin: z.number().int().min(1),
    sizeMax: z.number().int().min(1),
    /** Sizes step aims for supply/demand in ratioLow..ratioHigh. */
    ratioLow: pos,
    ratioHigh: pos,
    /** Validation accepts supply/demand in ratioAcceptLow..ratioAcceptHigh. */
    ratioAcceptLow: pos,
    ratioAcceptHigh: pos,
    /**
     * Run the 200-day economy check (low output, gradient) as a generator rule. Off while the
     * economy is tuned (owner, DECISIONS.md); then the generator only warms the markets up.
     */
    economyCheck: z.boolean(),
    /** Days of economy run after generation, so the game starts with warm markets. */
    warmupDays: z.number().int().min(0),
    minProducersPerType: z.number().int().min(0),
    averageSize: pos,
    minFrontierSectors: z.number().int().min(0),
    blueprintPasses: z.number().int().positive(),
    validationDays: z.number().int().positive(),
    lowOutputShare: prob,
    lowOutputDays: z.number().int().positive(),
    fill: z.object({
      minTradeHubs: z.number().int().min(0),
      militaryOutposts: z.number().int().min(0),
      pirateHavens: z.number().int().min(0),
      minShipyards: z.number().int().min(0),
      habitatWeight: nonNeg,
      tradeHubWeight: nonNeg,
    }),
  }),
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
  capital: z.object({
    machineryWear: prob,
    installRatePerDay: prob,
    /** Daily return that installed Machinery must earn, above its wear (sets K*, DECISIONS.md). */
    requiredReturn: nonNeg,
  }),
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

const stationUseSchema = z.array(z.object({ commodity: z.string(), perSizePerDay: nonNeg }));
export const populationSchema = z.object({
  /** Multiplies all population use. Tunes demand to the number of bodies (DECISIONS.md). */
  useScale: pos,
  stationUse: z.record(z.string(), stationUseSchema),
  use: z.array(
    z.object({ commodity: z.string(), perUnitPerDay: nonNeg, who: z.enum(['all', 'resident', 'noAtmosphere', 'coreResident', 'outsideCore']) }),
  ),
  unitsPerSize: z.object({ terran: nonNeg, ocean: nonNeg, habitat: nonNeg, crew: nonNeg }),
});

export const bodyTypesSchema = z.object({
  planets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      /** Type code in technical names: one capital letter (DECISIONS.md, M3). */
      code: z.string().regex(/^[A-Z]$/),
      weights: z.object({ frontier: nonNeg, middle: nonNeg, core: nonNeg }),
      gravity: nonNeg,
      atmosphere: z.boolean(),
    }),
  ),
  stations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      /** Type code in technical names: two small letters (DECISIONS.md, M3). */
      code: z.string().regex(/^[a-z]{2}$/),
      development: z.array(developmentSchema).min(1),
      minBaselineSecurity: nonNeg.optional(),
      maxBaselineSecurity: nonNeg.optional(),
      techBonus: z.number().int().min(0).optional(),
      tradesAll: z.boolean().optional(),
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
  /** Section 10.5: securityBase[level] x devMult[development] x random, minimum `min`. */
  pirateBudget: z.object({
    securityBase: z.array(nonNeg).length(5),
    devMult: z.object({ core: pos, middle: pos, frontier: pos }),
    random: z.tuple([pos, pos]),
    min: nonNeg,
  }),
  /** Section 10.7: odds multiplier by security level; ratio limits for Attack and Tribute. */
  boldness: z.array(pos).length(5),
  odds: z.object({ attack: pos, tribute: pos }),
  /** Section 10.8 and Q-04 (interim): patrolBase[level] x random. */
  patrolBudget: z.object({ base: z.array(nonNeg).length(5), random: z.tuple([pos, pos]) }),
  /** Q-18: budget midpoint limits for 1 to 4 skulls (more = 5). */
  threatBand: z.object({ limits: z.array(pos).length(4) }),
  /** Section 13.5. */
  reinforcement: z.object({ startTurn: z.number().int().positive(), pirateBudgetShare: prob }),
  /** Section 10.3: changes of value and baseline. */
  changes: z.record(z.string(), z.object({ value: z.number(), baseline: z.number() })),
  dailyDrift: prob,
  trendDays: z.number().int().positive(),
});

const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Loadout ids (loadouts.json). TU is calculated, not typed (Section 10.6). */
  ships: z.array(z.string()).min(1),
  maxSecurity: z.number().int().min(0).max(4).optional(),
  notCore: z.boolean().optional(),
  namedOnly: z.boolean().optional(),
  development: z.array(developmentSchema).optional(),
});
export type TemplateDef = z.infer<typeof templateSchema>;
const weightedLoadout = z.object({ loadout: z.string(), weight: pos });
export const templatesSchema = z.object({
  pirate: z.array(templateSchema).min(1),
  trader: z.object({ core: z.array(weightedLoadout).min(1), middle: z.array(weightedLoadout).min(1), frontier: z.array(weightedLoadout).min(1) }),
  /** Section 10.8: trader escort in sectors with security level <= maxSecurity; budget share of the pirate budget; loadout swaps (Raiders become Escort Wasps). */
  escort: z.object({ maxSecurity: z.number().int(), budgetShare: prob, loadoutSwap: z.record(z.string(), z.string()) }),
  patrol: z.array(templateSchema).min(1),
});

/**
 * Battle map templates (Section 13.1). The nearest location within `nearDistance`
 * sector cells selects the template by its body type; else `default`. `fill`
 * is the rot.js cellular fill (0.35: about 3% obstacles; 0.44: 13%; 0.47: 19%).
 * `band`: a debris band of this depth range on one map edge (Gas Giant Edge).
 */
const battleMapTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  fill: prob,
  debrisShare: prob,
  nearPlanets: z.array(z.string()).optional(),
  nearStations: z.array(z.string()).optional(),
  band: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
});
export type BattleMapTemplate = z.infer<typeof battleMapTemplateSchema>;
export const battleMapsSchema = z.object({ nearDistance: pos, default: z.string(), templates: z.array(battleMapTemplateSchema).min(1) });

/** Tutorial tips (Q-48). A tip shows one time, when its trigger occurs. Text fields: {commodity}, {buyAt}, {sellAt}, {buy}, {sell}, {units}, {profit}, {profitSold}. */
export const tutorialTriggerSchema = z.enum(['sectorMap', 'location', 'market', 'bought', 'regionMap', 'sold', 'hail', 'combat', 'defeat']);
export const tutorialSchema = z.object({
  tips: z.array(
    z.object({
      id: z.string(),
      trigger: tutorialTriggerSchema,
      title: z.string(),
      lines: z.array(z.string()).min(1),
      /** Lines to show when there is no first-trade plan. */
      noPlanLines: z.array(z.string()).optional(),
    }),
  ),
});
export type TutorialTrigger = z.infer<typeof tutorialTriggerSchema>;
export type TutorialTip = z.infer<typeof tutorialSchema>['tips'][number];

/** Section 10.4 and Q-15, Q-17. */
export const encountersSchema = z.object({
  traderChance: prob,
  patrolChance: prob,
  patrolMinSecurity: z.number().int(),
  huntMultiplier: pos,
  /** Pirate chance x (1 + fleetFactor x (fleet size - 1)) (Section 11.9). */
  fleetFactor: nonNeg,
  fleeChance: prob,
  tributeShare: prob,
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
      /** Loadout id for NPC ships of this hull and for reports. A bought hull is empty (Q-14). */
      defaultLoadout: z.string(),
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
    /** Hit chance loss at full range for this weapon (default combat.rangePenalty); lasers are hitscan (Q-43). */
    rangePenalty: prob.optional(),
    vsShield: nonNeg.optional(),
    vsHull: nonNeg.optional(),
    armorPierce: nonNeg.optional(),
    heatPerShot: nonNeg.optional(),
    // Capacitor (Q-41): stored power for a later turn.
    capacitorCapacity: nonNeg.optional(),
    // Flak (Section 12.2): area side in cells and flat hit chance.
    area: z.number().int().positive().optional(),
    flatHitChance: prob.optional(),
    // Guided weapons (Section 12.4): ammunition and munition values.
    ammo: z.number().int().positive().optional(),
    /** Mechanic price of one round (M5-GUIDE-05). */
    ammoPrice: nonNeg.optional(),
    munitionSpeed: pos.optional(),
    munitionAgility: pos.optional(),
    munitionLife: z.number().int().positive().optional(),
    munitionHp: pos.optional(),
    // Point defense: shots per turn and hit chance of each shot.
    shotsPerTurn: z.number().int().positive().optional(),
    hitChance: prob.optional(),
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
        'capacitor',
        'thrusters',
        'laser',
        'ballistic',
        'guided',
        'pointDefense',
      ]),
      mainStats: z.array(z.string()),
      /** Icon until Claude Design adds one to data/art/modules.json (same fields as an art icon). */
      placeholderIcon: z.object({ family: z.string(), glyph: z.string(), fg: z.string() }).optional(),
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

// A location gets a service if it matches one clause of `where`. All conditions of a clause must match.
const serviceClauseSchema = z
  .object({
    kind: z.enum(['planet', 'station']).optional(),
    bodyType: z.array(z.string()).optional(),
    minTech: z.number().int().min(1).max(3).optional(),
    residentPopulation: z.boolean().optional(),
    minBaselineSecurity: nonNeg.optional(),
  })
  .strict();
export const servicesSchema = z.object({
  rules: z.object({
    /** Mechanic price per repaired point (Section 7.4). */
    mechanic: z.object({ hullPerPoint: nonNeg, armorPerPoint: nonNeg, enginePerPoint: nonNeg }),
    /** Outfitter sell price as a share of the module price (Q-13). */
    moduleSellShare: prob,
    /** Shipyard trade-in share of hull and module prices (Section 11.1). */
    tradeInShare: prob,
    /** Pirate Havens sell tiers up to maxTier at priceMult (Section 7.3). */
    /** Pirate Havens sell tiers up to maxTier at priceMult (Section 7.3); they buy all cargo at cargoBuyShare of the local sell price (Q-24). */
    pirateHaven: z.object({ bodyType: z.string(), maxTier: z.number().int().min(1).max(3), priceMult: pos, cargoBuyShare: prob }),
    /** Merchants' Guild live-price range (Section 9.12). */
    guildRangeJumps: z.number().int().nonnegative(),
    /** Days for the trend arrow (Section 9.12). */
    trendDays: z.number().int().positive(),
    /** Chain alerts (Sections 9.4, 14.4): producer output below lowOutputRatio; population stock below deficitDays of use. */
    alerts: z.object({ lowOutputRatio: prob, deficitDays: nonNeg }),
    /** Most days of one Wait (Section 8.8). */
    waitMaxDays: z.number().int().positive(),
    /** Clone Insurance (owner, 2026-10-28): premium = share x (hull price + module prices), by security level 0-4. */
    insurance: z.object({ premiumShare: z.array(prob).length(5) }),
  }),
  services: z.array(z.object({ id: z.string(), name: z.string(), where: z.array(serviceClauseSchema).min(1) })),
});

// Filled in later milestones (M5: encounters, templates, battleMaps; M7: events, contracts).
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
/** data/art/effects.json: generated from data/art/effects.yaml by tools/import-art.ts. M4 plays the frames. */
export const artEffectsSchema = z.object({
  source: z.string(),
  lineSets: z.record(z.string(), z.array(z.string()).length(4)),
  patterns: z.record(z.string(), z.array(z.array(z.union([z.number(), z.string()])))),
  travel: z.string(),
  queue: z.object({
    staggerMs: nonNeg,
    staggerMs5Plus: nonNeg,
    budgetMs: pos,
    scaleIfOver: z.boolean(),
    minFrameMs: nonNeg,
    skipKey: z.string(),
  }),
  colors: z.record(z.string(), color),
  effects: z.record(
    z.string(),
    z.object({
      totalMsAt18Cells: nonNeg,
      frames: z.array(z.record(z.string(), z.unknown())).min(1),
      persist: z.record(z.string(), z.unknown()).optional(),
      loop: z.boolean().optional(),
      static: z.boolean().optional(),
    }),
  ),
});
/** data/art/modules.json: Claude Design module icons (mark + 2 glyphs, then size and tier). */
export const artModulesSchema = z.object({
  icon: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), layout: z.string(), suffix: z.string() }),
  states: z.record(z.string(), z.object({ glyph, fg: z.string(), icon_fg: z.string().optional() })),
  family_colors: z.record(z.string(), color),
  families: z.record(z.string(), z.object({ mark: glyph, fg: z.string() })),
  modules: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      short: z.string(),
      family: z.string(),
      glyph: z.string(),
      fg: z.string(),
      default_size: z.enum(['S', 'M', 'L']),
    }),
  ),
});
