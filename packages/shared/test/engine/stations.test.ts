import { describe, expect, it } from 'vitest';
import { viewFor } from '../../src/index.js';
import { act, playingGame, reject, setHand } from './helpers.js';

describe('stations', () => {
  it('costs 1 card, then 2 of one color, without using trains', () => {
    const game = playingGame(2);
    setHand(game, 0, { red: 1, blue: 1, locomotive: 1 });
    act(game, 0, { type: 'buildStation', cityId: 'echo', payment: { red: 1 }, borrowRouteId: 'delta-echo' });
    expect(game.state.stations).toEqual([{ player: 0, cityId: 'echo', borrowRouteId: 'delta-echo' }]);
    expect(game.state.players[0]!.stationsLeft).toBe(2);
    expect(game.state.players[0]!.trains).toBe(45);
    game.state.currentPlayer = 0;
    expect(reject(game, 0, { type: 'buildStation', cityId: 'golf', payment: { blue: 1 }, borrowRouteId: 'golf-hotel' })).toMatch(/exactly 2/);
    act(game, 0, { type: 'buildStation', cityId: 'golf', payment: { blue: 1, locomotive: 1 }, borrowRouteId: 'golf-hotel' });
    expect(game.state.players[0]!.stationsLeft).toBe(1);
  });

  it('rejects a second station on the same city, by any player', () => {
    const game = playingGame(2);
    setHand(game, 0, { red: 1 });
    setHand(game, 1, { red: 1 });
    act(game, 0, { type: 'buildStation', cityId: 'echo', payment: { red: 1 }, borrowRouteId: 'delta-echo' });
    expect(reject(game, 1, { type: 'buildStation', cityId: 'echo', payment: { red: 1 }, borrowRouteId: 'echo-foxtrot' })).toMatch(/already has a station/);
  });

  it('rejects a fourth station', () => {
    const game = playingGame(2);
    game.state.players[0]!.stationsLeft = 0;
    setHand(game, 0, { red: 5 });
    expect(reject(game, 0, { type: 'buildStation', cityId: 'echo', payment: { red: 1 }, borrowRouteId: 'delta-echo' })).toMatch(/no stations left/);
  });

  it('requires the chosen route to touch the city and not belong to the builder', () => {
    const game = playingGame(2);
    setHand(game, 0, { red: 1 });
    expect(reject(game, 0, { type: 'buildStation', cityId: 'echo', payment: { red: 1 }, borrowRouteId: 'golf-hotel' })).toMatch(/touches this city/);
    game.state.routeOwners['delta-echo'] = 0;
    expect(reject(game, 0, { type: 'buildStation', cityId: 'echo', payment: { red: 1 }, borrowRouteId: 'delta-echo' })).toMatch(/do not own/);
  });

  it('is rejected when stations are off, and players show no stations', () => {
    const game = playingGame(2, { expansions: { stations: false } });
    setHand(game, 0, { red: 1 });
    expect(reject(game, 0, { type: 'buildStation', cityId: 'echo', payment: { red: 1 }, borrowRouteId: 'delta-echo' })).toMatch(/switched off/);
    const view = viewFor(game.state, 0);
    expect(view.players.every((p) => p.stationsLeft === 0)).toBe(true);
    expect(view.rules.expansions.stations).toBe(false);
  });
});
