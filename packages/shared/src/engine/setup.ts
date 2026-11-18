import type { MapIndex } from '../map/graph.js';
import type { RulesConfig } from '../rules/schema.js';
import { buildDeck, drawCard, emptyHand, refillMarket } from './cards.js';
import { randomInt, shuffle } from './rng.js';
import type { GameEvent, GameState, PlayerState } from './types.js';

export interface NewPlayer {
  name: string;
  color: string;
}

export interface CreateGameOptions {
  map: MapIndex;
  rules: RulesConfig;
  players: NewPlayer[];
  /** Any 32-bit integer. The same seed and actions give the same game. */
  seed: number;
}

export class GameSetupError extends Error {}

export function createGame({ map, rules, players, seed }: CreateGameOptions): { state: GameState; events: GameEvent[] } {
  const { min, max } = rules.players;
  if (players.length < min || players.length > max) {
    throw new GameSetupError(`this game needs ${min} to ${max} players, not ${players.length}`);
  }
  const events: GameEvent[] = [];
  const holder = { rng: seed >>> 0 };
  // One ticket deck: with triple tickets on, they are shuffled in with the others and come up at
  // random, at the start and on every draw. The deal size keeps its extra ticket per player.
  const triples = rules.expansions.longTickets;
  const deck = shuffle(
    holder,
    map.map.tickets.filter((t) => t.deck === 'regular' || (triples && t.deck === 'long')).map((t) => t.id),
  );
  const dealt = rules.tickets.initialRegular + (triples ? rules.tickets.initialLong : 0);

  const state: GameState = {
    rules,
    mapId: map.map.id,
    players: [],
    drawPile: shuffle(holder, buildDeck(rules)),
    discard: [],
    market: Array.from({ length: rules.market.size }, () => null),
    regularTickets: deck,
    routeOwners: {},
    stations: [],
    phase: 'initialTickets',
    currentPlayer: 0,
    turn: { kind: 'await' },
    turnNumber: 0,
    lastRound: null,
    consecutivePasses: 0,
    rng: holder.rng,
    results: null,
    month: 0,
    firstPlayer: 0,
    zones: [],
    nextZoneId: 1,
    damage: {},
    blocked: {},
    abandoned: {},
    recolored: {},
  };

  state.players = players.map((p): PlayerState => {
    const hand = emptyHand();
    for (let i = 0; i < rules.startingHand; i++) {
      const card = drawCard(state, events);
      if (card) hand[card] += 1;
    }
    const offered = state.regularTickets.splice(0, dealt);
    return {
      name: p.name,
      color: p.color,
      hand,
      trains: rules.trainsPerPlayer,
      stationsLeft: rules.expansions.stations ? rules.stationsPerPlayer : 0,
      tickets: [],
      offeredTickets: offered,
      routePoints: 0,
      keptInitial: offered.length === 0,
    };
  });
  // Long tickets that were not dealt leave the game (R11).
  refillMarket(state, events);
  state.currentPlayer = randomInt(state, players.length);
  state.firstPlayer = state.currentPlayer;
  if (state.players.every((p) => p.keptInitial)) {
    state.phase = 'playing';
    events.push({ type: 'turnStarted', player: state.currentPlayer });
  }
  return { state, events };
}
