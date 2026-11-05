import { describe, expect, it } from 'vitest';
import { act, newGame, playingGame, reject } from './helpers.js';

describe('initial tickets', () => {
  it('requires keeping at least 2 of the offered tickets', () => {
    const game = newGame(3);
    const offered = game.state.players[1]!.offeredTickets;
    expect(reject(game, 1, { type: 'keepInitialTickets', ticketIds: [offered[0]!] })).toMatch(/at least 2/);
    act(game, 1, { type: 'keepInitialTickets', ticketIds: offered.slice(0, 2) });
    expect(game.state.players[1]!.tickets).toEqual(offered.slice(0, 2));
    expect(game.state.phase).toBe('initialTickets');
  });

  it('starts play when the last player keeps tickets, and returns regular tickets to the deck bottom', () => {
    const game = newGame(2, { expansions: { longTickets: false } });
    const deckBefore = game.state.regularTickets.length;
    const offered0 = game.state.players[0]!.offeredTickets;
    act(game, 0, { type: 'keepInitialTickets', ticketIds: offered0.slice(0, 2) });
    expect(game.state.regularTickets.at(-1)).toBe(offered0[2]);
    expect(game.state.regularTickets).toHaveLength(deckBefore + 1);
    const events = act(game, 1, { type: 'keepInitialTickets', ticketIds: [...game.state.players[1]!.offeredTickets] });
    expect(game.state.phase).toBe('playing');
    expect(events.at(-1)).toEqual({ type: 'turnStarted', player: game.state.currentPlayer });
  });

  it('rejects tickets that were not offered, duplicates, and a second choice', () => {
    const game = newGame(2);
    const offered = game.state.players[0]!.offeredTickets;
    const notOffered = game.state.regularTickets[0]!;
    expect(reject(game, 0, { type: 'keepInitialTickets', ticketIds: [offered[0]!, notOffered] })).toMatch(/offered/);
    expect(reject(game, 0, { type: 'keepInitialTickets', ticketIds: [offered[0]!, offered[0]!] })).toMatch(/twice/);
    act(game, 0, { type: 'keepInitialTickets', ticketIds: [...offered] });
    expect(reject(game, 0, { type: 'keepInitialTickets', ticketIds: [...offered] })).toMatch(/already/);
  });

  it('rejects turn actions before everyone kept tickets', () => {
    const game = newGame(2);
    expect(reject(game, game.state.currentPlayer, { type: 'drawBlind' })).toMatch(/not started/);
  });
});

describe('drawing tickets', () => {
  it('offers 3, rejects keeping none, and returns the rest to the bottom', () => {
    const game = playingGame(3);
    const top3 = game.state.regularTickets.slice(0, 3);
    act(game, 0, { type: 'drawTickets' });
    expect(game.state.players[0]!.offeredTickets).toEqual(top3);
    expect(game.state.turn.kind).toBe('choosingTickets');
    expect(reject(game, 0, { type: 'keepTickets', ticketIds: [] })).toMatch(/at least 1/);
    expect(reject(game, 0, { type: 'drawBlind' })).toMatch(/tickets/);
    const kept = game.state.players[0]!.tickets.length;
    act(game, 0, { type: 'keepTickets', ticketIds: [top3[1]!] });
    expect(game.state.players[0]!.tickets).toHaveLength(kept + 1);
    expect(game.state.regularTickets.slice(-2)).toEqual([top3[0], top3[2]]);
    expect(game.state.currentPlayer).toBe(1);
  });

  it('offers only what is left when the deck has 2 tickets', () => {
    const game = playingGame(3);
    game.state.regularTickets = game.state.regularTickets.slice(0, 2);
    act(game, 0, { type: 'drawTickets' });
    expect(game.state.players[0]!.offeredTickets).toHaveLength(2);
  });

  it('rejects drawing from an empty ticket deck', () => {
    const game = playingGame(3);
    game.state.regularTickets = [];
    expect(reject(game, 0, { type: 'drawTickets' })).toMatch(/empty/);
  });
});
