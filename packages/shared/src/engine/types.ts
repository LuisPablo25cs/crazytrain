import type { Card, CardColor, Hazard } from '../map/schema.js';
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

/** Disasters that strike at random. Snow is a season instead. */
export type DisasterKind = Exclude<Hazard, 'snow'>;
export const DISASTER_KINDS: readonly DisasterKind[] = ['earthquake', 'volcano', 'tsunami', 'hurricane', 'tornado'];

/** The area a disaster hit, kept while it still matters (building needs excavators, or for the board). */
export interface DisasterZone {
  id: number;
  kind: DisasterKind;
  cityId: string;
  x: number;
  y: number;
  radius: number;
  /** Month it struck, and the month it stops mattering (exclusive). */
  from: number;
  until: number;
}

/** A built route that needs repair. While damaged it does not connect cities (Seasons mode). */
export interface RouteDamage {
  cause: 'earthquake' | 'hurricane' | 'tornado' | 'tsunami';
  since: number;
  /** Month the owner loses the route if it is still not repaired. */
  deadline: number;
  /** Indexes of the broken train pieces, from the route's `from` end. */
  broken: number[];
}

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
  /** Seasons mode. Months since the game started: 0 is January of year 1. */
  month: number;
  /** Who started the first round; a new month begins each time play comes back to them. */
  firstPlayer: number;
  zones: DisasterZone[];
  nextZoneId: number;
  damage: Record<string, RouteDamage>;
  /** Routes under volcanic ash, until the given month (exclusive). They turn gray afterwards. */
  blocked: Record<string, number>;
  /** Routes an earthquake took from their owner: anyone may claim one by paying this repair cost. */
  abandoned: Record<string, number>;
  /** Routes a volcano turned gray. */
  recolored: Record<string, 'gray'>;
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
  /** Seasons mode: repair a damaged route you own, or claim an abandoned one by repairing it. */
  | { type: 'repairRoute'; routeId: string; payment: CardCounts }
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
  | { type: 'monthStarted'; month: number }
  | {
      type: 'disaster';
      kind: DisasterKind;
      cityId: string;
      x: number;
      y: number;
      radius: number;
      /** Built routes that now need repair. */
      damaged: string[];
      /** Built routes their owners lost at once (a tsunami washed all of it away). */
      lost: string[];
      /** Routes under volcanic ash. */
      blocked: string[];
    }
  | { type: 'damageSpread'; player: number; routeId: string; broken: number }
  | { type: 'routeRepaired'; player: number; routeId: string; payment: CardCounts; claimed: boolean }
  /** `reason`: damage not repaired in time, fully broken or washed away, or the ash settled. */
  | { type: 'routeLost'; player: number; routeId: string; reason: 'deadline' | 'destroyed' | 'volcano'; claimable: boolean }
  | { type: 'routeGrayed'; routeId: string }
  | { type: 'gameFinished'; winners: number[] };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
