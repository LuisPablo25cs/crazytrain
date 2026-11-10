import { LOCOMOTIVE } from '../map/schema.js';
import type { MapIndex } from '../map/graph.js';
import { cardsAvailable } from './cards.js';
import { repairPaymentOptions, routePaymentOptions, stationPaymentOptions } from './payments.js';
import { routeClaimError, routeStatus, type BoardShape } from './routes.js';
import { effectiveRoute, excavatorsNeeded, repairCost, repairError } from './seasons.js';
import type { GameState, PlayerState } from './types.js';

export function boardOf(state: GameState): BoardShape {
  return {
    rules: state.rules,
    routeOwners: state.routeOwners,
    playerCount: state.players.length,
    month: state.month,
    zones: state.zones,
    damage: state.damage,
    blocked: state.blocked,
    abandoned: state.abandoned,
    recolored: state.recolored,
  };
}

/** Cost of the player's next station, or null when they have none left. */
export function nextStationCost(state: Pick<GameState, 'rules'>, player: Pick<PlayerState, 'stationsLeft'>): number | null {
  if (!state.rules.expansions.stations || player.stationsLeft <= 0) return null;
  const built = state.rules.stationsPerPlayer - player.stationsLeft;
  return state.rules.stationCosts[built] ?? null;
}

export function canDrawSecondCard(state: GameState): boolean {
  return cardsAvailable(state) > 0 || state.market.some((c) => c !== null && c !== LOCOMOTIVE);
}

/** Cities where `player` could place a station: no station yet, and a route they do not own touches it. */
export function stationCities(state: GameState, map: MapIndex, player: number): string[] {
  const taken = new Set(state.stations.map((s) => s.cityId));
  return map.map.cities
    .filter((c) => !taken.has(c.id))
    .filter((c) => (map.routesByCity.get(c.id) ?? []).some((r) => state.routeOwners[r.id] !== player))
    .map((c) => c.id);
}

/** Whether the player has any legal action besides `pass` at the start of their turn. */
export function hasLegalNonPassAction(state: GameState, map: MapIndex, player: number): boolean {
  const p = state.players[player]!;
  if (cardsAvailable(state) > 0 || state.market.some((c) => c !== null)) return true;
  if (state.regularTickets.length > 0) return true;
  const board = boardOf(state);
  for (const base of map.map.routes) {
    const route = effectiveRoute(board, map, base.id)!;
    if (routeClaimError(board, map, route.id, player, p.trains) === null) {
      if (routePaymentOptions(route, p.hand, state.rules, excavatorsNeeded(board, map, route)).length > 0) return true;
    }
    if (repairError(board, map, route.id, player, p.trains) === null && routeStatus(board, map, route.id, player).kind !== 'closed') {
      const cost = repairCost(board, map, route.id);
      if (cost && repairPaymentOptions(route, cost, p.hand, state.rules).length > 0) return true;
    }
  }
  const cost = nextStationCost(state, p);
  if (cost !== null && stationPaymentOptions(cost, p.hand).length > 0 && stationCities(state, map, player).length > 0) {
    return true;
  }
  return false;
}
