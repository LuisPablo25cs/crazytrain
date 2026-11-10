import type { Card } from '../map/schema.js';
import type { RulesConfig } from '../rules/schema.js';
import { handSize } from './cards.js';
import type {
  GameEvent,
  GamePhase,
  GameResults,
  GameState,
  Hand,
  DisasterZone,
  RouteDamage,
  StationState,
  TurnState,
} from './types.js';

/** What every player may see about a player (R3). */
export interface PublicPlayer {
  index: number;
  name: string;
  color: string;
  trains: number;
  stationsLeft: number;
  handCount: number;
  ticketCount: number;
  offeredTicketCount: number;
  routePoints: number;
  keptInitial: boolean;
}

/** What only the viewing player may see. */
export interface PrivatePlayer {
  index: number;
  hand: Hand;
  tickets: string[];
  offeredTickets: string[];
}

/** One player's view of the game. The only shape of game state that crosses the network (KTD3). */
export interface GameView {
  mapId: string;
  rules: RulesConfig;
  phase: GamePhase;
  currentPlayer: number;
  turn: TurnState;
  turnNumber: number;
  lastRound: GameState['lastRound'];
  players: PublicPlayer[];
  me: PrivatePlayer | null;
  market: (Card | null)[];
  drawPileCount: number;
  discardCount: number;
  ticketDeckCount: number;
  routeOwners: Record<string, number>;
  stations: StationState[];
  /** Present only when the game is finished; reveals every ticket. */
  results: GameResults | null;
  /** Seasons mode (all public): the calendar and what disasters left behind. */
  month: number;
  zones: DisasterZone[];
  damage: Record<string, RouteDamage>;
  blocked: Record<string, number>;
  abandoned: Record<string, number>;
  recolored: Record<string, 'gray'>;
}

/**
 * Project the full state for one viewer. Field policy:
 * - public: board, market, counts, scores, tunnel reveals and held payments;
 * - owner-only: hand, kept tickets, offered tickets;
 * - server-only: draw pile order, ticket deck order, RNG state.
 */
export function viewFor(state: GameState, viewer: number | null): GameView {
  const me =
    viewer !== null && state.players[viewer]
      ? {
          index: viewer,
          hand: { ...state.players[viewer].hand },
          tickets: [...state.players[viewer].tickets],
          offeredTickets: [...state.players[viewer].offeredTickets],
        }
      : null;
  return {
    mapId: state.mapId,
    rules: state.rules,
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    turn: structuredClone(state.turn),
    turnNumber: state.turnNumber,
    lastRound: state.lastRound ? { ...state.lastRound } : null,
    players: state.players.map((p, index) => ({
      index,
      name: p.name,
      color: p.color,
      trains: p.trains,
      stationsLeft: p.stationsLeft,
      handCount: handSize(p.hand),
      ticketCount: p.tickets.length,
      offeredTicketCount: p.offeredTickets.length,
      routePoints: p.routePoints,
      keptInitial: p.keptInitial,
    })),
    me,
    market: [...state.market],
    drawPileCount: state.drawPile.length,
    discardCount: state.discard.length,
    ticketDeckCount: state.regularTickets.length,
    routeOwners: { ...state.routeOwners },
    stations: state.stations.map((s) => ({ ...s })),
    results: state.results ? structuredClone(state.results) : null,
    month: state.month,
    zones: structuredClone(state.zones),
    damage: structuredClone(state.damage),
    blocked: { ...state.blocked },
    abandoned: { ...state.abandoned },
    recolored: { ...state.recolored },
  };
}

/** Project events for one viewer: `secret` fields stay only on the acting player's own events. */
export function eventsFor(events: GameEvent[], viewer: number | null): GameEvent[] {
  return events.map((e) => {
    if (!('secret' in e)) return e;
    if ('player' in e && e.player === viewer) return e;
    const { secret: _secret, ...rest } = e;
    return rest as GameEvent;
  });
}
