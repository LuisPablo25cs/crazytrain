import { describe, expect, it } from 'vitest';
import { act, playingGame, reject, setHand } from './helpers.js';

describe('ferries', () => {
  it('accepts 1 locomotive plus 2 green on a length-3 ferry needing 1 locomotive', () => {
    const game = playingGame(3);
    setHand(game, 0, { green: 3, locomotive: 1 });
    act(game, 0, { type: 'claimRoute', routeId: 'foxtrot-hotel', payment: { green: 2, locomotive: 1 } });
    expect(game.state.routeOwners['foxtrot-hotel']).toBe(0);
  });

  it('rejects a ferry payment without the required locomotive', () => {
    const game = playingGame(3);
    setHand(game, 0, { green: 3 });
    expect(reject(game, 0, { type: 'claimRoute', routeId: 'foxtrot-hotel', payment: { green: 3 } })).toMatch(/ferry needs at least 1/);
  });

  it('Covers AE6. needs no locomotive when ferries are switched off', () => {
    const game = playingGame(3, { expansions: { ferries: false } });
    setHand(game, 0, { green: 3 });
    act(game, 0, { type: 'claimRoute', routeId: 'foxtrot-hotel', payment: { green: 3 } });
    expect(game.state.routeOwners['foxtrot-hotel']).toBe(0);
  });
});
