import { describe, expect, it } from 'vitest';
import { createGame, GameSetupError, handSize, resolveRules } from '../../src/index.js';
import { tinyIndex } from '../helpers.js';
import { newGame, NAMES } from './helpers.js';

describe('createGame', () => {
  it('deals 4 cards, 3 regular tickets, 45 trains and a 5-card market with long tickets off', () => {
    const { state } = newGame(4, { expansions: { longTickets: false } });
    expect(state.players).toHaveLength(4);
    for (const p of state.players) {
      expect(handSize(p.hand)).toBe(4);
      expect(p.offeredTickets).toHaveLength(3);
      expect(p.trains).toBe(45);
      expect(p.stationsLeft).toBe(3);
    }
    expect(state.market.filter((c) => c !== null)).toHaveLength(5);
    expect(state.phase).toBe('initialTickets');
    // 110 cards: 16 in hands, 5 in the market, the rest in the pile or discard (after any market reset).
    const total = state.drawPile.length + state.discard.length + 5 + 16;
    expect(total).toBe(110);
  });

  it('rejects too few or too many players', () => {
    const map = tinyIndex();
    const rules = resolveRules();
    const players = (n: number) => NAMES.slice(0, n).map((name) => ({ name, color: 'red' }));
    expect(() => createGame({ map, rules, players: players(1), seed: 1 })).toThrow(GameSetupError);
    expect(() => createGame({ map, rules, players: [...players(7), { name: 'H', color: 'red' }], seed: 1 })).toThrow(GameSetupError);
  });

  it('is deterministic for a seed', () => {
    const a = newGame(3, undefined, { seed: 7 }).state;
    const b = newGame(3, undefined, { seed: 7 }).state;
    const c = newGame(3, undefined, { seed: 8 }).state;
    expect(a).toEqual(b);
    expect(a.drawPile).not.toEqual(c.drawPile);
  });
});
