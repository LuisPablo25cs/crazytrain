import { describe, expect, it } from 'vitest';
import { computeResults } from '../../src/index.js';
import { playingGame } from './helpers.js';

function own(game: ReturnType<typeof playingGame>, player: number, ...routeIds: string[]) {
  for (const id of routeIds) {
    game.state.routeOwners[id] = player;
    game.state.players[player]!.routePoints += 1;
  }
}

describe('computeResults', () => {
  it('adds completed tickets and subtracts failed ones', () => {
    const game = playingGame(2);
    own(game, 0, 'alpha-bravo-1', 'bravo-charlie');
    game.state.players[0]!.tickets = ['alpha-charlie', 'golf-hotel'];
    const alphaCharlie = game.map.tickets.get('alpha-charlie')!.points;
    const golfHotel = game.map.tickets.get('golf-hotel')!.points;
    const r = computeResults(game.state, game.map).players[0]!;
    expect(r.tickets).toEqual([
      { id: 'alpha-charlie', points: alphaCharlie, completed: true },
      { id: 'golf-hotel', points: golfHotel, completed: false },
    ]);
    expect(r.ticketPoints).toBe(alphaCharlie - golfHotel);
    expect(r.completedTickets).toBe(1);
  });

  it("Covers AE5. a station's chosen route counts for tickets but not for the longest trail", () => {
    const game = playingGame(2);
    own(game, 0, 'alpha-delta');
    own(game, 1, 'delta-echo');
    game.state.stations = [{ player: 0, cityId: 'delta', borrowRouteId: 'delta-echo' }];
    game.state.players[0]!.stationsLeft = 2;
    game.state.players[0]!.tickets = ['alpha-echo'];
    game.state.players[1]!.tickets = [];
    const results = computeResults(game.state, game.map);
    const r0 = results.players[0]!;
    expect(r0.tickets[0]!.completed).toBe(true);
    expect(r0.longestTrail).toBe(2);
    expect(results.players[1]!.longestTrail).toBe(3);
    expect(r0.longestTrailBonus).toBe(0);
    expect(results.players[1]!.longestTrailBonus).toBe(10);
  });

  it('gives no benefit when the chosen route is unclaimed or owned by the station owner', () => {
    const game = playingGame(2);
    own(game, 0, 'alpha-delta');
    game.state.stations = [{ player: 0, cityId: 'delta', borrowRouteId: 'delta-echo' }];
    game.state.players[0]!.tickets = ['alpha-echo'];
    expect(computeResults(game.state, game.map).players[0]!.tickets[0]!.completed).toBe(false);
  });

  it('gives the bonus to every player tied for the longest trail', () => {
    const game = playingGame(3);
    own(game, 0, 'alpha-bravo-1');
    own(game, 1, 'alpha-delta');
    own(game, 2, 'golf-hotel');
    const results = computeResults(game.state, game.map);
    expect(results.players.map((p) => p.longestTrailBonus)).toEqual([10, 10, 0]);
  });

  it('scores unbuilt stations at 4 each, or 0 when stations are off', () => {
    const on = playingGame(2);
    on.state.players[0]!.stationsLeft = 2;
    expect(computeResults(on.state, on.map).players[0]!.stationPoints).toBe(8);
    const off = playingGame(2, { expansions: { stations: false } });
    expect(computeResults(off.state, off.map).players[0]!.stationPoints).toBe(0);
  });

  it('breaks ties by completed tickets, then by longest trail', () => {
    const game = playingGame(3, { expansions: { stations: false } });
    game.state.players.forEach((p) => {
      p.tickets = [];
      p.routePoints = 0;
    });
    // Player 1 completes a 1-point ticket; player 0 has the same total from route points.
    own(game, 1, 'golf-hotel');
    game.state.players[1]!.routePoints = 0;
    game.state.players[1]!.tickets = ['golf-hotel'];
    game.state.players[0]!.routePoints = 1 + 10;
    game.state.players[2]!.routePoints = 0;
    const results = computeResults(game.state, game.map);
    const totals = results.players.map((p) => p.total);
    expect(totals[0]).toBe(11);
    expect(totals[1]).toBe(11);
    expect(results.ranking[0]).toBe(1);
    expect(results.winners).toEqual([1]);
  });

  it('totals match their parts', () => {
    const game = playingGame(2);
    own(game, 0, 'alpha-bravo-1', 'bravo-echo-1');
    game.state.players[0]!.tickets = ['alpha-echo'];
    for (const r of computeResults(game.state, game.map).players) {
      expect(r.total).toBe(r.routePoints + r.ticketPoints + r.stationPoints + r.longestTrailBonus);
    }
  });
});
