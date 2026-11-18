import { z } from 'zod';

const int = () => z.number().int();

export const ExpansionTogglesSchema = z.object({
  tunnels: z.boolean(),
  ferries: z.boolean(),
  stations: z.boolean(),
  longTickets: z.boolean(),
});
export type ExpansionToggles = z.infer<typeof ExpansionTogglesSchema>;
export type ExpansionName = keyof ExpansionToggles;
export const EXPANSION_NAMES: ExpansionName[] = ['tunnels', 'ferries', 'stations', 'longTickets'];

export const GAME_MODES = ['classic', 'seasons'] as const;
export const GameModeSchema = z.enum(GAME_MODES);
export type GameMode = z.infer<typeof GameModeSchema>;

/**
 * Double routes in the lobby: `rule` keeps the map's lane table (the board game: one lane with 2–3
 * players, both with 4+); `both` opens every lane at any player count.
 */
export const DOUBLE_ROUTE_CHOICES = ['rule', 'both'] as const;
export const DoubleRoutesSchema = z.enum(DOUBLE_ROUTE_CHOICES);
export type DoubleRoutes = z.infer<typeof DoubleRoutesSchema>;

const month = () => int().min(0).max(11);
const months = () => z.array(month());
const share = () => z.number().min(0).max(1);

/**
 * Seasons mode settings: the calendar and the natural disasters. Months are 0 (January) to 11.
 * Radii are in map units (the map is usually 1000 wide).
 */
export const SeasonsSchema = z.object({
  /** Game length in years. Each round (every player takes a turn) is one month. */
  years: int().min(1).max(10),
  /** Chance each month that a disaster strikes somewhere. */
  disasterChance: share(),
  /** How much more often a "high" city is picked than a "medium" one. */
  weights: z.object({ high: z.number().min(0), medium: z.number().min(0) }),
  /** Excavator cards shuffled into the train deck. */
  excavatorCards: int().min(0),
  /** Months to repair a damaged route before it is lost. */
  repairMonths: int().min(1),
  earthquake: z.object({
    months: months(),
    radius: z.number().positive(),
    /** Repair cost by route length: entry 0 is for length 1. Longer routes use the last entry. */
    repairCost: z.array(int().min(0)).min(1),
    tunnelFactor: z.number().min(1),
  }),
  hurricane: z.object({
    months: months(),
    radius: z.number().positive(),
    /** One more piece breaks this often (months). */
    spreadEvery: int().min(1),
    /** Months that building inside the hurricane's circle needs excavators. */
    zoneMonths: int().min(0),
    excavators: int().min(0),
  }),
  volcano: z.object({ months: months(), radius: z.number().positive(), blockMonths: int().min(1) }),
  tornado: z.object({
    months: months(),
    radius: z.number().positive(),
    /** How far from the city the tornado can touch down. */
    drift: z.number().min(0),
    /** Chance that each train piece inside the circle flies off. */
    pieceChance: share(),
    zoneMonths: int().min(0),
    /** Building inside the circle needs one excavator per this many route length (rounded up). */
    lengthPerExcavator: int().min(1),
  }),
  tsunami: z.object({
    months: months(),
    radius: z.number().positive(),
    /** Repairing needs one excavator per this many washed-away pieces (rounded up). */
    piecesPerExcavator: int().min(1),
  }),
  snow: z.object({
    /** Cities this far north (degrees latitude) or more with a "high" rating get the long winter. */
    northLatitude: z.number(),
    longWinter: months(),
    winter: months(),
    /** Winter for "medium" cities. */
    shortWinter: months(),
  }),
});
export type SeasonsConfig = z.infer<typeof SeasonsSchema>;

/** One row of the parallel-lane table: at `minPlayers` or more, `lanes` lanes of a group can be claimed. */
export const ParallelLaneRuleSchema = z.object({
  minPlayers: int().min(1),
  lanes: int().min(1),
});

export const RulesConfigSchema = z
  .object({
    players: z.object({ min: int().min(1), max: int().min(1) }),
    playerColors: z.array(z.string().min(1)).min(1),
    trainsPerPlayer: int().min(1),
    stationsPerPlayer: int().min(0),
    stationValue: int().min(0),
    stationCosts: z.array(int().min(1)),
    deck: z.object({ perColor: int().min(0), locomotives: int().min(0) }),
    startingHand: int().min(0),
    market: z.object({
      size: int().min(1),
      /** The market is discarded and redealt when this many locomotives show. */
      maxLocomotives: int().min(1),
      /** Redeals in a row before the market is left as dealt (avoids endless loops). */
      maxResets: int().min(0),
    }),
    tickets: z.object({
      initialRegular: int().min(0),
      initialLong: int().min(0),
      initialKeepMin: int().min(0),
      drawCount: int().min(1),
      drawKeepMin: int().min(1),
    }),
    /** Points per route length, keyed by length ("1", "2", ...). */
    routeScoring: z.record(z.string().regex(/^\d+$/), int()),
    longestTrailBonus: int().min(0),
    lastRoundTrainThreshold: int().min(0),
    parallelLanes: z.array(ParallelLaneRuleSchema).min(1),
    tunnelRevealCount: int().min(0),
    expansions: ExpansionTogglesSchema,
    mode: GameModeSchema,
    seasons: SeasonsSchema,
  })
  .superRefine((rules, ctx) => {
    if (rules.players.min > rules.players.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['players'],
        message: `players.min (${rules.players.min}) is above players.max (${rules.players.max})`,
      });
    }
    if (rules.playerColors.length < rules.players.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['playerColors'],
        message: `needs at least ${rules.players.max} player colors, has ${rules.playerColors.length}`,
      });
    }
    if (rules.stationCosts.length < rules.stationsPerPlayer) {
      ctx.addIssue({
        code: 'custom',
        path: ['stationCosts'],
        message: `needs one cost per station (${rules.stationsPerPlayer}), has ${rules.stationCosts.length}`,
      });
    }
  });

export type RulesConfig = z.infer<typeof RulesConfigSchema>;

/** A partial rules config, used by map files to override defaults. Nested objects are partial too. */
export const RulesOverrideSchema = z
  .object({
    players: z.object({ min: int().min(1), max: int().min(1) }).partial(),
    playerColors: z.array(z.string().min(1)).min(1),
    trainsPerPlayer: int().min(1),
    stationsPerPlayer: int().min(0),
    stationValue: int().min(0),
    stationCosts: z.array(int().min(1)),
    deck: z.object({ perColor: int().min(0), locomotives: int().min(0) }).partial(),
    startingHand: int().min(0),
    market: z
      .object({ size: int().min(1), maxLocomotives: int().min(1), maxResets: int().min(0) })
      .partial(),
    tickets: z
      .object({
        initialRegular: int().min(0),
        initialLong: int().min(0),
        initialKeepMin: int().min(0),
        drawCount: int().min(1),
        drawKeepMin: int().min(1),
      })
      .partial(),
    routeScoring: z.record(z.string().regex(/^\d+$/), int()),
    longestTrailBonus: int().min(0),
    lastRoundTrainThreshold: int().min(0),
    parallelLanes: z.array(ParallelLaneRuleSchema).min(1),
    tunnelRevealCount: int().min(0),
    expansions: ExpansionTogglesSchema.partial(),
    mode: GameModeSchema,
    /** Checked in full after merging with the defaults. */
    seasons: z.record(z.string(), z.unknown()),
  })
  .partial();

export type RulesOverride = z.infer<typeof RulesOverrideSchema>;
