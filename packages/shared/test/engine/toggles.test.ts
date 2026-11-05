import { describe, expect, it } from 'vitest';
import { computeResults, EXPANSION_NAMES } from '../../src/index.js';
import { newGame } from './helpers.js';

const allOff = { expansions: { tunnels: false, ferries: false, stations: false, longTickets: false } };

describe('expansion toggles', () => {
  it('lists the four switchable rules', () => {
    expect(EXPANSION_NAMES).toEqual(['tunnels', 'ferries', 'stations', 'longTickets']);
  });

  it('turns the game into the base game when every rule is off', () => {
    const game = newGame(3, allOff);
    for (const p of game.state.players) {
      expect(p.offeredTickets).toHaveLength(3);
      expect(p.stationsLeft).toBe(0);
    }
    expect(computeResults(game.state, game.map).players.every((r) => r.stationPoints === 0)).toBe(true);
  });

  it('switches each rule independently', () => {
    const game = newGame(3, { expansions: { stations: false } });
    expect(game.state.rules.expansions).toEqual({ tunnels: true, ferries: true, stations: false, longTickets: true });
    expect(game.state.players[0]!.offeredTickets).toHaveLength(4);
  });
});
