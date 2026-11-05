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
  })
  .partial();

export type RulesOverride = z.infer<typeof RulesOverrideSchema>;
