import { describe, expect, it } from 'vitest';
import {
  applyAction,
  boardOf,
  nextStationCost,
  routeClaimError,
  routePaymentOptions,
  stationCities,
  stationPaymentOptions,
  tunnelExtraOptions,
  type Action,
  type GameEvent,
  type RulesOverride,
} from '../../src/index.js';
import { act, newGame, type TestGame } from './helpers.js';

/** A simple scripted player: claim the longest affordable route, sometimes build a station, else draw. */
function chooseAction(game: TestGame, seen: Set<string>): Action {
  const { state, map } = game;
  const me = state.currentPlayer;
  const p = state.players[me]!;
  const turn = state.turn;
  if (turn.kind === 'tunnel') {
    const options = tunnelExtraOptions(turn.color, turn.extra, p.hand);
    return options[0] ? { type: 'resolveTunnel', extra: options[0] } : { type: 'withdrawTunnel' };
  }
  if (turn.kind === 'choosingTickets') return { type: 'keepTickets', ticketIds: [p.offeredTickets[0]!] };
  if (turn.kind === 'secondDraw') {
    if (state.drawPile.length + state.discard.length > 0) return { type: 'drawBlind' };
    const slot = state.market.findIndex((c) => c !== null && c !== 'locomotive');
    return { type: 'drawFaceUp', slot };
  }
  const board = boardOf(state);
  const claimable = map.map.routes
    .filter((r) => routeClaimError(board, map, r.id, me, p.trains) === null)
    .map((r) => ({ r, options: routePaymentOptions(r, p.hand, state.rules) }))
    .filter((x) => x.options.length > 0)
    .sort((a, b) => b.r.length - a.r.length);
  const cost = nextStationCost(state, p);
  if (cost !== null && state.turnNumber % 5 === 4) {
    const pay = stationPaymentOptions(cost, p.hand)[0];
    const city = stationCities(state, map, me)[0];
    if (pay && city) {
      const borrow = map.routesByCity.get(city)!.find((r) => state.routeOwners[r.id] !== me)!;
      seen.add('station');
      return { type: 'buildStation', cityId: city, payment: pay, borrowRouteId: borrow.id };
    }
  }
  const pick = claimable[0];
  if (pick) {
    if (pick.r.kind === 'tunnel') seen.add('tunnel');
    if (pick.r.kind === 'ferry') seen.add('ferry');
    return { type: 'claimRoute', routeId: pick.r.id, payment: pick.options[0]! };
  }
  if (state.drawPile.length + state.discard.length > 0) return { type: 'drawBlind' };
  const slot = state.market.findIndex((c) => c !== null);
  if (slot >= 0) return { type: 'drawFaceUp', slot };
  if (state.regularTickets.length > 0) return { type: 'drawTickets' };
  return { type: 'pass' };
}

function playToEnd(players: number, override: RulesOverride | undefined, seed: number) {
  const game = newGame(players, override, { seed });
  game.state.players.forEach((p, i) => act(game, i, { type: 'keepInitialTickets', ticketIds: [...p.offeredTickets] }));
  const seen = new Set<string>();
  const events: GameEvent[] = [];
  for (let step = 0; step < 5000 && game.state.phase !== 'finished'; step++) {
    const action = chooseAction(game, seen);
    const result = applyAction(game.state, game.map, game.state.currentPlayer, action);
    if (!result.ok) throw new Error(`step ${step}: ${action.type} failed: ${result.error}`);
    game.state = result.state;
    events.push(...result.events);
  }
  return { game, seen, events };
}

describe('scripted full game on the tiny map', () => {
  it('reaches Finished with all expansion rules on, using tunnels, ferries and stations', () => {
    const seen = new Set<string>();
    let finished = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = playToEnd(3, { trainsPerPlayer: 14 }, seed);
      run.seen.forEach((s) => seen.add(s));
      expect(run.game.state.phase).toBe('finished');
      const results = run.game.state.results!;
      for (const r of results.players) {
        expect(r.total).toBe(r.routePoints + r.ticketPoints + r.stationPoints + r.longestTrailBonus);
      }
      expect(run.events.at(-1)).toMatchObject({ type: 'gameFinished', winners: results.winners });
      finished += 1;
    }
    expect(finished).toBe(5);
    expect(seen).toEqual(new Set(['tunnel', 'ferry', 'station']));
  });

  it('reaches Finished with 7 players and every expansion off', () => {
    const run = playToEnd(7, { trainsPerPlayer: 8, expansions: { tunnels: false, ferries: false, stations: false, longTickets: false } }, 11);
    expect(run.game.state.phase).toBe('finished');
    expect(run.game.state.results!.players).toHaveLength(7);
    expect(run.game.state.results!.players.every((p) => p.stationPoints === 0)).toBe(true);
  });

  it('keeps the card count constant through a whole game', () => {
    const run = playToEnd(4, { trainsPerPlayer: 12 }, 21);
    const s = run.game.state;
    const inHands = s.players.reduce((n, p) => n + Object.values(p.hand).reduce((a, b) => a + b, 0), 0);
    const market = s.market.filter((c) => c !== null).length;
    expect(inHands + market + s.drawPile.length + s.discard.length).toBe(110);
  });
});
