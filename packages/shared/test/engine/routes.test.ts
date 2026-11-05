import { describe, expect, it } from 'vitest';
import { routePaymentOptions } from '../../src/index.js';
import { act, playingGame, reject, setHand } from './helpers.js';

describe('claiming routes', () => {
  it('claims a yellow length-3 route with 2 yellow and 1 locomotive', () => {
    const game = playingGame(3);
    setHand(game, 0, { yellow: 2, locomotive: 1, red: 1 });
    const discardBefore = game.state.discard.length;
    const events = act(game, 0, { type: 'claimRoute', routeId: 'delta-echo', payment: { yellow: 2, locomotive: 1 } });
    const p = game.state.players[0]!;
    expect(p.trains).toBe(42);
    expect(p.routePoints).toBe(4);
    expect(p.hand).toMatchObject({ yellow: 0, locomotive: 0, red: 1 });
    expect(game.state.routeOwners['delta-echo']).toBe(0);
    expect(game.state.discard.length).toBe(discardBefore + 3);
    expect(events[0]).toMatchObject({ type: 'claimedRoute', player: 0, routeId: 'delta-echo' });
    expect(game.state.currentPlayer).toBe(1);
  });

  it('rejects mixed colors on a gray route', () => {
    const game = playingGame(3);
    setHand(game, 0, { red: 2, blue: 1 });
    expect(reject(game, 0, { type: 'claimRoute', routeId: 'bravo-charlie', payment: { red: 2, blue: 1 } })).toMatch(/one color/);
  });

  it('rejects the wrong color on a colored route', () => {
    const game = playingGame(3);
    setHand(game, 0, { blue: 3 });
    expect(reject(game, 0, { type: 'claimRoute', routeId: 'delta-echo', payment: { blue: 3 } })).toMatch(/yellow/);
  });

  it('rejects a claim with fewer trains left than the route length', () => {
    const game = playingGame(3);
    setHand(game, 0, { yellow: 3 });
    game.state.players[0]!.trains = 2;
    expect(reject(game, 0, { type: 'claimRoute', routeId: 'delta-echo', payment: { yellow: 3 } })).toMatch(/trains left/);
  });

  it('rejects cards the player does not have and an owned route', () => {
    const game = playingGame(3);
    setHand(game, 0, { yellow: 1 });
    expect(reject(game, 0, { type: 'claimRoute', routeId: 'delta-echo', payment: { yellow: 3 } })).toMatch(/do not have/);
    game.state.routeOwners['delta-echo'] = 2;
    setHand(game, 0, { yellow: 3 });
    expect(reject(game, 0, { type: 'claimRoute', routeId: 'delta-echo', payment: { yellow: 3 } })).toMatch(/already claimed/);
  });

  it('Covers AE1. keeps the second lane closed in a 3-player game', () => {
    const game = playingGame(3);
    setHand(game, 0, { red: 2 });
    setHand(game, 1, { blue: 2 });
    act(game, 0, { type: 'claimRoute', routeId: 'alpha-bravo-1', payment: { red: 2 } });
    expect(reject(game, 1, { type: 'claimRoute', routeId: 'alpha-bravo-2', payment: { blue: 2 } })).toMatch(/lane/);
  });

  it('Covers AE2. opens the second lane in a 5-player game, but not for the same player', () => {
    const game = playingGame(5);
    setHand(game, 0, { red: 2, blue: 2 });
    setHand(game, 1, { blue: 2 });
    act(game, 0, { type: 'claimRoute', routeId: 'alpha-bravo-1', payment: { red: 2 } });
    game.state.currentPlayer = 0;
    expect(reject(game, 0, { type: 'claimRoute', routeId: 'alpha-bravo-2', payment: { blue: 2 } })).toMatch(/already own a lane/);
    game.state.currentPlayer = 1;
    act(game, 1, { type: 'claimRoute', routeId: 'alpha-bravo-2', payment: { blue: 2 } });
    expect(game.state.routeOwners['alpha-bravo-2']).toBe(1);
  });

  it('lets three players claim the three lanes of a triple route with 7 players', () => {
    const game = playingGame(7, {
      parallelLanes: [
        { minPlayers: 1, lanes: 1 },
        { minPlayers: 4, lanes: 2 },
        { minPlayers: 6, lanes: 3 },
      ],
    });
    for (const [player, lane] of [[0, 1], [1, 2], [2, 3]] as const) {
      setHand(game, player, { green: 2 });
      act(game, player, { type: 'claimRoute', routeId: `bravo-echo-${lane}`, payment: { green: 2 } });
    }
    expect(game.state.routeOwners).toMatchObject({ 'bravo-echo-1': 0, 'bravo-echo-2': 1, 'bravo-echo-3': 2 });
  });
});

describe('routePaymentOptions', () => {
  it('lists every color and locomotive split for a gray route', () => {
    const game = playingGame(3);
    const route = game.map.routes.get('bravo-charlie')!;
    const hand = { ...game.state.players[0]!.hand, red: 3, blue: 2, locomotive: 1 };
    for (const c of ['orange', 'yellow', 'green', 'purple', 'black', 'white'] as const) hand[c] = 0;
    expect(routePaymentOptions(route, hand, game.state.rules)).toEqual([
      { red: 3 },
      { red: 2, locomotive: 1 },
      { blue: 2, locomotive: 1 },
    ]);
  });
});
