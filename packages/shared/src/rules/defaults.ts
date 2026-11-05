import type { RulesConfig } from './schema.js';

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
};
