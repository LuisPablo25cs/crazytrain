import type { MapIndex } from '../map/graph.js';
import { openLanes } from '../rules/resolve.js';
import type { RulesConfig } from '../rules/schema.js';

/** The parts of a game (full state or a player view) that decide route availability. */
export interface BoardShape {
  rules: RulesConfig;
  routeOwners: Record<string, number>;
  playerCount: number;
}

export type RouteStatus =
  | { kind: 'owned'; owner: number }
  /** Closed for everyone: enough lanes of its group are taken for this player count (R7). */
  | { kind: 'closed' }
  /** Free in general, but this player already owns another lane of the group (R7). */
  | { kind: 'blockedForYou' }
  | { kind: 'free' };

export function routeStatus(board: BoardShape, map: MapIndex, routeId: string, viewer: number | null): RouteStatus {
  const owner = board.routeOwners[routeId];
  if (owner !== undefined) return { kind: 'owned', owner };
  const route = map.routes.get(routeId);
  if (!route?.parallelGroup) return { kind: 'free' };
  const lanes = map.groups.get(route.parallelGroup) ?? [];
  const owners = lanes.map((l) => board.routeOwners[l.id]).filter((o): o is number => o !== undefined);
  if (owners.length >= openLanes(board.rules, board.playerCount)) return { kind: 'closed' };
  if (viewer !== null && owners.includes(viewer)) return { kind: 'blockedForYou' };
  return { kind: 'free' };
}

/** Why `player` cannot claim the route right now (ignoring cards), or null when they can. */
export function routeClaimError(
  board: BoardShape,
  map: MapIndex,
  routeId: string,
  player: number,
  trainsLeft: number,
): string | null {
  const route = map.routes.get(routeId);
  if (!route) return `unknown route "${routeId}"`;
  const status = routeStatus(board, map, routeId, player);
  switch (status.kind) {
    case 'owned':
      return 'this route is already claimed';
    case 'closed':
      return `only ${openLanes(board.rules, board.playerCount)} lane(s) of this route can be used with ${board.playerCount} players`;
    case 'blockedForYou':
      return 'you already own a lane of this route';
    case 'free':
      break;
  }
  if (trainsLeft < route.length) return `you have ${trainsLeft} trains left, this route needs ${route.length}`;
  return null;
}
