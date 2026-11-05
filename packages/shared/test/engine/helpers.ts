import { expect } from 'vitest';
import {
  applyAction,
  createGame,
  emptyHand,
  indexMap,
  MapSchema,
  resolveRules,
  type Action,
  type CardCounts,
  type GameEvent,
  type GameState,
  type MapIndex,
  type RulesOverride,
} from '../../src/index.js';
import { looseTiny, tinyIndex, type LooseMap } from '../helpers.js';

export const NAMES = ['Ana', 'Beto', 'Caro', 'Dani', 'Eli', 'Fer', 'Gabo'];

export interface TestGame {
  state: GameState;
  map: MapIndex;
  events: GameEvent[];
}

export function newGame(players: number, override?: RulesOverride, opts: { seed?: number; map?: MapIndex } = {}): TestGame {
  const map = opts.map ?? tinyIndex();
  const rules = resolveRules(override);
  const { state, events } = createGame({
    map,
    rules,
    players: NAMES.slice(0, players).map((name, i) => ({ name, color: rules.playerColors[i]! })),
    seed: opts.seed ?? 42,
  });
  return { state, map, events };
}

/** Build a map index from a modified tiny fixture. */
export function tinyVariant(edit: (map: LooseMap) => void): MapIndex {
  const loose = looseTiny();
  edit(loose);
  return indexMap(MapSchema.parse(loose));
}

/** Apply an action that must succeed. */
export function act(game: TestGame, player: number, action: Action): GameEvent[] {
  const result = applyAction(game.state, game.map, player, action);
  if (!result.ok) throw new Error(`expected ${action.type} by ${player} to succeed: ${result.error}`);
  game.state = result.state;
  return result.events;
}

/** Apply an action that must fail; returns the error and checks the state did not change. */
export function reject(game: TestGame, player: number, action: Action): string {
  const before = JSON.stringify(game.state);
  const result = applyAction(game.state, game.map, player, action);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(game.state)).toBe(before);
  return result.ok ? '' : result.error;
}

/** Every player keeps all offered initial tickets; the game moves to the playing phase. */
export function startPlaying(game: TestGame): void {
  game.state.players.forEach((p, i) => {
    act(game, i, { type: 'keepInitialTickets', ticketIds: [...p.offeredTickets] });
  });
  expect(game.state.phase).toBe('playing');
}

/** Start a playing game where it is `player`'s turn. */
export function playingGame(players: number, override?: RulesOverride, opts: { seed?: number; map?: MapIndex } = {}): TestGame {
  const game = newGame(players, override, opts);
  startPlaying(game);
  game.state.currentPlayer = 0;
  return game;
}

export function setHand(game: TestGame, player: number, cards: CardCounts): void {
  game.state.players[player]!.hand = { ...emptyHand(), ...cards };
}

/** Put cards on top of the draw pile; the first card listed is drawn first. */
export function stackDeck(game: TestGame, cards: GameState['drawPile']): void {
  game.state.drawPile.push(...[...cards].reverse());
}
