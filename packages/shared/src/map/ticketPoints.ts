import { shortestTrainDistances, type MapIndex } from './graph.js';

/**
 * Suggested ticket value: the shortest path between the two cities, in trains.
 * Map authors use it as a starting point and tune it after playtests.
 */
export function suggestTicketPoints(index: MapIndex, from: string, to: string, via?: string): number | null {
  const fromTo = shortestTrainDistances(index, from).get(to);
  if (fromTo === undefined) return null;
  if (!via) return fromTo;
  // A triple ticket needs a network joining all three: the two shortest of the three gaps.
  const fromVia = shortestTrainDistances(index, from).get(via);
  const viaTo = shortestTrainDistances(index, via).get(to);
  if (fromVia === undefined || viaTo === undefined) return null;
  return fromTo + fromVia + viaTo - Math.max(fromTo, fromVia, viaTo);
}
