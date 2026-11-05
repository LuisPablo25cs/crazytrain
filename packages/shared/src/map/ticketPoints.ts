import { shortestTrainDistances, type MapIndex } from './graph.js';

/**
 * Suggested ticket value: the shortest path between the two cities, in trains.
 * Map authors use it as a starting point and tune it after playtests.
 */
export function suggestTicketPoints(index: MapIndex, from: string, to: string): number | null {
  const d = shortestTrainDistances(index, from).get(to);
  return d === undefined ? null : d;
}
