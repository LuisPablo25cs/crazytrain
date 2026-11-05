import { describe, expect, it } from 'vitest';
import { act, newGame, playingGame, reject, setHand, stackDeck } from './helpers.js';

describe('turn order and the last round', () => {
  it('rejects an action from a player whose turn it is not, without changing state', () => {
    const game = playingGame(3);
    expect(reject(game, 1, { type: 'drawBlind' })).toMatch(/not your turn/);
  });

  it('gives every player exactly one more turn after someone drops to 2 trains', () => {
    const game = playingGame(3);
    game.state.players[0]!.trains = 4;
    setHand(game, 0, { red: 2 });
    const events = act(game, 0, { type: 'claimRoute', routeId: 'alpha-bravo-1', payment: { red: 2 } });
    expect(events).toContainEqual({ type: 'lastRoundStarted', player: 0 });
    expect(game.state.lastRound).toEqual({ triggeredBy: 0, turnsLeft: 3 });
    for (const player of [1, 2, 0]) {
      expect(game.state.phase).toBe('playing');
      expect(game.state.currentPlayer).toBe(player);
      stackDeck(game, ['white', 'white']);
      act(game, player, { type: 'drawBlind' });
      act(game, player, { type: 'drawBlind' });
    }
    expect(game.state.phase).toBe('finished');
    expect(game.state.results).not.toBeNull();
  });

  it('rejects any action after the game is over', () => {
    const game = playingGame(2);
    game.state.phase = 'finished';
    expect(reject(game, 0, { type: 'drawBlind' })).toMatch(/over/);
  });
});

describe('pass', () => {
  it('is rejected while another action is legal', () => {
    const game = playingGame(2);
    expect(reject(game, 0, { type: 'pass' })).toMatch(/still/);
  });

  it('is allowed when nothing else is legal, and a full round of passes ends the game', () => {
    const game = playingGame(2, { expansions: { stations: false } });
    game.state.drawPile = [];
    game.state.discard = [];
    game.state.market = [null, null, null, null, null];
    game.state.regularTickets = [];
    setHand(game, 0, {});
    setHand(game, 1, {});
    act(game, 0, { type: 'pass' });
    expect(game.state.currentPlayer).toBe(1);
    const events = act(game, 1, { type: 'pass' });
    expect(game.state.phase).toBe('finished');
    expect(events.some((e) => e.type === 'gameFinished')).toBe(true);
  });
});

describe('host skip', () => {
  it('keeps all offered tickets for a player still choosing initial tickets', () => {
    const game = newGame(2);
    const offered = [...game.state.players[1]!.offeredTickets];
    act(game, 0, { type: 'keepInitialTickets', ticketIds: [...game.state.players[0]!.offeredTickets] });
    act(game, 1, { type: 'skip' });
    expect(game.state.players[1]!.tickets).toEqual(offered);
    expect(game.state.phase).toBe('playing');
  });

  it('ends the turn of a player waiting to act', () => {
    const game = playingGame(3);
    const events = act(game, 0, { type: 'skip' });
    expect(events[0]).toEqual({ type: 'skipped', player: 0 });
    expect(game.state.currentPlayer).toBe(1);
  });

  it('ends the turn with one card after the first draw', () => {
    const game = playingGame(3);
    setHand(game, 0, {});
    stackDeck(game, ['red']);
    act(game, 0, { type: 'drawBlind' });
    act(game, 0, { type: 'skip' });
    expect(game.state.players[0]!.hand.red).toBe(1);
    expect(game.state.currentPlayer).toBe(1);
  });

  it('keeps all drawn tickets when the player was choosing', () => {
    const game = playingGame(3);
    const kept = game.state.players[0]!.tickets.length;
    act(game, 0, { type: 'drawTickets' });
    act(game, 0, { type: 'skip' });
    expect(game.state.players[0]!.tickets).toHaveLength(kept + 3);
  });

  it('withdraws a pending tunnel and returns the cards', () => {
    const game = playingGame(3);
    setHand(game, 0, { white: 4 });
    stackDeck(game, ['white', 'red', 'red']);
    act(game, 0, { type: 'claimRoute', routeId: 'charlie-foxtrot', payment: { white: 4 } });
    expect(game.state.turn.kind).toBe('tunnel');
    act(game, 0, { type: 'skip' });
    expect(game.state.players[0]!.hand.white).toBe(4);
    expect(game.state.routeOwners['charlie-foxtrot']).toBeUndefined();
    expect(game.state.currentPlayer).toBe(1);
  });

  it('is rejected for a player whose turn it is not', () => {
    const game = playingGame(3);
    expect(reject(game, 2, { type: 'skip' })).toMatch(/not that player/);
  });
});
