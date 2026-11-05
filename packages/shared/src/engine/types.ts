import type { Card, CardColor } from '../map/schema.js';
import type { RulesConfig } from '../rules/schema.js';

/** Card counts in a hand. Every card type has an entry. */
export type Hand = Record<Card, number>;
/** A set of cards, for payments. Missing entries mean zero. */
export type CardCounts = Partial<Record<Card, number>>;

export interface PlayerState {
  name: string;
  /** Player color id from the rules config. */
  color: string;
  hand: Hand;
  trains: number;
  stationsLeft: number;
  /** Tickets the player kept. Hidden from other players until the end. */
  tickets: string[];
  /** Tickets on offer, waiting for a keep choice. Hidden from other players. */
  offeredTickets: string[];
  routePoints: number;
  keptInitial: boolean;
}

export type TurnState =
  | { kind: 'await' }
  | { kind: 'secondDraw' }
  | { kind: 'choosingTickets' }
  | {
      kind: 'tunnel';
      routeId: string;
      /** Cards laid on the tunnel, held aside until the tunnel resolves. */
      payment: CardCounts;
      /** Color of the payment, or null when it was all locomotives. */
      color: CardColor | null;
      revealed: Card[];
      /** Extra cards the player must add. */
      extra: number;
    };

export interface StationState {
  player: number;
  cityId: string;
  /** The route this station lets its owner use for tickets, chosen when it was built (KTD8). */
  borrowRouteId: string;
}

export interface TicketResult {
  id: string;
  points: number;
  completed: boolean;
}

export interface PlayerResult {
  player: number;
  routePoints: number;
  tickets: TicketResult[];
  ticketPoints: number;
  completedTickets: number;
  stationsUnused: number;
  stationPoints: number;
  longestTrail: number;
  longestTrailBonus: number;
  total: number;
}

export interface GameResults {
  players: PlayerResult[];
  /** Player indices from first to last place. */
  ranking: number[];
  /** Players tied for first place after tie-breaks. */
  winners: number[];
}

export type GamePhase = 'initialTickets' | 'playing' | 'finished';

export interface GameState {
  rules: RulesConfig;
  mapId: string;
  players: PlayerState[];
  /** Draw pile; the top card is the last element. */
  drawPile: Card[];
  discard: Card[];
  market: (Card | null)[];
  /** Regular ticket deck; the top ticket is index 0. Kept-back tickets go to the end. */
  regularTickets: string[];
  routeOwners: Record<string, number>;
  stations: StationState[];
  phase: GamePhase;
  currentPlayer: number;
  turn: TurnState;
  turnNumber: number;
  lastRound: { triggeredBy: number; turnsLeft: number } | null;
  consecutivePasses: number;
  /** Seeded RNG state. Server-only. */
  rng: number;
  results: GameResults | null;
}

export type Action =
  | { type: 'keepInitialTickets'; ticketIds: string[] }
  | { type: 'drawBlind' }
  | { type: 'drawFaceUp'; slot: number }
  | { type: 'claimRoute'; routeId: string; payment: CardCounts }
  | { type: 'resolveTunnel'; extra: CardCounts }
  | { type: 'withdrawTunnel' }
  | { type: 'drawTickets' }
  | { type: 'keepTickets'; ticketIds: string[] }
  | { type: 'buildStation'; cityId: string; payment: CardCounts; borrowRouteId: string }
  | { type: 'pass' }
  /** Host-forced: resolves the target player's pending choice and ends their turn. */
  | { type: 'skip' };

export type ActionType = Action['type'];

/**
 * Something that happened, for animations and the event log. Fields in `secret` are only for
 * `player`; `eventsFor` strips them for everyone else (R3).
 */
export type GameEvent =
  | { type: 'turnStarted'; player: number }
  | { type: 'deckReshuffled' }
  | { type: 'marketReset'; discarded: Card[] }
  | { type: 'drewBlind'; player: number; secret?: { card: Card } }
  | { type: 'drewFaceUp'; player: number; card: Card; slot: number }
  | { type: 'claimedRoute'; player: number; routeId: string; payment: CardCounts }
  | { type: 'tunnelRevealed'; player: number; routeId: string; revealed: Card[]; extra: number }
  | { type: 'tunnelWithdrawn'; player: number; routeId: string }
  | { type: 'drewTickets'; player: number; count: number; secret?: { ticketIds: string[] } }
  | { type: 'keptTickets'; player: number; count: number; initial: boolean; secret?: { ticketIds: string[] } }
  | { type: 'builtStation'; player: number; cityId: string; borrowRouteId: string; payment: CardCounts }
  | { type: 'passed'; player: number }
  | { type: 'skipped'; player: number }
  | { type: 'lastRoundStarted'; player: number }
  | { type: 'gameFinished'; winners: number[] };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
