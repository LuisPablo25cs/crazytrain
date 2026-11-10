import type { RulesConfig } from './schema.js';

const ALL_MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Default rules: Ticket to Ride USA base values plus the Europe expansion rules. Rebalance after the MVP. */
export const DEFAULT_RULES: RulesConfig = {
  players: { min: 2, max: 7 },
  playerColors: ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'white'],
  trainsPerPlayer: 45,
  stationsPerPlayer: 3,
  stationValue: 4,
  stationCosts: [1, 2, 3],
  deck: { perColor: 12, locomotives: 14 },
  startingHand: 4,
  market: { size: 5, maxLocomotives: 3, maxResets: 3 },
  tickets: {
    initialRegular: 3,
    initialLong: 1,
    initialKeepMin: 2,
    drawCount: 3,
    drawKeepMin: 1,
  },
  // 9 and 10 are placeholders for the rebalance pass; the starter map has no routes that long.
  routeScoring: { '1': 1, '2': 2, '3': 4, '4': 7, '5': 10, '6': 15, '7': 18, '8': 21, '9': 27, '10': 32 },
  longestTrailBonus: 10,
  lastRoundTrainThreshold: 2,
  parallelLanes: [
    { minPlayers: 1, lanes: 1 },
    { minPlayers: 4, lanes: 99 },
  ],
  tunnelRevealCount: 3,
  expansions: { tunnels: true, ferries: true, stations: true, longTickets: true },
  mode: 'classic',
  seasons: {
    years: 3,
    disasterChance: 0.35,
    weights: { high: 3, medium: 1 },
    excavatorCards: 4,
    repairMonths: 12,
    earthquake: { months: ALL_MONTHS, radius: 90, repairCost: [1, 1, 2, 2, 3, 3, 4], tunnelFactor: 1.5 },
    hurricane: { months: [5, 6, 7, 8, 9, 10], radius: 110, spreadEvery: 3, zoneMonths: 12, excavators: 1 },
    volcano: { months: ALL_MONTHS, radius: 80, blockMonths: 12 },
    tornado: { months: [2, 3, 4, 5], radius: 45, drift: 40, pieceChance: 0.33, zoneMonths: 1, lengthPerExcavator: 3 },
    tsunami: { months: ALL_MONTHS, radius: 100, piecesPerExcavator: 2 },
    snow: { northLatitude: 50, longWinter: [10, 11, 0, 1, 2], winter: [11, 0, 1], shortWinter: [0] },
  },
};
