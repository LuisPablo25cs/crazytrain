import { describe, expect, it } from 'vitest';
import { act, newGame, reject } from './helpers.js';

describe('long tickets', () => {
  it('offers 3 regular and 1 long ticket, and keeping only 1 is rejected', () => {
    const game = newGame(4);
    for (const p of game.state.players) {
      expect(p.offeredTickets).toHaveLength(4);
      const decks = p.offeredTickets.map((id) => game.map.tickets.get(id)!.deck);
      expect(decks.filter((d) => d === 'long')).toHaveLength(1);
    }
    const offered = game.state.players[0]!.offeredTickets;
    expect(reject(game, 0, { type: 'keepInitialTickets', ticketIds: [offered[3]!] })).toMatch(/at least 2/);
  });

  it('removes returned and undealt long tickets from the game', () => {
    const game = newGame(2);
    const allIds = new Set<string>();
    const longIds = new Set(game.map.map.tickets.filter((t) => t.deck === 'long').map((t) => t.id));
    game.state.players.forEach((p, i) => {
      act(game, i, { type: 'keepInitialTickets', ticketIds: p.offeredTickets.filter((id) => !longIds.has(id)) });
    });
    for (const id of game.state.regularTickets) allIds.add(id);
    for (const p of game.state.players) for (const id of p.tickets) allIds.add(id);
    expect([...allIds].some((id) => longIds.has(id))).toBe(false);
    expect(game.state.regularTickets.length + game.state.players.reduce((n, p) => n + p.tickets.length, 0)).toBe(21);
  });

  it('deals only regular tickets when long tickets are off', () => {
    const game = newGame(4, { expansions: { longTickets: false } });
    for (const p of game.state.players) {
      expect(p.offeredTickets).toHaveLength(3);
      expect(p.offeredTickets.every((id) => game.map.tickets.get(id)!.deck === 'regular')).toBe(true);
    }
  });
});
