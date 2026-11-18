import { describe, expect, it } from 'vitest';
import { act, newGame, reject } from './helpers.js';

describe('triple (long) tickets', () => {
  it('shuffles triples into the one ticket deck and deals 4 tickets from it', () => {
    const game = newGame(4);
    const longIds = new Set(game.map.map.tickets.filter((t) => t.deck === 'long').map((t) => t.id));
    const inPlay = [...game.state.regularTickets, ...game.state.players.flatMap((p) => p.offeredTickets)];
    // Every triple is somewhere in the deck or in a hand being dealt; none is set aside.
    expect([...longIds].every((id) => inPlay.includes(id))).toBe(true);
    for (const p of game.state.players) expect(p.offeredTickets).toHaveLength(4);
    const offered = game.state.players[0]!.offeredTickets;
    expect(reject(game, 0, { type: 'keepInitialTickets', ticketIds: [offered[3]!] })).toMatch(/at least 2/);
  });

  it('deals triples at random: some seeds give none, some give two', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const game = newGame(2, {}, { seed });
      for (const p of game.state.players) {
        counts.add(p.offeredTickets.filter((id) => game.map.tickets.get(id)!.deck === 'long').length);
      }
    }
    expect(counts.has(0)).toBe(true);
    expect([...counts].some((n) => n >= 2)).toBe(true);
  });

  it('puts returned triples back under the deck, like any ticket', () => {
    const game = newGame(2);
    const total = game.map.map.tickets.length;
    game.state.players.forEach((p, i) => {
      act(game, i, { type: 'keepInitialTickets', ticketIds: p.offeredTickets.slice(0, 2) });
    });
    const kept = game.state.players.reduce((n, p) => n + p.tickets.length, 0);
    expect(game.state.regularTickets.length + kept).toBe(total);
  });

  it('leaves triples out entirely when they are switched off', () => {
    const game = newGame(4, { expansions: { longTickets: false } });
    const all = [...game.state.regularTickets, ...game.state.players.flatMap((p) => p.offeredTickets)];
    expect(all.every((id) => game.map.tickets.get(id)!.deck === 'regular')).toBe(true);
    for (const p of game.state.players) expect(p.offeredTickets).toHaveLength(3);
  });
});
